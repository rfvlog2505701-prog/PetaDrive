const crypto = require('crypto');
const { getAdmin } = require('./_lib/firebaseAdmin');
const { requireUser, requireRecaptcha, sendError } = require('./_lib/verify');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed.' });
  try {
    const user = await requireUser(req);
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};
    await requireRecaptcha(body.recaptchaToken, 'upload_token');

    const admin = getAdmin();
    const token = crypto.randomBytes(24).toString('hex');
    const now = Date.now();
    // A fresh, unused token record. upload.js claims this atomically (transaction)
    // so a token can be redeemed exactly once, by the user who requested it.
    await admin.database().ref(`uploadTokens/${token}`).set({ uid: user.uid, used: false, createdAt: now, expiresAt: now + 5 * 60 * 1000 });
    res.status(200).json({ success: true, token, expiresIn: 300 });
  } catch (e) { sendError(res, e); }
};
