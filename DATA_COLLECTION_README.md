# Data collection — MindLens (consented samples)

Purpose
- Short demo page (`collect.html`) to capture consented audio, video and a selfie, plus minimal metadata. By default, files are downloaded locally and remain on the participant's device. Optionally, they can instead (or also) be stored in a MongoDB database via a small Flask backend — see "Server-side storage (optional)" below.

Important ethical notes
- Only collect data from participants who have given informed consent. Use the consent checkbox on the page as a lightweight record, but keep a separate consent form if required by your institution.
- Avoid collecting or storing any direct identifiers unless you have explicit permission. Use pseudonymous IDs (e.g., `P001`).
- Securely transfer and store recorded files following your institutional review board (IRB) / data protection rules. Do not attach identifying metadata to open datasets.
- Be mindful when recording minors — follow local regulations and obtain parental/guardian consent where necessary.
- If you enable server-side storage, that MongoDB instance now holds consented participant data — treat it with the same care as any other research data store (access control, encryption at rest if required by your IRB, a retention/deletion policy, etc.). This is on you to configure; MindLens doesn't provision or secure a database for you.

How to use (quick)
1. Open `collect.html` in a modern browser (Chrome, Edge, Firefox). For camera/microphone access prefer `https` or run from a local file where permissions are allowed.
2. Fill the metadata fields (or leave PID blank for pseudonym). Check the consent box.
3. Use the audio/video controls to record. Capture a selfie if desired.
4. Click `Prepare & download all` and save the files to a secure folder — this always works, with zero backend. If a MindLens server with a connected database is reachable, an `Upload to server` button also appears; click it to additionally (or instead) store the sample in MongoDB.

Server-side storage (optional)
- What it is: `db.py` (project root) is a small storage layer over MongoDB, using GridFS for the audio/photo files and a `samples` collection for everything else (pid/age/gender/consent/text/timestamps/file references). `server.py` exposes it as `POST /api/collect` (save one sample) and `GET /api/collect` (list stored samples, no file bytes). Exactly like the existing text-classifier endpoint, this fails soft — if MongoDB isn't installed/running/reachable, the button on `collect.html` simply stays hidden and nothing changes about the default local-download flow.
- Set it up:
  1. Have a MongoDB instance reachable — the easiest options are a local install (`mongod`) or a free MongoDB Atlas cluster.
  2. `pip install -r requirements-server.txt` (this now includes `pymongo`).
  3. Optionally set `MONGODB_URI` (default `mongodb://localhost:27017/`) and `MONGODB_DB` (default `mindlens`) as environment variables if you're not using the defaults.
  4. Run `python server.py` (or F5 in VS Code) and open `collect.html` through that server (e.g. `http://localhost:5000/collect.html`) rather than as a bare local file, so the same-origin `fetch("/api/collect")` calls reach it.
- Getting the data back out for training: `python ml/export_from_mongo.py --output /path/to/collected` writes every stored sample to disk using the exact same filenames `collect.html`'s local download already produces (`{pid}-audio.webm`, `{pid}-selfie-{expression}.png`, `{pid}-metadata.json`, `{pid}-text.txt`). That means `ml/convert_webm.py`, `ml/augment.py`, `ml/pipeline.py`, and the `train_*_model_TEMPLATE.py` scripts all keep working completely unchanged — the database is just another way samples land in that same folder, alongside anything downloaded locally and copied over by hand.
- Sanity-checking what's stored: `GET /api/collect?limit=20` (e.g. `curl http://localhost:5000/api/collect`) returns the most recent sample summaries (metadata only, no file bytes) as JSON. `GET /api/health` reports whether a database is currently connected.

Filenames and metadata
- Files are named `{PID || participant}-{type}.{ext}`, e.g. `P001-audio.webm`. Selfies are now captured **per expression**: `P001-selfie-neutral.png`, `P001-selfie-happy.png`, `P001-selfie-sad.png`, `P001-selfie-angry.png`, `P001-selfie-surprise.png`, `P001-selfie-fear.png`, `P001-selfie-disgust.png` — one card per expression on the page, recapture any of them before downloading. Metadata file contains age, gender, PID, `expressionsCaptured` (list of which ones were captured), and timestamp.

Suggested follow-up processing (for training)
- For audio: convert `webm` to `wav` (16-bit, 16kHz or 22.05kHz) using `ffmpeg` before feature extraction. Example:

```bash
ffmpeg -i P001-audio.webm -ar 22050 -ac 1 P001-audio.wav
```

- For video: extract frames or crop face regions using a face detector (dlib/face-api/OpenCV). Store only the derived features if possible. The per-expression selfies from `collect.html` already carry their label in the filename (`{pid}-selfie-{expression}.png`), so no manual relabeling is needed — just crop/detect the face in each and run it through face-api.js (or py-feat) to get the 7-way probability vector `train_video_model_TEMPLATE.py` expects, the same way you would for InFER/iSAFE/ISED/IFExD images.

