const multer = require('multer');
const { put, del } = require('@vercel/blob');
const { galleryCollection, isAuthorized, sameOrigin, sendJson } = require('../lib/admin-gallery');

const MAX_IMAGES = Number(process.env.GALLERY_MAX_IMAGES || 10);
const MAX_FILE_BYTES = Number(process.env.GALLERY_MAX_FILE_BYTES || 3145728);
const MAX_REQUEST_BYTES = Math.min(Number(process.env.GALLERY_MAX_REQUEST_BYTES || 4194304), 4400000);
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: MAX_IMAGES, fileSize: MAX_FILE_BYTES, fieldSize: 2048, fields: MAX_IMAGES, parts: MAX_IMAGES * 2 + 2 },
  fileFilter: (_req, file, callback) => {
    if (!allowedTypes.has(file.mimetype)) return callback(new Error('Unsupported image type'));
    return callback(null, true);
  }
}).array('photos', MAX_IMAGES);

module.exports.config = { api: { bodyParser: false, sizeLimit: '4.4mb' } };

function imageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function publicImage(record) {
  return { url: record.url, filename: record.filename, caption: record.caption || '', createdAt: record.createdAt };
}

function cleanCaption(value) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200) : '';
}

function readJson(req, maxBytes = 4096) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) reject(Object.assign(new Error('Request too large'), { status: 413 }));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch (_) { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function adminMutation(req, res, action) {
  if (!isAuthorized(req)) return sendJson(res, 401, { error: 'Please sign in as an administrator.' });
  if (!sameOrigin(req)) return sendJson(res, 403, { error: 'Request origin was rejected' });
  return (async () => {
    try {
      const body = await readJson(req);
      const collection = await galleryCollection();
      const url = typeof body.url === 'string' ? body.url : '';
      const record = await collection.findOne({ url });
      if (!record) return sendJson(res, 404, { error: 'That gallery photo could not be found.' });
      if (action === 'caption') {
        const caption = cleanCaption(body.caption);
        await collection.updateOne({ url }, { $set: { caption } });
        return sendJson(res, 200, { image: publicImage({ ...record, caption }) });
      }
      // Remove the original uploaded file before deleting its database entry.
      await del(record.url);
      await collection.deleteOne({ url });
      return sendJson(res, 200, { deleted: true });
    } catch (error) {
      console.error(`[gallery] ${action} failed:`, error);
      return sendJson(res, error.status || 502, { error: 'The gallery could not be updated. Please try again.' });
    }
  })();
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      const records = await (await galleryCollection()).find({}, { projection: { _id: 0, url: 1, filename: 1, caption: 1, createdAt: 1 } }).sort({ createdAt: -1 }).limit(300).toArray();
      return sendJson(res, 200, { images: records.map(publicImage) });
    } catch (error) {
      console.error('[gallery] list failed:', error);
      const message = !process.env.MONGODB_URI
        ? 'The gallery database is not configured. Check MONGODB_URI in Vercel.'
        : 'Cannot connect to the gallery database. Check the MongoDB settings and Atlas Network Access.';
      return sendJson(res, 503, { error: message });
    }
  }
  if (req.method === 'PATCH') return adminMutation(req, res, 'caption');
  if (req.method === 'DELETE') return adminMutation(req, res, 'delete');
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  if (!isAuthorized(req)) return sendJson(res, 401, { error: 'Please sign in as an administrator to upload photos.' });
  if (!sameOrigin(req)) return sendJson(res, 403, { error: 'Request origin was rejected' });
  return upload(req, res, async (error) => {
    if (error) {
      const tooLarge = error.code === 'LIMIT_FILE_SIZE' || error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_PART_COUNT';
      return sendJson(res, tooLarge ? 413 : 400, { error: tooLarge ? 'The upload is too large. Use fewer or smaller photos.' : 'Choose JPG, PNG, or WebP image files.' });
    }
    const files = req.files || [];
    if (!files.length) return sendJson(res, 400, { error: 'Choose at least one photo to upload.' });
    const requestBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (requestBytes > MAX_REQUEST_BYTES) return sendJson(res, 413, { error: 'The total upload must be 4 MB or less.' });
    for (const file of files) {
      if (!allowedTypes.has(file.mimetype) || imageType(file.buffer) !== file.mimetype) {
        return sendJson(res, 400, { error: `${file.originalname} is not a supported image file.` });
      }
    }

    const saved = [];
    try {
      const collection = await galleryCollection();
      const rawCaptions = req.body && req.body.captions;
      const captions = Array.isArray(rawCaptions) ? rawCaptions : rawCaptions === undefined ? [] : [rawCaptions];
      for (const file of files) {
        const fileIndex = files.indexOf(file);
        const extension = file.mimetype === 'image/jpeg' ? 'jpg' : file.mimetype.slice(6);
        const blob = await put(`gallery/${cryptoRandomName()}.${extension}`, file.buffer, {
          access: 'public', contentType: file.mimetype, addRandomSuffix: false
        });
        const record = { url: blob.url, pathname: blob.pathname, filename: cleanFilename(file.originalname), caption: cleanCaption(captions[fileIndex]), contentType: file.mimetype, size: file.size, createdAt: new Date() };
        saved.push({ blob, record });
        await collection.insertOne(record);
      }
      return sendJson(res, 201, { uploaded: saved.map(({ record }) => publicImage(record)) });
    } catch (error) {
      console.error('[gallery] upload failed:', error);
      for (const item of saved) {
        try { await del(item.blob.url); } catch (_) { /* best effort cleanup */ }
        try { await (await galleryCollection()).deleteOne({ url: item.record.url }); } catch (_) { /* best effort cleanup */ }
      }
      return sendJson(res, 502, { error: 'Some photos could not be saved. Please try again.' });
    }
  });
};

function cryptoRandomName() {
  return require('node:crypto').randomUUID();
}

function cleanFilename(name) {
  return name.replace(/[\\/\0-\x1f\x7f]/g, '').trim().slice(0, 120) || 'Gallery photo';
}
