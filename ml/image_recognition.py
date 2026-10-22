#!/usr/bin/env python3
"""
MindLens — Image Recognition (inference)
==========================================
This is the INFERENCE counterpart to train_video_model_TEMPLATE.py
(named "video" there because it's fit on FER2013 frame labels, but the
scoring itself is per-image — a single selfie/frame in, one score out).

train_video_model_TEMPLATE.py fits a 7-category-expression -> risk-score
mapping and exports it to ml/export/video_model.json. In the browser,
script.js gets those 7 expression probabilities from face-api.js
(analyzeSingleImage()) and applies this same mapping client-side.

This script gives you the same scoring logic in Python, standalone, so
image recognition can run as a separate step in the ml/ pipeline — e.g.
batch-scoring a folder of collected photos, validating a model before
shipping video_model.json to the frontend, or feeding results into
another process (server.py, a notebook, a review queue, etc.) without
touching the browser/face-api.js at all.

Getting the 7-way expression vector (angry, disgust, fear, happy, sad,
surprise, neutral) for a Python-side image is the one piece this script
can't fully own — the app's face detector (face-api.js) is JS-only. Two
ways to feed this script real numbers:

  1. (Recommended, no extra heavy deps) Precompute expressions elsewhere
     — e.g. run face-api.js in Node, or any FER2013-style classifier —
     and pass them in as a JSON file:
       {"my_photo.jpg": {"angry":0.02,"disgust":0.01,"fear":0.03,
                          "happy":0.71,"sad":0.05,"surprise":0.10,
                          "neutral":0.08}, ...}
     via --expressions-json, keyed by filename (basename) or full path.

  2. (Optional, heavier) If the `fer` package is installed
     (pip install fer opencv-python-headless — pulls in TensorFlow/MTCNN,
     so treat this as an opt-in extra, not a default requirement), this
     script will run it directly on each image and use its output, which
     already comes back in the same 7 FER2013 categories used by
     video_model.json.

Usage:
  # Score a single image (auto-detects expressions via `fer` if installed)
  python ml/image_recognition.py --input path/to/photo.jpg

  # Batch-score a folder
  python ml/image_recognition.py --input path/to/folder --output results.json

  # Score using precomputed expression probabilities instead of `fer`
  python ml/image_recognition.py --input path/to/folder \\
      --expressions-json precomputed_expressions.json

Same disclaimer as the training template: this scores posed/in-the-wild
facial expression, not a clinical measure of depression or any other
condition.
"""

import argparse
import glob
import json
import os

import numpy as np  # type: ignore[import]

try:
    from fer import FER as _FerDetector  # type: ignore[import]
    _HAS_FER = True
except Exception:
    _HAS_FER = False


DEFAULT_MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'export', 'video_model.json')

IMAGE_EXTS = ('*.jpg', '*.jpeg', '*.png', '*.JPG', '*.JPEG', '*.PNG')

# Same bands/thresholds as bandFor() in script.js, so a batch run here
# lines up with what the app would show for the same photo.
BANDS = [
    (25, 'Minimal'),
    (45, 'Mild'),
    (65, 'Moderate'),
    (float('inf'), 'Elevated'),
]

_fer_instance = None


def parse_args():
    p = argparse.ArgumentParser(description='Run the trained image (facial-expression) risk-classifier over one photo or a folder of photos')
    p.add_argument('--input', required=True, help='A single image file, or a directory of images')
    p.add_argument('--model', default=DEFAULT_MODEL_PATH, help='Path to video_model.json (default: ml/export/video_model.json)')
    p.add_argument('--expressions-json', default=None, help='Optional precomputed {file: {category: prob}} JSON, used instead of the `fer` package')
    p.add_argument('--output', default=None, help='Optional path to write results as JSON')
    return p.parse_args()


def load_model(model_path):
    if not os.path.exists(model_path):
        raise FileNotFoundError(
            f"No trained model at {model_path}. Run train_video_model_TEMPLATE.py first "
            "(needs FER2013 or similar — see ml/DATASETS.md)."
        )
    with open(model_path) as fh:
        model = json.load(fh)
    required = {'categories', 'weights', 'bias'}
    missing = required - set(model)
    if missing:
        raise ValueError(f"{model_path} is missing expected keys: {missing}")
    return model


def detect_expressions_with_fer(path):
    global _fer_instance
    if _fer_instance is None:
        _fer_instance = _FerDetector(mtcnn=True)
    results = _fer_instance.detect_emotions(path if isinstance(path, str) else str(path))
    if not results:
        raise ValueError('No face detected')
    # Largest/first detected face, same "one face per photo" assumption
    # analyzeSingleImage() makes in script.js.
    return dict(results[0]['emotions'])


def band_for(score):
    for threshold, label in BANDS:
        if score < threshold:
            return label
    return BANDS[-1][1]


def score_expressions(expr_probs, model):
    """expr_probs: dict of {category: probability}. Ordered/scored
    against the model's own categories/weights/bias."""
    categories = model['categories']
    x = np.array([expr_probs.get(cat, 0.0) for cat in categories], dtype=float)
    weights = np.array(model['weights'], dtype=float)
    bias = float(model['bias'])

    logit = float(np.dot(weights, x) + bias)
    prob = 1.0 / (1.0 + np.exp(-logit))
    score = round(prob * 100, 1)
    return score, band_for(score)


def recognize_file(path, model, precomputed):
    if precomputed is not None:
        key = path if path in precomputed else os.path.basename(path)
        if key not in precomputed:
            raise ValueError(f"No precomputed expressions entry for {path} (looked for '{path}' and '{os.path.basename(path)}')")
        expressions = precomputed[key]
    elif _HAS_FER:
        expressions = detect_expressions_with_fer(path)
    else:
        raise RuntimeError(
            "No expression source available: install the `fer` package "
            "(pip install fer opencv-python-headless --break-system-packages) "
            "or pass --expressions-json with precomputed values."
        )

    score, band = score_expressions(expressions, model)
    return {
        'file': path,
        'expressions': expressions,
        'score': score,
        'band': band,
    }


def collect_input_files(input_path):
    if os.path.isdir(input_path):
        files = []
        for ext in IMAGE_EXTS:
            files += glob.glob(os.path.join(input_path, '**', ext), recursive=True)
        return sorted(set(files))
    return [input_path]


def main():
    args = parse_args()
    model = load_model(args.model)
    files = collect_input_files(args.input)

    if not files:
        print(f"No images found at {args.input}")
        return

    precomputed = None
    if args.expressions_json:
        with open(args.expressions_json) as fh:
            precomputed = json.load(fh)
    elif not _HAS_FER:
        print(
            "Note: `fer` is not installed and no --expressions-json was given — "
            "recognition will fail per-file below unless you install `fer` "
            "(pip install fer opencv-python-headless --break-system-packages) "
            "or supply precomputed expressions.\n"
        )

    results = []
    for f in files:
        try:
            result = recognize_file(f, model, precomputed)
        except Exception as e:
            result = {'file': f, 'error': str(e)}
        results.append(result)
        if 'error' in result:
            print(f"{f}: ERROR — {result['error']}")
        else:
            print(f"{f}: score={result['score']}  band={result['band']}")

    if args.output:
        with open(args.output, 'w') as fh:
            json.dump(results, fh, indent=2)
        print(f"\nWrote {len(results)} result(s) to {args.output}")


if __name__ == '__main__':
    main()
