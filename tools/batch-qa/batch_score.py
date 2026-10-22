#!/usr/bin/env python3
"""
Batch face-detection + expression risk scoring over a test folder from
the person_XX identity dataset, using:
  - fer (MTCNN-off / OpenCV cascade backend) for face detection + the
    7-way FER2013 expression vector
  - the EXACT heuristic scoring formula MindLens uses in script.js's
    stopVideoSampling() (since no trained ml/export/video_model.json
    exists yet -- that's the app's own real fallback path, not a
    simplification made for this test)
  - OpenCV Laplacian-variance blur + face-size checks, mirroring the
    quality gates in the V10-V12 camera pipeline
"""
import glob, json, os, sys, time
import cv2  # type: ignore[import]
import numpy as np  # type: ignore[import]
from fer.fer import FER  # type: ignore[import]

INPUT_DIR = sys.argv[1] if len(sys.argv) > 1 else "archive_1/dataset/person_69"
OUT_JSON = sys.argv[2] if len(sys.argv) > 2 else "batch_run/person_69_results.json"

BLUR_THRESHOLD = 80.0       # Laplacian variance below this = blurry (same ballpark as script.js gate)
MIN_FACE_FRACTION = 0.02    # face bbox area / image area below this = face too small/far

# DNN face detector (much more reliable than fer's default Haar-cascade
# backend -- MTCNN wasn't usable here due to a broken torch install, so
# this is the closest robust stand-in to face-api.js's tiny_face_detector)
_net = cv2.dnn.readNetFromCaffe(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models', 'deploy.prototxt'),
    os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models', 'res10_300x300_ssd_iter_140000_fp16.caffemodel'),
)

def detect_face_dnn(img, conf_threshold=0.5):
    h, w = img.shape[:2]
    blob = cv2.dnn.blobFromImage(cv2.resize(img, (300, 300)), 1.0, (300, 300), (104.0, 177.0, 123.0))
    _net.setInput(blob)
    detections = _net.forward()
    best = None
    best_conf = 0
    for i in range(detections.shape[2]):
        conf = float(detections[0, 0, i, 2])
        if conf > conf_threshold and conf > best_conf:
            x1 = int(detections[0, 0, i, 3] * w)
            y1 = int(detections[0, 0, i, 4] * h)
            x2 = int(detections[0, 0, i, 5] * w)
            y2 = int(detections[0, 0, i, 6] * h)
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)
            best = (x1, y1, x2 - x1, y2 - y1)
            best_conf = conf
    return best, best_conf

BANDS = [(25, 'Minimal'), (45, 'Mild'), (65, 'Moderate'), (float('inf'), 'Elevated')]

def band_for(score):
    for t, label in BANDS:
        if score < t:
            return label
    return BANDS[-1][1]

def heuristic_score(exp):
    # exact port of script.js stopVideoSampling()
    negative = exp.get('sad',0)*0.8 + exp.get('angry',0)*0.6 + exp.get('fear',0)*0.6 + exp.get('disgust',0)*0.6
    positive = exp.get('happy',0)*0.9 + exp.get('surprise',0)*0.2
    raw = 50 + (negative - positive) * 55
    return max(0, min(100, round(raw)))

def blur_score(path):
    img = cv2.imread(path)
    if img is None:
        return None, None
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    lap_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    h, w = gray.shape[:2]
    return lap_var, (w, h)

def main():
    files = sorted(glob.glob(os.path.join(INPUT_DIR, "*")))
    files = [f for f in files if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    print(f"Found {len(files)} images in {INPUT_DIR}")

    det = FER(mtcnn=False)

    results = []
    t_start = time.time()
    for i, f in enumerate(files):
        entry = {"file": os.path.basename(f)}
        lap_var, dims = blur_score(f)
        entry["blur_variance"] = round(lap_var, 1) if lap_var is not None else None
        entry["image_dims"] = dims

        img = cv2.imread(f)
        if img is None:
            entry["error"] = "unreadable_image"
            results.append(entry)
            continue

        box, conf = detect_face_dnn(img)
        if box is None:
            entry["error"] = "no_face_detected"
            results.append(entry)
            continue

        entry["face_box"] = list(box)
        entry["detection_confidence"] = round(conf, 3)
        if dims:
            face_area = box[2] * box[3]
            img_area = dims[0] * dims[1]
            entry["face_area_fraction"] = round(face_area / img_area, 4)

        # run FER's emotion classifier directly against the DNN-detected
        # box (bypasses fer's own weaker internal Haar-cascade detector,
        # which was missing faces in tight crops)
        try:
            faces = det.detect_emotions(img, face_rectangles=[list(box)])
        except Exception as e:
            entry["error"] = f"emotion_classify_failed: {e}"
            results.append(entry)
            continue

        if not faces:
            entry["error"] = "emotion_classify_no_face_in_crop"
            results.append(entry)
            continue

        expr = {k: float(v) for k, v in faces[0]['emotions'].items()}
        entry["expressions"] = expr
        score = heuristic_score(expr)
        entry["score"] = score
        entry["band"] = band_for(score)

        # quality flags mirroring the app's gating logic
        flags = []
        if lap_var is not None and lap_var < BLUR_THRESHOLD:
            flags.append("blurry")
        if entry.get("face_area_fraction", 1) < MIN_FACE_FRACTION:
            flags.append("face_too_small")
        entry["quality_flags"] = flags

        results.append(entry)
        if (i+1) % 10 == 0:
            print(f"  {i+1}/{len(files)} processed...")

    elapsed = time.time() - t_start
    print(f"Done in {elapsed:.1f}s")

    def _default(o):
        if isinstance(o, (np.integer,)):
            return int(o)
        if isinstance(o, (np.floating,)):
            return float(o)
        if isinstance(o, np.ndarray):
            return o.tolist()
        raise TypeError(f"Object of type {o.__class__.__name__} is not JSON serializable")

    with open(OUT_JSON, "w") as fh:
        json.dump(results, fh, indent=2, default=_default)
    print(f"Wrote {len(results)} results to {OUT_JSON}")

if __name__ == "__main__":
    main()
