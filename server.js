const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const readline = require("node:readline");
const Database = require("better-sqlite3");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATABASE_PATH = path.resolve(ROOT, process.env.DATABASE_PATH || "data/portfolio.sqlite");
const MAX_BODY_BYTES = 64 * 1024;
const SESSION_DAYS = 7;
const STATUSES = ["New", "Contacted", "Discussing", "Quoted", "Accepted", "Rejected", "Completed"];
const PROJECT_STATUSES = ["Planning", "In Progress", "Review", "Completed"];
const PAYMENT_STATUSES = ["Pending", "Partially Paid", "Paid"];
const db = initializeDatabase();
const loginAttempts = new Map();
const enquiryAttempts = new Map();

function initializeDatabase() {
  fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });
  const database = new Database(DATABASE_PATH);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      phone TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      last_contact_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS enquiries (
      id INTEGER PRIMARY KEY,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      service TEXT NOT NULL,
      project_type TEXT NOT NULL DEFAULT '',
      project_description TEXT NOT NULL,
      timeline TEXT NOT NULL DEFAULT '',
      budget TEXT NOT NULL DEFAULT '',
      conversation_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'New',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      enquiry_id INTEGER REFERENCES enquiries(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      service TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      start_date TEXT,
      deadline TEXT,
      status TEXT NOT NULL DEFAULT 'Planning',
      quoted_amount REAL NOT NULL DEFAULT 0,
      final_amount REAL NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'Pending',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      amount REAL NOT NULL CHECK(amount > 0),
      payment_date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id_hash TEXT PRIMARY KEY,
      admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
      csrf_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS enquiries_created_idx ON enquiries(created_at);
    CREATE INDEX IF NOT EXISTS enquiries_status_idx ON enquiries(status);
    CREATE INDEX IF NOT EXISTS projects_created_idx ON projects(created_at);
    CREATE INDEX IF NOT EXISTS payments_date_idx ON payments(payment_date);
    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
  `);
  const hasAdmin = database.prepare("SELECT 1 FROM admins LIMIT 1").get();
  if (!hasAdmin && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD_HASH) {
    const emailAddress = String(process.env.ADMIN_EMAIL).trim().toLowerCase();
    const hash = String(process.env.ADMIN_PASSWORD_HASH).trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress) && /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/.test(hash)) {
      database.prepare("INSERT INTO admins (email, password_hash) VALUES (?, ?)").run(emailAddress, hash);
      console.log("First admin account created from server environment configuration.");
    } else {
      console.error("Admin bootstrap settings are invalid. Generate a scrypt hash with `node server.js hash-password`.");
    }
  }
  return database;
}

function json(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders
  });
  response.end(JSON.stringify(payload));
}

function cookieOptions(request) {
  const secure = process.env.NODE_ENV === "production" || request.socket.encrypted;
  return `Path=/; SameSite=Strict${secure ? "; Secure" : ""}`;
}

function setCookie(response, request, name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, cookieOptions(request)];
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  const existing = response.getHeader("Set-Cookie");
  response.setHeader("Set-Cookie", [...(Array.isArray(existing) ? existing : existing ? [existing] : []), parts.join("; ")]);
}

function clearCookie(response, request, name, httpOnly = false) {
  setCookie(response, request, name, "", { httpOnly, maxAge: 0 });
}

function parseCookies(request) {
  const result = {};
  for (const entry of String(request.headers.cookie || "").split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    try {
      result[entry.slice(0, separator).trim()] = decodeURIComponent(entry.slice(separator + 1).trim());
    } catch {
      continue;
    }
  }
  return result;
}

function keyedHash(value) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function sameHash(left, right) {
  const a = Buffer.from(left || "");
  const b = Buffer.from(right || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    let tooLarge = false;
    request.on("data", (chunk) => {
      length += chunk.length;
      if (length > MAX_BODY_BYTES) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (tooLarge) {
        reject(Object.assign(new Error("Request body is too large."), { statusCode: 413 }));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("Invalid JSON request."), { statusCode: 400 }));
      }
    });
    request.on("error", reject);
  });
}

function text(value, label, maxLength, required = false) {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  const normalized = value.trim();
  if (required && !normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maxLength) throw new Error(`${label} is too long.`);
  return normalized;
}

function email(value, label = "Email") {
  const normalized = text(value, label, 254, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error(`${label} must be valid.`);
  return normalized;
}

function amount(value, label, optional = false) {
  if (optional && (value === undefined || value === null || value === "")) return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000000000) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return Math.round(parsed * 100) / 100;
}

function date(value, label, optional = true) {
  if (optional && !value) return null;
  const normalized = text(value, label, 10, true);
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new Error(`${label} must be a valid date.`);
  }
  return normalized;
}

function enumValue(value, allowed, label, fallback) {
  const selected = value || fallback;
  if (!allowed.includes(selected)) throw new Error(`${label} is invalid.`);
  return selected;
}

function parseConversation(value) {
  let entries = value;
  if (typeof entries === "string") {
    try { entries = JSON.parse(entries); } catch { entries = []; }
  }
  if (!Array.isArray(entries)) return [];
  if (entries.length > 100) throw new Error("Conversation has too many messages.");
  return entries.map((message) => {
    if (!message || !["assistant", "visitor"].includes(message.author)) throw new Error("Conversation contains an invalid message.");
    return {
      author: message.author,
      text: text(message.text, "Message", 2000, true),
      time: text(message.time, "Message time", 40)
    };
  });
}

function upsertClient({ name, email: clientEmail, phone = "" }) {
  const normalizedName = text(name, "Client name", 120, true);
  const normalizedEmail = email(clientEmail);
  const normalizedPhone = text(phone, "Phone", 60);
  db.prepare(`
    INSERT INTO clients (name, email, phone, last_contact_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(email) DO UPDATE SET
      name = excluded.name,
      phone = CASE WHEN excluded.phone <> '' THEN excluded.phone ELSE clients.phone END,
      last_contact_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `).run(normalizedName, normalizedEmail, normalizedPhone);
  return db.prepare("SELECT id FROM clients WHERE email = ? COLLATE NOCASE").get(normalizedEmail).id;
}

function validateEnquiry(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid enquiry.");
  const clientName = text(payload.name, "Name", 120, true);
  const clientEmail = email(payload.email);
  const service = text(payload.service, "Service", 160, true);
  const description = text(payload.projectDescription, "Project description", 4000, true);
  const conversation = parseConversation(payload.conversation);
  if (conversation.length < 1) throw new Error("Conversation is required.");
  return {
    name: clientName,
    email: clientEmail,
    phone: text(payload.phone, "Phone", 60),
    service,
    projectType: text(payload.projectType || service, "Project type", 240),
    projectDescription: description,
    timeline: text(payload.timeline, "Timeline", 160),
    budget: text(payload.budget, "Budget", 160),
    conversation
  };
}

function saveEnquiry(payload) {
  const enquiry = validateEnquiry(payload);
  const save = db.transaction(() => {
    const clientId = upsertClient(enquiry);
    const result = db.prepare(`
      INSERT INTO enquiries (
        client_id, name, email, phone, service, project_type, project_description,
        timeline, budget, conversation_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      clientId, enquiry.name, enquiry.email, enquiry.phone, enquiry.service, enquiry.projectType,
      enquiry.projectDescription, enquiry.timeline, enquiry.budget, JSON.stringify(enquiry.conversation)
    );
    return { ...enquiry, clientId, id: Number(result.lastInsertRowid) };
  });
  return save();
}

