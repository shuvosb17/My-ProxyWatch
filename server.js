const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const { execFileSync } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.join(__dirname, 'data');
const COMPAT_LOG_FILE = path.join(DATA_DIR, 'access.log');
const BLOCKED_FILE = path.join(DATA_DIR, 'blocked_sites.txt');
const CONFIG_FILE = path.join(DATA_DIR, 'squid.conf.demo');
const BACKUP_FILE = path.join(DATA_DIR, 'squid.conf.backup');
let proxyServiceRunning = false;

const AUTH_COOKIE_NAME = 'proxywatch_admin';
let authConfig = null;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.disable('x-powered-by');

function base64urlEncode(value) {
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64urlDecodeToString(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64').toString('utf8');
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a), 'utf8');
  const right = Buffer.from(String(b), 'utf8');
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function getAuthConfig() {
  if (authConfig) {
    return authConfig;
  }

  const adminUser = String(process.env.ADMIN_USER || 'shuvo-045');
  let adminPass = process.env.ADMIN_PASS ? String(process.env.ADMIN_PASS) : '12345';
  let secret = process.env.AUTH_SECRET ? String(process.env.AUTH_SECRET) : '';
  const ttlHours = Number(process.env.AUTH_TTL_HOURS || 8);

  if (!secret) {
    secret = base64urlEncode(crypto.randomBytes(32));
    console.log(`[Auth] AUTH_SECRET not set. Generated ephemeral secret for this run.`);
  }

  if (!process.env.ADMIN_PASS) {
    console.log('[Auth] ADMIN_PASS not set. Using default admin password for this run.');
  }

  authConfig = {
    adminUser,
    adminPass,
    secret,
    ttlMs: Math.max(15 * 60 * 1000, Math.round((Number.isFinite(ttlHours) ? ttlHours : 8) * 60 * 60 * 1000))
  };

  console.log(`[Auth] Admin login enabled. User: ${adminUser}`);

  return authConfig;
}

function parseCookies(headerValue) {
  const out = {};
  const header = String(headerValue || '');
  if (!header) {
    return out;
  }

  const parts = header.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) {
      continue;
    }
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) {
      out[key] = decodeURIComponent(value);
    }
  }
  return out;
}

function signSession(payload) {
  const { secret } = getAuthConfig();
  const body = base64urlEncode(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `${body}.${sig}`;
}

function verifySession(token) {
  const { secret } = getAuthConfig();
  const raw = String(token || '');
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) {
    return null;
  }

  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  if (!timingSafeEqualString(sig, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64urlDecodeToString(body));
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    if (!payload.exp || Number(payload.exp) < Date.now()) {
      return null;
    }
    if (!payload.u || typeof payload.u !== 'string') {
      return null;
    }
    return payload;
  } catch (_err) {
    return null;
  }
}

function getAuthenticatedUser(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[AUTH_COOKIE_NAME];
  const payload = verifySession(token);
  return payload?.u || null;
}

function sendAuthRequired(req, res) {
  const accept = String(req.headers.accept || '');
  if (accept.includes('text/event-stream')) {
    res.status(401).end();
    return;
  }
  res.status(401).json({ ok: false, error: 'Authentication required' });
}

app.use('/api', (req, res, next) => {
  const pathName = String(req.path || '');
  if (pathName === '/health' || pathName.startsWith('/auth/')) {
    next();
    return;
  }

  const user = getAuthenticatedUser(req);
  if (!user) {
    sendAuthRequired(req, res);
    return;
  }

  req.authUser = user;
  next();
});

app.get('/api/auth/status', (req, res) => {
  const user = getAuthenticatedUser(req);
  res.json({ ok: true, authenticated: Boolean(user), user });
});

app.post('/api/auth/login', (req, res) => {
  const { adminUser, adminPass, ttlMs } = getAuthConfig();
  const username = String(req.body?.username || '');
  const password = String(req.body?.password || '');

  if (!username || !password) {
    res.status(400).json({ ok: false, error: 'Username and password are required' });
    return;
  }

  if (username !== adminUser || password !== adminPass) {
    res.status(401).json({ ok: false, error: 'Invalid credentials' });
    return;
  }

  const token = signSession({ u: username, exp: Date.now() + ttlMs });
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: ttlMs
  });
  res.json({ ok: true, user: username });
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

