import { auth, db, ADMIN_EMAILS, APP_LOGO_URL } from './firebase-config.js';
import { onAuthStateChanged, signOut, reload } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import { $, I, toast, initTheme, startParticles } from './ui.js';

const NAV = [
  { key: 'dashboard', href: '/app/dashboard.html', icon: 'home', label: 'Home' },
  { key: 'files', href: '/app/files.html', icon: 'folder', label: 'My Files' },
  { key: 'share', href: '/app/share.html', icon: 'share', label: 'Shared Links' },
  { key: 'developer', href: '/app/developer.html', icon: 'code', label: 'Developer' },
  { key: 'settings', href: '/app/settings.html', icon: 'settings', label: 'Settings' },
];

function navHtml(active) {
  return NAV.map(n =>
    `<a class="nav-item ${n.key === active ? 'active' : ''}" href="${n.href}">${I(n.icon)}<span>${n.label}</span></a>`
  ).join('');
}

function wireGlobalChrome() {
  document.addEventListener('click', e => {
    if (e.target.closest('#modalClose') || e.target.closest('#modalCloseBtn')) {
      document.getElementById('modalOverlay')?.classList.remove('open');
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.getElementById('modalOverlay')?.classList.remove('open');
  });
}

export function mountShell({ active, requireVerified = true } = {}) {
  initTheme();

  if (!document.getElementById('pd-canvas')) {
    const canvas = document.createElement('canvas');
    canvas.id = 'pd-canvas';
    document.body.prepend(canvas);
    startParticles('pd-canvas');
  }

  if (!document.querySelector('.orb')) {
    ['orb-1','orb-2','orb-3'].forEach(cls => {
      const d = document.createElement('div');
      d.className = `orb ${cls}`;
      document.body.prepend(d);
    });
  }

  if (!document.getElementById('modalOverlay')) {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="overlay" id="modalOverlay">
        <section class="modal" role="dialog" aria-modal="true">
          <div class="modal-head">
            <h3 id="modalTitle">Dialog</h3>
            <button class="modal-close" id="modalClose">${I('x')}</button>
          </div>
          <div class="modal-body" id="modalBody"></div>
        </section>
      </div>
      <div class="toast-host" id="toastHost"></div>`);
  }
  wireGlobalChrome();

  const sidebarSlot = $('sidebarSlot');
  const topbarSlot = $('topbarSlot');
  const mobileSlot = $('mobileBottomSlot');

  if (sidebarSlot) sidebarSlot.innerHTML = `
    <div class="brand"><img src="${APP_LOGO_URL}" alt=""><span>PetaDrive</span></div>
    <nav class="nav-group">${navHtml(active)}</nav>
    <div style="margin-top:auto">
      <button class="nav-item" id="logoutBtn" style="width:100%;border:0;background:none;text-align:left">
        ${I('logout')}<span>Sign out</span>
      </button>
    </div>`;

  if (mobileSlot) mobileSlot.innerHTML = navHtml(active);

  if (topbarSlot) topbarSlot.innerHTML = `
    <button class="btn-icon" id="themeToggle" title="Toggle theme">${I('settings')}</button>
    <div class="topbar-actions">
      <button class="btn-icon" id="adminBtn" title="Admin" style="display:none">${I('ban')}</button>
      <a class="avatar" id="avatarBtn" href="/app/settings.html" title="Account">?</a>
    </div>`;

  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) { location.href = '/auth/login.html'; return; }
      try { await reload(user); } catch (e) {}
      const [profSnap, adminSnap] = await Promise.all([
        get(ref(db, `users/${user.uid}/profile`)),
        get(ref(db, `users/${user.uid}/admin`)),
      ]);
      const admin = adminSnap.val() || {};
      if (admin.banned) {
        toast(admin.banReason ? `Account suspended: ${admin.banReason}` : 'Account suspended.', 'error');
        await signOut(auth); location.href = '/auth/login.html'; return;
      }
      if (requireVerified && !user.emailVerified) { location.href = '/auth/login.html?verify=1'; return; }
      const profile = profSnap.val() || {};
      const isAdmin = ADMIN_EMAILS.includes(user.email);
      const avatarBtn = $('avatarBtn');
      if (avatarBtn) avatarBtn.textContent = (profile.displayName || user.email || '?').slice(0,1).toUpperCase();
      const adminBtn = $('adminBtn');
      if (adminBtn && isAdmin) { adminBtn.style.display = ''; adminBtn.onclick = () => location.href = '/app/settings.html#admin'; }
      $('logoutBtn')?.addEventListener('click', async () => { await signOut(auth); location.href = '/auth/login.html'; });
      $('themeToggle')?.addEventListener('click', () => {
        const cur = document.documentElement.dataset.theme;
        const next = cur === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        localStorage.setItem('pd-theme', next);
      });
      resolve({ user, profile, isAdmin });
    });
  });
}

export async function getIdToken(forceRefresh = false) {
  if (!auth.currentUser) throw new Error('Not signed in.');
  return auth.currentUser.getIdToken(forceRefresh);
}
