import { db } from './firebase-config.js';
import { ref, set, get, remove, push, onValue } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import { $, esc, bytes, dateFmt, toast, showModal, closeModal, I, initTheme } from './ui.js';
import { mountShell, getIdToken } from './shell.js';

initTheme();

const API_UPLOAD_LIMIT = 4 * 1024 * 1024; // 4 MB — Vercel serverless limit

let state = { user: null, keys: [], tab: 'keys' };

function userRef(path) { return ref(db, `${path}/${state.user.uid}`); }

async function generateApiKey() {
  // Create a secure random API key
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  const key = 'pd_' + Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  const id = push(ref(db, `apiKeys/${state.user.uid}`)).key;
  const record = {
    keyId: id,
    key,
    ownerUid: state.user.uid,
    label: 'API Key ' + (state.keys.length + 1),
    createdAt: Date.now(),
    uploadCount: 0,
    lastUsedAt: null,
  };
  await set(ref(db, `apiKeys/${state.user.uid}/${id}`), record);
  toast('API key created.', 'ok');
  return record;
}

async function deleteKey(keyId) {
  if (!confirm('Delete this API key? Any integrations using it will stop working.')) return;
  await remove(ref(db, `apiKeys/${state.user.uid}/${keyId}`));
  toast('Key deleted.', 'ok');
}

async function renameKey(keyId, current) {
  const label = prompt('Key label', current);
  if (!label || label === current) return;
  await set(ref(db, `apiKeys/${state.user.uid}/${keyId}/label`), label);
  toast('Renamed.', 'ok');
}

async function copyKey(key) {
  try { await navigator.clipboard.writeText(key); toast('Key copied to clipboard.', 'ok'); }
  catch { toast('Copy failed.', 'error'); }
}

function renderKeys() {
  const el = $('pageContent'); if (!el) return;
  const baseUrl = location.origin;
  el.innerHTML = `
    <div class="heading">
      <div>
        <h1>${I('key')} Developer</h1>
        <p class="muted small">API keys let external tools upload files to your PetaDrive.</p>
      </div>
    </div>

    <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
      <button class="btn ${state.tab==='keys'?'btn-primary':'btn-soft'} btn-sm" id="tabKeys">${I('key')} API Keys</button>
      <button class="btn ${state.tab==='docs'?'btn-primary':'btn-soft'} btn-sm" id="tabDocs">${I('code')} API Docs</button>
    </div>

    ${state.tab === 'keys' ? renderKeysTab(baseUrl) : renderDocsTab(baseUrl)}`;

  $('tabKeys').onclick = () => { state.tab = 'keys'; renderKeys(); };
  $('tabDocs').onclick = () => { state.tab = 'docs'; renderKeys(); };
  if (state.tab === 'keys') bindKeysTab();
}

function renderKeysTab(baseUrl) {
  return `
    <div class="card" style="margin-bottom:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <strong>Your API Keys</strong>
        <button class="btn btn-primary btn-sm" id="createKeyBtn">${I('plus')} Generate key</button>
      </div>
      ${state.keys.length === 0
        ? `<div class="empty-state" style="border:0;padding:30px 0"><p class="muted">No API keys yet. Generate one to get started.</p></div>`
        : state.keys.map(k => `
        <div class="card" style="margin-bottom:10px;padding:14px">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:14px;margin-bottom:2px">${esc(k.label)}</div>
              <div class="link-box" style="margin-top:6px">
                <span style="font-family:monospace;font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(k.key)}</span>
                <button class="btn-icon btn-sm" data-copy="${esc(k.key)}">${I('copy')}</button>
              </div>
              <div class="small muted" style="margin-top:6px">
                Created ${dateFmt(k.createdAt)} · ${k.uploadCount||0} upload(s) · 
                ${k.lastUsedAt ? 'Last used ' + dateFmt(k.lastUsedAt) : 'Never used'}
              </div>
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-soft btn-sm" data-rename="${esc(k.keyId)}" data-label="${esc(k.label)}">${I('file')} Rename</button>
              <button class="btn btn-danger btn-sm" data-delete="${esc(k.keyId)}">${I('trash')} Delete</button>
            </div>
          </div>
        </div>`).join('')}
    </div>
    <div class="card">
      <strong>Upload limits via API</strong>
      <ul class="small muted" style="margin:10px 0 0;padding-left:18px;line-height:2">
        <li>Max file size per API upload: <b>4 MB</b> (Vercel serverless platform limit)</li>
        <li>Direct uploads through the PetaDrive app: <b>200 MB</b> (no API limit)</li>
        <li>Files uploaded via API appear in your PetaDrive file list</li>
        <li>Both view and download links are auto-generated for every API upload</li>
      </ul>
    </div>`;
}

