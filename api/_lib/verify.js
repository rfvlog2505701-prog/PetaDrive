const { getAdmin } = require('./firebaseAdmin');

/** Verifies the Firebase ID token sent as "Authorization: Bearer <token>".
 *  Throws if missing/invalid/expired. Returns the decoded token (has .uid, .email). */
async function requireUser(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/i);
  if (!match) { const e = new Error('Missing Authorization header.'); e.status = 401; throw e; }
  try {
    const admin = getAdmin();
    const decoded = await admin.auth().verifyIdToken(match[1]);
    const banSnap = await admin.database().ref(`users/${decoded.uid}/admin/banned`).get();
    if (banSnap.val() === true) { const e = new Error('Account suspended.'); e.status = 403; throw e; }
    return decoded;
  } catch (e) {
    if (e.status) throw e;
    const err = new Error('Invalid or expired session. Please sign in again.'); err.status = 401; throw err;
  }
}

/** Verifies a reCAPTCHA v3 token with Google. Returns the score (0-1).
 *  If RECAPTCHA_SECRET_KEY is not configured, this is a no-op that returns 1
 *  so local/dev setups without reCAPTCHA configured still work. */
async function requireRecaptcha(token, expectedAction, minScore = 0.4) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return 1; // not configured — skip (see README to enable)
  if (!token) { const e = new Error('Missing reCAPTCHA token.'); e.status = 400; throw e; }
  const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: token }),
  });
  const data = await res.json();
  if (!data.success || (expectedAction && data.action !== expectedAction) || data.score < minScore) {
    const e = new Error('reCAPTCHA verification failed.'); e.status = 403; throw e;
  }
  return data.score;
}

function sendError(res, e) {
  const status = e.status || 500;
  res.status(status).json({ success: false, error: e.message || 'Server error.' });
}

module.exports = { requireUser, requireRecaptcha, sendError };
