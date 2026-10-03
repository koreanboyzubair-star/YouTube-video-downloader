const API_BASE = window.BICHUX_API_URL || '';

const form = document.getElementById('downloadForm');
const urlInput = document.getElementById('urlInput');
const statusBox = document.getElementById('status');
const clearBtn = document.getElementById('clearBtn');
const menuBtn = document.getElementById('menuBtn');
const mobileMenu = document.getElementById('mobileMenu');
const button = form.querySelector('.download-btn');

 document.getElementById('year').textContent = new Date().getFullYear();

urlInput.addEventListener('input', () => {
  clearBtn.style.display = urlInput.value ? 'block' : 'none';
  statusBox.classList.remove('show');
  statusBox.textContent = '';
});

clearBtn.addEventListener('click', () => {
  urlInput.value = '';
  clearBtn.style.display = 'none';
  urlInput.focus();
});

function validSupportedUrl(value) {
  try {
    const u = new URL(value);
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    const host = u.hostname.toLowerCase();
    return ['youtube.com', 'youtu.be', 'youtube-nocookie.com', 'tiktok.com', 'instagram.com']
      .some(domain => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function showStatus(message, type = 'info') {
  statusBox.textContent = message;
  statusBox.dataset.type = type;
  statusBox.classList.add('show');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const url = urlInput.value.trim();
  const format = document.getElementById('formatSelect').value;
  const quality = document.getElementById('qualitySelect').value;

  if (!validSupportedUrl(url)) {
    showStatus('Please enter a public YouTube, TikTok, or Instagram video URL.', 'error');
    return;
  }

  button.disabled = true;
  button.innerHTML = '<span class="download-icon">◌</span> Processing...';
  showStatus(`Preparing ${format.toUpperCase()} • ${quality === 'best' ? 'Best quality' : quality + 'p'}…`);

  try {
    const response = await fetch(`${API_BASE}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, format, quality })
    });

    if (!response.ok) {
      let message = 'Download failed. Please try another public video.';
      try {
        const data = await response.json();
        if (data.error) message = data.error;
      } catch {}
      throw new Error(message);
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
    const filename = decodeURIComponent(match?.[1] || match?.[2] || `bichuxvideo.${format}`);

    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);

    showStatus('Download ready — your file has been saved.', 'success');
  } catch (error) {
    showStatus(error.message || 'Could not connect to the downloader backend.', 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = '<span class="download-icon">↓</span> Download';
  }
});

menuBtn.addEventListener('click', () => {
  const open = mobileMenu.classList.toggle('open');
  menuBtn.setAttribute('aria-expanded', open);
  menuBtn.textContent = open ? '×' : '☰';
});

mobileMenu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
  mobileMenu.classList.remove('open');
  menuBtn.setAttribute('aria-expanded', 'false');
  menuBtn.textContent = '☰';
}));

document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', (e) => {
  const target = document.querySelector(link.getAttribute('href'));
  if (target) {
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}));
