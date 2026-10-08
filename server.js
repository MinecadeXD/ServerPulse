require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const Database = require("better-sqlite3");
const { countryCodeEmoji } = require("country-code-emoji");

const rawPort = process.env.PORT;

if (!rawPort || !/^\d+$/.test(rawPort)) {
  console.error("ServerPulse requires a valid PORT environment variable.");
  process.exit(1);
}

const PORT = Number(rawPort);

if (PORT < 1 || PORT > 65535) {
  console.error("ServerPulse requires PORT to be between 1 and 65535.");
  process.exit(1);
}
const PUBLIC = path.join(__dirname, "public");
const DATA = path.join(__dirname, "data");
const DATABASE_FILE = path.join(DATA, "serverpulse.db");
const BANDWIDTH_SIZE = 2 * 1024 * 1024;
const DOWNLOAD_BUFFER = Buffer.alloc(BANDWIDTH_SIZE, 0);

const TEST_COOLDOWN_MS = 20 * 1000;
const USERNAME_COOLDOWN_MS = 60 * 60 * 1000;
const MAX_RESULTS = 100;

fs.mkdirSync(DATA, { recursive: true });

const db = new Database(DATABASE_FILE);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    client_id TEXT PRIMARY KEY,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    username_changed_at INTEGER,
    latency_ms REAL,
    latency_tested_at INTEGER,
    download_mbps REAL,
    upload_mbps REAL,
    bandwidth_mbps REAL,
    bandwidth_tested_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users(updated_at);
