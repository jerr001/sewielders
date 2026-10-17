const { sameOrigin, sendJson, siteSettingsCollection } = require('../lib/admin-gallery');
const { DEFAULT_SITE_SETTINGS, cleanSiteSettings } = require('../lib/site-settings');

module.exports.config = { api: { bodyParser: false } };

function clean(value, limit) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

async function readBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 12000) throw Object.assign(new Error('Request too large'), { status: 413 });
  }
  return JSON.parse(body || '{}');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  if (!sameOrigin(req)) return sendJson(res, 403, { error: 'Request origin was rejected' });

  try {
    const body = await readBody(req);
    // Ignore bot submissions to the hidden honeypot field.
    if (clean(body.website, 200)) return sendJson(res, 200, { ok: true });

    const firstName = clean(body.firstName, 80);
    const lastName = clean(body.lastName, 80);
    const email = clean(body.email, 254);
    const subject = clean(body.subject, 160);
    const message = clean(body.message, 5000);
    if (!firstName || !lastName || !subject || message.length < 5 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendJson(res, 400, { error: 'Please complete every field with a valid email address.' });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.CONTACT_FROM_EMAIL;
    if (!apiKey || !from) {
      return sendJson(res, 503, { error: 'The contact form email service is not configured yet.' });
    }

    let recipient = DEFAULT_SITE_SETTINGS.email;
    const savedSettings = await (await siteSettingsCollection()).findOne({ _id: 'contact' });
    if (savedSettings) recipient = cleanSiteSettings(savedSettings).email || recipient;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [recipient],
        reply_to: email,
        subject: `Website message: ${subject}`,
        text: `Name: ${firstName} ${lastName}\nEmail: ${email}\nSubject: ${subject}\n\n${message}`
      })
    });
    if (!response.ok) {
      const providerError = await response.json().catch(() => ({}));
      console.error('[contact] email provider rejected message:', { status: response.status, message: providerError.message });
      return sendJson(res, 502, { error: 'We could not send your message right now. Please try again later or contact us by phone.' });
    }
    return sendJson(res, 200, { ok: true, message: 'Your message has been sent. Thank you for contacting us.' });
  } catch (error) {
    console.error('[contact] message could not be sent:', { code: error.code, message: error.message });
    if (error.status === 413) return sendJson(res, 413, { error: 'Your message is too long. Please shorten it and try again.' });
    return sendJson(res, 502, { error: 'We could not send your message right now. Please try again later or contact us by phone.' });
  }
};
