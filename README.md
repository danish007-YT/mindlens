# MindLens — Multimodal Depression Risk Screener

A browser-based, front-end prototype that takes **text, audio, and video** input and
reflects back a machine-learning-assisted, early-warning **depression risk indicator**.
Grounded in Indian mental-health helpline resources, with a warm visual identity
(saffron–indigo–marigold palette).

> ⚠️ **This is an academic/demo prototype, not a medical device.** It does not diagnose
> depression. It surfaces surface-level linguistic, acoustic, and facial-expression
> patterns as a _conversation starter_ toward professional support — never a replacement
> for one.

---

## How to run this in VS Code

The project already includes a `.vscode/` folder (launch config + recommended
extensions), so opening the folder in VS Code sets most of this up automatically.

### 1. Open the project

- **File → Open Folder…** and select the extracted `mindlens/` folder.
- When prompted, click **Install** on the recommended extensions
  (Python, Live Server). You only need to do this once.

### 2. Option A — quick preview, no Python (static mode)

Good for just viewing the UI; text scoring runs entirely in the browser
using `text_model.data.js`.

- Right-click `index.html` in the Explorer → **Open with Live Server**
  (or install the "Live Server" extension first if it isn't there).
- It opens at `http://127.0.0.1:5500` and auto-reloads on save.
- Alternatively, from a VS Code terminal: `python -m http.server 8000`,
  then open `http://localhost:8000`.

### 3. Option B — with the Python backend (recommended)

This runs the trained classifier server-side too (see the previous section).

- Open a terminal in VS Code: **Terminal → New Terminal**.
- Create and activate a virtual environment:
  ```bash
  python -m venv .venv
  # macOS/Linux:
  source .venv/bin/activate
  # Windows (PowerShell):
  .venv\Scripts\Activate.ps1
  ```
- Install dependencies:
  ```bash
  pip install -r requirements-server.txt
  ```
- Run it — either press **F5** (uses the included `.vscode/launch.json`
  config, "MindLens: Run server.py (Flask)"), or from the terminal:
  ```bash
  python server.py
  ```
- Open **http://localhost:5000** in your browser. `script.js` detects the
  running server automatically and routes text check-ins through it.
- Stop the server with `Ctrl+C` in the terminal, or the Stop button if you
  used F5.

If VS Code asks you to select a Python interpreter, pick the one inside
`.venv` (it'll be suggested first once the venv exists).

### 4. Shortcuts: Tasks and other debug configs

- **Terminal → Run Task…** exposes `Setup: create venv + install deps` (does
  step 3's venv+pip install in one go), `Run: Flask backend (server.py)`,
  `Run: static file server (no backend)`, and `Train: text model`.
- The **Run and Debug** panel (`Ctrl+Shift+D` / `Cmd+Shift+D`) also lists
  debug configs for `ml/train_text_model.py`,
  `ml/train_audio_model_TEMPLATE.py`, and `ml/train_video_model_TEMPLATE.py`
  — useful for stepping through a training run with breakpoints once
  you've got a dataset in place (see `ml/DATASETS.md`).
- `.gitignore` is set up to keep `.venv/`, `__pycache__/`, and OS junk files
  out of any repo you push from here.

## Copyright

MindLens — © Bhuvanidharan V. See the footer credit in the running app and
file headers in `script.js` / `server.py` / `index.html`.

## What's new: optional Python backend + self-care suggestions

- **`server.py`** — an optional Flask backend. It serves `index.html` and
  friends directly (`python server.py`, then open `http://localhost:5000`)
  and adds a `POST /api/analyze-text` endpoint that runs the _same_ trained
  bag-of-words classifier server-side in Python/NumPy instead of in the
  browser. `script.js` checks `/api/health` on load; if the server answers,
  text check-ins are scored there (less client CPU/battery work, and the
  ~120KB `text_model.data.js` payload isn't needed). If the server isn't
  running — static hosting, GitHub Pages, offline PWA use — everything
  falls back to the existing in-browser scoring automatically, so nothing
  regresses. Install with `pip install -r requirements-server.txt`.
- **Optional MongoDB storage for `collect.html`.** The researcher-only
  data-collection page can now optionally upload consented samples
  (audio/selfies/text/metadata) straight into a MongoDB database via
  `db.py` + `POST /api/collect`, instead of only downloading them locally.
  Same fail-soft philosophy as above: with no MongoDB configured, the
  "Upload to server" button just doesn't appear, and the existing local
  download flow is completely unaffected. See
  `DATA_COLLECTION_README.md` → "Server-side storage (optional)" for setup,
  and `ml/export_from_mongo.py` for pulling stored samples back out into
  the same folder layout the existing training pipeline already expects.
- **Suggested next steps.** The dashboard now shows 1–2 gentle, practical
  suggestions matched to the current risk band (e.g. "go for a walk" for
  Minimal/Mild, more direct encouragement to reach out to someone for
  Moderate/Elevated). These sit alongside, never in place of, the crisis
  banner and helpline resources further down the page — see
  `RECOMMENDATIONS` in `script.js` to edit the wording.

## What's new: installable + deployable (this upgrade)

- **PWA support** — `manifest.json` makes MindLens installable
  (Add to Home Screen / desktop install) and let the app shell load offline after
  the first visit. See `icons/` for the generated app icons.
- **Fixed a bug** in the crisis banner where the `tel:` links didn't match the
  phone numbers displayed (now correctly point to KIRAN / Vandrevala / iCall).
- **`DEPLOY.md`** — step-by-step instructions to put this live on GitHub Pages
  or Netlify for free, in a few minutes.

## What's new: model + language upgrade (latest pass)

- **Voice — real pitch tracking.** The audio modality used to estimate "tonal
  variation" from a crude zero-crossing-rate count. It now runs a real
  time-domain autocorrelation pitch (F0) tracker (`estimatePitchHz` in
  `script.js`) over the recording and scores _pitch variability in semitones_
  — a normalised measure that isn't skewed by someone's natural vocal
  register, and that lines up with what the speech-biomarker literature
  actually measures. Falls back to the old zero-crossing proxy only if too
  few voiced frames were captured (e.g. a very noisy room).
- **Face — expressivity/flat-affect signal.** The video modality used to
  score only the _average_ facial expression over the sampling window. It
  now also computes the _variance_ of a per-frame valence estimate — reduced
  facial expressivity ("flat affect") over time is itself a commonly-cited
  correlate of low mood, independent of which single expression dominates.
  Low-confidence face detections (bad angle/lighting) are now filtered out
  before either measure is computed.
- **Text — re-tuned, then given more real data.** `ml/train_text_model.py`
  searches a small grid of regularisation strengths by 5-fold cross-validation
  and uses a wider vocabulary (unigrams–trigrams, 6,000 terms). It was first
  re-tuned on the original ~37,500 examples (76.2% → 77.2% accuracy), then
  GoEmotions (~24,500 more usable rows) was added on top, taking the combined
  training set to **~61,900 real labelled examples** and held-out performance
  to **~78.7% accuracy / 0.861 ROC-AUC** — see the note on datasets below.
- **Tamil language pack.** All static UI text (nav, hero, the three check-in
  cards, dashboard, resources, footer, crisis banner) is now available in
  Tamil via a language toggle in the header (`i18n.js`), remembered across
  visits. The analysis _verdict_ text produced after each check-in is still
  English-only in this pass — see "Extending this" below.

### On "adding more datasets"

GoEmotions is now wired in. The official CSVs are hosted on Google Cloud
Storage, which this build's sandboxed network can't reach — but the
`monologg/GoEmotions-pytorch` GitHub repo mirrors the same train/dev/test
splits as plain TSV (`raw.githubusercontent.com` _is_ reachable), so that's
the source `ml/data/goemotions.csv` was built from: ~45,400 single-label
rows across all three splits, mapped onto the same "distressed vs.
positive-affect" framing as the other two corpora (`load_goemotions()` in
`ml/train_text_model.py`; ambiguous categories like `neutral`, `confusion`,
`curiosity` are excluded, same as CrowdFlower's `neutral`/`boredom`/`empty`).

Combined training data grew from ~37,500 to **~61,900 real labelled
examples**, and held-out performance moved from ~77.2% accuracy / 0.846
ROC-AUC to **~78.7% accuracy / 0.861 ROC-AUC** — see `ml/export/text_model.json`
-> `metrics`, or re-run `python ml/train_text_model.py` yourself.

Audio and video are a different story: RAVDESS, CREMA-D, and FER2013 are
large (multi-GB) and hosted on Kaggle/Zenodo, which aren't reachable from
here either as data or as a lightweight GitHub mirror, so their scoring
still runs on the literature-calibrated heuristic described above rather
than a data-trained classifier. `ml/train_audio_model_TEMPLATE.py` and
`ml/train_video_model_TEMPLATE.py` are ready to run on your own machine
the moment you have such a dataset locally — see the "Extending this"
notes in each script.

---

## How it works

| Modality  | Technique                                                                                                                                                                                                                                                      | What it looks at                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Text**  | Deep-learning sentence embeddings (TensorFlow.js Universal Sentence Encoder) _ensembled with_ a real bag-of-words logistic-regression classifier trained in Python on ~61,900 labelled public examples (see below), plus a separate crisis-phrase safety check | Semantic + lexical closeness of the written text to distressed vs. positive-affect language                                      |
| **Audio** | Web Audio API `AnalyserNode` feature extraction, scored by a small feedforward neural network (TensorFlow.js) calibrated against published effect sizes from speech-biomarker research                                                                         | Average energy (RMS), zero-crossing rate (a proxy for pitch variation / monotony), and silence ratio (pause patterns)            |
| **Video** | [`face-api.js`](https://github.com/justadudewhohacks/face-api.js) — deep convolutional neural networks (TinyFaceDetector + Face Expression Net) — combined via valence-anchored weights from affective-computing research                                      | Sampled facial-expression probabilities (sad, angry, fearful, disgusted, neutral vs. happy, surprised) averaged over ~12 seconds |

Each modality outputs an independent 0–100 risk score. The dashboard combines whichever
modalities the user completed into one averaged score, shown on a radial **halo gauge**,
with the individual modality scores shown as bars underneath.

### What changed in this version (v2)

The **text model's offline fallback** used to be a small hand-written keyword list.
It's now a real classifier, trained in Python (`ml/train_text_model.py`) on two public,
freely-licensed corpora pooled together (~37,500 examples total):

- **CrowdFlower "Sentiment Analysis in Text"** (~30k tweets, 13 emotion labels, Public Domain)
- **ISEAR** (~7.5k self-reported emotional-situation narratives, 7 emotion labels, academic corpus)

Held-out test performance: **~77% accuracy, 0.85 ROC-AUC** on a binary
"distressed-language vs. positive-affect-language" task (see `ml/export/text_model.json` ->
`metrics`, or re-run the script yourself — the datasets are bundled in `ml/data/`). When the
online sentence-embedding model _and_ this trained classifier are both available, the app
blends their scores; when offline, it uses the trained classifier instead of keyword-counting.

**Audio and video were recalibrated, not retrained**, and that distinction matters — see
`ml/train_audio_model_TEMPLATE.py` and `ml/train_video_model_TEMPLATE.py`. RAVDESS,
CREMA-D, and FER2013 (the standard datasets for these modalities) are hosted on Kaggle/
Zenodo and are multi-GB, so they weren't reachable or practical from this build
environment. Their scoring weights were instead recalibrated to match effect sizes and
valence estimates reported in peer-reviewed speech-biomarker and affective-computing
research (cited in code comments), which is a real improvement over arbitrary numbers but
is **not the same as training on labelled audio/video data**. The two template scripts are
ready to run on your own machine the moment you have such a dataset locally — they export
to the same JSON format the text model uses, so swapping them in is a small change to
`script.js`.

If crisis language is detected in the text box, or the combined score is high, a
persistent banner surfaces free, confidential Indian helplines (KIRAN, Vandrevala
Foundation, iCall, AASRA).

**Everything runs client-side.** No text, audio, or video is uploaded anywhere — the
mic/camera streams and ML models run in-browser and are discarded when the session ends.

## Files

```
mindlens/
├── index.html            # page structure: hero, three assessment cards, dashboard, resources
├── style.css             # design tokens + layout (saffron/indigo/marigold, Baloo 2 + Mukta type)
├── script.js             # ML/DL scoring: sentence embeddings + trained classifier, audio NN, face-api video, gauge rendering
├── i18n.js               # English/Tamil UI language pack + toggle
├── text_model.data.js    # the trained text classifier's weights, as a plain JS global (no build step needed)
├── README.md
└── ml/                   # training pipeline — how text_model.data.js was produced, and how to extend audio/video
    ├── train_text_model.py            # trains the real text classifier on the three datasets below
    ├── data/
    │   ├── text_emotion_crowdflower.csv   # ~30k labelled tweets (Public Domain)
    │   ├── isear.csv                      # ~7.6k labelled emotion narratives (academic corpus)
    │   └── goemotions.csv                 # ~45.4k labelled Reddit comments (Apache-2.0)
    ├── export/text_model.json         # raw training output (source for text_model.data.js)
    ├── train_audio_model_TEMPLATE.py  # ready to run once you have a real speech-emotion dataset locally
    └── train_video_model_TEMPLATE.py  # ready to run once you have a real facial-expression dataset locally
└── tools/
    └── batch-qa/              # offline batch QA: runs the Face & Eyes heuristic scoring
        ├── batch_score.py     # scores a folder of images with an OpenCV DNN face detector + FER
        ├── summarize.py       # aggregates a batch run into summary stats
        ├── mindlens_batch_qa_report.md   # write-up of the last QA run (50 images, person_69)
        ├── person_69_results.json        # raw per-image output from that run
        └── models/            # bundled OpenCV DNN face-detector weights (Caffe)
```

See `tools/batch-qa/README.md` for setup and usage — it's a standalone script for
validating the video/face scoring heuristic against a batch of labelled images,
independent of the browser app.

No build step is required. For local use, serve the project folder over localhost
(for example, run `.\.venv\Scripts\python.exe -m http.server 8000` from the project
folder, then open `http://localhost:8000`). Serving over localhost allows browsers to
fetch the bundled face-analysis models and enables camera/microphone access. An internet
connection is needed to fetch TensorFlow.js, the Universal Sentence Encoder, and
face-api.js from CDN. The face-analysis model weights themselves are bundled in `models/`.
If a model cannot load, text and voice check-ins remain available.

## Extending this for a real submission

This prototype pairs transparent heuristics with lightweight ML/DL models so the logic
stays inspectable and explainable — a good foundation for a college/university project
report. Natural next steps if you want to go further:

- ✅ _Partly done_: the text fallback is now trained on ~37,500 real labelled examples
  (see above). A stronger next step is fine-tuning a small transformer (e.g. DistilBERT)
  on a labelled **mental-health-specific** corpus rather than general emotion/sentiment
  data — cite your dataset and get ethics sign-off, since this is sensitive personal data.
- Audio and video still use literature-calibrated formulas, not trained classifiers —
  run `ml/train_audio_model_TEMPLATE.py` / `ml/train_video_model_TEMPLATE.py` against
  RAVDESS/CREMA-D and FER2013 (or a proper depression-labelled corpus with ethics
  approval) to close this gap; see the "What changed in this version" section above.
- Add a short PHQ‑9 questionnaire as a fourth, clinically-validated modality to anchor
  the other three.
- Add informed consent and data-handling documentation before any real deployment —
  mental-health inference is highly sensitive and should never be shipped without
  clinical and ethical review.

## Disclaimer

MindLens does not store, transmit, or log any personal data by default, and makes no
clinical claims. If you or someone you know is struggling, please reach out:

- **KIRAN (Govt. of India)** — 1800‑599‑0019 (24/7, 13 languages)
- **Vandrevala Foundation** — 1860‑2662‑345 (24/7)
- **iCall (TISS)** — 9152987821 (Mon–Sat, 10am–8pm)
- **AASRA** — 9820466726 (24/7)
