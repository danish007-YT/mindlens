/* ==========================================================
   MindLens — client-side, ML/DL-assisted wellness screening demo
   Everything runs in the browser. No data leaves the device.
   This is an academic prototype, NOT a diagnostic instrument.
   © MindLens — Developed by Bhuvanidharan V
   ========================================================== */

const state = {
  scores: { text: null, audio: null, video: null },
};

// Lightweight on-screen diagnostic log for the face-detection pipeline.
// Mirrors to console as before, but also keeps a timestamped in-memory copy
// so the exact sequence of what happened (model load, backend chosen,
// warm-up, retries) can be shown directly on the results panel — no
// DevTools required to diagnose a failed detection.
const mindlensDiagLog = [];
function diagLog(level, ...args) {
  const line = `[+${Date.now() - mindlensDiagStart}ms] ${args.map((a) => (a instanceof Error ? a.message || String(a) : typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ")}`;
  mindlensDiagLog.push(line);
  console[level]
    ? console[level]("MindLens:", ...args)
    : console.log("MindLens:", ...args);
}
const mindlensDiagStart = Date.now();

/* ---------------- Crisis banner ---------------- */
const crisisBanner = document.getElementById("crisisBanner");
const permissionBanner = document.getElementById("permissionBanner");
const permissionDismiss = document.getElementById("permissionDismiss");
if (permissionDismiss)
  permissionDismiss.addEventListener("click", () =>
    permissionBanner.classList.remove("active"),
  );
const closeCrisisBtn = document.getElementById("closeCrisis");
if (closeCrisisBtn)
  closeCrisisBtn.addEventListener("click", () =>
    crisisBanner.classList.add("hidden"),
  );
function showCrisisBanner() {
  crisisBanner.classList.remove("hidden");
}
function showPermissionBanner(message) {
  if (!permissionBanner) return;
  permissionBanner.classList.add("active");
  permissionBanner.innerHTML = `<strong>Permissions needed:</strong> ${message} <button id="permissionDismiss" type="button" aria-label="Dismiss">✕</button>`;
  const dismissBtn = document.getElementById("permissionDismiss");
  if (dismissBtn)
    dismissBtn.addEventListener("click", () =>
      permissionBanner.classList.remove("active"),
    );
}
function hidePermissionBanner() {
  if (!permissionBanner) return;
  permissionBanner.classList.remove("active");
}

function permissionHint(kind, err) {
  const text = `${err?.name || ""} ${err?.message || ""}`.trim();
  const denied =
    /NotAllowedError|PermissionDenied|PermissionDeniedError|denied/i.test(text);
  if (!denied && !text) return "";
  const message = getMediaAccessMessage(kind, err);
  showPermissionBanner(message);
  return ` ${message}`;
}

function getMediaAccessMessage(kind, err) {
  const text = `${err?.name || ""} ${err?.message || ""}`.trim();
  if (
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== "function"
  ) {
    return `This browser does not support ${kind} capture. Try Chrome, Edge, or Firefox on a desktop or mobile device.`;
  }
  if (
    !window.isSecureContext &&
    !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)
  ) {
    return `Use HTTPS or open this app from localhost before allowing ${kind} access.`;
  }
  if (
    /NotAllowedError|PermissionDenied|PermissionDeniedError|denied/i.test(text)
  ) {
    return `Your browser blocked ${kind} access. Allow ${kind} permission for this site in your browser settings, then reload the page.`;
  }
  if (/NotFoundError|DevicesNotFoundError|NotReadableError/i.test(text)) {
    return `No ${kind} device was found. Connect one and try again.`;
  }
  return `Could not start ${kind} capture. ${text || "Please try again."}`;
}

async function requestMediaAccess(kind, options) {
  if (
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== "function"
  ) {
    throw new Error(`Media capture is not supported in this browser`);
  }
  if (
    !window.isSecureContext &&
    !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)
  ) {
    throw new Error(`Insecure origin`);
  }
  return navigator.mediaDevices.getUserMedia(options);
}

/* ---------------- Proactive "Enable camera & microphone" flow ----------------
   getUserMedia() is what actually triggers the browser's native permission
   popup — it never appears just because the page loaded. It also will NEVER
   appear at all if the page isn't served from https:// or http://localhost
   (opening index.html directly as a file:// URL is the most common reason
   the popup seems to be missing), or if the user already denied access once
   (browsers then auto-reject with no popup until it's reset in site settings).
   This block surfaces that up front instead of leaving people to guess after
   clicking "Start recording" / "Start camera" and hitting a plain error. */
const enableMediaBtn = document.getElementById("enableMediaBtn");
const permissionBannerText = document.getElementById("permissionBannerText");

function isSecureOrigin() {
  return (
    window.isSecureContext ||
    ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)
  );
}

async function initPermissionPrompt() {
  if (!permissionBanner) return;

  if (
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== "function"
  ) {
    return; // unsupported browser — the per-feature error message covers this case
  }

  if (!isSecureOrigin()) {
    // No amount of clicking will produce the native popup here — explain why.
    if (permissionBannerText)
      permissionBannerText.innerHTML = `<strong>Camera &amp; microphone are blocked on this page.</strong> Browsers only allow mic/camera access over HTTPS or http://localhost — not when a file is opened directly (file://). Run the included <code>server.py</code> (or any local server) and open the app at http://localhost, or deploy it (see DEPLOY.md), then reload.`;
    if (enableMediaBtn) enableMediaBtn.style.display = "none";
    permissionBanner.classList.add("active");
    return;
  }

  // On a secure origin: check current permission state (where supported) so
  // we only prompt when something actually needs the user's attention.
  let camState = "prompt",
    micState = "prompt";
  try {
    if (navigator.permissions && navigator.permissions.query) {
      const [cam, mic] = await Promise.all([
        navigator.permissions.query({ name: "camera" }).catch(() => null),
        navigator.permissions.query({ name: "microphone" }).catch(() => null),
      ]);
      if (cam) camState = cam.state;
      if (mic) micState = mic.state;
    }
  } catch (e) {
    /* Permissions API not supported for these names — fall back to prompting */
  }

  if (camState === "granted" && micState === "granted") {
    permissionBanner.classList.remove("active");
    return; // already allowed, nothing to do
  }

  if (camState === "denied" || micState === "denied") {
    if (permissionBannerText)
      permissionBannerText.innerHTML = `<strong>Camera and/or microphone are currently blocked</strong> for this site. Click the padlock icon in your browser's address bar → Site settings, allow Camera and Microphone, then reload the page.`;
  } else if (permissionBannerText) {
    permissionBannerText.innerHTML = `<strong>Camera &amp; microphone access:</strong> MindLens needs permission to record for the voice and face check-ins.`;
  }
  if (enableMediaBtn) enableMediaBtn.style.display = "";
  permissionBanner.classList.add("active");
}

if (enableMediaBtn)
  enableMediaBtn.addEventListener("click", async () => {
    enableMediaBtn.disabled = true;
    const originalLabel = enableMediaBtn.textContent;
    enableMediaBtn.textContent = "Requesting…";
    try {
      // Requesting both together fires a single native browser popup asking to
      // allow camera + microphone. We stop the tracks right away — the actual
      // Start recording / Start camera buttons open their own stream when used.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      stream.getTracks().forEach((tr) => tr.stop());
      if (permissionBannerText)
        permissionBannerText.innerHTML = `<strong>Camera &amp; microphone allowed.</strong> You're all set — try Start recording or Start camera below.`;
      if (enableMediaBtn) enableMediaBtn.style.display = "none";
      setTimeout(
        () => permissionBanner && permissionBanner.classList.remove("active"),
        3000,
      );
    } catch (err) {
      enableMediaBtn.disabled = false;
      enableMediaBtn.textContent = originalLabel;
      const message = getMediaAccessMessage("camera/microphone", err);
      if (permissionBannerText)
        permissionBannerText.innerHTML = `<strong>Permission not granted.</strong> ${message}`;
    }
  });

document.addEventListener("DOMContentLoaded", () => {
  initPermissionPrompt();
});
if (document.readyState === "complete" || document.readyState === "interactive")
  initPermissionPrompt();

/* ==========================================================
   1. TEXT ANALYSIS — deep-learning sentence embeddings
   (Universal Sentence Encoder) as the primary model, backed by a
   REAL data-trained bag-of-words classifier (not a hand-written
   keyword list) as the offline fallback.

   The classifier in text_model.json was trained in Python
   (see /ml/train_text_model.py) on ~37,500 labelled examples
   pooled from two public corpora:
     - CrowdFlower "Sentiment Analysis in Text" (~30k tweets, Public Domain)
     - ISEAR (~7.5k self-reported emotion narratives, academic corpus)
   Held-out test performance: ~76% accuracy, 0.84 ROC-AUC (see
   text_model.json -> metrics, and the README for details/limits).
   ========================================================== */

// Data-trained bag-of-words logistic-regression model (see text_model.json).
// Loaded once; used whenever the USE embedding model is unavailable, and
// blended with it when both are available for a steadier estimate.
let textModel = null; // { vocab, weights, bias, metrics }
let textModelFailed = false;

async function ensureTrainedTextModel() {
  if (textModel || textModelFailed) return;
  try {
    if (!window.TEXT_MODEL) throw new Error("text_model.data.js not loaded");
    textModel = window.TEXT_MODEL;
    textModel.vocabIndex = new Map(textModel.vocab.map((w, i) => [w, i]));
  } catch (err) {
    textModelFailed = true;
    textModel = null;
  }
}

// Small unigram+bigram bag-of-words vectorizer matching the
// CountVectorizer settings used at training time (see train_text_model.py).
function trainedModelRiskScore(raw) {
  if (!textModel) return null;
  const cleaned = raw
    .toLowerCase()
    .replace(/https?:\/\/\S+|@\w+/g, " ")
    .replace(/[^a-z' ]/g, " ");
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const grams = tokens.slice();
  for (let i = 0; i < tokens.length - 1; i++)
    grams.push(tokens[i] + " " + tokens[i + 1]);

  let z = textModel.bias;
  const hits = {};
  const seen = new Set();
  grams.forEach((g) => {
    if (seen.has(g)) return;
    const idx = textModel.vocabIndex.get(g);
    if (idx !== undefined) {
      z += textModel.weights[idx];
      seen.add(g);
      if (textModel.weights[idx] > 0.4) hits[g] = true;
    }
  });
  const prob = 1 / (1 + Math.exp(-z));
  return { score: Math.round(prob * 100), hits: Object.keys(hits) };
}

const CRISIS_PHRASES = [
  "want to die",
  "end my life",
  "no reason to live",
  "better off dead",
  "kill myself",
  "suicide",
  "can't go on",
  "hurt myself",
  "end it all",
  "no point living",
];

/* ---------------------------------------------------------------------
   Optional Python backend (server.py). If it's running (e.g. the app was
   opened via `python server.py` instead of as a static file), the same
   trained classifier runs server-side in Python/numpy instead of being
   re-computed in the browser — less client CPU/battery work and no need
   to fetch text_model.data.js at all. If it's not reachable (static
   hosting, offline, PWA install), this silently fails fast and the
   existing in-browser scoring below takes over. Nothing regresses either
   way.
   --------------------------------------------------------------------- */
let serverAvailable = null; // null = unknown, true/false once checked
async function checkServerAvailable() {
  if (serverAvailable !== null) return serverAvailable;
  try {
    const res = await Promise.race([
      fetch("/api/health", { method: "GET" }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 800),
      ),
    ]);
    serverAvailable = !!(res && res.ok);
  } catch (err) {
    serverAvailable = false;
  }
  return serverAvailable;
}

async function serverTextRiskScore(raw) {
  try {
    const res = await Promise.race([
      fetch("/api/analyze-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: raw }),
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 2500),
      ),
    ]);
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data.score !== "number") return null;
    return data;
  } catch (err) {
    return null;
  }
}

// Reference statements used to anchor the sentence-embedding model.
// The model scores new text by how semantically close it sits to
// each cluster, rather than by matching exact keywords.
//
// This anchor set now also has to work well for short, casual, SPOKEN
// sentences — the voice check-in transcribes speech (via
// SpeechRecognition) and scores it through this exact same pipeline, and
// people talk very differently than they write. "today I am very happy"
// is a completely ordinary thing to say aloud but wouldn't naturally
// appear in the original all-written-register anchor set below, which
// skewed toward longer, more composed, essay-like phrasing. The extra
// entries here are deliberately shorter and more conversational so the
// embedding centroid reflects everyday spoken affect, not just typed
// reflection.
const DEPRESSIVE_REFERENCES = [
  "I feel hopeless and empty most days.",
  "I have no energy and everything feels exhausting.",
  "I don't enjoy anything anymore, nothing feels worth doing.",
  "I feel like a burden and worthless.",
  "I can't sleep and I feel tired all the time.",
  "I feel alone and like no one understands me.",
  "Today has been really hard, I feel so down.",
  "I'm not doing great, honestly, everything feels heavy.",
  "I've been feeling pretty low the last few days.",
  "I'm just tired of everything right now.",
  "Nothing's going right and I feel stuck.",
  "I feel really sad and I don't know why.",
];
const POSITIVE_REFERENCES = [
  "I had a great day and felt really happy.",
  "I'm excited about my plans and feel hopeful.",
  "I feel grateful for the people around me.",
  "I've been productive and energetic lately.",
  "I enjoyed spending time with friends today.",
  "I feel calm, proud, and at peace with things.",
  "Today I am very happy.",
  "I'm doing really good today, actually.",
  "Things have been going great lately.",
  "I feel pretty good, no complaints.",
  "I'm in a really good mood today.",
  "Life's been treating me well recently.",
];

let useModel = null;
let depressiveEmbeddings = null;
let positiveEmbeddings = null;
let useModelFailed = false;

async function ensureTextModel() {
  if (useModel || useModelFailed) return;
  try {
    if (
      typeof tf === "undefined" ||
      typeof use === "undefined" ||
      typeof use.load !== "function"
    ) {
      throw new Error("TensorFlow.js models unavailable");
    }
    const loadedModel = await Promise.race([
      use.load(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("text model load timeout")), 5000),
      ),
    ]);
    useModel = loadedModel;
    depressiveEmbeddings = await useModel.embed(DEPRESSIVE_REFERENCES);
    positiveEmbeddings = await useModel.embed(POSITIVE_REFERENCES);
  } catch (err) {
    useModelFailed = true;
    useModel = null;
    depressiveEmbeddings = null;
    positiveEmbeddings = null;
  }
}

function cosineSimilarity(a, b) {
  return tf.tidy(() => {
    const dot = tf.sum(tf.mul(a, b));
    const normA = tf.norm(a);
    const normB = tf.norm(b);
    return dot.div(normA.mul(normB)).dataSync()[0];
  });
}

