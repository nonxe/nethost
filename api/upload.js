const https = require("https");

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
 * Upload to Fileditch using Node.js https module.
 */
function fileditchRequest(multipartBody, contentType) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "new.fileditch.com",
        path: "/upload.php",
        method: "POST",
        headers: {
          "Content-Type": contentType,
          "Content-Length": multipartBody.length,
          "User-Agent": "ASCloud/2.0",
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
 * Extract path from Fileditch response.
 */
function extractPath(text) {
  try {
    const data = JSON.parse(text);
    if (data && data.success && data.url) {
      return data.url.replace("https://fileditchfiles.me/", "");
    }
  } catch (e) {
    const m = text.match(/https?:\/\/fileditchfiles\.me\/([^\s"']+)/);
    if (m) return m[1];
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

  try {
    const ct = req.headers["content-type"] || req.headers["Content-Type"] || "";
    let rawResponse;

    if (ct.includes("application/json")) {
      const payload = req.body || {};

      if (payload.url) {
        /* ── URL Upload ── */
        const resUrl = await fetch(payload.url);
        if (!resUrl.ok) {
          throw new Error(`Failed to fetch remote URL: status ${resUrl.status}`);
        }
        const arrayBuf = await resUrl.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        let uploadName = payload.url.split("/").pop().split("?")[0] || "file.bin";
        const resCt = resUrl.headers.get("content-type") || "application/octet-stream";

        const mp = buildMultipart([
          {
            name: "file",
            file: buf,
            filename: uploadName,
            contentType: resCt,
          },
        ]);
        rawResponse = await fileditchRequest(mp.body, mp.contentType);
      } else if (payload.fileData) {
        /* ── Base64 File Upload ── */
        const uploadName = payload.filename || "upload.bin";
        const buf = Buffer.from(payload.fileData, "base64");
        const mp = buildMultipart([
          {
            name: "file",
            file: buf,
            filename: uploadName,
            contentType: payload.contentType || "application/octet-stream",
          },
        ]);
        rawResponse = await fileditchRequest(mp.body, mp.contentType);
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
        {
          name: "file",
          file: buf,
          filename: uploadName,
          contentType: ct || "application/octet-stream",
        },
      ]);
      rawResponse = await fileditchRequest(mp.body, mp.contentType);
    }

    const path = extractPath(rawResponse);

    if (!path) {
      return res.status(502).json({
        error: "Upload failed — server returned unexpected response",
        response: rawResponse.substring(0, 500),
      });
    }

    const cleanUrl = `${proto}://${host}/${path}`;
    return res.status(200).json({
      success: true,
      url: cleanUrl,
      filename: path.split("/").pop(),
    });
  } catch (err) {
    return res.status(500).json({
      error: "Upload failed — " + err.message,
    });
  }
};
