"""
MindLens — Audio risk-classifier TEMPLATE
==========================================
This build environment's network access is limited to package registries
(pypi/npm/github) — it cannot reach Kaggle, Zenodo, or the other hosts
that speech-emotion corpora (RAVDESS, CREMA-D, DAIC-WOZ) are distributed
from, and the files are large (RAVDESS alone is ~25GB). So this script is
a ready-to-run TEMPLATE for you to execute on your own machine once
you've downloaded a dataset — it will produce a text_model.json-style
export that script.js's audio path can be pointed at.

Recommended datasets (check each one's license/ethics terms before use):
  - RAVDESS (CC BY-NC-SA): https://zenodo.org/record/1188976
  - CREMA-D (research use): https://github.com/CheyneyComputerScience/CREMA-D
  - For anything depression-specific (e.g. DAIC-WOZ), you must request
    access and go through the dataset's own ethics/consent process —
    do NOT substitute a general emotion corpus and call it "depression
    data"; be explicit in your report that acted emotional speech is a
    proxy, not a clinical measure.

Indian-speech options (better accent/language match for Indian users —
see ml/DATASETS.md for the full list, sizes and access notes):
  - IITKGP-SEHSC (Hindi, 8 emotions incl. sarcastic) — request from IIT KGP
  - BhavVani (Hindi, ~13 hrs, from "Sarabhai vs Sarabhai") — arXiv:2406.08931
  - Indian EmoSpeech Command Dataset — arXiv:1910.13801
  - Indian Emotional Speech Corpus (HF, CC-BY-4.0, small):
    https://huggingface.co/datasets/indian_emotional_speech_corpus
  These labelled Indian sets are small; the strongest results usually come
  from cross-corpus training (RAVDESS/CREMA-D + one of the above), not an
  Indian corpus alone. Most don't share RAVDESS's filename-encoded labels,
  so label_from_filename() below will need per-dataset rewriting to read
  each corpus's own metadata/CSV instead.

Setup:
  pip install librosa scikit-learn pandas numpy --break-system-packages

Usage:
  1. Point AUDIO_DIR at a folder of .wav files.
  2. Fill in `label_from_filename()` for your dataset's naming scheme
     (RAVDESS encodes emotion in the filename; CREMA-D too).
  3. Run: python train_audio_model_TEMPLATE.py
  4. Copy the resulting audio_model.json next to script.js, and swap
     the buildAudioNet() TF.js network for a fetch()+dot-product scorer
     exactly like ensureTrainedTextModel()/trainedModelRiskScore() do
     for text (same pattern, 3 input features instead of a bag-of-words
     vector: [lowEnergy, monotony, silenceRatio], or better, expand to
     real acoustic features via librosa: pitch/F0 stats, jitter, shimmer,
     pause count, speech rate — the eGeMAPS feature set is a good,
     well-validated starting point).
"""

import os
import glob
import json
import numpy as np
import librosa  # type: ignore[import]
from sklearn.linear_model import LogisticRegression  # type: ignore[import]
from sklearn.model_selection import train_test_split  # type: ignore[import]
from sklearn.metrics import accuracy_score, roc_auc_score  # type: ignore[import]

import argparse


def parse_args():
    p = argparse.ArgumentParser(description='Train audio risk classifier (template)')
    p.add_argument('--input-dir', default='./audio_dataset',
                    help='Directory with .wav files, OR a comma-separated list of directories '
                         'to combine multiple corpora into one cross-corpus training run '
                         '(e.g. "./ravdess_wav,./crema_d_wav,./bhavvani_wav"). Cross-corpus '
                         'training is the recommended approach per ml/DATASETS.md — it '
                         'generalizes better than any single corpus alone.')
    p.add_argument('--labels-csv', default=None,
                    help='Optional CSV with columns "file,emotion" for datasets that ship a '
                         'separate metadata file instead of encoding the label in the filename '
                         '(most non-RAVDESS/CREMA-D corpora work this way — see ml/DATASETS.md). '
                         'Paths in "file" are matched by basename against files found under '
                         '--input-dir. Falls back to label_from_filename() for any file not in '
                         'this CSV, so you can mix a CSV-labelled corpus with a filename-labelled one.')
    p.add_argument('--export', default='../export/audio_model.json', help='Export JSON path')
    return p.parse_args()


