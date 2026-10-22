"""
MindLens — optional Python backend
====================================
© MindLens — Developed by Bhuvanidharan V

This is an OPTIONAL companion to the fully client-side app. index.html /
script.js keep working with zero backend (open index.html directly, or
serve the folder with any static file server) — nothing about the app
*requires* this file.

What running this adds ("integrate Python for better optimization"):

  1. The text risk-classifier (bag-of-words logistic regression, the same
     one exported to text_model.data.js for the browser) also runs here,
     in Python, using numpy instead of re-computing 6,000 dot-product
     terms in JavaScript on every keystroke/submit. For low-powered
     phones this is meaningfully less client-side CPU/battery work, and
     it means the ~120KB text_model.data.js payload no longer has to be
     downloaded at all when the backend is available.
  2. One process serves both the static frontend AND the API, so there's
     no separate build step or second server to run.
  3. script.js tries POST /api/analyze-text first and silently falls
     back to its existing in-browser scoring if this server isn't
     running — so the PWA / offline story is unaffected.

Run it (any of these):
    - VS Code: press F5 ("MindLens: Run server.py (Flask)") — this
      automatically provisions .venv and installs dependencies first via
      the linked "Setup" task, so it works on a completely fresh clone.
    - VS Code: Terminal ▸ Run Task ▸ "Run: Flask backend (server.py)".
    - Manually:
        python -m venv .venv
        .venv/Scripts/python.exe -m pip install -r requirements-server.txt
        .venv/Scripts/python.exe server.py

Then open the URL printed on startup (defaults to http://localhost:5000,
but see the port note below).

Everything here mirrors trainedModelRiskScore() in script.js line-for-line
(same cleaning regex, same unigram+bigram features, same dedup-per-message
scoring, same sigmoid) so scores match whichever path answers a request.

---------------------------------------------------------------------------
Notes on things that commonly trip this up when run from inside VS Code:

  * macOS reserves port 5000 for AirPlay Receiver by default. If 5000 is
    taken, this file automatically tries the next few ports (5001-5005)
    instead of just crashing with "Address already in use".
  * The Werkzeug auto-reloader (Flask's debug=True default) restarts the
    process in a child, which the VS Code debugger (debugpy) frequently
    can't follow — breakpoints silently stop working and the terminal
    looks "stuck". The reloader is OFF by default here; set
    MINDLENS_RELOAD=1 if you specifically want it for quick edit/save
    iteration outside the debugger.
  * If flask/flask-cors/numpy aren't installed yet, or ml/export/
    text_model.json is missing, this prints a clear, specific message and
    exits cleanly instead of an unhelpful traceback.
---------------------------------------------------------------------------
"""

import json
import os
import re
import socket
import sys
from typing import NoReturn

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "ml", "export", "text_model.json")


def _fail(message: str) -> NoReturn:
    """Print a short, actionable error and exit — instead of a raw traceback
    that's hard to act on from the VS Code integrated terminal."""
    print(f"\n[MindLens server] {message}\n", file=sys.stderr)
    sys.exit(1)


try:
    import numpy as np
except ImportError:
    _fail(
        "Missing dependency 'numpy'. Run the VS Code task "
        "'Setup: create venv + install deps', or manually:\n"
        "  python -m venv .venv && .venv/Scripts/python.exe -m pip install -r requirements-server.txt"
    )

try:
    from flask import Flask, jsonify, request, send_from_directory
    from flask_cors import CORS
except ImportError:
    _fail(
        "Missing dependency 'flask'/'flask-cors'. Run the VS Code task "
        "'Setup: create venv + install deps', or manually:\n"
        "  python -m venv .venv && .venv/Scripts/python.exe -m pip install -r requirements-server.txt"
    )

import db as mindlens_db

if not os.path.exists(MODEL_PATH):
    _fail(
        f"Model file not found: {MODEL_PATH}\n"
        "This ships with the project — if it's missing, re-check your clone/download."
    )

app = Flask(__name__, static_folder=BASE_DIR, static_url_path="")
CORS(app)

try:
    with open(MODEL_PATH, "r", encoding="utf-8") as f:
        _model = json.load(f)
except (OSError, json.JSONDecodeError) as e:
    _fail(f"Could not read/parse {MODEL_PATH}: {e}")

VOCAB = _model["vocab"]
VOCAB_INDEX = {term: i for i, term in enumerate(VOCAB)}
WEIGHTS = np.array(_model["weights"], dtype=np.float64)
BIAS = float(_model["bias"])
METRICS = _model.get("metrics", {})

CLEAN_RE = re.compile(r"https?://\S+|@\w+")
STRIP_RE = re.compile(r"[^a-z' ]")

CRISIS_PHRASES = [
    "want to die", "end my life", "no reason to live", "better off dead",
    "kill myself", "suicide", "can't go on", "hurt myself", "end it all",
    "no point living",
]


