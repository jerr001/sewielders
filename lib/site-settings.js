const DEFAULT_SITE_SETTINGS = Object.freeze({
  phonePrimary: '+234(802)-553-1947',
  phoneSecondary: '08163443133',
  email: 'info@sewielders.org',
  headOffice: '53 Juba Alaro Street, Off Liasu Road, Egbe, Lagos',
  branchOffice: 'Umuokwu Village, Alor, Anambra State',
  facebook: '',
  instagram: '',
  x: '',
  linkedin: ''
});

function cleanSiteSettings(values = {}) {
  const result = {};
  for (const [key, fallback] of Object.entries(DEFAULT_SITE_SETTINGS)) {
    const value = values[key];
    result[key] = typeof value === 'string' ? value.trim().slice(0, key.endsWith('Office') ? 300 : 254) : fallback;
  }
  return result;
}

module.exports = { DEFAULT_SITE_SETTINGS, cleanSiteSettings };
