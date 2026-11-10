import { auth, db } from './firebase-config.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, onAuthStateChanged, updateProfile } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import { ref, set, get } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';
import { $, initTheme } from './ui.js';

initTheme();
const emailKey = (email) => String(email).toLowerCase().replace(/[.#$/\[\]]/g, '_');

function showErr(msg) {
  const box = $('errBox'); if (!box) return;
  box.textContent = msg; box.classList.remove('hidden');
}
function hideErr() { $('errBox')?.classList.add('hidden'); }

async function initProfile(user, displayName) {
  const r = ref(db, `users/${user.uid}/profile`);
  const snap = await get(r);
  if (!snap.exists()) await set(r, { email: user.email, displayName: displayName || '', createdAt: Date.now() });
  try { await set(ref(db, `emailIndex/${emailKey(user.email)}`), user.uid); } catch (e) { /* already indexed */ }
}

const params = new URLSearchParams(location.search);
if (params.get('verify') === '1') showErr('Please verify your email before continuing. Check your inbox for the verification link.');

export function wireLoginForm() {
  $('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault(); hideErr();
    const email = $('loginEmail').value.trim(), pass = $('loginPass').value;
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      if (!cred.user.emailVerified) {
        showErr('Your email is not verified yet. Check your inbox, or use "Resend verification" below.');
        $('resendWrap')?.classList.remove('hidden');
        return;
      }
      location.href = '/app/dashboard.html';
    } catch (err) { showErr(friendlyAuthError(err)); }
  });
  $('resendBtn')?.addEventListener('click', async () => {
    try {
      if (auth.currentUser) { await sendEmailVerification(auth.currentUser); showErr('Verification email sent. Check your inbox.'); }
    } catch (err) { showErr(friendlyAuthError(err)); }
  });
  $('forgotBtn')?.addEventListener('click', async () => {
    const email = $('loginEmail').value.trim();
    if (!email) return showErr('Enter your email above first.');
    try { await sendPasswordResetEmail(auth, email); showErr('Password reset email sent.'); }
    catch (err) { showErr(friendlyAuthError(err)); }
  });
}

export function wireRegisterForm() {
  $('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault(); hideErr();
    const name = $('regName').value.trim(), email = $('regEmail').value.trim(),
      pass = $('regPass').value, confirm = $('regConfirm').value;
    if (!name) return showErr('Enter your name.');
    if (pass.length < 8) return showErr('Password must be at least 8 characters.');
    if (pass !== confirm) return showErr('Passwords do not match.');
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(cred.user, { displayName: name });
      await initProfile(cred.user, name);
      await sendEmailVerification(cred.user);
      showErr('Account created! A verification link was sent to your email — verify it, then sign in.');
      setTimeout(() => location.href = '/auth/login.html?verify=1', 1800);
    } catch (err) { showErr(friendlyAuthError(err)); }
  });
}

function friendlyAuthError(err) {
  const m = {
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Password is too weak (minimum 8 characters).',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/wrong-password': 'Incorrect email or password.',
    'auth/user-not-found': 'No account found for this email.',
    'auth/too-many-requests': 'Too many attempts. Try again later.',
  };
  return m[err.code] || err.message || 'Something went wrong.';
}
