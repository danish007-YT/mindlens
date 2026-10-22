"""
MindLens — Text risk-classifier training script
=================================================
Trains a bag-of-words Logistic Regression model that predicts a
"depressive-language risk" probability from short text, using four
public, freely-licensed emotion-labelled corpora:

  1. CrowdFlower "Sentiment Analysis in Text" (~40,000 tweets, 13 emotion
     labels) — Public Domain.
     Source: https://raw.githubusercontent.com/tlkh/text-emotion-classification/master/dataset/data/text_emotion.csv
  2. ISEAR (~7,600 self-reported emotional situations, 7 emotion labels,
     academic research corpus) —
     Source: https://raw.githubusercontent.com/sinmaniphel/py_isear_dataset/master/isear.csv
  3. GoEmotions (Demszky et al. 2020, Google/ACL, Apache-2.0) — ~58,000
     Reddit comments, 27 fine-grained emotions + neutral. This script uses
     the ~45,400 single-label rows (train+dev+test splits combined) mirrored
     as plain TSV at https://github.com/monologg/GoEmotions-pytorch
     (original data hosted at https://storage.googleapis.com/gresearch/goemotions,
     not reachable from this build environment's restricted network).
     Adds real, diverse, modern conversational text — a different register
     (Reddit comments vs. tweets/self-reports) and much finer emotion
     granularity — which is exactly the kind of variety that helps a
     bag-of-words classifier generalise instead of overfitting to one
     corpus's vocabulary quirks.
  4. DailyDialog (Li et al. 2017, IJCNLP) — ~13,000 multi-turn dialogues,
     102,000 individual utterances labelled with one of 7 emotions
     (no-emotion, anger, disgust, fear, happiness, sadness, surprise).
     Source: https://huggingface.co/datasets/daily_dialog — download and
     flatten to one row per utterance (columns: text,emotion) at
     ml/data/dailydialog.csv; see load_dailydialog() below for the exact
     expected label strings.
     This corpus matters more than its size suggests: its utterances are
     short, first-person, everyday spoken sentences ("I'm so happy today",
     "I feel a bit down") — much closer in register to a transcribed voice
     check-in (see script.js's speech-recognition-based voice scoring,
     which now runs through this exact model) than tweets, Reddit comments,
     or ISEAR's more formal self-reports. Adding it should improve accuracy
     specifically on the short spoken-style inputs the voice check-in
     produces, not just on longer typed text.

This is a MUCH bigger, more diverse training set than the 12 hand-written
reference sentences the original script.js used for its embedding
comparison, and it replaces the hand-tuned keyword list ("LEXICON" in the
old script.js) with data-driven weights.

IMPORTANT — read before treating the output as clinical:
This trains a *language-pattern* classifier (sad/angry/fearful wording vs.
joyful/loving wording). It is NOT trained on clinically labelled depression
data (e.g. PHQ-9 scored transcripts), because doing that responsibly needs
a licensed clinical dataset and ethics review — see the project README.
Treat the "risk score" as "how much this text resembles distressed /
negative-affect language", not as a depression diagnosis.

Output: /home/claude/mindlens_ml/export/text_model.json
  { "vocab": [...], "weights": [...], "bias": ..., "metrics": {...} }

More corpora (Indian/code-mixed text — Hinglish tweet/comment datasets,
IndicSentiment — plus EmpatheticDialogues and EmoBank) are listed in
ml/DATASETS.md with access notes. Any of them can be added to ml/data/ as
an extra CSV and folded into load_datasets() below; the Hinglish sets in
particular cover mixed Hindi-English/transliterated text that the current
English-only vocab has no coverage for at all.
"""

import json
import os
import re
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import CountVectorizer  # type: ignore[import]
from sklearn.linear_model import LogisticRegression  # type: ignore[import]
from sklearn.model_selection import train_test_split, GridSearchCV  # type: ignore[import]
from sklearn.metrics import accuracy_score, roc_auc_score, classification_report  # type: ignore[import]

import argparse


def parse_args():
    p = argparse.ArgumentParser(description='Train text risk classifier')
    p.add_argument('--data-dir', default=os.path.join(os.path.dirname(__file__), "data"), help='Directory with text datasets')
    p.add_argument('--export-dir', default=os.path.join(os.path.dirname(__file__), "export"), help='Export directory')
    return p.parse_args()


args = parse_args()
DATA_DIR = args.data_dir
EXPORT_DIR = args.export_dir

