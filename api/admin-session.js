const { isAuthorized, sendJson } = require('../lib/admin-gallery');

module.exports = (req, res) => {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
  return sendJson(res, 200, { authenticated: isAuthorized(req) });
};
