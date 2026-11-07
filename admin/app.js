const API_BASE = "https://edukreta.onrender.com"; // same origin

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
    list = await adminFetch("/admin/institutions");
  } catch (_) {
    try {
      const r = await fetch(API_BASE + "/api/intezmenyek");
      if (r.ok) list = await r.json();
    } catch (__) {}
  }
  const rows = (Array.isArray(list) ? list : []).map(i =>
    `<tr><td>${esc(i.code)}</td><td>${esc(i.name)}</td><td>${esc(i.shortName || "")}</td><td>${i.active === false ? "inaktív" : "aktív"}</td></tr>`
  ).join("") || `<tr><td colspan="4">Nincs intézmény</td></tr>`;
  return `
    <div class="hello">Intézmények</div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-title">Új intézmény (IntezményLétrehozó mezők)</div>
      <div class="toolbar" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px">
        <input id="instCode" placeholder="Intézménykód *" />
        <input id="instName" placeholder="Intézmény név *" />
        <input id="instShort" placeholder="Rövid / település" />
        <input id="instOm" placeholder="OM kód" />
        <input id="instVezeto" placeholder="Intézményvezető" />
        <input id="instEmail" placeholder="Email" />
        <input id="instMegye" placeholder="Megye" />
        <input id="instIrsz" placeholder="Irányítószám" />
        <input id="instTelepules" placeholder="Település" />
        <input id="instCim" placeholder="Közterület" />
        <input id="instTanev" placeholder="Aktív tanév (2024/2025)" />
        <button type="button" class="btn" id="instCreateBtn">Létrehozás</button>
      </div>
      <p class="hello-sub" style="margin-top:10px">Bulk: POST /admin/institutions JSON tömb, ugyanazokkal a mezőkkel (intezmenyKod, intezmenyNev, …)</p>
    </div>
    <div class="card table-wrap">
      <table class="admin-table">
        <thead><tr><th>Kód</th><th>Név</th><th>Rövid</th><th>Státusz</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function bindInstitutions() {
  document.getElementById("instCreateBtn")?.addEventListener("click", async () => {
    const intezmenyKod = document.getElementById("instCode").value.trim();
    const intezmenyNev = document.getElementById("instName").value.trim();
    const shortName = document.getElementById("instShort").value.trim();
    if (!intezmenyKod || !intezmenyNev) { alert("Intézménykód és név kötelező"); return; }
    const body = {
      intezmenyKod,
      intezmenyNev,
      shortName,
      omKod: document.getElementById("instOm")?.value.trim() || "",
      intezmenyVezeto: document.getElementById("instVezeto")?.value.trim() || "",
      emailCim: document.getElementById("instEmail")?.value.trim() || "",
      megye: document.getElementById("instMegye")?.value.trim() || "",
      iranyitoszam: document.getElementById("instIrsz")?.value.trim() || "",
      telepules: document.getElementById("instTelepules")?.value.trim() || shortName,
      kozterulet: document.getElementById("instCim")?.value.trim() || "",
      aktivTanev: document.getElementById("instTanev")?.value.trim() || ""
    };
    try {
      await adminFetch("/admin/institutions", {
        method: "POST",
        body: JSON.stringify(body)
      });
      navigate("institutions");
    } catch (e) { alert("Hiba: " + e.message); }
  });
}

async function pageClassgroups() {
  let data;
  try { data = await adminFetch("/admin/classgroups"); } catch (e) {
    return `<div class="card">Hiba: ${esc(e.message)}</div>`;
  }
  const list = Array.isArray(data) ? data : (data.classGroups || data.items || []);
  const rows = list.map(g => {
    const d = g.data || g;
    const uid = g.uid || d.Uid || "";
    const nev = d.Nev || d.Name || "";
    return `<tr>
      <td>${esc(uid)}</td><td>${esc(nev)}</td>
      <td><button type="button" class="btn-ghost del-cg" data-uid="${esc(uid)}">Törlés</button></td>
    </tr>`;
  }).join("") || `<tr><td colspan="3">Üres</td></tr>`;
  return `
    <div class="hello">Osztályok</div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-title">Új osztály</div>
      <div class="toolbar">
        <input id="cgUid" placeholder="UID (opcionális)" />
        <input id="cgNev" placeholder="Név (pl. 9.A)" />
        <input id="cgTipus" placeholder="Típus (opcionális)" />
        <button type="button" class="btn" id="cgCreateBtn">Létrehozás</button>
      </div>
    </div>
    <div class="card table-wrap">
      <table class="admin-table">
        <thead><tr><th>UID</th><th>Név</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function bindClassgroups() {
  document.getElementById("cgCreateBtn")?.addEventListener("click", async () => {
    const Uid = document.getElementById("cgUid").value.trim();
    const Nev = document.getElementById("cgNev").value.trim();
    const Tipus = document.getElementById("cgTipus").value.trim();
    if (!Nev) { alert("Név kötelező"); return; }
    try {
      await adminFetch("/admin/classgroups", {
        method: "POST",
        body: JSON.stringify({ Uid, Nev, Tipus })
      });
      navigate("classgroups");
    } catch (e) { alert("Hiba: " + e.message); }
  });
  document.querySelectorAll(".del-cg").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Törlöd az osztályt?")) return;
      try {
        await adminFetch("/admin/classgroups?uid=" + encodeURIComponent(btn.dataset.uid), { method: "DELETE" });
        navigate("classgroups");
      } catch (e) { alert(e.message); }
    });
  });
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


