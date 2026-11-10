const Busboy = require('busboy');
const { getAdmin } = require('./_lib/firebaseAdmin');
const { sendError } = require('./_lib/verify');

const MAX_FILE = 4 * 1024 * 1024; // 4 MB — Vercel serverless cap
const DROP_LINK_BASE = 'https://droplink-a7b1.onrender.com';

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers, limits: { fileSize: MAX_FILE, files: 1 } });
    let fileBuf = null, fileName = '', mimeType = '', tooBig = false;
    busboy.on('file', (name, stream, info) => {
      fileName = info.filename; mimeType = info.mimeType;
      const chunks = [];
      stream.on('data', d => chunks.push(d));
      stream.on('limit', () => { tooBig = true; });
      stream.on('end', () => { fileBuf = Buffer.concat(chunks); });
    });
    busboy.on('error', reject);
    busboy.on('finish', () => {
      if (tooBig) return reject(Object.assign(new Error('File exceeds the 4 MB API limit.'), { status: 413 }));
      if (!fileBuf) return reject(Object.assign(new Error('No file was uploaded.'), { status: 400 }));
      resolve({ fileBuf, fileName, mimeType });
    });
    req.pipe(busboy);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  try {
    // ── auth via API key ──
    const apiKeyValue = req.headers['x-api-key'] || '';
    if (!apiKeyValue || !apiKeyValue.startsWith('pd_')) {
      return res.status(401).json({ error: 'Invalid or missing API key.' });
    }

    const admin = getAdmin();
    const db = admin.database();

    // Find the key record across all users
    const keysSnap = await db.ref('apiKeys').orderByChild('key').equalTo(apiKeyValue).limitToFirst(1).once('value');
    if (!keysSnap.exists()) {
      return res.status(401).json({ error: 'Invalid or missing API key.' });
    }
    const [ownerUid, keyRecord] = (() => {
      let uid, rec;
      keysSnap.forEach(userSnap => {
        uid = userSnap.key;
        userSnap.forEach(k => { rec = { keyId: k.key, ...k.val() }; });
      });
      return [uid, rec];
    })();
    if (!ownerUid || !keyRecord) return res.status(401).json({ error: 'Invalid or missing API key.' });

    // ── parse file ──
    const { fileBuf, fileName, mimeType } = await parseMultipart(req);

    // ── check quota ──
    const filesSnap = await db.ref(`userFiles/${ownerUid}`).once('value');
    const filesData = filesSnap.val() || {};
    const usedBytes = Object.values(filesData)
      .filter(f => !f.isDeleted)
      .reduce((n, f) => n + (Number(f.size) || 0), 0);
    const FREE_QUOTA = 10 * 1024 ** 3;
    if (usedBytes + fileBuf.length > FREE_QUOTA) {
      return res.status(507).json({ error: 'Storage quota exceeded.' });
    }

    // ── upload to storage provider ──
    const DROP_API_KEY = process.env.DROP_API_KEY;
    if (!DROP_API_KEY) throw new Error('Server is missing the DROP_API_KEY environment variable.');

    const form = new FormData();
    form.append('file', new Blob([fileBuf], { type: mimeType || 'application/octet-stream' }), fileName);
    form.append('shorten', 'true');

    const upstream = await fetch(`${DROP_LINK_BASE}/api/upload/file`, {
      method: 'POST',
      headers: { 'X-API-Key': DROP_API_KEY },
      body: form,
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok || !data.success) {
      const msg = upstream.status === 429 ? 'Daily upload limit reached.' : (data.error || `Upload failed (${upstream.status}).`);
      return res.status(502).json({ error: msg });
    }
    const directUrl = data.direct_url || data.url;
    if (!directUrl || !/^https:\/\//i.test(directUrl)) throw new Error('Storage provider did not return a valid URL.');

    // ── record file in Firebase ──
    const { ref, push: fbPush, set: fbSet, update: fbUpdate } = require('firebase-admin/database');
    // Use admin SDK ref directly
    const newFileRef = db.ref(`userFiles/${ownerUid}`).push();
    const fileRecord = {
      fileId: newFileRef.key,
      ownerUid,
      filename: String(data.filename || fileName),
      size: Number(data.size) || fileBuf.length,
      mimeType: mimeType || 'application/octet-stream',
      extension: (String(data.filename || fileName).split('.').pop() || '').toLowerCase(),
      folderId: null,
      provider: 'droplink',
      directUrl,
      providerUrl: data.url || '',
      uploadedAt: Date.now(),
      modifiedAt: Date.now(),
      isStarred: false,
      isDeleted: false,
      publishedUrl: '',
      viewUrl: '',
      downloadUrl: directUrl,
      uploadedViaApi: true,
      apiKeyId: keyRecord.keyId,
    };
    await newFileRef.set(fileRecord);

    // ── auto-publish: create publishedFiles entry for view link ──
    const publishId = db.ref('publishedFiles').push().key;
    const publishedRecord = {
      fileId: newFileRef.key,
      ownerUid,
      filename: fileRecord.filename,
      size: fileRecord.size,
      mimeType: fileRecord.mimeType,
      extension: fileRecord.extension,
      directUrl,
      publishedAt: Date.now(),
    };
    await db.ref(`publishedFiles/${publishId}`).set(publishedRecord);
    const viewUrl = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['host']}/d/${publishId}`;
    await newFileRef.update({ publishedUrl: viewUrl, viewUrl, publishedPath: publishId });

    // ── update API key usage ──
    await db.ref(`apiKeys/${ownerUid}/${keyRecord.keyId}`).update({
      lastUsedAt: Date.now(),
      uploadCount: (keyRecord.uploadCount || 0) + 1,
    });

    res.status(200).json({
      success: true,
      filename: fileRecord.filename,
      size: fileRecord.size,
      viewUrl,
      downloadUrl: directUrl,
    });

  } catch (e) {
    console.error('upload-public error:', e);
    res.status(e.status || 500).json({ error: e.message || 'Internal server error.' });
  }
};

module.exports.config = { api: { bodyParser: false } };
