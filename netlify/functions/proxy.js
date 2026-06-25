exports.handler = async (event) => {
  const path = event.path.replace(/^\/?/, "");
  
  // Root path - show a simple landing page
  if (!path || path === "" || path === "/") {
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NetHost</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0a0a0f;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #e0e0e0;
    }
    .container {
      text-align: center;
      padding: 2rem;
    }
    h1 {
      font-size: 3rem;
      background: linear-gradient(135deg, #667eea, #764ba2);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 1rem;
    }
    p {
      font-size: 1.1rem;
      color: #888;
    }
    code {
      background: #1a1a2e;
      padding: 0.2rem 0.6rem;
      border-radius: 4px;
      color: #667eea;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>NetHost</h1>
    <p>File proxy is active. Use <code>/{filename}</code> to access files.</p>
  </div>
</body>
</html>`,
    };
  }

  const catboxUrl = `https://files.catbox.moe/${path}`;

  try {
    const response = await fetch(catboxUrl);

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: { "Content-Type": "text/plain" },
        body: `Error: ${response.status} ${response.statusText}`,
      };
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const buffer = Buffer.from(await response.arrayBuffer());

    return {
      statusCode: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
      },
      body: buffer.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: { "Content-Type": "text/plain" },
      body: `Proxy error: ${error.message}`,
    };
  }
};
