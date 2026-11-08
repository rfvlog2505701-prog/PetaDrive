import { db, APP_LOGO_URL } from './firebase-config.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import { esc, bytes, formatType, TYPE } from './ui.js';

const TEXT_EXT = ['txt','md','json','js','css','html','py','csv','log','xml','yml','yaml','ini','sh'];

function render(f) {
  const root = document.getElementById('root');
  if (!f) { root.innerHTML = `<div class="dl-card"><header class="brand"><img src="${APP_LOGO_URL}" alt=""><span>PetaDrive</span></header><h2>Link not found</h2><p class="muted">This share link does not exist or has been revoked by its owner.</p></div>`; return; }
  const type = formatType(f), ext = (f.extension || 'file').slice(0, 5).toUpperCase();
  let preview = '';
  if (type === 'images') preview = `<img src="${esc(f.directUrl)}" alt="${esc(f.filename)}">`;
  else if (type === 'videos') preview = `<video controls src="${esc(f.directUrl)}"></video>`;
  else if (type === 'audio') preview = `<audio controls style="width:100%" src="${esc(f.directUrl)}"></audio>`;
  else if (ext.toLowerCase() === 'pdf' || f.mimeType === 'application/pdf') preview = `<iframe src="${esc(f.directUrl)}#toolbar=1" title="PDF preview"></iframe>`;
  else preview = `<div id="textSlot" class="muted">Loading preview…</div>`;

  document.title = `${f.filename} — PetaDrive`;
  root.innerHTML = `<div class="dl-card">
    <header class="brand"><img src="${APP_LOGO_URL}" alt=""><span>PetaDrive</span></header>
    <h2 style="word-break:break-word">${esc(f.filename)}</h2>
    <div class="dl-badges"><span>${bytes(f.size)}</span><span>${esc(ext)}</span><span>Secure link</span></div>
    <div class="dl-preview">${preview}</div>
    <a class="btn btn-primary" style="width:100%;justify-content:center" href="${esc(f.directUrl)}" download="${esc(f.filename)}" target="_blank" rel="noopener">Download (${bytes(f.size)})</a>
    <p class="dl-hint">Clicking Download fetches the file directly from its secure storage link.</p>
    <footer class="dl-foot">PetaDrive · Your Files. Your Cloud. Your Way.</footer>
  </div>`;

  if (!preview.includes('<img') && !preview.includes('<video') && !preview.includes('<audio') && !preview.includes('<iframe')) {
    const slot = document.getElementById('textSlot');
    const extLower = (f.extension || '').toLowerCase();
    if (TEXT_EXT.includes(extLower) && Number(f.size) < 2 * 1024 * 1024) {
      fetch(f.directUrl).then(r => r.ok ? r.text() : Promise.reject()).then(text => { slot.outerHTML = `<pre>${esc(text.slice(0, 20000))}</pre>`; })
        .catch(() => { slot.outerHTML = `<p class="muted">Preview unavailable — use Download to view this file.</p>`; });
    } else {
      const m = TYPE[type];
      slot.outerHTML = `<p class="muted">No inline preview for this file type — use Download to save it.</p>`;
    }
  }
}

async function init() {
  const fromPath = location.pathname.match(/\/d\/([^/]+)\/?$/);
  const id = (fromPath && fromPath[1]) || new URLSearchParams(location.search).get('id');
  if (!id) return render(null);
  try { const snap = await get(ref(db, `publishedFiles/${id}`)); render(snap.exists() ? snap.val() : null); }
  catch (e) { render(null); }
}
init();
