const API_BASE = ""; // same origin

function authHeader() {
  const u = sessionStorage.getItem("admin_user") || "";
  const p = sessionStorage.getItem("admin_pass") || "";
  if (!u) return {};
  return { Authorization: "Basic " + btoa(unescape(encodeURIComponent(u + ":" + p))) };
}

async function adminFetch(path, opts = {}) {
  const res = await fetch(API_BASE + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...authHeader(),
      ...(opts.headers || {})
    }
  });
  if (res.status === 401 || res.status === 403) {
    sessionStorage.removeItem("admin_user");
    sessionStorage.removeItem("admin_pass");
    location.reload();
    throw new Error("auth");
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || ("HTTP " + res.status));
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("json")) return res.json();
  return null;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ----- pages ----- */
async function pageDashboard() {
  let health = {}, users = [], students = [], inst = [];
  try { health = await adminFetch("/admin/health"); } catch (_) {}
  try { users = await adminFetch("/admin/users"); } catch (_) {}
  try { students = await adminFetch("/admin/students"); } catch (_) {}
  try {
    const r = await fetch(API_BASE + "/api/intezmenyek");
    if (r.ok) inst = await r.json();
  } catch (_) {}
  const uLen = Array.isArray(users) ? users.length : (users?.users?.length || 0);
  const sLen = Array.isArray(students) ? students.length : (students?.students?.length || 0);
  return `
    <div class="hello">Admin áttekintés</div>
    <p class="hello-sub">Rendszerállapot és gyors számok</p>
    <div class="stat-grid">
      <div class="stat"><b>${esc(health.status || health.ok || "—")}</b><span>Health</span></div>
      <div class="stat"><b>${uLen}</b><span>Felhasználók</span></div>
      <div class="stat"><b>${sLen}</b><span>Diákok</span></div>
      <div class="stat"><b>${Array.isArray(inst) ? inst.length : 0}</b><span>Intézmények</span></div>
    </div>
    <div class="card"><div class="card-title">API</div>
      <pre style="font-size:12px;color:var(--text-muted);white-space:pre-wrap">${esc(JSON.stringify(health, null, 2))}</pre>
    </div>`;
}

