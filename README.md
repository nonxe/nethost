# NetHost

A file proxy deployed on Netlify that serves files from `files.catbox.moe` through your own domain — no redirects.

## How It Works

| Your URL | Proxied From |
|---|---|
| `yourdomain.com/wwl3zb.mp4` | `files.catbox.moe/wwl3zb.mp4` |
| `yourdomain.com/abc123.png` | `files.catbox.moe/abc123.png` |

The file is fetched server-side and served directly. The user's browser never sees `catbox.moe` — everything stays on your domain.

## Deploy

1. Push this repo to GitHub
2. Connect the repo to [Netlify](https://app.netlify.com)
3. Deploy — no build settings needed, it works out of the box

## Tech

- **Netlify Functions** (serverless) for proxying
- **`netlify.toml`** redirects all paths to the proxy function
- Zero dependencies