function loginRateAllowed(request) {
  const key = request.socket.remoteAddress || "unknown";
  const now = Date.now();
  const recent = (loginAttempts.get(key) || []).filter((stamp) => now - stamp < 15 * 60 * 1000);
  if (recent.length >= 10) return false;
  recent.push(now);
  loginAttempts.set(key, recent);
  return true;
}

function requestRateAllowed(request, attempts, limit, windowMs) {
  const key = request.socket.remoteAddress || "unknown";
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  attempts.set(key, recent);
  return true;
}

function verifyPassword(password, stored) {
  const [scheme, salt, expected] = String(stored).split("$");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  return sameHash(actual.toString("hex"), expected);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `scrypt$${salt}$${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

function adminFromRequest(request) {
  const cookies = parseCookies(request);
  const sessionId = cookies.portfolio_session;
  if (!sessionId) return null;
  let idHash;
  try { idHash = keyedHash(sessionId); } catch { return null; }
  const session = db.prepare(`
    SELECT sessions.id_hash, sessions.admin_id, sessions.csrf_hash, sessions.expires_at, admins.email
    FROM sessions JOIN admins ON admins.id = sessions.admin_id
    WHERE sessions.id_hash = ? AND sessions.expires_at > ?
  `).get(idHash, Date.now());
  if (!session) return null;
  return { ...session, sessionId, cookies };
}

function csrfMatches(request, admin) {
  const token = String(request.headers["x-csrf-token"] || "");
  const cookie = admin ? admin.cookies.portfolio_csrf : parseCookies(request).portfolio_csrf;
  if (!token || !cookie || !sameHash(token, cookie)) return false;
  if (admin && !sameHash(keyedHash(token), admin.csrf_hash)) return false;
  return true;
}

function createSession(request, response, adminId) {
  const sessionId = crypto.randomBytes(32).toString("base64url");
  const csrf = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  const expires = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
  db.prepare("INSERT INTO sessions (id_hash, admin_id, csrf_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(keyedHash(sessionId), adminId, keyedHash(csrf), expires, now);
  setCookie(response, request, "portfolio_session", sessionId, { httpOnly: true, maxAge: SESSION_DAYS * 86400 });
  setCookie(response, request, "portfolio_csrf", csrf, { maxAge: SESSION_DAYS * 86400 });
  return csrf;
}

function clearSession(request, response, admin) {
  if (admin) db.prepare("DELETE FROM sessions WHERE id_hash = ?").run(admin.id_hash);
  clearCookie(response, request, "portfolio_session", true);
  clearCookie(response, request, "portfolio_csrf");
}

function requireSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return ["https:", "http:"].includes(parsed.protocol) && parsed.host === request.headers.host;
  } catch {
    return false;
  }
}

function requireAdmin(request, response, methodNeedsCsrf = false) {
  const admin = adminFromRequest(request);
  if (!admin) {
    json(response, 401, { error: "Authentication required." });
    return null;
  }
  if (methodNeedsCsrf && (!requireSameOrigin(request) || !csrfMatches(request, admin))) {
    json(response, 403, { error: "Invalid request token." });
    return null;
  }
  db.prepare("UPDATE sessions SET expires_at = ? WHERE id_hash = ?")
    .run(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000, admin.id_hash);
  return admin;
}

function paymentState(projectId, finalAmount) {
  const received = db.prepare("SELECT COALESCE(SUM(amount), 0) AS amount FROM payments WHERE project_id = ?").get(projectId).amount;
  if (received <= 0) return "Pending";
  return received >= finalAmount && finalAmount > 0 ? "Paid" : "Partially Paid";
}

function updateProjectPaymentStatus(projectId) {
  const project = db.prepare("SELECT final_amount, quoted_amount FROM projects WHERE id = ?").get(projectId);
  if (!project) return;
  const due = project.final_amount || project.quoted_amount;
  db.prepare("UPDATE projects SET payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(paymentState(projectId, due), projectId);
}

function projectInput(payload, existing = {}) {
  return {
    name: text(payload.name ?? existing.name, "Project name", 180, true),
    service: text(payload.service ?? existing.service, "Service", 160, true),
    description: text(payload.description ?? existing.description, "Description", 4000),
    startDate: date(payload.startDate ?? existing.start_date, "Start date"),
    deadline: date(payload.deadline ?? existing.deadline, "Deadline"),
    status: enumValue(payload.status ?? existing.status, PROJECT_STATUSES, "Project status", "Planning"),
    quotedAmount: amount(payload.quotedAmount ?? existing.quoted_amount, "Quoted amount", true),
    finalAmount: amount(payload.finalAmount ?? existing.final_amount, "Final amount", true),
    notes: text(payload.notes ?? existing.notes, "Notes", 4000),
    clientId: payload.clientId === undefined ? existing.client_id || null : (payload.clientId ? Number(payload.clientId) : null),
    enquiryId: payload.enquiryId === undefined ? existing.enquiry_id || null : (payload.enquiryId ? Number(payload.enquiryId) : null)
  };
}

function createProject(payload) {
  const input = projectInput(payload);
  const transaction = db.transaction(() => {
    if (input.clientId && !db.prepare("SELECT id FROM clients WHERE id = ?").get(input.clientId)) throw new Error("Client not found.");
    if (input.enquiryId && !db.prepare("SELECT id FROM enquiries WHERE id = ?").get(input.enquiryId)) throw new Error("Enquiry not found.");
    const result = db.prepare(`
      INSERT INTO projects (
        client_id, enquiry_id, name, service, description, start_date, deadline,
        status, quoted_amount, final_amount, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(input.clientId, input.enquiryId, input.name, input.service, input.description,
      input.startDate, input.deadline, input.status, input.quotedAmount, input.finalAmount, input.notes);
    const id = Number(result.lastInsertRowid);
    if (input.enquiryId) {
      db.prepare("UPDATE enquiries SET status = 'Accepted', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(input.enquiryId);
      const enquiry = db.prepare("SELECT client_id, name, email, phone FROM enquiries WHERE id = ?").get(input.enquiryId);
      if (!input.clientId && enquiry.client_id) {
        db.prepare("UPDATE projects SET client_id = ? WHERE id = ?").run(enquiry.client_id, id);
      }
    }
    updateProjectPaymentStatus(id);
    return id;
  });
  return transaction();
}

