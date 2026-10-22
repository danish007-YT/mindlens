"""
MindLens — Video (facial-expression) risk-classifier TEMPLATE
================================================================
Same situation as the audio template: FER2013 and similar facial-
expression datasets are hosted on Kaggle, which this build environment
can't reach and which are too large to fetch through a plain package
registry. Run this on your own machine once you've downloaded FER2013
(or similar, e.g. AffectNet — mind its stricter license) to fit real
weights instead of the literature-anchored heuristic currently in
script.js's stopVideoSampling().

Setup:
  pip install pandas numpy scikit-learn --break-system-packages

FER2013 ships as a CSV with pixel data + one of 7 emotion labels
(0=Angry 1=Disgust 2=Fear 3=Happy 4=Sad 5=Surprise 6=Neutral). We don't
need to touch pixels directly here: face-api.js (already in script.js)
gives per-frame expression *probabilities* for the same 7 categories.
So the most useful thing to fit on FER2013 is a mapping from those
7 probabilities to a single risk score, using FER2013's *label*
distribution as ground truth for which combinations of expressions
co-occur with distress vs. positive affect. If you have real
depression-labelled facial video (again: ethics-approved, consented
data only), swap this for a supervised fit against that instead —
that is the only way to make "depression risk" claims defensible.

Indian-face options (better skin-tone/expression-norm match for Indian
users — see ml/DATASETS.md for the full list, sizes and access
notes):
  - InFER / InFER++: 10,200 images + 4,200 clips, 600 Indian subjects,
    multi-ethnic, 7 basic expressions — arXiv:2310.00287; request release
  - iSAFE: 395 clips, 44 volunteers, self+cross-annotated — EULA required:
    https://github.com/shivendra2015iiit/Indian-Semi-Acted-Facial-Expression-Database-iSAFE-
  - Indian Spontaneous Expression Database (ISED): 428 spontaneous clips,
    50 participants — request from paper authors
  - IFExD: posed faces, 3 angles x 8 expressions — https://ifexd.github.io/dataset
  These are small and mostly gated behind a EULA/author request rather
  than a direct download, so treat them as fine-tuning/validation data on
  top of FER2013 rather than a full replacement. Because they ship as
  clips/images with their own labels (not FER2013's pixel-CSV format),
  you'll need to either run a per-frame expression detector (e.g.
  face-api.js/py-feat) over them to get the same 7-way probability vector
  used below, or fine-tune a CNN directly on the images/frames.
"""

import pandas as pd  # type: ignore[import]
import numpy as np  # type: ignore[import]
import json
import os
from sklearn.linear_model import LogisticRegression  # type: ignore[import]
from sklearn.model_selection import train_test_split  # type: ignore[import]
from sklearn.metrics import accuracy_score, roc_auc_score  # type: ignore[import]

import argparse


def parse_args():
    p = argparse.ArgumentParser(description='Train video (expression->risk) classifier (template)')
    p.add_argument('--fer-csv', default='./fer2013.csv', help='Path to FER2013 CSV')
    p.add_argument('--ferplus-csv', default=None,
                    help='Optional path to FERPlus\'s fer2013new.csv (from '
                         'github.com/microsoft/FERPlus). FERPlus re-labels the EXACT SAME '
                         'images as FER2013 using 10 human taggers per image instead of 1, '
                         'fixing FER2013\'s well-documented label noise (~65% single-annotator '
                         'agreement). When provided, rows are matched to --fer-csv by position '
                         '(both files preserve FER2013\'s original row order) and FERPlus\'s '
                         'vote-count columns (neutral,happiness,surprise,sadness,anger,disgust,'
                         'fear,contempt) replace the corresponding one-hot row with a real '
                         'probability distribution — "contempt" votes are folded into '
                         '"disgust", the closest of our 7 categories. This is usually a bigger '
                         'accuracy win than adding more raw images, since it fixes the ground '
                         'truth itself rather than just the volume.')
    p.add_argument('--extra-probs-csv', default=None,
                    help='Optional additional CSV to combine with FER2013 for cross-corpus '
                         'training (e.g. InFER/RAF-DB/ISMED processed through face-api.js — '
                         'see ml/DATASETS.md "Wiring into the existing pipeline"). Expected '
                         'columns: angry,disgust,fear,happy,sad,surprise,neutral,label — the '
                         'first 7 are per-image expression probabilities (from running '
                         'face-api.js\'s faceExpressionNet over each image, not one-hot), and '
                         '"label" is 1 (high-risk) or 0 (low-risk). Rows are concatenated with '
                         'the FER2013 one-hot rows before the train/test split.')
    p.add_argument('--export', default='../export/video_model.json', help='Export JSON path')
    return p.parse_args()


args = parse_args()
FER_CSV = args.fer_csv
FERPLUS_CSV = args.ferplus_csv
EXTRA_PROBS_CSV = args.extra_probs_csv
EXPORT_PATH = args.export

LABEL_MAP = {0: "angry", 1: "disgust", 2: "fear", 3: "happy", 4: "sad", 5: "surprise", 6: "neutral"}
HIGH_RISK = {"sad", "fear", "angry", "disgust"}
LOW_RISK = {"happy", "neutral"}  # neutral kept mild/low here since FER's "neutral" isn't flat-affect-neutral
CATEGORIES = ["angry", "disgust", "fear", "happy", "sad", "surprise", "neutral"]