`);

const statements = {
  findUser: db.prepare("SELECT * FROM users WHERE client_id = ?"),
  findUsername: db.prepare("SELECT client_id FROM users WHERE username = ? COLLATE NOCASE"),
  insertUser: db.prepare(
    "INSERT INTO users (client_id, username, created_at, updated_at) VALUES (?, ?, ?, ?)"
  ),
  updateUsername: db.prepare(
    "UPDATE users SET username = ?, username_changed_at = ?, updated_at = ? WHERE client_id = ?"
  ),
  updateLatency: db.prepare(
    "UPDATE users SET latency_ms = ?, latency_tested_at = ?, updated_at = ? WHERE client_id = ?"
  ),
  updateBandwidth: db.prepare(
    "UPDATE users SET download_mbps = ?, upload_mbps = ?, bandwidth_mbps = ?, bandwidth_tested_at = ?, updated_at = ? WHERE client_id = ?"
  ),
  listUsers: db.prepare(
    "SELECT username, latency_ms, latency_tested_at, download_mbps, upload_mbps, bandwidth_mbps, bandwidth_tested_at, updated_at FROM users ORDER BY updated_at DESC LIMIT ?"
  ),
};

const createUser = db.transaction((clientId, username, now) => {
  statements.insertUser.run(clientId, username, now, now);
});

let serverLocation = {
  ready: false,
  city: null,
  region: null,
  country: null,
  countryCode: null,
  flag: null,
};

function normalizeUsername(value) {
  return String(value || "").trim();
}

function isValidClientId(value) {
  return typeof value === "string" && /^[0-9a-f]{32,64}$/i.test(value);
}

function isValidUsername(value) {
  return /^[A-Za-z0-9][A-Za-z0-9 _-]{1,19}$/.test(value);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");

    req.on("data", chunk => {
      body += chunk;
      if (body.length > 16 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });

    req.on("error", reject);
  });
}

function send(res, status, body, type = "application/json") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma": "no-cache",
  });
  res.end(body);
}

function json(res, status, body) {
  send(res, status, JSON.stringify(body));
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

function getUser(clientId) {
  return statements.findUser.get(clientId);
}

function retryAfterSeconds(timestamp, now) {
  return Math.max(1, Math.ceil((timestamp + TEST_COOLDOWN_MS - now) / 1000));
}

function latencyScore(value) {
  return Math.max(0, Math.min(100, 100 - value / 2));
}

function bandwidthScore(value) {
  return Math.max(0, Math.min(100, value));
}

function buildResults() {
  const rows = statements.listUsers.all(MAX_RESULTS).map(row => {
    const hasLatency = Number.isFinite(row.latency_ms);
    const hasBandwidth = Number.isFinite(row.bandwidth_mbps);
    const scores = [];

    if (hasLatency) scores.push(latencyScore(row.latency_ms));
    if (hasBandwidth) scores.push(bandwidthScore(row.bandwidth_mbps));

    const score = scores.length
      ? scores.reduce((sum, value) => sum + value, 0) / scores.length
      : null;

    return {
      username: row.username,
      latencyMs: hasLatency ? Math.round(row.latency_ms) : null,
      downloadMbps: Number.isFinite(row.download_mbps) ? Number(row.download_mbps.toFixed(1)) : null,
      uploadMbps: Number.isFinite(row.upload_mbps) ? Number(row.upload_mbps.toFixed(1)) : null,
      bandwidthMbps: hasBandwidth ? Number(row.bandwidth_mbps.toFixed(1)) : null,
      latencyTestedAt: row.latency_tested_at,
      bandwidthTestedAt: row.bandwidth_tested_at,
      score: score === null ? null : Number(score.toFixed(1)),
      testedMetrics: scores.length,
      updatedAt: row.updated_at,
    };
  });

  rows.sort((a, b) => {
    if (a.score !== null && b.score === null) return -1;
    if (a.score === null && b.score !== null) return 1;
    if (a.score !== null && b.score !== null && b.score !== a.score) return b.score - a.score;
    if (b.testedMetrics !== a.testedMetrics) return b.testedMetrics - a.testedMetrics;

    const aLatency = a.latencyMs ?? Number.POSITIVE_INFINITY;
    const bLatency = b.latencyMs ?? Number.POSITIVE_INFINITY;
    if (aLatency !== bLatency) return aLatency - bLatency;

    const aBandwidth = a.bandwidthMbps ?? -1;
    const bBandwidth = b.bandwidthMbps ?? -1;
    if (aBandwidth !== bBandwidth) return bBandwidth - aBandwidth;

    return a.username.localeCompare(b.username);
  });

  return rows.map((row, index) => ({ rank: index + 1, ...row }));
}

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

async function handleResults(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/results") {
    return json(res, 200, { results: buildResults() });
  }

  if (req.method !== "POST") return false;

  if (!["/api/results/register", "/api/results/latency", "/api/results/bandwidth"].includes(url.pathname)) {
    return false;
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (error) {
    return json(res, 400, { error: error.message });
  }

  const clientId = body.clientId;
  if (!isValidClientId(clientId)) {
    return json(res, 400, { error: "Invalid client ID." });
  }

  const now = Date.now();
  let user = getUser(clientId);

  if (url.pathname === "/api/results/register") {
    const username = normalizeUsername(body.username);

    if (!isValidUsername(username)) {
      return json(res, 400, {
        error: "Username must be 2–20 characters and use letters, numbers, spaces, hyphens, or underscores.",
      });
    }

    if (!user) {
      const existing = statements.findUsername.get(username);
      if (existing) return json(res, 409, { error: "That username is already taken." });

      try {
        createUser(clientId, username, now);
      } catch (error) {
        if (String(error.message).includes("UNIQUE")) {
          return json(res, 409, { error: "That username is already taken." });
        }
        throw error;
      }

      return json(res, 201, { success: true, username });
    }

    if (user.username === username) {
      return json(res, 200, { success: true, username: user.username });
    }

    if (
      user.username_changed_at &&
      now - user.username_changed_at < USERNAME_COOLDOWN_MS
    ) {
      const remaining = Math.ceil(
        (user.username_changed_at + USERNAME_COOLDOWN_MS - now) / 1000
      );
      return json(res, 429, {
        error: "Username can only be changed once per hour.",
        retryAfter: remaining,
      });
    }

    const existing = statements.findUsername.get(username);
    if (existing && existing.client_id !== clientId) {
      return json(res, 409, { error: "That username is already taken." });
    }

    try {
      statements.updateUsername.run(username, now, now, clientId);
    } catch (error) {
      if (String(error.message).includes("UNIQUE")) {
        return json(res, 409, { error: "That username is already taken." });
      }
      throw error;
    }

    return json(res, 200, { success: true, username });
  }

  if (!user) {
    return json(res, 404, { error: "Participant not registered." });
  }

  if (url.pathname === "/api/results/latency") {
    const latencyMs = Number(body.latencyMs);

    if (!Number.isFinite(latencyMs) || latencyMs <= 0 || latencyMs > 5000) {
      return json(res, 400, { error: "Invalid latency result." });
    }

    if (
      user.latency_tested_at &&
      now - user.latency_tested_at < TEST_COOLDOWN_MS
    ) {
      return json(res, 429, {
        error: "Latency test is on cooldown.",
        retryAfter: retryAfterSeconds(user.latency_tested_at, now),
      });
    }

    statements.updateLatency.run(latencyMs, now, now, clientId);
    return json(res, 200, { success: true });
  }

  const downloadMbps = Number(body.downloadMbps);
  const uploadMbps = Number(body.uploadMbps);

  if (
    !Number.isFinite(downloadMbps) ||
    !Number.isFinite(uploadMbps) ||
    downloadMbps <= 0 ||
    uploadMbps <= 0 ||
    downloadMbps > 100000 ||
    uploadMbps > 100000
  ) {
    return json(res, 400, { error: "Invalid bandwidth result." });
  }

  if (
    user.bandwidth_tested_at &&
    now - user.bandwidth_tested_at < TEST_COOLDOWN_MS
  ) {
    return json(res, 429, {
      error: "Bandwidth test is on cooldown.",
      retryAfter: retryAfterSeconds(user.bandwidth_tested_at, now),
    });
  }

  const bandwidthMbps = (downloadMbps + uploadMbps) / 2;
  statements.updateBandwidth.run(
    downloadMbps,
    uploadMbps,
    bandwidthMbps,
    now,
    now,
    clientId
  );

  return json(res, 200, { success: true });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/api/ping") return latency(res);
  if (req.method === "GET" && url.pathname === "/api/download") return download(res, url.searchParams.get("size"));
  if (req.method === "POST" && url.pathname === "/api/upload") return upload(req, res);

  if (url.pathname.startsWith("/api/results")) {
    try {
      const handled = await handleResults(req, res, url);
      if (handled !== false) return;
    } catch (error) {
      console.error("Results API error:", error);
      return json(res, 500, { error: "Results service unavailable." });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/server-info") {
    return json(res, 200, { location: serverLocation });
  }

  if (req.method === "GET") {
    const requested = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.normalize(path.join(PUBLIC, requested));

    if (!filePath.startsWith(PUBLIC + path.sep) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return json(res, 404, { error: "Not found" });
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

  json(res, 405, { error: "Method not allowed" });
});

detectServerLocation();

process.on("exit", () => db.close());

server.listen(PORT, () => {
  console.log(`ServerPulse running on port ${PORT}`);
});
