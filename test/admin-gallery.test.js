const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { isAuthorized } = require('../lib/admin-gallery');
const login = require('../api/admin-login');
const gallery = require('../api/gallery');

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = body; },
    get status() { return this.statusCode; }
  };
}

function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

test('gallery uploads require an authenticated admin session', async () => {
  const req = Readable.from([]);
  req.method = 'POST';
  req.headers = { host: 'example.test', origin: 'https://example.test' };
  const res = response();
  await gallery(req, res);
  assert.equal(res.statusCode, 401);
  assert.match(res.body, /sign in as an administrator/i);
});

test('gallery caption edits and deletes require an authenticated admin session', async () => {
  for (const method of ['PATCH', 'DELETE']) {
    const req = Readable.from([]);
    req.method = method;
    req.headers = { host: 'example.test', origin: 'https://example.test' };
    const res = response();
    await gallery(req, res);
    assert.equal(res.statusCode, 401);
  }
});

test('admin login rejects invalid credentials', async () => {
  process.env.ADMIN_EMAIL = 'admin@example.test';
  process.env.ADMIN_PASSWORD_HASH = passwordHash('correct horse battery');
  process.env.SESSION_SECRET = 'a-test-secret-that-is-at-least-32-characters-long';
  const req = Readable.from([JSON.stringify({ email: 'admin@example.test', password: 'incorrect password' })]);
  req.method = 'POST';
  req.headers = { host: 'example.test', origin: 'https://example.test' };
  const res = response();
  await login(req, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.headers['Set-Cookie'], undefined);
});

test('valid admin login creates an HttpOnly session accepted by the session check', async () => {
  process.env.ADMIN_EMAIL = 'admin@example.test';
  process.env.ADMIN_PASSWORD_HASH = passwordHash('correct horse battery');
  process.env.SESSION_SECRET = 'a-test-secret-that-is-at-least-32-characters-long';
  const req = Readable.from([JSON.stringify({ email: 'ADMIN@example.test', password: 'correct horse battery' })]);
  req.method = 'POST';
  req.headers = { host: 'example.test', origin: 'https://example.test' };
  const res = response();
  await login(req, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Strict/);
  const cookie = res.headers['Set-Cookie'].split(';')[0];
  assert.equal(isAuthorized({ headers: { cookie } }), true);
});

test('login rejects a cross-origin request', async () => {
  const req = Readable.from([JSON.stringify({ email: 'admin@example.test', password: 'anything' })]);
  req.method = 'POST';
  req.headers = { host: 'example.test', origin: 'https://attacker.test' };
  const res = response();
  await login(req, res);
  assert.equal(res.statusCode, 403);
});