function listEnquiries(url) {
  const where = [];
  const values = [];
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");
  const service = url.searchParams.get("service");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (search) {
    where.push("(enquiries.name LIKE ? OR enquiries.email LIKE ? OR enquiries.service LIKE ? OR enquiries.project_description LIKE ?)");
    const pattern = `%${search.slice(0, 120)}%`;
    values.push(pattern, pattern, pattern, pattern);
  }
  if (status && STATUSES.includes(status)) { where.push("enquiries.status = ?"); values.push(status); }
  if (service) { where.push("enquiries.service = ?"); values.push(service.slice(0, 160)); }
  if (from) { where.push("date(enquiries.created_at) >= date(?)"); values.push(date(from, "Start date", false)); }
  if (to) { where.push("date(enquiries.created_at) <= date(?)"); values.push(date(to, "End date", false)); }
  const query = `
    SELECT enquiries.*, clients.name AS client_name
    FROM enquiries LEFT JOIN clients ON clients.id = enquiries.client_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY enquiries.created_at DESC LIMIT 300
  `;
  return db.prepare(query).all(...values).map((row) => ({ ...row, conversation: JSON.parse(row.conversation_json) }));
}

function listProjects(url) {
  const where = [];
  const values = [];
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");
  const paymentStatusFilter = url.searchParams.get("paymentStatus");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (search) {
    const pattern = `%${search.slice(0, 120)}%`;
    where.push("(projects.name LIKE ? OR clients.name LIKE ? OR clients.email LIKE ? OR projects.service LIKE ?)");
    values.push(pattern, pattern, pattern, pattern);
  }
  if (status === "Active") where.push("projects.status <> 'Completed'");
  else if (status && PROJECT_STATUSES.includes(status)) { where.push("projects.status = ?"); values.push(status); }
  if (paymentStatusFilter && PAYMENT_STATUSES.includes(paymentStatusFilter)) { where.push("projects.payment_status = ?"); values.push(paymentStatusFilter); }
  if (from) { where.push("date(projects.created_at) >= date(?)"); values.push(date(from, "Start date", false)); }
  if (to) { where.push("date(projects.created_at) <= date(?)"); values.push(date(to, "End date", false)); }
  return db.prepare(`
    SELECT projects.*, clients.name AS client_name, clients.email AS client_email,
      COALESCE((SELECT SUM(amount) FROM payments WHERE payments.project_id = projects.id), 0) AS amount_received
    FROM projects LEFT JOIN clients ON clients.id = projects.client_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY projects.created_at DESC LIMIT 300
  `).all(...values);
}

