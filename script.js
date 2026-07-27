document.addEventListener('DOMContentLoaded', () => {
  // Scroll animation observer
  const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.1
  };

  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll('.fade-in').forEach(el => {
    observer.observe(el);
  });

  // Dynamic header blur effect on scroll
  const header = document.querySelector('header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      header.style.borderBottomColor = 'rgba(255, 255, 255, 0.12)';
    } else {
      header.style.borderBottomColor = 'rgba(255, 255, 255, 0.08)';
    }
  });
});
