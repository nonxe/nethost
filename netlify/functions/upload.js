const CATBOX_OFFICIAL = "https://catbox.moe/user/api.php";
const CATBOX_WRAPPER = "https://apis.davidcyril.name.ng/uploader/catbox";

/**
 * Try to extract a catbox URL from the API response text.
 * Returns the clean filename or throws on failure.
 */
function extractFilename(responseText) {
  // 1. Try regex match for a catbox URL anywhere in the response
  const match = responseText.match(
    /https?:\/\/files\.catbox\.moe\/([A-Za-z0-9_\-]+\.[A-Za-z0-9]+)/
  );
  if (match) return match[1];

  // 2. If the entire response is a clean URL
  const trimmed = responseText.trim();
  if (
    trimmed.startsWith("http") &&
    !trimmed.includes("<") &&
    trimmed.includes("/")
  ) {
    return trimmed.split("/").pop();
  }

  return null;
}

/**
 * Upload to catbox using the official API.
 */
async function uploadOfficial(formData) {
  const r = await fetch(CATBOX_OFFICIAL, { method: "POST", body: formData });
  return (await r.text()).trim();
}

/**
 * Upload to catbox using the wrapper API (fallback).
 */
async function uploadWrapper(formData) {
  const r = await fetch(CATBOX_WRAPPER, { method: "POST", body: formData });
  return (await r.text()).trim();
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

      // Try official API
      const fd1 = new FormData();
      fd1.append("reqtype", "urlupload");
      fd1.append("url", url);
      let resp = await uploadOfficial(fd1);
      filename = extractFilename(resp);

      // Fallback to wrapper
      if (!filename) {
        const fd2 = new FormData();
        fd2.append("url", url);
        resp = await uploadWrapper(fd2);
        filename = extractFilename(resp);
      }
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
      const blob = new Blob([buf], { type: ct || "application/octet-stream" });

      // Try official API (field: fileToUpload)
      const fd1 = new FormData();
      fd1.append("reqtype", "fileupload");
      fd1.append("fileToUpload", blob, uploadName);
      let resp = await uploadOfficial(fd1);
      filename = extractFilename(resp);

      // Fallback to wrapper (field: file)
      if (!filename) {
        const fd2 = new FormData();
        fd2.append("file", blob, uploadName);
        resp = await uploadWrapper(fd2);
        filename = extractFilename(resp);
      }
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
