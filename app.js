const state = {
  zipFile: null,
  sourceZip: null,
  optimizedBlob: null,
  stats: {
    total: 0,
    png: 0,
    json: 0,
    inputBytes: 0,
    outputBytes: 0,
  },
};

const $ = (id) => document.getElementById(id);
const els = {
  zipInput: $("zipInput"),
  pickBtn: $("pickBtn"),
  dropzone: $("dropzone"),
  selectedFile: $("selectedFile"),
  analyzeBtn: $("analyzeBtn"),
  optimizeBtn: $("optimizeBtn"),
  downloadBtn: $("downloadBtn"),
  summaryList: $("summaryList"),
  progressBar: $("progressBar"),
  statusText: $("statusText"),
  logPanel: $("logPanel"),
  quality: $("quality"),
  qualityValue: $("qualityValue"),
  minifyJson: $("minifyJson"),
  normalizeTextures: $("normalizeTextures"),
  removeEmpty: $("removeEmpty"),
  stepper: $("stepper"),
};

function updateStep(stepIndex) {
  [...els.stepper.children].forEach((child, idx) => {
    child.classList.toggle("active", idx <= stepIndex);
  });
}

function log(message) {
  const now = new Date().toLocaleTimeString("id-ID", { hour12: false });
  els.logPanel.textContent += `[${now}] ${message}\n`;
  els.logPanel.scrollTop = els.logPanel.scrollHeight;
}

