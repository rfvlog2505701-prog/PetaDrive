import { db } from './firebase-config.js';
import { ref, onValue } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import { $, esc, bytes, dateFmt, toast, fileThumb, rawLinkOf } from './ui.js';
import { mountShell, getIdToken } from './shell.js';

export async function init() {
  const { user } = await mountShell({ active: 'share' });
  onValue(ref(db, `userFiles/${user.uid}`), (s) => {
    const shared = Object.entries(s.val() || {}).map(([id, x]) => ({ fileId: id, ...x })).filter(f => f.publishedUrl && !f.isDeleted);
    $('pageContent').innerHTML = `<div class="heading"><h1>Shared Links</h1></div>` +
      (shared.length ? `<div class="file-grid">${shared.map(f => `
        <article class="file-card" data-id="${esc(f.fileId)}">${fileThumb(f)}<strong style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.filename)}</strong><small class="muted">${bytes(f.size)} · ${dateFmt(f.uploadedAt)}</small>
          <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"><button class="btn btn-soft btn-sm" data-copy-page>Page link</button><button class="btn btn-soft btn-sm" data-copy-direct>Direct link</button><button class="btn btn-danger btn-sm" data-revoke>Revoke</button></div>
        </article>`).join('')}</div>`
        : `<div class="empty-state"><h3>No shared links yet</h3><p class="muted">Create a share link from Storage.</p></div>`);
    $('pageContent').querySelectorAll('[data-id]').forEach(card => {
      const f = shared.find(x => x.fileId === card.dataset.id);
      card.querySelector('[data-copy-page]').onclick = () => navigator.clipboard.writeText(f.publishedUrl).then(() => toast('Page link copied.', 'ok'));
      card.querySelector('[data-copy-direct]').onclick = () => navigator.clipboard.writeText(rawLinkOf(f.publishedUrl)).then(() => toast('Direct link copied.', 'ok'));
      card.querySelector('[data-revoke]').onclick = async () => {
        if (!confirm('Revoke this share link? It will stop working immediately.')) return;
        try { const idToken = await getIdToken(); const res = await fetch('/api/unpublish', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ fileId: f.fileId }) }); if (!res.ok) throw new Error((await res.json()).error || 'Could not revoke link.'); toast('Link revoked.', 'ok'); } catch (e) { toast(e.message, 'error'); }
      };
    });
  });
}