# ---------------------------------------------------------------
# 1. Load + unify both corpora into a binary "high-risk language" vs
#    "low-risk language" label.
#    HIGH-RISK ~ sadness/worry/fear/anger/disgust/guilt/shame/hate
#    LOW-RISK  ~ joy/love/happiness/fun/enthusiasm/surprise/neutral
# ---------------------------------------------------------------

HIGH_RISK_CF = {"sadness", "worry", "hate", "anger"}
LOW_RISK_CF = {"happiness", "joy", "love", "fun", "enthusiasm", "relief", "surprise"}
# CrowdFlower also has "neutral", "empty", "boredom" — excluded, too ambiguous.

HIGH_RISK_ISEAR = {"sadness", "fear", "anger", "disgust", "guilt", "shame"}
LOW_RISK_ISEAR = {"joy"}

# GoEmotions' 27 fine-grained categories + neutral. Same "distressed vs
# positive affect" framing as the other two corpora. Ambiguous/valence-
# neutral categories (neutral, confusion, curiosity, desire, realization,
# surprise) are excluded, same reasoning as excluding CrowdFlower's
# "neutral"/"boredom"/"empty" above — they don't cleanly signal either
# direction and would just add label noise.
HIGH_RISK_GOEMOTIONS = {
    "anger", "annoyance", "disappointment", "disapproval", "disgust",
    "embarrassment", "fear", "grief", "nervousness", "remorse", "sadness",
}
LOW_RISK_GOEMOTIONS = {
    "admiration", "amusement", "approval", "caring", "excitement",
    "gratitude", "joy", "love", "optimism", "pride", "relief",
}

def load_crowdflower():
    df = pd.read_csv(f"{DATA_DIR}/text_emotion_crowdflower.csv")
    df = df[df["sentiment"].isin(HIGH_RISK_CF | LOW_RISK_CF)].copy()
    df["label"] = df["sentiment"].apply(lambda s: 1 if s in HIGH_RISK_CF else 0)
    return df[["content", "label"]].rename(columns={"content": "text"})

def load_isear():
    df = pd.read_csv(f"{DATA_DIR}/isear.csv", sep="|", engine="python", on_bad_lines="skip")
    df = df[df["EMOT"].notna()]
    # EMOT column in this mirror is numeric legacy code; the human-readable
    # emotion string is in a later column that pandas parsed with header
    # collisions across dataset revisions, so we detect it robustly:
    text_col = None
    label_col = None
    for c in df.columns:
        sample = df[c].astype(str).head(200)
        if sample.str.contains(r"[a-zA-Z]{4,}").mean() > 0.5 and df[c].astype(str).str.len().mean() > 25:
            text_col = c
        if df[c].astype(str).isin(
            ["joy", "fear", "anger", "sadness", "disgust", "shame", "guilt"]
        ).mean() > 0.3:
            label_col = c
    if text_col is None or label_col is None:
        return pd.DataFrame(columns=["text", "label"])
    out = df[[text_col, label_col]].rename(columns={text_col: "text", label_col: "emo"})
    out = out[out["emo"].isin(HIGH_RISK_ISEAR | LOW_RISK_ISEAR)]
    out["label"] = out["emo"].apply(lambda s: 1 if s in HIGH_RISK_ISEAR else 0)
    return out[["text", "label"]]

def load_goemotions():
    path = f"{DATA_DIR}/goemotions.csv"
    if not os.path.exists(path):
        return pd.DataFrame(columns=["text", "label"])
    df = pd.read_csv(path)
    df = df[df["emotion"].isin(HIGH_RISK_GOEMOTIONS | LOW_RISK_GOEMOTIONS)].copy()
    df["label"] = df["emotion"].apply(lambda s: 1 if s in HIGH_RISK_GOEMOTIONS else 0)
    return df[["text", "label"]]

# DailyDialog's 7-way emotion scheme (Ekman's 6 basic emotions + "no
# emotion"). Deliberately excludes surprise and "no emotion" rows — surprise
# isn't reliably high- or low-risk on its own, and emotion-neutral small talk
# ("Could you pass the salt?") isn't a useful training signal either way.
HIGH_RISK_DD = {"anger", "disgust", "fear", "sadness"}
LOW_RISK_DD = {"happiness"}

def load_dailydialog():
    path = f"{DATA_DIR}/dailydialog.csv"
    if not os.path.exists(path):
        return pd.DataFrame(columns=["text", "label"])
    df = pd.read_csv(path)
    df["emotion"] = df["emotion"].astype(str).str.strip().str.lower()
    df = df[df["emotion"].isin(HIGH_RISK_DD | LOW_RISK_DD)].copy()
    df["label"] = df["emotion"].apply(lambda s: 1 if s in HIGH_RISK_DD else 0)
    return df[["text", "label"]]