const SAFE_COMMANDS = [
  'start',
  'stop',
  'restart',
  'status',
  'reload',
  'logs',
  'top-users',
  'top-sites',
  'status-codes',
  'traffic',
  'stats',
  'blocked',
  'backup',
  'restore',
  'version',
  'help',
  'search',
  'block',
  'unblock',
  'live',
  'monitor'
];

const ARG_RULES = {
  search: /^[a-zA-Z0-9._:/ -]{1,80}$/,
  block: /^[a-zA-Z0-9.-]{1,80}$/,
  unblock: /^[a-zA-Z0-9.-]{1,80}$/
};

function validatePayload(command, argument) {
  if (!command || typeof command !== 'string' || !SAFE_COMMANDS.includes(command)) {
    return 'Invalid command';
  }

  const trimmedArgument = (argument || '').trim();

  if (['search', 'block', 'unblock'].includes(command)) {
    if (!trimmedArgument) {
      return `Command ${command} requires an argument`;
    }

    if (!ARG_RULES[command].test(trimmedArgument)) {
      return 'Argument format is not allowed';
    }
  }

  return null;
}

function runProxywatch(command, argument, onData, onExit) {
  const args = ['./proxywatch.sh', command];
  if (argument) {
    args.push(argument);
  }

  const child = spawn('bash', args, {
    cwd: __dirname,
    env: process.env,
    shell: false
  });

  child.stdout.on('data', (chunk) => onData(chunk.toString()));
  child.stderr.on('data', (chunk) => onData(chunk.toString()));
  child.on('error', (err) => onData(`Process error: ${err.message}\n`));
  child.on('close', (code) => onExit(code));

  return child;
}

function ensureCompatAssets() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(BLOCKED_FILE)) {
    fs.writeFileSync(BLOCKED_FILE, '', 'utf8');
  }

  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(
      CONFIG_FILE,
      'http_port 3128\nacl localnet src 10.0.0.0/8\nhttp_access allow localnet\n',
      'utf8'
    );
  }

  if (!fs.existsSync(COMPAT_LOG_FILE)) {
    const now = Math.floor(Date.now() / 1000);
    const sample = [
      `${now - 60} 120 192.168.1.20 TCP_MISS 4521 GET http://facebook.com/ - DIRECT 200 text/html`,
      `${now - 54} 88 192.168.1.21 TCP_MISS 3291 GET http://openai.com/ - DIRECT 200 text/html`,
      `${now - 50} 104 192.168.1.20 TCP_HIT 1870 GET http://github.com/ - DIRECT 200 text/html`,
      `${now - 44} 175 192.168.1.22 TCP_MISS 6512 GET http://youtube.com/ - DIRECT 302 text/html`,
      `${now - 37} 92 192.168.1.23 TCP_MISS 2720 GET http://wikipedia.org/ - DIRECT 200 text/html`,
      `${now - 32} 204 192.168.1.22 TCP_MISS 7213 GET http://facebook.com/docs - DIRECT 404 text/html`,
      `${now - 28} 77 192.168.1.24 TCP_HIT 1540 GET http://github.com/features - DIRECT 200 text/html`,
      `${now - 21} 111 192.168.1.21 TCP_MISS 3602 GET http://google.com/ - DIRECT 200 text/html`,
      `${now - 15} 135 192.168.1.20 TCP_MISS 5000 GET http://facebook.com/login - DIRECT 403 text/html`,
      `${now - 9} 95 192.168.1.25 TCP_MISS 4100 GET http://openai.com/research - DIRECT 200 text/html`
    ];

    fs.writeFileSync(COMPAT_LOG_FILE, sample.join('\n') + '\n', 'utf8');
  }
}

function readCompatLogLines() {
  ensureCompatAssets();
  const data = fs.readFileSync(COMPAT_LOG_FILE, 'utf8');
  return data.split(/\r?\n/).filter(Boolean);
}