function bindKeysTab() {
  $('createKeyBtn')?.addEventListener('click', async () => {
    $('createKeyBtn').disabled = true;
    try { await generateApiKey(); }
    catch (e) { toast(e.message, 'error'); }
    finally { $('createKeyBtn').disabled = false; }
  });
  document.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copyKey(b.dataset.copy));
  document.querySelectorAll('[data-delete]').forEach(b => b.onclick = () => deleteKey(b.dataset.delete));
  document.querySelectorAll('[data-rename]').forEach(b => b.onclick = () => renameKey(b.dataset.rename, b.dataset.label));
}

function renderDocsTab(baseUrl) {
  const exampleKey = 'pd_your_api_key_here';
  return `
    <div class="card" style="margin-bottom:16px">
      <h3 style="margin:0 0 8px">Upload a file</h3>
      <p class="small muted" style="margin:0 0 14px">POST to <code style="background:var(--soft);padding:2px 7px;border-radius:6px">${baseUrl}/api/upload-public</code></p>
      
      <div style="margin-bottom:14px">
        <strong class="small">Headers</strong>
        <pre style="background:var(--soft);border-radius:10px;padding:12px;font-size:12px;margin:8px 0;overflow-x:auto">X-API-Key: ${exampleKey}</pre>
      </div>

      <div style="margin-bottom:14px">
        <strong class="small">Body (multipart/form-data)</strong>
        <pre style="background:var(--soft);border-radius:10px;padding:12px;font-size:12px;margin:8px 0;overflow-x:auto">file=&lt;binary&gt;    # required — the file to upload (max 4 MB via API)</pre>
      </div>

      <div style="margin-bottom:14px">
        <strong class="small">Response (200 OK)</strong>
        <pre style="background:var(--soft);border-radius:10px;padding:12px;font-size:12px;margin:8px 0;overflow-x:auto">{
  "success": true,
  "filename": "photo.jpg",
  "size": 102400,
  "viewUrl": "${baseUrl}/d/abc123",
  "downloadUrl": "https://storage.example.com/photo.jpg"
}</pre>
      </div>

      <div style="margin-bottom:14px">
        <strong class="small">cURL example</strong>
        <pre style="background:var(--soft);border-radius:10px;padding:12px;font-size:12px;margin:8px 0;overflow-x:auto">curl -X POST ${baseUrl}/api/upload-public \\
  -H "X-API-Key: ${exampleKey}" \\
  -F "file=@/path/to/photo.jpg"</pre>
      </div>

      <div>
        <strong class="small">JavaScript / Fetch</strong>
        <pre style="background:var(--soft);border-radius:10px;padding:12px;font-size:12px;margin:8px 0;overflow-x:auto">const form = new FormData();
form.append('file', fileInput.files[0]);

const res = await fetch('${baseUrl}/api/upload-public', {
  method: 'POST',
  headers: { 'X-API-Key': '${exampleKey}' },
  body: form,
});
const data = await res.json();
console.log(data.viewUrl, data.downloadUrl);</pre>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3 style="margin:0 0 8px">Rate limits &amp; notes</h3>
      <ul class="small muted" style="margin:0;padding-left:18px;line-height:2">
        <li>Max 4 MB per file (Vercel serverless platform cap — cannot be lifted without self-hosting)</li>
        <li>No daily rate limit enforced right now — be reasonable</li>
        <li>Uploaded files count against your 10 GB quota exactly like app uploads</li>
        <li>Files appear in your PetaDrive immediately — visible in My Files</li>
        <li>Both <code style="background:var(--soft);padding:1px 5px;border-radius:4px">viewUrl</code> and <code style="background:var(--soft);padding:1px 5px;border-radius:4px">downloadUrl</code> are returned on every upload</li>
        <li>Direct app uploads remain at 200 MB — no limit applies there</li>
      </ul>
    </div>

    <div class="card">
      <h3 style="margin:0 0 8px">Error responses</h3>
      <pre style="background:var(--soft);border-radius:10px;padding:12px;font-size:12px;margin:8px 0;overflow-x:auto">401  { "error": "Invalid or missing API key." }
413  { "error": "File exceeds the 4 MB API limit." }
429  { "error": "Daily upload limit reached." }
507  { "error": "Storage quota exceeded." }</pre>
    </div>`;
}

export async function init() {
  const { user } = await mountShell({ active: 'developer' });
  state.user = user;

  onValue(ref(db, `apiKeys/${user.uid}`), snap => {
    state.keys = Object.entries(snap.val() || {}).map(([id, v]) => ({ keyId: id, ...v }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    renderKeys();
  });

  $('modalCloseBtn')?.addEventListener('click', closeModal);
}