async function pageKir() {
  return `
    <div class="hello">KIR kérelem</div>
    <p class="hello-sub">Mock KIR login + kérelem beküldés / státusz (SOAP vagy JSON)</p>

    <div class="card" style="margin-bottom:16px">
      <div class="card-title">Token kérése</div>
      <div class="toolbar">
        <button type="button" class="btn" id="kirTokenBtn">Token generálás</button>
        <code id="kirTokenOut" style="font-size:12px;word-break:break-all"></code>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-title">Kérelem beküldése</div>
      <div class="toolbar" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px">
        <input id="kirExtId" placeholder="externalId (opcionális)" />
        <input id="kirKontener" placeholder="kontenerId (opcionális)" />
        <input id="kirIar" placeholder="IAR azonosító" />
        <input id="kirCel" placeholder="Cél szolgáltatás" />
      </div>
      <textarea id="kirXml" rows="4" style="width:100%;margin:10px 0;border-radius:12px;padding:10px;background:var(--bg-elevated);border:1px solid var(--border);color:inherit" placeholder="Kerelem XML (opcionális)"></textarea>
      <button type="button" class="btn" id="kirSendBtn">Beküldés</button>
      <pre id="kirSendOut" style="margin-top:12px;font-size:12px;white-space:pre-wrap"></pre>
    </div>

    <div class="card">
      <div class="card-title">Státusz lekérdezés</div>
      <div class="toolbar">
        <input id="kirStatusExt" placeholder="externalId" />
        <input id="kirStatusKont" placeholder="kontenerId" />
        <button type="button" class="btn" id="kirStatusBtn">Lekérdezés</button>
      </div>
      <pre id="kirStatusOut" style="margin-top:12px;font-size:12px;white-space:pre-wrap"></pre>
    </div>`;
}