function parseLogLine(line) {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 10) {
    return null;
  }

  const tsSeconds = Number(parts[0]);
  const timestamp = Number.isFinite(tsSeconds) && tsSeconds > 0 ? tsSeconds * 1000 : Date.now();
  const ip = parts[2];
  const bytes = Number(parts[4]) || 0;
  const url = parts[6];
  const status = parts[9];

  let domain = url;
  try {
    domain = new URL(url).hostname;
  } catch (_err) {
    const slashParts = url.split('/');
    domain = slashParts.length > 2 ? slashParts[2] : url;
  }

  return { timestamp, ip, bytes, url, domain, status, raw: line };
}

function getParsedCompatEntries() {
  return readCompatLogLines().map(parseLogLine).filter(Boolean);
}

function getBlockedDomains() {
  ensureCompatAssets();
  const rows = fs.readFileSync(BLOCKED_FILE, 'utf8').split(/\r?\n/).map((row) => row.trim());
  return rows.filter(Boolean);
}

function writeBlockedDomains(domains) {
  ensureCompatAssets();
  fs.writeFileSync(BLOCKED_FILE, domains.join('\n') + (domains.length ? '\n' : ''), 'utf8');
}

function normalizeDomain(value) {
  return String(value || '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');
}

function isDomainBlocked(domain, blockedDomains) {
  const current = normalizeDomain(domain);
  if (!current) {
    return false;
  }

  for (const blocked of blockedDomains) {
    const rule = normalizeDomain(blocked);
    if (!rule) {
      continue;
    }
    if (current === rule || current.endsWith(`.${rule}`)) {
      return true;
    }
  }

  return false;
}

function isPlaceholderDomain(domain) {
  const current = normalizeDomain(domain);
  if (!current) {
    return true;
  }

  return current === 'example.com' || current.endsWith('.example.com') ||
    current === 'example.org' || current.endsWith('.example.org') ||
    current === 'example.net' || current.endsWith('.example.net') ||
    current === 'localhost';
}