async function embeddingRiskScore(raw) {
  if (!useModel || !depressiveEmbeddings || !positiveEmbeddings)
    throw new Error("embedding model unavailable");
  const userEmbedding = await useModel.embed([raw]);
  const userVec = userEmbedding.slice([0, 0], [1, -1]).squeeze();

  // Every slice()/squeeze() here allocates a new GPU tensor. None of them
  // were ever disposed, so every text analysis silently leaked ~14 tensors
  // — harmless on the first run, but it compounds across repeated
  // check-ins in the same page session and can eventually degrade or break
  // later runs (including audio/video, since they share the same
  // TensorFlow.js WebGL context). Tracking and disposing them here fixes
  // that.
  const toDispose = [userEmbedding, userVec];
  try {
    const depSims = [];
    const posSims = [];
    for (let i = 0; i < DEPRESSIVE_REFERENCES.length; i++) {
      const refVec = depressiveEmbeddings.slice([i, 0], [1, -1]).squeeze();
      toDispose.push(refVec);
      depSims.push(cosineSimilarity(userVec, refVec));
    }
    for (let i = 0; i < POSITIVE_REFERENCES.length; i++) {
      const refVec = positiveEmbeddings.slice([i, 0], [1, -1]).squeeze();
      toDispose.push(refVec);
      posSims.push(cosineSimilarity(userVec, refVec));
    }
    const avgDep = depSims.reduce((a, b) => a + b, 0) / depSims.length;
    const avgPos = posSims.reduce((a, b) => a + b, 0) / posSims.length;

    // Map similarity delta onto a 0-100 risk scale
    const delta = avgDep - avgPos; // typically roughly -0.3 .. 0.3
    let score = Math.round(50 + delta * 160);
    return Math.max(0, Math.min(100, score));
  } finally {
    toDispose.forEach((t) => {
      try {
        t.dispose();
      } catch (e) {}
    });
  }
}

async function analyseText(raw) {
  const text = raw.toLowerCase();
  let crisisFlag = CRISIS_PHRASES.some((p) => text.includes(p));

  // Prefer the Python backend when it's running: same trained classifier,
  // computed server-side, so the browser skips loading text_model.data.js
  // and re-deriving 6,000 dot-product terms itself.
  const hasServer = await checkServerAvailable();
  if (hasServer) {
    const serverResult = await serverTextRiskScore(raw);
    if (serverResult) {
      await ensureTextModel();
      let score = serverResult.score;
      let method = serverResult.method;
      if (useModel) {
        try {
          const embedScore = await embeddingRiskScore(raw);
          score = Math.round(embedScore * 0.5 + serverResult.score * 0.5);
          method =
            "ML ensemble (sentence-embedding + server-side trained classifier)";
        } catch (err) {
          /* keep server-only score */
        }
      }
      if (serverResult.crisisFlag) crisisFlag = true;
      if (crisisFlag) score = Math.max(score, 80);
      return { score, hits: serverResult.hits, crisisFlag, method };
    }
    // server didn't answer this particular request — fall through to client-side path
  }

  await Promise.all([ensureTextModel(), ensureTrainedTextModel()]);

  const trained = trainedModelRiskScore(raw); // null if text_model.json failed to load

  let score = 50;
  let method = "offline fallback";
  let hits = {};
  if (trained) {
    score = trained.score;
    method = `trained classifier (offline, ${textModel.metrics.accuracy * 100}% test accuracy)`;
    hits = trained.hits;
  }

  if (useModel && trained) {
    try {
      const embedScore = await embeddingRiskScore(raw);
      score = Math.round(embedScore * 0.5 + trained.score * 0.5);
      method = "ML ensemble (sentence-embedding + trained classifier)";
      hits = trained.hits;
    } catch (err) {
      score = trained.score;
      method = "trained classifier (offline fallback)";
      hits = trained.hits;
    }
  } else if (useModel) {
    try {
      score = await embeddingRiskScore(raw);
      method = "ML (sentence-embedding model)";
    } catch (err) {
      score = 50;
      method = "offline fallback";
    }
  }

  if (!Number.isFinite(score)) {
    score = 50;
    method = "offline fallback";
  }

  if (crisisFlag) score = Math.max(score, 80);

  return { score, hits, crisisFlag, method };
}

function initApp() {
  console.log("initApp called");
  updateDashboard();
  const textInput = document.getElementById("textInput");
  const charCount = document.getElementById("charCount");
  if (textInput && charCount) {
    textInput.addEventListener("input", () => {
      const n = textInput.value.trim().split(/\s+/).filter(Boolean).length;
      charCount.textContent = `${n} words`;
    });
  }

  const analyzeBtn = document.getElementById("analyzeTextBtn");

  // Shared by the manual "Analyse my words" button and by the file-upload
  // path below, so uploaded text gets exactly the same scoring, wording,
  // and suggested-next-steps treatment as anything typed in by hand.
  async function scoreAndRenderText(val) {
    const resultBox = document.getElementById("result-text");
    const statusEl = document.getElementById("status-text");
    if (val.split(/\s+/).filter(Boolean).length < 8) {
      resultBox.innerHTML = `<div class="verdict" style="background:#F3EADA;color:#5b4a33;">Write a little more — around 2-3 sentences helps the model.</div>`;
      return false;
    }

    if (analyzeBtn) {
      analyzeBtn.disabled = true;
      analyzeBtn.textContent = "Analysing…";
    }
    let score = 50;
    let hits = [];
    let crisisFlag = false;
    let method = "offline fallback";
    try {
      const analysis = await analyseText(val);
      score = analysis.score;
      hits = analysis.hits || [];
      crisisFlag = analysis.crisisFlag || false;
      method = analysis.method || method;
    } catch (err) {
      score = 50;
      hits = [];
      crisisFlag = false;
      method = "offline fallback";
    }
    if (analyzeBtn) {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = t("analyze_text_btn");
    }

    state.scores.text = score;
    statusEl.textContent = t("status_done");
    statusEl.classList.remove("active");
    statusEl.classList.add("done");

    const band = bandFor(score);
    const domainList =
      hits && hits.length
        ? `Signals noticed in: ${hits.slice(0, 6).join(", ")}.`
        : `No strong signals detected.`;
    const picks = pickRecommendations(band.label, 2);
    resultBox.innerHTML = `<div class="verdict" style="background:${band.bg};color:${band.fg};">
          ${band.label} risk indicator — ${score}/100<br>
          <span style="font-weight:400;font-size:0.82rem;">${domainList} (${method})</span>
        </div>
        <div class="plate-solution">
          <h4>Suggested next step${picks.length > 1 ? "s" : ""}</h4>
          <ul>${picks.map((tip) => `<li>${escapeHtml(tip)}</li>`).join("")}</ul>
        </div>`;

    if (crisisFlag) showCrisisBanner();
    updateDashboard();
    return true;
  }

  if (analyzeBtn) {
    analyzeBtn.addEventListener("click", () => {
      scoreAndRenderText(textInput.value.trim());
    });
  }

  // "Upload a file instead": reads any file the person picks as text in
  // the browser (works well for .txt/.md/.csv/.json/exported notes — any
  // format that is fundamentally text). Binary formats like PDF/Word/
  // images can't be reliably parsed without a much heavier library, so
  // those are detected heuristically and met with a clear message rather
  // than being scored as garbage.
  const textUploadBtn = document.getElementById("textUploadBtn");
  const textFileInput = document.getElementById("textFileInput");
  if (textUploadBtn && textFileInput && textInput) {
    textUploadBtn.addEventListener("click", () => textFileInput.click());
    textFileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      textFileInput.value = ""; // allow re-picking the same file later
      if (!file) return;

      const resultBox = document.getElementById("result-text");
      const reader = new FileReader();
      reader.onload = (ev) => {
        let raw = String(ev.target.result || "");
        // Strip binary/control noise but keep normal whitespace, so a
        // file that mostly decodes cleanly (e.g. UTF-8 .txt/.md/.csv)
        // still comes through, while genuinely binary files stand out.
        const cleaned = raw.replace(
          /[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]/g,
          "",
        );
        const replacementChars = (raw.match(/\uFFFD/g) || []).length;
        const looksBinary =
          raw.length > 0 &&
          (cleaned.length < raw.length * 0.6 ||
            replacementChars > raw.length * 0.02);

        if (looksBinary) {
          resultBox.innerHTML = `<div class="verdict" style="background:#F3EADA;color:#5b4a33;">This file doesn't look like readable text (e.g. it may be a PDF, Word doc, or image). Please upload a plain-text file (.txt, .md, .csv, .json) or paste the text directly into the box above.</div>`;
          return;
        }

        const MAX_CHARS = 20000;
        const text = cleaned.trim().slice(0, MAX_CHARS);
        textInput.value = text;
        textInput.dispatchEvent(new Event("input"));
        scoreAndRenderText(text);
      };
      reader.onerror = () => {
        resultBox.innerHTML = `<div class="verdict" style="background:#F3EADA;color:#5b4a33;">We couldn't read that file. Please try again.</div>`;
      };
      reader.readAsText(file);
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp, { once: true });
} else {
  initApp();
}

/* ==========================================================
   2. AUDIO ANALYSIS — acoustic features scored by a small
   feedforward neural network (built and run with TensorFlow.js)
   ========================================================== */
let audioCtx,
  analyser,
  micStream,
  recording = false,
  audioTimerId,
  audioSeconds = 0;
let audioFrames = [];
let pitchSamples = []; // estimated F0 (Hz) per ~100ms window, voiced frames only
let pitchTimerId;
const audioCanvas = document.getElementById("audioCanvas");
const audioCtx2d = audioCanvas.getContext("2d");

// ---- Speech recognition (what the voice check-in primarily scores on) ----
// The voice check-in used to score purely on acoustic properties (energy,
// pitch/tone variation, pauses — no understanding of what was actually
// said). It now transcribes speech in English via the browser's built-in
// SpeechRecognition API and scores the *content* through the same
// analyseText() pipeline the text check-in uses (e.g. "today I am very
// happy" reads as low-risk), which is a much stronger signal than tone
// alone. Acoustic scoring is kept as an automatic fallback for browsers
// without speech-recognition support (notably Firefox) or if no speech
// was clearly picked up during the recording.
let speechRecognizer = null;
let voiceTranscriptFinal = "";
let voiceTranscriptInterim = "";
// Set once recording actually stops (button click) so the auto-restart
// logic below knows the difference between "browser ended the session on
// its own, keep going" and "user is done, leave it stopped".
let speechRecognitionShouldRun = false;

function createSpeechRecognizer() {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  // Match the recognizer's language to the active UI language (falls back
  // to English) — previously hardcoded to en-US, so Tamil speech was being
  // fed to an English recognizer and came out as garbage or nothing.
  rec.lang =
    typeof mindlensLang !== "undefined" && mindlensLang === "ta"
      ? "ta-IN"
      : "en-US";
  rec.continuous = true;
  rec.interimResults = true;
  return rec;
}

// Wires up a recognizer and starts it, with auto-restart. `continuous: true`
// does NOT guarantee the browser keeps the session open for the whole
// recording — Chrome in particular will end the session on its own after a
// couple of seconds of silence, on a network hiccup, or just because it
// feels like it. Previously there was no `onend` handler, so once that
// happened the transcript box kept saying "Listening…" while nothing more
// was actually being picked up for the rest of what the person said. Now we
// restart automatically for as long as recording is still in progress.
function startSpeechRecognition(transcriptEl) {
  const rec = createSpeechRecognizer();
  if (!rec) return null;

  speechRecognitionShouldRun = true;
  let lastStartAt = Date.now();
  let rapidRestartCount = 0;

  rec.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const chunk = event.results[i][0].transcript;
      if (event.results[i].isFinal) voiceTranscriptFinal += chunk + " ";
      else interim += chunk;
    }
    voiceTranscriptInterim = interim;
    if (transcriptEl) {
      transcriptEl.classList.remove("hidden", "unsupported");
      transcriptEl.textContent =
        (voiceTranscriptFinal + voiceTranscriptInterim).trim() ||
        "Listening…";
    }
  };
  rec.onerror = (e) => {
    console.warn("MindLens: speech recognition error", e.error);
    // "no-speech" (a pause) and "network" are transient — onend fires right
    // after and the restart below picks it back up. "not-allowed" / "aborted"
    // mean the mic access was revoked or we stopped it ourselves; don't
    // fight either of those.
    if (e.error === "not-allowed" || e.error === "aborted") {
      speechRecognitionShouldRun = false;
    }
  };
  rec.onend = () => {
    if (!speechRecognitionShouldRun || !recording) return;

    // Guard against a restart storm: on a repeat recording attempt in the
    // same page session, the browser's speech service can occasionally end
    // the session instantly, right after every restart, over and over.
    // Calling rec.start() straight back with no throttling turns that into
    // a tight synchronous-ish loop that pegs the main thread — which reads
    // as the whole voice section going laggy. If restarts are happening
    // faster than a real "browser gave up after a pause" would (under
    // ~700ms apart), back off; after a few of those in a row, stop trying
    // and just keep the acoustic-only scoring that already runs regardless.
    const now = Date.now();
    const gap = now - lastStartAt;
    lastStartAt = now;
    if (gap < 700) {
      rapidRestartCount++;
      if (rapidRestartCount >= 4) {
        speechRecognitionShouldRun = false;
        console.warn(
          "MindLens: speech recognition kept ending instantly on restart — giving up for this recording, falling back to acoustic-only scoring.",
        );
        return;
      }
    } else {
      rapidRestartCount = 0;
    }

    const delay = rapidRestartCount > 0 ? 400 : 0;
    setTimeout(() => {
      if (!speechRecognitionShouldRun || !recording) return;
      try {
        rec.start();
      } catch (e) {
        // Already starting, or genuinely can't — give up quietly rather than
        // looping forever.
      }
    }, delay);
  };

  try {
    rec.start();
    if (transcriptEl) {
      transcriptEl.classList.remove("hidden");
      transcriptEl.textContent = "Listening…";
    }
    return rec;
  } catch (e) {
    return null;
  }
}

// Real fundamental-frequency (pitch) estimate via time-domain autocorrelation,
// restricted to the typical human voice range (75-400Hz). This replaces the
// old zero-crossing-rate proxy, which only crudely correlated with pitch
// variation. Returns null for silent/unvoiced frames.
function estimatePitchHz(buf, sampleRate) {
  const n = buf.length;
  const c = new Float32Array(n);
  let rms = 0;
  for (let i = 0; i < n; i++) {
    c[i] = (buf[i] - 128) / 128;
    rms += c[i] * c[i];
  }
  rms = Math.sqrt(rms / n);
  if (rms < 0.02) return null; // treat as silence/noise floor

  const minLag = Math.floor(sampleRate / 400);
  const maxLag = Math.min(n - 1, Math.floor(sampleRate / 75));
  let bestLag = -1,
    bestCorr = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) sum += c[i] * c[i + lag];
    if (sum > bestCorr) {
      bestCorr = sum;
      bestLag = lag;
    }
  }
  if (bestLag <= 0 || bestCorr < n * 0.05) return null; // too weak a periodic signal to trust
  return sampleRate / bestLag;
}

