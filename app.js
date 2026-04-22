const state = {
  files: new Map(),
  originalSize: 0,
  optimizedBlob: null,
  optimizedName: 'resourcepack-optimized.zip',
  optimizedSize: 0,
  removedCount: 0,
  dedupedCount: 0,
};

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

function setStep(step) {
  for (const element of document.querySelectorAll('.steps li')) {
    element.classList.toggle('active', Number(element.dataset.step) === step);
  }
  for (const [key, panel] of Object.entries(panels)) {
    panel.classList.toggle('hidden', key !== ['import', 'analysis', 'optimization', 'export'][step - 1]);
  }
}

function bytesToMB(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function setStatus(el, text, type = 'muted') {
  el.textContent = text;
  el.className = `status ${type}`;
}

function isRemovableMeta(path) {
  const lower = path.toLowerCase();
  return lower.endsWith('.ds_store') || lower.endsWith('thumbs.db') || lower.includes('__macosx/');
}

function simpleHash(u8) {
  let hash = 2166136261;
  for (let i = 0; i < u8.length; i += 1) {
    hash ^= u8[i];
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

function buildStats() {
  const files = [...state.files.values()];
  const textureCount = files.filter((f) => f.path.startsWith('assets/') && f.path.endsWith('.png')).length;
  const jsonCount = files.filter((f) => f.path.endsWith('.json') || f.path.endsWith('.mcmeta')).length;

  statsGrid.innerHTML = '';
  [
    ['Total File', files.length],
    ['Total Size', bytesToMB(state.originalSize)],
    ['Texture PNG', textureCount],
    ['JSON/MCMETA', jsonCount],
  ].forEach(([k, v]) => {
    const stat = document.createElement('article');
    stat.className = 'stat';
    stat.innerHTML = `<p class="k">${k}</p><p class="v">${v}</p>`;
    statsGrid.appendChild(stat);
  });
}

async function loadZipFile(file) {
  if (!window.JSZip) {
    throw new Error('Library JSZip gagal dimuat. Cek koneksi internet untuk CDN.');
  }

  state.files.clear();
  state.originalSize = 0;

  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files);
  for (const entry of entries) {
    if (entry.dir) {
      continue;
    }
    const bytes = await entry.async('uint8array');
    state.files.set(entry.name, {
      path: entry.name,
      bytes,
      size: bytes.byteLength,
      source: 'zip',
    });
    state.originalSize += bytes.byteLength;
  }
}

async function loadFolderFiles(fileList) {
  state.files.clear();
  state.originalSize = 0;

  for (const file of fileList) {
    const path = file.webkitRelativePath || file.name;
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    state.files.set(path, {
      path,
      bytes,
      size: bytes.byteLength,
      source: 'folder',
    });
    state.originalSize += bytes.byteLength;
  }
}

async function loadDemoPack() {
  state.files.clear();
  state.originalSize = 0;

  const encoder = new TextEncoder();
  const demoEntries = [
    ['pack.mcmeta', '{ "pack": {"pack_format": 34, "description": "demo   pack"}}'],
    ['assets/minecraft/models/block/stone.json', '{  "parent": "block/cube_all"  }'],
    ['assets/minecraft/lang/en_us.json', '{ "block.minecraft.stone": "Stone" }'],
    ['assets/minecraft/textures/block/placeholder.png', encoder.encode('PNGDEMO')],
    ['.DS_Store', 'ignore me'],
  ];

  for (const [path, content] of demoEntries) {
    const bytes = content instanceof Uint8Array ? content : encoder.encode(content);
    state.files.set(path, { path, bytes, size: bytes.byteLength, source: 'demo' });
    state.originalSize += bytes.byteLength;
  }
}

function renderResult(before, after) {
  const savedBytes = Math.max(before - after, 0);
  const ratio = before > 0 ? ((savedBytes / before) * 100).toFixed(2) : '0.00';

  resultGrid.innerHTML = '';
  [
    ['Ukuran Awal', bytesToMB(before)],
    ['Ukuran Akhir', bytesToMB(after)],
    ['Pengurangan', `${bytesToMB(savedBytes)} (${ratio}%)`],
    ['File Meta Dihapus', state.removedCount],
    ['File Duplikat Dihapus', state.dedupedCount],
  ].forEach(([k, v]) => {
    const stat = document.createElement('article');
    stat.className = 'stat';
    stat.innerHTML = `<p class="k">${k}</p><p class="v">${v}</p>`;
    resultGrid.appendChild(stat);
  });
}

function minifyTextFile(path, bytes) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const text = decoder.decode(bytes);

  if (path.endsWith('.json') || path.endsWith('.mcmeta')) {
    try {
      const parsed = JSON.parse(text);
      return encoder.encode(JSON.stringify(parsed));
    } catch {
      return bytes;
    }
  }

  return bytes;
}

async function optimizePack() {
  if (state.files.size === 0) {
    throw new Error('Belum ada resourcepack yang dimuat.');
  }
  if (!window.JSZip) {
    throw new Error('JSZip tidak tersedia.');
  }

  state.removedCount = 0;
  state.dedupedCount = 0;

  const removeMeta = document.getElementById('remove-meta').checked;
  const dedupe = document.getElementById('dedupe').checked;
  const flattenWhitespace = document.getElementById('flatten-whitespace').checked;
  const compressionLevel = Number(compressionLevelInput.value);

  const hashMap = new Map();
  const outputZip = new JSZip();

  for (const file of state.files.values()) {
    if (removeMeta && isRemovableMeta(file.path)) {
      state.removedCount += 1;
      continue;
    }

    let data = file.bytes;
    if (flattenWhitespace) {
      data = minifyTextFile(file.path, data);
    }

    if (dedupe) {
      const hash = `${data.byteLength}-${simpleHash(data)}`;
      if (hashMap.has(hash)) {
        state.dedupedCount += 1;
        continue;
      }
      hashMap.set(hash, file.path);
    }

    outputZip.file(file.path, data);
  }

  const optimizedBlob = await outputZip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: compressionLevel },
  });

  const nameInput = document.getElementById('output-name').value.trim();
  state.optimizedName = `${(nameInput || 'resourcepack-optimized').replace(/\.zip$/i, '')}.zip`;
  state.optimizedBlob = optimizedBlob;
  state.optimizedSize = optimizedBlob.size;
}

function boot() {
  setStep(1);

  document.getElementById('zip-input').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      setStatus(importStatus, 'Memproses ZIP...', 'muted');
      await loadZipFile(file);
      buildStats();
      setStatus(importStatus, `Berhasil memuat ${state.files.size} file dari ${file.name}.`, 'success');
      setStep(2);
    } catch (error) {
      setStatus(importStatus, `Gagal memuat ZIP: ${error.message}`, 'error');
    }
  });

  document.getElementById('folder-input').addEventListener('change', async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    try {
      setStatus(importStatus, 'Memproses folder...', 'muted');
      await loadFolderFiles(files);
      buildStats();
      setStatus(importStatus, `Berhasil memuat ${state.files.size} file dari folder.`, 'success');
      setStep(2);
    } catch (error) {
      setStatus(importStatus, `Gagal memuat folder: ${error.message}`, 'error');
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
      await optimizePack();
      renderResult(state.originalSize, state.optimizedSize);
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
    state.optimizedBlob = null;
    state.optimizedSize = 0;
    setStep(1);
    setStatus(importStatus, 'Belum ada file yang dipilih.', 'muted');
    setStatus(optimizeStatus, 'Siap untuk optimasi.', 'muted');
  });
}

boot();