cf = load_crowdflower()
isear = load_isear()
goemotions = load_goemotions()
dailydialog = load_dailydialog()
data = pd.concat([cf, isear, goemotions, dailydialog], ignore_index=True)
data["text"] = data["text"].astype(str).str.strip()
data = data[data["text"].str.len() > 3].drop_duplicates(subset="text")

print(f"CrowdFlower usable rows: {len(cf)}")
print(f"ISEAR usable rows:       {len(isear)}")
print(f"GoEmotions usable rows:  {len(goemotions)}")
print(f"DailyDialog usable rows: {len(dailydialog)}")
print(f"Combined training rows:  {len(data)}")
print(data["label"].value_counts())

# ---------------------------------------------------------------
# 2. Vectorize (bag-of-words, top-N vocab so the exported JSON stays
#    small enough to ship to the browser) + Logistic Regression
# ---------------------------------------------------------------
def clean(t):
    t = t.lower()
    t = re.sub(r"http\S+|@\w+", " ", t)
    t = re.sub(r"[^a-z' ]", " ", t)
    return t

data["clean"] = data["text"].apply(clean)

X_train, X_test, y_train, y_test = train_test_split(
    data["clean"], data["label"], test_size=0.15, random_state=42, stratify=data["label"]
)

vec = CountVectorizer(max_features=6000, min_df=2, ngram_range=(1, 3), stop_words="english")
Xtr = vec.fit_transform(X_train)
Xte = vec.transform(X_test)

# Small grid search over regularization strength, picked by 5-fold CV
# ROC-AUC on the training split only (test split stays untouched until
# final scoring below). This is a "get more out of the same real data"
# improvement — it does not add new examples, just fits the existing
# ~37,500 labelled examples a bit better.
param_grid = {"C": [0.25, 0.5, 1.0, 2.0, 4.0]}
search = GridSearchCV(
    LogisticRegression(max_iter=1000, class_weight="balanced"),
    param_grid, scoring="roc_auc", cv=5, n_jobs=-1,
)
search.fit(Xtr, y_train)
clf = search.best_estimator_
print(f"Best C from CV: {search.best_params_['C']} (CV ROC-AUC: {search.best_score_:.4f})")

pred = clf.predict(Xte)
proba = clf.predict_proba(Xte)[:, 1]
acc = accuracy_score(y_test, pred)
auc = roc_auc_score(y_test, proba)
print(f"\nTest accuracy: {acc:.3f}")
print(f"Test ROC-AUC:  {auc:.3f}")
print(classification_report(y_test, pred, target_names=["low-risk", "high-risk"]))

# ---------------------------------------------------------------
# 3. Export vocab + weights as JSON for direct client-side inference
#    (no TensorFlow.js runtime needed — plain bag-of-words dot product)
# ---------------------------------------------------------------
vocab = vec.get_feature_names_out().tolist()
weights = clf.coef_[0].tolist()
bias = float(clf.intercept_[0])

export = {
    "vocab": vocab,
    "weights": [round(w, 5) for w in weights],
    "bias": round(bias, 5),
    "metrics": {"accuracy": round(acc, 4), "roc_auc": round(auc, 4), "n_train": len(X_train), "n_test": len(X_test)},
    "sources": [
        "CrowdFlower Sentiment Analysis in Text (Public Domain, ~40k tweets)",
        "ISEAR (International Survey on Emotion Antecedents and Reactions, ~7.6k reports)",
        "GoEmotions (Demszky et al. 2020, Google/ACL, Apache-2.0, ~45.4k single-label Reddit comments)",
    ],
    "note": "Bag-of-words logistic regression scoring distressed/negative-affect language patterns vs positive-affect language. Not a clinical depression classifier.",
}

os.makedirs(EXPORT_DIR, exist_ok=True)
with open(f"{EXPORT_DIR}/text_model.json", "w") as f:
    json.dump(export, f)

print(f"\nExported model: {EXPORT_DIR}/text_model.json ({len(vocab)} vocab terms)")

# Show top weighted terms each direction, as a sanity check
order = np.argsort(weights)
print("\nTop 15 terms -> LOW risk:")
for i in order[:15]:
    print(f"  {vocab[i]:20s} {weights[i]:+.3f}")
print("\nTop 15 terms -> HIGH risk:")
for i in order[-15:][::-1]:
    print(f"  {vocab[i]:20s} {weights[i]:+.3f}")