function samplePitch() {
  if (!recording) return;
  const buf = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(buf);
  const f0 = estimatePitchHz(buf, audioCtx.sampleRate);
  if (f0) pitchSamples.push(f0);
}

// A small, fixed-weight dense network. IMPORTANT LIMITATION: this is
// literature-calibrated, not trained on labelled audio recordings —
// downloading a real speech-emotion corpus (e.g. RAVDESS, DAIC-WOZ)
// needs Kaggle/academic-request access this build environment can't
// reach. See /ml/train_audio_model_TEMPLATE.py for a ready-to-run
// script that trains real weights the moment you have such a dataset
// on your own machine; it exports to the same JSON format used by the
// text model above so it's a drop-in swap.
//
// The relative weighting below (loudness/energy and pitch-variability
// mattering somewhat more than raw pause ratio) follows effect sizes
// reported in speech-biomarker studies of depression, e.g. Wasserzug
// et al. 2024 (BMC Psychiatry) found large effects for pitch/loudness
// (partial eta-sq ~0.18-0.30) vs. moderate effects for temporal/pause
// features (~0.06-0.14); Cummins et al.'s review similarly finds
// reduced pitch variability and lower energy among the more consistent
// markers, with pause/timing measures adding a smaller but real signal.
// Inputs: [normalisedLowEnergy, normalisedMonotony, silenceRatio]
let audioNet = null;
function buildAudioNet() {
  if (audioNet) return audioNet;
  audioNet = tf.sequential();
  audioNet.add(
    tf.layers.dense({
      inputShape: [3],
      units: 4,
      activation: "relu",
      weights: [
        tf.tensor2d([
          [1, 0.7, 0.2, 0.15],
          [0.6, 1, 0.25, 0.2],
          [0.25, 0.3, 1, 0.5],
        ]),
        tf.tensor1d([0, 0, 0, 0]),
      ],
    }),
  );
  audioNet.add(
    tf.layers.dense({
      units: 1,
      activation: "sigmoid",
      weights: [
        tf.tensor2d([[0.85], [0.75], [0.45], [0.3]]),
        tf.tensor1d([-1.5]),
      ],
    }),
  );
  return audioNet;
}

// Data-trained audio model (exported by ml/train_audio_model_TEMPLATE.py)
let audioModel = null;
let audioModelFailed = false;
async function ensureTrainedAudioModel() {
  if (audioModel || audioModelFailed) return;
  try {
    const resp = await fetch("ml/export/audio_model.json");
    if (!resp.ok) throw new Error("not found");
    const candidate = await resp.json();
    // Guard against a degenerate/overfit model silently taking over scoring:
    // a std of ~0 on any feature means that feature had almost no variance
    // in the training set (e.g. placeholder/synthetic test audio, which has
    // constant volume and no silence — nothing like real speech), which
    // makes normalisation blow up to huge values and saturates the score
    // to 0 or 100 for virtually every real recording. A very small sample
    // count is the same problem in a different guise. Reject both rather
    // than trusting whatever happens to be in ml/export/.
    const stds = candidate.std || [];
    const looksDegenerate = stds.some(
      (s) => !isFinite(s) || Math.abs(s) < 1e-6,
    );
    const tooFewSamples =
      candidate.metrics && candidate.metrics.n && candidate.metrics.n < 50;
    if (looksDegenerate || tooFewSamples) {
      console.warn(
        "Ignoring ml/export/audio_model.json: looks untrained/overfit (degenerate std or n<50). Falling back to the literature-calibrated heuristic.",
      );
      throw new Error("degenerate model rejected");
    }
    audioModel = candidate;
  } catch (e) {
    audioModelFailed = true;
    audioModel = null;
  }
}

// Data-trained video model (exported by ml/train_video_model_TEMPLATE.py)
let videoModel = null;
let videoModelFailed = false;
async function ensureTrainedVideoModel() {
  if (videoModel || videoModelFailed) return;
  try {
    const resp = await fetch("ml/export/video_model.json");
    if (!resp.ok) throw new Error("not found");
    videoModel = await resp.json();
  } catch (e) {
    videoModelFailed = true;
    videoModel = null;
  }
}

const recordBtnEl = document.getElementById("recordBtn");
if (recordBtnEl)
  recordBtnEl.addEventListener("click", async () => {
    const btn = document.getElementById("recordBtn");
    const statusEl = document.getElementById("status-audio");

    if (!recording) {
      try {
        micStream = await requestMediaAccess("microphone", { audio: true });
      } catch (err) {
        const hint = permissionHint("microphone", err);
        document.getElementById("result-audio").innerHTML =
          `<div class="verdict" style="background:#F3EADA;color:#5b4a33;">We could not start the microphone.${hint || " Please allow microphone access and try again."}</div>`;
        return;
      }
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      // AudioContext is created after an `await` above (for mic permission),
      // not in the same synchronous tick as the click. Several browsers will
      // then start it `suspended` — especially on the 2nd/3rd run in the same
      // page session — which silently produces no real audio data rather
      // than an error. Explicitly resuming makes sure it's actually running
      // every time, not just the first.
      if (audioCtx.state === "suspended") {
        try {
          await audioCtx.resume();
        } catch (e) {}
      }
      const source = audioCtx.createMediaStreamSource(micStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);

      audioFrames = [];
      pitchSamples = [];
      audioSeconds = 0;
      recording = true;
      btn.textContent = t("record_stop");
      statusEl.textContent = t("status_recording");
      statusEl.classList.add("active");
      audioTimerId = setInterval(tickAudio, 1000);
      pitchTimerId = setInterval(samplePitch, 100);
      drawAudioLoop();

      // Start speech recognition, best-effort — recording still works fine
      // without it (falls back to acoustic-only scoring in stopAudioRecording).
      voiceTranscriptFinal = "";
      voiceTranscriptInterim = "";
      const transcriptEl = document.getElementById("voiceTranscript");
      speechRecognizer = startSpeechRecognition(transcriptEl);
      if (!speechRecognizer && transcriptEl) {
        transcriptEl.classList.remove("hidden");
        transcriptEl.classList.add("unsupported");
        transcriptEl.textContent =
          "Speech recognition isn't supported in this browser — scoring will fall back to acoustic features only. Try Chrome or Edge for speech-based scoring.";
      }
    } else {
      stopAudioRecording();
    }
  });

function tickAudio() {
  audioSeconds++;
  const m = String(Math.floor(audioSeconds / 60)).padStart(2, "0");
  const s = String(audioSeconds % 60).padStart(2, "0");
  document.getElementById("audioTimer").textContent = `${m}:${s}`;
  if (audioSeconds >= 20) stopAudioRecording();
}

function drawAudioLoop() {
  if (!recording) return;
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(data);

  // RMS energy for this frame
  let sumSquares = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128;
    sumSquares += v * v;
  }
  const rms = Math.sqrt(sumSquares / data.length);

  // zero crossing rate, a crude pitch-variation / monotony proxy
  let crossings = 0;
  for (let i = 1; i < data.length; i++) {
    if ((data[i - 1] - 128) * (data[i] - 128) < 0) crossings++;
  }

  // Frequency-domain features (spectral centroid + rolloff), reusing the
  // same AnalyserNode — mirrors the librosa.feature.spectral_centroid /
  // spectral_rolloff features the training template computes, so a
  // trained model's weights for these features are actually meaningful
  // against what the client measures, not just against training data.
  const freqData = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(freqData);
  const binHz = audioCtx.sampleRate / 2 / freqData.length;
  let magSum = 0,
    weightedSum = 0;
  for (let i = 0; i < freqData.length; i++) {
    magSum += freqData[i];
    weightedSum += freqData[i] * (i * binHz);
  }
  const spectralCentroid = magSum > 0 ? weightedSum / magSum : 0;
  let rolloffEnergy = 0,
    spectralRolloff = 0;
  const rolloffTarget = magSum * 0.85;
  for (let i = 0; i < freqData.length; i++) {
    rolloffEnergy += freqData[i];
    if (rolloffEnergy >= rolloffTarget) {
      spectralRolloff = i * binHz;
      break;
    }
  }

  audioFrames.push({ rms, crossings, spectralCentroid, spectralRolloff });

  // draw waveform
  audioCtx2d.clearRect(0, 0, audioCanvas.width, audioCanvas.height);
  audioCtx2d.strokeStyle = "#F4B942";
  audioCtx2d.lineWidth = 2;
  audioCtx2d.beginPath();
  const slice = audioCanvas.width / data.length;
  let x = 0;
  for (let i = 0; i < data.length; i++) {
    const y = (data[i] / 255) * audioCanvas.height;
    i === 0 ? audioCtx2d.moveTo(x, y) : audioCtx2d.lineTo(x, y);
    x += slice;
  }
  audioCtx2d.stroke();

  requestAnimationFrame(drawAudioLoop);
}

