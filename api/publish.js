const crypto = require('crypto');
const { getAdmin } = require('./_lib/firebaseAdmin');
const { requireUser, sendError } = require('./_lib/verify');

function shareId() { return crypto.randomBytes(6).toString('base64url'); }

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed.' });
  try {
    const user = await requireUser(req);
    let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } } body = body || {};
    const { fileId } = body;
    if (!fileId) { const e = new Error('Missing fileId.'); e.status = 400; throw e; }

    const admin = getAdmin();
    const fileRef = admin.database().ref(`userFiles/${user.uid}/${fileId}`);
    const snap = await fileRef.get();
    if (!snap.exists()) { const e = new Error('File not found.'); e.status = 404; throw e; }
    const f = snap.val();

    // Already published — hand back the existing link instead of making a new one.
    if (f.publishedPath) {
      const existing = await admin.database().ref(`publishedFiles/${f.publishedPath}`).get();
      if (existing.exists()) return res.status(200).json({ success: true, url: `${siteUrl(req)}/d/${f.publishedPath}` });
    }

    const id = shareId();
    // `parts` carries the ordered chunk URLs for files that were split on upload
    // (see files.js / api/upload.js); api/f.js re-joins them into one stream.
    // Older/legacy single-part records fall back to a single-item parts array.
    const parts = Array.isArray(f.parts) && f.parts.length ? f.parts : [{ url: f.directUrl, size: f.size }];
    await admin.database().ref(`publishedFiles/${id}`).set({
      uid: user.uid, fileId, filename: f.filename, size: f.size, mimeType: f.mimeType || '',
      extension: f.extension || '', directUrl: f.directUrl, parts, provider: f.provider || 'droplink', createdAt: Date.now(),
    });
    const url = `${siteUrl(req)}/d/${id}`;
    await fileRef.update({ publishedPath: id, publishedUrl: url });
    res.status(200).json({ success: true, url });
  } catch (e) { sendError(res, e); }
};

function siteUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${req.headers.host}`;
}
