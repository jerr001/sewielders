const { sameOrigin, sendJson, setSessionCookie } = require('../lib/admin-gallery');

module.exports = (req, res) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  if (!sameOrigin(req)) return sendJson(res, 403, { error: 'Request origin was rejected' });
  setSessionCookie(res, '', 0);
  return sendJson(res, 200, { ok: true });
};
