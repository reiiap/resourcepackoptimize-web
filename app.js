const state = {
  files: new Map(),
  originalSize: 0,
  optimizedBlob: null,
  optimizedName: 'resourcepack-optimized.zip',
  optimizedSize: 0,
  removedShaderFiles: 0,
  dedupedCount: 0,
  sourceName: '',
};

const steps = ['import', 'analysis', 'optimization', 'export'];
const panels = {
  import: document.getElementById('panel-import'),
  analysis: document.getElementById('panel-analysis'),
  optimization: document.getElementById('panel-optimization'),
  export: document.getElementById('panel-export'),
};

const importStatus = document.getElementById('import-status');
const optimizeStatus = document.getElementById('optimize-status');
const statsGrid = document.getElementById('stats-grid');
const resultGrid = document.getElementById('result-grid');
const compressionLevelInput = document.getElementById('compression-level');
const compressionLabel = document.getElementById('compression-label');
const fetchButton = document.getElementById('fetch-url');
const urlInput = document.getElementById('url-input');
const corsInput = document.getElementById('cors-prefix');


const AUTO_PROXY_TEMPLATES = [
  'https://corsproxy.io/?{url}',
  'https://api.allorigins.win/raw?url={url}',
  'https://cors.isomorphic-git.org/{url}',
];


const importProgress = {
  bar: document.getElementById('import-progress'),
  value: document.getElementById('import-progress-value'),
  label: document.getElementById('import-progress-label'),
};

const optimizeProgress = {
  bar: document.getElementById('optimize-progress'),
  value: document.getElementById('optimize-progress-value'),
  label: document.getElementById('optimize-progress-label'),
};

function setProgress(target, percent, text) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  target.bar.value = clamped;
  target.value.textContent = `${clamped}%`;
  if (text) {
    target.label.textContent = text;
  }
}

function setStep(step) {
  for (const element of document.querySelectorAll('.steps li')) {
    element.classList.toggle('active', Number(element.dataset.step) === step);
  }
  for (const [key, panel] of Object.entries(panels)) {
    panel.classList.toggle('hidden', key !== steps[step - 1]);
  }
}