function bindKir() {
  const base = typeof API_BASE !== "undefined" ? API_BASE : "";
  document.getElementById("kirTokenBtn")?.addEventListener("click", async () => {
    try {
      const r = await fetch(base + "/kir/token", { method: "POST" });
      const j = await r.json();
      document.getElementById("kirTokenOut").textContent = j.access_token || JSON.stringify(j);
    } catch (e) {
      document.getElementById("kirTokenOut").textContent = String(e);
    }
  });
  document.getElementById("kirSendBtn")?.addEventListener("click", async () => {
    const body = {
      externalId: document.getElementById("kirExtId").value.trim(),
      kontenerId: document.getElementById("kirKontener").value.trim(),
      iarAzonosito: document.getElementById("kirIar").value.trim(),
      celSzolgaltatas: document.getElementById("kirCel").value.trim(),
      kerelemXml: document.getElementById("kirXml").value
    };
    try {
      const r = await fetch(base + "/kir/kerelem/bekuldes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const j = await r.json();
      document.getElementById("kirSendOut").textContent = JSON.stringify(j, null, 2);
      if (j.externalId) document.getElementById("kirStatusExt").value = j.externalId;
      if (j.kontenerId) document.getElementById("kirStatusKont").value = j.kontenerId;
    } catch (e) {
      document.getElementById("kirSendOut").textContent = String(e);
    }
  });
  document.getElementById("kirStatusBtn")?.addEventListener("click", async () => {
    const body = {
      externalId: document.getElementById("kirStatusExt").value.trim(),
      kontenerId: document.getElementById("kirStatusKont").value.trim()
    };
    try {
      const r = await fetch(base + "/kir/kerelem/statusz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      document.getElementById("kirStatusOut").textContent = JSON.stringify(await r.json(), null, 2);
    } catch (e) {
      document.getElementById("kirStatusOut").textContent = String(e);
    }
  });
}

async function pageSzir() {
  return `
    <div class="hello">SZIR – KSH 2535</div>
    <p class="hello-sub">Státusz lekérdezés és adatszolgáltatás (mock)</p>

    <div class="card" style="margin-bottom:16px">
      <div class="card-title">Státusz</div>
      <div class="toolbar">
        <input id="szirInst" placeholder="Intézményazonosító" value="demo" />
        <input id="szirTanev" placeholder="Tanév ID" value="2025" />
        <button type="button" class="btn" id="szirStatusBtn">Státusz lekérése</button>
      </div>
      <pre id="szirStatusOut" style="margin-top:12px;font-size:12px;white-space:pre-wrap"></pre>
    </div>

    <div class="card">
      <div class="card-title">Adatszolgáltatás küldése</div>
      <div class="toolbar">
        <input id="szirAdatInst" placeholder="Intézményazonosító" value="demo" />
        <input id="szirAdatTanev" placeholder="Tanév ID" value="2025" />
        <input id="szirAdatAllapot" placeholder="Státusz állapot" value="1" />
        <button type="button" class="btn" id="szirSendBtn">Küldés</button>
      </div>
      <pre id="szirSendOut" style="margin-top:12px;font-size:12px;white-space:pre-wrap"></pre>
    </div>`;
}

function bindSzir() {
  const base = typeof API_BASE !== "undefined" ? API_BASE : "";
  document.getElementById("szirStatusBtn")?.addEventListener("click", async () => {
    const body = {
      IntezmenyAzonosito: document.getElementById("szirInst").value.trim(),
      TanevId: Number(document.getElementById("szirTanev").value) || 2025
    };
    try {
      const r = await fetch(base + "/szirstat/external/ksh2535/statusz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      document.getElementById("szirStatusOut").textContent = JSON.stringify(await r.json(), null, 2);
    } catch (e) {
      document.getElementById("szirStatusOut").textContent = String(e);
    }
  });
  document.getElementById("szirSendBtn")?.addEventListener("click", async () => {
    const body = {
      IntezmenyAzonosito: document.getElementById("szirAdatInst").value.trim(),
      TanevId: Number(document.getElementById("szirAdatTanev").value) || 2025,
      StatuszAllapot: Number(document.getElementById("szirAdatAllapot").value) || 1,
      FeladatEllatasiHelyek: []
    };
    try {
      const r = await fetch(base + "/szirstat/external/ksh2535/adatszolg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      document.getElementById("szirSendOut").textContent = JSON.stringify(await r.json(), null, 2);
    } catch (e) {
      document.getElementById("szirSendOut").textContent = String(e);
    }
  });
}


const PAGES = {
  dashboard: { title: "Áttekintés", render: pageDashboard },
  users: { title: "Felhasználók", render: pageUsers, bind: bindUsers },
  students: { title: "Diákok", render: pageStudents, bind: bindStudents },
  institutions: { title: "Intézmények", render: pageInstitutions, bind: bindInstitutions },
  classgroups: { title: "Osztályok", render: pageClassgroups, bind: bindClassgroups },
  config: { title: "Konfig", render: pageConfig },
  kir: { title: "KIR kérelem", render: pageKir, bind: bindKir },
  szir: { title: "SZIR (KSH)", render: pageSzir, bind: bindSzir },
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