async function pageUsers() {
  let data;
  try { data = await adminFetch("/admin/users"); } catch (e) {
    return `<div class="card">Hiba: ${esc(e.message)}</div>`;
  }
  const list = Array.isArray(data) ? data : (data.users || data.items || []);
  const rows = list.map(u => {
    const id = u.id || u.ID || u.Uid || "";
    const name = u.username || u.Username || "";
    const role = u.role || u.Role || "";
    const active = u.active !== false && u.Active !== false;
    return `<tr>
      <td>${esc(name)}</td><td>${esc(role)}</td>
      <td>${active ? "aktív" : "inaktív"}</td>
      <td><button type="button" class="btn-ghost del-user" data-id="${esc(id)}" data-user="${esc(name)}">Törlés</button></td>
    </tr>`;
  }).join("") || `<tr><td colspan="4">Nincs felhasználó</td></tr>`;

  return `
    <div class="hello">Felhasználók</div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-title">Új user</div>
      <div class="toolbar">
        <input id="nuUser" placeholder="username" />
        <input id="nuPass" type="password" placeholder="jelszó" />
        <input id="nuStudent" placeholder="student_uid" />
        <select id="nuRole">
          <option value="Tanulo">Tanulo</option>
          <option value="Tanar">Tanar</option>
          <option value="Osztalyfonok">Osztalyfonok</option>
          <option value="Admin">Admin</option>
          <option value="Igazgato">Igazgato</option>
        </select>
        <button type="button" class="btn" id="nuBtn">Létrehozás</button>
      </div>
    </div>
    <div class="card table-wrap">
      <table class="admin-table">
        <thead><tr><th>User</th><th>Role</th><th>Státusz</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function bindUsers() {
  document.getElementById("nuBtn")?.addEventListener("click", async () => {
    try {
      await adminFetch("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          username: document.getElementById("nuUser").value,
          password: document.getElementById("nuPass").value,
          studentUid: document.getElementById("nuStudent").value,
          role: document.getElementById("nuRole").value
        })
      });
      navigate("users");
    } catch (e) { alert("Hiba: " + e.message); }
  });
  document.querySelectorAll(".del-user").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Törlöd: " + btn.dataset.user + "?")) return;
      try {
        const q = btn.dataset.id
          ? ("?id=" + encodeURIComponent(btn.dataset.id))
          : ("?username=" + encodeURIComponent(btn.dataset.user));
        await adminFetch("/admin/users" + q, { method: "DELETE" });
        navigate("users");
      } catch (e) { alert(e.message); }
    });
  });
}

async function pageStudents() {
  let data;
  try { data = await adminFetch("/admin/students"); } catch (e) {
    return `<div class="card">Hiba: ${esc(e.message)}</div>`;
  }
  const list = Array.isArray(data) ? data : (data.students || []);
  const rows = list.map(s => {
    const d = s.data || s;
    const uid = s.uid || s.Uid || d.Uid || "";
    const nev = d.Nev || d.nev || uid;
    return `<tr><td>${esc(uid)}</td><td>${esc(nev)}</td>
      <td><button type="button" class="btn-ghost del-st" data-uid="${esc(uid)}">Törlés</button></td></tr>`;
  }).join("") || `<tr><td colspan="3">Nincs diák</td></tr>`;
  return `
    <div class="hello">Diákok</div>
    <div class="card table-wrap">
      <table class="admin-table">
        <thead><tr><th>UID</th><th>Név</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function bindStudents() {
  document.querySelectorAll(".del-st").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Törlés?")) return;
      try {
        await adminFetch("/admin/students?uid=" + encodeURIComponent(btn.dataset.uid), { method: "DELETE" });
        navigate("students");
      } catch (e) { alert(e.message); }
    });
  });
}

