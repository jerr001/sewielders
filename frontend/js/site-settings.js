fetch('/api/site-settings')
  .then((response) => response.json())
  .then(({ settings, customized }) => {
    if (!settings || !customized) return;
    document.querySelectorAll('[data-site-setting]').forEach((element) => {
      const key = element.dataset.siteSetting;
      const value = settings[key];
      if (typeof value !== 'string') return;
      if (key === 'headOffice') element.textContent = `Head Office: ${value}`;
      else if (key === 'branchOffice') element.textContent = `Branch: ${value}`;
      else element.textContent = value;
    });
    document.querySelectorAll('a[href^="tel:"]').forEach((link) => {
      link.href = `tel:${settings.phonePrimary.replace(/[^+\d]/g, '')}`;
      link.textContent = settings.phonePrimary;
    });
  })
  .catch(() => {});
