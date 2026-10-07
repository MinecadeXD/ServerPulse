const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");
const DOWNLOAD_SIZE = 10 * 1024 * 1024;
const CHUNK = Buffer.alloc(64 * 1024, 0);

function send(res, status, body, type = "application/json") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma": "no-cache",
  });
  res.end(body);
}

function latency(res) {
  res.writeHead(204, {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma": "no-cache",
  });
  res.end();
}

function download(res, requestedSize) {
  const size = Math.min(Math.max(Number(requestedSize) || DOWNLOAD_SIZE, 1 * 1024 * 1024), 25 * 1024 * 1024);

  res.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Length": size,
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "X-Content-Type-Options": "nosniff",
  });

  let sent = 0;
  function write() {
    while (sent < size) {
      const chunk = CHUNK.subarray(0, Math.min(CHUNK.length, size - sent));
      sent += chunk.length;
      if (!res.write(chunk)) {
        res.once("drain", write);
        return;
      }
    }
    res.end();
  }
  write();
}

function upload(req, res) {
  let bytes = 0;
  req.on("data", chunk => { bytes += chunk.length; });
  req.on("end", () => send(res, 204, ""));
  req.on("error", () => res.destroy());
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/api/ping") return latency(res);
  if (req.method === "GET" && url.pathname === "/api/download") return download(res, url.searchParams.get("size"));
  if (req.method === "POST" && url.pathname === "/api/upload") return upload(req, res);

  if (req.method === "GET") {
    const requested = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.normalize(path.join(PUBLIC, requested));

    if (!filePath.startsWith(PUBLIC + path.sep) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return send(res, 404, JSON.stringify({ error: "Not found" }));
    }

    const ext = path.extname(filePath);
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
    };

    res.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    return fs.createReadStream(filePath).pipe(res);
  }

  send(res, 405, JSON.stringify({ error: "Method not allowed" }));
});

server.listen(PORT, () => {
  console.log(`ServerPulse running on port ${PORT}`);
});
