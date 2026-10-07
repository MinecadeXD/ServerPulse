const $ = id => document.getElementById(id);

const latencyButton = $("latency-button");
const bandwidthButton = $("bandwidth-button");
const tabs = document.querySelectorAll(".tab");
const latencyPanel = $("latency-panel");
const bandwidthPanel = $("bandwidth-panel");

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    tabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const latency = tab.dataset.test === "latency";
    latencyPanel.classList.toggle("hidden", !latency);
    bandwidthPanel.classList.toggle("hidden", latency);
  });
});

function setProgress(id, percent) {
  $(id).style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function formatMbps(bytes, seconds) {
  return (bytes * 8 / seconds / 1_000_000).toFixed(1);
}

function latencyRating(avg) {
  if (avg <= 50) return ["Excellent", "good"];
  if (avg <= 100) return ["Good", "good"];
  if (avg <= 180) return ["Fair", "fair"];
  return ["Poor", "poor"];
}

async function runLatency() {
  latencyButton.disabled = true;
  latencyButton.textContent = "Testing…";
  $("ping-results").innerHTML = "";
  $("latency-value").textContent = "—";
  ["latency-min", "latency-max", "latency-jitter"].forEach(id => $(id).textContent = "—");
  $("latency-loss").textContent = "0%";
  $("latency-status").textContent = "Testing connection…";
  $("latency-status").className = "status neutral";

  const results = [];
  const total = 20;

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

  if (!results.length) {
    $("latency-status").textContent = "Test failed";
    $("latency-status").className = "status poor";
  } else {
    const avg = results.reduce((a, b) => a + b, 0) / results.length;
    const min = Math.min(...results);
    const max = Math.max(...results);
    const jitter = results.length > 1
      ? results.slice(1).reduce((sum, value, i) => sum + Math.abs(value - results[i]), 0) / (results.length - 1)
      : 0;
    const [label, cls] = latencyRating(avg);

    $("latency-value").textContent = Math.round(avg);
    $("latency-min").textContent = `${Math.round(min)} ms`;
    $("latency-max").textContent = `${Math.round(max)} ms`;
    $("latency-jitter").textContent = `${Math.round(jitter)} ms`;
    $("latency-status").textContent = loss ? `${label} · ${loss}% loss` : label;
    $("latency-status").className = `status ${cls}`;
  }

  latencyButton.disabled = false;
  latencyButton.textContent = "Test again";
}

function uploadWithProgress(data, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const start = performance.now();

    xhr.open("POST", `/api/upload?t=${Date.now()}`, true);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");

    xhr.upload.addEventListener("progress", event => {
      if (event.lengthComputable) {
        onProgress(event.loaded, event.total);
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
  bandwidthButton.disabled = true;
  bandwidthButton.textContent = "Testing…";
  $("download-value").textContent = "—";
  $("upload-value").textContent = "—";
  $("bandwidth-status").textContent = "Testing download…";
  setProgress("bandwidth-progress", 0);

  const size = 2 * 1024 * 1024;

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
    $("download-value").textContent = formatMbps(received, seconds);

    $("bandwidth-status").textContent = "Testing upload…";
    const uploadData = new Uint8Array(size);
    const uploadSeconds = await uploadWithProgress(uploadData, (loaded, total) => {
      setProgress("bandwidth-progress", 50 + (loaded / total * 50));
    });

    $("upload-value").textContent = formatMbps(size, uploadSeconds);
    setProgress("bandwidth-progress", 100);
    $("bandwidth-status").textContent = "Test complete";
  } catch (error) {
    console.error(error);
    $("bandwidth-status").textContent = "Bandwidth test failed";
    setProgress("bandwidth-progress", 0);
  }

  bandwidthButton.disabled = false;
  bandwidthButton.textContent = "Test again";
}

latencyButton.addEventListener("click", runLatency);
bandwidthButton.addEventListener("click", runBandwidth);
