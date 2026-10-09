const $ = id => document.getElementById(id);

const latencyButton = $("latency-button");
const bandwidthButton = $("bandwidth-button");
const tabs = document.querySelectorAll(".tab");
const latencyPanel = $("latency-panel");
const bandwidthPanel = $("bandwidth-panel");
const resultsPanel = $("results-panel");

const USERNAME_KEY = "serverpulse_username";
const CLIENT_ID_KEY = "serverpulse_client_id";
const COOLDOWN_MS = 20 * 1000;

let clientId = localStorage.getItem(CLIENT_ID_KEY);
let currentUsername = localStorage.getItem(USERNAME_KEY) || "";
let latencyCooldownUntil = 0;
let bandwidthCooldownUntil = 0;
let cooldownTimer = null;
let resultsRefreshTimer = null;
let resultsLoading = false;
let activeTab = "latency";

const RESULTS_REFRESH_MS = 5000;

function createClientId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().replace(/-/g, "");
  }

  const bytes = new Uint8Array(32);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

if (!clientId || !/^[0-9a-f]{32,64}$/i.test(clientId)) {
  clientId = createClientId();
  localStorage.setItem(CLIENT_ID_KEY, clientId);
}

function showUsernameModal(edit = false) {
  const modal = $("username-modal");
  const input = $("username-input");
  $("username-title").textContent = edit ? "Edit your username" : "Choose your username";
  $("username-error").textContent = "";
  input.value = currentUsername;
  modal.classList.remove("hidden");
  setTimeout(() => input.focus(), 0);
}

function hideUsernameModal() {
  $("username-modal").classList.add("hidden");
}

async function registerUsername(username) {
  const response = await fetch("/api/results/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ clientId, username }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || "Unable to save username.");
    error.retryAfter = data.retryAfter;
    throw error;
  }

  currentUsername = data.username;
  localStorage.setItem(USERNAME_KEY, currentUsername);
  return data;
}

async function initializeUsername() {
  if (!currentUsername) {
    showUsernameModal(false);
    return;
  }

  try {
    await registerUsername(currentUsername);
  } catch (error) {
    if (error.message === "That username is already taken.") {
      showUsernameModal(false);
    }
  }
}

$("username-form").addEventListener("submit", async event => {
  event.preventDefault();

  const input = $("username-input");
  const username = input.value.trim();
  const errorElement = $("username-error");
  errorElement.textContent = "";

  try {
    await registerUsername(username);
    hideUsernameModal();
    await loadResults();
  } catch (error) {
    errorElement.textContent = error.retryAfter
      ? `${error.message} Try again in ${formatDuration(error.retryAfter)}.`
      : error.message;
  }
});

$("edit-username-button").addEventListener("click", () => showUsernameModal(true));

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes) return `${minutes}m ${remaining}s`;
  return `${remaining}s`;
}

function setCooldown(type, seconds) {
  const until = Date.now() + seconds * 1000;
  if (type === "latency") {
    latencyCooldownUntil = until;
  } else {
    bandwidthCooldownUntil = until;
  }

  updateCooldownButtons();

  clearInterval(cooldownTimer);
  cooldownTimer = setInterval(() => {
    updateCooldownButtons();

    if (Date.now() >= latencyCooldownUntil && Date.now() >= bandwidthCooldownUntil) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
  }, 250);
}

function updateCooldownButtons() {
  const latencyRemaining = Math.max(0, Math.ceil((latencyCooldownUntil - Date.now()) / 1000));
  const bandwidthRemaining = Math.max(0, Math.ceil((bandwidthCooldownUntil - Date.now()) / 1000));

  if (!latencyButton.dataset.testing) {
    latencyButton.disabled = latencyRemaining > 0;
    latencyButton.textContent = latencyRemaining ? `Available in ${latencyRemaining}s` : "Test again";
  }

  if (!bandwidthButton.dataset.testing) {
    bandwidthButton.disabled = bandwidthRemaining > 0;
    bandwidthButton.textContent = bandwidthRemaining ? `Available in ${bandwidthRemaining}s` : "Test again";
  }
}

