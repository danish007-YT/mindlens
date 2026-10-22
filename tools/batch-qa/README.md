# MindLens Batch QA — Face Detection + Expression Scoring

Batch-scores a folder of images using:
- OpenCV DNN face detector (`models/`) — reliable face detection
- `fer` (FER2013-format 7-way expression classifier)
- The same heuristic scoring formula MindLens's `script.js` uses in
  `stopVideoSampling()` (sad/angry/fear/disgust weighted negative,
  happy/surprise weighted positive, baseline 50)

See `mindlens_batch_qa_report.md` for the write-up of the last run
(50 images from `person_69`), and `person_69_results.json` for the raw
per-image output.

## Setup

```bash
pip install -r requirements.txt --break-system-packages
```

`setuptools<81` is needed because newer setuptools dropped `pkg_resources`,
which `fer` still imports.

## Usage

```bash
python batch_score.py <path/to/image/folder> <output.json>
```

Example:

```bash
python batch_score.py /path/to/dataset/person_5 results/person_5.json
```

Then regenerate the summary stats:

```bash
python summarize.py
```
(edit the hardcoded path at the top of `summarize.py` if scoring a
different folder than `person_69`)

## Notes

- `fer`'s own built-in face detector (Haar cascade) missed ~1/3 of
  clearly frontal faces in testing — that's why this script detects
  faces with the bundled OpenCV DNN model first, then feeds that box
  straight into `fer`'s emotion classifier via `face_rectangles=`,
  skipping its internal detector entirely.
- MTCNN wasn't usable in the original sandbox run (a disk-space error
  corrupted the `torch` install) — if you have `facenet-pytorch` +
  `torch` working locally, that's a solid alternative to try in
  `detect_face_dnn()`.
- No trained `ml/export/video_model.json` exists yet, so scores come
  from the same heuristic fallback the live app uses today, not a
  fitted model.