function runCompatCommand(command, argument) {
  const entries = getParsedCompatEntries();
  const baseNotice = '[Compatibility mode] Windows runtime detected, using local dataset in data/access.log\n';

  if (command === 'start') {
    proxyServiceRunning = true;
    return { ok: true, code: 0, output: `${baseNotice}Proxy service state set to RUNNING (simulated).\n` };
  }

  if (command === 'stop') {
    proxyServiceRunning = false;
    return { ok: true, code: 0, output: `${baseNotice}Proxy service state set to STOPPED (simulated).\n` };
  }

  if (command === 'restart') {
    proxyServiceRunning = true;
    return { ok: true, code: 0, output: `${baseNotice}Proxy service restarted (simulated).\n` };
  }

  if (command === 'status') {
    return {
      ok: true,
      code: 0,
      output: `${baseNotice}Proxy service is ${proxyServiceRunning ? 'RUNNING' : 'STOPPED'} (simulated).\n`
    };
  }

  if (command === 'reload') {
    return { ok: true, code: 0, output: `${baseNotice}Configuration reload completed (simulated).\n` };
  }

  if (command === 'logs') {
    const lines = entries.slice(-20).map((entry) => entry.raw).join('\n');
    return { ok: true, code: 0, output: `${baseNotice}${lines}\n` };
  }

  if (command === 'top-users') {
    const counts = new Map();
    for (const entry of entries) {
      counts.set(entry.ip, (counts.get(entry.ip) || 0) + 1);
    }
    const rows = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ip, count]) => `${String(count).padStart(4, ' ')} requests | ${ip}`);

    return { ok: true, code: 0, output: `${baseNotice}Top Users:\n${rows.join('\n')}\n` };
  }

  if (command === 'top-sites') {
    const counts = new Map();
    for (const entry of entries) {
      counts.set(entry.domain, (counts.get(entry.domain) || 0) + 1);
    }
    const rows = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([domain, count]) => `${String(count).padStart(4, ' ')} visits | ${domain}`);

    return { ok: true, code: 0, output: `${baseNotice}Top Sites:\n${rows.join('\n')}\n` };
  }

  if (command === 'status-codes') {
    const counts = new Map();
    for (const entry of entries) {
      counts.set(entry.status, (counts.get(entry.status) || 0) + 1);
    }
    const rows = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([status, count]) => `${String(count).padStart(4, ' ')} | HTTP ${status}`);

    return { ok: true, code: 0, output: `${baseNotice}Status Codes:\n${rows.join('\n')}\n` };
  }

  if (command === 'traffic') {
    const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
    const avg = entries.length ? Math.round(totalBytes / entries.length) : 0;
    const totalMb = (totalBytes / (1024 * 1024)).toFixed(2);
    return {
      ok: true,
      code: 0,
      output: `${baseNotice}Total traffic: ${totalMb} MB\nAverage request size: ${avg} bytes\n`
    };
  }

  if (command === 'stats') {
    const userCount = new Set(entries.map((entry) => entry.ip)).size;
    const domainCount = new Set(entries.map((entry) => entry.domain)).size;
    return {
      ok: true,
      code: 0,
      output:
        `${baseNotice}Summary Statistics:\n` +
        `  Total Requests: ${entries.length}\n` +
        `  Unique Users: ${userCount}\n` +
        `  Unique Domains: ${domainCount}\n`
    };
  }

  if (command === 'block') {
    const domains = getBlockedDomains();
    if (!domains.includes(argument)) {
      domains.push(argument);
      writeBlockedDomains(domains);
    }
    return { ok: true, code: 0, output: `${baseNotice}Blocked domain saved: ${argument}\n` };
  }

  if (command === 'unblock') {
    const domains = getBlockedDomains().filter((domain) => domain !== argument);
    writeBlockedDomains(domains);
    return { ok: true, code: 0, output: `${baseNotice}Unblocked domain removed: ${argument}\n` };
  }

  if (command === 'blocked') {
    const domains = getBlockedDomains();
    if (!domains.length) {
      return { ok: true, code: 0, output: `${baseNotice}No blocked domains.\n` };
    }

    const rows = domains.map((domain, index) => `${index + 1}. ${domain}`);
    return { ok: true, code: 0, output: `${baseNotice}Blocked domains:\n${rows.join('\n')}\n` };
  }

  if (command === 'search') {
    const query = String(argument || '').toLowerCase();
    const hits = entries.filter((entry) => entry.raw.toLowerCase().includes(query));
    const rows = hits.slice(-20).map((entry) => entry.raw).join('\n');
    return {
      ok: true,
      code: 0,
      output: `${baseNotice}Matches found: ${hits.length}\n${rows}${hits.length ? '\n' : ''}`
    };
  }

  if (command === 'backup') {
    ensureCompatAssets();
    fs.copyFileSync(CONFIG_FILE, BACKUP_FILE);
    return { ok: true, code: 0, output: `${baseNotice}Backup created at data/squid.conf.backup\n` };
  }

  if (command === 'restore') {
    ensureCompatAssets();
    if (!fs.existsSync(BACKUP_FILE)) {
      return { ok: false, code: 1, output: `${baseNotice}Backup not found. Run backup first.\n` };
    }
    fs.copyFileSync(BACKUP_FILE, CONFIG_FILE);
    return { ok: true, code: 0, output: `${baseNotice}Configuration restored from backup.\n` };
  }

  if (command === 'version') {
    return {
      ok: true,
      code: 0,
      output: `${baseNotice}ProxyWatch v1.0.0\nCompatibility mode active\n`
    };
  }

  if (command === 'help') {
    return {
      ok: true,
      code: 0,
      output:
        `${baseNotice}Commands: start, stop, restart, status, reload, logs, top-users, top-sites, ` +
        `status-codes, traffic, stats, search, block, unblock, blocked, backup, restore, live, monitor\n`
    };
  }

  return {
    ok: false,
    code: 1,
    output: `${baseNotice}Unsupported command in compatibility mode: ${command}\n`
  };
}