async function stopAudioRecording() {
  recording = false;
  clearInterval(audioTimerId);
  clearInterval(pitchTimerId);
  if (micStream) micStream.getTracks().forEach((t) => t.stop());
  if (audioCtx) {
    try {
      await audioCtx.close();
    } catch (e) {}
  }
  if (speechRecognizer) {
    speechRecognitionShouldRun = false;
    try {
      speechRecognizer.stop();
    } catch (e) {}
    // onresult can still land a moment after stop() — a short pause here
    // lets the final transcript settle before we score it, instead of
    // scoring whatever partial text happened to exist at the exact
    // millisecond the button was clicked.
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  document.getElementById("recordBtn").textContent = t("record_start");
  await scoreAndRenderAudio();
}

// Scores whatever is currently sitting in audioFrames / pitchSamples /
// audioSeconds (plus voiceTranscriptFinal/Interim, if any) and renders the
// result. Shared by the live "stop recording" flow above and by the
// "upload a voice recording" flow below, so both paths get identical
// scoring logic and the same suggested-next-steps treatment.
async function scoreAndRenderAudio() {
  const statusEl = document.getElementById("status-audio");
  statusEl.textContent = t("status_done");
  statusEl.classList.remove("active");
  statusEl.classList.add("done");

  if (audioFrames.length < 10) {
    document.getElementById("result-audio").innerHTML =
      `<div class="verdict" style="background:#F3EADA;color:#5b4a33;">That recording was too short to analyse. Try 10+ seconds of clear speech.</div>`;
    return;
  }

  const avgRms =
    audioFrames.reduce((a, f) => a + f.rms, 0) / audioFrames.length;
  const silentFrames = audioFrames.filter((f) => f.rms < 0.02).length;
  const silenceRatio = silentFrames / audioFrames.length;

  // estimate zero-crossing rate (normalized)
  const avgCross =
    audioFrames.reduce((a, f) => a + f.crossings, 0) / audioFrames.length;
  const frameLen =
    analyser && analyser.frequencyBinCount ? analyser.frequencyBinCount : 512;
  const avgZcr = avgCross / frameLen;

  // pitch std in Hz
  let pitchStdHz = 0;
  if (pitchSamples.length >= 5) {
    const meanF0 =
      pitchSamples.reduce((a, f) => a + f, 0) / pitchSamples.length;
    const variance =
      pitchSamples.reduce((a, f) => a + (f - meanF0) * (f - meanF0), 0) /
      pitchSamples.length;
    pitchStdHz = Math.sqrt(variance);
  }

  const peakRms = Math.max(0.001, ...audioFrames.map((f) => f.rms));

  // Extra features to match ml/train_audio_model_TEMPLATE.py's richer
  // eGeMAPS-style feature set, so a model trained with that template's
  // 9-feature vector is scored against genuinely comparable client-side
  // measurements rather than silently truncating to its first 4 weights.
  const avgSpectralCentroid =
    audioFrames.reduce((a, f) => a + f.spectralCentroid, 0) /
    audioFrames.length;
  const avgSpectralRolloff =
    audioFrames.reduce((a, f) => a + f.spectralRolloff, 0) / audioFrames.length;
  // jitter: mean absolute frame-to-frame pitch change, normalized by mean
  // pitch (voice tremor/instability proxy)
  let jitter = 0;
  if (pitchSamples.length >= 6) {
    const meanF0 =
      pitchSamples.reduce((a, f) => a + f, 0) / pitchSamples.length;
    let diffSum = 0;
    for (let i = 1; i < pitchSamples.length; i++)
      diffSum += Math.abs(pitchSamples[i] - pitchSamples[i - 1]);
    jitter = diffSum / (pitchSamples.length - 1) / (meanF0 + 1e-9);
  }
  // shimmer: mean absolute frame-to-frame RMS (amplitude) change,
  // normalized by mean RMS — amplitude-domain counterpart to jitter
  let shimmerDiffSum = 0;
  for (let i = 1; i < audioFrames.length; i++)
    shimmerDiffSum += Math.abs(audioFrames[i].rms - audioFrames[i - 1].rms);
  const shimmer =
    shimmerDiffSum / Math.max(1, audioFrames.length - 1) / (avgRms + 1e-9);
  // speech rate proxy: fraction of ~100ms pitch-sampling windows that
  // were voiced (samplePitch only pushes a value when voiced) — matches
  // librosa.pyin's voiced_flag mean in the training template
  const pitchAttempts = Math.max(1, Math.round(audioSeconds * 10));
  const speechRate = Math.min(1, pitchSamples.length / pitchAttempts);

  // Adaptive "low energy" threshold instead of a fixed 0.09. Normalized RMS
  // from getByteTimeDomainData for ordinary conversational speech through a
  // laptop/phone mic typically sits around ~0.03-0.07, not ~0.09 — the old
  // fixed threshold meant almost any normal-volume recording read as "low
  // energy," which is why scores were clustering at 90-100 across the
  // board regardless of who was speaking. Floating the threshold off this
  // recording's own peak level adapts to mic gain/distance/device, which
  // varies far more between setups than between speakers.
  const quietThreshold = Math.max(0.035, peakRms * 0.45);
  const lowEnergy = Math.max(
    0,
    Math.min(1, (quietThreshold - avgRms) / quietThreshold),
  );

  // Pitch (tonal) variability, in semitones, from real autocorrelation-based
  // F0 tracking (see estimatePitchHz above) — normalising to semitones
  // means the measure reflects *relative* variation and isn't skewed by
  // someone's absolute vocal register. Typical natural conversational
  // speech has a semitone SD of roughly 3-5 (the earlier 2-4 estimate was
  // on the low side and, combined with the low-energy bug above, was
  // another contributor to scores maxing out); a flatter, more monotone
  // voice (one of the more consistent speech-biomarker correlates of low
  // mood — see Cummins et al.'s review) sits noticeably lower than that.
  let monotony;
  if (pitchSamples.length >= 8) {
    const meanF0 =
      pitchSamples.reduce((a, f) => a + f, 0) / pitchSamples.length;
    const semitones = pitchSamples.map((f) => 12 * Math.log2(f / meanF0));
    const variance =
      semitones.reduce((a, s) => a + s * s, 0) / semitones.length;
    const semitoneSD = Math.sqrt(variance);
    // Gender-calibrated semitone baseline: small heuristic to account for
    // different pitch distributions in demo data (NOT clinical, and not
    // language/accent-specific — pitch *variability* patterns don't have a
    // well-established per-language correction factor, so this stays a
    // general baseline rather than an invented "Indian" adjustment).
    const gender = (
      document.getElementById("genderSelect") || { value: "unspecified" }
    ).value;
    const semitoneBaseline =
      gender === "boy" ? 3.4 : gender === "girl" ? 2.9 : 3.2;
    monotony = Math.max(
      0,
      Math.min(1, (semitoneBaseline - semitoneSD) / semitoneBaseline),
    );
  } else {
    // Not enough clearly-voiced frames to track pitch reliably (e.g. a
    // noisy room or very quiet recording) — fall back to a rougher
    // zero-crossing-rate proxy rather than guessing. It's a weaker signal,
    // so its contribution is capped rather than allowed to swing to 1.
    const avgCross =
      audioFrames.reduce((a, f) => a + f.crossings, 0) / audioFrames.length;
    monotony = Math.max(0, Math.min(0.6, (55 - avgCross) / 55));
  }

  // Attempt to use a data-trained audio model if available
  await ensureTrainedAudioModel();
  let score;
  if (audioModel) {
    try {
      // feature order expected: [rms, zcr, silence_ratio, pitch_std,
      // spectral_centroid, spectral_rolloff, jitter, shimmer, speech_rate]
      // — older models exported with only the first 4 still work fine,
      // since the dot-product loop below is bounded by weights.length.
      const x = [
        avgRms,
        avgZcr,
        silenceRatio,
        pitchStdHz,
        avgSpectralCentroid,
        avgSpectralRolloff,
        jitter,
        shimmer,
        speechRate,
      ];
      const mean = audioModel.mean || [0, 0, 0, 0, 0, 0, 0, 0, 0];
      const std = audioModel.std || [1, 1, 1, 1, 1, 1, 1, 1, 1];
      const weights = audioModel.weights || audioModel.coef_ || [];
      const bias = audioModel.bias || 0;
      let z = bias;
      for (let i = 0; i < weights.length && i < x.length; i++) {
        const xn = (x[i] - (mean[i] || 0)) / (std[i] || 1e-9);
        z += weights[i] * xn;
      }
      const prob = 1 / (1 + Math.exp(-z));
      score = Math.round(prob * 100);
    } catch (e) {
      score = Math.round(lowEnergy * 40 + monotony * 35 + silenceRatio * 25);
    }
  } else {
    try {
      const net = buildAudioNet();
      const prob = tf.tidy(() => {
        const input = tf.tensor2d([[lowEnergy, monotony, silenceRatio]]);
        return net.predict(input).dataSync()[0];
      });
      score = Math.round(prob * 100);
    } catch (e) {
      // fallback to a direct weighted formula if TensorFlow.js failed to load
      score = Math.round(lowEnergy * 40 + monotony * 35 + silenceRatio * 25);
    }
  }
  score = Math.max(0, Math.min(100, score));

  // Debug readout — open the browser console (F12) after recording to see
  // exactly what fed into the acoustic score. Share these numbers if the
  // score still looks off; adjusting thresholds without seeing real values
  // is just guessing again, which is how the last two "fixes" ended up
  // incomplete.
  console.log("[MindLens audio debug]", {
    avgRms: +avgRms.toFixed(4),
    peakRms: +peakRms.toFixed(4),
    quietThreshold: +quietThreshold.toFixed(4),
    lowEnergy: +lowEnergy.toFixed(3),
    pitchSamplesUsed: pitchSamples.length,
    monotony: +monotony.toFixed(3),
    silenceRatio: +silenceRatio.toFixed(3),
    usedTrainedModel: !!audioModel,
    acousticScore: score,
  });

  // Primary path: score what was actually SAID, via speech recognition +
  // the same text-understanding pipeline (analyseText) the text check-in
  // uses. This is what "today I am very happy" reads as low-risk, rather
  // than just measuring tone/energy. Falls back to the acoustic score
  // above if speech recognition isn't supported, or nothing was clearly
  // transcribed (e.g. very quiet/noisy recording).
  const transcript = (
    voiceTranscriptFinal +
    " " +
    voiceTranscriptInterim
  ).trim();
  const transcriptWordCount = transcript
    ? transcript.split(/\s+/).filter(Boolean).length
    : 0;

  let finalScore = score;
  let method =
    "acoustic features only (energy, tone, pauses) — no clear speech detected";
  let hits = [];
  let crisisFlag = false;
  let usedSpeechContent = false;

  if (transcriptWordCount >= 3) {
    try {
      const analysis = await analyseText(transcript);
      finalScore = analysis.score;
      hits = analysis.hits || [];
      crisisFlag = analysis.crisisFlag || false;
      method = `speech recognition + text understanding (${analysis.method})`;
      usedSpeechContent = true;
    } catch (e) {
      console.warn(
        "MindLens: speech-based scoring failed, using acoustic fallback",
        e,
      );
    }
  }

  console.log("[MindLens voice debug]", {
    transcript,
    transcriptWordCount,
    usedSpeechContent,
    finalScore,
  });

  state.scores.audio = finalScore;
  const band = bandFor(finalScore);
  const transcriptPreview =
    transcript.length > 160 ? transcript.slice(0, 160) + "…" : transcript;
  const domainList = usedSpeechContent
    ? hits.length
      ? `Signals noticed in what you said: ${hits.slice(0, 6).join(", ")}.`
      : `Understood: "${escapeHtml(transcriptPreview)}"`
    : `Speech wasn't clearly picked up, so this used acoustic tone/energy only. Live recordings do best a little louder/closer to the mic, in English; uploaded files are always scored on tone/energy since speech recognition only runs during a live recording.`;
  const picks = pickRecommendations(band.label, 2);

  document.getElementById("result-audio").innerHTML =
    `<div class="verdict" style="background:${band.bg};color:${band.fg};">
      ${band.label} risk indicator — ${finalScore}/100<br>
      <span style="font-weight:400;font-size:0.82rem;">${domainList} (${method})</span>
    </div>
    <div class="plate-solution">
      <h4>Suggested next step${picks.length > 1 ? "s" : ""}</h4>
      <ul>${picks.map((tip) => `<li>${escapeHtml(tip)}</li>`).join("")}</ul>
    </div>`;

  if (crisisFlag) showCrisisBanner();
  updateDashboard();
}

// Decodes an uploaded audio file and computes the same per-frame features
// (rms, zero-crossings, spectral centroid/rolloff) that the live recording
// collects in drawAudioLoop(), plus a pitch (F0) track, so scoreAndRenderAudio()
// can score a file exactly the way it scores a live recording. Runs as a
// batch of tensor ops rather than in real time, so it works regardless of
// how long the uploaded clip is.
async function extractAudioFileFeatures(arrayBuffer) {
  const MAX_SECONDS = 45; // cap so a long file still analyses in a couple of seconds
  const FRAME_SIZE = 2048;

  const decodeCtx = new (window.AudioContext || window.webkitAudioContext)();
  let audioBuffer;
  try {
    audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
  } finally {
    try {
      decodeCtx.close();
    } catch (e) {}
  }

  const sampleRate = audioBuffer.sampleRate;
  const totalSamples = Math.min(
    audioBuffer.length,
    Math.floor(MAX_SECONDS * sampleRate),
  );
  const numFrames = Math.floor(totalSamples / FRAME_SIZE);
  if (numFrames < 3) return null; // too short to say anything meaningful

  // Downmix all channels to mono.
  const mono = new Float32Array(totalSamples);
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < totalSamples; i++) mono[i] += data[i];
  }
  if (audioBuffer.numberOfChannels > 1) {
    for (let i = 0; i < totalSamples; i++)
      mono[i] /= audioBuffer.numberOfChannels;
  }

  // Hann-windowed frame matrix, batched through tf.js for the frequency-
  // domain features (spectral centroid + rolloff), mirroring what
  // drawAudioLoop() computes per-frame live via the AnalyserNode.
  const hann = new Float32Array(FRAME_SIZE);
  for (let i = 0; i < FRAME_SIZE; i++)
    hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME_SIZE - 1));
  const framesFlat = new Float32Array(numFrames * FRAME_SIZE);
  for (let f = 0; f < numFrames; f++) {
    const start = f * FRAME_SIZE;
    for (let i = 0; i < FRAME_SIZE; i++) {
      framesFlat[f * FRAME_SIZE + i] = mono[start + i] * hann[i];
    }
  }

  const { rmsArr, crossingsArr, centroidArr, rolloffArr } = tf.tidy(() => {
    const frames = tf.tensor2d(framesFlat, [numFrames, FRAME_SIZE]);
    const rms = tf.sqrt(tf.mean(tf.square(frames), 1));

    const signs = tf.sign(frames);
    const a = signs.slice([0, 0], [numFrames, FRAME_SIZE - 1]);
    const b = signs.slice([0, 1], [numFrames, FRAME_SIZE - 1]);
    const crossings = tf.sum(
      tf.cast(tf.less(tf.mul(a, b), 0), "float32"),
      1,
    );

    const mag = tf.abs(tf.spectral.rfft(frames)); // [numFrames, FRAME_SIZE/2+1]
    const binHz = sampleRate / FRAME_SIZE;
    const bins = mag.shape[1];
    const freqs = tf.tensor1d(
      Array.from({ length: bins }, (_, i) => i * binHz),
    );
    const magSum = tf.sum(mag, 1);
    const weighted = tf.sum(tf.mul(mag, freqs), 1);
    const centroid = tf.div(weighted, tf.add(magSum, 1e-9));

    const cum = tf.cumsum(mag, 1);
    const target = tf.mul(tf.sum(mag, 1, true), 0.85);
    const mask = tf.cast(tf.greaterEqual(cum, target), "int32");
    const rolloff = tf.mul(
      tf.cast(tf.argMax(mask, 1), "float32"),
      binHz,
    );

    return {
      rmsArr: Array.from(rms.dataSync()),
      crossingsArr: Array.from(crossings.dataSync()),
      centroidArr: Array.from(centroid.dataSync()),
      rolloffArr: Array.from(rolloff.dataSync()),
    };
  });

  // Pitch (F0) via the exact same autocorrelation estimatePitchHz() used
  // live, so a file is scored on a comparable basis to a live recording.
  // Subsampled (every 4th frame) — autocorrelation is O(n·lag) per frame
  // and doesn't vectorise the way the features above do, so running it on
  // every single frame of a long file would be needlessly slow.
  const pitchVals = [];
  const PITCH_STRIDE = 4;
  const byteBuf = new Uint8Array(FRAME_SIZE);
  for (let f = 0; f < numFrames; f += PITCH_STRIDE) {
    const start = f * FRAME_SIZE;
    for (let i = 0; i < FRAME_SIZE; i++) {
      const v = Math.max(-1, Math.min(1, mono[start + i] || 0));
      byteBuf[i] = Math.round(v * 128 + 128);
    }
    const f0 = estimatePitchHz(byteBuf, sampleRate);
    if (f0) pitchVals.push(f0);
  }

  const frames = [];
  for (let f = 0; f < numFrames; f++) {
    frames.push({
      rms: rmsArr[f],
      crossings: crossingsArr[f],
      spectralCentroid: centroidArr[f],
      spectralRolloff: rolloffArr[f],
    });
  }

  return {
    frames,
    pitchSamples: pitchVals,
    durationSeconds: totalSamples / sampleRate,
  };
}

// "Upload a voice recording": lets someone score an existing audio file
// instead of recording live. Speech recognition can't run against an
// arbitrary file in the browser (the Web Speech API only listens to a live
// mic), so this always lands on the acoustic-tone scoring path — the same
// fallback path a live recording uses when speech isn't picked up clearly.
const audioUploadBtnEl = document.getElementById("audioUploadBtn");
const audioFileInputEl = document.getElementById("audioFileInput");
if (audioUploadBtnEl && audioFileInputEl) {
  audioUploadBtnEl.addEventListener("click", async () => {
    if (recording) await stopAudioRecording();
    audioFileInputEl.click();
  });

  audioFileInputEl.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    audioFileInputEl.value = ""; // allow re-picking the same file later
    if (!file) return;

    const resultBox = document.getElementById("result-audio");
    const statusEl = document.getElementById("status-audio");
    audioUploadBtnEl.disabled = true;
    const originalLabel = audioUploadBtnEl.textContent;
    audioUploadBtnEl.textContent = "Analysing…";
    statusEl.textContent = t("status_analyzing");
    statusEl.classList.add("active");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const features = await extractAudioFileFeatures(arrayBuffer);
      if (!features) {
        resultBox.innerHTML = `<div class="verdict" style="background:#F3EADA;color:#5b4a33;">That file was too short to analyse. Try a recording of 10+ seconds.</div>`;
        statusEl.classList.remove("active");
        return;
      }

      // Feed the shared scorer the same globals a live recording leaves
      // behind, minus a transcript (none exists for an uploaded file).
      audioFrames = features.frames;
      pitchSamples = features.pitchSamples;
      audioSeconds = features.durationSeconds;
      voiceTranscriptFinal = "";
      voiceTranscriptInterim = "";

      await scoreAndRenderAudio();
    } catch (err) {
      console.warn("MindLens: could not analyse uploaded audio file", err);
      resultBox.innerHTML = `<div class="verdict" style="background:#F3EADA;color:#5b4a33;">We couldn't read that as an audio file. Please try a common format like MP3, WAV, M4A, or OGG.</div>`;
      statusEl.classList.remove("active");
    } finally {
      audioUploadBtnEl.disabled = false;
      audioUploadBtnEl.textContent = originalLabel;
    }
  });
}

/* ==========================================================
   3. VIDEO ANALYSIS — face-api.js deep convolutional networks
   (TinyFaceDetector + FaceExpressionNet) reading facial
   expression from a single photo, either captured with the
   camera or uploaded from the user's device.
   ========================================================== */
// Models are served from the project itself (./models) rather than the
// justadudewhohacks/face-api.js "@master" branch on jsdelivr's GitHub
// proxy. That URL was the source of the "stuck on Analysing…" bug: on a
// slow/flaky connection (or when jsdelivr's GitHub proxy is momentarily
// unreachable, which happens) the loadFromUri() fetches could hang for a
// long time with no error surfaced, since nothing was timing them out.
// Hosting the ~530KB of weights locally removes that external dependency
// entirely — it's faster, works offline once loaded, and can never hang
// on a third-party CDN.
const MODEL_URL = "models";
let videoStream,
  cameraActive = false;