function overview() {
  const counts = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM enquiries) AS totalEnquiries,
      (SELECT COUNT(*) FROM enquiries WHERE status = 'New') AS newEnquiries,
      (SELECT COUNT(*) FROM projects WHERE status <> 'Completed') AS activeProjects,
      (SELECT COUNT(*) FROM projects WHERE status = 'Completed') AS completedProjects,
      (SELECT COALESCE(SUM(CASE WHEN final_amount > 0 THEN final_amount ELSE quoted_amount END), 0) FROM projects) AS totalEarnings,
      (SELECT COALESCE(SUM(amount), 0) FROM payments) AS totalReceived
  `).get();
  const pendingPayments = db.prepare(`
    SELECT COALESCE(SUM(MAX(0, CASE WHEN final_amount > 0 THEN final_amount ELSE quoted_amount END - received)), 0) AS amount
    FROM (
      SELECT projects.final_amount, projects.quoted_amount,
        COALESCE((SELECT SUM(amount) FROM payments WHERE payments.project_id = projects.id), 0) AS received
      FROM projects
    )
  `).get().amount;
  return { ...counts, totalEarnings: Number(counts.totalEarnings), totalReceived: Number(counts.totalReceived), pendingPayments: Number(pendingPayments) };
}

function analytics() {
  const enquiryTrend = db.prepare(`
    SELECT substr(created_at, 1, 7) AS month, COUNT(*) AS count
    FROM enquiries GROUP BY month ORDER BY month DESC LIMIT 6
  `).all().reverse();
  const projectTrend = db.prepare(`
    SELECT substr(created_at, 1, 7) AS month, COUNT(*) AS count
    FROM projects GROUP BY month ORDER BY month DESC LIMIT 6
  `).all().reverse();
  const earningsTrend = db.prepare(`
    SELECT substr(payment_date, 1, 7) AS month, SUM(amount) AS amount
    FROM payments GROUP BY month ORDER BY month DESC LIMIT 6
  `).all().reverse();
  const services = db.prepare(`
    SELECT service, COUNT(*) AS count FROM enquiries GROUP BY service ORDER BY count DESC, service LIMIT 8
  `).all();
  const statuses = db.prepare(`
    SELECT status, COUNT(*) AS count FROM projects GROUP BY status ORDER BY status
  `).all();
  const totals = db.prepare("SELECT (SELECT COUNT(*) FROM enquiries) AS enquiries, (SELECT COUNT(*) FROM projects) AS projects").get();
  return {
    enquiryTrend, projectTrend, earningsTrend, services, statuses,
    conversionRate: totals.enquiries ? Math.round((totals.projects / totals.enquiries) * 1000) / 10 : 0,
    hasData: totals.enquiries > 0 || totals.projects > 0
  };
}

async function sendEnquiryEmail(enquiry) {
  const { CONTACT_EMAIL, CONTACT_FROM, RESEND_API_KEY } = process.env;
  if (!CONTACT_EMAIL || !CONTACT_FROM || !RESEND_API_KEY) {
    const error = new Error("Email delivery is not configured.");
    error.statusCode = 503;
    throw error;
  }
  const transcript = enquiry.conversation
    .map(({ author, text: message, time }) => `[${time}] ${author === "visitor" ? enquiry.name : "Sanjivani"}: ${message}`)
    .join("\n");
  const message = [
    "NEW PORTFOLIO ENQUIRY", "",
    `Name: ${enquiry.name}`, `Email: ${enquiry.email}`, `Phone: ${enquiry.phone || "Not provided"}`,
    `Service: ${enquiry.service}`, `Project Description: ${enquiry.projectDescription}`,
    `Timeline: ${enquiry.timeline}`, `Budget: ${enquiry.budget}`, "",
    "Conversation:", transcript, "", `Date/Time: ${new Date().toISOString()}`
  ].join("\n");
  const result = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: CONTACT_FROM, to: [CONTACT_EMAIL], reply_to: enquiry.email, subject: "New portfolio enquiry", text: message }),
    signal: AbortSignal.timeout(10000)
  });
  if (!result.ok) throw Object.assign(new Error(`Email provider returned status ${result.status}.`), { statusCode: 502 });
}

function readAdminPage(response) {
  const file = fs.readFileSync(path.join(ROOT, "admin.html"));
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": "text/html; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  });
  response.end(file);
}

async function handleAdminApi(request, response, pathname, url) {
  if (pathname === "/api/admin/session" && request.method === "GET") {
    const admin = adminFromRequest(request);
    if (admin) {
      let csrf = admin.cookies.portfolio_csrf;
      if (!csrf || !sameHash(keyedHash(csrf), admin.csrf_hash)) {
        csrf = crypto.randomBytes(32).toString("base64url");
        db.prepare("UPDATE sessions SET csrf_hash = ? WHERE id_hash = ?").run(keyedHash(csrf), admin.id_hash);
        setCookie(response, request, "portfolio_csrf", csrf, { maxAge: SESSION_DAYS * 86400 });
      }
      json(response, 200, { authenticated: true, admin: { email: admin.email }, csrf });
      return;
    }
    const csrf = crypto.randomBytes(32).toString("base64url");
    setCookie(response, request, "portfolio_csrf", csrf);
    const configured = Boolean(db.prepare("SELECT 1 FROM admins LIMIT 1").get());
    json(response, 200, { authenticated: false, configured, csrf });
    return;
  }

  if (pathname === "/api/admin/login" && request.method === "POST") {
    if (!requireSameOrigin(request)) { json(response, 403, { error: "Request origin is not allowed." }); return; }
    const cookies = parseCookies(request);
    const body = await readBody(request);
    if (!body.csrf || !sameHash(String(body.csrf), cookies.portfolio_csrf)) {
      json(response, 403, { error: "Invalid login token." });
      return;
    }
    if (!loginRateAllowed(request)) { json(response, 429, { error: "Too many sign-in attempts. Try again in 15 minutes." }); return; }
    const adminEmail = email(body.email);
    const password = text(body.password, "Password", 256, true);
    const admin = db.prepare("SELECT id, email, password_hash FROM admins WHERE email = ? COLLATE NOCASE").get(adminEmail);
    if (!admin || !verifyPassword(password, admin.password_hash)) {
      json(response, 401, { error: "Email or password is incorrect." });
      return;
    }
    const csrf = createSession(request, response, admin.id);
    json(response, 200, { authenticated: true, admin: { email: admin.email }, csrf });
    return;
  }

  const currentAdmin = adminFromRequest(request);
  if (pathname === "/api/admin/logout" && request.method === "POST") {
    if (!requireSameOrigin(request) || !csrfMatches(request, currentAdmin)) {
      json(response, 403, { error: "Invalid request token." });
      return;
    }
    clearSession(request, response, currentAdmin);
    json(response, 200, { success: true });
    return;
  }

  const changesData = ["POST", "PATCH", "DELETE"].includes(request.method);
  const admin = requireAdmin(request, response, changesData);
  if (!admin) return;

  if (pathname === "/api/admin/overview" && request.method === "GET") { json(response, 200, overview()); return; }
  if (pathname === "/api/admin/analytics" && request.method === "GET") { json(response, 200, analytics()); return; }
  if (pathname === "/api/admin/enquiries" && request.method === "GET") { json(response, 200, listEnquiries(url)); return; }

  if (pathname === "/api/admin/enquiries" && request.method === "POST") {
    const body = await readBody(request);
    const enquiry = validateEnquiry({ ...body, conversation: body.conversation || [{ author: "visitor", text: body.projectDescription, time: new Date().toLocaleTimeString() }] });
    const clientId = db.transaction(() => {
      const id = upsertClient(enquiry);
      db.prepare(`
        INSERT INTO enquiries (client_id, name, email, phone, service, project_type, project_description, timeline, budget, conversation_json, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, enquiry.name, enquiry.email, enquiry.phone, enquiry.service, enquiry.projectType, enquiry.projectDescription,
        enquiry.timeline, enquiry.budget, JSON.stringify(enquiry.conversation), enumValue(body.status, STATUSES, "Enquiry status", "New"));
      return id;
    })();
    json(response, 201, { success: true, clientId });
    return;
  }

  const enquiryMatch = pathname.match(/^\/api\/admin\/enquiries\/(\d+)$/);
  if (enquiryMatch && request.method === "PATCH") {
    const body = await readBody(request);
    const status = enumValue(body.status, STATUSES, "Enquiry status");
    const update = db.prepare("UPDATE enquiries SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status, Number(enquiryMatch[1]));
    if (!update.changes) { json(response, 404, { error: "Enquiry not found." }); return; }
    if (status !== "New") {
      db.prepare("UPDATE clients SET last_contact_at = CURRENT_TIMESTAMP WHERE id = (SELECT client_id FROM enquiries WHERE id = ?)").run(Number(enquiryMatch[1]));
    }
    json(response, 200, { success: true });
    return;
  }

  if (pathname === "/api/admin/clients" && request.method === "GET") {
    const search = url.searchParams.get("search");
    const pattern = `%${(search || "").slice(0, 120)}%`;
    const clients = db.prepare(`
      SELECT clients.*,
        (SELECT COUNT(*) FROM projects WHERE projects.client_id = clients.id) AS project_count,
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE payments.client_id = clients.id) AS total_earned
      FROM clients ${search ? "WHERE name LIKE ? OR email LIKE ?" : ""}
      ORDER BY updated_at DESC LIMIT 300
    `).all(...(search ? [pattern, pattern] : []));
    json(response, 200, clients);
    return;
  }

  if (pathname === "/api/admin/clients" && request.method === "POST") {
    const body = await readBody(request);
    const clientId = upsertClient({
      name: text(body.name, "Client name", 120, true),
      email: email(body.email),
      phone: text(body.phone, "Phone", 60)
    });
    db.prepare("UPDATE clients SET notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(text(body.notes, "Notes", 4000), clientId);
    json(response, 201, { id: clientId });
    return;
  }

  const clientMatch = pathname.match(/^\/api\/admin\/clients\/(\d+)$/);
  if (clientMatch && request.method === "PATCH") {
    const body = await readBody(request);
    const update = db.prepare(`
      UPDATE clients SET name = ?, email = ?, phone = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(text(body.name, "Client name", 120, true), email(body.email), text(body.phone, "Phone", 60),
      text(body.notes, "Notes", 4000), Number(clientMatch[1]));
    if (!update.changes) { json(response, 404, { error: "Client not found." }); return; }
    json(response, 200, { success: true });
    return;
  }

  if (pathname === "/api/admin/projects" && request.method === "GET") { json(response, 200, listProjects(url)); return; }
  if (pathname === "/api/admin/projects" && request.method === "POST") {
    const id = createProject(await readBody(request));
    json(response, 201, { id });
    return;
  }
  const projectMatch = pathname.match(/^\/api\/admin\/projects\/(\d+)$/);
  if (projectMatch && request.method === "PATCH") {
    const body = await readBody(request);
    const id = Number(projectMatch[1]);
    const existing = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
    if (!existing) { json(response, 404, { error: "Project not found." }); return; }
    const input = projectInput(body, existing);
    db.prepare(`
      UPDATE projects SET client_id = ?, enquiry_id = ?, name = ?, service = ?, description = ?,
        start_date = ?, deadline = ?, status = ?, quoted_amount = ?, final_amount = ?, notes = ?,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(input.clientId, input.enquiryId, input.name, input.service, input.description, input.startDate,
      input.deadline, input.status, input.quotedAmount, input.finalAmount, input.notes, id);
    db.prepare("UPDATE payments SET client_id = ? WHERE project_id = ?").run(input.clientId, id);
    updateProjectPaymentStatus(id);
    json(response, 200, { success: true });
    return;
  }

  if (pathname === "/api/admin/payments" && request.method === "GET") {
    const where = [];
    const values = [];
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const search = url.searchParams.get("search");
    if (from) { where.push("date(payments.payment_date) >= date(?)"); values.push(date(from, "Start date", false)); }
    if (to) { where.push("date(payments.payment_date) <= date(?)"); values.push(date(to, "End date", false)); }
    if (search) {
      const pattern = `%${search.slice(0, 120)}%`;
      where.push("(projects.name LIKE ? OR clients.name LIKE ? OR clients.email LIKE ?)");
      values.push(pattern, pattern, pattern);
    }
    const payments = db.prepare(`
      SELECT payments.*, projects.name AS project_name, clients.name AS client_name, clients.email AS client_email
      FROM payments JOIN projects ON projects.id = payments.project_id
      LEFT JOIN clients ON clients.id = payments.client_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY payments.payment_date DESC, payments.id DESC LIMIT 300
    `).all(...values);
    json(response, 200, payments);
    return;
  }
  if (pathname === "/api/admin/payments" && request.method === "POST") {
    const body = await readBody(request);
    const projectId = Number(body.projectId);
    const project = db.prepare("SELECT id, client_id FROM projects WHERE id = ?").get(projectId);
    if (!project) { json(response, 404, { error: "Project not found." }); return; }
    const value = amount(body.amount, "Payment amount");
    if (value <= 0) { json(response, 400, { error: "Payment amount must be greater than zero." }); return; }
    const paymentDate = date(body.paymentDate, "Payment date", false);
    const result = db.transaction(() => {
      const id = db.prepare("INSERT INTO payments (project_id, client_id, amount, payment_date, notes) VALUES (?, ?, ?, ?, ?)")
        .run(projectId, project.client_id, value, paymentDate, text(body.notes, "Notes", 2000));
      updateProjectPaymentStatus(projectId);
      return Number(id.lastInsertRowid);
    })();
    json(response, 201, { id: result });
    return;
  }

  json(response, 404, { error: "Admin endpoint not found." });
}

async function staticFile(response, pathname) {
  const files = new Map([
    ["/", ["index.html", "text/html; charset=utf-8"]],
    ["/index.html", ["index.html", "text/html; charset=utf-8"]],
    ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
    ["/script.js", ["script.js", "text/javascript; charset=utf-8"]],
    ["/admin", ["admin.html", "text/html; charset=utf-8"]],
    ["/admin/", ["admin.html", "text/html; charset=utf-8"]],
    ["/admin.html", ["admin.html", "text/html; charset=utf-8"]],
    ["/admin.css", ["admin.css", "text/css; charset=utf-8"]],
    ["/admin.js", ["admin.js", "text/javascript; charset=utf-8"]]
  ]);
  const asset = files.get(pathname);
  if (!asset) { json(response, 404, { error: "Not found." }); return; }
  const [file, contentType] = asset;
  const headers = {
    "Cache-Control": file === "admin.html" ? "no-store" : "no-cache",
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": "default-src 'self'; img-src 'self' https://images.unsplash.com data:; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  };
  response.writeHead(200, headers);
  response.end(await fs.promises.readFile(path.join(ROOT, file)));
}

async function handleRequest(request, response) {
  let url;
  try {
    url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const { pathname } = url;
    if (request.method === "GET" && pathname === "/api/contact") {
      json(response, 200, { email: process.env.CONTACT_EMAIL || null });
      return;
    }
    if (request.method === "POST" && pathname === "/api/enquiries") {
      if (!requireSameOrigin(request)) { json(response, 403, { error: "Request origin is not allowed." }); return; }
      if (!requestRateAllowed(request, enquiryAttempts, 5, 60 * 1000)) {
        json(response, 429, { error: "Too many enquiries. Please wait before trying again." });
        return;
      }
      if (!String(request.headers["content-type"] || "").includes("application/json")) {
        json(response, 415, { error: "Expected a JSON request." });
        return;
      }
      const payload = await readBody(request);
      const enquiry = saveEnquiry(payload);
      try {
        await sendEnquiryEmail(enquiry);
      } catch (error) {
        console.error("Enquiry saved in dashboard, but email delivery failed.", error);
        json(response, error.statusCode || 502, { error: "Enquiry saved, but email notification could not be delivered." });
        return;
      }
      json(response, 200, { success: true });
      return;
    }
    if (pathname === "/api/admin" || pathname.startsWith("/api/admin/")) {
      if (pathname !== "/api/admin/session" && pathname !== "/api/admin/login" && pathname !== "/api/admin/logout"
        && !String(request.headers["content-type"] || "").includes("application/json") && ["POST", "PATCH", "DELETE"].includes(request.method)) {
        json(response, 415, { error: "Expected a JSON request." });
        return;
      }
      await handleAdminApi(request, response, pathname, url);
      return;
    }
    if (pathname === "/admin" || pathname === "/admin/") {
      if (request.method !== "GET") { json(response, 405, { error: "Method not allowed." }); return; }
      await staticFile(response, "/admin");
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      json(response, 405, { error: "Method not allowed." });
      return;
    }
    await staticFile(response, pathname);
  } catch (error) {
    if (!response.headersSent && !response.destroyed) {
      const status = error.statusCode || 400;
      if (status >= 500) console.error("Portfolio server request failed.", error);
      json(response, status, { error: status >= 500 ? "Unable to process this request." : error.message });
    }
  }
}

function promptHidden(promptText) {
  return new Promise((resolve) => {
    process.stdout.write(promptText);
    if (!process.stdin.isTTY) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question("", (answer) => { rl.close(); resolve(answer); });
      return;
    }
    let value = "";
    const onData = (chunk) => {
      const character = chunk.toString();
      if (character === "\u0003") process.exit(1);
      if (character === "\r" || character === "\n") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(value);
      } else if (character === "\u007f" || character === "\b") {
        value = value.slice(0, -1);
      } else if (character >= " ") {
        value += character;
      }
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

async function printPasswordHash() {
  const password = await promptHidden("Enter a strong admin password (at least 12 characters): ");
  if (password.length < 12) {
    console.error("Password must be at least 12 characters.");
    process.exitCode = 1;
    return;
  }
  console.log(`ADMIN_PASSWORD_HASH=${hashPassword(password)}`);
}

function promptVisible(promptText) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(promptText, (answer) => { rl.close(); resolve(answer); });
  });
}

async function createAdmin() {
  const adminEmail = email(await promptVisible("Admin email: "));
  const password = await promptHidden("Choose admin password (at least 12 characters): ");
  if (password.length < 12) throw new Error("Password must be at least 12 characters.");
  db.prepare("INSERT INTO admins (email, password_hash) VALUES (?, ?)").run(adminEmail, hashPassword(password));
  console.log("Admin account created.");
}

async function resetAdminPassword() {
  const adminEmail = email(await promptVisible("Admin email to update: "));
  const password = await promptHidden("Choose new admin password (at least 12 characters): ");
  if (password.length < 12) throw new Error("Password must be at least 12 characters.");
  const result = db.prepare("UPDATE admins SET password_hash = ? WHERE email = ? COLLATE NOCASE").run(hashPassword(password), adminEmail);
  if (!result.changes) throw new Error("No admin account matches that email.");
  db.prepare("DELETE FROM sessions WHERE admin_id = (SELECT id FROM admins WHERE email = ? COLLATE NOCASE)").run(adminEmail);
  console.log("Password changed and existing sessions revoked.");
}

const command = process.argv[2];
if (command === "create-admin" || command === "reset-admin-password") {
  const operation = command === "create-admin" ? createAdmin : resetAdminPassword;
  operation().catch((error) => { console.error(error.message); process.exitCode = 1; });
} else if (command === "hash-password") {
  printPasswordHash().catch((error) => { console.error(error.message); process.exitCode = 1; });
} else {
  try {
    keyedHash("startup-validation");
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  const server = http.createServer(handleRequest);
  server.listen(PORT, () => console.log(`Portfolio server listening on http://localhost:${PORT}`));
}
