const { createSession, sameOrigin, sendJson, setSessionCookie, verifyPassword, SESSION_SECONDS } = require('../lib/admin-gallery');

module.exports.config = { api: { bodyParser: false } };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  if (!sameOrigin(req)) return sendJson(res, 403, { error: 'Request origin was rejected' });
  let body = '';
  try {
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 4096) return sendJson(res, 413, { error: 'Request is too large' });
    }
    const { email, password } = JSON.parse(body || '{}');
    if (typeof email !== 'string' || typeof password !== 'string' || email.length > 254 || password.length > 1024) {
      return sendJson(res, 400, { error: 'Enter your admin email and password.' });
    }
    const correctEmail = email.trim().toLowerCase() === (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    if (!correctEmail || !verifyPassword(password)) return sendJson(res, 401, { error: 'Email or password is incorrect.' });
    setSessionCookie(res, createSession(), SESSION_SECONDS);
    return sendJson(res, 200, { ok: true });
  } catch (_) {
    return sendJson(res, 400, { error: 'Could not process the login request.' });
  }
};
