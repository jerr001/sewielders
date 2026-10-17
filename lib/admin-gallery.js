const crypto = require('node:crypto');
const { MongoClient } = require('mongodb');

const COOKIE_NAME = 'sewi_admin_session';
const SESSION_SECONDS = 8 * 60 * 60;
let mongoClient;

const STARTER_GALLERY = [
  { key: 'community-gathering', url: 'https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=900&q=80', filename: 'Community gathering', caption: 'Community gathering' },
  { key: 'shared-joy', url: 'https://images.unsplash.com/photo-1516574187841-cb9cc2ca948b?auto=format&fit=crop&w=900&q=80', filename: 'Shared joy', caption: 'Shared joy' },
  { key: 'warm-care', url: 'https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?auto=format&fit=crop&w=900&q=80', filename: 'Warm care', caption: 'Warm care' },
  { key: 'volunteer-support', url: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=900&q=80', filename: 'Volunteer support', caption: 'Volunteer support' },
  { key: 'joyful-moments', url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80', filename: 'Joyful moments', caption: 'Joyful moments' },
  { key: 'rest-and-recovery', url: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=900&q=80', filename: 'Rest and recovery', caption: 'Rest and recovery' }
];

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((part) => {
    const index = part.indexOf('=');
    return index < 0 ? ['', ''] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function sessionSignature(payload) {
  return crypto.createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url');
}

function setSessionCookie(res, value, maxAge) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`);
}

function createSession() {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })).toString('base64url');
  return `${payload}.${sessionSignature(payload)}`;
}

function isAuthorized(req) {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) return false;
  try {
    const token = parseCookies(req)[COOKIE_NAME];
    if (!token) return false;
    const [payload, signature] = token.split('.');
    if (!payload || !signature || !safeEqual(signature, sessionSignature(payload))) return false;
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return Number.isInteger(session.exp) && session.exp > Math.floor(Date.now() / 1000);
  } catch (_) {
    return false;
  }
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return !origin || origin === `https://${host}` || origin === `http://${host}`;
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function galleryCollection() {
  if (!process.env.MONGODB_URI) throw new Error('Gallery database is not configured');
  if (!mongoClient) {
    mongoClient = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    await mongoClient.connect();
  }
  const dbName = process.env.MONGODB_DB || 'sewielders';
  const collection = mongoClient.db(dbName).collection('gallery_images');
  await collection.createIndex({ createdAt: -1 });
  const settings = collection.db.collection('gallery_settings');
  const markerId = 'starter-gallery-import-v1';
  if (!await settings.findOne({ _id: markerId })) {
    for (const item of STARTER_GALLERY) {
      await collection.updateOne(
        { _id: `starter:${item.key}` },
        { $setOnInsert: { ...item, _id: `starter:${item.key}`, source: 'starter', createdAt: new Date(0) } },
        { upsert: true }
      );
    }
    try {
      await settings.updateOne({ _id: markerId }, { $setOnInsert: { createdAt: new Date() } }, { upsert: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }
  return collection;
}

function verifyPassword(password) {
  const stored = process.env.ADMIN_PASSWORD_HASH || '';
  const match = stored.match(/^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/i);
  if (!match || !process.env.ADMIN_EMAIL || !process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) return false;
  const candidate = crypto.scryptSync(password, match[1], 64).toString('hex');
  return safeEqual(candidate, match[2].toLowerCase());
}

module.exports = { COOKIE_NAME, SESSION_SECONDS, createSession, galleryCollection, isAuthorized, safeEqual, sameOrigin, sendJson, setSessionCookie, verifyPassword };
