// ui.js — shared utilities + particle background + animated icons

export function $(id) { return document.getElementById(id); }
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
export const bytes = (n) => { n = Number(n) || 0; if (n < 1024) return n + ' B'; const u = ['KB','MB','GB','TB']; let i = -1; do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1); return n.toFixed(n < 10 && i > 0 ? 1 : 0) + ' ' + u[i]; };
export const dateFmt = (ts) => ts ? new Date(ts).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}) : '—';
export const timeFmt = (ts) => ts ? new Date(ts).toLocaleString() : '—';

const P = {
  home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  file:'<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v6h5M9 14h7M9 17h5"/>',
  folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/>',
  star:'<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 13a7.7 7.7 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.7 7.7 0 0 0-1.7-1L15 3h-6l-.3 2.6a7.7 7.7 0 0 0-1.7 1l-2.4-1-2 3.4L4.6 11a7.7 7.7 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.7 7.7 0 0 0 1.7 1L9 21h6l.3-2.6a7.7 7.7 0 0 0 1.7-1l2.4 1 2-3.4z"/>',
  upload:'<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  download:'<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  video:'<rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
  audio:'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  archive:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 4v5M9 13h2"/>',
  apk:'<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M9 7h6"/>',
  link:'<path d="M9 17H7a5 5 0 0 1 0-10h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8"/>',
  open:'<path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/><path d="M15 3h6v6M10 14 21 3"/>',
  more:'<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  activity:'<path d="M3 12h4l2 8 6-16 2 8h4"/>',
  ban:'<circle cx="12" cy="12" r="9"/><path d="m5 5 14 14"/>',
  logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  copy:'<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  key:'<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  code:'<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  api:'<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M12 12h.01M8 12h.01M16 12h.01"/>',
};

export function I(name, cls = '') {
  return `<svg class="ico ico-anim ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[name] || P.file}</svg>`;
}
export function tile(name, c1, c2, size = 38) {
  return `<span class="tile" style="--c1:${c1};--c2:${c2};--s:${size}px">${I(name)}</span>`;
}

export const TYPE = {
  images:['image','#ec4899','#f97316','Images'],
  videos:['video','#8b5cf6','#6366f1','Videos'],
  documents:['file','#3b82f6','#06b6d4','Documents'],
  audio:['audio','#10b981','#22d3ee','Audio'],
  archives:['archive','#f59e0b','#ef4444','Archives'],
  apk:['apk','#22c55e','#84cc16','APK'],
  other:['file','#64748b','#94a3b8','Other'],
};

export function formatType(f) {
  const m = (f.mimeType || '').toLowerCase(), ext = (f.extension || f.filename?.split('.').pop() || '').toLowerCase();
  if (m.startsWith('image/')) return 'images';
  if (m.startsWith('video/')) return 'videos';
  if (m.startsWith('audio/')) return 'audio';
  if (m === 'application/pdf' || ext === 'pdf') return 'documents';
  if (['zip','rar','7z','tar','gz'].includes(ext)) return 'archives';
  if (ext === 'apk') return 'apk';
  if (m.startsWith('text/') || m.includes('document') || ['doc','docx','xls','xlsx','ppt','pptx','txt','csv','json','js','css','html','md','py'].includes(ext)) return 'documents';
  return 'other';
}
export function fileThumb(f) {
  const type = formatType(f), m = TYPE[type];
  return tile(m[0], m[1], m[2], 40);
}

export function toast(msg, kind = '') {
  const host = $('toastHost'); if (!host) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`; el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3000);
}

export function showModal(title, bodyHtml) {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = bodyHtml;
  $('modalOverlay').classList.add('open');
}
export function closeModal() { $('modalOverlay').classList.remove('open'); }

export function applyTheme(t) {
  document.documentElement.dataset.theme = t === 'dark' ? 'dark' : 'light';
}
export function initTheme() {
  const saved = localStorage.getItem('pd-theme');
  applyTheme(saved || (window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'));
}

/* ── particle background ── */
export function startParticles(canvasId = 'pd-canvas') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, particles = [];
  const COUNT = Math.min(60, Math.floor(window.innerWidth / 20));

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function isDark() { return document.documentElement.dataset.theme === 'dark'; }

  function mkParticle() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 2.5 + 0.8,
      vx: (Math.random() - .5) * .4,
      vy: (Math.random() - .5) * .4,
      alpha: Math.random() * .5 + .2,
      pulse: Math.random() * Math.PI * 2,
    };
  }
  for (let i = 0; i < COUNT; i++) particles.push(mkParticle());

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const dark = isDark();
    const baseColor = dark ? '139,92,246' : '99,102,241';
    const lineColor = dark ? '99,102,241' : '139,92,246';

    particles.forEach((p, i) => {
      p.x += p.vx; p.y += p.vy;
      p.pulse += .015;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;

      const a = p.alpha * (.7 + .3 * Math.sin(p.pulse));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${baseColor},${a})`;
      ctx.fill();

      // connect nearby particles
      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];
        const dx = p.x - q.x, dy = p.y - q.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 110) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = `rgba(${lineColor},${(.12) * (1 - dist / 110)})`;
          ctx.lineWidth = .6;
          ctx.stroke();
        }
      }
    });
    requestAnimationFrame(draw);
  }
  draw();
}