function updateStatus(text, progress = null) {
  els.statusText.textContent = text;
  if (progress !== null) {
    els.progressBar.style.width = `${Math.max(0, Math.min(progress, 100))}%`;
  }
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let value = bytes;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value < 10 && i > 0 ? 2 : 1)} ${units[i]}`;
}

function refreshSummary(estimatedSavings = null) {
  const savings =
    estimatedSavings ??
    Math.max(0, (state.stats.inputBytes - state.stats.outputBytes) / Math.max(state.stats.inputBytes, 1));

  const rows = [
    `Total file: <span>${state.stats.total || "-"}</span>`,
    `PNG texture: <span>${state.stats.png || "-"}</span>`,
    `JSON config: <span>${state.stats.json || "-"}</span>`,
    `Ukuran awal: <span>${formatBytes(state.stats.inputBytes)}</span>`,
    `Estimasi hemat: <span>${(savings * 100).toFixed(1)}%</span>`,
  ];

  els.summaryList.innerHTML = rows.map((r) => `<li>${r}</li>`).join("");
}

async function readZipFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  state.sourceZip = await JSZip.loadAsync(arrayBuffer);
}

async function analyzeZip() {
  if (!state.sourceZip) {
    updateStatus("Pilih file ZIP dulu.");
    return;
  }

  updateStep(1);
  updateStatus("Menganalisa isi resourcepack...", 12);
  log("Memulai analisa ZIP...");

  const entries = Object.values(state.sourceZip.files).filter((entry) => !entry.dir);
  state.stats.total = entries.length;
  state.stats.png = entries.filter((entry) => /\.png$/i.test(entry.name)).length;
  state.stats.json = entries.filter((entry) => /\.json$/i.test(entry.name)).length;

  state.stats.inputBytes = 0;
  for (const entry of entries) {
    // eslint-disable-next-line no-await-in-loop
    const data = await entry.async("uint8array");
    state.stats.inputBytes += data.byteLength;
  }

  const roughSavings = Math.min(0.62, (state.stats.png * 0.03 + state.stats.json * 0.01 + 0.08));
  refreshSummary(roughSavings);

  log(`Analisa selesai. File: ${state.stats.total}, PNG: ${state.stats.png}, JSON: ${state.stats.json}`);
  updateStatus("Analisa selesai. Lanjut konfigurasi dan klik Mulai Optimasi.", 26);
  updateStep(2);
  els.optimizeBtn.disabled = false;
}

function minifyJsonText(text) {
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text;
  }
}

async function normalizePng(fileBuffer, quality) {
  const blob = new Blob([fileBuffer], { type: "image/png" });
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { alpha: true });
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);

  const outBlob = await new Promise((resolve) => {
    canvas.toBlob((encoded) => resolve(encoded), "image/png", quality);
  });

  return new Uint8Array(await outBlob.arrayBuffer());
}

async function optimizeZip() {
  if (!state.sourceZip) return;

  const quality = Number(els.quality.value);
  const minifyJson = els.minifyJson.checked;
  const normalizeTextures = els.normalizeTextures.checked;
  const removeEmpty = els.removeEmpty.checked;

  updateStep(3);
  updateStatus("Optimasi dimulai...", 30);
  log("Optimasi dimulai dengan konfigurasi aktif.");

  const outputZip = new JSZip();
  const entries = Object.values(state.sourceZip.files).filter((entry) => !entry.dir);

  let processed = 0;
  state.stats.outputBytes = 0;

  for (const entry of entries) {
    // eslint-disable-next-line no-await-in-loop
    const raw = await entry.async("uint8array");
    let outData = raw;

    if (removeEmpty && raw.byteLength === 0) {
      log(`Skip file kosong: ${entry.name}`);
      processed += 1;
      updateStatus(`Memproses... ${processed}/${entries.length}`, 30 + (processed / entries.length) * 60);
      continue;
    }

    if (/\.json$/i.test(entry.name) && minifyJson) {
      const text = new TextDecoder().decode(raw);
      const minified = minifyJsonText(text);
      outData = new TextEncoder().encode(minified);
      log(`Minify JSON: ${entry.name}`);
    } else if (/\.png$/i.test(entry.name) && normalizeTextures) {
      try {
        // eslint-disable-next-line no-await-in-loop
        outData = await normalizePng(raw, quality);
        log(`Normalize texture: ${entry.name}`);
      } catch {
        log(`Gagal normalize (pakai file asli): ${entry.name}`);
      }
    }

    if (removeEmpty && outData.byteLength > 0 && /\.(txt|json|mcmeta|lang)$/i.test(entry.name)) {
      const plain = new TextDecoder().decode(outData).trim();
      if (!plain) {
        log(`Buang file kosong whitespace: ${entry.name}`);
        processed += 1;
        updateStatus(`Memproses... ${processed}/${entries.length}`, 30 + (processed / entries.length) * 60);
        continue;
      }
    }

    outputZip.file(entry.name, outData);
    state.stats.outputBytes += outData.byteLength;

    processed += 1;
    updateStatus(`Memproses... ${processed}/${entries.length}`, 30 + (processed / entries.length) * 60);
  }

  state.optimizedBlob = await outputZip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 9 } });

  refreshSummary();
  updateStep(4);
  updateStatus("Optimasi selesai. File siap di-download.", 100);
  log(`Optimasi selesai. Ukuran hasil: ${formatBytes(state.optimizedBlob.size)}`);
  els.downloadBtn.disabled = false;
}

function downloadResult() {
  if (!state.optimizedBlob) return;
  const outName = state.zipFile.name.replace(/\.zip$/i, "") + "-optimized.zip";
  const link = document.createElement("a");
  link.href = URL.createObjectURL(state.optimizedBlob);
  link.download = outName;
  link.click();
  URL.revokeObjectURL(link.href);
  updateStatus("Download berhasil dimulai.", 100);
  log(`Download dijalankan: ${outName}`);
}

function onFileSelected(file) {
  if (!file || !/\.zip$/i.test(file.name)) {
    updateStatus("File harus berformat .zip");
    return;
  }

  state.zipFile = file;
  state.sourceZip = null;
  state.optimizedBlob = null;
  els.downloadBtn.disabled = true;
  els.optimizeBtn.disabled = true;
  els.selectedFile.textContent = `${file.name} (${formatBytes(file.size)})`;
  updateStatus("File dipilih. Klik Analisa Paket.", 5);
  updateStep(0);
  els.logPanel.textContent = "";
  log(`File terpilih: ${file.name}`);

  readZipFile(file)
    .then(() => log("ZIP berhasil dibaca di browser."))
    .catch((err) => {
      log(`Gagal membaca ZIP: ${err.message}`);
      updateStatus("Gagal membaca ZIP. Coba file lain.", 0);
    });
}

function wireEvents() {
  els.pickBtn.addEventListener("click", () => els.zipInput.click());
  els.zipInput.addEventListener("change", (event) => onFileSelected(event.target.files[0]));

  els.dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    els.dropzone.classList.add("dragover");
  });
  els.dropzone.addEventListener("dragleave", () => els.dropzone.classList.remove("dragover"));
  els.dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    els.dropzone.classList.remove("dragover");
    onFileSelected(event.dataTransfer.files[0]);
  });

  els.analyzeBtn.addEventListener("click", analyzeZip);
  els.optimizeBtn.addEventListener("click", optimizeZip);
  els.downloadBtn.addEventListener("click", downloadResult);

  els.quality.addEventListener("input", () => {
    els.qualityValue.textContent = Number(els.quality.value).toFixed(2);
  });
}

wireEvents();
refreshSummary();
