# Datasets for MindLens (text, audio, video)

RAVDESS/CREMA-D/FER2013/ISEAR/CrowdFlower (already referenced in the
training templates) are all Western/English-first corpora. This file adds
two things on top of them: (1) Indian-specific text/speech/face datasets
for accent, language, and expression-norm match, and (2) additional
general-purpose corpora that are simply bigger or better-labelled than
what's currently wired in, for whichever modality needs more volume.
Check each dataset's license before use, and never relabel a general
emotion corpus as a "depression" or clinical dataset — it's a proxy, not
a diagnosis.

## Text (emotion / sentiment)

### Indian-language & code-mixed

| Dataset                                                        | Content                                                                                                       | Access                                                                                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hinglish emotion dataset (Wadhawan & Aggarwal, WASSA 2021)** | 151,311 Hindi-English code-mixed tweets, 6 emotions (happy, sad, anger, fear, disgust, surprise)              | ACL Anthology 2021.wassa-1.21; check for the accompanying GitHub release                                                                              |
| **SemEval SentiMix + emotion labels (Ekman)**                  | 20,000 code-mixed Hinglish instances re-annotated with emotion labels on top of the SentiMix sentiment task   | Described in the ScienceDirect paper "Multitasking of sentiment detection and emotion recognition in code-mixed Hinglish data" — request from authors |
| **Hinglish emotion (16k, 7-class)**                            | 16,000 Hinglish sentences, joy/anger/sadness/fear/love/surprise/neutral                                       | Paper: "Emotion Detection in Hinglish...", check for released corpus                                                                                  |
| **12k Hindi-English code-mixed (Happy/Sad/Anger)**             | Scraped from streaming-site comments, 3-emotion labels                                                        | arXiv:2105.09226                                                                                                                                      |
| **EmoMix-3L**                                                  | Multi-label emotion detection, Bangla-Hindi-English code-mixed                                                | arXiv:2405.06922 — released dataset, check paper's data link                                                                                          |
| **SentiGrad**                                                  | Hindi-English code-mixed, YouTube course-comment sentiment                                                    | IEEE, "SentiGrad" — request from authors                                                                                                              |
| **IndicSentiment (AI4Bharat)**                                 | Sentiment (positive/negative/neutral) reviews translated across many Indic languages                          | `huggingface.co/datasets/ai4bharat/IndicSentiment`                                                                                                    |
| **MIDAS Hindi Discourse**                                      | Hindi discourse corpus (story/narrative), earmarked by its authors as a base for future emotion-analysis work | `huggingface.co/datasets/midas/hindi_discourse`                                                                                                       |
| Misc Kaggle/HF "Hindi sentiment" sets                          | Smaller, quality varies — spot-check labels before use                                                        | e.g. `kaggle.com/datasets/praths71018/hindi-sentiment-dataset`                                                                                        |

Code-mixed Hinglish is the closest linguistic match to how most Indian
users of a text-input tool will actually type, so it's arguably higher
value than a bigger but purely-English or purely-Hindi corpus.

### General (bigger / better-labelled, any language)

