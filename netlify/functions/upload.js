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
 * Upload to catbox using Node.js https module (most reliable).
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
 * Extract filename from catbox response.
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
  return null;
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Filename",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const host = event.headers["host"] || event.headers["Host"];
  const proto = event.headers["x-forwarded-proto"] || "https";

  try {
    const ct =
      event.headers["content-type"] || event.headers["Content-Type"] || "";
    let rawResponse;

    if (ct.includes("application/json")) {
      /* ── URL Upload ── */
      const { url } = JSON.parse(event.body);
      if (!url) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "No URL provided" }),
        };
      }
      const mp = buildMultipart([
        { name: "reqtype", value: "urlupload" },
        { name: "userhash", value: "" },
        { name: "url", value: url },
      ]);
      rawResponse = await catboxRequest(mp.body, mp.contentType);
    } else {
      /* ── File Upload ── */
      const uploadName = decodeURIComponent(
        event.headers["x-filename"] ||
          event.headers["X-Filename"] ||
          "upload.bin"
      );
      const buf = Buffer.from(
        event.body,
        event.isBase64Encoded ? "base64" : "binary"
      );
      const mp = buildMultipart([
        { name: "reqtype", value: "fileupload" },
        { name: "userhash", value: "" },
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
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: "Upload failed — server returned unexpected response",
          response: rawResponse.substring(0, 500),
        }),
      };
    }

    const cleanUrl = `${proto}://${host}/${filename}`;
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        url: cleanUrl,
        filename: filename,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Upload failed — " + err.message,
      }),
    };
  }
};
