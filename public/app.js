const commandGrid = document.getElementById('commandGrid');
const commandSelect = document.getElementById('commandSelect');
const argumentInput = document.getElementById('argumentInput');
const commandForm = document.getElementById('commandForm');
const runCommandBtn = commandForm?.querySelector('button[type="submit"]');
const output = document.getElementById('output');
const clearOutput = document.getElementById('clearOutput');
const stopStream = document.getElementById('stopStream');
const logoutBtn = document.getElementById('logoutBtn');
const statusPill = document.getElementById('statusPill');
const health = document.getElementById('health');

const authOverlay = document.getElementById('authOverlay');
const loginForm = document.getElementById('loginForm');
const loginUser = document.getElementById('loginUser');
const loginPass = document.getElementById('loginPass');
const loginError = document.getElementById('loginError');
const authPill = document.getElementById('authPill');

const telemetryReq = document.getElementById('telemetryReq');
const telemetryTraffic = document.getElementById('telemetryTraffic');
const telemetryUsers = document.getElementById('telemetryUsers');
const telemetryDomains = document.getElementById('telemetryDomains');
const telemetryGraph = document.getElementById('telemetryGraph');
const telemetryRecent = document.getElementById('telemetryRecent');
const pressureGauge = document.getElementById('pressureGauge');
const pressureLabel = document.getElementById('pressureLabel');
const statusDonut = document.getElementById('statusDonut');
const statusMixLabel = document.getElementById('statusMixLabel');
const topDomain = document.getElementById('topDomain');
const topUser = document.getElementById('topUser');
const securityFeed = document.getElementById('securityFeed');

let stream = null;
let telemetryStream = null;
let telemetryPollTimer = null;

let graphMode = { type: 'flow' };

let isAuthenticated = false;

function setAuthUi(authenticated) {
  isAuthenticated = Boolean(authenticated);

  if (logoutBtn) {
    logoutBtn.disabled = !isAuthenticated;
  }

  if (authOverlay) {
    authOverlay.hidden = isAuthenticated;
  }

  if (authPill) {
    authPill.className = `status ${isAuthenticated ? 'success' : 'failed'}`;
    authPill.textContent = isAuthenticated ? 'Unlocked' : 'Locked';
  }

  commandSelect.disabled = !isAuthenticated;
  argumentInput.disabled = !isAuthenticated || !requiresArgument(commandSelect.value);

  if (runCommandBtn) {
    runCommandBtn.disabled = !isAuthenticated;
  }

  const buttonsToToggle = [clearOutput, stopStream];
  for (const btn of buttonsToToggle) {
    if (btn) {
      btn.disabled = !isAuthenticated;
    }
  }

  if (!isAuthenticated) {
    stopActiveStream();
    stopTelemetry();

    if (telemetryReq) {
      telemetryReq.textContent = '--';
    }
    if (telemetryTraffic) {
      telemetryTraffic.textContent = '--';
    }
    if (telemetryUsers) {
      telemetryUsers.textContent = '--';
    }
    if (telemetryDomains) {
      telemetryDomains.textContent = '--';
    }
    if (telemetryRecent) {
      telemetryRecent.textContent = 'Live flow: locked (sign in to view)';
    }
    if (pressureLabel) {
      pressureLabel.textContent = 'locked';
    }
    if (statusMixLabel) {
      statusMixLabel.textContent = 'locked';
    }
    updateHotspots(null);
    updateSecurityFeed([]);
  }
}

function showAuthError(message) {
  if (loginError) {
    loginError.textContent = message;
  }
  setStatus('failed', 'Auth required');
}

async function fetchJson(url, options) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...options
  });

  const contentType = String(res.headers.get('content-type') || '');
  const json = contentType.includes('application/json') ? await res.json() : null;
  return { res, json };
}

function setStatus(type, text) {
  statusPill.className = `status ${type}`;
  statusPill.textContent = text;
}

function writeToOutput(text, reset = false) {
  if (reset) {
    output.textContent = '';
  }

  output.textContent += text;
  output.scrollTop = output.scrollHeight;
}