| Dataset                             | Content                                                                                                                                             | Access                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **GoEmotions (Google)** ✅ wired in | ~58,000 Reddit comments, 27 fine-grained emotions + neutral, multi-label                                                                            | Official CSVs are on GCS (unreachable from this sandbox); `ml/data/goemotions.csv` (~45.4k single-label rows) was built from the plain-TSV mirror at `github.com/monologg/GoEmotions-pytorch`, which raw.githubusercontent.com _can_ reach. See `load_goemotions()` in `ml/train_text_model.py`.                                                                                                                                                                                     |
| **DailyDialog** ✅ wired in         | ~102,000 individual utterances (from 13,000 multi-turn dialogues) labelled with emotion per utterance                                               | `huggingface.co/datasets/daily_dialog` — flatten to one row per utterance (columns: text,emotion) at `ml/data/dailydialog.csv`; see `load_dailydialog()` in `ml/train_text_model.py`. Its short, first-person, everyday-spoken sentences are the closest register match to a transcribed voice check-in (see `script.js`'s speech-recognition-based voice scoring, which runs through this same model), so this dataset matters more for that use case than its size alone suggests. |
| **EmpatheticDialogues**             | ~25,000 conversations grounded in a specific emotional situation the speaker describes first-person ("I finally got promoted!") — 32 emotion labels | `github.com/facebookresearch/EmpatheticDialogues` (Facebook AI, CC-BY-NC — check license terms for your use case)                                                                                                                                                                                                                                                                                                                                                                    |
| **EmoBank**                         | ~10,000 sentences with continuous valence/arousal/dominance ratings (dimensional, not just categorical)                                             | `github.com/JULIELab/EmoBank`                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## Audio (speech emotion)

Indian options are in the previous section of the project's dataset notes
(IITKGP-SEHSC, BhavVani, Indian EmoSpeech Command Dataset, Indian
Emotional Speech Corpus, SilencioNetwork Indian Languages Speech,
Kathbath). For extra volume/robustness beyond RAVDESS/CREMA-D:

| Dataset                            | Content                                                                                                                                                                     | Access                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **TESS** (Toronto)                 | 2,800 clips, 2 actresses, 7 emotions                                                                                                                                        | `tspace.library.utoronto.ca/handle/1807/24487`                            |
| **SAVEE**                          | 480 clips, 4 male actors, 7 emotions                                                                                                                                        | `kaggle.com/datasets/barelydedicated/savee-database`                      |
| **EMO-DB (Berlin)**                | ~500 clips, German, 7 emotions — useful as a third cross-corpus anchor even though not English/Hindi                                                                        | `emodb.bilderbar.info`                                                    |
| **IEMOCAP**                        | ~12 hrs, scripted + improvised dyadic sessions, categorical + dimensional labels — the standard SER benchmark                                                               | Requires signing a license agreement: `sail.usc.edu/iemocap`              |
| **MELD**                           | Multimodal (audio+video+text) emotion in dialogue, from _Friends_ TV show, 7 emotions                                                                                       | `github.com/declare-lab/MELD`                                             |
| **MSP-IMPROV**                     | ~9 hrs, scripted + improvised + natural interaction, categorical + dimensional labels — good complement to IEMOCAP for cross-corpus generalization checks                   | Request: `ecs.utdallas.edu/research/researchlabs/msp-lab/MSP-Improv.html` |
| **ESD (Emotional Speech Dataset)** | 350 parallel utterances × 10 English + 10 Mandarin speakers, 5 emotions, studio-quality                                                                                     | `github.com/HLTSingapore/Emotional-Speech-Data`                           |
| **CaFE (Canadian French)**         | 936 clips, 12 actors, 6 emotions + neutral, 2 intensities                                                                                                                   | `zenodo.org/record/1478765`                                               |
| **EMOVO**                          | Italian, 6 actors, 7 emotions — another non-English cross-corpus anchor                                                                                                     | `voice.fub.it/activities/corpora/emovo/index.html`                        |
| **CAMEO** (meta-collection)        | A curated, standardized collection of multilingual emotional-speech corpora with a shared loader/toolkit — useful as a starting point instead of wiring each corpus by hand | arXiv:2505.11051                                                          |

For a broader map of the field (50+ corpora, collection method, annotation
scheme, ecological validity discussed), see the 2025 survey "Review and
Comparative Analysis of Databases for Speech Emotion Recognition"
(`doi.org/10.3390/data10100164`) — useful for picking a second/third
cross-corpus anchor beyond what's listed above.

## Video (facial expression)

Indian options are InFER/InFER++, iSAFE, ISED, IFExD, and the commercial
South Asian Facial Expression set (see above). For extra volume:

| Dataset                                          | Content                                                                                                                                                                                                                                                                                                             | Access                                                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FERPlus** ✅ wired in                          | Re-labels FER2013's exact same ~35,000 images using 10 human taggers per image instead of FER2013's original 1, fixing its well-documented label noise (~65% single-annotator agreement) — the highest-value entry on this list since it improves the _ground truth_ on data you already have, not just adds volume | `github.com/microsoft/FERPlus` (`fer2013new.csv`) — pass via `--ferplus-csv` to `train_video_model_TEMPLATE.py`; see `load_ferplus_soft_labels()` |
| **AffectNet**                                    | ~1M images, 8 expressions + valence/arousal — large but stricter license, request required                                                                                                                                                                                                                          | `mohammadmahoor.com/affectnet/`                                                                                                                   |
| **RAF-DB**                                       | ~30,000 real-world images, 7 basic + 12 compound expressions                                                                                                                                                                                                                                                        | Request via `whdeng.cn/RAF/model1.html`                                                                                                           |
| **CK+ (Extended Cohn-Kanade)**                   | Classic posed-sequence lab dataset, 7 emotions — small but clean, good for sanity-checks                                                                                                                                                                                                                            | `jeffcohn.net/Resources/`                                                                                                                         |
| **DFEW**                                         | ~16,000 video clips from films, "in the wild" dynamic facial expressions                                                                                                                                                                                                                                            | `dfew-dataset.github.io`                                                                                                                          |
| **MELD** (see above)                             | Also usable for video — synced audio+video+text per utterance                                                                                                                                                                                                                                                       | `github.com/declare-lab/MELD`                                                                                                                     |
| **JAFFE**                                        | 213 images, 10 Japanese female subjects, 7 expressions — small, posed, useful as a clean sanity-check set like CK+                                                                                                                                                                                                  | `zenodo.org/record/3451524`                                                                                                                       |
| **KDEF**                                         | 4,900 images, 70 subjects, 7 expressions x 5 angles — good for pose-robustness checks                                                                                                                                                                                                                               | `kdef.se`                                                                                                                                         |
| **Oulu-CASIA**                                   | ~2,880 sequences, 80 subjects, 6 expressions, includes varied lighting conditions                                                                                                                                                                                                                                   | `www.oulu.fi/cmvs/node/41316`                                                                                                                     |
| **SFEW** (Static Facial Expressions in the Wild) | ~1,700 images sourced from films, "in the wild" difficulty, 7 expressions                                                                                                                                                                                                                                           | `cs.anu.edu.au/few/AFEW.html`                                                                                                                     |
| **ISMED** _(new, 2025)_                          | Indian Spontaneous Micro-Expression Dataset — 127 Indian participants (64M/63F, ages 20–35), spontaneous (not posed) micro-expressions across 6 basic emotions, IRB-approved                                                                                                                                        | Frontiers in Psychology, DOI:10.3389/fpsyg.2025.1656104 — check paper for the dataset request process                                             |

FERPlus is the recommended first step before reaching for any of the
volume-adding sets below it: swapping in cleaner labels for images you
already have is usually a bigger accuracy win, per-hour-of-effort, than
sourcing and wiring in an entirely new corpus.

## Eye / gaze / landmark datasets

| Dataset           | Content                                                                                                 | Access                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **OpenEDS**       | High-resolution eye-region images from VR headset cameras, annotated for pupil, iris, eyelid, and gaze  | `eye-tracking.ai` / request from OpenEDS project   |
| **MPIIGaze**      | 213,659 eye images from 15 participants, with continuous gaze labels in everyday settings               | `datasets.d2.mpi-inf.mpg.de/MPIIGaze`              |
| **GazeCapture**   | 2.5M frames captured from mobile devices, per-frame gaze target annotations                             | `gazecapture.cs.cornell.edu`                       |
| **Columbia Gaze** | 5,880 images of 56 subjects with precise gaze-angle labels, useful for eye alignment/attention modeling | `www.cs.columbia.edu/CAVE/databases/columbia_gaze` |
| **RT-GENE**       | 122K real-world gaze images with 3D gaze direction annotations                                          | `datasets.d2.mpi-inf.mpg.de/RT-GENE`               |

These datasets are not emotion labels themselves, but they are highly useful
for building the face/eye-region alignment, blink/gaze stability, and
attention features that make expression-based risk scoring more accurate.

## Depression / clinical audio-video corpora

| Dataset                                       | Content                                                                                         | Access                                                   |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **DAIC-WOZ**                                  | Clinical interview audio/video/transcripts labelled for depression severity (PHQ-8)             | `dcapswoz.github.io` / request access                    |
| **AVEC 2014 / 2017**                          | Audio/video/text corpora annotated for depression/distress levels, used in challenge benchmarks | `avec2014.github.io` / `avec2017.github.io`              |
| **DAIC-INC**                                  | Interview corpus for mental health and depression detection research                            | through DAIC data access process                         |
| **Distress Analysis Interview Corpus (DAIC)** | multimodal depression detection corpus with clinical labels                                     | request via University of Southern California or authors |

Use these clinical corpora as downstream fine-tuning or evaluation datasets.
Train initial general emotion/affect models on larger cross-corpus emotion sets,
then adapt them with a smaller depression-specific clinical corpus if you
have the required access and ethics clearance.

ISMED is worth prioritizing over the older Indian sets above where usable:
spontaneous (elicited-but-genuine) expressions are a closer match to how
someone would actually look during a real check-in than posed/acted sets
like iSAFE or IFExD, and it's recent enough to reflect current norms.

## Wiring into the existing pipeline

- **Text**: `ml/train_text_model.py` currently pulls ISEAR + CrowdFlower
  CSVs. Any dataset above that ships as a CSV/TSV of (text, label) can be
  dropped into `ml/data/` and added to the loader the same way; code-mixed
  Hinglish sets are worth adding even in modest volume since they cover a
  usage pattern (mixed script/transliteration) the current English-only
  vocab likely misses entirely.
- **Audio**: `train_audio_model_TEMPLATE.py --input-dir` now accepts a
  comma-separated list of directories to combine multiple corpora into one
  cross-corpus training run (e.g.
  `--input-dir ./ravdess_wav,./crema_d_wav,./bhavvani_wav`), and an
  optional `--labels-csv file,emotion` for datasets that ship labels in a
  separate metadata file instead of the filename (most non-RAVDESS/
  CREMA-D corpora — CSV labels take priority per-file, falling back to
  `label_from_filename()` for anything not listed, so you can mix a
  CSV-labelled corpus with a filename-labelled one in the same run). The
  feature set was also expanded from 4 to 9 acoustic features (added
  spectral centroid, spectral rolloff, jitter, shimmer, speech-rate — an
  eGeMAPS-style set) for a richer fit; `script.js`'s client-side extraction
  was updated to compute the same 9 features so a model trained with the
  new feature set scores correctly at runtime (older 4-feature exports
  still work too — the scoring loop is backward-compatible).
- **Video**: `train_video_model_TEMPLATE.py` currently trains on FER2013's
  raw pixels → label, treating each row as a one-hot expression vector. It
  now also accepts `--extra-probs-csv` to fold in a second dataset's real
  face-api.js expression _probabilities_ (columns:
  `angry,disgust,fear,happy,sad,surprise,neutral,label`) for cross-corpus
  training — this is the concrete path for InFER/iSAFE/RAF-DB/**ISMED**-
  style data: run face-api.js's `faceExpressionNet` over each image/frame
  to get its 7-way probability vector, write one CSV row per image with
  that vector + the high/low-risk label, and pass the CSV via
  `--extra-probs-csv`. Keep FER2013 in the mix for volume; use the
  Indian/other sets to check/correct for demographic skew.
