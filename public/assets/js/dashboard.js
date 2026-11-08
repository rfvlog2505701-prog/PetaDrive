import { db, FREE_QUOTA } from './firebase-config.js';
import { ref, onValue } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import { $, esc, bytes, dateFmt, fileThumb } from './ui.js';
import { mountShell } from './shell.js';

export async function init() {
  const { user, profile } = await mountShell({ active: 'dashboard' });
  onValue(ref(db, `userFiles/${user.uid}`), (s) => {
    const files = Object.entries(s.val() || {}).map(([id, x]) => ({ fileId: id, ...x })).filter(f => !f.isDeleted);
    const used = files.reduce((n, f) => n + (Number(f.size) || 0), 0);
    const pct = Math.min(100, Math.round(used / FREE_QUOTA * 100));
    const recent = [...files].sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0)).slice(0, 6);
    $('pageContent').innerHTML = `
      <div class="heading"><h1>Welcome, ${esc(profile.displayName || user.email)} 👋</h1></div>
      <div class="card" style="margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px"><b>Storage used</b><span class="muted small">${bytes(used)} of ${bytes(FREE_QUOTA)}</span></div>
        <div style="height:10px;border-radius:10px;background:var(--border);overflow:hidden"><span style="display:block;height:100%;width:${pct}%;background:linear-gradient(90deg,var(--p),var(--p2))"></span></div>
      </div>
      <div class="heading"><h1 style="font-size:18px">Recent files</h1><a class="btn btn-primary btn-sm" href="/app/files.html">Go to My Files</a></div>
      ${recent.length ? `<div class="file-grid">${recent.map(f => `<a class="file-card" href="/app/files.html" style="cursor:pointer">${fileThumb(f)}<strong style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.filename)}</strong><small class="muted">${bytes(f.size)} · ${dateFmt(f.uploadedAt)}</small></a>`).join('')}</div>`
        : `<div class="empty-state"><h3>No files yet</h3><p class="muted">Upload your first file from My Files.</p></div>`}`;
  });
}