async function submitResult(path, payload) {
  if (!currentUsername) {
    showUsernameModal(false);
    throw new Error("Choose a username before testing.");
  }

  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ clientId, ...payload }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || "Unable to save result.");
    error.retryAfter = data.retryAfter;
    throw error;
  }

  return data;
}

async function loadServerLocation() {
  try {
    const response = await fetch("/api/server-info", { cache: "no-store" });
    if (!response.ok) throw new Error("Server info unavailable");

    const data = await response.json();
    const location = data.location;

    if (!location?.ready) throw new Error("Location unavailable");

    const parts = [location.city, location.region, location.country].filter(Boolean);
    const locationValue = $("server-location-value");

    locationValue.innerHTML = "";

    if (location.flag) {
      const flag = document.createElement("span");
      flag.className = "country-flag";
      flag.setAttribute("aria-hidden", "true");
      flag.textContent = location.flag;
      locationValue.appendChild(flag);
    }

    const text = document.createElement("span");
    text.textContent = parts.length ? parts.join(", ") : "Location unavailable";
    locationValue.appendChild(text);
  } catch {
    $("server-location-value").textContent = "Location unavailable";
  }
}

function stopResultsRefresh() {
  if (resultsRefreshTimer !== null) {
    clearInterval(resultsRefreshTimer);
    resultsRefreshTimer = null;
  }
}

function startResultsRefresh() {
  stopResultsRefresh();
  loadResults();

  resultsRefreshTimer = setInterval(() => {
    if (activeTab === "results" && !document.hidden) {
      loadResults({ silent: true });
    }
  }, RESULTS_REFRESH_MS);
}

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    tabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

    const test = tab.dataset.test;
    activeTab = test;
    latencyPanel.classList.toggle("hidden", test !== "latency");
    bandwidthPanel.classList.toggle("hidden", test !== "bandwidth");
    resultsPanel.classList.toggle("hidden", test !== "results");

    if (test === "results") {
      startResultsRefresh();
    } else {
      stopResultsRefresh();
    }
  });
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  if (activeTab === "results") loadResults({ silent: true });
});

