# AS Cloud

Swiss-Engineered Cloud Hosting — upload, host, and share files with permanent direct links.

## Features

- **File Upload** — Drag & drop or browse any file type
- **URL Upload** — Host files from any URL
- **Direct Links** — Clean URLs, no interstitials, no ads
- **Upload History** — Recent uploads saved in browser
- **Swiss Branding** — Privacy-first, professional design

## How It Works

| Your URL | What Happens |
|---|---|
| `ascloud.netlify.app/wwl3zb.mp4` | File is served directly on your domain |
| `ascloud.netlify.app/abc123.png` | Image loads on your domain |

Files are uploaded and served transparently. No third-party domains are ever exposed to the end user.

## Deploy

1. Push this repo to GitHub
2. Connect to [Netlify](https://app.netlify.com) → Import from Git
3. Deploy — zero configuration needed

## Architecture

```
nethost/
├── netlify.toml                  ← Routing & edge proxy config
├── public/
│   └── index.html                ← Upload UI (single-page app)
├── netlify/
│   └── functions/
│       └── upload.js             ← Serverless upload handler
├── package.json
└── README.md
```

- **Upload**: Handled by a Netlify Function at `/api/upload`
- **File Serving**: Handled by Netlify edge proxy (no function needed, supports large files)
- **Frontend**: Single HTML file with embedded CSS/JS, zero dependencies
