import { db, FREE_QUOTA, MAX_FILE, RECAPTCHA_SITE_KEY } from './firebase-config.js';
import { ref, set, update, remove, onValue, push, get } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import { $, esc, bytes, dateFmt, toast, showModal, closeModal, I, tile, fileThumb, formatType, TYPE } from './ui.js';
import { mountShell, getIdToken } from './shell.js';

const state = {
  user: null, files: [], folders: [],
  view: 'files', folderId: null,
  layout: localStorage.getItem('pd-layout') || 'grid',
  sort: 'newest', typeFilter: 'all', search: '',
  uploadQueue: [], uploadBusy: false,
};

function userRef(part) { return ref(db, `${part}/${state.user.uid}`); }
function getFile(id) { return state.files.find(f => f.fileId === id); }
function getFolder(id) { return state.folders.find(f => f.folderId === id); }
function usedBytes() { return state.files.filter(f => !f.isDeleted).reduce((n, f) => n + (Number(f.size) || 0), 0); }
function quotaBytes() { return FREE_QUOTA; }
function parentTrail(id) {
  const trail = []; let cur = getFolder(id);
  while (cur) { trail.unshift(cur); cur = cur.parentId ? getFolder(cur.parentId) : null; }
  return trail;
}

async function recaptchaToken(action) {
  if (!window.grecaptcha || RECAPTCHA_SITE_KEY.startsWith('PUT_')) return '';
  return new Promise(resolve => window.grecaptcha.ready(() =>
    window.grecaptcha.execute(RECAPTCHA_SITE_KEY, { action }).then(resolve).catch(() => resolve(''))));
}

/* ── upload token + upload ── */
async function requestUploadToken() {
  const idToken = await getIdToken();
  const recaptcha = await recaptchaToken('upload_token');
  const res = await fetch('/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ recaptchaToken: recaptcha }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not get an upload token.');
  return data.token;
}

async function uploadOne(item, folderId) {
  item.status = 'uploading'; paintQueue();
  const token = await requestUploadToken();
  const idToken = await getIdToken();
  const form = new FormData();
  form.append('file', item.file, item.file.name);
  form.append('token', token);
  const res = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest(); item.xhr = xhr;
    xhr.open('POST', '/api/upload');
    xhr.setRequestHeader('Authorization', `Bearer ${idToken}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) { item.progress = e.loaded / e.total * 100; paintQueue(); }
    };
    xhr.onload = () => {
      let data = {}; try { data = JSON.parse(xhr.responseText); } catch (e) {}
      item.xhr = null;
      (xhr.status >= 200 && xhr.status < 300 && data.success) ? resolve(data) : reject(new Error(data.error || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => { item.xhr = null; reject(new Error('Network error during upload.')); };
    xhr.onabort = () => { item.xhr = null; reject(new Error('Upload cancelled.')); };
    xhr.send(form);
  });

  // ── auto-publish: create both view link and store direct link ──
  const r = push(userRef('userFiles'));
  const record = {
    fileId: r.key,
    ownerUid: state.user.uid,
    filename: res.filename,
    size: res.size,
    mimeType: res.mimeType || item.file.type || 'application/octet-stream',
    extension: (res.filename.split('.').pop() || '').toLowerCase(),
    folderId: folderId || null,
    provider: 'droplink',
    directUrl: res.directUrl,
    providerUrl: res.providerUrl || '',
    uploadedAt: Date.now(),
    modifiedAt: Date.now(),
    isStarred: false,
    isDeleted: false,
    publishedUrl: '',
    publishedPath: '',
    viewUrl: '',      // will be filled after auto-publish
    downloadUrl: res.directUrl,  // direct storage link
  };
  await set(r, record);

  // Auto-publish to get the view URL (/d/ID)
  try {
    const idToken2 = await getIdToken();
    const pubRes = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken2}` },
      body: JSON.stringify({ fileId: r.key }),
    });
    const pubData = await pubRes.json().catch(() => ({}));
    if (pubRes.ok && pubData.url) {
      await update(ref(db, `userFiles/${state.user.uid}/${r.key}`), { publishedUrl: pubData.url, viewUrl: pubData.url });
      record.publishedUrl = pubData.url;
      record.viewUrl = pubData.url;
    }
  } catch (_) { /* non-fatal — user can still get download link */ }

  logActivity('upload', record, `Uploaded ${record.filename}`);
  return record;
}