function setProgress(id, percent) {
  $(id).style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function formatMbps(bytes, seconds) {
  return (bytes * 8 / seconds / 1_000_000).toFixed(1);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function filterLatencyOutliers(values) {
  if (values.length < 4) return [...values];

  const sorted = [...values].sort((a, b) => a - b);
  const q1 = median(sorted.slice(0, Math.floor(sorted.length / 2)));
  const upperHalfStart = Math.ceil(sorted.length / 2);
  const q3 = median(sorted.slice(upperHalfStart));
  const iqr = q3 - q1;

  if (!Number.isFinite(iqr) || iqr === 0) {
    return sorted.filter(value => value === median(sorted));
  }

  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;
  const filtered = sorted.filter(value => value >= lowerBound && value <= upperBound);

  return filtered.length >= 3 ? filtered : sorted;
}

function latencyRating(value) {
  if (value <= 50) return ["Excellent", "good"];
  if (value <= 100) return ["Good", "good"];
  if (value <= 180) return ["Fair", "fair"];
  return ["Poor", "poor"];
}

async function runLatency() {
  latencyButton.dataset.testing = "true";
  latencyButton.disabled = true;
  latencyButton.textContent = "Testing…";
  $("ping-results").innerHTML = "";
  $("latency-value").textContent = "—";
  $("latency-average").textContent = "—";
  ["latency-min", "latency-max", "latency-jitter"].forEach(id => $(id).textContent = "—");
  $("latency-loss").textContent = "0%";
  $("latency-status").textContent = "Testing connection…";
  $("latency-status").className = "status neutral";

  const results = [];
  const total = 40;

  for (let i = 0; i < total; i++) {
    const item = document.createElement("div");
    item.className = "ping";
    item.innerHTML = `Test ${i + 1}<b>…</b>`;
    $("ping-results").appendChild(item);

    const start = performance.now();
    try {
      await fetch(`/api/ping?test=${i}&t=${Date.now()}`, {
        cache: "no-store",
        method: "GET",
      });
      const ms = performance.now() - start;
      results.push(ms);
      item.innerHTML = `Test ${i + 1}<b>${Math.round(ms)} ms</b>`;
    } catch {
      item.classList.add("fail");
      item.innerHTML = `Test ${i + 1}<b>Failed</b>`;
    }

    const completed = i + 1;
    setProgress("latency-progress", completed / total * 100);
    $("latency-progress-text").textContent = `${completed} tests`;
    $("latency-percent").textContent = `${Math.round(completed / total * 100)}%`;
    $("latency-count").textContent = `${completed} / ${total}`;
  }

  const loss = ((total - results.length) / total) * 100;
  $("latency-loss").textContent = `${loss.toFixed(0)}%`;

  let medianValue = null;
  let enoughSamples = false;

  if (!results.length) {
    $("latency-status").textContent = "Test failed · no responses received";
    $("latency-status").className = "status poor";
  } else {
    // Ignore the first successful response as a warm-up sample, then remove
    // statistical outliers without changing the packet-loss calculation.
    const measured = results.slice(1);
    const filtered = filterLatencyOutliers(measured);

    if (filtered.length < 3) {
      $("latency-status").textContent = "Not enough valid samples · run the test again";
      $("latency-status").className = "status fair";
    } else {
      enoughSamples = true;
      const avg = filtered.reduce((a, b) => a + b, 0) / filtered.length;
      medianValue = median(filtered);
      const min = Math.min(...filtered);
      const max = Math.max(...filtered);
      const changes = filtered.slice(1).map((value, i) => Math.abs(value - filtered[i]));
      const jitter = changes.length ? median(changes) : 0;
      const [label, cls] = latencyRating(medianValue);

      $("latency-value").textContent = Math.round(medianValue);
      $("latency-average").textContent = `${Math.round(avg)} ms`;
      $("latency-min").textContent = `${Math.round(min)} ms`;
      $("latency-max").textContent = `${Math.round(max)} ms`;
      $("latency-jitter").textContent = `${Math.round(jitter)} ms`;
      $("latency-status").textContent = loss ? `${label} · ${loss.toFixed(0)}% loss` : label;
      $("latency-status").className = `status ${cls}`;
    }
  }

  if (medianValue !== null && enoughSamples) {
    try {
      await submitResult("/api/results/latency", { latencyMs: medianValue });
      setCooldown("latency", 20);
    } catch (error) {
      $("latency-status").textContent = error.retryAfter
        ? `Result not saved · retry in ${formatDuration(error.retryAfter)}`
        : "Test complete · result not saved";
      $("latency-status").className = "status fair";

      if (error.retryAfter) setCooldown("latency", error.retryAfter);
    }
  }

  delete latencyButton.dataset.testing;
  updateCooldownButtons();
}

function uploadWithProgress(data, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const start = performance.now();

    xhr.open("POST", `/api/upload?t=${Date.now()}`, true);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");

    xhr.upload.addEventListener("progress", event => {
      if (event.lengthComputable) {
        const progress = event.loaded >= event.total
          ? 99
          : 50 + (event.loaded / event.total * 49);
        onProgress(progress);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve((performance.now() - start) / 1000);
      } else {
        reject(new Error("Upload failed"));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Upload failed")));
    xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));
    xhr.send(data);
  });
}

async function runBandwidth() {
  bandwidthButton.dataset.testing = "true";
  bandwidthButton.disabled = true;
  bandwidthButton.textContent = "Testing…";
  $("download-value").textContent = "—";
  $("upload-value").textContent = "—";
  $("bandwidth-status").textContent = "Testing download…";
  setProgress("bandwidth-progress", 0);

  const size = 2 * 1024 * 1024;
  let downloadMbps = null;
  let uploadMbps = null;

  try {
    const start = performance.now();
    const response = await fetch(`/api/download?size=${size}&t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok || !response.body) throw new Error("Download failed");

    const reader = response.body.getReader();
    let received = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      setProgress("bandwidth-progress", received / size * 50);
    }
    const seconds = (performance.now() - start) / 1000;
    downloadMbps = Number(formatMbps(received, seconds));
    $("download-value").textContent = downloadMbps.toFixed(1);

    $("bandwidth-status").textContent = "Testing upload…";
    const uploadData = new Uint8Array(size);
    const uploadSeconds = await uploadWithProgress(uploadData, progress => {
      setProgress("bandwidth-progress", progress);
    });

    uploadMbps = Number(formatMbps(size, uploadSeconds));
    $("upload-value").textContent = uploadMbps.toFixed(1);

    setProgress("bandwidth-progress", 100);
    $("bandwidth-status").textContent = "Test complete";
  } catch (error) {
    console.error(error);
    $("bandwidth-status").textContent = "Bandwidth test failed";
    setProgress("bandwidth-progress", 0);
  }

  if (downloadMbps !== null && uploadMbps !== null) {
    try {
      await submitResult("/api/results/bandwidth", {
        downloadMbps,
        uploadMbps,
      });
      setCooldown("bandwidth", 20);
    } catch (error) {
      $("bandwidth-status").textContent = error.retryAfter
        ? `Test complete · result not saved · retry in ${formatDuration(error.retryAfter)}`
        : "Test complete · result not saved";

      if (error.retryAfter) setCooldown("bandwidth", error.retryAfter);
    }
  }

  delete bandwidthButton.dataset.testing;
  updateCooldownButtons();
}

function renderResults(rows) {
  const leaderboard = $("leaderboard");
  leaderboard.innerHTML = "";

  if (!rows.length) {
    leaderboard.innerHTML = '<div class="results-message">No users yet. Be the first to enter your username.</div>';
    return;
  }

  rows.forEach(row => {
    const item = document.createElement("div");
    item.className = `leaderboard-row${row.username === currentUsername ? " me" : ""}`;

    const latency = row.latencyMs === null
      ? '<span class="untested">Not tested</span>'
      : `${row.latencyMs} <small>ms</small>`;

    const bandwidth = row.bandwidthMbps === null
      ? '<span class="untested">Not tested</span>'
      : `${row.bandwidthMbps} <small>Mbps</small>`;

    const score = row.score === null
      ? '<span class="untested">—</span>'
      : `${row.score}`;

    item.innerHTML = `
      <span class="rank">#${row.rank}</span>
      <span class="username-cell" title="${escapeHtml(row.username)}">${escapeHtml(row.username)}</span>
      <span class="metric-cell">${latency}</span>
      <span class="metric-cell">${bandwidth}</span>
      <span class="score-cell">${score}</span>
    `;

    leaderboard.appendChild(item);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadResults({ silent = false } = {}) {
  if (resultsLoading) return;
  resultsLoading = true;

  if (!silent) {
    $("results-message").textContent = "Loading latest results…";
    $("results-message").className = "results-message";
  }

  try {
    const response = await fetch("/api/results", { cache: "no-store" });
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || "Unable to load results.");

    // Do not repaint hidden content after the user has switched tabs.
    if (activeTab !== "results") return;

    renderResults(data.results || []);
    $("results-message").textContent = `Showing the latest results from ${data.results.length} participant${data.results.length === 1 ? "" : "s"} · updates every 5 seconds.`;
    $("results-message").className = "results-message";
  } catch (error) {
    if (activeTab !== "results") return;
    $("results-message").textContent = error.message;
    $("results-message").className = "results-message error";
  } finally {
    resultsLoading = false;
  }
}

loadServerLocation();
initializeUsername();
latencyButton.addEventListener("click", runLatency);
bandwidthButton.addEventListener("click", runBandwidth);