function bytesToMB(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function setStatus(el, text, type = 'muted') {
  el.textContent = text;
  el.className = `status ${type}`;
}

function simpleHash(u8) {
  let hash = 2166136261;
  for (let i = 0; i < u8.length; i += 1) {
    hash ^= u8[i];
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

function isShaderFile(path) {
  return path.toLowerCase().startsWith('assets/minecraft/shaders/');
}

function normalizeUrl(rawUrl) {
  if (!rawUrl) {
    return '';
  }

  const hasProtocol = /^https?:\/\//i.test(rawUrl);
  return hasProtocol ? rawUrl : `https://${rawUrl}`;
}

function buildSourceVariants(url) {
  const variants = [url];

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (host.includes('dropbox.com')) {
      const u1 = new URL(parsed.toString());
      u1.searchParams.set('dl', '1');
      variants.push(u1.toString());

      const u2 = new URL(parsed.toString());
      u2.hostname = 'dl.dropboxusercontent.com';
      u2.searchParams.set('dl', '1');
      variants.push(u2.toString());

      const u3 = new URL(parsed.toString());
      u3.hostname = 'dl.dropboxusercontent.com';
      u3.searchParams.set('raw', '1');
      variants.push(u3.toString());
    }
  } catch {
    return variants;
  }

  return [...new Set(variants)];
}

function buildTemplateCandidates(url, template) {
  if (!template) {
    return [];
  }

  if (template.includes('{url}')) {
    return [
      template.replaceAll('{url}', encodeURIComponent(url)),
      template.replaceAll('{url}', url),
    ];
  }

  const slashTemplate = template.endsWith('/') ? template : `${template}/`;
  return [`${slashTemplate}${url}`, `${slashTemplate}${encodeURIComponent(url)}`];
}

function buildCandidateUrls(url, corsPrefix) {
  const candidates = [];
  const sourceVariants = buildSourceVariants(url);

  for (const sourceUrl of sourceVariants) {
    candidates.push(sourceUrl);

    if (corsPrefix.trim()) {
      candidates.push(...buildTemplateCandidates(sourceUrl, corsPrefix.trim()));
    }

    for (const proxyTemplate of AUTO_PROXY_TEMPLATES) {
      candidates.push(...buildTemplateCandidates(sourceUrl, proxyTemplate));
    }
  }

  return [...new Set(candidates)];
}

function buildStats() {
  const files = [...state.files.values()];
  const pngCount = files.filter((f) => f.path.endsWith('.png')).length;
  const oggCount = files.filter((f) => f.path.endsWith('.ogg')).length;

  statsGrid.innerHTML = '';
  [
    ['Sumber', state.sourceName || '-'],
    ['Total File', files.length],
    ['Total Size', bytesToMB(state.originalSize)],
    ['PNG', pngCount],
    ['OGG', oggCount],
  ].forEach(([k, v]) => {
    const stat = document.createElement('article');
    stat.className = 'stat';
    stat.innerHTML = `<p class="k">${k}</p><p class="v">${v}</p>`;
    statsGrid.appendChild(stat);
  });
}

async function fetchWithProgress(url, timeoutMs = 45000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort('timeout');
  }, timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const total = Number(response.headers.get('content-length') || 0);
    const reader = response.body?.getReader();

    if (!reader) {
      const blob = await response.blob();
      setProgress(importProgress, 100, 'Download selesai.');
      return blob;
    }

    let received = 0;
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      chunks.push(value);
      received += value.length;

      if (total > 0) {
        const percent = (received / total) * 100;
        setProgress(importProgress, percent, `Mendownload... ${bytesToMB(received)} / ${bytesToMB(total)}`);
      } else {
        const pseudo = Math.min(95, Math.floor(received / (1024 * 256)));
        setProgress(importProgress, pseudo, `Mendownload... ${bytesToMB(received)}`);
      }
    }

    setProgress(importProgress, 100, 'Download selesai.');
    return new Blob(chunks, { type: 'application/zip' });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Request timeout > ${Math.floor(timeoutMs / 1000)} detik`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function loadZipBlob(blob) {
  if (!window.JSZip) {
    throw new Error('Library JSZip gagal dimuat. Cek koneksi internet untuk CDN.');
  }

  state.files.clear();
  state.originalSize = 0;

  const zip = await JSZip.loadAsync(blob);
  const entries = Object.values(zip.files).filter((e) => !e.dir);

  if (entries.length === 0) {
    throw new Error('ZIP kosong atau tidak valid.');
  }

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const bytes = await entry.async('uint8array');
    state.files.set(entry.name, { path: entry.name, bytes });
    state.originalSize += bytes.byteLength;

    const percent = ((i + 1) / entries.length) * 100;
    setProgress(importProgress, percent, `Menganalisis ZIP... ${i + 1}/${entries.length}`);
  }
}

async function loadFromLink() {
  const rawUrl = urlInput.value.trim();
  const corsPrefix = corsInput.value.trim();

  if (!rawUrl) {
    throw new Error('Link ZIP wajib diisi.');
  }

  const url = normalizeUrl(rawUrl);
  const candidates = buildCandidateUrls(url, corsPrefix);
  const errors = [];

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    try {
      setProgress(importProgress, 2, `Coba koneksi ${i + 1}/${candidates.length}...`);
      const zipBlob = await fetchWithProgress(candidate);
      await loadZipBlob(zipBlob);
      state.sourceName = url.split('/').pop() || 'remote-pack.zip';
      return;
    } catch (error) {
      errors.push(`[${i + 1}] ${error.message}`);
    }
  }

  console.error('Detail semua jalur gagal:', errors);
  throw new Error('Semua jalur gagal (CORS/akses ditolak).');
}

async function loadDemoPack() {
  state.files.clear();
  state.originalSize = 0;

  const encoder = new TextEncoder();
  const demoEntries = [
    ['pack.mcmeta', '{"pack":{"pack_format":34,"description":"demo"}}'],
    ['assets/minecraft/textures/block/stone.png', encoder.encode('PNG_DEMO_TEXTURE')],
    ['assets/minecraft/sounds/entity/allay/death.ogg', encoder.encode('OGG_DEMO')],
    ['assets/minecraft/shaders/core/fog.fsh', 'shader file'],
  ];

  for (let i = 0; i < demoEntries.length; i += 1) {
    const [path, content] = demoEntries[i];
    const bytes = content instanceof Uint8Array ? content : encoder.encode(content);
    state.files.set(path, { path, bytes });
    state.originalSize += bytes.byteLength;
    setProgress(importProgress, ((i + 1) / demoEntries.length) * 100, `Muat demo... ${i + 1}/${demoEntries.length}`);
  }

  state.sourceName = 'demo-pack';
}

function renderResult(before, after, profileMode) {
  const savedBytes = Math.max(before - after, 0);
  const ratio = before > 0 ? ((savedBytes / before) * 100).toFixed(2) : '0.00';

  resultGrid.innerHTML = '';
  [
    ['Profil', profileMode === 'audio' ? 'Profile B - Advanced Audio Focus' : 'Profile A - Standard Safe'],
    ['Ukuran Awal', bytesToMB(before)],
    ['Ukuran Akhir', bytesToMB(after)],
    ['Pengurangan', `${bytesToMB(savedBytes)} (${ratio}%)`],
    ['Shader Dihapus', state.removedShaderFiles],
    ['File Duplikat Dihapus', state.dedupedCount],
  ].forEach(([k, v]) => {
    const stat = document.createElement('article');
    stat.className = 'stat';
    stat.innerHTML = `<p class="k">${k}</p><p class="v">${v}</p>`;
    resultGrid.appendChild(stat);
  });
}

async function optimizePack() {
  if (state.files.size === 0) {
    throw new Error('Belum ada resourcepack yang dimuat.');
  }
  if (!window.JSZip) {
    throw new Error('JSZip tidak tersedia.');
  }

  state.removedShaderFiles = 0;
  state.dedupedCount = 0;

  const removeShaders = document.getElementById('remove-shaders').checked;
  const dedupe = document.getElementById('dedupe').checked;
  const compressionLevel = Number(compressionLevelInput.value);
  const profileMode = document.getElementById('profile-mode').value;

  const hashMap = new Map();
  const outputZip = new JSZip();
  const files = [...state.files.values()];

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];

    if (removeShaders && isShaderFile(file.path)) {
      state.removedShaderFiles += 1;
      setProgress(optimizeProgress, ((i + 1) / files.length) * 100, `Skip shader: ${i + 1}/${files.length}`);
      continue;
    }

    const data = file.bytes;

    if (dedupe) {
      const hash = `${data.byteLength}-${simpleHash(data)}`;
      if (hashMap.has(hash)) {
        state.dedupedCount += 1;
        setProgress(optimizeProgress, ((i + 1) / files.length) * 100, `Dedupe: ${i + 1}/${files.length}`);
        continue;
      }
      hashMap.set(hash, file.path);
    }

    const shouldStore = profileMode === 'audio' && file.path.endsWith('.ogg');
    outputZip.file(file.path, data, { compression: shouldStore ? 'STORE' : 'DEFLATE' });

    const percent = ((i + 1) / files.length) * 100;
    setProgress(optimizeProgress, percent, `Optimasi file... ${i + 1}/${files.length}`);
  }

  setProgress(optimizeProgress, 96, 'Finalisasi ZIP...');

  const optimizedBlob = await outputZip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: compressionLevel },
  });

  const nameInput = document.getElementById('output-name').value.trim();
  state.optimizedName = `${(nameInput || 'resourcepack-optimized').replace(/\.zip$/i, '')}.zip`;
  state.optimizedBlob = optimizedBlob;
  state.optimizedSize = optimizedBlob.size;

  setProgress(optimizeProgress, 100, 'Optimasi selesai.');
  return profileMode;
}

function resetAll() {
  state.files.clear();
  state.originalSize = 0;
  state.optimizedBlob = null;
  state.optimizedSize = 0;
  state.sourceName = '';

  fetchButton.disabled = false;
  setProgress(importProgress, 0, 'Menunggu link...');
  setProgress(optimizeProgress, 0, 'Menunggu proses optimasi...');
  setStatus(importStatus, 'Belum ada file yang dimuat.', 'muted');
  setStatus(optimizeStatus, 'Siap untuk optimasi.', 'muted');
  setStep(1);
}

async function onFetchUrl() {
  try {
    fetchButton.disabled = true;
    setStatus(importStatus, 'Mengambil file dari link...', 'muted');
    setProgress(importProgress, 1, 'Memulai request...');

    await loadFromLink();
    buildStats();
    setStatus(importStatus, `Berhasil memuat ${state.files.size} file dari link.`, 'success');
    setStep(2);
  } catch (error) {
    setStatus(importStatus, `Gagal mengambil link: ${error.message}`, 'error');
  } finally {
    fetchButton.disabled = false;
  }
}

function boot() {
  setStep(1);
  resetAll();

  fetchButton.addEventListener('click', onFetchUrl);

  urlInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onFetchUrl();
    }
  });

  document.getElementById('load-demo').addEventListener('click', async () => {
    await loadDemoPack();
    buildStats();
    setStatus(importStatus, 'Demo pack berhasil dimuat.', 'success');
    setStep(2);
  });

  document.getElementById('to-optimization').addEventListener('click', () => {
    setStep(3);
  });

  document.getElementById('back-analysis').addEventListener('click', () => {
    setStep(2);
  });

  compressionLevelInput.addEventListener('input', () => {
    compressionLabel.textContent = compressionLevelInput.value;
  });

  document.getElementById('run-optimize').addEventListener('click', async () => {
    try {
      setStatus(optimizeStatus, 'Optimasi berjalan...', 'muted');
      const profileMode = await optimizePack();
      renderResult(state.originalSize, state.optimizedSize, profileMode);
      setStatus(optimizeStatus, 'Optimasi selesai tanpa error.', 'success');
      setStep(4);
    } catch (error) {
      setStatus(optimizeStatus, `Optimasi gagal: ${error.message}`, 'error');
    }
  });

  document.getElementById('download-btn').addEventListener('click', () => {
    if (!state.optimizedBlob) {
      return;
    }
    saveAs(state.optimizedBlob, state.optimizedName);
  });

  document.getElementById('restart-btn').addEventListener('click', () => {
    resetAll();
  });
}

boot();
