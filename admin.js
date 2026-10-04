const loginView = document.getElementById("loginView");
const dashboardView = document.getElementById("dashboardView");
const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const adminSidebar = document.getElementById("adminSidebar");
const viewContent = document.getElementById("viewContent");
const recordDialog = document.getElementById("recordDialog");
const dialogContent = document.getElementById("dialogContent");
const toastRegion = document.getElementById("toastRegion");
let csrfToken = "";
let currentAdmin = null;
let currentView = "dashboard";
let searchValue = "";
let statusFilter = "";
let serviceFilter = "";
let paymentFilter = "";
let dateFrom = "";
let dateTo = "";

const enquiryStatuses = ["New", "Contacted", "Discussing", "Quoted", "Accepted", "Rejected", "Completed"];
const projectStatuses = ["Planning", "In Progress", "Review", "Completed"];
const paymentStatuses = ["Pending", "Partially Paid", "Paid"];
const money = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function formatMoney(value) {
  return money.format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? escapeHtml(value) : dateFormat.format(parsed);
}

function statusClass(value) {
  return `status-${String(value || "").replace(/\s+/g, "-")}`;
}

function toast(message, isError = false) {
  const item = document.createElement("div");
  item.className = `toast${isError ? " error" : ""}`;
  item.textContent = message;
  toastRegion.append(item);
  window.setTimeout(() => item.remove(), 3500);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.method && options.method !== "GET") headers["X-CSRF-Token"] = csrfToken;
  const response = await fetch(`/api/admin${path}`, {
    ...options,
    headers,
    credentials: "same-origin",
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && currentAdmin) {
    currentAdmin = null;
    showLogin();
  }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

async function initialize() {
  try {
    const response = await fetch("/api/admin/session", { credentials: "same-origin" });
    if (!response.ok) throw new Error("Could not initialize a secure admin session.");
    const data = await response.json();
    csrfToken = data.csrf;
    if (data.authenticated) {
      currentAdmin = data.admin;
      showDashboard();
    } else {
      showLogin();
      const loginConfigured = data.configured;
      loginForm.hidden = !loginConfigured;
      document.getElementById("loginSetup").hidden = loginConfigured;
    }
  } catch (error) {
    showLogin();
    loginMessage.textContent = error.message;
    loginMessage.hidden = false;
  }
}

function showLogin() {
  loginView.hidden = false;
  dashboardView.hidden = true;
  document.body.classList.remove("is-authenticated");
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
  document.body.classList.add("is-authenticated");
  document.getElementById("adminEmail").textContent = currentAdmin.email;
  openView(currentView);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = loginForm.querySelector("button[type=submit]");
  loginMessage.hidden = true;
  submit.disabled = true;
  const form = new FormData(loginForm);
  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password"), csrf: csrfToken })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Sign in failed.");
    csrfToken = data.csrf;
    currentAdmin = data.admin;
    loginForm.reset();
    showDashboard();
  } catch (error) {
    loginMessage.textContent = error.message;
    loginMessage.hidden = false;
  } finally {
    submit.disabled = false;
  }
});

document.getElementById("logoutButton").addEventListener("click", async () => {
  try {
    await api("/logout", { method: "POST", body: {} });
  } catch (error) {
    toast(error.message, true);
  } finally {
    currentAdmin = null;
    csrfToken = "";
    showLogin();
  }
});

function openView(name, options = {}) {
  currentView = name;
  searchValue = "";
  statusFilter = "";
  serviceFilter = "";
  paymentFilter = "";
  dateFrom = "";
  dateTo = "";
  if (options.activeOnly) statusFilter = "Active";
  document.querySelectorAll(".sidebar-link[data-view]").forEach((link) => {
    link.classList.toggle("active", link.dataset.view === name);
  });
  document.getElementById("currentViewName").textContent = name.charAt(0).toUpperCase() + name.slice(1);
  adminSidebar.classList.remove("open");
  document.getElementById("mobileMenuToggle").setAttribute("aria-expanded", "false");
  document.getElementById("sidebarScrim").hidden = true;
  loadView(name);
}