def load_ferplus_soft_labels(n_rows):
    """Returns an (n_rows, 7) array of FERPlus vote-based probabilities
    aligned to CATEGORIES, or None if --ferplus-csv wasn't given / doesn't
    match. FERPlus's own columns are neutral,happiness,surprise,sadness,
    anger,disgust,fear,contempt (+ unknown,NF, which we drop) — contempt is
    folded into disgust since we only have 7 categories."""
    if not FERPLUS_CSV or not os.path.exists(FERPLUS_CSV):
        return None
    fp = pd.read_csv(FERPLUS_CSV)
    if len(fp) != n_rows:
        print(f"--ferplus-csv row count ({len(fp)}) doesn't match --fer-csv ({n_rows}); "
              f"skipping FERPlus soft labels (they only align by matching row order).")
        return None
    vote_cols = ["anger", "disgust", "fear", "happiness", "sadness", "surprise", "neutral", "contempt"]
    missing = [c for c in vote_cols if c not in fp.columns]
    if missing:
        print(f"--ferplus-csv is missing columns {missing}, skipping.")
        return None
    votes = fp[vote_cols].to_numpy(dtype=float)
    votes[:, 1] += votes[:, 7]  # fold contempt votes into disgust
    votes = votes[:, :7]        # drop the now-merged contempt column
    fp_order = ["anger", "disgust", "fear", "happiness", "sadness", "surprise", "neutral"]
    idx = {"angry": fp_order.index("anger"), "disgust": fp_order.index("disgust"),
           "fear": fp_order.index("fear"), "happy": fp_order.index("happiness"),
           "sad": fp_order.index("sadness"), "surprise": fp_order.index("surprise"),
           "neutral": fp_order.index("neutral")}
    probs = np.stack([votes[:, idx[c]] for c in CATEGORIES], axis=1)
    totals = probs.sum(axis=1, keepdims=True)
    totals[totals == 0] = 1  # avoid div-by-zero for any all-"unknown" rows
    return probs / totals

def main():
    if not os.path.exists(FER_CSV):
        print(f"Place fer2013.csv at {FER_CSV} and re-run.")
        return
    df_full = pd.read_csv(FER_CSV)
    ferplus_probs_full = load_ferplus_soft_labels(len(df_full))
    if ferplus_probs_full is not None:
        print(f"Loaded FERPlus soft labels for {len(df_full)} rows — using these instead of "
              f"one-hot FER2013 labels for feature vectors.")

    df = df_full[df_full["emotion"].map(LABEL_MAP).isin(HIGH_RISK | LOW_RISK)].copy()
    keep_idx = df.index.to_numpy()
    df["label"] = df["emotion"].map(lambda e: 1 if LABEL_MAP[e] in HIGH_RISK else 0) # type: ignore

    # NOTE: without --ferplus-csv, this treats each FER2013 row as a one-hot
    # "expression probability vector" (since raw FER2013 only has hard
    # labels). With --ferplus-csv, real per-image vote probabilities are
    # used instead — a much better-fit mapping. Either way, if you have
    # access to a trained expression classifier's soft outputs on other
    # images, use those too via --extra-probs-csv below.
    categories = CATEGORIES
    if ferplus_probs_full is not None:
        X = ferplus_probs_full[keep_idx]
    else:
        X = np.zeros((len(df), len(categories)))
        for i, emo_code in enumerate(df["emotion"]):
            X[i, categories.index(LABEL_MAP[emo_code])] = 1.0
    y = df["label"].values
    source = (["ferplus" if ferplus_probs_full is not None else "fer2013"]) * len(df)

    # Cross-corpus: fold in a second dataset's face-api.js expression
    # probabilities if provided (see --extra-probs-csv help above / the
    # "Wiring into the existing pipeline" section of ml/DATASETS.md).
    # Combining a real probability distribution with FER2013's one-hot
    # rows is exactly the FER2013 "NOTE" above recommends when you have
    # access to soft expression outputs — this is that path made runnable.
    if EXTRA_PROBS_CSV and os.path.exists(EXTRA_PROBS_CSV):
        extra = pd.read_csv(EXTRA_PROBS_CSV)
        missing = [c for c in categories + ["label"] if c not in extra.columns]
        if missing:
            print(f"--extra-probs-csv is missing columns {missing}, skipping it.")
        else:
            X_extra = extra[categories].values.astype(float)
            y_extra = extra["label"].values.astype(int)
            X = np.vstack([X, X_extra])
            y = np.concatenate([y, y_extra]) # type: ignore
            source = source + [os.path.basename(EXTRA_PROBS_CSV)] * len(extra)
            print(f"Folded in {len(extra)} rows from {EXTRA_PROBS_CSV} (cross-corpus training)")
    elif EXTRA_PROBS_CSV:
        print(f"--extra-probs-csv path not found: {EXTRA_PROBS_CSV}, continuing with FER2013 only.")

    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    clf = LogisticRegression(max_iter=1000, class_weight="balanced")
    clf.fit(Xtr, ytr)
    pred = clf.predict(Xte)
    proba = clf.predict_proba(Xte)[:, 1]
    print(f"Test accuracy: {accuracy_score(yte, pred):.3f}")
    print(f"Test ROC-AUC:  {roc_auc_score(yte, proba):.3f}")
    print(f"Training rows by source: fer2013={source.count('fer2013')}, other={len(source)-source.count('fer2013')}")

    export = {
        "categories": categories,
        "weights": clf.coef_[0].tolist(),
        "bias": float(clf.intercept_[0]),
        "metrics": {"accuracy": round(accuracy_score(yte, pred), 4), "roc_auc": round(roc_auc_score(yte, proba), 4)},
        "note": "Trained on FER2013 (posed/in-the-wild expression photos), not depression-labelled data.",
    }
    os.makedirs(os.path.dirname(EXPORT_PATH), exist_ok=True)
    with open(EXPORT_PATH, "w") as fh:
        json.dump(export, fh)
    print(f"Exported: {EXPORT_PATH}")

if __name__ == "__main__":
    main()
