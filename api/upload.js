const https = require("https");

const CATBOX_HOST = "catbox.moe";
const CATBOX_PATH = "/user/api.php";

/**
 * Build multipart/form-data as a raw Buffer.
 */
function buildMultipart(fields) {
  const boundary = "ASCloud" + Math.random().toString(36).slice(2) + Date.now();
  const chunks = [];

  for (const field of fields) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if (field.file) {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${field.name}"; filename="${field.filename}"\r\n` +
            `Content-Type: ${field.contentType}\r\n\r\n`
        )
      );
      chunks.push(field.file);
      chunks.push(Buffer.from("\r\n"));
    } else {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${field.name}"\r\n\r\n${field.value}\r\n`
        )
      );
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/**
 * Upload to Catbox.
 */
function catboxRequest(multipartBody, contentType) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: CATBOX_HOST,
        path: CATBOX_PATH,
        method: "POST",
        headers: {
          "Content-Type": contentType,
          "Content-Length": multipartBody.length,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data.trim()));
      }
    );
    req.on("error", reject);
    req.write(multipartBody);
    req.end();
  });
}

/**
 * Extract filename from Catbox response.
 */
function extractFilename(text) {
  const m = text.match(
    /https?:\/\/files\.catbox\.moe\/([A-Za-z0-9_\-]+\.[A-Za-z0-9]+)/
  );
  if (m) return m[1];
  const t = text.trim();
  if (t.startsWith("http") && !t.includes("<") && t.includes("/")) {
    return t.split("/").pop();
  }
  if (t.length > 0 && t.length < 50 && !t.includes("<") && !t.includes(" ") && t.includes(".")) {
    return t;
  }
  return null;
}

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Filename");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const host = req.headers["host"] || req.headers["Host"];
  const proto = req.headers["x-forwarded-proto"] || "https";

  // Sanitize userhash
  const userhash = (process.env.CATBOX_USERHASH && process.env.CATBOX_USERHASH.trim().length === 32)
    ? process.env.CATBOX_USERHASH.trim()
    : "";

  try {
    const ct = req.headers["content-type"] || req.headers["Content-Type"] || "";
    let rawResponse;

    if (ct.includes("application/json")) {
      const payload = req.body || {};

      if (payload.url) {
        /* ── URL Upload ── */
        const mp = buildMultipart([
          { name: "reqtype", value: "urlupload" },
          ...(userhash ? [{ name: "userhash", value: userhash }] : []),
          { name: "url", value: payload.url },
        ]);
        rawResponse = await catboxRequest(mp.body, mp.contentType);
      } else if (payload.fileData) {
        /* ── Base64 File Upload ── */
        const uploadName = payload.filename || "upload.bin";
        const buf = Buffer.from(payload.fileData, "base64");
        const mp = buildMultipart([
          { name: "reqtype", value: "fileupload" },
          ...(userhash ? [{ name: "userhash", value: userhash }] : []),
          {
            name: "fileToUpload",
            file: buf,
            filename: uploadName,
            contentType: payload.contentType || "application/octet-stream",
          },
        ]);
        rawResponse = await catboxRequest(mp.body, mp.contentType);
      } else {
        return res.status(400).json({ error: "Missing url or fileData" });
      }
    } else {
      /* ── Raw File Upload Fallback ── */
      let buf;
      if (Buffer.isBuffer(req.body)) {
        buf = req.body;
      } else if (typeof req.body === "string") {
        buf = Buffer.from(req.body, "binary");
      } else {
        buf = await new Promise((resolve) => {
          const chunks = [];
          req.on("data", (chunk) => chunks.push(chunk));
          req.on("end", () => resolve(Buffer.concat(chunks)));
        });
      }

      const uploadName = decodeURIComponent(
        req.headers["x-filename"] ||
          req.headers["X-Filename"] ||
          "upload.bin"
      );

      const mp = buildMultipart([
        { name: "reqtype", value: "fileupload" },
        ...(userhash ? [{ name: "userhash", value: userhash }] : []),
        {
          name: "fileToUpload",
          file: buf,
          filename: uploadName,
          contentType: ct || "application/octet-stream",
        },
      ]);
      rawResponse = await catboxRequest(mp.body, mp.contentType);
    }

    const filename = extractFilename(rawResponse);

    if (!filename) {
      return res.status(502).json({
        error: "Upload failed — server returned unexpected response",
        response: rawResponse.substring(0, 500),
      });
    }

    const cleanUrl = `${proto}://${host}/${filename}`;
    return res.status(200).json({
      success: true,
      url: cleanUrl,
      filename: filename,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Upload failed — " + err.message,
    });
  }
};
