(function () {
  // In-browser recorder for consented data collection.
  let audioRecorder,
    audioChunks = [],
    audioBlob;
  let videoStream;
  let audioRecordStart = null,
    audioTimerId = null;

  const pidEl = document.getElementById("pid");
  const ageEl = document.getElementById("age");
  const genderEl = document.getElementById("gender");
  const consentEl = document.getElementById("consent");
  const gatedSectionsEl = document.getElementById("gatedSections");
  const consentStatusEl = document.getElementById("consentStatus");
  const uploadAllBtn = document.getElementById("uploadAll");
  const uploadStatusEl = document.getElementById("uploadStatus");
  const mongoStatusEl = document.getElementById("mongoStatus");
  const mongoBadgeEl = document.getElementById("mongoBadge");
  const mongoSetupHintEl = document.getElementById("mongoSetupHint");
  const refreshMongoSamplesBtn = document.getElementById("refreshMongoSamples");
  const mongoSamplesStatusEl = document.getElementById("mongoSamplesStatus");
  const mongoSamplesEl = document.getElementById("mongoSamples");

  const TOTAL_ITEMS = 9; // text + audio + video-clip + 7 expressions... counted below as 1+1+7=9 (video clip itself is optional/bonus, not counted separately)

  // Whether a MindLens server with a working database is reachable. Checked
  // once on load — if this page is just opened as a local file (or the
  // optional Flask server isn't running, or is running without MongoDB
  // configured), the MongoDB action remains disabled until the database is
  // available.
  let serverAvailable = false;
  let mongoConnectionError = "";
  let mongoConnectionUri = "";
  (async function checkServerAvailability() {
    try {
      const resp = await fetch("/api/health", { method: "GET" });
      if (!resp.ok) return;
      const data = await resp.json();
      serverAvailable = !!(data.database && data.database.connected);
      mongoConnectionError = data.database?.error || "";
      mongoConnectionUri = data.database?.uri || "";
      if (serverAvailable) {
        mongoStatusEl.textContent = `Connected to MongoDB database "${data.database.db}". Capture one or more items, then upload this consented sample.`;
      }
    } catch (e) {
      serverAvailable = false; // e.g. opened as a local file:// page, or no server running
    } finally {
      mongoBadgeEl.textContent = serverAvailable ? "MongoDB connected" : "MongoDB unavailable";
      mongoBadgeEl.classList.toggle("done", serverAvailable);
      mongoStatusEl.classList.toggle("connected", serverAvailable);
      mongoStatusEl.classList.toggle("unavailable", !serverAvailable);
      if (!serverAvailable) {
        const target = mongoConnectionUri ? ` at ${mongoConnectionUri}` : "";
        const detail = mongoConnectionError ? ` ${mongoConnectionError}` : "";
        mongoStatusEl.textContent = `MongoDB is not connected${target}.${detail} Your recordings remain on this device until you choose a local download or configure the server.`;
      }
      mongoSetupHintEl.classList.toggle("hidden", serverAvailable);
      refreshMongoSamplesBtn.disabled = !serverAvailable;
      if (serverAvailable) {
        loadUploadedSamples();
      } else {
        mongoSamplesEl.replaceChildren();
        mongoSamplesStatusEl.textContent = "Connect MongoDB to view uploaded samples.";
      }
      refreshProgress();
    }
  })();

  // ---------- Progress / status UI (reads existing state, doesn't change it) ----------
  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    const m = String(Math.floor(s / 60)).padStart(2, "0");
    const r = String(s % 60).padStart(2, "0");
    return `${m}:${r}`;
  }

  function refreshProgress() {
    const consented = consentEl.checked;
    gatedSectionsEl.classList.toggle("locked", !consented);
    consentStatusEl.textContent = consented
      ? "Confirmed — capture sections below are unlocked."
      : "Not yet confirmed — capture sections below are locked.";
    consentStatusEl.classList.toggle("ok", consented);

    const textDone = !!(textSampleEl.value && textSampleEl.value.trim().length);
    const audioDone = !!audioBlob;
    const exprCount = Object.keys(selfies).length;

    textBadgeEl.textContent = textDone ? "Captured" : "Not started";
    textBadgeEl.classList.toggle("done", textDone);
    audioBadgeEl.textContent = audioDone
      ? "Captured"
      : recordingAudio
        ? "Recording…"
        : "Not started";
    audioBadgeEl.classList.toggle("done", audioDone);
    videoBadgeEl.textContent = `${exprCount} / 7`;
    videoBadgeEl.classList.toggle("done", exprCount === 7);

    const readyCount = (textDone ? 1 : 0) + (audioDone ? 1 : 0) + exprCount;
    document.getElementById("progressChipText").textContent =
      `${readyCount} of ${TOTAL_ITEMS} items ready`;
    document
      .getElementById("progressChipDot")
      .classList.toggle("active", readyCount > 0);

    const anyReady = textDone || audioDone || exprCount > 0;
    if (uploadAllBtn) uploadAllBtn.disabled = !(consented && anyReady) || !serverAvailable;
  }

  consentEl.addEventListener("change", refreshProgress);

  // Text sample
  const textSampleEl = document.getElementById("textSample");
  const textStatus = document.getElementById("textStatus");
  const textBadgeEl = document.getElementById("textBadge");
  textSampleEl.addEventListener("input", () => {
    if (!consentEl.checked) {
      textStatus.textContent = "Please confirm consent above first";
      return;
    }
    const len = textSampleEl.value.trim().length;
    textStatus.textContent = len ? `${len} characters` : "Idle";
    refreshProgress();
  });

  // Audio controls
  const startAudioBtn = document.getElementById("startAudio");
  const stopAudioBtn = document.getElementById("stopAudio");
  const audioStatusText = document.getElementById("audioStatusText");
  const audioRecDot = document.getElementById("audioRecDot");
  const audioBadgeEl = document.getElementById("audioBadge");
  const audioPlayback = document.getElementById("audioPlayback");
  let recordingAudio = false;

  function tickAudioTimer() {
    if (!audioRecordStart) return;
    audioStatusText.textContent = `Recording… ${fmtTime(Date.now() - audioRecordStart)}`;
  }

  startAudioBtn.addEventListener("click", async () => {
    if (!consentEl.checked) {
      alert("Please confirm consent before recording.");
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioRecorder = new MediaRecorder(s);
      audioChunks = [];
      audioRecorder.ondataavailable = (e) => audioChunks.push(e.data);
      audioRecorder.onstop = () => {
        audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        audioPlayback.src = URL.createObjectURL(audioBlob);
        refreshProgress();
      };
      audioRecorder.start();
      recordingAudio = true;
      audioRecordStart = Date.now();
      audioTimerId = setInterval(tickAudioTimer, 500);
      tickAudioTimer();
      audioRecDot.classList.add("active");
      startAudioBtn.disabled = true;
      stopAudioBtn.disabled = false;
      refreshProgress();
    } catch (e) {
      alert("Microphone access required.");
    }
  });
  stopAudioBtn.addEventListener("click", () => {
    if (audioRecorder && audioRecorder.state === "recording")
      audioRecorder.stop();
    recordingAudio = false;
    clearInterval(audioTimerId);
    audioTimerId = null;
    audioRecordStart = null;
    audioRecDot.classList.remove("active");
    audioStatusText.textContent = "Stopped";
    startAudioBtn.disabled = false;
    stopAudioBtn.disabled = true;
    refreshProgress();
  });

  // Camera preview + per-expression selfies
  const videoPreview = document.getElementById("videoPreview");
  const selfieCanvas = document.getElementById("selfieCanvas");
  const expressionGrid = document.getElementById("expressionCapture");
  const videoBadgeEl = document.getElementById("videoBadge");
  let cameraReady = false;

  // Matches the 7 FER2013 categories used in ml/train_video_model_TEMPLATE.py,
  // so captures here can be folded straight into that pipeline as labeled
  // Indian-face examples alongside FER2013/InFER/iSAFE/etc.
  const EXPRESSIONS = [
    { key: "neutral", label: "Neutral", emoji: "😐" },
    { key: "happy", label: "Happy", emoji: "🙂" },
    { key: "sad", label: "Sad", emoji: "🙁" },
    { key: "angry", label: "Angry", emoji: "😠" },
    { key: "surprise", label: "Surprised", emoji: "😮" },
    { key: "fear", label: "Fearful", emoji: "😨" },
    { key: "disgust", label: "Disgusted", emoji: "🤢" },
  ];
  const selfies = {}; // key -> blob

  function buildExpressionGrid() {
    expressionGrid.innerHTML = "";
    EXPRESSIONS.forEach(({ key, label, emoji }) => {
      const card = document.createElement("div");
      card.className = "expr-card";
      card.id = `expr-card-${key}`;
      card.innerHTML = `
        <span class="expr-check" aria-hidden="true">✓</span>
        <div class="expr-thumb-wrap">
          <img class="expr-thumb hidden" id="expr-thumb-${key}" alt="${label} selfie preview" />
          <span class="expr-emoji" id="expr-emoji-${key}" aria-hidden="true">${emoji}</span>
        </div>
        <span class="expr-label">${label}</span>
        <button id="expr-btn-${key}" class="btn btn-primary">Take photo</button>
        <span class="expr-status" id="expr-status-${key}">Not captured</span>
        <span class="expr-analysis" id="expr-analysis-${key}"></span>
      `;
      expressionGrid.appendChild(card);
      document
        .getElementById(`expr-btn-${key}`)
        .addEventListener("click", () => captureExpression(key, label));
    });
  }
  buildExpressionGrid();

  function ensureCamera() {
    if (cameraReady) return Promise.resolve();
    if (!consentEl.checked) {
      return Promise.reject(new Error("Consent required."));
    }
    return navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 640, facingMode: "user" } })
      .then((stream) => {
        videoStream = stream;
        videoPreview.srcObject = stream;
        cameraReady = true;
      });
  }

  function captureExpression(key, label) {
    ensureCamera()
      .catch((err) => {
        if (err.message === "Consent required.") {
          alert("Please confirm consent before taking a photo.");
        } else {
          alert("Camera access required.");
        }
        throw err;
      })
      .then(() => {
        const v = videoPreview;
        if (!v.videoWidth || !v.videoHeight) {
          alert("Camera not ready.");
          return;
        }
        const captureSize = 640;
        selfieCanvas.width = captureSize;
        selfieCanvas.height = captureSize;
        const ctx = selfieCanvas.getContext("2d");
        const side = Math.min(v.videoWidth, v.videoHeight);
        const sx = Math.max(0, (v.videoWidth - side) / 2);
        const sy = Math.max(0, (v.videoHeight - side) / 2);
        ctx.drawImage(v, sx, sy, side, side, 0, 0, captureSize, captureSize);
        selfieCanvas.toBlob((b) => {
          selfies[key] = b;
          const thumb = document.getElementById(`expr-thumb-${key}`);
          thumb.src = URL.createObjectURL(b);
          thumb.classList.remove("hidden");
          const status = document.getElementById(`expr-status-${key}`);
          const analysis = document.getElementById(`expr-analysis-${key}`);
          const emoji = EXPRESSIONS.find((e) => e.key === key)?.emoji || "🙂";
          status.textContent = `Photo taken.`;
          analysis.textContent = `Analyzed as ${emoji} ${label}`;
          document.getElementById(`expr-card-${key}`).classList.add("done");
          refreshProgress();
        }, "image/png");
      })
      .catch(() => {});
  }

  // Upload to MongoDB (optional NoSQL storage — see db.py / server.py).
  // The action is enabled only after the availability check finds a
  // MindLens server with a connected database.
  if (uploadAllBtn) {
    uploadAllBtn.addEventListener("click", async () => {
      if (!consentEl.checked) {
        alert("Consent required");
        return;
      }
      const capturedExpressions = Object.keys(selfies);
      const meta = {
        pid: pidEl.value || null,
        age: ageEl.value || null,
        gender: genderEl.value || null,
        consent: true,
        text_sample: textSampleEl.value.trim() || null,
        expressions_captured: capturedExpressions,
      };

      const formData = new FormData();
      formData.append("meta", JSON.stringify(meta));
      if (audioBlob) {
        formData.append(
          "audio",
          audioBlob,
          `${meta.pid || "participant"}-audio.webm`,
        );
      }
      capturedExpressions.forEach((key) => {
        formData.append(
          `selfie_${key}`,
          selfies[key],
          `${meta.pid || "participant"}-selfie-${key}.png`,
        );
      });

      uploadAllBtn.disabled = true;
      uploadAllBtn.textContent = "Uploading to MongoDB…";
      uploadStatusEl.textContent = "";
      uploadStatusEl.classList.remove("error", "ok");
      try {
        const resp = await fetch("/api/collect", {
          method: "POST",
          body: formData,
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(data.message || data.error || `Server returned ${resp.status}`);
        }
        uploadStatusEl.textContent = `Uploaded to MongoDB as sample ${data.id}. Files stored: ${(data.filesStored || []).length}. Export it with ml/export_from_mongo.py when you are ready to train.`;
        uploadStatusEl.classList.add("ok");
        await loadUploadedSamples();
      } catch (err) {
        uploadStatusEl.textContent = `Upload failed: ${err.message}. The captured files remain only in this browser until a successful upload.`;
        uploadStatusEl.classList.add("error");
      } finally {
        uploadAllBtn.textContent = "Upload sample to MongoDB";
        refreshProgress();
      }
    });
  }

  function formatFileSize(bytes) {
    if (!Number.isFinite(bytes)) return "";
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  function renderUploadedSamples(samples) {
    mongoSamplesEl.replaceChildren();
    if (!samples.length) {
      const empty = document.createElement("p");
      empty.className = "mongo-empty";
      empty.textContent = "No uploaded samples yet.";
      mongoSamplesEl.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    samples.forEach((sample) => {
      const item = document.createElement("article");
      item.className = "mongo-sample";

      const title = document.createElement("strong");
      title.textContent = sample.pid ? `Participant: ${sample.pid}` : "Participant: not specified";
      item.appendChild(title);

      const timestamp = document.createElement("span");
      timestamp.className = "mongo-sample-time";
      const created = new Date(sample.created_at);
      timestamp.textContent = Number.isNaN(created.getTime())
        ? "Upload time unavailable"
        : `Uploaded ${created.toLocaleString()}`;
      item.appendChild(timestamp);

      const fileEntries = Object.entries(sample.file_names || {});
      const files = document.createElement("ul");
      files.className = "mongo-file-list";
      if (sample.text_sample) {
        const textFile = document.createElement("li");
        textFile.textContent = "Text sample (stored in MongoDB document)";
        files.appendChild(textFile);
      }
      fileEntries.forEach(([field, file]) => {
        const fileItem = document.createElement("li");
        const name = file && file.name ? file.name : field;
        const details = [file && file.content_type, formatFileSize(file && file.size)]
          .filter(Boolean)
          .join(", ");
        fileItem.textContent = details ? `${name} (${details})` : name;
        files.appendChild(fileItem);
      });
      if (!files.childElementCount) {
        const noFiles = document.createElement("li");
        noFiles.textContent = "No files stored with this sample.";
        files.appendChild(noFiles);
      }
      item.appendChild(files);

      const id = document.createElement("span");
      id.className = "mongo-sample-id";
      id.textContent = `Sample ID: ${sample._id}`;
      item.appendChild(id);
      fragment.appendChild(item);
    });
    mongoSamplesEl.appendChild(fragment);
  }

  async function loadUploadedSamples() {
    if (!serverAvailable) return;
    refreshMongoSamplesBtn.disabled = true;
    mongoSamplesStatusEl.textContent = "Loading uploaded samples...";
    try {
      const resp = await fetch("/api/collect?limit=50", { method: "GET" });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.message || data.error || `Server returned ${resp.status}`);
      }
      const samples = Array.isArray(data.samples) ? data.samples : [];
      renderUploadedSamples(samples);
      mongoSamplesStatusEl.textContent = `${samples.length} uploaded sample${samples.length === 1 ? "" : "s"} shown.`;
    } catch (err) {
      mongoSamplesEl.replaceChildren();
      mongoSamplesStatusEl.textContent = `Could not load uploaded samples: ${err.message}`;
    } finally {
      refreshMongoSamplesBtn.disabled = !serverAvailable;
    }
  }

  refreshMongoSamplesBtn.addEventListener("click", loadUploadedSamples);

  // small safety: warn before leaving while recordings exist
  window.addEventListener("beforeunload", (e) => {
    if (
      (audioChunks && audioChunks.length) ||
      Object.keys(selfies).length ||
      (textSampleEl && textSampleEl.value.trim())
    ) {
      e.preventDefault();
      e.returnValue = "You have unsaved recordings.";
    }
  });

  refreshProgress();
})();
