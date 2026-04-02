/* ─────────────────────────────────────────────────────────────────────────────
   OpenWebRX Settings Editor — app.js
   ───────────────────────────────────────────────────────────────────────────── */

let state = {
  settings: { version: 8, sdrs: {} }
};
let rawDirty = false;

/* ── Init ─────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  refreshAll();
  syncRawEditor();
});

/* ── Sidebar / nav ────────────────────────────────────────────────────────── */
function toggleSidebar() {
  document.body.classList.toggle('collapsed');
  document.getElementById('sidebar').classList.toggle('collapsed');
}

function showSection(id, el) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('section-' + id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');

  const titles = {
    dashboard: 'Dashboard', global: 'Global Settings',
    devices: 'SDR Devices', profiles: 'Profiles',
    validate: 'Validate', rawjson: 'Raw JSON'
  };
  document.getElementById('topbar-title').textContent = titles[id] || id;

  if (id === 'profiles') renderProfiles();
  if (id === 'rawjson') syncRawEditor();
  if (id === 'dashboard') renderDashboard();
}

/* ── File actions ─────────────────────────────────────────────────────────── */
function triggerImport() {
  document.getElementById('file-import').click();
}

function handleImport(input) {
  const file = input.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  fetch('/api/import', { method: 'POST', body: fd })
    .then(r => r.json())
    .then(data => {
      if (data.error) { toast(data.error, 'error'); return; }
      state.settings = data.settings;
      loadGlobalFields();
      refreshAll();
      toast('Imported ' + file.name, 'success');
      showSection('dashboard', document.querySelector('[onclick*="dashboard"]'));
    })
    .catch(() => toast('Import failed', 'error'));
  input.value = '';
}

function newSettings() {
  confirm_('Start a new empty settings file? Unsaved changes will be lost.', () => {
    state.settings = { version: 8, sdrs: {} };
    loadGlobalFields();
    refreshAll();
    toast('New settings created', 'success');
    showSection('dashboard', null);
  });
}

function exportSettings() {
  fetch('/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state.settings)
  })
  .then(r => {
    if (!r.ok) throw new Error('Export failed');
    return r.blob();
  })
  .then(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'settings.json';
    a.click();
    toast('settings.json exported', 'success');
  })
  .catch(() => toast('Export failed', 'error'));
}

/* ── Global settings ──────────────────────────────────────────────────────── */
const GLOBAL_FIELDS = [
  'version','receiver_name','receiver_location','receiver_gps_lat',
  'receiver_gps_lon','receiver_altitude','receiver_admin',
  'waterfall_max_level','waterfall_min_level','max_clients',
  'audio_compression','fft_size'
];

function loadGlobalFields() {
  const s = state.settings;
  GLOBAL_FIELDS.forEach(k => {
    const el = document.getElementById('g-' + k);
    if (!el) return;
    const v = s[k];
    el.value = (v !== undefined && v !== null) ? v : '';
  });
}

function updateGlobal() {
  GLOBAL_FIELDS.forEach(k => {
    const el = document.getElementById('g-' + k);
    if (!el) return;
    const raw = el.value.trim();
    if (raw === '') {
      delete state.settings[k];
    } else {
      const num = Number(raw);
      state.settings[k] = (!isNaN(num) && raw !== '') ? num : raw;
    }
  });
  // version must always be a number
  if (state.settings.version) state.settings.version = Number(state.settings.version) || 8;
  refreshCounts();
  syncRawEditor();
}

/* ── Refresh helpers ──────────────────────────────────────────────────────── */
function refreshAll() {
  refreshCounts();
  renderDevices();
  renderProfiles();
  renderDashboard();
  syncRawEditor();
}

function refreshCounts() {
  const sdrs = Object.keys(state.settings.sdrs || {});
  const profiles = sdrs.reduce((acc, id) => {
    return acc + Object.keys(state.settings.sdrs[id].profiles || {}).length;
  }, 0);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('sdr-count', sdrs.length);
  set('profile-count', profiles);
  set('stat-sdrs', sdrs.length);
  set('stat-profiles', profiles);
  set('stat-version', state.settings.version || '—');
  const size = new Blob([JSON.stringify(state.settings)]).size;
  set('stat-size', formatBytes(size));
}

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  return (b/1048576).toFixed(2) + ' MB';
}