async function runUploads() {
  if (state.uploadBusy) return;
  const queue = state.uploadQueue.filter(x => ['waiting', 'failed'].includes(x.status));
  if (!queue.length) return toast('Add files to the queue first.');
  const batchBytes = queue.reduce((n, x) => n + (Number(x.file.size) || 0), 0);
  if (batchBytes > Math.max(0, quotaBytes() - usedBytes())) return toast('Not enough storage left for this batch.', 'error');
  state.uploadBusy = true;
  if ($('startUploads')) $('startUploads').disabled = true;
  const folderId = $('uploadFolder')?.value || null;
  for (const item of queue) {
    try {
      item.error = ''; item.progress = 0; paintQueue();
      await uploadOne(item, folderId);
      item.status = 'completed';
      toast(`${item.file.name} uploaded.`, 'ok');
    } catch (e) {
      item.status = e.message === 'Upload cancelled.' ? 'cancelled' : 'failed';
      item.error = e.message;
      toast(`${item.file.name}: ${item.error}`, 'error');
    }
    paintQueue();
  }
  state.uploadBusy = false;
  if ($('startUploads')) $('startUploads').disabled = false;
}

function addQueue(files) {
  for (const f of files) {
    if (f.size > MAX_FILE) { toast(`${f.name}: exceeds the 200 MB limit.`, 'error'); continue; }
    if (f.size === 0) { toast(`${f.name}: empty files are not accepted.`, 'error'); continue; }
    state.uploadQueue.push({ id: crypto.randomUUID(), file: f, status: 'waiting', progress: 0, error: '' });
  }
  paintQueue();
}

function paintQueue() {
  const q = $('uploadQueue'); if (!q) return;
  q.innerHTML = state.uploadQueue.map(x =>
    `<div class="q-row">
      <span class="small" style="flex:0 0 auto;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.file.name)}</span>
      <div class="bar"><span style="width:${x.progress}%"></span></div>
      <span class="small muted">${x.status}${x.error ? ': ' + esc(x.error) : ''}</span>
    </div>`).join('');
}

function uploadModal() {
  showModal('Upload files', `
    <div class="drop-zone" id="dropZone">
      ${tile('upload', '#6366f1', '#ec4899', 54)}
      <h4>Drop files here</h4>
      <p class="small muted">Max 200 MB per file. Protected by one-time upload tokens.</p>
      <p class="small muted" style="color:var(--ok)">View + download links auto-generated after upload.</p>
      <button class="btn btn-primary btn-sm" id="chooseFiles">${I('upload')} Browse files</button>
      <input id="filePicker" type="file" multiple hidden>
    </div>
    <div class="field">
      <label>Destination</label>
      <select id="uploadFolder">
        <option value="">My Files (root)</option>
        ${state.folders.filter(f => !f.isDeleted).map(f =>
          `<option value="${esc(f.folderId)}">${esc(parentTrail(f.folderId).map(x => x.name).join(' / '))}</option>`
        ).join('')}
      </select>
    </div>
    <div class="queue" id="uploadQueue"></div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="startUploads">${I('upload')} Start upload</button>
    </div>`);
  $('chooseFiles').onclick = () => $('filePicker').click();
  $('filePicker').onchange = (e) => addQueue([...e.target.files]);
  const dz = $('dropZone');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag'); addQueue([...e.dataTransfer.files]); });
  $('startUploads').onclick = runUploads;
}

