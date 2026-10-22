"""
MindLens — optional NoSQL storage for collect.html
====================================================
© MindLens — Developed by Bhuvanidharan V

collect.html (the researcher-only, consented data-collection page) has
always worked by downloading captured files straight to the researcher's
own device — nothing left the browser. This module adds an OPTIONAL
second path: if a MongoDB instance is reachable, collect.js can instead
POST a consented sample straight to the server, and it lands here.

Why MongoDB: samples are inherently document-shaped (a variable set of
fields — pid/age/gender/consent/timestamp/text — plus a variable number of
attached files depending on what a participant captured that session), so
a schema-less NoSQL document store is a natural fit; the raw audio/photo
files are stored via GridFS (MongoDB's built-in mechanism for binary files
too large — or numerous — for comfortable storage inline in a document).

Nothing about this is required for the rest of the app. Exactly like
server.py's text-classifier endpoint, every function here fails soft: if
pymongo isn't installed, or no MongoDB is reachable, `available()` reports
False and the /api/collect route in server.py returns a clear "not
configured" response instead of a stack trace — collect.html's existing
local-download flow is completely unaffected either way.

Configuration (environment variables, both optional):
    MONGODB_URI   default: mongodb://localhost:27017/
    MONGODB_DB    default: mindlens

Document shape written to the `samples` collection:
    {
        "pid": "P001" | None,
        "age": "24" | None,
        "gender": "boy" | "girl" | "unspecified" | None,
        "consent": true,
        "text_sample": "..." | None,
        "expressions_captured": ["neutral", "happy", ...],
        "files": {
            "audio": ObjectId(...),                # GridFS file id, or absent
            "selfie_neutral": ObjectId(...),
            "selfie_happy": ObjectId(...),
            ...
        },
        "created_at": "2026-08-21T12:34:56.789Z",
        "source": "collect.html",
    }

See ml/export_from_mongo.py for pulling this back out into the same
folder-of-files layout collect.html's local download already produces, so
every existing downstream tool (ml/convert_webm.py, ml/pipeline.py, the
training templates) keeps working unmodified regardless of which path a
given sample came in through.
"""

import datetime
import os
import time

try:
    from pymongo import MongoClient
    from pymongo.errors import PyMongoError
    from gridfs import GridFS
    from bson import ObjectId

    _PYMONGO_AVAILABLE = True
except ImportError:
    _PYMONGO_AVAILABLE = False

MONGODB_URI = os.environ.get("MONGODB_URI", "mongodb://localhost:27017/")
MONGODB_DB = os.environ.get("MONGODB_DB", "mindlens")

_client = None
_db = None
_fs = None
_connect_error = None
_last_connect_attempt = 0.0
_RECONNECT_AFTER_SECONDS = 3.0


def _connect():
    """Lazily connects on first use rather than at import time, so simply
    importing this module (e.g. for server.py's startup log) never itself
    throws just because Mongo isn't running yet."""
    global _client, _db, _fs, _connect_error, _last_connect_attempt
    if _client is not None:
        return
    if not _PYMONGO_AVAILABLE:
        _connect_error = "pymongo not installed"
        return

    # MongoDB may be started after Flask.  A previous implementation kept
    # the first failed ping forever, making /api/health report disconnected
    # until the entire Flask process was restarted. Retry after a short
    # cooldown so the collection page recovers automatically without
    # repeatedly blocking every request on a failed network connection.
    now = time.monotonic()
    if now - _last_connect_attempt < _RECONNECT_AFTER_SECONDS:
        return
    _last_connect_attempt = now

    client = None
    try:
        # A short server selection timeout so a missing/unreachable MongoDB
        # fails fast (a couple of seconds) instead of hanging requests.
        client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=2000)
        client.admin.command("ping")
        _client = client
        _db = client[MONGODB_DB]
        _fs = GridFS(_db)
    except PyMongoError as e:
        _connect_error = str(e)
        if client is not None:
            client.close()
    except Exception as e:  # pragma: no cover - defensive
        _connect_error = str(e)
        if client is not None:
            client.close()


def available() -> bool:
    """True if a MongoDB instance is configured and currently reachable."""
    _connect()
    return _db is not None


def status() -> dict:
    """Human-readable connection status, surfaced via /api/health."""
    _connect()
    if _db is not None:
        return {"connected": True, "uri": _redact_uri(MONGODB_URI), "db": MONGODB_DB}
    return {
        "connected": False,
        "uri": _redact_uri(MONGODB_URI),
        "db": MONGODB_DB,
        "error": _connect_error or "not connected",
    }


def _redact_uri(uri: str) -> str:
    """Hides a username:password if present, so a status endpoint never
    leaks credentials even by accident."""
    if "@" not in uri:
        return uri
    scheme, _, rest = uri.partition("://")
    _, _, host_part = rest.partition("@")
    return f"{scheme}://***:***@{host_part}"


def save_sample(meta: dict, files: dict) -> str:
    """Stores one consented sample: file blobs go into GridFS, everything
    else into a `samples` document that references them by GridFS id.

    meta: dict with pid/age/gender/consent/text_sample/expressions_captured
    files: dict of {field_name: (filename, bytes, content_type)}, e.g.
           {"audio": ("P001-audio.webm", b"...", "audio/webm"),
            "selfie_happy": ("P001-selfie-happy.png", b"...", "image/png")}

    Returns the inserted document's id as a string. Raises RuntimeError if
    no database is available — callers should check available() first, or
    catch this.
    """
    _connect()
    if _db is None:
        raise RuntimeError(f"MongoDB not available: {_connect_error}")

    file_ids = {}
    for field, (filename, data, content_type) in files.items():
        if not data:
            continue
        file_ids[field] = _fs.put(
            data, filename=filename, content_type=content_type
        )

    doc = {
        "pid": meta.get("pid") or None,
        "age": meta.get("age") or None,
        "gender": meta.get("gender") or None,
        "consent": bool(meta.get("consent")),
        "text_sample": meta.get("text_sample") or None,
        "expressions_captured": meta.get("expressions_captured") or [],
        "files": file_ids,
        "created_at": datetime.datetime.utcnow().isoformat() + "Z",
        "source": "collect.html",
    }
    result = _db.samples.insert_one(doc)
    return str(result.inserted_id)


def list_samples(limit: int = 200) -> list:
    """Newest-first summaries (no file bytes) — used by the export script
    and by a researcher sanity-checking what's landed in the database."""
    _connect()
    if _db is None:
        raise RuntimeError(f"MongoDB not available: {_connect_error}")
    cursor = _db.samples.find().sort("created_at", -1).limit(limit)
    out = []
    for doc in cursor:
        file_names = {}
        for field, file_id in (doc.get("files") or {}).items():
            try:
                grid_file = _fs.get(file_id)
                file_names[field] = {
                    "name": grid_file.filename,
                    "content_type": grid_file.content_type,
                    "size": grid_file.length,
                }
            except Exception:
                # A document may reference a file manually removed from GridFS.
                # Keep the sample visible and identify the missing file slot.
                file_names[field] = {"name": f"{field} (file unavailable)"}
        doc["_id"] = str(doc["_id"])
        doc["files"] = {k: str(v) for k, v in (doc.get("files") or {}).items()}
        doc["file_names"] = file_names
        out.append(doc)
    return out


def get_file(file_id: str) -> bytes:
    """Reads one GridFS file back out by id (string or ObjectId)."""
    _connect()
    if _db is None:
        raise RuntimeError(f"MongoDB not available: {_connect_error}")
    oid = file_id if isinstance(file_id, ObjectId) else ObjectId(file_id)
    return _fs.get(oid).read()
