require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { countryCodeEmoji } = require("country-code-emoji");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, "public");
const BANDWIDTH_SIZE = 2 * 1024 * 1024;
const DOWNLOAD_BUFFER = Buffer.alloc(BANDWIDTH_SIZE, 0);

let serverLocation = {
  ready: false,
  city: null,
  region: null,
  country: null,
  countryCode: null,
  flag: null,
};

async function detectServerLocation() {
  try {
    const response = await fetch("https://ipwho.is/");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (!data.success) throw new Error(data.message || "Location lookup failed");

    const countryCode = data.country_code || null;

    serverLocation = {
      ready: true,
      city: data.city || null,
      region: data.region || null,
      country: data.country || null,
      countryCode,
      flag: countryCode ? countryCodeEmoji(countryCode) : null,
    };

    console.log(
      `Server location detected: ${serverLocation.city || "Unknown"}, ${serverLocation.country || "Unknown"} ${serverLocation.flag || ""}`
    );
  } catch (error) {
    console.error("Server location detection failed:", error.message);
  }
}

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
  const size = Math.min(
    Math.max(Number(requestedSize) || BANDWIDTH_SIZE, 1 * 1024 * 1024),
    BANDWIDTH_SIZE
  );

  res.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Length": size,
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
  });

  res.end(size === BANDWIDTH_SIZE ? DOWNLOAD_BUFFER : DOWNLOAD_BUFFER.subarray(0, size));
}

function upload(req, res) {
  req.resume();
  req.on("end", () => send(res, 204, ""));
  req.on("error", () => res.destroy());
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/api/ping") return latency(res);
  if (req.method === "GET" && url.pathname === "/api/download") return download(res, url.searchParams.get("size"));
  if (req.method === "POST" && url.pathname === "/api/upload") return upload(req, res);

  if (req.method === "GET" && url.pathname === "/api/server-info") {
    return send(res, 200, JSON.stringify({ location: serverLocation }));
  }

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

detectServerLocation();

server.listen(PORT, () => {
  console.log(`ServerPulse running on port ${PORT}`);
});