function formatFreq(hz) {
  if (!hz) return '—';
  if (hz >= 1e9) return (hz/1e9).toFixed(3) + ' GHz';
  if (hz >= 1e6) return (hz/1e6).toFixed(3) + ' MHz';
  if (hz >= 1e3) return (hz/1e3).toFixed(1) + ' kHz';
  return hz + ' Hz';
}

/* ── Dashboard render ─────────────────────────────────────────────────────── */
function renderDashboard() {
  const el = document.getElementById('dashboard-sdr-list');
  const sdrs = state.settings.sdrs || {};
  const ids = Object.keys(sdrs);
  if (!ids.length) {
    el.innerHTML = `<div class="empty-state"><i class="fa fa-tower-broadcast"></i>
      <p>No devices configured. <a href="#" onclick="newSettings()">Start fresh</a> or
      <a href="#" onclick="triggerImport()">import a file</a>.</p></div>`;
    return;
  }
  el.innerHTML = ids.map(id => {
    const sdr = sdrs[id];
    const pCount = Object.keys(sdr.profiles || {}).length;
    return `<div class="dash-sdr-row">
      <div>
        <div class="dash-sdr-name">${esc(sdr.name || id)}</div>
        <div class="dash-sdr-meta">${esc(sdr.type || '—')} · index ${sdr.device_index ?? 0} · gain ${sdr.rf_gain ?? '—'} dB · ${sdr.ppm ?? 0} ppm</div>
      </div>
      <div class="dash-sdr-count">${pCount} profile${pCount !== 1 ? 's' : ''}</div>
    </div>`;
  }).join('');
}

/* ── Devices ──────────────────────────────────────────────────────────────── */
function renderDevices() {
  const el = document.getElementById('devices-list');
  const sdrs = state.settings.sdrs || {};
  const ids = Object.keys(sdrs);
  if (!ids.length) {
    el.innerHTML = `<div class="card"><div class="card-body">
      <div class="empty-state"><i class="fa fa-microchip"></i>
      <p>No SDR devices defined yet. Click <strong>Add Device</strong> to get started.</p>
      </div></div></div>`;
    return;
  }
  el.innerHTML = ids.map(id => {
    const sdr = sdrs[id];
    const pCount = Object.keys(sdr.profiles || {}).length;
    return `<div class="device-card">
      <div class="device-icon"><i class="fa fa-microchip"></i></div>
      <div class="device-info">
        <div class="device-name">${esc(sdr.name || id)}</div>
        <div class="device-meta">ID: ${esc(id)} · ${esc(sdr.type)} · gain ${sdr.rf_gain ?? '—'} · ${pCount} profile${pCount !== 1?'s':''}</div>
      </div>
      <div class="card-actions">
        <button class="icon-btn primary" title="Add Profile to this device" onclick="openProfileModal('${esc(id)}')">
          <i class="fa fa-plus"></i>
        </button>
        <button class="icon-btn" title="Edit Device" onclick="openDeviceModal('${esc(id)}')">
          <i class="fa fa-pen"></i>
        </button>
        <button class="icon-btn danger" title="Delete Device" onclick="deleteDevice('${esc(id)}')">
          <i class="fa fa-trash"></i>
        </button>
      </div>
    </div>`;
  }).join('');
}

function openDeviceModal(editId) {
  const modal = document.getElementById('modal-device');
  const isEdit = !!editId;
  document.getElementById('device-modal-title').textContent = isEdit ? 'Edit SDR Device' : 'Add SDR Device';
  document.getElementById('d-editing-id').value = editId || '';

  // Clear
  ['d-id','d-name','d-type','d-device_index','d-rf_gain','d-ppm','d-device','d-driver'].forEach(f => {
    const el = document.getElementById(f);
    if (el) el.value = '';
  });
  document.getElementById('d-device_index').value = 0;
  document.getElementById('d-ppm').value = 0;

  if (isEdit) {
    const sdr = state.settings.sdrs[editId];
    document.getElementById('d-id').value = editId;
    document.getElementById('d-id').disabled = true;
    document.getElementById('d-name').value = sdr.name || '';
    document.getElementById('d-type').value = sdr.type || 'rtl_sdr';
    document.getElementById('d-device_index').value = sdr.device_index ?? 0;
    document.getElementById('d-rf_gain').value = sdr.rf_gain ?? '';
    document.getElementById('d-ppm').value = sdr.ppm ?? 0;
    document.getElementById('d-device').value = sdr.device || '';
    document.getElementById('d-driver').value = sdr.driver || '';
  } else {
    document.getElementById('d-id').disabled = false;
  }
  openModal('modal-device');
}