args = parse_args()
AUDIO_DIRS = [d.strip() for d in args.input_dir.split(",") if d.strip()]
LABELS_CSV = args.labels_csv
EXPORT_PATH = args.export

# HIGH_RISK / LOW_RISK grouping — same "distressed vs positive affect"
# framing as the text model, NOT a depression label.
HIGH_RISK_EMOTIONS = {"sad", "fearful", "angry", "disgust"}
LOW_RISK_EMOTIONS = {"happy", "calm", "neutral"}

def load_labels_csv(path):
    """Reads a 'file,emotion' CSV and returns a {basename: emotion} lookup.
    Used for corpora (most non-RAVDESS/CREMA-D ones) that ship labels in a
    separate metadata file rather than encoding them in the filename."""
    if not path or not os.path.exists(path):
        return {}
    import csv
    lookup = {}
    with open(path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            fname = os.path.basename(row["file"].strip())
            lookup[fname] = row["emotion"].strip().lower()
    return lookup

def label_for(path, csv_lookup):
    """CSV metadata takes priority (when present); falls back to filename
    parsing otherwise, so a CSV-labelled corpus and a filename-labelled one
    can be combined in the same --input-dir run."""
    csv_label = csv_lookup.get(os.path.basename(path))
    if csv_label:
        return csv_label
    return label_from_filename(path)

def label_from_filename(path):
    """RAVDESS-style: 03-01-06-01-02-01-12.wav, 3rd field = emotion code.
    01=neutral 02=calm 03=happy 04=sad 05=angry 06=fearful 07=disgust 08=surprised
    Edit this mapping for whichever dataset you actually downloaded."""
    code_map = {"01":"neutral","02":"calm","03":"happy","04":"sad",
                "05":"angry","06":"fearful","07":"disgust","08":"surprised"}
    parts = os.path.basename(path).split("-")
    if len(parts) < 3:
        return None
    return code_map.get(parts[2])

def extract_features(path):
    y, sr = librosa.load(path, sr=None)
    rms = float(np.mean(librosa.feature.rms(y=y)))
    zcr = float(np.mean(librosa.feature.zero_crossing_rate(y=y)))
    # crude pause ratio: fraction of frames below an energy threshold
    frame_rms = librosa.feature.rms(y=y)[0]
    silence_ratio = float(np.mean(frame_rms < (0.02 * np.max(frame_rms) + 1e-9)))
    # spectral shape — brighter/harsher voices (anger, fear) tend to have
    # higher centroid/rolloff than flat/low-energy speech (sadness)
    spectral_centroid = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))
    spectral_rolloff = float(np.mean(librosa.feature.spectral_rolloff(y=y, sr=sr)))
    # pitch variability + jitter/shimmer-style measures via librosa.pyin —
    # much more meaningful than raw ZCR as a monotony/distress proxy, and
    # part of the standard eGeMAPS feature family referenced in the module
    # docstring above
    try:
        f0, voiced_flag, _ = librosa.pyin(y, fmin=float(librosa.note_to_hz('C2')), fmax=float(librosa.note_to_hz('C7')))
        f0_voiced = f0[~np.isnan(f0)]
        pitch_std = float(np.std(f0_voiced)) if len(f0_voiced) > 5 else 0.0
        pitch_mean = float(np.mean(f0_voiced)) if len(f0_voiced) > 5 else 0.0
        # jitter proxy: average absolute frame-to-frame pitch change,
        # normalized by mean pitch — captures voice tremor/instability
        jitter = float(np.mean(np.abs(np.diff(f0_voiced))) / (pitch_mean + 1e-9)) if len(f0_voiced) > 5 else 0.0
        # speech-rate proxy: fraction of frames that are voiced (speaking)
        # vs silent/unvoiced — low-energy, sparse speech (common in
        # depressive-affect speech literature) shows up as a lower rate
        voiced_flag = voiced_flag.astype(float) if voiced_flag is not None else np.array([])
        speech_rate = float(np.mean(voiced_flag)) if len(voiced_flag) > 0 else 0.0
    except Exception:
        pitch_std = pitch_mean = jitter = speech_rate = 0.0
    # shimmer proxy: average absolute frame-to-frame RMS (amplitude) change,
    # normalized by mean RMS — the amplitude-domain counterpart to jitter
    shimmer = float(np.mean(np.abs(np.diff(frame_rms))) / (np.mean(frame_rms) + 1e-9))
    return [rms, zcr, silence_ratio, pitch_std, spectral_centroid,
            spectral_rolloff, jitter, shimmer, speech_rate]