function requiresArgument(command) {
  return ['search', 'block', 'unblock'].includes(command);
}

function stopActiveStream() {
  if (stream) {
    stream.close();
    stream = null;
  }

  stopStream.disabled = true;
}

function stopTelemetry() {
  if (telemetryStream) {
    telemetryStream.close();
    telemetryStream = null;
  }
  if (telemetryPollTimer) {
    clearInterval(telemetryPollTimer);
    telemetryPollTimer = null;
  }
}

function getCssVar(name, fallback) {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name);
    const trimmed = String(value || '').trim();
    return trimmed || fallback;
  } catch (_err) {
    return fallback;
  }
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let current = value;
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }

  const decimals = unitIndex === 0 ? 0 : current >= 10 ? 1 : 2;
  return `${current.toFixed(decimals)} ${units[unitIndex]}`;
}

function resizeCanvasToDisplaySize(canvas) {
  if (!canvas) {
    return null;
  }

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }

  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * dpr);
  const height = Math.round(rect.height * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function drawFlowGraph(points) {
  if (!telemetryGraph) {
    return;
  }

  const ctx = resizeCanvasToDisplaySize(telemetryGraph);
  if (!ctx) {
    return;
  }

  const width = telemetryGraph.getBoundingClientRect().width;
  const height = telemetryGraph.getBoundingClientRect().height;
  ctx.clearRect(0, 0, width, height);

  const data = Array.isArray(points) ? points : [];
  if (data.length < 2) {
    ctx.fillStyle = 'rgba(157, 194, 214, 0.28)';
    ctx.font = '12px IBM Plex Mono, monospace';
    ctx.fillText('Awaiting telemetry…', 10, Math.max(18, height / 2));
    return;
  }

  const padding = 10;
  const plotW = Math.max(1, width - padding * 2);
  const plotH = Math.max(1, height - padding * 2);

  const bytesSeries = data.map((p) => Number(p.bytes) || 0);
  const maxBytes = Math.max(1, ...bytesSeries);

  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(130, 208, 255, 0.14)';
  ctx.beginPath();
  for (let i = 0; i <= 4; i += 1) {
    const y = padding + (plotH * i) / 4;
    ctx.moveTo(padding, y);
    ctx.lineTo(padding + plotW, y);
  }
  ctx.stroke();

  ctx.beginPath();
  for (let i = 0; i < data.length; i += 1) {
    const x = padding + (plotW * i) / (data.length - 1);
    const y = padding + plotH - (plotH * bytesSeries[i]) / maxBytes;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.strokeStyle = 'rgba(120, 255, 157, 0.95)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.lineTo(padding + plotW, padding + plotH);
  ctx.lineTo(padding, padding + plotH);
  ctx.closePath();
  ctx.fillStyle = 'rgba(120, 255, 157, 0.10)';
  ctx.fill();

  ctx.fillStyle = 'rgba(39, 209, 255, 0.9)';
  ctx.font = '12px IBM Plex Mono, monospace';
  const lastBytes = bytesSeries[bytesSeries.length - 1] || 0;
  ctx.fillText(`bytes/tick: ${formatBytes(lastBytes)}`, padding, padding + 14);
}

function drawBarChart(title, rows, unitLabel) {
  if (!telemetryGraph) {
    return;
  }

  const ctx = resizeCanvasToDisplaySize(telemetryGraph);
  if (!ctx) {
    return;
  }

  const width = telemetryGraph.getBoundingClientRect().width;
  const height = telemetryGraph.getBoundingClientRect().height;
  ctx.clearRect(0, 0, width, height);

  const accent = getCssVar('--accent', 'rgba(39, 209, 255, 0.9)');
  const accent2 = getCssVar('--accent-2', 'rgba(120, 255, 157, 0.9)');
  const muted = getCssVar('--muted', 'rgba(157, 194, 214, 0.8)');
  const grid = 'rgba(130, 208, 255, 0.14)';

  const safeRows = Array.isArray(rows) ? rows.slice(0, 8) : [];
  if (!safeRows.length) {
    ctx.fillStyle = muted;
    ctx.font = '12px IBM Plex Mono, monospace';
    ctx.fillText('No chart data to display.', 10, Math.max(18, height / 2));
    return;
  }

  const padding = 10;
  const topPad = 22;
  const rightPad = 10;
  const leftPad = 120;
  const bottomPad = 10;
  const plotW = Math.max(1, width - leftPad - rightPad);
  const plotH = Math.max(1, height - topPad - bottomPad);

  ctx.fillStyle = accent;
  ctx.font = '12px IBM Plex Mono, monospace';
  ctx.fillText(title, padding, 16);

  const maxValue = Math.max(1, ...safeRows.map((r) => r.value));

  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 4; i += 1) {
    const x = leftPad + (plotW * i) / 4;
    ctx.moveTo(x, topPad);
    ctx.lineTo(x, topPad + plotH);
  }
  ctx.stroke();

  const rowH = plotH / safeRows.length;
  for (let i = 0; i < safeRows.length; i += 1) {
    const row = safeRows[i];
    const y = topPad + i * rowH + rowH * 0.18;
    const barH = rowH * 0.62;
    const barW = Math.max(2, (plotW * row.value) / maxValue);

    ctx.fillStyle = 'rgba(120, 255, 157, 0.10)';
    ctx.fillRect(leftPad, y, plotW, barH);

    ctx.fillStyle = i === 0 ? 'rgba(39, 209, 255, 0.75)' : 'rgba(120, 255, 157, 0.55)';
    ctx.fillRect(leftPad, y, barW, barH);
    ctx.strokeStyle = i === 0 ? accent : accent2;
    ctx.strokeRect(leftPad, y, barW, barH);

    ctx.fillStyle = muted;
    ctx.font = '12px IBM Plex Mono, monospace';
    const label = row.label.length > 18 ? `${row.label.slice(0, 17)}…` : row.label;
    ctx.fillText(label, padding, y + barH - 2);

    ctx.fillStyle = accent2;
    const suffix = unitLabel ? ` ${unitLabel}` : '';
    ctx.fillText(`${row.value}${suffix}`, leftPad + barW + 6, y + barH - 2);
  }
}

function classifyLogLine(line) {
  const text = String(line || '');
  if (!text.trim()) {
    return 'neutral';
  }
  if (/\b(50\d|40[13]|denied|blocked|error|timeout|fail)\b/i.test(text)) {
    return 'bad';
  }
  if (/\b(40\d|slow|retry|warn)\b/i.test(text)) {
    return 'warn';
  }
  return 'good';
}

function drawPressureGauge(requestsPerWindow, bytesPerWindow, windowSec) {
  if (!pressureGauge) {
    return;
  }

  const ctx = resizeCanvasToDisplaySize(pressureGauge);
  if (!ctx) {
    return;
  }

  const width = pressureGauge.getBoundingClientRect().width;
  const height = pressureGauge.getBoundingClientRect().height;
  ctx.clearRect(0, 0, width, height);

  const accent = getCssVar('--accent', '#27d1ff');
  const accent2 = getCssVar('--accent-2', '#78ff9d');
  const muted = getCssVar('--muted', '#9dc2d6');
  const danger = getCssVar('--danger', '#ff5c74');

  const reqRate = requestsPerWindow / Math.max(1, windowSec);
  const mbps = (bytesPerWindow * 8) / Math.max(1, windowSec) / 1000000;
  const pressure = Math.min(1, reqRate / 4 + mbps / 3);

  const cx = width / 2;
  const cy = height * 0.9;
  const r = Math.min(width * 0.36, height * 0.72);
  const start = Math.PI;
  const end = 2 * Math.PI;
  const fill = start + (end - start) * pressure;

  ctx.lineWidth = 12;
  ctx.strokeStyle = 'rgba(130, 208, 255, 0.20)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, start, end);
  ctx.stroke();

  const gradient = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
  gradient.addColorStop(0, accent2);
  gradient.addColorStop(0.65, accent);
  gradient.addColorStop(1, danger);
  ctx.strokeStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, r, start, fill);
  ctx.stroke();

  ctx.fillStyle = '#d7f4ff';
  ctx.font = '700 24px Space Grotesk, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(pressure * 100)}%`, cx, cy - r * 0.36);

  ctx.fillStyle = muted;
  ctx.font = '12px IBM Plex Mono, monospace';
  ctx.fillText(`${reqRate.toFixed(2)} req/s`, cx, cy - r * 0.12);
  ctx.fillText(`${mbps.toFixed(2)} Mbps`, cx, cy + r * 0.12);

  if (pressureLabel) {
    pressureLabel.textContent = pressure >= 0.75 ? 'high' : pressure >= 0.45 ? 'moderate' : 'stable';
  }
}

