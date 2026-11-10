const { getAdmin } = require('./_lib/firebaseAdmin');
const { streamParts } = require('./_lib/stream');

// GET /f/<id>  (rewritten by vercel.json to /api/f.js?id=<id>)
// This is the "direct link" for a published file: it streams the bytes
// through our own server instead of redirecting to the storage provider, so
// the provider's domain is never visible to whoever opens the link, and a
// file that was split into chunks on upload is re-joined transparently.
module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).json({ success: false, error: 'Method not allowed.' });
  try {
    const id = String(req.query.id || '').trim();
    if (!id) return res.status(400).json({ success: false, error: 'Missing id.' });

    const admin = getAdmin();
    const snap = await admin.database().ref(`publishedFiles/${id}`).get();
    if (!snap.exists()) return res.status(404).json({ success: false, error: 'Link not found. It may have been revoked by its owner.' });
    const f = snap.val();
    const parts = Array.isArray(f.parts) && f.parts.length ? f.parts : [{ url: f.directUrl, size: f.size }];

    if (req.method === 'HEAD') {
      res.setHeader('Content-Type', f.mimeType || 'application/octet-stream');
      if (f.size) res.setHeader('Content-Length', String(f.size));
      return res.status(200).end();
    }

    await streamParts(res, parts, { filename: f.filename, mimeType: f.mimeType, totalSize: f.size, disposition: 'inline' });
  } catch (e) {
    if (!res.headersSent) res.status(e.status || 500).json({ success: false, error: e.message || 'Server error.' });
    else res.end();
  }
};

module.exports.config = { api: { bodyParser: false } };