/* ── folders ── */
async function createFolder(name, parentId) {
  name = name.trim(); if (!name) throw new Error('Enter a folder name.');
  const id = push(userRef('userFolders')).key;
  await set(ref(db, `userFolders/${state.user.uid}/${id}`), {
    name, parentId: parentId || null, ownerUid: state.user.uid,
    createdAt: Date.now(), updatedAt: Date.now(), isStarred: false, isDeleted: false,
  });
  toast('Folder created.', 'ok');
}
function newFolderDialog() {
  showModal('Create folder', `
    <div class="field"><label>Folder name</label><input id="newFolderName" maxlength="100" /></div>
    <div class="modal-actions"><button class="btn btn-primary" id="folderCreate">${I('plus')} Create</button></div>`);
  $('folderCreate').onclick = async () => {
    try { await createFolder($('newFolderName').value, state.folderId); closeModal(); }
    catch (e) { toast(e.message, 'error'); }
  };
}
async function folderAction(id, action, value) {
  const f = getFolder(id); if (!f) return;
  const r = ref(db, `userFolders/${state.user.uid}/${id}`);
  if (action === 'rename') await update(r, { name: value, updatedAt: Date.now() });
  else if (action === 'star') await update(r, { isStarred: !f.isStarred, updatedAt: Date.now() });
  else if (action === 'delete') await update(r, { isDeleted: true, deletedAt: Date.now() });
}

/* ── file actions ── */
async function fileAction(fileId, action, extra = {}) {
  const r = ref(db, `userFiles/${state.user.uid}/${fileId}`), now = Date.now();
  if (action === 'rename') await update(r, { filename: extra.filename, modifiedAt: now });
  else if (action === 'move') await update(r, { folderId: extra.folderId || null, modifiedAt: now });
  else if (action === 'star') { const f = getFile(fileId); await update(r, { isStarred: !f.isStarred, modifiedAt: now }); }
  else if (action === 'trash') await update(r, { isDeleted: true, deletedAt: now });
  else if (action === 'restore') await update(r, { isDeleted: false, deletedAt: null });
  else if (action === 'remove') await remove(r);
}

async function logActivity(action, file, message) {
  try { await set(push(userRef('userActivity')), { action, fileId: file?.fileId || null, message, at: Date.now() }); }
  catch (e) {}
}

/* ── get share / view link ── */
async function getShareLink(f) {
  if (f.publishedUrl) return f.publishedUrl;
  const idToken = await getIdToken();
  const res = await fetch('/api/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ fileId: f.fileId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not create a share link.');
  // persist to db
  await update(ref(db, `userFiles/${state.user.uid}/${f.fileId}`), { publishedUrl: data.url, viewUrl: data.url });
  return data.url;
}

async function copyShareLink(f) {
  try { const url = await getShareLink(f); await navigator.clipboard.writeText(url); toast('View link copied.', 'ok'); }
  catch (e) { toast(e.message, 'error'); }
}

async function copyDownloadLink(f) {
  try { await navigator.clipboard.writeText(f.directUrl || f.downloadUrl); toast('Download link copied.', 'ok'); }
  catch (e) { toast('Could not copy.', 'error'); }
}

/* ── links modal ── */
async function showLinksModal(f) {
  const viewUrl = f.publishedUrl || f.viewUrl || await getShareLink(f).catch(() => '');
  const dlUrl = f.directUrl || f.downloadUrl || '';
  showModal('File links', `
    <p class="small muted" style="margin-bottom:12px">Both links are generated automatically.</p>
    <div style="margin-bottom:14px">
      <label class="small" style="display:block;font-weight:700;margin-bottom:6px;color:var(--muted)">View link (opens in PetaDrive)</label>
      <div class="link-box">
        <span class="link-tag view">VIEW</span>
        <span>${esc(viewUrl || '—')}</span>
        ${viewUrl ? `<button class="btn-icon btn-sm" id="copyViewBtn">${I('copy')}</button>` : ''}
      </div>
    </div>
    <div>
      <label class="small" style="display:block;font-weight:700;margin-bottom:6px;color:var(--muted)">Download link</label>
      <div class="link-box">
        <span class="link-tag download">DL</span>
        <span>${esc(dlUrl || '—')}</span>
        ${dlUrl ? `<button class="btn-icon btn-sm" id="copyDlBtn">${I('copy')}</button>` : ''}
      </div>
    </div>
    <div class="modal-actions" style="margin-top:16px">
      <button class="btn btn-primary" id="goViewBtn">${I('eye')} Open view page</button>
    </div>`);
  $('copyViewBtn')?.addEventListener('click', () => { navigator.clipboard.writeText(viewUrl); toast('Copied!','ok'); });
  $('copyDlBtn')?.addEventListener('click', () => { navigator.clipboard.writeText(dlUrl); toast('Copied!','ok'); });
  $('goViewBtn')?.addEventListener('click', () => { if (viewUrl) window.open(viewUrl, '_blank'); });
}

