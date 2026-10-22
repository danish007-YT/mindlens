# Deploying MindLens

MindLens is a static, client-side app (no backend, no build step), so any static host
works. Two free options, easiest first.

## Option A — GitHub Pages (recommended for a college submission)

1. Create a new GitHub repo and push this folder's contents to it:
   ```bash
   cd mindlens_v2
   git init
   git add .
   git commit -m "MindLens v2"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
2. On GitHub: **Settings → Pages → Source → Deploy from branch → main → / (root)**.
3. Your site goes live at `https://<your-username>.github.io/<repo-name>/`
   within a minute or two.
4. Because the app registers a service worker, revisit the URL once after any
   future update and hard-refresh (Ctrl/Cmd+Shift+R) so the new files get cached.

## Option B — Netlify (drag-and-drop, no git required)

1. Go to [app.netlify.com/drop](https://app.netlify.com/drop).
2. Drag the `mindlens_v2` folder onto the page.
3. Netlify gives you a live `https://<random-name>.netlify.app` URL immediately;
   you can rename it in **Site settings → Change site name**.

## Notes for both options

- **HTTPS is required** for the microphone/camera and for the service worker to
  work — both hosts above provide it automatically.
- The first load needs internet access to pull TensorFlow.js, the Universal
  Sentence Encoder, and face-api.js from CDN (see `index.html`).
- Nothing is uploaded to your host or any server — text/audio/video processing
  still happens entirely in the visitor's browser, per the existing design.
- If you rename the repo/folder or move `index.html`, double check the relative
  paths in `manifest.json` (`start_url`, `scope`) still resolve correctly.