def _tokenize(raw: str):
    cleaned = CLEAN_RE.sub(" ", raw.lower())
    cleaned = STRIP_RE.sub(" ", cleaned)
    tokens = [t for t in cleaned.split() if t]
    grams = list(tokens)
    for i in range(len(tokens) - 1):
        grams.append(tokens[i] + " " + tokens[i + 1])
    return grams


def score_text(raw: str):
    """Mirrors trainedModelRiskScore() in script.js."""
    grams = _tokenize(raw)
    z = BIAS
    seen = set()
    hits = []
    for g in grams:
        if g in seen:
            continue
        idx = VOCAB_INDEX.get(g)
        if idx is not None:
            w = WEIGHTS[idx]
            z += w
            seen.add(g)
            if w > 0.4:
                hits.append(g)
    prob = 1.0 / (1.0 + np.exp(-z))
    score = int(round(prob * 100))
    crisis_flag = any(p in raw.lower() for p in CRISIS_PHRASES)
    if crisis_flag:
        score = max(score, 80)
    return score, hits, crisis_flag


@app.route("/api/analyze-text", methods=["POST"])
def analyze_text():
    data = request.get_json(silent=True) or {}
    raw = (data.get("text") or "").strip()
    if not raw:
        return jsonify({"error": "no text provided"}), 400

    score, hits, crisis_flag = score_text(raw)
    return jsonify({
        "score": score,
        "hits": hits,
        "crisisFlag": crisis_flag,
        "method": f"server-side trained classifier ({METRICS.get('accuracy', 0) * 100:.1f}% test accuracy)",
    })


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "vocab_size": len(VOCAB),
        "metrics": METRICS,
        "database": mindlens_db.status(),
    })


MAX_UPLOAD_BYTES = 60 * 1024 * 1024
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES


@app.route("/api/collect", methods=["POST"])
def collect_sample():
    """Receives one consented sample from collect.html: a JSON `meta` field
    plus zero or more files (audio, selfie_<expression>...). Stores files in
    GridFS and a summary document in the `samples` collection. This is the
    only endpoint in the whole app that persists anything server-side —
    everything else (index.html's assessment, and collect.html's default
    local-download flow) stays fully client-side/on-device."""
    if not mindlens_db.available():
        return jsonify({
            "error": "no_database",
            "message": (
                "No MongoDB is configured/reachable on this server. "
                "collect.html's 'Prepare & download all' still works "
                "completely locally — this endpoint is only needed for "
                "the optional 'Upload to server' path."
            ),
        }), 503

    if request.content_length and request.content_length > MAX_UPLOAD_BYTES:
        return jsonify({"error": "payload_too_large"}), 413

    raw_meta = request.form.get("meta", "{}")
    try:
        meta = json.loads(raw_meta)
    except json.JSONDecodeError:
        return jsonify({"error": "invalid_meta_json"}), 400

    if not meta.get("consent"):
        return jsonify({"error": "consent_required"}), 400

    files = {}
    for field, f in request.files.items():
        if not f or not f.filename:
            continue
        files[field] = (f.filename, f.read(), f.mimetype)

    try:
        sample_id = mindlens_db.save_sample(meta, files)
    except RuntimeError as e:
        return jsonify({"error": "database_error", "message": str(e)}), 503

    return jsonify({"status": "ok", "id": sample_id, "filesStored": list(files.keys())})


@app.route("/api/collect", methods=["GET"])
def list_collected_samples():
    """Newest-first summaries (no file bytes) of what's been stored — a
    quick way for a researcher to sanity-check the database from a
    browser/curl without needing a separate Mongo client installed."""
    if not mindlens_db.available():
        return jsonify({"error": "no_database"}), 503
    try:
        limit = min(int(request.args.get("limit", 50)), 500)
    except ValueError:
        limit = 50
    return jsonify({"samples": mindlens_db.list_samples(limit=limit)})


@app.route("/")
def root():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(BASE_DIR, path)


def _find_open_port(preferred: int, host: str = "0.0.0.0", attempts: int = 6) -> int:
    for port in range(preferred, preferred + attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind((host, port))
                return port
            except OSError:
                continue
    _fail(
        f"Ports {preferred}-{preferred + attempts - 1} are all in use. "
        f"Set PORT to a free one, e.g.: PORT=8080 python server.py"
    )
    raise RuntimeError("No open port found")


if __name__ == "__main__":
    requested_port = int(os.environ.get("PORT", 5000))
    port = _find_open_port(requested_port)
    if port != requested_port:
        print(f"[MindLens server] Port {requested_port} was busy — using {port} instead.")

    use_reloader = os.environ.get("MINDLENS_RELOAD", "0") == "1"
    debug = os.environ.get("MINDLENS_DEBUG", "1") == "1"

    print(f"[MindLens server] Serving on http://localhost:{port}  (Ctrl+C to stop)")
    app.run(host="0.0.0.0", port=port, debug=debug, use_reloader=use_reloader, threaded=True)
