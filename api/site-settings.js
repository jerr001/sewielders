const { siteSettingsCollection, sendJson } = require('../lib/admin-gallery');
const { DEFAULT_SITE_SETTINGS, cleanSiteSettings } = require('../lib/site-settings');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const saved = await (await siteSettingsCollection()).findOne({ _id: 'contact' });
    return sendJson(res, 200, {
      settings: cleanSiteSettings(saved || DEFAULT_SITE_SETTINGS),
      customized: Boolean(saved)
    });
  } catch (error) {
    console.error('[site-settings] load failed:', error);
    return sendJson(res, 200, { settings: DEFAULT_SITE_SETTINGS, customized: false });
  }
};