function saveDevice() {
  const editId = document.getElementById('d-editing-id').value;
  const id = editId || document.getElementById('d-id').value.trim();
  const name = document.getElementById('d-name').value.trim();
  const type = document.getElementById('d-type').value;

  if (!id) { toast('Device ID is required', 'error'); return; }
  if (!name) { toast('Device name is required', 'error'); return; }

  const existing = editId ? state.settings.sdrs[editId] : {};
  const sdr = {
    ...existing,
    name,
    type,
    device_index: parseInt(document.getElementById('d-device_index').value) || 0,
    profiles: existing.profiles || {}
  };

  const gain = document.getElementById('d-rf_gain').value.trim();
  if (gain) sdr.rf_gain = isNaN(Number(gain)) ? gain : Number(gain);
  else delete sdr.rf_gain;

  const ppm = document.getElementById('d-ppm').value.trim();
  sdr.ppm = ppm !== '' ? (Number(ppm) || 0) : 0;

  const dev = document.getElementById('d-device').value.trim();
  if (dev) sdr.device = dev; else delete sdr.device;

  const drv = document.getElementById('d-driver').value.trim();
  if (drv) sdr.driver = drv; else delete sdr.driver;

  if (editId && editId !== id) {
    delete state.settings.sdrs[editId];
  }
  state.settings.sdrs[id] = sdr;

  closeModal('modal-device');
  refreshAll();
  toast((editId ? 'Updated' : 'Added') + ' device: ' + name, 'success');
}

function deleteDevice(id) {
  confirm_(`Delete device "${id}" and all its profiles?`, () => {
    delete state.settings.sdrs[id];
    refreshAll();
    toast('Deleted device: ' + id, 'warning');
  });
}

/* ── Profiles ─────────────────────────────────────────────────────────────── */
function getProfileFilterSdrEl() { return document.getElementById('profile-filter-sdr'); }

function refreshProfileFilter() {
  const sel = getProfileFilterSdrEl();
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">All Devices</option>' +
    Object.keys(state.settings.sdrs || {}).map(id =>
      `<option value="${esc(id)}">${esc(state.settings.sdrs[id].name || id)}</option>`
    ).join('');
  sel.value = cur;
}

function renderProfiles() {
  refreshProfileFilter();
  const el = document.getElementById('profiles-list');
  const sdrFilter = document.getElementById('profile-filter-sdr')?.value || '';
  const search = (document.getElementById('profile-search')?.value || '').toLowerCase();
  const sdrs = state.settings.sdrs || {};

  let cards = [];
  Object.keys(sdrs).forEach(sdrId => {
    if (sdrFilter && sdrId !== sdrFilter) return;
    const sdr = sdrs[sdrId];
    const profiles = sdr.profiles || {};
    Object.keys(profiles).forEach(profId => {
      const p = profiles[profId];
      if (search && !JSON.stringify(p).toLowerCase().includes(search) && !profId.includes(search)) return;
      cards.push({ sdrId, profId, sdrName: sdr.name || sdrId, p });
    });
  });

  if (!cards.length) {
    el.innerHTML = `<div class="card"><div class="card-body">
      <div class="empty-state"><i class="fa fa-list-radio"></i>
      <p>No profiles found. Add a device first, then add profiles to it.</p>
      </div></div></div>`;
    return;
  }

  el.innerHTML = cards.map(({ sdrId, profId, sdrName, p }) => `
    <div class="profile-card">
      <div class="profile-icon"><i class="fa fa-radio"></i></div>
      <div class="profile-info">
        <div class="profile-name">${esc(p.name || profId)}</div>
        <div class="profile-meta">
          ${esc(sdrName)} · ID: ${esc(profId)} · SR: ${formatFreq(p.samp_rate)}
          ${p.rf_gain !== undefined ? ' · gain '+p.rf_gain : ''}
          ${p.tuning_step ? ' · step '+formatFreq(p.tuning_step) : ''}
        </div>
      </div>
      <div class="profile-freq">${formatFreq(p.center_freq)}</div>
      <div class="mod-badge">${esc(p.start_mod || '—')}</div>
      <div class="card-actions">
        <button class="icon-btn" title="Edit" onclick="openProfileModal('${esc(sdrId)}','${esc(profId)}')">
          <i class="fa fa-pen"></i>
        </button>
        <button class="icon-btn danger" title="Delete" onclick="deleteProfile('${esc(sdrId)}','${esc(profId)}')">
          <i class="fa fa-trash"></i>
        </button>
      </div>
    </div>`).join('');
}

