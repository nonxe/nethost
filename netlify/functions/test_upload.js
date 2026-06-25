const https = require("https");

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

function requestHTTPS(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data.trim()));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

exports.handler = async () => {
  const testFile = Buffer.from("Hello World from ASCloud Netlify test");
  const results = {};

  // Test Pixeldrain
  try {
    const mp = buildMultipart([
      {
        name: "file",
        file: testFile,
        filename: "test.txt",
        contentType: "text/plain",
      },
    ]);
    results.pixeldrain = await requestHTTPS({
      hostname: "pixeldrain.com",
      path: "/api/file/",
      method: "POST",
      headers: {
        "Content-Type": mp.contentType,
        "Content-Length": mp.body.length,
        "User-Agent": "ASCloud/2.0",
      }
    }, mp.body);
  } catch (err) {
    results.pixeldrain_error = err.message;
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(results, null, 2)
  };
};