const videoEl = document.getElementById("videoFeed");
const overlay = document.getElementById("videoOverlay");
const faceOverlayCtx = overlay?.getContext("2d");
const videoWrapEl = document.getElementById("videoWrap");
const videoImagePreviewEl = document.getElementById("videoImagePreview");
const videoFrameGuideEl = document.querySelector(".video-frame-guide");
let modelsLoaded = false;
let faceTrackingRaf = null;
let faceTrackingActive = false;
let faceTrackingFramePending = false;
let liveAnalysisBusy = false;
let lastFaceTrackTime = 0;
let lastAnalyzeTime = 0;
let smoothedFaceBox = null;
const FACE_TRACK_INPUT_SIZE = 224;
const FACE_TRACK_INTERVAL_MS = 120;
const LIVE_ANALYZE_INTERVAL_MS = 1200;
const faceTrackCanvas = document.createElement("canvas");
const faceTrackCtx = faceTrackCanvas.getContext("2d");

function drawFaceOverlay(box) {
  if (!faceOverlayCtx || !overlay) return;
  const width = (overlay.width = videoEl.videoWidth);
  const height = (overlay.height = videoEl.videoHeight);
  faceOverlayCtx.clearRect(0, 0, width, height);

  if (!box) {
    return;
  }

  faceOverlayCtx.strokeStyle = "rgba(68, 181, 167, 0.95)";
  faceOverlayCtx.lineWidth = Math.max(
    2,
    Math.round(Math.min(width, height) * 0.007),
  );
  faceOverlayCtx.setLineDash([10, 6]);
  faceOverlayCtx.strokeRect(box.x, box.y, box.width, box.height);
  faceOverlayCtx.fillStyle = "rgba(68, 181, 167, 0.16)";
  faceOverlayCtx.fillRect(box.x, box.y, box.width, box.height);

  const eyeY = box.y + box.height * 0.28;
  const eyeWidth = Math.max(14, box.width * 0.18);
  const eyeHeight = Math.max(4, box.height * 0.012);
  const eyeOffset = box.width * 0.16;
  faceOverlayCtx.setLineDash([]);
  faceOverlayCtx.fillStyle = "rgba(68, 181, 167, 0.88)";
  faceOverlayCtx.fillRect(box.x + eyeOffset, eyeY, eyeWidth, eyeHeight);
  faceOverlayCtx.fillRect(
    box.x + box.width - eyeOffset - eyeWidth,
    eyeY,
    eyeWidth,
    eyeHeight,
  );
}

function updateFaceGuide(box) {
  if (!videoFrameGuideEl || !videoWrapEl || !overlay) return;
  if (!box) {
    videoFrameGuideEl.classList.remove("visible");
    videoFrameGuideEl.style.visibility = "hidden";
    videoFrameGuideEl.style.left = "";
    videoFrameGuideEl.style.top = "";
    videoFrameGuideEl.style.width = "";
    videoFrameGuideEl.style.height = "";
    return;
  }

  const overlayWidth = overlay.width || videoEl.videoWidth;
  const overlayHeight = overlay.height || videoEl.videoHeight;
  const displayWidth = videoWrapEl.clientWidth;
  const displayHeight = videoWrapEl.clientHeight;
  if (!overlayWidth || !overlayHeight || !displayWidth || !displayHeight)
    return;

  const guideWidth = (box.width / overlayWidth) * displayWidth;
  const guideHeight = (box.height / overlayHeight) * displayHeight;
  const guideLeft =
    displayWidth - (box.x / overlayWidth) * displayWidth - guideWidth;
  const guideTop = (box.y / overlayHeight) * displayHeight;

  videoFrameGuideEl.style.left = `${guideLeft}px`;
  videoFrameGuideEl.style.top = `${guideTop}px`;
  videoFrameGuideEl.style.width = `${guideWidth}px`;
  videoFrameGuideEl.style.height = `${guideHeight}px`;
  videoFrameGuideEl.style.visibility = "visible";
  videoFrameGuideEl.classList.add("visible");
}

function smoothFaceBox(box) {
  if (!box) {
    smoothedFaceBox = null;
    return null;
  }
  if (!smoothedFaceBox) {
    smoothedFaceBox = box;
    return box;
  }
  const smoothing = 0.22;
  smoothedFaceBox = {
    x: smoothedFaceBox.x + (box.x - smoothedFaceBox.x) * smoothing,
    y: smoothedFaceBox.y + (box.y - smoothedFaceBox.y) * smoothing,
    width:
      smoothedFaceBox.width + (box.width - smoothedFaceBox.width) * smoothing,
    height:
      smoothedFaceBox.height +
      (box.height - smoothedFaceBox.height) * smoothing,
  };
  return smoothedFaceBox;
}

async function runFaceTrackingFrame() {
  if (!faceTrackingActive || !cameraActive) return;
  if (!faceTrackCtx || !videoEl.videoWidth || !videoEl.videoHeight) return;

  const sourceWidth = videoEl.videoWidth;
  const sourceHeight = videoEl.videoHeight;
  const scale = FACE_TRACK_INPUT_SIZE / Math.max(sourceWidth, sourceHeight);
  faceTrackCanvas.width = Math.round(sourceWidth * scale);
  faceTrackCanvas.height = Math.round(sourceHeight * scale);

  faceTrackCtx.clearRect(0, 0, faceTrackCanvas.width, faceTrackCanvas.height);
  faceTrackCtx.drawImage(
    videoEl,
    0,
    0,
    faceTrackCanvas.width,
    faceTrackCanvas.height,
  );

  try {
    const detection = await faceapi.detectSingleFace(
      faceTrackCanvas,
      new faceapi.TinyFaceDetectorOptions({
        inputSize: FACE_TRACK_INPUT_SIZE,
        scoreThreshold: 0.35,
      }),
    );

    if (detection?.box) {
      const scaleX = sourceWidth / faceTrackCanvas.width;
      const scaleY = sourceHeight / faceTrackCanvas.height;
      const rawBox = {
        x: detection.box.x * scaleX,
        y: detection.box.y * scaleY,
        width: detection.box.width * scaleX,
        height: detection.box.height * scaleY,
      };
      const box = smoothFaceBox(rawBox);
      drawFaceOverlay(box);
    } else {
      drawFaceOverlay(null);
    }
  } catch (error) {
    console.warn("MindLens: face tracking error", error);
    drawFaceOverlay(null);
  }
}

async function runFaceTrackingFrame() {
  if (!faceTrackingActive || !cameraActive) return;
  if (!faceTrackCtx || !videoEl.videoWidth || !videoEl.videoHeight) return;

  const sourceWidth = videoEl.videoWidth;
  const sourceHeight = videoEl.videoHeight;
  const targetSize = 416;
  const scale = targetSize / Math.max(sourceWidth, sourceHeight);
  faceTrackCanvas.width = Math.round(sourceWidth * scale);
  faceTrackCanvas.height = Math.round(sourceHeight * scale);

  faceTrackCtx.clearRect(0, 0, faceTrackCanvas.width, faceTrackCanvas.height);
  faceTrackCtx.drawImage(
    videoEl,
    0,
    0,
    faceTrackCanvas.width,
    faceTrackCanvas.height,
  );

  const detection = await faceapi.detectSingleFace(
    faceTrackCanvas,
    new faceapi.TinyFaceDetectorOptions({
      inputSize: 416,
      scoreThreshold: 0.4,
    }),
  );

  if (detection?.box) {
    const scaleX = sourceWidth / faceTrackCanvas.width;
    const scaleY = sourceHeight / faceTrackCanvas.height;
    const mappedBox = {
      x:
        sourceWidth - (detection.box.x * scaleX + detection.box.width * scaleX),
      y: detection.box.y * scaleY,
      width: detection.box.width * scaleX,
      height: detection.box.height * scaleY,
    };
    drawFaceOverlay(mappedBox);
    updateFaceGuide(mappedBox);
  } else {
    drawFaceOverlay(null);
    updateFaceGuide(null);
  }
}

function startFaceTrackingLoop() {
  if (!faceTrackingActive || faceTrackingRaf) return;

  const step = async () => {
    if (!faceTrackingActive || !cameraActive) {
      faceTrackingRaf = null;
      return;
    }
    if (!faceTrackingFramePending) {
      faceTrackingFramePending = true;
      try {
        await runFaceTrackingFrame();
      } catch (error) {
        console.warn("MindLens: face tracking loop error", error);
      } finally {
        faceTrackingFramePending = false;
      }
    }
    faceTrackingRaf = requestAnimationFrame(step);
  };

  faceTrackingRaf = requestAnimationFrame(step);
}

function stopFaceTrackingLoop() {
  if (faceTrackingRaf) {
    cancelAnimationFrame(faceTrackingRaf);
    faceTrackingRaf = null;
  }
}

function activateFaceTracking() {
  faceTrackingActive = true;
  if (overlay && videoEl.videoWidth && videoEl.videoHeight) {
    overlay.width = videoEl.videoWidth;
    overlay.height = videoEl.videoHeight;
    faceOverlayCtx?.clearRect(0, 0, overlay.width, overlay.height);
  }
  startFaceTrackingLoop();
}

function deactivateFaceTracking() {
  faceTrackingActive = false;
  stopFaceTrackingLoop();
  if (faceOverlayCtx && overlay) {
    faceOverlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  }
}

// Below this Laplacian-variance value a photo is judged too blurry (motion
// blur, soft focus, heavy compression) to trust.
const BLUR_VARIANCE_MIN = 18;

// Offscreen canvas used to feed a brightness/contrast-corrected copy of the
// photo into face-api. Webcam snapshots and phone photos are frequently
// dim, low-contrast, or slightly soft, all of which hurt TinyFaceDetector's
// confidence — a lightweight, one-off correction here noticeably improves
// detection reliability.
const enhanceCanvas = document.createElement("canvas");
const enhanceCtx = enhanceCanvas.getContext("2d", { willReadFrequently: true });

// Small offscreen canvas used purely to compute cheap brightness + sharpness
// metrics on the photo. Kept tiny (96x96) so this stays fast even on a
// large uploaded image.
const metricCanvas = document.createElement("canvas");
const metricCtx = metricCanvas.getContext("2d", { willReadFrequently: true });
const METRIC_SIZE = 96;

function updateVideoQualityHint(text, warn) {
  const el = document.getElementById("videoQualityHint");
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("warn", !!warn);
}

// Try a few resolutions from best to most compatible, highest first. Built-
// in laptop/phone cameras vary a lot in what they'll actually deliver;
// asking for a sharp source image first gives the detector far more to
// work with, and we fall back gracefully so the camera still starts on
// older or more limited hardware.
async function getCameraStream() {
  const attempts = [
    {
      video: {
        facingMode: "user",
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    },
    {
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    },
    {
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    },
    { video: { facingMode: "user" } },
    { video: true },
  ];
  let lastErr;
  for (const constraints of attempts) {
    try {
      return await requestMediaAccess("camera", constraints);
    } catch (err) {
      lastErr = err;
      // A denied permission won't be fixed by relaxing constraints — stop immediately
      // instead of prompting the user again on every fallback attempt.
      if (/NotAllowedError|PermissionDenied/i.test(err?.name || "")) throw err;
    }
  }
  throw lastErr;
}

// Best-effort: ask the camera to focus and expose continuously right up
// until the photo is captured, which matters a lot for a laptop lid webcam
// that otherwise locks onto whatever was in frame when it started. Not
// every device/browser exposes these controls, so failures here are
// silently ignored.
async function optimizeCameraTrack(stream) {
  const track = stream.getVideoTracks()[0];
  if (!track || typeof track.getCapabilities !== "function") return;
  try {
    const caps = track.getCapabilities();
    const advanced = {};
    if (caps.focusMode && caps.focusMode.includes("continuous"))
      advanced.focusMode = "continuous";
    if (caps.exposureMode && caps.exposureMode.includes("continuous"))
      advanced.exposureMode = "continuous";
    if (caps.whiteBalanceMode && caps.whiteBalanceMode.includes("continuous"))
      advanced.whiteBalanceMode = "continuous";
    if (Object.keys(advanced).length)
      await track.applyConstraints({ advanced: [advanced] });
  } catch (e) {
    /* not all webcams/browsers support these controls — safe to ignore */
  }
}

// Starting to sample the instant getUserMedia() resolves means the first
// second or two are frequently soft/dim, because the camera is still
// racking focus and hunting for exposure — this waits for the very first
// real frame, then gives autofocus/auto-exposure a short, fixed settle
// window before the "Capture photo" button becomes usable.
function waitForCameraSettle() {
  return new Promise((resolve) => {
    const proceed = () => setTimeout(resolve, 700);
    if (videoEl.readyState >= 2 && videoEl.videoWidth) proceed();
    else videoEl.addEventListener("loadeddata", proceed, { once: true });
  });
}

// Computes two cheap metrics from any image/canvas source: average
// brightness, and a Laplacian-variance sharpness proxy. Sharpness is
// measured on the RAW image, not a contrast-enhanced copy, so the
// enhancement filter can't mask real blur.
function computeImageMetrics(source, w, h) {
  if (!w || !h) return null;
  metricCanvas.width = METRIC_SIZE;
  metricCanvas.height = METRIC_SIZE;
  try {
    metricCtx.drawImage(source, 0, 0, w, h, 0, 0, METRIC_SIZE, METRIC_SIZE);
    const data = metricCtx.getImageData(0, 0, METRIC_SIZE, METRIC_SIZE).data;
    const gray = new Float32Array(METRIC_SIZE * METRIC_SIZE);
    let sum = 0;
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const g = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      gray[p] = g;
      sum += g;
    }
    const brightness = sum / gray.length;

    // Laplacian variance: a sharp image has a lot of high-frequency edge
    // energy, a blurry one collapses toward a flat/uniform response.
    let lapSum = 0,
      lapSumSq = 0,
      n = 0;
    for (let y = 1; y < METRIC_SIZE - 1; y++) {
      for (let x = 1; x < METRIC_SIZE - 1; x++) {
        const i = y * METRIC_SIZE + x;
        const lap =
          4 * gray[i] -
          gray[i - 1] -
          gray[i + 1] -
          gray[i - METRIC_SIZE] -
          gray[i + METRIC_SIZE];
        lapSum += lap;
        lapSumSq += lap * lap;
        n++;
      }
    }
    const mean = lapSum / n;
    const sharpness = lapSumSq / n - mean * mean;
    return { brightness, sharpness };
  } catch (e) {
    return null;
  }
}

