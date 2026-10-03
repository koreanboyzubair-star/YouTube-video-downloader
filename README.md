# BichuxVideo Downloader

Premium anime-style video downloader with a real Node.js + yt-dlp backend.

## What is included

- Responsive anime/neon frontend
- YouTube, TikTok and Instagram public URL validation
- MP4, MP3 and WebM downloads
- 360p / 480p / 720p / 1080p / Best quality
- Temporary per-download folders with automatic cleanup
- Rate limiting
- Helmet security headers
- CORS support for separate GitHub Pages frontend
- Docker deployment configuration
- `/api/health` health endpoint

## Run locally

Requirements:

- Node.js 22+
- Python 3 + pip
- ffmpeg
- yt-dlp with its default dependencies

The current yt-dlp setup uses Node as its JavaScript runtime and yt-dlp's EJS components for modern YouTube extraction.

### 1. Install dependencies

```bash
npm install
python3 -m pip install -U "yt-dlp[default]"
```

Make sure `ffmpeg` and `yt-dlp` are available in PATH.

### 2. Start

```bash
npm start
```

Open:

```text
http://localhost:3000
```

## Docker

The included Dockerfile installs Node 22, ffmpeg and the current yt-dlp default package automatically.

```bash
docker build -t bichuxvideo .
docker run --rm -p 3000:3000 -e ALLOWED_ORIGINS=http://localhost:3000 bichuxvideo
```

## GitHub Pages + separate backend

GitHub Pages can host the static frontend, but it cannot execute Node.js or yt-dlp. Deploy this project (or just the backend) to a server such as Render, Railway, Fly.io, VPS, etc.

If the frontend is hosted on GitHub Pages, edit the first line of `script.js`:

```js
const API_BASE = 'https://YOUR-BACKEND-DOMAIN';
```

Then set the backend environment variable to your GitHub Pages origin:

```text
ALLOWED_ORIGINS=https://YOUR-USERNAME.github.io
```

For a single-service deployment, leave `API_BASE` empty and deploy the whole project. The Express server serves the frontend and API from the same origin.

## Render

A `render.yaml` file is included. Render can build the project using the included Dockerfile.

After deployment, your API will be available at:

```text
https://YOUR-SERVICE.onrender.com/api/health
```

## Notes

- Downloads are limited to public URLs from YouTube, TikTok and Instagram by the server-side allowlist.
- The backend does not accept arbitrary local/network URLs, which helps reduce SSRF risk.
- A download is limited to 1 hour of media and 750 MB by default.
- Eight download requests per IP per minute are allowed by default.
- Some YouTube content may require additional access mechanisms or may be unavailable to yt-dlp; this is an extractor/platform limitation, not a frontend bug.
- Use the downloader only for media you have permission to download and in accordance with the applicable platform terms.
