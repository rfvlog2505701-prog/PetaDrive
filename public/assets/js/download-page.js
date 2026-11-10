import { db, APP_LOGO_URL } from './firebase-config.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import { esc, bytes, formatType, TYPE, toast, initTheme, startParticles } from './ui.js';

initTheme();
startParticles('dl-canvas');

const TEXT_EXT = ['txt','md','json','js','css','html','py','csv','log','xml','yml','yaml','ini','sh'];

function getViewUrl() {
  // Returns the current page's ?id= URL — this is the "view" link (proxied through PetaDrive UI)
  const id = getFileId();
  return id ? `${location.origin}/d/${id}` : null;
}

function getFileId() {
  const fromPath = location.pathname.match(/\/d\/([^/]+)\/?$/);
  return (fromPath && fromPath[1]) || new URLSearchParams(location.search).get('id') || null;
}

function iconSvg(name) {
  const P = {
    download:'<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    copy:'<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    file:'<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v6h5M9 14h7M9 17h5"/>',
    ban:'<circle cx="12" cy="12" r="9"/><path d="m5 5 14 14"/>',
  };
  return `<svg class="ico" style="width:20px;height:20px;flex:none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[name]||P.file}</svg>`;
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied!', 'ok'); }
  catch { toast('Copy failed', 'error'); }
}

function renderError() {
  const root = document.getElementById('root');
  root.innerHTML = `<div class="dl-card">
    <div class="dl-brand"><img src="${APP_LOGO_URL}" alt=""><span>PetaDrive</span></div>
    <div class="dl-err">
      <span class="tile" style="--c1:#ef4444;--c2:#f97316;--s:60px">${iconSvg('ban')}</span>
      <h2>Link not found</h2>
      <p>This share link does not exist or has been removed.</p>
    </div>
  </div>`;
}

function render(f) {
  const root = document.getElementById('root');
  if (!f) { renderError(); return; }

  const type = formatType(f);
  const m = TYPE[type] || TYPE.other;
  const ext = (f.extension || '').toUpperCase() || 'FILE';
  const viewUrl = getViewUrl();                // /d/ID — stays on PetaDrive
  const downloadUrl = f.directUrl;             // direct link to catbox/storage

  document.title = `${f.filename} — PetaDrive`;

  // Build inline preview — uses directUrl but rendered inside OUR page so storage origin is hidden
  let previewHtml = '';
  if (type === 'images') {
    previewHtml = `<div class="dl-preview"><img src="${esc(downloadUrl)}" alt="${esc(f.filename)}" loading="lazy" /></div>`;
  } else if (type === 'videos') {
    previewHtml = `<div class="dl-preview"><video controls preload="metadata" src="${esc(downloadUrl)}" style="width:100%;border-radius:14px"></video></div>`;
  } else if (type === 'audio') {
    previewHtml = `<div class="dl-preview" style="padding:12px"><audio controls style="width:100%" src="${esc(downloadUrl)}"></audio></div>`;
  } else if (f.mimeType === 'application/pdf') {
    previewHtml = `<div class="dl-preview" style="height:360px"><iframe src="${esc(downloadUrl)}#toolbar=0&navpanes=0" title="PDF" style="width:100%;height:100%;border:0;border-radius:14px"></iframe></div>`;
  } else {
    previewHtml = `<div id="textPreviewSlot"></div>`;
  }

  root.innerHTML = `<div class="dl-card">
    <div class="dl-brand"><img src="${APP_LOGO_URL}" alt=""><span>PetaDrive</span></div>
    <span class="tile dl-thumb" style="--c1:${m[1]};--c2:${m[2]};--s:60px">
      <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        ${({'images':'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>','videos':'<rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3"/>','audio':'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>','documents':'<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v6h5M9 14h7M9 17h5"/>','archives':'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 4v5M9 13h2"/>','apk':'<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M9 7h6"/>','other':'<path d="M6 3h8l5 5v13H6z"/>'})[type]||'<path d="M6 3h8l5 5v13H6z"/>'}
      </svg>
    </span>
    <p class="dl-name">${esc(f.filename)}</p>
    <p class="dl-meta">${bytes(f.size)} · ${ext}</p>

    ${previewHtml}

    <div class="dl-links" style="margin-top:${previewHtml.includes('dl-preview') ? '20px' : '0'}">
      <a class="dl-btn dl-btn-primary" href="${esc(downloadUrl)}" download="${esc(f.filename)}" rel="noopener noreferrer">
        ${iconSvg('download')} Download (${bytes(f.size)})
      </a>
      <button class="dl-btn dl-btn-secondary" id="btnCopyView">
        ${iconSvg('copy')} Copy view link
      </button>
      <button class="dl-btn dl-btn-secondary" id="btnCopyDl">
        ${iconSvg('copy')} Copy download link
      </button>
    </div>
  </div>`;

  document.getElementById('btnCopyView').onclick = () => copyText(viewUrl);
  document.getElementById('btnCopyDl').onclick = () => copyText(downloadUrl);

  // Lazy text preview for text files
  const textSlot = document.getElementById('textPreviewSlot');
  if (textSlot) {
    const extLow = (f.extension || '').toLowerCase();
    if (TEXT_EXT.includes(extLow) && Number(f.size) < 2 * 1024 * 1024) {
      textSlot.innerHTML = `<p class="muted" style="font-size:13px;padding:8px 0">Loading preview…</p>`;
      fetch(downloadUrl)
        .then(r => r.ok ? r.text() : Promise.reject())
        .then(text => {
          textSlot.innerHTML = `<pre style="background:var(--soft);border-radius:12px;padding:14px;overflow-x:auto;font-size:12px;margin:12px 0;border:1px solid var(--border)">${esc(text.slice(0, 20000))}</pre>`;
        })
        .catch(() => { textSlot.remove(); });
    } else {
      textSlot.remove();
    }
  }
}

async function init() {
  const id = getFileId();
  if (!id) { renderError(); return; }
  try {
    const snap = await get(ref(db, `publishedFiles/${id}`));
    render(snap.exists() ? snap.val() : null);
  } catch (e) { renderError(); }
}

init();