function showPreview(f) {
  const type = formatType(f), url = f.directUrl || ''; let c = '';
  if (type === 'images') c = `<img src="${esc(url)}" style="max-width:100%;border-radius:12px">`;
  else if (type === 'videos') c = `<video controls style="max-width:100%;border-radius:12px" src="${esc(url)}"></video>`;
  else if (type === 'audio') c = `<audio controls style="width:100%" src="${esc(url)}"></audio>`;
  else { const m = TYPE[type]; c = `<div class="empty-state" style="border:0">${tile(m[0], m[1], m[2], 60)}<p>Preview not available for this type.</p></div>`; }
  showModal(f.filename, `${c}
    <div class="modal-actions">
      <button class="btn btn-soft" id="pvLinks">${I('link')} File links</button>
      <button class="btn btn-primary" id="pvDownload">${I('download')} Download</button>
    </div>`);
  $('pvLinks').onclick = async () => { closeModal(); await showLinksModal(f); };
  $('pvDownload').onclick = () => downloadFile(f);
}

function downloadFile(f) {
  if (!f?.directUrl) return toast('No download URL for this file.', 'error');
  logActivity('download', f, `Downloaded ${f.filename}`);
  window.location.href = f.directUrl;
}

/* ── render ── */
function visibleFiles() {
  let list = state.files;
  if (state.view === 'trash') list = list.filter(f => f.isDeleted);
  else {
    list = list.filter(f => !f.isDeleted);
    if (state.view === 'files') list = list.filter(f => (f.folderId || null) === (state.folderId || null));
    if (state.view === 'starred') list = list.filter(f => f.isStarred);
  }
  if (state.typeFilter !== 'all') list = list.filter(f => formatType(f) === state.typeFilter);
  if (state.search) list = list.filter(f => f.filename.toLowerCase().includes(state.search.toLowerCase()));
  return list.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
}
function visibleFolders() {
  if (state.view !== 'files') return [];
  return state.folders.filter(f => !f.isDeleted && (f.parentId || null) === (state.folderId || null));
}
function fileCard(f) {
  const hasLink = f.publishedUrl || f.viewUrl;
  return `<article class="file-card" data-file="${esc(f.fileId)}">
    ${hasLink ? '<span class="pub-dot">● LINK</span>' : ''}
    <button class="btn-icon" style="position:absolute;top:8px;right:8px" data-menu="${esc(f.fileId)}">${I('more')}</button>
    ${fileThumb(f)}
    <strong style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.filename)}</strong>
    <small class="muted">${bytes(f.size)} · ${dateFmt(f.uploadedAt)}</small>
  </article>`;
}
function folderCard(f) {
  return `<article class="file-card" data-open-folder="${esc(f.folderId)}">
    ${tile('folder', '#f59e0b', '#f97316', 40)}
    <strong style="font-size:13px">${esc(f.name)}</strong>
    <small class="muted">Folder</small>
  </article>`;
}

