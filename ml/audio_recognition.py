#!/usr/bin/env python3
"""
MindLens — Audio Recognition (inference)
=========================================
This is the INFERENCE counterpart to train_audio_model_TEMPLATE.py.

train_audio_model_TEMPLATE.py fits a model and exports it to
ml/export/audio_model.json. script.js then re-implements the scoring
side of that model in the browser (see ensureTrainedAudioModel() /
buildAudioNet()) so recordings can be scored client-side.

This script gives you the same scoring logic in Python, standalone, so
you can run recognition as a separate step in the ml/ pipeline — e.g.
batch-scoring a folder of recordings, spot-checking a model before
shipping audio_model.json to the frontend, or feeding results into
another process (a notebook, a report, server.py, a queue, etc.)
without going through the browser at all.

Feature extraction here is intentionally identical to
train_audio_model_TEMPLATE.py's extract_features() (rms, zcr,
silence_ratio, pitch_std) so a model trained there scores consistently
here. If you change one, change the other.

Setup:
  pip install librosa soundfile numpy --break-system-packages

Usage:
  # Score a single file
  python ml/audio_recognition.py --input path/to/clip.wav

  # Batch-score a folder, writing results to JSON
  python ml/audio_recognition.py --input path/to/folder --output results.json

Output: for each file, a risk score (0-100, higher = more distress-
associated acoustic pattern) plus the same band labels used in the
app's dashboard (Minimal / Mild / Moderate / Elevated).

Same disclaimer as the training template: this is a proxy for acted/
observed vocal affect, not a clinical measure of depression or any
other condition.
"""

import argparse
import glob
import json
import os

import numpy as np  # type: ignore[import]
import librosa  # type: ignore[import]


DEFAULT_MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'export', 'audio_model.json')

# Same bands/thresholds as bandFor() in script.js, so a batch run here
# lines up with what the app would show for the same recording.
BANDS = [
    (25, 'Minimal'),
    (45, 'Mild'),
    (65, 'Moderate'),
    (float('inf'), 'Elevated'),
]


def parse_args():
    p = argparse.ArgumentParser(description='Run the trained audio risk-classifier over one file or a folder of recordings')
    p.add_argument('--input', required=True, help='A single .wav file, or a directory of .wav files')
    p.add_argument('--model', default=DEFAULT_MODEL_PATH, help='Path to audio_model.json (default: ml/export/audio_model.json)')
    p.add_argument('--output', default=None, help='Optional path to write results as JSON')
    return p.parse_args()


def load_model(model_path):
    if not os.path.exists(model_path):
        raise FileNotFoundError(
            f"No trained model at {model_path}. Run train_audio_model_TEMPLATE.py first "
            "(see ml/DATASETS.md for where to get labelled speech data)."
        )
    with open(model_path) as fh:
        model = json.load(fh)
    required = {'feature_names', 'mean', 'std', 'weights', 'bias'}
    missing = required - set(model)
    if missing:
        raise ValueError(f"{model_path} is missing expected keys: {missing}")
    return model


def extract_features(path):
    """Identical to train_audio_model_TEMPLATE.py's extract_features() —
    keep these two in sync if either changes."""
    y, sr = librosa.load(path, sr=None)
    rms = float(np.mean(librosa.feature.rms(y=y)))
    zcr = float(np.mean(librosa.feature.zero_crossing_rate(y=y)))
    frame_rms = librosa.feature.rms(y=y)[0]
    silence_ratio = float(np.mean(frame_rms < (0.02 * np.max(frame_rms) + 1e-9)))
    try:
        f0, voiced_flag, _ = librosa.pyin(y, fmin=float(librosa.note_to_hz('C2')), fmax=float(librosa.note_to_hz('C7')))
        f0_voiced = f0[~np.isnan(f0)]
        pitch_std = float(np.std(f0_voiced)) if len(f0_voiced) > 5 else 0.0
    except Exception:
        pitch_std = 0.0
    return {'rms': rms, 'zcr': zcr, 'silence_ratio': silence_ratio, 'pitch_std': pitch_std}


def band_for(score):
    for threshold, label in BANDS:
        if score < threshold:
            return label
    return BANDS[-1][1]


def score_features(feature_map, model):
    """feature_map: dict of {name: value}. Ordered/standardized/scored
    against the model's own feature_names/mean/std/weights."""
    x = np.array([feature_map[name] for name in model['feature_names']], dtype=float)
    mean = np.array(model['mean'], dtype=float)
    std = np.array(model['std'], dtype=float)
    weights = np.array(model['weights'], dtype=float)
    bias = float(model['bias'])

    z = (x - mean) / std
    logit = float(np.dot(weights, z) + bias)
    prob = 1.0 / (1.0 + np.exp(-logit))
    score = round(prob * 100, 1)
    return score, band_for(score)


def recognize_file(path, model):
    features = extract_features(path)
    score, band = score_features(features, model)
    return {
        'file': path,
        'features': features,
        'score': score,
        'band': band,
    }


def collect_input_files(input_path):
    if os.path.isdir(input_path):
        files = []
        for ext in ('*.wav', '*.WAV'):
            files += glob.glob(os.path.join(input_path, '**', ext), recursive=True)
        return sorted(set(files))
    return [input_path]


def main():
    args = parse_args()
    model = load_model(args.model)
    files = collect_input_files(args.input)

    if not files:
        print(f"No .wav files found at {args.input}")
        return

    results = []
    for f in files:
        try:
            result = recognize_file(f, model)
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