document.querySelectorAll(".sidebar-link[data-view]").forEach((link) => {
  link.addEventListener("click", () => openView(link.dataset.view));
});

document.getElementById("mobileMenuToggle").addEventListener("click", () => {
  const open = adminSidebar.classList.toggle("open");
  document.getElementById("mobileMenuToggle").setAttribute("aria-expanded", String(open));
  document.getElementById("sidebarScrim").hidden = !open;
});

document.getElementById("sidebarScrim").addEventListener("click", () => {
  adminSidebar.classList.remove("open");
  document.getElementById("sidebarScrim").hidden = true;
  document.getElementById("mobileMenuToggle").setAttribute("aria-expanded", "false");
});

async function loadView(name) {
  viewContent.setAttribute("aria-busy", "true");
  try {
    if (name === "dashboard") await renderDashboard();
    else if (name === "enquiries") await renderEnquiries();
    else if (name === "clients") await renderClients();
    else if (name === "projects") await renderProjects();
    else if (name === "payments") await renderPayments();
    else if (name === "analytics") await renderAnalytics();
    else await renderSettings();
  } catch (error) {
    viewContent.innerHTML = `<section class="panel"><div class="empty-state"><span class="empty-icon">!</span><strong>Could not load this view</strong><p>${escapeHtml(error.message)}</p><button class="admin-button admin-button-soft" data-retry>Try again</button></div></section>`;
    viewContent.querySelector("[data-retry]").addEventListener("click", () => loadView(name));
  } finally {
    viewContent.removeAttribute("aria-busy");
  }
}

function pageHeading(title, subtitle, actions = "") {
  return `<div class="page-heading"><div><h1>${title}</h1><p>${subtitle}</p></div><div class="heading-actions">${actions}</div></div>`;
}

function emptyState(title, description, action = "") {
  return `<div class="empty-state"><span class="empty-icon" aria-hidden="true">✦</span><strong>${title}</strong><p>${description}</p>${action}</div>`;
}

function chartPercent(value, highest) {
  if (!value || !highest) return 0;
  return Math.max(5, Math.min(100, Math.round((value / highest) * 20) * 5));
}

function barChart(data, labelKey, valueKey) {
  if (!data.length) return emptyState("No analytics available yet.", "Chart data will appear when enquiries, projects or payments are recorded.");
  const highest = Math.max(...data.map((item) => Number(item[valueKey] || 0)), 1);
  return `<div class="bar-chart">${data.map((item) => {
    const value = Number(item[valueKey] || 0);
    return `<div class="bar-column" title="${escapeHtml(item[labelKey])}: ${escapeHtml(value)}"><strong>${escapeHtml(value)}</strong><div class="bar-track"><div class="bar-fill bar-pct-${chartPercent(value, highest)}"></div></div><small>${escapeHtml(item[labelKey])}</small></div>`;
  }).join("")}</div>`;
}

function serviceChart(data) {
  if (!data.length) return emptyState("No service insights yet.", "Service popularity will be calculated from real enquiries.");
  const highest = Math.max(...data.map((item) => item.count), 1);
  return `<div class="service-chart">${data.map((item) => `<div class="service-row"><span title="${escapeHtml(item.service)}">${escapeHtml(item.service)}</span><div class="service-track"><div class="service-fill bar-pct-${chartPercent(item.count, highest)}"></div></div><strong>${item.count}</strong></div>`).join("")}</div>`;
}