function render() {
  const el = $('pageContent'); if (!el) return;
  const folders = visibleFolders(), files = visibleFiles();
  const title = { files:'My Files', starred:'Starred', trash:'Trash' }[state.view] || 'My Files';
  const crumbs = state.view === 'files'
    ? [{ id: null, name: 'My Files' }, ...parentTrail(state.folderId).map(f => ({ id: f.folderId, name: f.name }))]
    : [];
  el.innerHTML = `
  <div class="heading">
    <div>
      <h1>${title}</h1>
      ${crumbs.length ? `<div class="small muted">${crumbs.map(c => `<a href="#" data-crumb="${c.id||''}">${esc(c.name)}</a>`).join(' / ')}</div>` : ''}
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-soft" id="newFolderBtn">${I('plus')} New folder</button>
      <button class="btn btn-primary" id="uploadBtn">${I('upload')} Upload</button>
    </div>
  </div>
  <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
    ${['files','starred','trash'].map(v =>
      `<button class="btn ${state.view === v ? 'btn-primary' : 'btn-soft'} btn-sm" data-switch="${v}">${
        v==='files'?'My Files':v==='starred'?'Starred':'Trash'
      }</button>`).join('')}
    <button class="btn btn-plain btn-sm" id="layoutToggle">${state.layout==='grid'?'List view':'Grid view'}</button>
  </div>
  ${(!folders.length && !files.length) ?
    `<div class="empty-state">${tile('folder','#6366f1','#ec4899',56)}<h3>Nothing here yet</h3><p class="muted">Upload a file or create a folder to get started.</p></div>` :
    `<div class="file-grid" style="margin-bottom:16px">${folders.map(folderCard).join('')}</div>
     <div class="file-grid">${files.map(fileCard).join('')}</div>`}`;

  $('uploadBtn').onclick = uploadModal;
  $('newFolderBtn').onclick = newFolderDialog;
  $('layoutToggle').onclick = () => { state.layout = state.layout==='grid'?'list':'grid'; localStorage.setItem('pd-layout',state.layout); render(); };
  el.querySelectorAll('[data-switch]').forEach(b => b.onclick = () => { state.view = b.dataset.switch; render(); });
  el.querySelectorAll('[data-crumb]').forEach(b => b.onclick = e => { e.preventDefault(); state.folderId = b.dataset.crumb||null; render(); });
  el.querySelectorAll('[data-open-folder]').forEach(c => c.onclick = () => { state.folderId = c.dataset.openFolder; render(); });
  el.querySelectorAll('[data-file]').forEach(c => c.onclick = e => { if (e.target.closest('[data-menu]')) return; const f = getFile(c.dataset.file); if (f) showPreview(f); });
  el.querySelectorAll('[data-menu]').forEach(b => b.onclick = e => { e.stopPropagation(); showFileMenu(getFile(b.dataset.menu)); });
}

function showFileMenu(f) {
  if (!f) return;
  showModal(f.filename, `<div style="display:flex;flex-direction:column;gap:6px">
    <button class="btn btn-soft" data-m="open">${I('eye')} Preview</button>
    <button class="btn btn-soft" data-m="links">${I('link')} File links (view + download)</button>
    <button class="btn btn-soft" data-m="download">${I('download')} Download</button>
    <button class="btn btn-soft" data-m="star">${I('star')} ${f.isStarred ? 'Unstar' : 'Star'}</button>
    <button class="btn btn-soft" data-m="rename">${I('file')} Rename</button>
    <button class="btn btn-danger" data-m="${f.isDeleted ? 'restore' : 'trash'}">${I('trash')} ${f.isDeleted ? 'Restore' : 'Move to Trash'}</button>
    ${f.isDeleted ? `<button class="btn btn-danger" data-m="remove">${I('x')} Delete permanently</button>` : ''}
  </div>`);
  document.getElementById('modalBody').querySelectorAll('[data-m]').forEach(b => b.onclick = async () => {
    const m = b.dataset.m;
    if (m === 'open') { closeModal(); showPreview(f); }
    else if (m === 'links') { closeModal(); await showLinksModal(f); }
    else if (m === 'download') { closeModal(); downloadFile(f); }
    else if (m === 'rename') { const n = prompt('New file name', f.filename); if (n) await fileAction(f.fileId, 'rename', { filename: n }); closeModal(); }
    else { await fileAction(f.fileId, m); closeModal(); }
  });
}

export async function init() {
  const { user } = await mountShell({ active: 'files' });
  state.user = user;
  onValue(userRef('userFiles'), s => { state.files = Object.entries(s.val() || {}).map(([id, x]) => ({ fileId: id, ...x })); render(); });
  onValue(userRef('userFolders'), s => { state.folders = Object.entries(s.val() || {}).map(([id, x]) => ({ folderId: id, ...x })); render(); });
  render();
}