// Draws a brightness/contrast-corrected copy of the photo for face-api to
// read, adapting the correction to how dark or blown-out the image
// actually is — rather than one fixed correction that only helps a narrow
// range of lighting.
function getEnhancedImage(source, w, h, metrics) {
  if (!w || !h) return source;
  try {
    enhanceCanvas.width = w;
    enhanceCanvas.height = h;

    let brightnessAdj = 1.12,
      contrastAdj = 1.15;
    if (metrics) {
      if (metrics.brightness < 70) {
        brightnessAdj = 1.45;
        contrastAdj = 1.3;
      } else if (metrics.brightness < 100) {
        brightnessAdj = 1.28;
        contrastAdj = 1.22;
      } else if (metrics.brightness > 200) {
        brightnessAdj = 0.85;
        contrastAdj = 1.1;
      } else if (metrics.brightness > 180) {
        brightnessAdj = 0.95;
        contrastAdj = 1.1;
      }
    }
    enhanceCtx.filter = `contrast(${contrastAdj}) brightness(${brightnessAdj}) saturate(1.05)`;
    enhanceCtx.drawImage(source, 0, 0, w, h);
    return enhanceCanvas;
  } catch (e) {
    // A tainted/cross-origin canvas or an odd source object can throw here
    // (e.g. SecurityError). Rather than let that surface as an opaque
    // failure deep in the pipeline, fall back to feeding face-api the raw,
    // un-enhanced source directly.
    console.warn("MindLens: image enhancement failed, using raw source", e);
    return source;
  }
}

// Rejects with an error after `ms` if `promise` hasn't settled yet, so a
// stalled network request can never leave the UI stuck on "Analysing…"
// forever — it surfaces as a clear, catchable timeout instead.
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out`)), ms),
    ),
  ]);
}

// Minimal HTML-escaping for safely injecting dynamic strings (like a raw
// error message) into innerHTML without risking markup injection.
function escapeHtml(str) {
  return String(str).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

// Tracks which tfjs backend we ended up on, purely for surfacing in the
// on-screen technical detail if something still goes wrong.
let activeBackendName = "unknown";

async function ensureModels() {
  if (modelsLoaded) return;
  diagLog("log", "ensureModels: start");

  // Force the CPU backend BEFORE loading/running anything. face-api's
  // internal tfjs defaults to WebGL when available, but WebGL inference can
  // hang indefinitely (rather than just being slow) on GPU-readback in some
  // environments — VMs, remote desktops/RDP, certain locked-down or
  // software-rendered browsers, some Chromebooks. A stuck GPU sync means NO
  // timeout length fixes it, because the promise never settles at all. CPU
  // is slower per-op, but this model is small enough that CPU inference for
  // a single photo/frame is still fast, and — critically — it actually
  // finishes.
  try {
    const tfRef =
      typeof faceapi !== "undefined" && faceapi.tf
        ? faceapi.tf
        : typeof tf !== "undefined"
          ? tf
          : null;
    diagLog("log", "tfRef resolved:", tfRef ? "found" : "NOT FOUND");
    if (tfRef && typeof tfRef.setBackend === "function") {
      await tfRef.setBackend("cpu");
      diagLog("log", "setBackend(cpu) resolved");
      await tfRef.ready();
      diagLog("log", "tf.ready() resolved");
      activeBackendName = tfRef.getBackend ? tfRef.getBackend() : "cpu";
    }
  } catch (e) {
    diagLog("warn", "could not force CPU backend, continuing with default", e);
  }
  diagLog("log", "tfjs backend for face detection =", activeBackendName);

  diagLog("log", "loading tinyFaceDetector...");
  await withTimeout(
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    20000,
    "Face detector model load",
  );
  diagLog("log", "tinyFaceDetector loaded");
  diagLog("log", "loading faceExpressionNet...");
  await withTimeout(
    faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
    20000,
    "Expression model load",
  );
  diagLog("log", "faceExpressionNet loaded");

  // WARM-UP PASS: absorbs any one-time first-inference cost (e.g. JIT
  // warm-up of the CPU math paths) during loading, with its own "preparing"
  // message, so the real detection the person triggers is fast.
  try {
    diagLog("log", "warm-up: starting detection on blank canvas");
    const warmCanvas = document.createElement("canvas");
    warmCanvas.width = 416;
    warmCanvas.height = 416;
    const wctx = warmCanvas.getContext("2d");
    wctx.fillStyle = "#808080";
    wctx.fillRect(0, 0, 416, 416);
    await withTimeout(
      faceapi
        .detectSingleFace(
          warmCanvas,
          new faceapi.TinyFaceDetectorOptions({
            inputSize: 416,
            scoreThreshold: 0.4,
          }),
        )
        .withFaceExpressions(),
      30000,
      "Model warm-up",
    );
    diagLog("log", "warm-up: completed");
  } catch (e) {
    // Warm-up is best-effort — a blank gray canvas has no face, so "no face
    // found" here is expected. Only log, never block startup on this.
    diagLog("warn", "warm-up did not complete cleanly (non-fatal):", e);
  }

  modelsLoaded = true;
  diagLog("log", "ensureModels: done");
}

// Runs the actual face-api detection call. Because ensureModels() forces
// the CPU backend and already warmed the model up once, this should
// normally complete within a few seconds. One retry with a longer timeout
// covers a transient hiccup (e.g. a GC pause on a loaded page).
async function detectFaceWithFallback(input) {
  diagLog(
    "log",
    "detect: attempt 1 starting, input=",
    input && input.tagName,
    input && input.width,
    input && input.height,
  );
  try {
    const r = await withTimeout(
      faceapi
        .detectSingleFace(
          input,
          new faceapi.TinyFaceDetectorOptions({
            inputSize: 416,
            scoreThreshold: 0.4,
          }),
        )
        .withFaceExpressions(),
      15000,
      "Face detection",
    );
    diagLog("log", "detect: attempt 1 resolved, face found=", !!r);
    return r;
  } catch (firstErr) {
    diagLog("warn", "detect: attempt 1 failed, retrying:", firstErr);
    try {
      diagLog("log", "detect: attempt 2 (retry) starting");
      const r2 = await withTimeout(
        faceapi
          .detectSingleFace(
            input,
            new faceapi.TinyFaceDetectorOptions({
              inputSize: 416,
              scoreThreshold: 0.4,
            }),
          )
          .withFaceExpressions(),
        30000,
        "Face detection (retry)",
      );
      diagLog("log", "detect: attempt 2 (retry) resolved, face found=", !!r2);
      return r2;
    } catch (secondErr) {
      diagLog("error", "detect: attempt 2 (retry) failed too:", secondErr);
      throw secondErr;
    }
  }
}

const videoBtnEl = document.getElementById("videoBtn");
const videoUploadBtnEl = document.getElementById("videoUploadBtn");
const videoImageInputEl = document.getElementById("videoImageInput");
const analyzeImageBtnEl = document.getElementById("analyzeImageBtn");
const liveAnalyzeBtnEl = document.getElementById("liveAnalyzeBtn");

// Holds the most recently captured/uploaded photo (a canvas) until the
// person explicitly clicks "Analyse photo" — the photo is no longer
// analysed automatically the instant it's taken/chosen.
let pendingImageSource = null;
let liveAnalysisActive = false;
let liveAnalysisRaf = null;
let liveAnalysisFramePending = false;

function showLiveAnalyzeButton() {
  if (!liveAnalyzeBtnEl) return;
  liveAnalyzeBtnEl.classList.remove("hidden");
  liveAnalyzeBtnEl.disabled = false;
  liveAnalyzeBtnEl.textContent = t("video_live");
}

function hideLiveAnalyzeButton() {
  if (!liveAnalyzeBtnEl) return;
  liveAnalyzeBtnEl.classList.add("hidden");
  liveAnalyzeBtnEl.disabled = true;
}

function cancelLiveAnalysisLoop() {
  liveAnalysisActive = false;
  if (liveAnalysisRaf) {
    cancelAnimationFrame(liveAnalysisRaf);
    liveAnalysisRaf = null;
  }
  liveAnalysisFramePending = false;
  liveAnalysisBusy = false;
  if (liveAnalyzeBtnEl) {
    liveAnalyzeBtnEl.textContent = t("video_live");
    liveAnalyzeBtnEl.disabled = false;
  }
}

async function liveAnalysisLoop() {
  if (!liveAnalysisActive || !cameraActive) return;
  const now = performance.now();
  const w = videoEl.videoWidth;
  const h = videoEl.videoHeight;

  if (w && h && now - lastFaceTrackTime >= FACE_TRACK_INTERVAL_MS) {
    if (!liveAnalysisFramePending) {
      liveAnalysisFramePending = true;
      try {
        await runFaceTrackingFrame();
      } catch (err) {
        console.error("MindLens: face tracking failed", err);
      } finally {
        liveAnalysisFramePending = false;
        lastFaceTrackTime = performance.now();
      }
    }
  }

  if (
    w &&
    h &&
    !liveAnalysisBusy &&
    now - lastAnalyzeTime >= LIVE_ANALYZE_INTERVAL_MS
  ) {
    liveAnalysisBusy = true;
    lastAnalyzeTime = now;
    const frameCanvas = document.createElement("canvas");
    frameCanvas.width = w;
    frameCanvas.height = h;
    const cctx = frameCanvas.getContext("2d");
    cctx.drawImage(videoEl, 0, 0, w, h);
    analyzeSingleImage(frameCanvas)
      .catch((err) => console.error("MindLens: live analysis failed", err))
      .finally(() => {
        liveAnalysisBusy = false;
      });
  }

  liveAnalysisRaf = requestAnimationFrame(liveAnalysisLoop);
}

async function toggleLiveAnalysis() {
  if (liveAnalysisActive) {
    cancelLiveAnalysisLoop();
    if (liveAnalyzeBtnEl) liveAnalyzeBtnEl.textContent = t("video_live");
    return;
  }
  await ensureModels();
  if (!cameraActive) {
    try {
      videoStream = await getCameraStream();
    } catch (err) {
      const hint = permissionHint("camera", err);
      document.getElementById("result-video").innerHTML =
        `<div class="verdict" style="background:#F3EADA;color:#5b4a33;">We could not start the camera.${hint || " Please allow camera access and try again, or upload a photo instead."}</div>`;
      return;
    }
    await optimizeCameraTrack(videoStream);
    videoEl.pause();
    videoEl.srcObject = null;
    videoEl.srcObject = videoStream;
    try {
      await videoEl.play();
    } catch (err) {
      /* ignore autoplay restrictions */
    }
    videoImagePreviewEl.classList.add("hidden");
    videoWrapEl.classList.remove("hidden");
    cameraActive = true;
    activateFaceTracking();
    videoBtnEl.textContent = t("video_capture");
    document.getElementById("status-video").textContent = t(
      "status_camera_ready",
    );
    document.getElementById("status-video").classList.remove("done");
    document.getElementById("status-video").classList.add("active");
  }

  liveAnalysisActive = true;
  if (liveAnalyzeBtnEl) {
    liveAnalyzeBtnEl.textContent = t("video_live_stop");
    liveAnalyzeBtnEl.disabled = false;
  }
  liveAnalysisRaf = requestAnimationFrame(liveAnalysisLoop);
}

function showAnalyzeImageButton(source) {
  pendingImageSource = source;
  if (liveAnalysisActive) cancelLiveAnalysisLoop();
  hideLiveAnalyzeButton();
  if (!analyzeImageBtnEl) return;
  analyzeImageBtnEl.classList.remove("hidden");
  analyzeImageBtnEl.disabled = false;
  analyzeImageBtnEl.textContent = t("analyze_image_btn");
}

function hideAnalyzeImageButton() {
  pendingImageSource = null;
  if (!analyzeImageBtnEl) return;
  analyzeImageBtnEl.classList.add("hidden");
  analyzeImageBtnEl.disabled = true;
}

// Works out *why* a detected face isn't being counted as a good photo, and
// returns null when it's genuinely fine to use. Checking these in a fixed
// priority order (lighting first, then focus, then framing) means the
// on-screen hint always points at the single most impactful thing to fix
// rather than several minor issues at once.
function classifyFrameIssue(
  detection,
  metrics,
  frameW,
  frameH,
  detectionError,
) {
  if (detectionError) return "detectionError";
  if (!detection) return "noFace";
  if (metrics) {
    if (metrics.brightness < 55) return "tooDark";
    if (metrics.brightness > 225) return "tooBright";
    if (metrics.sharpness < BLUR_VARIANCE_MIN) return "tooBlurry";
  }
  const box = detection.detection.box;
  const area = (box.width * box.height) / Math.max(1, frameW * frameH);
  if (area < 0.025) return "tooFar";
  if (area > 0.62) return "tooClose";
  const cx = box.x + box.width / 2,
    cy = box.y + box.height / 2;
  const offX = Math.abs(cx - frameW / 2) / frameW;
  const offY = Math.abs(cy - frameH / 2) / frameH;
  if (offX > 0.3 || offY > 0.3) return "offCentre";
  if (detection.detection.score < 0.5) return "lowConfidence";
  return null;
}

const FRAME_ISSUE_HINTS = {
  detectionError:
    "The face-detection step hit a technical problem (not your photo) — try again in a moment, refresh the page, or try a different browser.",
  noFace: "No face detected — make sure your whole face is in the photo.",
  tooDark:
    "The photo looks quite dark — face a light source for a clearer reading.",
  tooBright:
    "The photo looks overexposed — try moving away from a bright light or window behind you.",
  tooBlurry:
    "The photo looks a bit blurry — hold the camera steady, or choose a sharper picture.",
  tooFar:
    "The face is quite small in this photo — move closer or crop in for a clearer reading.",
  tooClose:
    "The face is very close/cropped in this photo — try a photo taken a little further back.",
  offCentre: "Centre your face in the photo for the clearest reading.",
  lowConfidence:
    "Having trouble getting a confident lock on the face — try a different angle or lighting.",
};

// Shared analysis path for both a freshly captured photo (canvas) and an
// uploaded image file (canvas drawn from the loaded <img>). Runs the face
// detector + expression model once on the single image and turns that into
// a risk score, the same way the previous frame-by-frame video sampling
// did, just without the time-based blink/gaze/expressivity signals that
// only make sense across many frames.
async function analyzeSingleImage(source) {
  const statusEl = document.getElementById("status-video");
  const resultEl = document.getElementById("result-video");

  const isFirstRun = !modelsLoaded;
  statusEl.textContent = isFirstRun
    ? "Preparing analysis model (first time only, can take up to a minute)…"
    : t("status_analyzing");
  statusEl.classList.remove("done");
  statusEl.classList.add("active");
  updateVideoQualityHint("");

  try {
    await ensureModels();
  } catch (err) {
    diagLog("error", "facial-expression model initialization failed:", err);
    const detail = err instanceof Error ? err.message : String(err);
    const servingHint =
      window.location.protocol === "file:"
        ? " Open MindLens through localhost or HTTPS instead of directly from a file."
        : " Check that the models/ folder is present beside index.html and that the model files are reachable.";
    resultEl.innerHTML = `<div class="verdict" style="background:#F3EADA;color:#5b4a33;">Could not load the facial-expression model. Check your internet connection for the required runtime scripts.${servingHint}<br><small>${escapeHtml(detail)}</small> Text and voice check-ins still work.</div>`;
    statusEl.textContent = t("status_not_started");
    statusEl.classList.remove("active");
    return;
  }

  statusEl.textContent = t("status_analyzing");

  // Everything from here on (detection, scoring, dashboard update) is
  // wrapped in one try/catch. Previously only the face-api detection call
  // itself was guarded, so any unexpected error elsewhere in this block
  // (a bad image, a canvas edge case, a missing DOM node, a trained-model
  // fetch glitch, etc.) would throw past the click handler's bare
  // try/finally and leave the status pinned on "Analysing…" forever with
  // no score and no visible error. Now any such failure is caught here,
  // logged for debugging, and turned into a normal on-screen message.
  try {
    const w = source.naturalWidth || source.videoWidth || source.width;
    const h = source.naturalHeight || source.videoHeight || source.height;
    const metrics = computeImageMetrics(source, w, h);
    const input = getEnhancedImage(source, w, h, metrics);

    let detection = null;
    // Tracks whether the detector itself broke (model/backend error, decode
    // failure, timeout) as distinct from the detector running fine and
    // simply not finding a face. These used to be conflated — any thrown
    // error here fell through to the same "No face detected" message as a
    // genuinely faceless photo, which hid real problems (e.g. a corrupt
    // model file, a lost WebGL context, a slow network) behind a message
    // that told the person to fix their photo when their photo wasn't the
    // issue at all.
    let detectionError = null;
    try {
      detection = await detectFaceWithFallback(input);
    } catch (e) {
      console.error("MindLens: face detection failed (both attempts)", e);
      detectionError = e;
    }

    const issue = classifyFrameIssue(detection, metrics, w, h, detectionError);
    statusEl.textContent = t("status_done");
    statusEl.classList.remove("active");
    statusEl.classList.add("done");

    if (issue) {
      updateVideoQualityHint(FRAME_ISSUE_HINTS[issue], true);
      let message =
        issue === "detectionError"
          ? FRAME_ISSUE_HINTS[issue]
          : `We couldn't get a clear reading from this photo. ${FRAME_ISSUE_HINTS[issue]} Try another photo, or take a new one, with good lighting and your whole face visible.`;
      // Temporarily surface the raw underlying error on screen (not just in
      // the console) so the real cause of a detectionError is visible
      // immediately, without needing DevTools open. Safe to remove once the
      // root cause is confirmed and fixed.
      if (issue === "detectionError" && detectionError) {
        const detail =
          detectionError.message ||
          detectionError.name ||
          String(detectionError);
        message += `<br><span style="font-size:0.75rem;opacity:0.75;">Technical detail: ${escapeHtml(detail)} (backend: ${escapeHtml(activeBackendName)})</span>`;
        message += `<br><details style="margin-top:6px;font-size:0.7rem;opacity:0.85;"><summary style="cursor:pointer;">Full diagnostic log (tap to expand, copy this if reporting the issue)</summary><pre style="white-space:pre-wrap;word-break:break-word;text-align:left;margin-top:4px;">${escapeHtml(mindlensDiagLog.join("\n"))}</pre></details>`;
      }
      resultEl.innerHTML = `<div class="verdict" style="background:#F3EADA;color:#5b4a33;">${message}</div>`;
      return;
    }

    updateVideoQualityHint("Face detected — expression analysed.", false);

    const exp = detection.expressions;
    // Weights are anchored to normalized valence estimates for basic
    // expression categories from affective-computing/circumplex research
    // (e.g. Russell's circumplex model and later normed replications),
    // roughly: sad ≈ -0.8, angry ≈ -0.6, fearful ≈ -0.6, disgusted ≈ -0.6,
    // neutral ≈ 0 (deliberately excluded — see note below), surprised ≈
    // mixed/+0.2, happy ≈ +0.9. This is a principled-but-heuristic
    // calibration, not a classifier trained on labelled facial-affect-to-
    // depression data — see /ml/train_video_model_TEMPLATE.py for how to fit
    // real weights once you have access to a labelled dataset.
    //
    // Neutral is deliberately given NO weight in "negative" below. face-api's
    // expression net reports high neutral confidence for most calm faces —
    // i.e. for most people, most of the time — so scoring it as risk would
    // push almost every photo toward the same mid/high band regardless of
    // the person's actual expression.
    const negative =
      (exp.sad || 0) * 0.8 +
      (exp.angry || 0) * 0.6 +
      (exp.fearful || 0) * 0.6 +
      (exp.disgusted || 0) * 0.6;
    const positive = (exp.happy || 0) * 0.9 + (exp.surprised || 0) * 0.2;

    // Baseline (50) + a gain on real expression signal, spread across the
    // 0–100 range rather than clustering around whatever "mostly neutral"
    // always scored.
    const heuristicScore = Math.max(
      0,
      Math.min(100, Math.round(50 + (negative - positive) * 55)),
    );

    // Try to use a trained video model (mapping expression probs -> risk)
    await ensureTrainedVideoModel();
    let score;
    if (videoModel) {
      try {
        const categories = videoModel.categories || [
          "angry",
          "disgust",
          "fear",
          "happy",
          "sad",
          "surprise",
          "neutral",
        ];
        // map our totals keys to model categories (naming differences handled)
        const x = categories.map((cat) => {
          if (cat === "fear") return exp.fearful || 0;
          if (cat === "disgust") return exp.disgusted || 0;
          if (cat === "surprise") return exp.surprised || 0;
          return exp[cat] || 0;
        });
        const weights = videoModel.weights || videoModel.coef_ || [];
        const bias = videoModel.bias || 0;
        let z = bias;
        for (let i = 0; i < weights.length && i < x.length; i++)
          z += weights[i] * x[i];
        const prob = 1 / (1 + Math.exp(-z));
        const modelScore = Math.round(prob * 100);
        // blend model and heuristic slightly to preserve expressivity signal
        score = Math.round(modelScore * 0.85 + heuristicScore * 0.15);
      } catch (e) {
        score = heuristicScore;
      }
    } else {
      score = heuristicScore;
    }

    state.scores.video = score;
    const band = bandFor(score);

    resultEl.innerHTML = `<div class="verdict" style="background:${band.bg};color:${band.fg};">
        ${band.label} facial-affect risk indicator — ${score}/100<br>
        <span style="font-weight:400;font-size:0.82rem;">Estimated from a single photo via a deep convolutional network reading facial expression.</span>
      </div>`;
    const successNote = document.createElement("div");
    successNote.className = "video-success-note";
    successNote.textContent = t("video_success_note");
    resultEl.appendChild(successNote);
    requestAnimationFrame(() => successNote.classList.add("visible"));
    setTimeout(() => {
      successNote.classList.add("fade-out");
      setTimeout(() => successNote.remove(), 700);
    }, 4200);
    updateDashboard();
  } catch (err) {
    console.error("MindLens: image analysis failed", err);
    statusEl.textContent = t("status_not_started");
    statusEl.classList.remove("active");
    statusEl.classList.remove("done");
    resultEl.innerHTML = `<div class="verdict" style="background:#F3EADA;color:#5b4a33;">Something went wrong analysing this photo. Please try again, or try a different photo. Text and voice check-ins still work.</div>`;
  }
}