async function renderDashboard() {
  const [stats, enquiries, analytics] = await Promise.all([
    api("/overview"), api("/enquiries?status=New"), api("/analytics")
  ]);
  const formatCount = (value) => Number(value || 0).toLocaleString();
  document.getElementById("newEnquiryBadge").textContent = stats.newEnquiries || "";
  document.getElementById("newEnquiryBadge").hidden = !stats.newEnquiries;
  viewContent.innerHTML = `
    ${pageHeading("Good to see you, Sanjivani.", "A live overview of your creative studio.", `<button class="admin-button admin-button-primary" data-action="new-enquiry">＋ New Enquiry</button>`)}
    <section class="summary-grid" aria-label="Studio overview">
      <article class="summary-card"><span>TOTAL ENQUIRIES</span><strong>${formatCount(stats.totalEnquiries)}</strong><small>All received enquiries</small></article>
      <article class="summary-card"><span>NEW ENQUIRIES</span><strong>${formatCount(stats.newEnquiries)}</strong><small>Need your first response</small></article>
      <article class="summary-card"><span>ACTIVE PROJECTS</span><strong>${formatCount(stats.activeProjects)}</strong><small>Currently in progress</small></article>
      <article class="summary-card"><span>COMPLETED PROJECTS</span><strong>${formatCount(stats.completedProjects)}</strong><small>Marked complete</small></article>
      <article class="summary-card"><span>TOTAL EARNINGS</span><strong>${formatMoney(stats.totalEarnings)}</strong><small>Agreed project amounts</small></article>
      <article class="summary-card"><span>PENDING PAYMENTS</span><strong>${formatMoney(stats.pendingPayments)}</strong><small>Outstanding project balance</small></article>
    </section>
    <section class="dashboard-grid">
      <article class="panel"><div class="panel-heading"><div><h2>Enquiries over time</h2><p>Recorded from real submitted enquiries</p></div><button class="panel-link" data-view-link="analytics">All analytics →</button></div>${barChart(analytics.enquiryTrend, "month", "count")}</article>
      <article class="panel"><div class="panel-heading"><div><h2>Services requested</h2><p>Based on your enquiry records</p></div></div>${serviceChart(analytics.services)}</article>
    </section>
    <section class="quick-actions" aria-label="Quick actions">
      <button class="quick-action" data-action="new-enquiry"><span>＋</span>New Enquiry</button>
      <button class="quick-action" data-action="new-project"><span>＋</span>New Project</button>
      <button class="quick-action" data-action="new-payment"><span>＋</span>Add Payment</button>
      <button class="quick-action" data-view-link="enquiries"><span>✉</span>View New Enquiries</button>
      <button class="quick-action" data-view-link="projects" data-active-only><span>▦</span>View Active Projects</button>
    </section>
    <section class="panel stacked-panel"><div class="panel-heading"><div><h2>New enquiries</h2><p>Most recently received</p></div><button class="panel-link" data-view-link="enquiries">View all →</button></div>${enquiries.length ? enquiryTable(enquiries.slice(0, 5)) : emptyState("No enquiries yet.", "New visitor enquiries will appear here after they submit the website chat.")}</section>`;
  bindViewActions();
  bindQuickActions();
  bindEnquiryTable();
}

function enquiryTable(enquiries) {
  return `<div class="table-wrap"><table class="admin-table"><thead><tr><th>Client</th><th>Service</th><th>Project</th><th>Received</th><th>Status</th><th></th></tr></thead><tbody>${enquiries.map((item) => `
    <tr data-enquiry-row="${item.id}">
      <td data-label="Client"><span class="client-cell"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.email)}</small></span></td>
      <td data-label="Service">${escapeHtml(item.service)}</td>
      <td data-label="Project"><span class="table-description">${escapeHtml(item.project_description)}</span></td>
      <td data-label="Received">${formatDate(item.created_at)}</td>
      <td data-label="Status"><select class="status-select" data-enquiry-status="${item.id}" aria-label="Change enquiry status">${enquiryStatuses.map((status) => `<option ${status === item.status ? "selected" : ""}>${status}</option>`).join("")}</select></td>
      <td data-label="Details"><button class="panel-link" data-enquiry-detail="${item.id}">Open →</button></td>
    </tr>`).join("")}</tbody></table></div>`;
}

