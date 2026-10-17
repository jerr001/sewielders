const contactForm = document.getElementById('contact-form');

if (contactForm) {
  const status = document.getElementById('contact-status');
  const submit = document.getElementById('contact-submit');

  contactForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    status.textContent = 'Sending your message…';
    status.className = 'contact-status';

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(contactForm).entries()))
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Your message could not be sent.');
      status.textContent = result.message;
      status.className = 'contact-status success';
      contactForm.reset();
    } catch (error) {
      status.textContent = error.message;
      status.className = 'contact-status error';
    } finally {
      submit.disabled = false;
    }
  });
}