// "Take a photo" / "Capture photo" toggle: first click starts the camera
// and shows a live preview; second click grabs the current frame, stops
// the camera immediately, and analyses that one photo — no continuous
// live recognition.
if (videoBtnEl)
  videoBtnEl.addEventListener("click", async () => {
    const btn = videoBtnEl;
    const statusEl = document.getElementById("status-video");

    if (!cameraActive) {
      updateVideoQualityHint("");
      hideAnalyzeImageButton();
      try {
        videoStream = await getCameraStream();
      } catch (err) {
        const hint = permissionHint("camera", err);
        document.getElementById("result-video").innerHTML =
          `<div class="verdict" style="background:#F3EADA;color:#5b4a33;">We could not start the camera.${hint || " Please allow camera access and try again, or upload a photo instead."}</div>`;
        return;
      }
      await optimizeCameraTrack(videoStream);
      // Explicitly clear out any previous stream before attaching the new
      // one, rather than just overwriting srcObject.
      videoEl.pause();
      videoEl.srcObject = null;
      videoEl.srcObject = videoStream;
      try {
        await videoEl.play();
      } catch (err) {
        /* ignore autoplay restrictions */
      }

      videoImagePreviewEl.classList.add("hidden");
      videoWrapEl.classList.remove("hidden");

      btn.disabled = true;
      btn.textContent = "Starting camera…";

      // Give autofocus/auto-exposure a moment to settle before the capture
      // button becomes usable — the single biggest fix for a soft/mis-exposed
      // first photo, since the very first frames off a fresh getUserMedia()
      // stream are frequently still adjusting.
      await waitForCameraSettle();
      if (videoStream.getVideoTracks()[0]?.readyState !== "live") {
        // Stream was stopped (e.g. permission revoked, device unplugged) while settling.
        btn.disabled = false;
        btn.textContent = t("video_start");
        return;
      }

      cameraActive = true;
      await ensureModels();
      activateFaceTracking();
      btn.disabled = false;
      btn.textContent = t("video_capture");
      showLiveAnalyzeButton();
      statusEl.textContent = t("status_camera_ready");
      statusEl.classList.remove("done");
      statusEl.classList.add("active");
    } else {
      // Capture the current frame, then stop the camera right away — only
      // this single photo is analysed, the stream is not kept running.
      const w = videoEl.videoWidth,
        h = videoEl.videoHeight;
      const captureCanvas = document.createElement("canvas");
      captureCanvas.width = w;
      captureCanvas.height = h;
      const cctx = captureCanvas.getContext("2d");
      // Mirror the capture to match the mirrored live preview the user saw.
      cctx.translate(w, 0);
      cctx.scale(-1, 1);
      cctx.drawImage(videoEl, 0, 0, w, h);

      videoStream.getTracks().forEach((tr) => tr.stop());
      cameraActive = false;
      deactivateFaceTracking();
      cancelLiveAnalysisLoop();
      hideLiveAnalyzeButton();
      videoWrapEl.classList.add("hidden");

      videoImagePreviewEl.src = captureCanvas.toDataURL("image/jpeg", 0.92);
      videoImagePreviewEl.classList.remove("hidden");

      btn.textContent = t("video_retake");
      showAnalyzeImageButton(captureCanvas);
    }
  });

// "Upload a photo or video": lets the user pick an existing image, or a
// short video (a frame is grabbed from it), instead of using the camera.
// The chosen file never leaves the browser — it's read locally, drawn to
// an offscreen canvas, and fed straight into the same face-api analysis
// used for a captured photo.
if (videoUploadBtnEl && videoImageInputEl) {
  videoUploadBtnEl.addEventListener("click", () => {
    if (cameraActive && videoStream) {
      videoStream.getTracks().forEach((tr) => tr.stop());
      cameraActive = false;
      cancelLiveAnalysisLoop();
      hideLiveAnalyzeButton();
      videoWrapEl.classList.add("hidden");
      videoBtnEl.textContent = t("video_start");
    }
    videoImageInputEl.click();
  });

  // Grabs a representative frame (roughly the midpoint, or 1s in for
  // longer clips) from an uploaded video file and hands it back as a
  // canvas — same shape of object the image path below already produces.
  function grabFrameFromVideoFile(file) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const tempVideo = document.createElement("video");
      tempVideo.muted = true;
      tempVideo.playsInline = true;
      tempVideo.preload = "auto";
      tempVideo.src = objectUrl;

      let settled = false;
      const cleanup = () => URL.revokeObjectURL(objectUrl);
      const captureFrame = () => {
        if (settled) return;
        settled = true;
        clearTimeout(safetyTimer);
        const c = document.createElement("canvas");
        c.width = tempVideo.videoWidth;
        c.height = tempVideo.videoHeight;
        c.getContext("2d").drawImage(tempVideo, 0, 0);
        cleanup();
        resolve(c);
      };

      tempVideo.onloadedmetadata = () => {
        const seekTo = Math.min(1, (tempVideo.duration || 0) / 2);
        tempVideo.currentTime = isFinite(seekTo) ? seekTo : 0;
      };
      tempVideo.onseeked = captureFrame;
      // Fallback for browsers/files where seeking never settles — grab
      // whatever frame is already decoded once the video is playable.
      tempVideo.onloadeddata = () => {
        setTimeout(captureFrame, 300);
      };
      tempVideo.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(safetyTimer);
        cleanup();
        reject(new Error("could not decode video file"));
      };
      // Absolute upper bound so a stuck video can never hang the upload flow.
      const safetyTimer = setTimeout(() => {
        if (settled) return;
        if (tempVideo.videoWidth > 0) {
          captureFrame();
        } else {
          settled = true;
          cleanup();
          reject(new Error("timed out reading video file"));
        }
      }, 6000);

      // Some browsers need an explicit load() before seeking works reliably.
      tempVideo.load();
    });
  }

  videoImageInputEl.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    videoImageInputEl.value = ""; // allow choosing the same file again later
    if (!file) return;

    const isImage = file.type && file.type.startsWith("image/");
    const isVideo = file.type && file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      document.getElementById("result-video").innerHTML =
        `<div class="verdict" style="background:#F3EADA;color:#5b4a33;">Please choose an image (JPG, PNG, etc.) or a short video file.</div>`;
      return;
    }

    if (isVideo) {
      try {
        const c = await grabFrameFromVideoFile(file);
        videoWrapEl.classList.add("hidden");
        videoImagePreviewEl.src = c.toDataURL("image/jpeg", 0.92);
        videoImagePreviewEl.classList.remove("hidden");
        videoBtnEl.textContent = t("video_retake");
        showAnalyzeImageButton(c);
        showLiveAnalyzeButton();
      } catch (err) {
        console.warn("MindLens: could not read uploaded video file", err);
        document.getElementById("result-video").innerHTML =
          `<div class="verdict" style="background:#F3EADA;color:#5b4a33;">We couldn't read that video file. Please try a different one, or upload a still photo instead.</div>`;
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = async () => {
        videoWrapEl.classList.add("hidden");
        videoImagePreviewEl.src = ev.target.result;
        videoImagePreviewEl.classList.remove("hidden");

        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);

        videoBtnEl.textContent = t("video_retake");
        showAnalyzeImageButton(c);
        showLiveAnalyzeButton();
      };
      img.onerror = () => {
        document.getElementById("result-video").innerHTML =
          `<div class="verdict" style="background:#F3EADA;color:#5b4a33;">We couldn't read that image file. Please try a different one.</div>`;
      };
      img.src = ev.target.result;
    };
    reader.onerror = () => {
      document.getElementById("result-video").innerHTML =
        `<div class="verdict" style="background:#F3EADA;color:#5b4a33;">We couldn't read that file. Please try again.</div>`;
    };
    reader.readAsDataURL(file);
  });
}

