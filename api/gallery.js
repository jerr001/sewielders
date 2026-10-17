const multer = require('multer');
const { put, del } = require('@vercel/blob');
const { galleryCollection, isAuthorized, sameOrigin, sendJson } = require('../lib/admin-gallery');

const MAX_IMAGES = Number(process.env.GALLERY_MAX_IMAGES || 10);
const MAX_FILE_BYTES = Number(process.env.GALLERY_MAX_FILE_BYTES || 3145728);
const MAX_REQUEST_BYTES = Math.min(Number(process.env.GALLERY_MAX_REQUEST_BYTES || 4194304), 4400000);
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: MAX_IMAGES, fileSize: MAX_FILE_BYTES, fieldSize: 2048, parts: MAX_IMAGES + 2 },
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
  return { url: record.url, filename: record.filename, createdAt: record.createdAt };
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      const records = await (await galleryCollection()).find({}, { projection: { _id: 0, url: 1, filename: 1, createdAt: 1 } }).sort({ createdAt: -1 }).limit(300).toArray();
      return sendJson(res, 200, { images: records.map(publicImage) });
    } catch (_) {
      return sendJson(res, 503, { error: 'The gallery is temporarily unavailable.' });
    }
  }
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
      for (const file of files) {
        const extension = file.mimetype === 'image/jpeg' ? 'jpg' : file.mimetype.slice(6);
        const blob = await put(`gallery/${cryptoRandomName()}.${extension}`, file.buffer, {
          access: 'public', contentType: file.mimetype, addRandomSuffix: false
        });
        const record = { url: blob.url, pathname: blob.pathname, filename: cleanFilename(file.originalname), contentType: file.mimetype, size: file.size, createdAt: new Date() };
        saved.push({ blob, record });
        await collection.insertOne(record);
      }
      return sendJson(res, 201, { uploaded: saved.map(({ record }) => publicImage(record)) });
    } catch (_) {
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