function filterToolbar(options = {}) {
  return `<div class="table-toolbar"><input class="search-input" type="search" placeholder="Search name, email, service…" value="${escapeHtml(searchValue)}" aria-label="Search records" />
  ${options.status ? `<label class="filter-control">Status <select data-filter="status"><option value="">All statuses</option>${(options.includeActive ? ["Active", ...options.status] : options.status).map((value) => `<option value="${escapeHtml(value)}" ${statusFilter === value ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}</select></label>` : ""}
  ${options.service ? `<label class="filter-control">Service <select data-filter="service"><option value="">All services</option>${options.service.map((value) => `<option ${serviceFilter === value ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}</select></label>` : ""}
  ${options.payment ? `<label class="filter-control">Payment <select data-filter="payment"><option value="">All payments</option>${paymentStatuses.map((value) => `<option ${paymentFilter === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>` : ""}
  ${options.date ? `<label class="filter-control">From <input type="date" data-filter="from" value="${escapeHtml(dateFrom)}"></label><label class="filter-control">To <input type="date" data-filter="to" value="${escapeHtml(dateTo)}"></label>` : ""}
  </div>`;
}

function bindFilters() {
  const search = viewContent.querySelector(".search-input");
  search?.addEventListener("input", () => {
    searchValue = search.value;
    clearTimeout(search.timer);
    search.timer = setTimeout(() => loadView(currentView), 250);
  });
  viewContent.querySelector('[data-filter="status"]')?.addEventListener("change", (event) => { statusFilter = event.target.value; loadView(currentView); });
  viewContent.querySelector('[data-filter="service"]')?.addEventListener("change", (event) => { serviceFilter = event.target.value; loadView(currentView); });
  viewContent.querySelector('[data-filter="payment"]')?.addEventListener("change", (event) => { paymentFilter = event.target.value; loadView(currentView); });
  viewContent.querySelector('[data-filter="from"]')?.addEventListener("change", (event) => { dateFrom = event.target.value; loadView(currentView); });
  viewContent.querySelector('[data-filter="to"]')?.addEventListener("change", (event) => { dateTo = event.target.value; loadView(currentView); });
}

function bindViewActions() {
  viewContent.querySelectorAll("[data-view-link]").forEach((button) => {
    button.addEventListener("click", () => openView(button.dataset.viewLink, { activeOnly: button.hasAttribute("data-active-only") }));
  });
}

function bindQuickActions() {
  viewContent.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.action === "new-enquiry") enquiryForm();
      if (button.dataset.action === "new-project") projectForm();
      if (button.dataset.action === "new-payment") paymentForm();
    });
  });
}

async function renderEnquiries() {
  const params = new URLSearchParams();
  if (searchValue) params.set("search", searchValue);
  if (statusFilter) params.set("status", statusFilter);
  if (serviceFilter) params.set("service", serviceFilter);
  if (dateFrom) params.set("from", dateFrom);
  if (dateTo) params.set("to", dateTo);
  const enquiries = await api(`/enquiries?${params}`);
  const services = [...new Set(enquiries.map((item) => item.service))].sort();
  viewContent.innerHTML = `${pageHeading("Enquiries", "Review submissions, follow up and move opportunities forward.", `<button class="admin-button admin-button-primary" data-action="new-enquiry">＋ New Enquiry</button>`)}${filterToolbar({ status: enquiryStatuses, service: services, date: true })}${enquiries.length ? enquiryTable(enquiries) : emptyState("No enquiries yet.", "When a visitor sends an enquiry, their details and chat transcript will be stored here.")}`;
  bindFilters();
  bindQuickActions();
  bindEnquiryTable();
}

function bindEnquiryTable() {
  viewContent.querySelectorAll("[data-enquiry-status]").forEach((select) => {
    select.addEventListener("change", async () => {
      try {
        await api(`/enquiries/${select.dataset.enquiryStatus}`, { method: "PATCH", body: { status: select.value } });
        toast("Enquiry status updated.");
      } catch (error) { toast(error.message, true); }
    });
  });
  viewContent.querySelectorAll("[data-enquiry-detail]").forEach((button) => {
    button.addEventListener("click", () => openEnquiryDetail(Number(button.dataset.enquiryDetail)));
  });
}

async function openEnquiryDetail(id) {
  const enquiry = (await api("/enquiries")).find((item) => item.id === id);
  if (!enquiry) { toast("Enquiry not found.", true); return; }
  dialogContent.innerHTML = `
    <h2 class="dialog-title" id="dialogTitle">${escapeHtml(enquiry.name)}</h2>
    <p class="dialog-description">${escapeHtml(enquiry.service)} · received ${formatDate(enquiry.created_at)}</p>
    <div class="detail-section">
      ${detailLine("Email", `<a href="mailto:${escapeHtml(enquiry.email)}">${escapeHtml(enquiry.email)}</a>`)}
      ${detailLine("Phone", escapeHtml(enquiry.phone || "Not provided"))}
      ${detailLine("Timeline", escapeHtml(enquiry.timeline || "Not specified"))}
      ${detailLine("Budget", escapeHtml(enquiry.budget || "Not specified"))}
      ${detailLine("Description", escapeHtml(enquiry.project_description))}
      ${detailLine("Status", `<span class="status-pill ${statusClass(enquiry.status)}">${escapeHtml(enquiry.status)}</span>`)}
    </div>
    <div class="detail-section"><strong class="detail-caption">Conversation</strong><div class="conversation-log">${enquiry.conversation.map((message) => `<div class="conversation-message"><strong>${message.author === "visitor" ? escapeHtml(enquiry.name) : "Portfolio welcome"} · ${escapeHtml(message.time)}</strong>${escapeHtml(message.text)}</div>`).join("") || "<p>No transcript stored.</p>"}</div></div>
    <div class="dialog-actions"><button class="admin-button admin-button-quiet" data-create-project-from-enquiry="${enquiry.id}">Create Project</button><button class="admin-button admin-button-primary" data-dialog-close>Done</button></div>`;
  recordDialog.showModal();
  dialogContent.querySelectorAll("[data-dialog-close]").forEach((button) => button.addEventListener("click", () => recordDialog.close()));
  dialogContent.querySelector("[data-create-project-from-enquiry]")?.addEventListener("click", () => projectForm(enquiry));
}

function detailLine(label, value) {
  return `<div class="detail-line"><span>${label}</span><div>${value}</div></div>`;
}

async function renderClients() {
  const params = new URLSearchParams();
  if (searchValue) params.set("search", searchValue);
  const clients = await api(`/clients?${params}`);
  viewContent.innerHTML = `${pageHeading("Clients", "Keep contact details and notes alongside active and past projects.", `<button class="admin-button admin-button-primary" data-new-client>＋ Add Client</button>`)}${filterToolbar()}${clients.length ? `<div class="data-grid">${clients.map((client) => `<article class="record-card"><div class="record-meta"><span class="status-pill">${client.project_count} project${client.project_count === 1 ? "" : "s"}</span><button class="panel-link" data-edit-client="${client.id}">Edit</button></div><h3>${escapeHtml(client.name)}</h3><p><a href="mailto:${escapeHtml(client.email)}">${escapeHtml(client.email)}</a>${client.phone ? `<br>${escapeHtml(client.phone)}` : ""}</p><div class="record-meta"><span>Payments received</span><strong>${formatMoney(client.total_earned)}</strong></div><p>${escapeHtml(client.notes || "No private notes.")}</p><small>Last contact ${formatDate(client.last_contact_at)}</small></article>`).join("")}</div>` : emptyState("No clients yet.", "Client records are created from enquiry submissions or can be added by you.")}`;
  bindFilters();
  viewContent.querySelector("[data-new-client]")?.addEventListener("click", () => clientForm());
  viewContent.querySelectorAll("[data-edit-client]").forEach((button) => button.addEventListener("click", () => clientForm(clients.find((client) => client.id === Number(button.dataset.editClient)))));
}

function clientForm(client = null) {
  showFormDialog(client ? "Update client" : "Add a client", `<div class="form-grid">
    <label>Client name<input name="name" required maxlength="120" value="${escapeHtml(client?.name || "")}"></label>
    <label>Email<input type="email" name="email" required maxlength="254" value="${escapeHtml(client?.email || "")}"></label>
    <label>Phone <small>Optional</small><input type="tel" name="phone" maxlength="60" value="${escapeHtml(client?.phone || "")}"></label>
    <label class="form-span">Private notes<textarea name="notes" maxlength="4000">${escapeHtml(client?.notes || "")}</textarea></label>
  </div>`, async (form) => {
    const body = Object.fromEntries(new FormData(form));
    await api(client ? `/clients/${client.id}` : "/clients", { method: client ? "PATCH" : "POST", body });
    toast(client ? "Client updated." : "Client added.");
    recordDialog.close();
    loadView("clients");
  });
}

async function renderProjects() {
  const params = new URLSearchParams();
  if (searchValue) params.set("search", searchValue);
  if (statusFilter) params.set("status", statusFilter);
  if (paymentFilter) params.set("paymentStatus", paymentFilter);
  if (dateFrom) params.set("from", dateFrom);
  if (dateTo) params.set("to", dateTo);
  const projects = await api(`/projects?${params}`);
  viewContent.innerHTML = `${pageHeading("Projects", "Track delivery, dates and payment status for every engagement.", `<button class="admin-button admin-button-primary" data-action="new-project">＋ New Project</button>`)}${filterToolbar({ status: projectStatuses, payment: true, date: true, includeActive: true })}${projects.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>Project</th><th>Client</th><th>Service</th><th>Deadline</th><th>Project status</th><th>Payment</th><th>Received</th></tr></thead><tbody>${projects.map((project) => `<tr><td data-label="Project"><span class="client-cell"><strong>${escapeHtml(project.name)}</strong><small>${formatMoney(project.final_amount || project.quoted_amount)} final / quoted</small></span></td><td data-label="Client">${escapeHtml(project.client_name || "Unassigned")}</td><td data-label="Service">${escapeHtml(project.service)}</td><td data-label="Deadline">${formatDate(project.deadline)}</td><td data-label="Project status"><select class="status-select" data-project-status="${project.id}" aria-label="Change project status">${projectStatuses.map((status) => `<option ${status === project.status ? "selected" : ""}>${status}</option>`).join("")}</select></td><td data-label="Payment"><span class="status-pill ${statusClass(project.payment_status)}">${escapeHtml(project.payment_status)}</span></td><td data-label="Received">${formatMoney(project.amount_received)}</td></tr>`).join("")}</tbody></table></div>` : emptyState("No active projects.", "Create a project from an accepted enquiry or add one to get started.")}`;
  bindFilters();
  bindQuickActions();
  viewContent.querySelectorAll("[data-project-status]").forEach((select) => select.addEventListener("change", async () => {
    try {
      await api(`/projects/${select.dataset.projectStatus}`, { method: "PATCH", body: { status: select.value } });
      toast("Project status updated.");
    } catch (error) { toast(error.message, true); }
  }));
}

async function projectForm(enquiry = null) {
  const [clients, enquiries] = await Promise.all([api("/clients"), api("/enquiries")]);
  showFormDialog("New Project", `<div class="form-grid">
    <label>Project name<input name="name" required maxlength="180" value="${escapeHtml(enquiry?.project_type || "")}"></label>
    <label>Service<input name="service" required maxlength="160" value="${escapeHtml(enquiry?.service || "")}"></label>
    <label>Client<select name="clientId"><option value="">Unassigned</option>${clients.map((client) => `<option value="${client.id}" ${client.id === enquiry?.client_id ? "selected" : ""}>${escapeHtml(client.name)} — ${escapeHtml(client.email)}</option>`).join("")}</select></label>
    <label>Related enquiry<select name="enquiryId"><option value="">None</option>${enquiries.map((item) => `<option value="${item.id}" ${item.id === enquiry?.id ? "selected" : ""}>#${item.id} · ${escapeHtml(item.name)} · ${escapeHtml(item.service)}</option>`).join("")}</select></label>
    <label>Start date<input name="startDate" type="date"></label><label>Deadline<input name="deadline" type="date"></label>
    <label>Status<select name="status">${projectStatuses.map((status) => `<option>${status}</option>`).join("")}</select></label>
    <label>Quoted amount<input name="quotedAmount" type="number" min="0" step="0.01" value="0"></label>
    <label>Final amount<input name="finalAmount" type="number" min="0" step="0.01" value="0"></label>
    <label class="form-span">Description<textarea name="description" maxlength="4000">${escapeHtml(enquiry?.project_description || "")}</textarea></label>
    <label class="form-span">Private notes<textarea name="notes" maxlength="4000"></textarea></label>
  </div>`, async (form) => {
    const raw = Object.fromEntries(new FormData(form));
    const body = { ...raw, clientId: raw.clientId || null, enquiryId: raw.enquiryId || null, quotedAmount: Number(raw.quotedAmount || 0), finalAmount: Number(raw.finalAmount || 0) };
    await api("/projects", { method: "POST", body });
    toast("Project created.");
    recordDialog.close();
    openView("projects");
  });
}

async function renderPayments() {
  const [payments, stats] = await Promise.all([api("/payments"), api("/overview")]);
  let filteredPayments = payments;
  const paymentParams = new URLSearchParams();
  if (searchValue) paymentParams.set("search", searchValue);
  if (dateFrom) paymentParams.set("from", dateFrom);
  if (dateTo) paymentParams.set("to", dateTo);
  if (searchValue || dateFrom || dateTo) filteredPayments = await api(`/payments?${paymentParams}`);
  viewContent.innerHTML = `${pageHeading("Payments", "Record project payments and keep outstanding balances visible.", `<button class="admin-button admin-button-primary" data-action="new-payment">＋ Add Payment</button>`)}
    <section class="summary-grid summary-grid-three"><article class="summary-card"><span>TOTAL PROJECT VALUE</span><strong>${formatMoney(stats.totalEarnings)}</strong></article><article class="summary-card"><span>TOTAL RECEIVED</span><strong>${formatMoney(stats.totalReceived)}</strong></article><article class="summary-card"><span>TOTAL PENDING</span><strong>${formatMoney(stats.pendingPayments)}</strong></article></section>
    ${filterToolbar({ date: true })}
    ${filteredPayments.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>Payment date</th><th>Client</th><th>Project</th><th>Amount</th><th>Notes</th></tr></thead><tbody>${filteredPayments.map((payment) => `<tr><td data-label="Payment date">${formatDate(payment.payment_date)}</td><td data-label="Client">${escapeHtml(payment.client_name || "—")}</td><td data-label="Project">${escapeHtml(payment.project_name)}</td><td data-label="Amount"><strong>${formatMoney(payment.amount)}</strong></td><td data-label="Notes">${escapeHtml(payment.notes || "—")}</td></tr>`).join("")}</tbody></table></div>` : emptyState("No payments recorded.", "Add a payment against a project to calculate received and pending totals.")}`;
  bindQuickActions();
  bindFilters();
}

async function paymentForm(projects = null) {
  projects ||= await api("/projects");
  if (!projects.length) {
    toast("Create a project before recording a payment.", true);
    return;
  }
  showFormDialog("Record a payment", `<div class="form-grid">
    <label class="form-span">Project<select name="projectId" required>${projects.map((project) => `<option value="${project.id}">${escapeHtml(project.name)} — ${escapeHtml(project.client_name || "Unassigned")} (${formatMoney(project.amount_received)} received)</option>`).join("")}</select></label>
    <label>Amount received<input type="number" name="amount" min="0.01" step="0.01" required></label>
    <label>Payment date<input type="date" name="paymentDate" required value="${new Date().toISOString().slice(0, 10)}"></label>
    <label class="form-span">Note<input name="notes" maxlength="2000" placeholder="Optional reference or note"></label>
  </div>`, async (form) => {
    const raw = Object.fromEntries(new FormData(form));
    await api("/payments", { method: "POST", body: { ...raw, projectId: Number(raw.projectId), amount: Number(raw.amount) } });
    toast("Payment recorded and project balance updated.");
    recordDialog.close();
    openView("payments");
  });
}

async function renderAnalytics() {
  const [data, stats] = await Promise.all([api("/analytics"), api("/overview")]);
  viewContent.innerHTML = `${pageHeading("Analytics", "Trends calculated only from your saved enquiries, projects and payments.")}
    ${data.hasData ? `<div class="analytics-grid">
      <article class="panel"><div class="panel-heading"><div><h2>Enquiries over time</h2><p>Counts by recorded month</p></div></div>${barChart(data.enquiryTrend, "month", "count")}</article>
      <article class="panel"><div class="panel-heading"><div><h2>Projects over time</h2><p>Counts by creation month</p></div></div>${barChart(data.projectTrend, "month", "count")}</article>
      <article class="panel"><div class="panel-heading"><div><h2>Earnings over time</h2><p>Payments received by month</p></div></div>${barChart(data.earningsTrend.map((item) => ({ ...item, amount: Math.round(item.amount * 100) / 100 })), "month", "amount")}</article>
      <article class="panel"><div class="panel-heading"><div><h2>Services requested</h2><p>From enquiry records</p></div></div>${serviceChart(data.services)}</article>
      <article class="panel"><div class="panel-heading"><div><h2>Project completion</h2><p>Saved project statuses</p></div></div>${serviceChart(data.statuses.map((item) => ({ service: item.status, count: item.count })))}</article>
      <article class="panel"><div class="panel-heading"><div><h2>Enquiry to project</h2><p>${stats.totalEnquiries} enquiries · ${stats.activeProjects + stats.completedProjects} projects</p></div></div><div class="conversion-stat">${data.conversionRate}%<small>recorded project-to-enquiry ratio</small></div></article>
    </div>` : emptyState("No analytics available yet.", "Analytics will appear here once real enquiries, projects and payments have been recorded.")}`;
}

async function renderSettings() {
  const contact = await fetch("/api/contact").then((response) => response.json());
  viewContent.innerHTML = `${pageHeading("Settings", "Studio workspace and privacy information.")}
    <section class="panel"><div class="panel-heading"><div><h2>Studio contact</h2><p>Public enquiries are routed to the configured inbox.</p></div></div>
      <div class="detail-section">${detailLine("Enquiry inbox", escapeHtml(contact.email || "Not configured"))}${detailLine("Signed in as", escapeHtml(currentAdmin.email))}${detailLine("Session", "Protected, HTTP-only, same-site cookie")}${detailLine("Business records", "Stored in the server-side SQLite database.")}</div>
    </section>
    <section class="panel stacked-panel"><div class="panel-heading"><div><h2>Admin account setup</h2><p>Use the private server terminal to create the first admin. Passwords are stored as scrypt hashes and never sent to the browser.</p></div></div><p class="settings-footnote">Keep <code>SESSION_SECRET</code>, <code>DATABASE_PATH</code>, and email credentials private in the server environment.</p></section>`;
}

function showFormDialog(title, fields, submit) {
  dialogContent.innerHTML = `<h2 class="dialog-title" id="dialogTitle">${title}</h2><p class="dialog-description">This information is stored privately in your studio database.</p><form id="recordForm" class="admin-form"><div class="form-grid">${fields}</div><p class="form-message" id="recordMessage" role="alert" hidden></p><div class="dialog-actions"><button type="button" class="admin-button admin-button-quiet" data-dialog-close>Cancel</button><button class="admin-button admin-button-primary" type="submit">Save</button></div></form>`;
  recordDialog.showModal();
  dialogContent.querySelector("[data-dialog-close]").addEventListener("click", () => recordDialog.close());
  const form = dialogContent.querySelector("#recordForm");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("[type=submit]");
    const message = form.querySelector("#recordMessage");
    button.disabled = true;
    message.hidden = true;
    try { await submit(form); }
    catch (error) { message.textContent = error.message; message.hidden = false; }
    finally { button.disabled = false; }
  });
}

function enquiryForm() {
  showFormDialog("Create an enquiry", `<label>Client name<input name="name" required maxlength="120"></label>
    <label>Email<input name="email" type="email" required maxlength="254"></label>
    <label>Phone <small>Optional</small><input name="phone" type="tel" maxlength="60"></label>
    <label>Service<input name="service" required maxlength="160"></label>
    <label>Timeline<input name="timeline" maxlength="160"></label>
    <label>Budget<input name="budget" maxlength="160"></label>
    <label class="form-span">Project description<textarea name="projectDescription" required maxlength="4000"></textarea></label>`, async (form) => {
    await api("/enquiries", { method: "POST", body: Object.fromEntries(new FormData(form)) });
    toast("Enquiry created.");
    recordDialog.close();
    loadView(currentView);
  });
}

recordDialog.addEventListener("click", (event) => {
  if (event.target === recordDialog) recordDialog.close();
});

initialize();
