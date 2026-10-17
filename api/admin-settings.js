const { isAuthorized, sameOrigin, sendJson, siteSettingsCollection } = require('../lib/admin-gallery');
const { DEFAULT_SITE_SETTINGS, cleanSiteSettings } = require('../lib/site-settings');

module.exports.config = { api: { bodyParser: false } };

async function readBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 8192) throw Object.assign(new Error('Request too large'), { status: 413 });
  }
  return JSON.parse(body || '{}');
}

module.exports = async (req, res) => {
  if (!['GET', 'PUT'].includes(req.method)) return sendJson(res, 405, { error: 'Method not allowed' });
  if (!isAuthorized(req)) return sendJson(res, 401, { error: 'Please sign in as an administrator.' });
  if (!sameOrigin(req)) return sendJson(res, 403, { error: 'Request origin was rejected' });

  try {
    const collection = await siteSettingsCollection();
    if (req.method === 'GET') {
      const saved = await collection.findOne({ _id: 'contact' });
      return sendJson(res, 200, { settings: cleanSiteSettings(saved || DEFAULT_SITE_SETTINGS) });
    }

    const body = await readBody(req);
    const settings = cleanSiteSettings(body);
    if (settings.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.email)) {
      return sendJson(res, 400, { error: 'Enter a valid contact email address.' });
    }
    for (const key of ['facebook', 'instagram', 'x', 'linkedin']) {
      if (settings[key] && !/^https:\/\//i.test(settings[key])) {
        return sendJson(res, 400, { error: 'Social media links must start with https://.' });
      }
    }
    await collection.updateOne({ _id: 'contact' }, { $set: { ...settings, updatedAt: new Date() } }, { upsert: true });
    return sendJson(res, 200, { settings });
  } catch (error) {
    console.error('[admin-settings] request failed:', error);
    return sendJson(res, error.status || 502, { error: error.status === 413 ? 'The settings form is too large.' : 'Settings could not be loaded or saved.' });
  }
};