function drawStatusDonut(statusCounts, totalRequests) {
  if (!statusDonut) {
    return;
  }

  const ctx = resizeCanvasToDisplaySize(statusDonut);
  if (!ctx) {
    return;
  }

  const width = statusDonut.getBoundingClientRect().width;
  const height = statusDonut.getBoundingClientRect().height;
  ctx.clearRect(0, 0, width, height);

  const entries = Object.entries(statusCounts || {});
  if (!entries.length || !totalRequests) {
    ctx.fillStyle = getCssVar('--muted', '#9dc2d6');
    ctx.font = '12px IBM Plex Mono, monospace';
    ctx.fillText('No status data yet', 12, Math.max(22, height / 2));
    if (statusMixLabel) {
      statusMixLabel.textContent = 'waiting';
    }
    return;
  }

  const classCounts = {
    '2xx': 0,
    '3xx': 0,
    '4xx': 0,
    '5xx': 0,
    other: 0
  };

  for (const [code, count] of entries) {
    const c = Number(code);
    if (c >= 200 && c < 300) classCounts['2xx'] += count;
    else if (c >= 300 && c < 400) classCounts['3xx'] += count;
    else if (c >= 400 && c < 500) classCounts['4xx'] += count;
    else if (c >= 500 && c < 600) classCounts['5xx'] += count;
    else classCounts.other += count;
  }

  const segments = [
    { label: '2xx', value: classCounts['2xx'], color: 'rgba(120, 255, 157, 0.9)' },
    { label: '3xx', value: classCounts['3xx'], color: 'rgba(39, 209, 255, 0.9)' },
    { label: '4xx', value: classCounts['4xx'], color: 'rgba(255, 143, 92, 0.95)' },
    { label: '5xx', value: classCounts['5xx'], color: 'rgba(255, 92, 116, 0.95)' },
    { label: 'other', value: classCounts.other, color: 'rgba(157, 194, 214, 0.8)' }
  ].filter((s) => s.value > 0);

  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const cx = width * 0.35;
  const cy = height * 0.52;
  const radius = Math.min(width * 0.21, height * 0.34);

  let angle = -Math.PI / 2;
  for (const seg of segments) {
    const span = (Math.PI * 2 * seg.value) / total;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, angle, angle + span);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();
    angle += span;
  }

  ctx.fillStyle = 'rgba(3, 11, 17, 0.95)';
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#d7f4ff';
  ctx.font = '700 15px Space Grotesk, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${total}`, cx, cy + 5);

  ctx.textAlign = 'left';
  ctx.font = '12px IBM Plex Mono, monospace';
  segments.forEach((seg, index) => {
    const y = 22 + index * 18;
    ctx.fillStyle = seg.color;
    ctx.fillRect(width * 0.58, y - 8, 10, 10);
    ctx.fillStyle = getCssVar('--muted', '#9dc2d6');
    ctx.fillText(`${seg.label}: ${seg.value}`, width * 0.58 + 16, y);
  });

  const errorShare = (classCounts['4xx'] + classCounts['5xx']) / Math.max(1, total);
  if (statusMixLabel) {
    statusMixLabel.textContent = `error share ${(errorShare * 100).toFixed(1)}%`;
  }
}

