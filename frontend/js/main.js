const menuToggle = document.querySelector('.mobile-menu-toggle');
const mainNav = document.querySelector('.main-nav');

if (menuToggle && mainNav) {
  menuToggle.addEventListener('click', () => {
    const isOpen = mainNav.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
  });

  mainNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      mainNav.classList.remove('open');
      menuToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

const currentPage = document.body.dataset.page;
if (currentPage) {
  const navLinks = document.querySelectorAll('.main-nav a');
  navLinks.forEach((link) => {
    if (link.dataset.page === currentPage) {
      link.classList.add('active');
    }
  });
}