function startCompatStream(command, res) {
  const entries = getParsedCompatEntries();
  let index = 0;

  res.write('data: [Compatibility mode] Live stream from local data/access.log\n\n');

  const timer = setInterval(() => {
    if (!entries.length) {
      res.write('data: No log entries found in compatibility dataset.\n\n');
      return;
    }

    const entry = entries[index % entries.length];
    index += 1;
    const now = new Date().toTimeString().slice(0, 8);

    if (command === 'monitor') {
      res.write(`data: [${now}] ${entry.ip} -> ${entry.domain} | ${entry.bytes} bytes | HTTP ${entry.status}\n\n`);
      return;
    }

    res.write(`data: [${now}] ${entry.ip} -> ${entry.url} (${entry.bytes} bytes) ${entry.status}\n\n`);
  }, 1200);

  return () => clearInterval(timer);
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, num));
}

function buildTelemetryFromEvents(events, points, windowMs) {
  const now = Date.now();
  const windowStart = now - windowMs;
  const windowEvents = events.filter((evt) => evt.timestamp >= windowStart);

  const totalRequests = windowEvents.length;
  const totalBytes = windowEvents.reduce((sum, evt) => sum + (evt.bytes || 0), 0);
  const uniqueUsers = new Set(windowEvents.map((evt) => evt.ip)).size;
  const uniqueDomains = new Set(windowEvents.map((evt) => evt.domain)).size;

  const statusCounts = {};
  const domainCounts = new Map();
  const legalDomainCounts = new Map();
  const userCounts = new Map();
  const blockedDomains = getBlockedDomains();
  for (const evt of windowEvents) {
    statusCounts[evt.status] = (statusCounts[evt.status] || 0) + 1;
    domainCounts.set(evt.domain, (domainCounts.get(evt.domain) || 0) + 1);
    if (!isDomainBlocked(evt.domain, blockedDomains) && !isPlaceholderDomain(evt.domain)) {
      legalDomainCounts.set(evt.domain, (legalDomainCounts.get(evt.domain) || 0) + 1);
    }
    userCounts.set(evt.ip, (userCounts.get(evt.ip) || 0) + 1);
  }

  const topDomain = [...domainCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const topLegalDomain = [...legalDomainCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const topUser = [...userCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const recent = windowEvents.slice(-6).map((evt) => evt.raw);

  const seconds = Math.max(1, Math.round(windowMs / 1000));
  const rate = {
    rps: Number((totalRequests / seconds).toFixed(2)),
    bps: Math.round(totalBytes / seconds)
  };

  return {
    ts: now,
    windowSec: seconds,
    totals: {
      requests: totalRequests,
      bytes: totalBytes,
      uniqueUsers,
      uniqueDomains
    },
    rate,
    top: {
      domain: topDomain,
      legalDomain: topLegalDomain,
      user: topUser
    },
    statusCounts,
    recent,
    points
  };
}

app.get('/api/telemetry/snapshot', (req, res) => {
  const windowSec = clampNumber(req.query.windowSec, 10, 300, 60);
  const pointsMax = clampNumber(req.query.points, 30, 240, 60);

  const entries = getParsedCompatEntries();
  const now = Date.now();
  const windowMs = windowSec * 1000;

  const recentEvents = entries
    .slice(-Math.max(pointsMax, 80))
    .map((entry) => ({ ...entry, timestamp: now }));

  const points = recentEvents.slice(-pointsMax).map((evt, idx) => ({
    t: now - (pointsMax - idx - 1) * 1000,
    requests: 1,
    bytes: evt.bytes || 0
  }));

  res.json(buildTelemetryFromEvents(recentEvents, points, windowMs));
});

app.get('/api/telemetry/stream', (req, res) => {
  const windowSec = clampNumber(req.query.windowSec, 10, 300, 60);
  const intervalMs = clampNumber(req.query.intervalMs, 400, 5000, 1000);
  const pointsMax = clampNumber(req.query.points, 30, 240, 60);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let entries = getParsedCompatEntries();
  let cursor = 0;
  const events = [];
  const points = [];
  const windowMs = windowSec * 1000;
  let tickCount = 0;

  res.write(`event: telemetry\n`);
  res.write(`data: ${JSON.stringify({ ok: true, message: 'telemetry stream connected' })}\n\n`);

  const timer = setInterval(() => {
    tickCount += 1;
    if (tickCount % 25 === 0) {
      entries = getParsedCompatEntries();
    }

    if (!entries.length) {
      res.write(`: keep-alive\n\n`);
      return;
    }

    const entry = entries[cursor % entries.length];
    cursor += 1;

    const now = Date.now();
    const evt = { ...entry, timestamp: now };
    events.push(evt);
    while (events.length && events[0].timestamp < now - windowMs) {
      events.shift();
    }

    points.push({ t: now, requests: 1, bytes: entry.bytes || 0 });
    while (points.length > pointsMax) {
      points.shift();
    }

    const payload = buildTelemetryFromEvents(events, points, windowMs);
    res.write(`event: telemetry\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }, intervalMs);

  req.on('close', () => {
    clearInterval(timer);
    if (!res.writableEnded) {
      res.end();
    }
  });
});

function getRuntimeStatus() {
  if (process.platform === 'linux') {
    return { ok: true, reason: 'Linux runtime detected' };
  }

  if (process.platform === 'win32') {
    try {
      const output = execFileSync('wsl.exe', ['--list', '--quiet'], {
        encoding: 'utf8'
      });

      if (output.trim().length === 0) {
        return {
          ok: false,
          reason: 'No WSL Linux distribution is installed'
        };
      }

      return {
        ok: false,
        reason: 'WSL detected, but commands are executed in Windows Node process'
      };
    } catch (_err) {
      return {
        ok: false,
        reason: 'WSL is unavailable on this machine'
      };
    }
  }

  return {
    ok: false,
    reason: `Unsupported platform for ProxyWatch shell scripts: ${process.platform}`
  };
}

app.get('/api/health', (_req, res) => {
  const runtime = getRuntimeStatus();
  res.json({
    ok: true,
    platform: process.platform,
    project: 'ProxyWatch',
    runtime,
    executionMode: runtime.ok ? 'linux-native' : 'windows-compatibility'
  });
});

app.get('/api/commands', (_req, res) => {
  res.json({ commands: SAFE_COMMANDS });
});

app.post('/api/run', (req, res) => {
  const { command, argument } = req.body || {};
  const validationError = validatePayload(command, argument);

  if (validationError) {
    res.status(400).json({ ok: false, error: validationError });
    return;
  }

  let output = '';
  const runtime = getRuntimeStatus();

  if (!runtime.ok) {
    const compatResult = runCompatCommand(command, argument);
    res.json(compatResult);
    return;
  }

  runProxywatch(
    command,
    argument,
    (chunk) => {
      output += chunk;
    },
    (code) => {
      res.json({ ok: code === 0, code, output });
    }
  );
});

app.get('/api/stream', (req, res) => {
  const command = String(req.query.command || 'live');
  const argument = String(req.query.argument || '').trim();

  const validationError = validatePayload(command, argument);
  if (validationError) {
    res.status(400).json({ ok: false, error: validationError });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const runtime = getRuntimeStatus();
  if (!runtime.ok) {
    const stopCompatStream = startCompatStream(command, res);

    req.on('close', () => {
      stopCompatStream();
      if (!res.writableEnded) {
        res.end();
      }
    });
    return;
  }

  const child = runProxywatch(
    command,
    argument,
    (chunk) => {
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.length > 0) {
          res.write(`data: ${line.replace(/\r/g, '')}\n\n`);
        }
      }
    },
    (code) => {
      res.write(`event: exit\n`);
      res.write(`data: ${code}\n\n`);
      res.end();
    }
  );

  req.on('close', () => {
    child.kill('SIGINT');
  });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function startServer(portToTry, retriesLeft = 10) {
  const server = app.listen(portToTry, HOST, () => {
    // Initialize auth configuration early so generated credentials are visible on boot.
    getAuthConfig();
    console.log(`ProxyWatch UI running on http://${HOST}:${portToTry}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && retriesLeft > 0) {
      const nextPort = portToTry + 1;
      console.log(`Port ${portToTry} is busy. Retrying on ${nextPort}...`);
      startServer(nextPort, retriesLeft - 1);
      return;
    }

    throw err;
  });
}

startServer(PORT);