// "Analyse photo": runs once the person is happy with the captured/
// uploaded preview and explicitly asks for the reading, rather than the
// analysis firing automatically the moment a photo is taken/chosen.
if (analyzeImageBtnEl) {
  analyzeImageBtnEl.addEventListener("click", async () => {
    if (!pendingImageSource) return;
    const source = pendingImageSource;
    analyzeImageBtnEl.disabled = true;
    analyzeImageBtnEl.textContent = t("analyzing_image_btn");
    try {
      await analyzeSingleImage(source);
    } finally {
      analyzeImageBtnEl.disabled = false;
      analyzeImageBtnEl.textContent = t("analyze_image_btn");
    }
  });
}

if (liveAnalyzeBtnEl) {
  liveAnalyzeBtnEl.addEventListener("click", async () => {
    liveAnalyzeBtnEl.disabled = true;
    await toggleLiveAnalysis();
    liveAnalyzeBtnEl.disabled = false;
  });
}

/* ==========================================================
   4. SHARED: risk bands + dashboard + halo gauge
   ========================================================== */
function bandFor(score) {
  if (score < 25)
    return {
      label: "Minimal",
      bg: "rgba(61,107,79,0.15)",
      fg: "#2c4d3a",
      color: "#3D6B4F",
    };
  if (score < 45)
    return {
      label: "Mild",
      bg: "rgba(244,185,66,0.22)",
      fg: "#7a5915",
      color: "#F4B942",
    };
  if (score < 65)
    return {
      label: "Moderate",
      bg: "rgba(232,134,58,0.22)",
      fg: "#8a4212",
      color: "#E8863A",
    };
  return {
    label: "Elevated",
    bg: "rgba(184,67,61,0.18)",
    fg: "#7a2b27",
    color: "#B8433D",
  };
}

/* ==========================================================
   Feel-good comfort suggestion for high scores. This is a small,
   gentle extra — a lighthearted distraction, not a substitute for
   the crisis banner/helplines or the "reach out to someone"
   recommendations above, which always take priority and stay
   visible alongside this. Movie titles are just names/facts (no
   copyrighted synopsis text reproduced); music links out to a
   generic playlist search rather than embedding any actual
   copyrighted audio.
   ========================================================== */
const FEEL_GOOD_MOVIES = [
  { title: "Paddington 2", note: "A warm, gentle comedy — almost impossible to watch without smiling." },
  { title: "The Intouchables", note: "A funny, touching story about an unlikely friendship." },
  { title: "Zindagi Na Milegi Dobara", note: "A feel-good road trip about friendship and second chances." },
  { title: "Chhichhore", note: "A nostalgic, heartfelt comedy about college friendships." },
  { title: "The Secret Life of Walter Mitty", note: "A gentle, visually beautiful story about stepping out of a rut." },
  { title: "3 Idiots", note: "A funny, warm story about friendship and finding your own path." },
  { title: "Amélie", note: "A whimsical, cozy film about small acts of kindness." },
  { title: "School of Rock", note: "An easy, funny, feel-good watch with a lot of heart." },
  { title: "Kung Fu Panda", note: "Lighthearted, funny, and oddly comforting — a good low-effort watch." },
  { title: "English Vinglish", note: "A gentle, uplifting story about quiet self-confidence." },
];

function pickFeelGoodMovie() {
  return FEEL_GOOD_MOVIES[Math.floor(Math.random() * FEEL_GOOD_MOVIES.length)];
}

// Opens a generic (non-video-specific) playlist search rather than a
// single hard-coded link, so this keeps working regardless of what's
// currently available/removed on either platform, and doesn't imply
// endorsement of one specific copyrighted upload.
const MUSIC_PLAYLIST_LINKS = [
  { label: "Open on YouTube", url: "https://www.youtube.com/results?search_query=feel+good+uplifting+music+playlist" },
  { label: "Open on Spotify", url: "https://open.spotify.com/search/feel%20good%20uplifting%20playlist" },
];

function renderFeelGoodCard(show) {
  const el = document.getElementById("feelGoodCard");
  if (!el) return;
  if (!show) { el.classList.add("hidden"); return; }
  const movie = pickFeelGoodMovie();
  el.innerHTML = `
    <h4>While you line up support, a small comfort break</h4>
    <p class="feel-good-movie"><strong>🎬 ${escapeHtml(movie.title)}</strong> — ${escapeHtml(movie.note)}</p>
    <div class="feel-good-music">
      <span>🎵 Or put on something pleasant:</span>
      ${MUSIC_PLAYLIST_LINKS.map(l => `<a href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`).join(" · ")}
    </div>
  `;
  el.classList.remove("hidden");
}

function showNearbySupportSuggestion(show) {
  const dialog = document.getElementById("nearbySupportDialog");
  if (!(dialog instanceof HTMLDialogElement)) return;

  if (!show) {
    if (dialog.open) dialog.close();
    return;
  }

  if (dialog.open) return;
  dialog.showModal();
}

const nearbySupportDialog = document.getElementById("nearbySupportDialog");
const closeNearbySupport = () => {
  if (nearbySupportDialog instanceof HTMLDialogElement && nearbySupportDialog.open) {
    nearbySupportDialog.close();
  }
};
document.getElementById("nearbySupportClose")?.addEventListener("click", closeNearbySupport);
document.getElementById("nearbySupportDismiss")?.addEventListener("click", closeNearbySupport);
document.getElementById("nearbySupportViewLocations")?.addEventListener("click", closeNearbySupport);
nearbySupportDialog?.addEventListener("click", (event) => {
  if (event.target === nearbySupportDialog) closeNearbySupport();
});

const useSupportLocationButton = document.getElementById("useSupportLocation");
const supportLocationStatus = document.getElementById("supportLocationStatus");
let supportLocationMessageKey = "location_prompt";

function updateSupportLocationStatus(messageKey) {
  supportLocationMessageKey = messageKey;
  if (supportLocationStatus) supportLocationStatus.textContent = t(messageKey);
}

document.addEventListener("mindlens-language-changed", () => {
  updateSupportLocationStatus(supportLocationMessageKey);
});

function getSupportMapUrl(query, latitude, longitude, embedded = false) {
  const coordinates = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
  const search = `${query} near ${coordinates}`;
  if (embedded) {
    const params = new URLSearchParams({
      q: search,
      ll: coordinates,
      z: "14",
      output: "embed",
    });
    return `https://www.google.com/maps?${params.toString()}`;
  }
  const params = new URLSearchParams({ api: "1", query: search });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

if (useSupportLocationButton && supportLocationStatus) {
  useSupportLocationButton.addEventListener("click", () => {
    const isLocalOrigin = ["localhost", "127.0.0.1", "::1"].includes(
      window.location.hostname,
    );
    if (!window.isSecureContext && !isLocalOrigin) {
      updateSupportLocationStatus("location_secure_context");
      return;
    }
    if (!navigator.geolocation) {
      updateSupportLocationStatus("location_unsupported");
      return;
    }

    useSupportLocationButton.disabled = true;
    updateSupportLocationStatus("location_loading");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const maps = [
          {
            query: "counseling centers",
            frame: document.querySelector(
              '[aria-labelledby="counselingLocationsTitle"] iframe',
            ),
            link: document.querySelector(
              '[aria-labelledby="counselingLocationsTitle"] a',
            ),
          },
          {
            query: "psychiatrists",
            frame: document.querySelector(
              '[aria-labelledby="psychiatristLocationsTitle"] iframe',
            ),
            link: document.querySelector(
              '[aria-labelledby="psychiatristLocationsTitle"] a',
            ),
          },
        ];

        maps.forEach(({ query, frame, link }) => {
          if (frame instanceof HTMLIFrameElement) {
            frame.src = getSupportMapUrl(
              query,
              coords.latitude,
              coords.longitude,
              true,
            );
          }
          if (link instanceof HTMLAnchorElement) {
            link.href = getSupportMapUrl(
              query,
              coords.latitude,
              coords.longitude,
            );
          }
        });

        updateSupportLocationStatus("location_success");
        useSupportLocationButton.disabled = false;
      },
      (error) => {
        const messageKey =
          error.code === error.PERMISSION_DENIED
            ? "location_denied"
            : error.code === error.POSITION_UNAVAILABLE
              ? "location_unavailable"
              : "location_timeout";
        updateSupportLocationStatus(messageKey);
        useSupportLocationButton.disabled = false;
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    );
  });

  const shouldAutoDetectLocation =
    window.isSecureContext || ["localhost", "127.0.0.1", "::1"].includes(
      window.location.hostname,
    );
  if (shouldAutoDetectLocation && navigator.geolocation) {
    requestAnimationFrame(() => useSupportLocationButton.click());
  }
}

/* ==========================================================
   Gentle self-care suggestions per risk band. These are
   everyday wellbeing nudges, not treatment — they sit
   alongside (never instead of) the crisis banner / helpline
   resources, and get more supportive/direct as the band rises.
   ========================================================== */
const RECOMMENDATIONS = {
  Minimal: [
    "Keep doing what's working — a short walk outside can help maintain that steady mood.",
    "Note down one thing that went well today; small wins add up.",
    "Stay connected — a quick check-in with a friend or family member keeps that support close.",
  ],
  Mild: [
    "Go for a walk, even a short one — light movement and fresh air can lift a low mood a little.",
    "Try to keep a regular sleep and meal schedule for the next few days.",
    "Reach out to someone you trust and talk through how the last couple of weeks have felt.",
    "Step away from screens for a bit and spend a few minutes outdoors or in natural light.",
  ],
  Moderate: [
    "Go for a walk and pair it with a call to someone you trust — movement and connection both help.",
    "Consider talking to a counsellor or trusted mentor this week, even just to think out loud.",
    "Try a small, structured routine for the next few days — regular sleep, meals, and short breaks.",
    "Limit alcohol and stimulants for now; both can amplify low mood and disrupted sleep.",
  ],
  Elevated: [
    "Please consider reaching out to a mental-health professional or one of the helplines below soon.",
    "Let a trusted friend or family member know how you've been feeling — you don't have to carry this alone.",
    "A short walk or change of scenery can help in the moment, but please also line up professional support.",
  ],
};

// Deterministic-but-varied pick so the same band doesn't always show
// the exact same single suggestion on repeat check-ins.
function pickRecommendations(bandLabel, count) {
  const list = RECOMMENDATIONS[bandLabel] || RECOMMENDATIONS.Mild;
  const shuffled = list.slice().sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

function renderRecommendations(bandLabel) {
  const el = document.getElementById("dashboardRecommendations");
  if (!el) return;
  const picks = pickRecommendations(bandLabel, 2);
  el.innerHTML = `
    <h4>Suggested next step${picks.length > 1 ? "s" : ""}</h4>
    <ul>${picks.map((tip) => `<li>${tip}</li>`).join("")}</ul>
  `;
  el.classList.remove("hidden");
}

function updateDashboard() {
  const { text, audio, video } = state.scores;
  const active = [text, audio, video].filter((v) => v !== null);

  ["text", "audio", "video"].forEach((key) => {
    const val = state.scores[key];
    const barEl = document.getElementById(`bar-${key}`);
    const valEl = document.getElementById(`val-${key}`);
    if (barEl) barEl.style.width = val !== null ? `${val}%` : "0%";
    if (valEl) valEl.textContent = val !== null ? val : "—";
  });

  const scoreEl = document.getElementById("gaugeScore");
  const bandEl = document.getElementById("gaugeBand");
  const summaryValueEl = document.getElementById("scoreSummaryValue");
  const summaryTextEl = document.getElementById("scoreSummaryText");

  if (active.length === 0) {
    if (scoreEl) scoreEl.textContent = "--";
    if (bandEl) bandEl.textContent = "Add a check-in above";
    if (summaryValueEl) summaryValueEl.textContent = "--";
    if (summaryTextEl)
      summaryTextEl.textContent = "Complete a check-in to see your score.";
    drawHaloGauge(0, "#3D6B4F");
    const recEl = document.getElementById("dashboardRecommendations");
    if (recEl) recEl.classList.add("hidden");
    renderFeelGoodCard(false);
    showNearbySupportSuggestion(false);
    return;
  }

  const combined = Math.round(
    active.reduce((a, b) => a + b, 0) / active.length,
  );
  const band = bandFor(combined);
  if (scoreEl) scoreEl.textContent = combined;
  if (bandEl) bandEl.textContent = `${band.label} risk indicator`;
  if (summaryValueEl) summaryValueEl.textContent = combined;
  if (summaryTextEl)
    summaryTextEl.textContent = `${band.label} risk indicator from ${active.length} check-in${active.length > 1 ? "s" : ""}.`;
  drawHaloGauge(combined, band.color);
  renderRecommendations(band.label);
  renderFeelGoodCard(combined > 75);
  showNearbySupportSuggestion(combined > 75);

  if (combined >= 65) showCrisisBanner();
}

function drawHaloGauge(score, color) {
  const svg = document.getElementById("haloGauge");
  const r = 110,
    cx = 150,
    cy = 150;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - score / 100);

  let petals = "";
  const petalCount = 16;
  for (let i = 0; i < petalCount; i++) {
    const angle = (i / petalCount) * 2 * Math.PI;
    const px = cx + Math.cos(angle) * 140;
    const py = cy + Math.sin(angle) * 140;
    const hue = i % 2 === 0 ? "var(--marigold)" : "var(--saffron)";
    petals += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="5" fill="${hue}" opacity="0.55"/>`;
  }

  svg.innerHTML = `
    ${petals}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#F3EADA" stroke-width="16"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="16"
      stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
      transform="rotate(-90 ${cx} ${cy})" style="transition:stroke-dashoffset 0.7s ease, stroke 0.4s ease;"/>
    <circle cx="${cx}" cy="${cy}" r="86" fill="var(--paper)"/>
  `;
}

// initial empty gauge
drawHaloGauge(0, "#3D6B4F");

// --- Theme (dark/light) toggle support ---
function applyTheme(name) {
  if (name === "dark") document.documentElement.classList.add("dark");
  else document.documentElement.classList.remove("dark");
}

function initTheme() {
  const saved = localStorage.getItem("mindlens-theme");
  const prefersDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = saved || (prefersDark ? "dark" : "light");
  applyTheme(theme);

  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  const updateBtn = () => {
    const isDark = document.documentElement.classList.contains("dark");
    btn.textContent = isDark ? "☀️" : "🌙";
    btn.setAttribute("aria-pressed", isDark);
  };
  updateBtn();
  btn.addEventListener("click", () => {
    const isNowDark = !document.documentElement.classList.toggle("dark");
    // toggle returns true if class now present; invert logic for stored value
    const finalDark = document.documentElement.classList.contains("dark");
    localStorage.setItem("mindlens-theme", finalDark ? "dark" : "light");
    updateBtn();
  });
}

// initialize theme on load
initTheme();

// --- Footer watermark ---
// MindLens — developed by Bhuvanidharan V
(function setFooterYear() {
  const el = document.getElementById("footerYear");
  if (el) el.textContent = new Date().getFullYear();
})();
