const CATBOX_API = "https://apis.davidcyril.name.ng/uploader/catbox";

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
    let responseText;

    if (ct.includes("application/json")) {
      const { url } = JSON.parse(event.body);
      if (!url) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "No URL provided" }),
        };
      }
      const fd = new FormData();
      fd.append("url", url);
      const r = await fetch(CATBOX_API, { method: "POST", body: fd });
      responseText = (await r.text()).trim();
    } else {
      const filename = decodeURIComponent(
        event.headers["x-filename"] ||
          event.headers["X-Filename"] ||
          "upload"
      );
      const buf = Buffer.from(
        event.body,
        event.isBase64Encoded ? "base64" : "binary"
      );
      const blob = new Blob([buf], { type: ct || "application/octet-stream" });
      const fd = new FormData();
      fd.append("file", blob, filename);
      const r = await fetch(CATBOX_API, { method: "POST", body: fd });
      responseText = (await r.text()).trim();
    }

    if (
      !responseText ||
      (!responseText.includes("http") && !responseText.includes("."))
    ) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: "Upload service temporarily unavailable",
          details: responseText,
        }),
      };
    }

    const fname = responseText.split("/").pop();
    const cleanUrl = `${proto}://${host}/${fname}`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, url: cleanUrl, filename: fname }),
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