async function pageInstitutions() {
  let list = [];
  try {
    const r = await fetch(API_BASE + "/api/intezmenyek");
    if (r.ok) list = await r.json();
  } catch (_) {}
  const rows = (Array.isArray(list) ? list : []).map(i =>
    `<tr><td>${esc(i.code)}</td><td>${esc(i.name)}</td><td>${esc(i.shortName || "")}</td></tr>`
  ).join("") || `<tr><td colspan="3">Nincs intézmény (futtasd a schema migrációt)</td></tr>`;
  return `
    <div class="hello">Intézmények</div>
    <p class="hello-sub">Forrás: GET /api/intezmenyek (Neon)</p>
    <div class="card table-wrap">
      <table class="admin-table">
        <thead><tr><th>Kód</th><th>Név</th><th>Rövid</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

async function pageClassgroups() {
  let data;
  try { data = await adminFetch("/admin/classgroups"); } catch (e) {
    return `<div class="card">Hiba: ${esc(e.message)}</div>`;
  }
  const list = Array.isArray(data) ? data : (data.classGroups || data.items || []);
  const rows = list.map(g => {
    const d = g.data || g;
    return `<tr><td>${esc(g.uid || d.Uid || "")}</td><td>${esc(d.Nev || d.Name || "")}</td></tr>`;
  }).join("") || `<tr><td colspan="2">Üres</td></tr>`;
  return `
    <div class="hello">Osztályok</div>
    <div class="card table-wrap">
      <table class="admin-table">
        <thead><tr><th>UID</th><th>Név</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

async function pageConfig() {
  let cfg = {};
  try { cfg = await adminFetch("/admin/config"); } catch (e) {
    return `<div class="card">Hiba: ${esc(e.message)}</div>`;
  }
  return `
    <div class="hello">Konfig</div>
    <div class="card">
      <pre style="font-size:12px;white-space:pre-wrap">${esc(JSON.stringify(cfg, null, 2))}</pre>
    </div>`;
}

async function pageHealth() {
  let h = {};
  try { h = await adminFetch("/admin/health"); } catch (e) {
    return `<div class="card">${esc(e.message)}</div>`;
  }
  return `<div class="hello">Health</div><div class="card"><pre style="font-size:12px">${esc(JSON.stringify(h, null, 2))}</pre></div>`;
}

async function pageDanger() {
  return `
    <div class="hello">Veszélyes műveletek</div>
    <div class="card">
      <p style="color:var(--text-muted);margin-bottom:14px">Adatbázis reset – csak fejlesztéshez.</p>
      <button type="button" class="btn" id="resetBtn" style="background:var(--danger);color:#fff">Reset (POST /admin/reset)</button>
    </div>`;
}

function bindDanger() {
  document.getElementById("resetBtn")?.addEventListener("click", async () => {
    if (!confirm("Biztosan reset?")) return;
    try {
      await adminFetch("/admin/reset", { method: "POST", body: "{}" });
      alert("Kész");
    } catch (e) { alert(e.message); }
  });
}

const PAGES = {
  dashboard: { title: "Áttekintés", render: pageDashboard },
  users: { title: "Felhasználók", render: pageUsers, bind: bindUsers },
  students: { title: "Diákok", render: pageStudents, bind: bindStudents },
  institutions: { title: "Intézmények", render: pageInstitutions },
  classgroups: { title: "Osztályok", render: pageClassgroups },
  config: { title: "Konfig", render: pageConfig },
  health: { title: "Health", render: pageHealth },
  danger: { title: "Veszélyes", render: pageDanger, bind: bindDanger }
};

async function navigate(page) {
  if (!PAGES[page]) page = "dashboard";
  document.querySelectorAll(".k-nav-item[data-page]").forEach(b => {
    b.classList.toggle("active", b.dataset.page === page);
  });
  document.getElementById("pageTitle").textContent = PAGES[page].title;
  const el = document.getElementById("pageContent");
  el.innerHTML = `<div class="loading">Betöltés…</div>`;
  try {
    el.innerHTML = await PAGES[page].render();
    PAGES[page].bind?.();
  } catch (e) {
    el.innerHTML = `<div class="card">Hiba: ${esc(e.message)}</div>`;
  }
  document.getElementById("sidebar")?.classList.remove("open");
  document.getElementById("overlay").style.display = "none";
}

function showApp() {
  document.getElementById("loginView").style.display = "none";
  document.getElementById("appShell").style.display = "grid";
  navigate("dashboard");
}

document.getElementById("loginBtn")?.addEventListener("click", async () => {
  const u = document.getElementById("admUser").value.trim();
  const p = document.getElementById("admPass").value;
  sessionStorage.setItem("admin_user", u);
  sessionStorage.setItem("admin_pass", p);
  try {
    await adminFetch("/admin/health");
    document.getElementById("loginErr").style.display = "none";
    showApp();
  } catch (_) {
    sessionStorage.removeItem("admin_user");
    sessionStorage.removeItem("admin_pass");
    document.getElementById("loginErr").style.display = "block";
  }
});

document.getElementById("logoutBtn")?.addEventListener("click", () => {
  sessionStorage.clear();
  location.reload();
});

document.querySelectorAll(".k-nav-item[data-page]").forEach(btn => {
  btn.addEventListener("click", () => navigate(btn.dataset.page));
});

document.getElementById("menuBtn")?.addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("overlay").style.display =
    document.getElementById("sidebar").classList.contains("open") ? "block" : "none";
});
document.getElementById("overlay")?.addEventListener("click", () => {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("overlay").style.display = "none";
});

if (sessionStorage.getItem("admin_user")) {
  adminFetch("/admin/health").then(showApp).catch(() => {
    sessionStorage.clear();
  });
}