function updateHotspots(top) {
  if (topDomain) {
    topDomain.textContent = top?.legalDomain || top?.domain || '--';
  }
  if (topUser) {
    topUser.textContent = top?.user || '--';
  }
}

function updateSecurityFeed(lines) {
  if (!securityFeed) {
    return;
  }

  const entries = (Array.isArray(lines) ? lines : []).slice(-6).reverse();
  if (!entries.length) {
    securityFeed.innerHTML = '<li class="event neutral">No recent log lines in window.</li>';
    return;
  }

  const fragments = entries.map((line) => {
    const kind = classifyLogLine(line);
    const safeText = String(line || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<li class="event ${kind}" title="${safeText}">${safeText}</li>`;
  });

  securityFeed.innerHTML = fragments.join('');
}

function parseStatusCodes(outputText) {
  const lines = String(outputText || '').split(/\r?\n/);
  const rows = [];
  for (const line of lines) {
    const match = line.match(/^\s*(\d+)\s*\|\s*HTTP\s+(\d{3})\b/);
    if (!match) {
      continue;
    }
    rows.push({ label: `HTTP ${match[2]}`, value: Number(match[1]) || 0 });
  }
  return rows.sort((a, b) => b.value - a.value).slice(0, 8);
}

function parseTopSites(outputText) {
  const lines = String(outputText || '').split(/\r?\n/);
  const rows = [];
  for (const line of lines) {
    const match = line.match(/^\s*(\d+)\s+visits\s*\|\s*(.+)$/i);
    if (!match) {
      continue;
    }
    rows.push({ label: match[2].trim(), value: Number(match[1]) || 0 });
  }
  return rows.sort((a, b) => b.value - a.value).slice(0, 8);
}

function parseTopUsers(outputText) {
  const lines = String(outputText || '').split(/\r?\n/);
  const rows = [];
  for (const line of lines) {
    const match = line.match(/^\s*(\d+)\s+requests\s*\|\s*(.+)$/i);
    if (!match) {
      continue;
    }
    rows.push({ label: match[2].trim(), value: Number(match[1]) || 0 });
  }
  return rows.sort((a, b) => b.value - a.value).slice(0, 8);
}

function setGraphModeFromCommand(command, outputText) {
  if (!command) {
    return false;
  }

  if (command === 'status-codes') {
    const rows = parseStatusCodes(outputText);
    if (rows.length) {
      graphMode = { type: 'bars', title: 'Status Codes', unit: '', rows };
      return true;
    }
  }

  if (command === 'top-sites') {
    const rows = parseTopSites(outputText);
    if (rows.length) {
      graphMode = { type: 'bars', title: 'Top Sites', unit: 'visits', rows };
      return true;
    }
  }

  if (command === 'top-users') {
    const rows = parseTopUsers(outputText);
    if (rows.length) {
      graphMode = { type: 'bars', title: 'Top Users', unit: 'req', rows };
      return true;
    }
  }

  if (command === 'live' || command === 'monitor') {
    graphMode = { type: 'flow' };
    return true;
  }

  return false;
}

function drawCurrentGraph(flowPoints) {
  if (graphMode.type === 'bars') {
    drawBarChart(graphMode.title, graphMode.rows, graphMode.unit);
    return;
  }
  drawFlowGraph(flowPoints);
}

function applyTelemetry(payload) {
  if (!payload || !payload.totals) {
    return;
  }

  const windowSec = Number(payload.windowSec) || 60;
  const requests = Number(payload.totals.requests) || 0;
  const bytes = Number(payload.totals.bytes) || 0;

  if (telemetryReq) {
    telemetryReq.textContent = `${requests}`;
  }
  if (telemetryTraffic) {
    telemetryTraffic.textContent = formatBytes(bytes);
  }
  if (telemetryUsers) {
    telemetryUsers.textContent = `${payload.totals.uniqueUsers ?? '--'}`;
  }
  if (telemetryDomains) {
    telemetryDomains.textContent = `${payload.totals.uniqueDomains ?? '--'}`;
  }

  const recent = Array.isArray(payload.recent) ? payload.recent : [];
  if (telemetryRecent) {
    if (recent.length) {
      telemetryRecent.textContent = `Live flow (${windowSec}s): ${recent[recent.length - 1]}`;
    } else {
      const topDomain = payload.top?.domain ? `top domain: ${payload.top.domain}` : 'no recent events';
      telemetryRecent.textContent = `Live flow (${windowSec}s): ${topDomain}`;
    }
  }

  if (graphMode.type === 'flow') {
    drawCurrentGraph(payload.points);
  }

  drawPressureGauge(requests, bytes, windowSec);
  drawStatusDonut(payload.statusCounts, requests);
  updateHotspots(payload.top);
  updateSecurityFeed(payload.recent);
}

async function startTelemetry() {
  stopTelemetry();

  if (!isAuthenticated) {
    return;
  }

  const params = new URLSearchParams({ windowSec: '60', intervalMs: '1000', points: '60' });
  try {
    telemetryStream = new EventSource(`/api/telemetry/stream?${params.toString()}`);

    telemetryStream.addEventListener('telemetry', (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        if (payload && payload.totals) {
          applyTelemetry(payload);
        }
      } catch (_err) {
        // Ignore malformed telemetry packets.
      }
    });

    telemetryStream.onerror = async () => {
      stopTelemetry();
      if (telemetryRecent) {
        telemetryRecent.textContent = 'Live flow: reconnecting via polling…';
      }

      const poll = async () => {
        const res = await fetch(`/api/telemetry/snapshot?${new URLSearchParams({ windowSec: '60', points: '60' })}`);
        const json = await res.json();
        applyTelemetry(json);
      };

      try {
        await poll();
      } catch (_err) {
        // ignore
      }

      telemetryPollTimer = setInterval(() => {
        poll().catch(() => {
          // ignore
        });
      }, 2000);
    };
  } catch (_err) {
    // Fallback will be handled by polling below.
  }
}

async function loadInitialData() {
  const healthRes = await fetch('/api/health');
  const healthJson = await healthRes.json();

  const runtime = healthJson.runtime || { ok: true, reason: 'Runtime unknown' };
  const modeLabel = healthJson.executionMode || (runtime.ok ? 'linux-native' : 'windows-compatibility');
  const runtimeLabel = runtime.ok ? 'Linux runtime ready' : `Compatibility active: ${runtime.reason}`;
  health.textContent = `Server platform: ${healthJson.platform} | API status: online | Mode: ${modeLabel} | ${runtimeLabel}`;

  const status = await fetchJson('/api/auth/status');
  setAuthUi(Boolean(status.json?.authenticated));

  if (!isAuthenticated) {
    if (loginUser && !String(loginUser.value || '').trim()) {
      loginUser.value = 'shuvo-045';
    }
    writeToOutput('\n[Auth] Please sign in as admin to run commands.\n', false);
    if (loginUser) {
      loginUser.focus();
    }
    return;
  }

  commandGrid.textContent = '';
  commandSelect.textContent = '';

  const commandsRes = await fetchJson('/api/commands');
  if (!commandsRes.res.ok) {
    setAuthUi(false);
    showAuthError(commandsRes.json?.error || 'Authentication required');
    return;
  }

  const commandsJson = commandsRes.json;

  commandsJson.commands.forEach((command) => {
    const option = document.createElement('option');
    option.value = command;
    option.textContent = command;
    commandSelect.appendChild(option);

    const chip = document.createElement('span');
    chip.className = 'command-chip';
    chip.textContent = command;
    commandGrid.appendChild(chip);
  });

  commandSelect.value = 'status';

  startTelemetry().catch(() => {
    // Ignore telemetry startup failures.
  });
}

commandSelect.addEventListener('change', () => {
  argumentInput.disabled = !requiresArgument(commandSelect.value);
  if (!requiresArgument(commandSelect.value)) {
    argumentInput.value = '';
  }
});

commandForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!isAuthenticated) {
    setAuthUi(false);
    showAuthError('Sign in first.');
    return;
  }

  stopActiveStream();

  const command = commandSelect.value;
  const argument = argumentInput.value.trim();

  if (requiresArgument(command) && !argument) {
    setStatus('failed', 'Argument required');
    writeToOutput(`\n[Error] ${command} requires an argument\n`);
    return;
  }

  setStatus('running', 'Running');
  writeToOutput(`\n$ ./proxywatch.sh ${command}${argument ? ` ${argument}` : ''}\n`, false);

  if (command === 'live' || command === 'monitor') {
    setGraphModeFromCommand(command, '');
    writeToOutput('[Live stream started]\n');

    const query = new URLSearchParams({ command, argument });
    stream = new EventSource(`/api/stream?${query.toString()}`);
    stopStream.disabled = false;

    stream.onmessage = (evt) => {
      writeToOutput(`${evt.data}\n`);
      setStatus('running', 'Streaming');
    };

    stream.addEventListener('exit', (evt) => {
      writeToOutput(`\n[Stream exited with code ${evt.data}]\n`);
      setStatus(evt.data === '0' ? 'success' : 'failed', 'Finished');
      stopActiveStream();
    });

    stream.onerror = () => {
      writeToOutput('\n[Stream disconnected]\n');
      setStatus('idle', 'Idle');
      stopActiveStream();
      if (!isAuthenticated) {
        return;
      }
      // If the stream drops due to auth, prompt login.
      setAuthUi(false);
      showAuthError('Stream ended (auth required). Please sign in again.');
    };

    return;
  }

  const response = await fetch('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, argument })
  });

  if (response.status === 401) {
    setAuthUi(false);
    showAuthError('Session expired. Please sign in again.');
    return;
  }

  const json = await response.json();

  if (!response.ok) {
    writeToOutput(`[Request error] ${json.error || 'Unknown error'}\n`);
    setStatus('failed', 'Failed');
    return;
  }

  writeToOutput(`${json.output || ''}\n`);
  setStatus(json.ok ? 'success' : 'failed', json.ok ? 'Done' : 'Failed');

  if (setGraphModeFromCommand(command, json.output || '')) {
    if (telemetryRecent) {
      if (graphMode.type === 'bars') {
        telemetryRecent.textContent = `Graph: ${graphMode.title} (run live/monitor to return to flow)`;
      } else {
        telemetryRecent.textContent = 'Graph: Live flow';
      }
    }
    try {
      const snapRes = await fetch(`/api/telemetry/snapshot?${new URLSearchParams({ windowSec: '60', points: '60' })}`);
      const snap = await snapRes.json();
      drawCurrentGraph(snap.points);
    } catch (_err) {
      // ignore
    }
  }
});

clearOutput.addEventListener('click', () => {
  writeToOutput('ProxyWatch UI output cleared.\n', true);
  setStatus('idle', 'Idle');
  graphMode = { type: 'flow' };
  if (telemetryRecent) {
    telemetryRecent.textContent = 'Graph: Live flow';
  }
});

stopStream.addEventListener('click', () => {
  writeToOutput('\n[Stopping live stream]\n');
  stopActiveStream();
  setStatus('idle', 'Idle');
});

if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (loginError) {
      loginError.textContent = '';
    }

    const username = String(loginUser?.value || '').trim();
    const password = String(loginPass?.value || '');

    const { res, json } = await fetchJson('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!res.ok) {
      showAuthError(json?.error || 'Login failed');
      return;
    }

    setAuthUi(true);
    writeToOutput(`\n[Auth] Logged in as ${json?.user || username}.\n`, false);
    await loadInitialData();
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await fetchJson('/api/auth/logout', { method: 'POST' });
    setAuthUi(false);
    showAuthError('Logged out.');
  });
}

loadInitialData().catch((err) => {
  setStatus('failed', 'Init failed');
  writeToOutput(`Initialization error: ${err.message}\n`);
});

window.addEventListener('beforeunload', () => {
  stopTelemetry();
});
