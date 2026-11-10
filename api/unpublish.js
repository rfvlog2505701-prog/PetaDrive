const { getAdmin } = require('./_lib/firebaseAdmin');
const { requireUser, sendError } = require('./_lib/verify');

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
    if (f.publishedPath) await admin.database().ref(`publishedFiles/${f.publishedPath}`).remove();
    await fileRef.update({ publishedPath: '', publishedUrl: '' });
    res.status(200).json({ success: true });
  } catch (e) { sendError(res, e); }
};
