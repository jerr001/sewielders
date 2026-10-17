const crypto = require('node:crypto');
const { MongoClient } = require('mongodb');

const COOKIE_NAME = 'sewi_admin_session';
const SESSION_SECONDS = 8 * 60 * 60;
let mongoClient;

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
