const galleryGrid = document.querySelector('.gallery-grid');
const galleryCardTemplate = document.getElementById('uploaded-gallery-card');

if (galleryGrid && galleryCardTemplate) {
  fetch('/api/gallery')
    .then((response) => {
      if (!response.ok) throw new Error('Gallery images unavailable');
      return response.json();
    })
    .then(({ images }) => {
      (images || []).forEach((item) => {
        const card = galleryCardTemplate.content.cloneNode(true);
        const image = card.querySelector('img');
        image.src = item.url;
        image.alt = item.filename || 'Photo from a SEWI community activity';
        card.querySelector('h3').textContent = item.caption || item.filename || 'Community moment';
        galleryGrid.append(card);
      });
    })
    .catch(() => {});
}
