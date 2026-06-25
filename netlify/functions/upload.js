const CATBOX_API = "https://catbox.moe/user/api.php";

/**
 * Manually build multipart/form-data body — avoids Node.js
 * FormData/Blob compatibility issues in serverless environments.
 */
function buildMultipart(fields) {
  const boundary =
    "----ASCloudBoundary" + Math.random().toString(36).slice(2);
  const chunks = [];

  for (const field of fields) {
    if (field.file) {
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${field.name}"; filename="${field.filename}"\r\nContent-Type: ${field.contentType}\r\n\r\n`
        )
      );
      chunks.push(field.file); // Buffer
      chunks.push(Buffer.from("\r\n"));
    } else {
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${field.name}"\r\n\r\n${field.value}\r\n`
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
 * Extract the catbox filename from API response.
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
    let filename = null;

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
        { name: "url", value: url },
      ]);

      const r = await fetch(CATBOX_API, {
        method: "POST",
        headers: { "Content-Type": mp.contentType },
        body: mp.body,
      });
      const resp = (await r.text()).trim();
      filename = extractFilename(resp);
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
        {
          name: "fileToUpload",
          file: buf,
          filename: uploadName,
          contentType: ct || "application/octet-stream",
        },
      ]);

      const r = await fetch(CATBOX_API, {
        method: "POST",
        headers: { "Content-Type": mp.contentType },
        body: mp.body,
      });
      const resp = (await r.text()).trim();
      filename = extractFilename(resp);
    }

    if (!filename) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: "Upload service temporarily unavailable. Please try again.",
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
        error: "Upload failed — please try again",
        details: err.message,
      }),
    };
  }
};