function openProfileModal(defaultSdrId, editProfId) {
  const modal = document.getElementById('modal-profile');
  const isEdit = !!(defaultSdrId && editProfId);
  document.getElementById('profile-modal-title').textContent = isEdit ? 'Edit Profile' : 'Add Profile';
  document.getElementById('p-editing-id').value = editProfId || '';

  // Populate SDR select
  const sdrSel = document.getElementById('p-sdr-select');
  const sdrs = state.settings.sdrs || {};
  sdrSel.innerHTML = Object.keys(sdrs).map(id =>
    `<option value="${esc(id)}">${esc(sdrs[id].name || id)}</option>`
  ).join('');
  if (!Object.keys(sdrs).length) {
    toast('Add an SDR device first', 'warning');
    return;
  }

  // Clear fields
  ['p-id','p-name','p-center_freq','p-start_freq','p-samp_rate',
   'p-rf_gain','p-tuning_step','p-initial_squelch_level','p-_note'].forEach(f => {
    const el = document.getElementById(f);
    if (el) el.value = '';
  });
  document.getElementById('p-start_mod').value = '';
  document.getElementById('p-direct_sampling').value = '';
  document.getElementById('p-offset_tuning').value = '';

  if (defaultSdrId) {
    sdrSel.value = defaultSdrId;
    document.getElementById('p-sdr-id').value = defaultSdrId;
  }

  if (isEdit) {
    sdrSel.disabled = true;
    document.getElementById('p-id').disabled = true;
    const p = sdrs[defaultSdrId].profiles[editProfId];
    document.getElementById('p-sdr-id').value = defaultSdrId;
    document.getElementById('p-id').value = editProfId;
    document.getElementById('p-name').value = p.name || '';
    document.getElementById('p-center_freq').value = p.center_freq || '';
    document.getElementById('p-start_freq').value = p.start_freq || '';
    document.getElementById('p-samp_rate').value = p.samp_rate || '';
    document.getElementById('p-start_mod').value = p.start_mod || '';
    document.getElementById('p-rf_gain').value = p.rf_gain !== undefined ? p.rf_gain : '';
    document.getElementById('p-tuning_step').value = p.tuning_step || '';
    document.getElementById('p-initial_squelch_level').value = p.initial_squelch_level !== undefined ? p.initial_squelch_level : '';
    document.getElementById('p-direct_sampling').value = p.direct_sampling !== undefined ? String(p.direct_sampling) : '';
    document.getElementById('p-offset_tuning').value = p.offset_tuning !== undefined ? String(p.offset_tuning) : '';
    document.getElementById('p-_note').value = p._note || '';
  } else {
    sdrSel.disabled = false;
    document.getElementById('p-id').disabled = false;
  }

  openModal('modal-profile');
}

function saveProfile() {
  const editProfId = document.getElementById('p-editing-id').value;
  const sdrId = document.getElementById('p-sdr-id').value || document.getElementById('p-sdr-select').value;
  const profId = editProfId || document.getElementById('p-id').value.trim();
  const name = document.getElementById('p-name').value.trim();
  const center_freq = parseInt(document.getElementById('p-center_freq').value);

  if (!sdrId) { toast('Select an SDR device', 'error'); return; }
  if (!profId) { toast('Profile ID is required', 'error'); return; }
  if (!name) { toast('Profile name is required', 'error'); return; }
  if (!center_freq) { toast('Center frequency is required', 'error'); return; }

  const prof = {};
  prof.name = name;
  prof.center_freq = center_freq;

  const sf = parseInt(document.getElementById('p-start_freq').value);
  if (sf) prof.start_freq = sf;

  const sr = parseInt(document.getElementById('p-samp_rate').value);
  if (sr) prof.samp_rate = sr;

  const mod = document.getElementById('p-start_mod').value;
  if (mod) prof.start_mod = mod;

  const gain = document.getElementById('p-rf_gain').value.trim();
  if (gain !== '') prof.rf_gain = isNaN(Number(gain)) ? gain : Number(gain);

  const step = parseInt(document.getElementById('p-tuning_step').value);
  if (step) prof.tuning_step = step;

  const sql = document.getElementById('p-initial_squelch_level').value.trim();
  if (sql !== '') prof.initial_squelch_level = Number(sql);

  const ds = document.getElementById('p-direct_sampling').value;
  if (ds !== '') prof.direct_sampling = Number(ds);

  const ot = document.getElementById('p-offset_tuning').value;
  if (ot !== '') prof.offset_tuning = ot === 'true';

  const note = document.getElementById('p-_note').value.trim();
  if (note) prof._note = note;

  if (!state.settings.sdrs[sdrId]) {
    toast('SDR device not found', 'error'); return;
  }
  state.settings.sdrs[sdrId].profiles[profId] = prof;

  closeModal('modal-profile');
  refreshAll();
  toast((editProfId ? 'Updated' : 'Added') + ' profile: ' + name, 'success');
}

