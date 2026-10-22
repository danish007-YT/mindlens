# MindLens Image-Recognition Pipeline — Batch QA Report

**Dataset:** `archive_1/dataset/person_69` (identity-labelled face dataset, 50 images)
**Pipeline:** OpenCV DNN face detector (ResNet-SSD) → FER (FER2013-format 7-way expression classifier) → MindLens's live `script.js` heuristic scoring formula

## Why this dataset, and what it can/can't validate

`archive_1` is organized by **identity** (`person_0`...`person_103`), not by emotion — there are no
happy/sad/angry labels. So it can't be used to retrain your expression→risk model. What it's good for is a
**QA stress-test**: running face detection + scoring across real, varied, uncontrolled photos to check
detection reliability and score sanity, at a scale you don't get from your own selfies.

## Detection results

- **50/50 images scored (100%)**
- **4 flagged** for quality issues (blur) — still scored, but would trigger a retake prompt in the app

A first pass using `fer`'s default Haar-cascade detector only found faces in 68% of images — including
clear, frontal, well-lit faces it should never have missed. Swapping in OpenCV's DNN face detector (much
closer in quality to face-api.js's `tiny_face_detector` that the app actually uses in-browser) brought
that to **100%**. This is a useful finding on its own: if you ever add a Python-side detection fallback,
avoid `fer`'s default Haar backend — it under-detects.

*(Note: I couldn't test the MTCNN backend — its `facenet-pytorch`/`torch` dependency got corrupted by a
disk-space error during install and there wasn't room left to fix it. The DNN detector above is a solid
stand-in, but face-api.js in the actual browser app may still perform somewhat differently.)*

## Score distribution

- Range: 0–81, mean 48.8, median 53

| Band | Count | % |
|---|---|---|
| Minimal | 8 | 16% |
| Mild | 2 | 4% |
| Moderate | 29 | 58% |
| Elevated | 11 | 22% |

Scores spread across the full range and correlate sensibly with visible expression on spot-check
(lowest score = clearly smiling face → 0; highest score = downcast/sad expression → 81), which is a good
sign the scoring formula itself is behaving as designed.

**Caveat:** because `ml/export/video_model.json` hasn't been trained yet, these scores come from the
*heuristic fallback* in `script.js` (literature-anchored expression weights), not a data-fitted model.
That's genuinely the same code path your deployed app uses today when no trained model is present — so
this is an accurate read of current app behavior, just not a validated clinical measure.

## Quality flags

| File | Flags | Blur variance | Face area % |
|---|---|---|---|
| img_0.jpg | blurry | 15.6 | 48.0% |
| img_1.jpg | blurry | 35.9 | 24.7% |
| img_14.jpg | blurry | 61.0 | 34.8% |
| img_44.jpg | blurry | 58.9 | 37.1% |

## Files

- `person_69_results.json` — full per-image results (box, confidence, expressions, score, band, quality flags)

## Suggested next steps

1. If you want this validated further, I can run it across more folders (or the whole ~5,900-image set) —
   now that detection is fixed, it's fast (~50 images in under 3s).
2. Swap your Python-side face detector to a DNN-based one (like this) if you ever add a server-side
   fallback path — Haar cascades are meaningfully worse than what your browser pipeline uses.
3. Training `ml/export/video_model.json` on real FER2013 data (per your own `DATASETS.md`/template) would
   let scores come from a fitted model instead of the hand-set heuristic weights.