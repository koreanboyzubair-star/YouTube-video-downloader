const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const MAX_DOWNLOAD_SECONDS = 15 * 60;
const MAX_FILE_SIZE = '750M';
const YTDLP = process.env.YTDLP_PATH || 'yt-dlp';

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*')
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Origin not allowed'));
  }
}));
app.use(express.json({ limit: '32kb' }));
app.use(morgan('tiny'));

const limiter = new RateLimiterMemory({ points: 8, duration: 60 });

const SUPPORTED_HOSTS = [
  'youtube.com', 'youtu.be', 'youtube-nocookie.com',
  'tiktok.com', 'instagram.com'
];

function isSupportedUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { return false; }
  if (!['http:', 'https:'].includes(url.protocol)) return false;
  const host = url.hostname.toLowerCase();
  return SUPPORTED_HOSTS.some(domain => host === domain || host.endsWith(`.${domain}`));
}

function formatArgs(format, quality) {
  const q = quality === 'best' ? null : Number(quality);
  const height = q && [360, 480, 720, 1080].includes(q) ? q : null;

  if (format === 'mp3') {
    return ['-x', '--audio-format', 'mp3', '--audio-quality', '0'];
  }

  if (format === 'webm') {
    const video = height ? `bv*[ext=webm][height<=${height}]` : 'bv*[ext=webm]';
    return ['-f', `${video}+ba[ext=webm]/b[ext=webm]`, '--merge-output-format', 'webm'];
  }

  const video = height ? `bv*[ext=mp4][height<=${height}]` : 'bv*[ext=mp4]';
  const fallback = height ? `b[ext=mp4][height<=${height}]` : 'b[ext=mp4]';
  return ['-f', `${video}+ba[ext=m4a]/${fallback}/b`, '--merge-output-format', 'mp4'];
}

function safeRemoveDir(dir) {
  return fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
}

function runYtdlp(url, format, quality, outputDir) {
  return new Promise((resolve, reject) => {
    const outputTemplate = path.join(outputDir, '%(title).180B [%(id)s].%(ext)s');
    const args = [
      '--no-playlist',
      '--no-warnings',
      '--restrict-filenames',
      '--max-filesize', MAX_FILE_SIZE,
      '--match-filter', 'duration <= 3600',
      '--socket-timeout', '30',
      '--retries', '2',
      '--fragment-retries', '2',
      '--js-runtimes', 'node',
      '--remote-components', 'ejs:github',
      '--output', outputTemplate,
      '--print', 'after_move:filepath',
      ...formatArgs(format, quality),
      url
    ];

    const child = spawn(YTDLP, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let finished = false;

    const timer = setTimeout(() => {
      if (!finished) child.kill('SIGKILL');
    }, MAX_DOWNLOAD_SECONDS * 1000);

    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });

    child.on('error', err => {
      clearTimeout(timer);
      finished = true;
      if (err.code === 'ENOENT') reject(new Error('yt-dlp is not installed on the server.'));
      else reject(err);
    });

    child.on('close', code => {
      clearTimeout(timer);
      finished = true;
      if (code !== 0) {
        const clean = stderr.split('\n').filter(Boolean).slice(-5).join(' ').replace(/\s+/g, ' ');
        reject(new Error(clean || 'Download failed. The video may be unavailable or restricted.'));
        return;
      }

      const printed = stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean).pop();
      if (!printed || !fs.existsSync(printed)) {
        reject(new Error('Download completed but the output file could not be found.'));
        return;
      }
      resolve(printed);
    });
  });
}

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, service: 'BichuxVideo Downloader API' });
});

app.post('/api/download', async (req, res) => {
  try {
    await limiter.consume(req.ip || 'unknown');
  } catch {
    return res.status(429).json({ error: 'Too many downloads. Please wait a minute and try again.' });
  }

  const { url, format = 'mp4', quality = '720' } = req.body || {};
  if (typeof url !== 'string' || !isSupportedUrl(url.trim())) {
    return res.status(400).json({ error: 'Enter a public YouTube, TikTok, or Instagram video URL.' });
  }
  if (!['mp4', 'mp3', 'webm'].includes(format)) {
    return res.status(400).json({ error: 'Unsupported format.' });
  }
  if (!['360', '480', '720', '1080', 'best'].includes(String(quality))) {
    return res.status(400).json({ error: 'Unsupported quality.' });
  }

  const jobDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'bichux-'));
  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] download ${url}`);

  try {
    const filePath = await runYtdlp(url.trim(), format, String(quality), jobDir);
    const stat = await fsp.stat(filePath);
    if (!stat.isFile() || stat.size > 800 * 1024 * 1024) throw new Error('Output file is too large.');

    const filename = path.basename(filePath);
    res.download(filePath, filename, { dotfiles: 'deny' }, async err => {
      await safeRemoveDir(jobDir);
      if (err && !res.headersSent) res.status(500).json({ error: 'Could not send the downloaded file.' });
    });
  } catch (err) {
    await safeRemoveDir(jobDir);
    console.error(`[${requestId}] ${err.message}`);
    res.status(500).json({ error: err.message || 'Download failed.' });
  }
});

// Serve the frontend when this project is deployed as one service.
app.use(express.static(path.join(__dirname)));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error.' });
});

app.listen(PORT, () => console.log(`BichuxVideo Downloader running on port ${PORT}`));