def main():
    csv_lookup = load_labels_csv(LABELS_CSV)
    if LABELS_CSV:
        print(f"Loaded {len(csv_lookup)} labels from {LABELS_CSV}")

    files = []
    for d in AUDIO_DIRS:
        found = glob.glob(os.path.join(d, "**", "*.wav"), recursive=True)
        print(f"Found {len(found)} audio files under {d}")
        files.extend(found)
    print(f"Total across {len(AUDIO_DIRS)} corpus dir(s): {len(files)}")
    if not files:
        print("No files found — point --input-dir at your downloaded dataset(s) and re-run.")
        return

    X, y = [], []
    skipped = 0
    for f in files:
        emo = label_for(f, csv_lookup)
        if emo not in (HIGH_RISK_EMOTIONS | LOW_RISK_EMOTIONS):
            skipped += 1
            continue
        X.append(extract_features(f))
        y.append(1 if emo in HIGH_RISK_EMOTIONS else 0)

    X, y = np.array(X), np.array(y)
    print(f"Usable labelled samples: {len(X)} (skipped {skipped} unlabelled/unmapped files)")
    if len(X) < 10:
        print("Too few samples to train meaningfully — check label_from_filename()/--labels-csv.")
        return

    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    # Standardize features so weights are comparable/exportable
    mean, std = Xtr.mean(axis=0), Xtr.std(axis=0) + 1e-9
    Xtr_n, Xte_n = (Xtr - mean) / std, (Xte - mean) / std

    clf = LogisticRegression(max_iter=1000, class_weight="balanced")
    clf.fit(Xtr_n, ytr)
    pred = clf.predict(Xte_n)
    proba = clf.predict_proba(Xte_n)[:, 1]
    print(f"Test accuracy: {accuracy_score(yte, pred):.3f}")
    print(f"Test ROC-AUC:  {roc_auc_score(yte, proba):.3f}")

    export = {
        "feature_names": ["rms", "zcr", "silence_ratio", "pitch_std", "spectral_centroid",
                           "spectral_rolloff", "jitter", "shimmer", "speech_rate"],
        "mean": mean.tolist(), "std": std.tolist(),
        "weights": clf.coef_[0].tolist(), "bias": float(clf.intercept_[0]),
        "metrics": {"accuracy": round(accuracy_score(yte, pred), 4),
                    "roc_auc": round(roc_auc_score(yte, proba), 4), "n": len(X)},
        "corpora": AUDIO_DIRS,
        "note": "Trained on acted emotional speech (proxy for affect, not a clinical depression measure).",
    }
    os.makedirs(os.path.dirname(EXPORT_PATH), exist_ok=True)
    with open(EXPORT_PATH, "w") as fh:
        json.dump(export, fh)
    print(f"Exported: {EXPORT_PATH}")

if __name__ == "__main__":
    main()