Augmentation suggestions
- Audio: pitch shifting, time-stretching, noise augmentation — but keep a balanced strategy to avoid introducing demographic biases.
- Video: horizontal flips, small brightness/contrast jitter, slight cropping. Always preserve label balance.

Next steps I can implement
- A small CLI script to convert and batch-process downloaded files into a training folder structure.
- An augmentation script (Python) to synthesize extra audio via conservative transforms.
- Wiring these into the `ml/train_*_model_TEMPLATE.py` scripts so you can retrain and export model JSONs.

What I added in this repo
- `ml/augment.py`: a simple augmentation CLI that applies conservative transforms to audio and images. It is intended for experimental augmentation only. Use with care.
- `ml/requirements.txt`: python requirements to run the augmentation script.

Quick example
```bash
python -m pip install -r ml/requirements.txt
python ml/augment.py --input /path/to/collected --output /path/to/augmented --type both --nper 3
```

Next recommended step
- After augmentation, run the preprocessing (format conversions) and then retrain using the training templates. I can wire the train scripts to accept the processed dataset next.

Adding Indian speech/face datasets
- Your own `collect.html` recordings will always be the best-matched data, but they're small. `ml/DATASETS.md` now covers all three modalities: Indian & code-mixed text-emotion corpora (Hinglish tweet/comment datasets, IndicSentiment, etc.), Indian speech-emotion corpora (IITKGP-SEHSC, BhavVani, Indian EmoSpeech Command Dataset, an HF-hosted Indian Emotional Speech Corpus), and Indian facial-expression datasets (InFER/InFER++, iSAFE, ISED, IFExD) — plus larger general-purpose corpora (GoEmotions, IEMOCAP, MELD, AffectNet, RAF-DB, DFEW, etc.) for extra volume beyond what's already wired in. Most emotion-labelled Indian sets are small and gated behind a EULA or author-request rather than an instant download — budget time for that, and plan to combine them with the existing corpora (cross-corpus training) rather than replacing those outright. The training templates (`ml/train_text_model.py`, `ml/train_audio_model_TEMPLATE.py`, `ml/train_video_model_TEMPLATE.py`) reference these in their docstrings too.

Training templates (examples)
After preparing your dataset (wav files and images/frames), run the templates like:

```bash
# Audio template: trains and exports JSON model consumable by the web app
python ml/train_audio_model_TEMPLATE.py --input-dir /path/to/wav_dataset --export /path/to/mindlens_v2/export/audio_model.json

# Video template (FER2013 example): trains mapping from expression probs -> risk
python ml/train_video_model_TEMPLATE.py --fer-csv /path/to/fer2013.csv --export /path/to/mindlens_v2/export/video_model.json

# Text template: uses the provided corpus CSVs under ml/data by default,
# or point to another directory with similar CSVs
python ml/train_text_model.py --data-dir /path/to/text_data --export-dir /path/to/mindlens_v2/ml/export
```

Note: these templates expect preprocessed, labelled data. The audio template expects `.wav` files; use `ffmpeg` to convert `webm` files recorded from `collect.html` to `.wav` before training.

⚠️ **Don't copy `ml/generate_synthetic_samples.py`'s output into `ml/export/`.** That script exists purely to smoke-test the pipeline — it writes short constant-volume sine tones, not speech, so a model "trained" on it has near-zero variance in its features. `script.js` will still load such a file at runtime (it now rejects obviously-degenerate models — near-zero feature std or fewer than ~50 training samples — but don't rely on that guard; just don't ship test output as the real model).

Batch conversion helper
We added `ml/convert_webm.py` to convert recorded `.webm` (or `.mp4`) files into `.wav` and optionally extract frames per-video using `ffmpeg`.

Example usage:
```bash
# convert audio only
python ml/convert_webm.py --input /path/to/collected --audio-out /path/to/wav_output --sr 22050

# convert and extract one frame per second into subfolders per video
python ml/convert_webm.py --input /path/to/collected --audio-out /path/to/wav_output --frames-out /path/to/frames --fps 1
```

Ensure `ffmpeg` is installed and on your PATH (`ffmpeg -version`).

End-to-end pipeline
-------------------
Use `ml/pipeline.py` to run conversion, augmentation, and (optionally) training in one command. Example:

```bash
python ml/pipeline.py --collected /path/to/collected --work /path/to/workdir --augment-n 3 --train-audio --export-dir /path/to/mindlens_v2/export
```

This will:
- convert recorded `.webm`/`.mp4` files under `--collected` into WAVs and frames under `--work`;
- create conservative augmentations in `--work`;
- run the audio training template and export `audio_model.json` into `--export-dir`.

Run `python ml/pipeline.py --help` for more options.
