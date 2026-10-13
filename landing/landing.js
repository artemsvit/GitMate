// The verified DMG remains available if GitHub's API is unavailable.
async function updateDownloadLinks() {
  try {
    const response = await fetch('https://api.github.com/repos/artemsvit/Gitler/releases/latest', {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) return;
    const release = await response.json();
    const asset = release.assets?.find(asset => /(?:arm64|universal).*\.dmg$/i.test(asset.name));
    if (!asset) return;
    const url = new URL(asset.browser_download_url);
    if (url.origin !== 'https://github.com' || !url.pathname.startsWith('/artemsvit/Gitler/releases/download/')) return;
    document.querySelectorAll('[data-release-download]').forEach(link => { link.href = url.href; });
    document.querySelectorAll('[data-release-version], .version-tag').forEach(label => {
      label.textContent = release.tag_name;
    });
  } catch {
    // Keep normal download links functional on slow or offline connections.
  }
}

updateDownloadLinks();

const navToggle = document.querySelector('.nav-toggle');
const navigation = document.querySelector('#site-navigation');
function closeNavigation() {
  navToggle.setAttribute('aria-expanded', 'false');
  navToggle.setAttribute('aria-label', 'Open navigation');
  navigation.classList.remove('is-open');
}
navToggle.addEventListener('click', () => {
  const open = navToggle.getAttribute('aria-expanded') !== 'true';
  navToggle.setAttribute('aria-expanded', String(open));
  navToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  navigation.classList.toggle('is-open', open);
});
navigation.addEventListener('click', event => {
  if (event.target.closest('a')) closeNavigation();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && navToggle.getAttribute('aria-expanded') === 'true') {
    closeNavigation();
    navToggle.focus();
  }
});

// One small entrance per panel. Content stays visible without JavaScript.
if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('reveal-enter');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.feature-card, .architecture-box, .download-card').forEach(panel => observer.observe(panel));
}
