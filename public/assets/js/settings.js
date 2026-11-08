import { db, auth, GB } from './firebase-config.js';
import { ref, get, update, runTransaction } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import { updatePassword, sendEmailVerification } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import { $, esc, bytes, toast, showModal, closeModal, applyTheme } from './ui.js';
import { mountShell } from './shell.js';

const emailKey = (email) => String(email).toLowerCase().replace(/[.#$/\[\]]/g, '_');
let adminSel = null;

function adminSelHtml() {
  if (!adminSel) return '';
  const { profile, admin, used, count } = adminSel;
  return `<div class="card" style="margin-top:14px">
    <b>${esc(profile.email || '')}</b> ${admin.banned ? '<span class="pill" style="background:#fef2f2;color:var(--bad)">Banned</span>' : ''}
    <p class="small muted">${count} files · ${bytes(used)} used · +${bytes(admin.extraBytes || 0)} bonus storage</p>
    <div class="field"><label>Add storage (GB)</label><input id="adminGb" type="number" min="1" /></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" id="adminAdd">Add storage</button>
      <button class="btn ${admin.banned ? 'btn-soft' : 'btn-danger'} btn-sm" id="adminBanToggle">${admin.banned ? 'Unban' : 'Ban user'}</button>
    </div></div>`;
}

export async function init() {
  const { user, profile, isAdmin } = await mountShell({ active: 'settings' });

  $('pageContent').innerHTML = `
  <div class="heading"><h1>Settings</h1></div>
  <div class="card" style="margin-bottom:16px"><h3>Profile</h3>
    <div class="field"><label>Display name</label><input id="profileName" value="${esc(profile.displayName || '')}" /></div>
    <button class="btn btn-primary btn-sm" id="saveProfile">Save</button>
    ${!user.emailVerified ? `<p class="small" style="margin-top:10px;color:var(--warn)">Email not verified. <button class="btn btn-plain btn-sm" id="resendVerify">Resend verification</button></p>` : ''}
  </div>
  <div class="card" style="margin-bottom:16px"><h3>Preferences</h3>
    <div class="field"><label>Theme</label><select id="themeSelect"><option value="light">Light</option><option value="dark">Dark</option></select></div>
    <button class="btn btn-primary btn-sm" id="savePrefs">Save preferences</button>
  </div>
  <div class="card" style="margin-bottom:16px"><h3>Password</h3>
    <button class="btn btn-soft btn-sm" id="changePassBtn">Change password</button>
  </div>
  ${isAdmin ? `<div class="card" id="adminCard"><h3>Admin</h3>
    <div class="field"><label>Look up user by email</label><input id="adminEmail" type="email" /></div>
    <button class="btn btn-primary btn-sm" id="adminLookup">Look up</button>
    <div id="adminSel"></div>
  </div>` : ''}`;

  $('themeSelect').value = document.documentElement.dataset.theme || 'light';
  $('saveProfile').onclick = async () => { const n = $('profileName').value.trim(); if (!n) return toast('Enter your name.', 'error'); await update(ref(db, `users/${user.uid}/profile`), { displayName: n }); toast('Profile updated.', 'ok'); };
  $('resendVerify')?.addEventListener('click', async () => { try { await sendEmailVerification(auth.currentUser); toast('Verification email sent.', 'ok'); } catch (e) { toast(e.message, 'error'); } });
  $('savePrefs').onclick = async () => { const theme = $('themeSelect').value; applyTheme(theme); await update(ref(db, `users/${user.uid}/preferences`), { theme }); toast('Preferences saved.', 'ok'); };
  $('changePassBtn').onclick = () => {
    showModal('Change password', `<div class="field"><label>New password</label><input id="newPass" type="password" minlength="8" /></div><div class="field"><label>Confirm</label><input id="confirmPass" type="password" minlength="8" /></div><div class="modal-actions"><button class="btn btn-primary" id="savePass">Update</button></div>`);
    $('savePass').onclick = async () => { const p = $('newPass').value; if (p.length < 8 || p !== $('confirmPass').value) return toast('Passwords must match and be 8+ characters.', 'error'); try { await updatePassword(auth.currentUser, p); closeModal(); toast('Password updated.', 'ok'); } catch (e) { toast(e.message, 'error'); } };
  };

  if (isAdmin) {
    $('adminLookup').onclick = async () => { try { await adminLookup($('adminEmail').value.trim()); } catch (e) { toast(e.message, 'error'); } };
    if (location.hash === '#admin') $('adminCard')?.scrollIntoView();
  }
}

async function adminLookup(email) {
  const s = await get(ref(db, `emailIndex/${emailKey(email)}`));
  if (!s.exists()) throw new Error('No registered user found for this email.');
  const uid = s.val();
  const [p, a, f] = await Promise.all([get(ref(db, `users/${uid}/profile`)), get(ref(db, `users/${uid}/admin`)), get(ref(db, `userFiles/${uid}`))]);
  const files = Object.values(f.val() || {});
  adminSel = { uid, profile: p.val() || {}, admin: a.val() || {}, used: files.filter(x => !x.isDeleted).reduce((n, x) => n + (Number(x.size) || 0), 0), count: files.length };
  const el = $('adminSel'); el.innerHTML = adminSelHtml();
  el.querySelector('#adminAdd').onclick = async () => {
    const gb = Number($('adminGb').value); if (!(gb > 0)) return toast('Enter a valid number of GB.', 'error');
    await runTransaction(ref(db, `users/${adminSel.uid}/admin/extraBytes`), cur => (Number(cur) || 0) + Math.round(gb * GB));
    toast(`Added ${gb} GB.`, 'ok'); await adminLookup(adminSel.profile.email);
  };
  el.querySelector('#adminBanToggle').onclick = async () => {
    const ban = !adminSel.admin.banned;
    let reason = '';
    if (ban) { reason = prompt('Ban reason (optional):', '') || ''; }
    await update(ref(db, `users/${adminSel.uid}/admin`), { banned: ban, bannedAt: ban ? Date.now() : null, banReason: ban ? reason : null });
    toast(ban ? 'User banned.' : 'User unbanned.', 'ok'); await adminLookup(adminSel.profile.email);
  };
}
