// Streams a file — possibly split into several provider-hosted chunks — to the
// client as one continuous response. The caller (api/f.js) never exposes the
// upstream provider's URL to the browser: it is fetched here, server-side, and
// piped straight into the response.
function safeFilename(name) {
  return String(name || 'file').replace(/[\r\n"]/g, '_');
}

async function streamParts(res, parts, { filename, mimeType, totalSize, disposition = 'inline' }) {
  res.setHeader('Content-Type', mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${disposition}; filename="${safeFilename(filename)}"`);
  if (totalSize) res.setHeader('Content-Length', String(totalSize));
  res.setHeader('Cache-Control', 'private, max-age=0, no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  for (const part of parts) {
    const upstream = await fetch(part.url);
    if (!upstream.ok || !upstream.body) {
      throw Object.assign(new Error('A part of this file could not be fetched from storage.'), { status: 502 });
    }
    const reader = upstream.body.getReader();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const ok = res.write(Buffer.from(value));
      if (!ok) await new Promise((resolve) => res.once('drain', resolve));
    }
  }
  res.end();
}

module.exports = { streamParts };
