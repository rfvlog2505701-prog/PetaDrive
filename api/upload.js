const Busboy = require('busboy');
const { getAdmin } = require('./_lib/firebaseAdmin');
const { requireUser, sendError } = require('./_lib/verify');

// IMPORTANT (read this before raising MAX_FILE):
// Vercel's Node.js Serverless Functions currently cap the incoming request
// body at 4.5 MB — this is a platform limit, not something this code can lift.
// This endpoint now only ever receives one CHUNK of a file at a time: the
// browser (public/assets/js/files.js) splits every upload into CHUNK_SIZE
// pieces (public/assets/js/firebase-config.js) before calling /api/upload,
// so there is no longer a whole-file size cap — only a per-chunk one, which
// must stay under this 4.5MB platform ceiling. MAX_FILE here is that per-chunk
// limit, kept a little under CHUNK_SIZE as headroom for multipart overhead.
const MAX_FILE = 4 * 1024 * 1024; // 4 MB per chunk
const DROP_LINK_BASE = 'https://droplink-a7b1.onrender.com';

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers, limits: { fileSize: MAX_FILE, files: 1 } });
    let fileBuf = null, fileName = '', mimeType = '', token = '', tooBig = false;
    busboy.on('field', (name, val) => { if (name === 'token') token = val; });
    busboy.on('file', (name, stream, info) => {
      fileName = info.filename; mimeType = info.mimeType;
      const chunks = [];
      stream.on('data', (d) => chunks.push(d));
      stream.on('limit', () => { tooBig = true; });
      stream.on('end', () => { fileBuf = Buffer.concat(chunks); });
    });
    busboy.on('error', reject);
    busboy.on('finish', () => {
      if (tooBig) return reject(Object.assign(new Error(`File exceeds the ${MAX_FILE / 1024 / 1024}MB limit.`), { status: 413 }));
      if (!fileBuf) return reject(Object.assign(new Error('No file was uploaded.'), { status: 400 }));
      resolve({ fileBuf, fileName, mimeType, token });
    });
    req.pipe(busboy);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed.' });
  try {
    const user = await requireUser(req);
    const { fileBuf, fileName, mimeType, token } = await parseMultipart(req);
    if (!token) { const e = new Error('Missing upload token.'); e.status = 400; throw e; }

    const admin = getAdmin();
    const tokenRef = admin.database().ref(`uploadTokens/${token}`);
    // Atomic single-use claim: the token is only valid once, for the uid that requested it, before it expires.
    const result = await tokenRef.transaction((cur) => {
      if (!cur) return cur; // aborts — unknown token
      if (cur.used || cur.uid !== user.uid || cur.expiresAt < Date.now()) return; // aborts — reused/foreign/expired
      cur.used = true; cur.usedAt = Date.now();
      return cur;
    });
    if (!result.committed) { const e = new Error('Upload token is invalid, expired, or already used.'); e.status = 403; throw e; }

    const DROP_API_KEY = process.env.DROP_API_KEY;
    if (!DROP_API_KEY) throw new Error('Server is missing the DROP_API_KEY environment variable.');

    const form = new FormData();
    form.append('file', new Blob([fileBuf], { type: mimeType || 'application/octet-stream' }), fileName);
    form.append('shorten', 'true');

    const upstream = await fetch(`${DROP_LINK_BASE}/api/upload/file`, { method: 'POST', headers: { 'X-API-Key': DROP_API_KEY }, body: form });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok || !data.success) {
      const msg = upstream.status === 401 ? 'Storage provider key is invalid.' : upstream.status === 429 ? 'Daily upload limit reached.' : (data.error || data.message || `Upload failed (${upstream.status}).`);
      const e = new Error(msg); e.status = 502; throw e;
    }
    const directUrl = data.direct_url || data.url;
    if (!directUrl || !/^https:\/\//i.test(directUrl)) throw new Error('Storage provider did not return a valid HTTPS URL.');

    res.status(200).json({
      success: true,
      filename: String(data.filename || fileName),
      size: Number(data.size) || fileBuf.length,
      mimeType: mimeType || 'application/octet-stream',
      directUrl,
      providerUrl: data.url || '',
      shortUrl: data.short_url || '',
      temporary: !!data.temporary,
      expiresIn: data.expires_in ?? null,
    });
  } catch (e) { sendError(res, e); }
};

module.exports.config = { api: { bodyParser: false } };