function deleteProfile(sdrId, profId) {
  confirm_(`Delete profile "${profId}"?`, () => {
    delete state.settings.sdrs[sdrId].profiles[profId];
    refreshAll();
    toast('Deleted profile: ' + profId, 'warning');
  });
}

/* ── Validation ───────────────────────────────────────────────────────────── */
function runValidation() {
  fetch('/api/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state.settings)
  })
  .then(r => r.json())
  .then(data => {
    const el = document.getElementById('validation-results');
    if (data.valid && !data.warnings.length) {
      el.innerHTML = `<div class="val-pass">
        <i class="fa fa-circle-check"></i> Settings are valid — no errors or warnings found.
      </div>`;
      return;
    }
    let html = '';
    if (data.errors.length) {
      html += `<div class="val-section"><h4><i class="fa fa-circle-xmark"></i> Errors (${data.errors.length})</h4>` +
        data.errors.map(e => `<div class="val-item error"><i class="fa fa-xmark"></i>${esc(e)}</div>`).join('') + '</div>';
    }
    if (data.warnings.length) {
      html += `<div class="val-section"><h4><i class="fa fa-triangle-exclamation"></i> Warnings (${data.warnings.length})</h4>` +
        data.warnings.map(w => `<div class="val-item warning"><i class="fa fa-triangle-exclamation"></i>${esc(w)}</div>`).join('') + '</div>';
    }
    if (data.valid) {
      html += `<div class="val-item ok"><i class="fa fa-circle-check"></i> No blocking errors — file is valid (warnings present)</div>`;
    }
    el.innerHTML = html;
    toast(data.valid ? 'Valid with warnings' : 'Validation failed', data.valid ? 'warning' : 'error');
  })
  .catch(() => toast('Validation request failed', 'error'));
}

/* ── Raw JSON ─────────────────────────────────────────────────────────────── */
function syncRawEditor() {
  const el = document.getElementById('raw-json');
  if (!el) return;
  el.value = JSON.stringify(state.settings, null, 2);
  rawDirty = false;
}

function applyRaw() {
  try {
    const parsed = JSON.parse(document.getElementById('raw-json').value);
    state.settings = parsed;
    loadGlobalFields();
    refreshAll();
    toast('Raw JSON applied', 'success');
    rawDirty = false;
  } catch(e) {
    toast('Invalid JSON: ' + e.message, 'error');
  }
}

function copyRaw() {
  navigator.clipboard.writeText(document.getElementById('raw-json').value)
    .then(() => toast('Copied to clipboard', 'success'))
    .catch(() => toast('Copy failed', 'error'));
}

/* ── Modal helpers ────────────────────────────────────────────────────────── */
function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}
function closeModalClick(e, id) {
  if (e.target === e.currentTarget) closeModal(id);
}

function confirm_(msg, cb) {
  document.getElementById('confirm-msg').textContent = msg;
  const okBtn = document.getElementById('confirm-ok');
  const newBtn = okBtn.cloneNode(true);
  okBtn.parentNode.replaceChild(newBtn, okBtn);
  newBtn.addEventListener('click', () => { closeModal('modal-confirm'); cb(); });
  openModal('modal-confirm');
}

/* ── Toast ────────────────────────────────────────────────────────────────── */
function toast(msg, type = 'info') {
  const icons = { success: 'fa-circle-check', warning: 'fa-triangle-exclamation',
                  error: 'fa-circle-xmark', info: 'fa-circle-info' };
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = `<i class="fa ${icons[type] || icons.info}"></i>${esc(msg)}`;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

/* ── Escape helper ────────────────────────────────────────────────────────── */
function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── Keyboard shortcuts ───────────────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); exportSettings(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'o') { e.preventDefault(); triggerImport(); }
  if (e.key === 'Escape') {
    ['modal-device','modal-profile','modal-confirm'].forEach(closeModal);
  }
});
