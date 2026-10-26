/* ============================================================
   KRÁTA Admin – HTTP Basic Auth
   Iskolák, diák profilok, userek, konfig
   ============================================================ */

const API_BASE = "https://edukreta.onrender.com";
const SCHOOLS_KEY = "ujkreta_admin_schools";

const PAGE_META = {
  dashboard: "Áttekintés",
  schools: "Iskolák",
  students: "Tanulók",
  studentForm: "Diák profil",
  teachers: "Tanárok",
  users: "Felhasználók",
  config: "Konfig",
  tools: "Eszközök"
};

let basicUser = sessionStorage.getItem("admin_user") || "";
let basicPass = sessionStorage.getItem("admin_pass") || "";
let cache = { students: [], teacher: null, config: null, health: null, users: [] };
let editStudentUid = null;
let currentPage = "dashboard";

function authHeader() {
  return "Basic " + btoa(unescape(encodeURIComponent(basicUser + ":" + basicPass)));
}

async function api(path, opts = {}) {
  const headers = Object.assign(
    { Accept: "application/json", Authorization: authHeader() },
    opts.headers || {}
  );
  const res = await fetch(API_BASE + path, Object.assign({}, opts, { headers }));
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (res.status === 401) {
    clearAuth();
    showLogin("Hibás admin felhasználónév vagy jelszó.");
    throw new Error("401");
  }
  if (!res.ok) {
    let msg = "HTTP " + res.status;
    if (data) {
      if (typeof data === "string") msg = data;
      else msg = data.message || data.error_description || data.error || msg;
      if (data.message && data.error && data.message !== data.error) {
        msg = data.error + ": " + data.message;
      }
    }
    if (res.status === 405) {
      msg = "method_not_allowed – a szerveren nincs meg ez a művelet (deploy/old handler).";
    }
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

function clearAuth() {
  basicUser = "";
  basicPass = "";
  sessionStorage.removeItem("admin_user");
  sessionStorage.removeItem("admin_pass");
}

function saveAuth(u, p) {
  basicUser = u;
  basicPass = p;
  sessionStorage.setItem("admin_user", u);
  sessionStorage.setItem("admin_pass", p);
}

function getSchools() {
  try {
    const raw = localStorage.getItem(SCHOOLS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveSchools(list) {
  localStorage.setItem(SCHOOLS_KEY, JSON.stringify(list));
}

function ensureDefaultSchools(students) {
  let schools = getSchools();
  if (schools.length === 0) {
    schools = [{ code: "mockschool", name: "Mock Gimnázium" }];
  }
  const map = {};
  schools.forEach((s) => { map[s.code] = s; });
  (students || []).forEach((st) => {
    const code = st.IntezmenyAzonosito || st.Intezmeny?.Uid;
    const name = st.IntezmenyNev || st.Intezmeny?.RovidNev;
    if (code && !map[code]) {
      map[code] = { code, name: name || code };
      schools.push(map[code]);
    }
  });
  saveSchools(schools);
  return schools;
}

function esc(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function empty(t) {
  return `<div class="n-empty">${esc(t)}</div>`;
}

async function refreshData() {
  const [students, teacher, config, health, users] = await Promise.all([
    api("/admin/students").catch(() => api("/admin/student").then((s) => (s ? [s] : [])).catch(() => [])),
    api("/admin/teacher").catch(() => null),
    api("/admin/config").catch(() => null),
    api("/admin/health").catch(() => null),
    api("/admin/users").catch(() => [])
  ]);
  let stuList = Array.isArray(students) ? students : students ? [students] : [];
  try {
    const deleted = JSON.parse(localStorage.getItem("ujkreta_admin_deleted_students") || "[]");
    if (Array.isArray(deleted) && deleted.length) {
      stuList = stuList.filter((s) => !deleted.includes(String(s.Uid)));
    }
  } catch (_) {}
  cache.students = stuList;
  cache.teacher = teacher;
  cache.config = config;
  cache.health = health;
  cache.users = Array.isArray(users) ? users : [];
  ensureDefaultSchools(cache.students);
  if (teacher && teacher.Uid) {
    try { syncTeacherToLocal(teacher); } catch (_) {}
  }
  return cache;
}

/* ---------- pages ---------- */

function renderDashboard() {
  const schools = getSchools();
  const st = cache.students || [];
  const t = cache.teacher;
  return `
    <div class="n-welcome">
      <h2>Adminisztrációs felület</h2>
      <p>Iskolák, diák profilok, felhasználók és szerver beállítások.</p>
    </div>
    <div class="n-grid n-grid-4" style="margin-bottom:14px;">
      <div class="n-stat"><div class="n-stat-label">Iskolák</div><div class="n-stat-value">${schools.length}</div></div>
      <div class="n-stat"><div class="n-stat-label">Tanulók</div><div class="n-stat-value">${st.length}</div></div>
      <div class="n-stat"><div class="n-stat-label">Tanárok</div><div class="n-stat-value">${Math.max(getTeachersLocal().length, t && t.Uid ? 1 : 0)}</div></div>
      <div class="n-stat"><div class="n-stat-label">API</div><div class="n-stat-value" style="font-size:16px;">${cache.health ? "OK" : "?"}</div></div>
    </div>
    <div class="n-panel">
      <div class="n-panel-head">Gyors linkek</div>
      <div class="n-panel-body" style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" class="n-btn" data-go="schools">Iskolák</button>
        <button type="button" class="n-btn" data-go="students">Tanulók</button>
        <button type="button" class="n-btn" data-go="studentForm">Új diák</button>
        <button type="button" class="n-btn n-btn-secondary" data-go="users">Új felhasználó</button>
      </div>
    </div>
    <div class="n-panel">
      <div class="n-panel-head">Legutóbbi tanulók</div>
      <div class="n-panel-body" style="padding:0;">
        ${st.length === 0 ? `<div class="n-panel-body">${empty("Nincs diák.")}</div>` : `
        <div class="n-table-wrap"><table class="n-table">
          <thead><tr><th>UID</th><th>Név</th><th>Iskola</th><th>E-mail</th></tr></thead>
          <tbody>${st.slice(0, 10).map((s) => `
            <tr>
              <td>${esc(s.Uid)}</td>
              <td>${esc(s.Nev)}</td>
              <td>${esc(s.IntezmenyNev || s.IntezmenyAzonosito || "—")}</td>
              <td>${esc(s.EmailCim || "—")}</td>
            </tr>`).join("")}</tbody>
        </table></div>`}
      </div>
    </div>`;
}

function renderSchools() {
  const schools = getSchools();
  const st = cache.students || [];
  const counts = {};
  st.forEach((s) => {
    const c = s.IntezmenyAzonosito || "—";
    counts[c] = (counts[c] || 0) + 1;
  });

  return `
    <div class="n-panel">
      <div class="n-panel-head">Új iskola hozzáadása</div>
      <div class="n-panel-body">
        <div id="schoolMsg" style="display:none;"></div>
        <form id="schoolForm" class="n-form-grid">
          <label for="schCode">Kód (azonosító)</label>
          <input id="schCode" required placeholder="pl. mockschool" />
          <label for="schName">Név</label>
          <input id="schName" required placeholder="pl. Mock Gimnázium" />
          <div class="n-form-actions">
            <button type="submit" class="n-btn">Iskola mentése</button>
          </div>
        </form>
        <p style="margin:12px 0 0;color:var(--n-muted);font-size:12px;">
          Az iskolák a diák profil <em>IntezmenyAzonosito / IntezmenyNev</em> mezőin keresztül kapcsolódnak.
          Új diák létrehozásakor kiválasztható az iskola.
        </p>
      </div>
    </div>
    <div class="n-panel">
      <div class="n-panel-head">Iskolák (${schools.length})</div>
      <div class="n-panel-body" style="padding:0;">
        ${schools.length === 0 ? `<div class="n-panel-body">${empty("Nincs iskola.")}</div>` : `
        <div class="n-table-wrap"><table class="n-table">
          <thead><tr><th>Kód</th><th>Név</th><th>Diákok</th><th></th></tr></thead>
          <tbody>${schools.map((s) => `
            <tr>
              <td><code>${esc(s.code)}</code></td>
              <td>${esc(s.name)}</td>
              <td>${counts[s.code] || 0}</td>
              <td style="white-space:nowrap;">
                <button type="button" class="n-btn n-btn-secondary edit-school" data-code="${esc(s.code)}" data-name="${esc(s.name)}">Szerkeszt</button>
                <button type="button" class="n-btn n-btn-secondary del-school" data-code="${esc(s.code)}" style="color:#c62828;border-color:#ef9a9a;">Törlés</button>
              </td>
            </tr>`).join("")}</tbody>
        </table></div>`}
      </div>
    </div>`;
}

function bindSchools() {
  document.getElementById("schoolForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const code = document.getElementById("schCode").value.trim();
    const name = document.getElementById("schName").value.trim();
    const msg = document.getElementById("schoolMsg");
    if (!code || !name) {
      msg.className = "n-msg n-msg-err";
      msg.style.display = "block";
      msg.textContent = "Kód és név kötelező.";
      return;
    }
    let schools = getSchools();
    const i = schools.findIndex((s) => s.code === code);
    if (i >= 0) schools[i].name = name;
    else schools.push({ code, name });
    saveSchools(schools);
    msg.className = "n-msg n-msg-ok";
    msg.style.display = "block";
    msg.textContent = i >= 0 ? "Iskola frissítve." : "Iskola hozzáadva.";
    navigate("schools");
  });
  document.querySelectorAll(".edit-school").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("schCode").value = btn.dataset.code || "";
      document.getElementById("schName").value = btn.dataset.name || "";
      document.getElementById("schCode").focus();
    });
  });
  document.querySelectorAll(".del-school").forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = btn.dataset.code;
      const used = (cache.students || []).filter((s) => s.IntezmenyAzonosito === code).length;
      const msg = used
        ? "Ez az iskola " + used + " diákhoz van rendelve. Így is törlöd a listából?"
        : "Törlöd ezt az iskolát a listából?";
      if (!confirm(msg)) return;
      saveSchools(getSchools().filter((s) => s.code !== code));
      navigate("schools");
    });
  });
}

function renderStudents() {
  const st = cache.students || [];
  return `
    <div class="n-panel">
      <div class="n-panel-head">
        Tanulók (${st.length})
        <button type="button" class="n-btn" data-go="studentForm" style="float:right;margin-top:-2px;">+ Új diák</button>
      </div>
      <div class="n-panel-body" style="padding:0;">
        ${st.length === 0 ? `<div class="n-panel-body">${empty("Nincs tanuló. Hozz létre egyet.")}</div>` : `
        <div class="n-table-wrap"><table class="n-table">
          <thead>
            <tr>
              <th>UID</th><th>Név</th><th>Iskola</th><th>Tanév</th><th>E-mail</th><th></th>
            </tr>
          </thead>
          <tbody>${st.map((s) => `
            <tr>
              <td>${esc(s.Uid)}</td>
              <td>${esc(s.Nev)}</td>
              <td>${esc(s.IntezmenyNev || "—")}<div style="color:var(--n-muted);font-size:11px;">${esc(s.IntezmenyAzonosito || "")}</div></td>
              <td>${esc(s.TanevUid || "—")}</td>
              <td>${esc(s.EmailCim || "—")}</td>
              <td style="white-space:nowrap;">
                <button type="button" class="n-btn n-btn-secondary edit-student" data-uid="${esc(s.Uid)}">Szerkeszt</button>
                <button type="button" class="n-btn n-btn-secondary del-student" data-uid="${esc(s.Uid)}" data-name="${esc(s.Nev)}" style="color:#c62828;border-color:#ef9a9a;">Törlés</button>
              </td>
            </tr>`).join("")}</tbody>
        </table></div>`}
      </div>
    </div>`;
}

function genStudentUid() {
  return "OA" + String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900 + 100));
}

function studentFormValues(s) {
  s = s || {};
  const schools = getSchools();
  const schoolOpts = schools.map((sc) =>
    `<option value="${esc(sc.code)}" ${s.IntezmenyAzonosito === sc.code ? "selected" : ""}>${esc(sc.name)} (${esc(sc.code)})</option>`
  ).join("");
  // Új diáknál mindig egyedi UID – ne lehessen véletlenül felülírni a régit
  const uidVal = s.Uid || genStudentUid();

  return `
    <div id="stuMsg" style="display:none;"></div>
    <form id="stuForm" class="n-form-grid">
      <label for="stUid">UID * <span style="font-weight:400;color:var(--n-muted);">(új diáknál automatikus – ne írd át meglévőre)</span></label>
      <input id="stUid" required value="${esc(uidVal)}" ${s.Uid ? "readonly" : ""} placeholder="automatikus egyedi UID" />

      <label for="stNev">Név *</label>
      <input id="stNev" required value="${esc(s.Nev || "")}" />

      <label for="stEmail">E-mail</label>
      <input id="stEmail" type="email" value="${esc(s.EmailCim || "")}" />

      <label for="stSchool">Iskola</label>
      <select id="stSchool">
        <option value="">— nincs / egyéni —</option>
        ${schoolOpts}
      </select>

      <label for="stInstCode">Iskola kód</label>
      <input id="stInstCode" value="${esc(s.IntezmenyAzonosito || "")}" placeholder="IntezmenyAzonosito" />

      <label for="stInstName">Iskola név</label>
      <input id="stInstName" value="${esc(s.IntezmenyNev || "")}" placeholder="IntezmenyNev" />

      <label for="stTanev">Tanév</label>
      <input id="stTanev" value="${esc(s.TanevUid || "2025/2026")}" />

      <label for="stClass">Osztály UID</label>
      <input id="stClass" value="" placeholder="pl. 10,11.A" />

      <label for="stBirthY">Születési év</label>
      <input id="stBirthY" type="number" value="${esc(s.SzuletesiEv || "")}" />

      <label for="stBirthM">Születési hónap</label>
      <input id="stBirthM" type="number" min="1" max="12" value="${esc(s.SzuletesiHonap || "")}" />

      <label for="stBirthD">Születési nap</label>
      <input id="stBirthD" type="number" min="1" max="31" value="${esc(s.SzuletesiNap || "")}" />

      <label for="stCim">Cím</label>
      <input id="stCim" value="${esc((s.Cimek && s.Cimek[0]) || "")}" />

      <label for="stUser">Login felhasználónév</label>
      <input id="stUser" placeholder="opcionális – új belépéshez" />

      <label for="stPass">Login jelszó</label>
      <input id="stPass" type="password" placeholder="opcionális" />

      <div class="n-form-actions">
        <button type="submit" class="n-btn">${s.Uid ? "Profil mentése" : "Diák létrehozása"}</button>
        <button type="button" class="n-btn n-btn-secondary" data-go="students">Vissza</button>
        ${s && s.Uid ? `<button type="button" class="n-btn n-btn-secondary" id="stuDeleteBtn" style="color:#c62828;border-color:#ef9a9a;margin-left:auto;">Diák törlése</button>` : ""}
      </div>
    </form>`;
}

function renderStudentForm() {
  const s = (cache.students || []).find((x) => String(x.Uid) === String(editStudentUid)) || null;
  return `
    <div class="n-panel">
      <div class="n-panel-head">${s ? "Diák profil szerkesztése" : "Új diák profil"}</div>
      <div class="n-panel-body">${studentFormValues(s)}</div>
    </div>
    ${s ? `
    <div class="n-panel">
      <div class="n-panel-head">Teljes profil (JSON)</div>
      <div class="n-panel-body"><pre style="margin:0;white-space:pre-wrap;font-size:12px;">${esc(JSON.stringify(s, null, 2))}</pre></div>
    </div>` : ""}`;
}

function bindStudentForm() {
  document.getElementById("stuDeleteBtn")?.addEventListener("click", () => {
    const uid = document.getElementById("stUid").value.trim();
    const name = document.getElementById("stNev").value.trim();
    deleteStudent(uid, name);
  });
  const schoolSel = document.getElementById("stSchool");
  schoolSel?.addEventListener("change", () => {
    const code = schoolSel.value;
    const sc = getSchools().find((x) => x.code === code);
    if (sc) {
      document.getElementById("stInstCode").value = sc.code;
      document.getElementById("stInstName").value = sc.name;
    }
  });

  document.getElementById("stuForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("stuMsg");
    const btn = e.target.querySelector('button[type="submit"]');
    const student = {
      Uid: document.getElementById("stUid").value.trim(),
      Nev: document.getElementById("stNev").value.trim(),
      EmailCim: document.getElementById("stEmail").value.trim(),
      IntezmenyAzonosito: document.getElementById("stInstCode").value.trim(),
      IntezmenyNev: document.getElementById("stInstName").value.trim(),
      TanevUid: document.getElementById("stTanev").value.trim(),
      SzuletesiEv: Number(document.getElementById("stBirthY").value) || undefined,
      SzuletesiHonap: Number(document.getElementById("stBirthM").value) || undefined,
      SzuletesiNap: Number(document.getElementById("stBirthD").value) || undefined,
      Cimek: document.getElementById("stCim").value.trim()
        ? [document.getElementById("stCim").value.trim()]
        : []
    };
    if (student.IntezmenyAzonosito || student.IntezmenyNev) {
      student.Intezmeny = {
        Uid: student.IntezmenyAzonosito || "",
        RovidNev: student.IntezmenyNev || ""
      };
    }
    const classGroupUid = document.getElementById("stClass").value.trim();
    const username = document.getElementById("stUser").value.trim();
    const password = document.getElementById("stPass").value;

    if (!student.Uid || !student.Nev) {
      msg.className = "n-msg n-msg-err";
      msg.style.display = "block";
      msg.textContent = "UID és Név kötelező.";
      return;
    }

    btn.disabled = true;
    msg.style.display = "none";
    const notes = [];
    try {
      // 1) CSAK diák profil – username NÉLKÜL (így a user hiba nem maszkírozza a diák mentést)
      await api("/admin/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student,
          classGroupUid: classGroupUid || ""
        })
      });
      notes.push("Diák OK (" + student.Uid + ")");

      // 2) Login külön – ugyanaz, mint a „Felhasználók” menü
      if (username && password) {
        try {
          await api("/admin/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username,
              password,
              studentUid: student.Uid,
              role: "Tanulo"
            })
          });
          notes.push("Login OK (" + username + ")");
        } catch (userErr) {
          notes.push("Login hiba: " + (userErr.message || userErr) + " – a diák profil így is elment. Login: Felhasználók menü.");
        }
      } else {
        notes.push("Login nincs megadva (opcionális).");
      }

      await refreshData();
      msg.className = "n-msg n-msg-ok";
      msg.style.display = "block";
      msg.textContent = notes.join(" | ");
      editStudentUid = null;
      setTimeout(() => navigate("students"), 800);
    } catch (err) {
      console.error("Diak mentes hiba:", err);
      msg.className = "n-msg n-msg-err";
      msg.style.display = "block";
      msg.textContent = "Diák mentés sikertelen: " + (err.message || err);
    } finally {
      btn.disabled = false;
    }
  });
}

function getTeachersLocal() {
  try {
    const raw = localStorage.getItem("ujkreta_admin_teachers");
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveTeachersLocal(list) {
  localStorage.setItem("ujkreta_admin_teachers", JSON.stringify(list));
}

function syncTeacherToLocal(t) {
  if (!t || !t.Uid) return;
  const list = getTeachersLocal();
  const i = list.findIndex((x) => String(x.Uid) === String(t.Uid));
  if (i >= 0) list[i] = Object.assign({}, list[i], t);
  else list.push(t);
  saveTeachersLocal(list);
}

function renderTeachers() {
  const apiT = cache.teacher || {};
  if (apiT.Uid) syncTeacherToLocal(apiT);
  const list = getTeachersLocal();
  const schools = getSchools();

  const rows = list.length === 0
    ? `<tr><td colspan="6">${empty("Nincs tanár profil. Hozz létre egyet alább.")}</td></tr>`
    : list.map((t) => `
      <tr>
        <td>${esc(t.Uid)}</td>
        <td>${esc(t.Nev || "—")}</td>
        <td>${esc(t.IntezmenyNev || "—")}<div style="color:var(--n-muted);font-size:11px;">${esc(t.IntezmenyAzonosito || "")}</div></td>
        <td>${esc(t.EmailCim || "—")}</td>
        <td>${esc(t.Telefonszam || "—")}</td>
        <td style="white-space:nowrap;">
          <button type="button" class="n-btn n-btn-secondary edit-teacher" data-uid="${esc(t.Uid)}">Szerkeszt</button>
          <button type="button" class="n-btn n-btn-secondary del-teacher" data-uid="${esc(t.Uid)}" data-name="${esc(t.Nev)}" style="color:#c62828;border-color:#ef9a9a;">Törlés</button>
        </td>
      </tr>`).join("");

  const schoolOpts = schools.map((sc) =>
    `<option value="${esc(sc.code)}">${esc(sc.name)} (${esc(sc.code)})</option>`
  ).join("");

  return `
    <div class="n-panel">
      <div class="n-panel-head">Tanárok (${list.length})</div>
      <div class="n-panel-body" style="padding:0;">
        <div class="n-table-wrap"><table class="n-table">
          <thead><tr><th>UID</th><th>Név</th><th>Iskola</th><th>E-mail</th><th>Telefon</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>
    </div>

    <div class="n-panel">
      <div class="n-panel-head">Új tanár / profil szerkesztése + fiók</div>
      <div class="n-panel-body">
        <div id="teaMsg" style="display:none;"></div>
        <form id="teaForm" class="n-form-grid">
          <label for="tUid">UID *</label>
          <input id="tUid" required value="${esc(apiT.Uid || "")}" placeholder="pl. 301" />

          <label for="tNev">Név *</label>
          <input id="tNev" required value="${esc(apiT.Nev || "")}" />

          <label for="tEmail">E-mail</label>
          <input id="tEmail" type="email" value="${esc(apiT.EmailCim || "")}" />

          <label for="tTel">Telefon</label>
          <input id="tTel" value="${esc(apiT.Telefonszam || "")}" />

          <label for="tSchool">Iskola</label>
          <select id="tSchool">
            <option value="">— válasszon —</option>
            ${schoolOpts}
          </select>

          <label for="tInstCode">Iskola kód</label>
          <input id="tInstCode" value="${esc(apiT.IntezmenyAzonosito || "")}" />

          <label for="tInstName">Iskola név</label>
          <input id="tInstName" value="${esc(apiT.IntezmenyNev || "")}" />

          <label for="tSubjects">Tantárgyak (vesszővel)</label>
          <input id="tSubjects" placeholder="Matematika, Magyar" value="${esc(
            (Array.isArray(apiT.Tantargyak) ? apiT.Tantargyak.map((x) => x.Nev).join(", ") : "")
          )}" />

          <label for="tUser">Login felhasználónév</label>
          <input id="tUser" placeholder="új tanári fiókhoz" />

          <label for="tPass">Login jelszó</label>
          <input id="tPass" type="password" placeholder="új tanári fiókhoz" />

          <div class="n-form-actions">
            <button type="submit" class="n-btn">Tanár + fiók mentése</button>
            <button type="button" class="n-btn n-btn-secondary" id="teaClear">Űrlap törlése</button>
          </div>
        </form>
        <p style="margin:12px 0 0;color:var(--n-muted);font-size:12px;">
          A profil a szerveren a <code>/admin/teacher</code> végponton tárolódik (aktív tanár).
          További tanárok listája helyben is megmarad; login a <code>/admin/users</code> role=Tanar hívással jön létre.
        </p>
      </div>
    </div>`;
}

function bindTeachers() {
  const schoolSel = document.getElementById("tSchool");
  schoolSel?.addEventListener("change", () => {
    const sc = getSchools().find((x) => x.code === schoolSel.value);
    if (sc) {
      document.getElementById("tInstCode").value = sc.code;
      document.getElementById("tInstName").value = sc.name;
    }
  });

  // preselect school if matches
  const code = document.getElementById("tInstCode")?.value;
  if (code && schoolSel) {
    const opt = [...schoolSel.options].find((o) => o.value === code);
    if (opt) schoolSel.value = code;
  }

  document.querySelectorAll(".del-teacher").forEach((btn) => {
    btn.addEventListener("click", () => deleteTeacher(btn.dataset.uid, btn.dataset.name));
  });

  document.querySelectorAll(".edit-teacher").forEach((btn) => {
    btn.addEventListener("click", () => {
      const t = getTeachersLocal().find((x) => String(x.Uid) === String(btn.dataset.uid));
      if (!t) return;
      document.getElementById("tUid").value = t.Uid || "";
      document.getElementById("tNev").value = t.Nev || "";
      document.getElementById("tEmail").value = t.EmailCim || "";
      document.getElementById("tTel").value = t.Telefonszam || "";
      document.getElementById("tInstCode").value = t.IntezmenyAzonosito || "";
      document.getElementById("tInstName").value = t.IntezmenyNev || "";
      if (t.IntezmenyAzonosito && schoolSel) schoolSel.value = t.IntezmenyAzonosito;
      const subj = Array.isArray(t.Tantargyak) ? t.Tantargyak.map((x) => x.Nev).filter(Boolean).join(", ") : "";
      document.getElementById("tSubjects").value = subj;
      document.getElementById("teaForm").scrollIntoView({ behavior: "smooth" });
    });
  });

  document.getElementById("teaClear")?.addEventListener("click", () => {
    document.getElementById("teaForm").reset();
  });

  document.getElementById("teaForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("teaMsg");
    const subjectsRaw = document.getElementById("tSubjects").value.trim();
    const tantargyak = subjectsRaw
      ? subjectsRaw.split(",").map((n, i) => {
          const nev = n.trim();
          const code = nev.toUpperCase().replace(/\s+/g, "_").slice(0, 12) || ("T" + (i + 1));
          return {
            Uid: (i + 1) + "," + code,
            Nev: nev,
            Kategoria: { Uid: "1", Nev: "Kötelező", Leiras: "Kötelező tantárgy" },
            SortIndex: i + 1
          };
        })
      : (cache.teacher && cache.teacher.Tantargyak) || [];

    const body = Object.assign({}, cache.teacher || {}, {
      Uid: document.getElementById("tUid").value.trim(),
      Nev: document.getElementById("tNev").value.trim(),
      EmailCim: document.getElementById("tEmail").value.trim(),
      Telefonszam: document.getElementById("tTel").value.trim(),
      IntezmenyAzonosito: document.getElementById("tInstCode").value.trim(),
      IntezmenyNev: document.getElementById("tInstName").value.trim(),
      Tantargyak: tantargyak
    });

    if (!body.Uid || !body.Nev) {
      msg.className = "n-msg n-msg-err";
      msg.style.display = "block";
      msg.textContent = "UID és név kötelező.";
      return;
    }

    const username = document.getElementById("tUser").value.trim();
    const password = document.getElementById("tPass").value;

    try {
      await api("/admin/teacher", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      syncTeacherToLocal(body);

      if (username && password) {
        await api("/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username,
            password,
            studentUid: body.Uid,
            role: "Tanar"
          })
        });
      }

      await refreshData();
      msg.className = "n-msg n-msg-ok";
      msg.style.display = "block";
      msg.textContent = "Tanár profil mentve" + (username ? " + login fiók létrehozva." : ".");
      navigate("teachers");
    } catch (err) {
      msg.className = "n-msg n-msg-err";
      msg.style.display = "block";
      msg.textContent = err.message;
    }
  });
}

function renderUsers() {
  const users = Array.isArray(cache.users) ? cache.users : [];
  const activeUsers = users; // aktív + inaktív is – törléshez kell

  const rows = activeUsers.length === 0
    ? `<tr><td colspan="5">${empty("Nincs user, vagy a GET /admin/users még nincs a szerveren.")}</td></tr>`
    : activeUsers.map((u) => `
      <tr>
        <td>${esc(u.username)}</td>
        <td>${esc(u.role || "—")}</td>
        <td>${esc(u.studentUid || "—")}</td>
        <td>${u.active === false ? "inaktív" : "aktív"}</td>
        <td>
          <button type="button" class="n-btn n-btn-secondary del-user"
            data-username="${esc(u.username)}"
            style="color:#c62828;border-color:#ef9a9a;">Törlés</button>
        </td>
      </tr>`).join("");

  return `
    <div class="n-panel">
      <div class="n-panel-head">Bejelentkezési felhasználók (${activeUsers.length})</div>
      <div class="n-panel-body" style="padding:0;">
        <div id="userListMsg" style="display:none;margin:10px;"></div>
        <div class="n-table-wrap"><table class="n-table">
          <thead><tr><th>Username</th><th>Role</th><th>Kapcsolt UID</th><th>Állapot</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>
    </div>

    <div class="n-panel">
      <div class="n-panel-head">User törlése username alapján (ha nincs a listában)</div>
      <div class="n-panel-body">
        <div id="manualDelMsg" style="display:none;"></div>
        <form id="manualDelForm" class="n-form-grid">
          <label for="delUserManual">Username</label>
          <input id="delUserManual" required placeholder="pl. diak2" />
          <div class="n-form-actions">
            <button type="submit" class="n-btn" style="background:#c62828;border-color:#c62828;">Végleges törlés</button>
          </div>
        </form>
        <p style="margin-top:8px;color:var(--n-muted);font-size:12px;">
          A <code>DELETE /admin/users?username=…</code> a sort ténylegesen törli az adatbázisból.
        </p>
      </div>
    </div>

    <div class="n-panel">
      <div class="n-panel-head">Új bejelentkezési felhasználó</div>
      <div class="n-panel-body">
        <div id="userMsg" style="display:none;"></div>
        <form id="userForm" class="n-form-grid">
          <label for="uName">Felhasználónév *</label>
          <input id="uName" required />
          <label for="uPass">Jelszó *</label>
          <input id="uPass" type="password" required />
          <label for="uUid">Kapcsolt UID *</label>
          <input id="uUid" required placeholder="diák UID vagy tanár UID" />
          <label for="uRole">Szerepkör</label>
          <select id="uRole">
            <option value="Tanulo">Tanulo (diák)</option>
            <option value="Tanar">Tanar (tanár)</option>
            <option value="Osztalyfonok">Osztalyfonok (osztályfőnök)</option>
          </select>
          <div class="n-form-actions">
            <button type="submit" class="n-btn">User létrehozása</button>
          </div>
        </form>
        <p style="margin-top:12px;color:var(--n-muted);font-size:12px;">
          A törléshez a szerveren kell a <code>admin_delete_handlers.go</code> (Render deploy).
          Soft-delete: <code>users.active = false</code>.
        </p>
      </div>
    </div>

    <div class="n-panel">
      <div class="n-panel-head">Diák UID-k (segédlet)</div>
      <div class="n-panel-body" style="padding:0;">
        <div class="n-table-wrap"><table class="n-table">
          <thead><tr><th>UID</th><th>Név</th><th>Iskola</th></tr></thead>
          <tbody>${(cache.students || []).map((s) => `
            <tr><td>${esc(s.Uid)}</td><td>${esc(s.Nev)}</td><td>${esc(s.IntezmenyAzonosito || "—")}</td></tr>
          `).join("") || `<tr><td colspan="3">${empty("Nincs diák")}</td></tr>`}</tbody>
        </table></div>
      </div>
    </div>`;
}

function bindUsers() {
  document.getElementById("manualDelForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("delUserManual").value.trim();
    const msg = document.getElementById("manualDelMsg");
    if (!username) return;
    if (!confirm("Véglegesen törlöd: " + username + " ?")) return;
    try {
      await api("/admin/users?username=" + encodeURIComponent(username), { method: "DELETE" });
      msg.className = "n-msg n-msg-ok";
      msg.style.display = "block";
      msg.textContent = "Törölve: " + username;
      document.getElementById("delUserManual").value = "";
      await refreshData();
      navigate("users");
    } catch (err) {
      msg.className = "n-msg n-msg-err";
      msg.style.display = "block";
      msg.textContent = err.message || String(err);
    }
  });

  document.getElementById("userForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("userMsg");
    try {
      await api("/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: document.getElementById("uName").value.trim(),
          password: document.getElementById("uPass").value,
          studentUid: document.getElementById("uUid").value.trim(),
          role: document.getElementById("uRole").value
        })
      });
      msg.className = "n-msg n-msg-ok";
      msg.style.display = "block";
      msg.textContent = "Felhasználó létrehozva.";
      e.target.reset();
      await refreshData();
      navigate("users");
    } catch (err) {
      msg.className = "n-msg n-msg-err";
      msg.style.display = "block";
      msg.textContent = err.message;
    }
  });

  document.querySelectorAll(".del-user").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const username = btn.dataset.username;
      if (!confirm("Törlöd a felhasználót?\n" + username)) return;
      const msg = document.getElementById("userListMsg");
      try {
        await api("/admin/users?username=" + encodeURIComponent(username), { method: "DELETE" });
        if (msg) {
          msg.className = "n-msg n-msg-ok";
          msg.style.display = "block";
          msg.textContent = "Törölve: " + username;
        }
        await refreshData();
        navigate("users");
      } catch (err) {
        if (msg) {
          msg.className = "n-msg n-msg-err";
          msg.style.display = "block";
          msg.textContent = "Törlés sikertelen: " + (err.message || err) +
            " — telepítsd az admin_delete_handlers.go-t a Renderre.";
        } else {
          alert("Törlés sikertelen: " + (err.message || err));
        }
      }
    });
  });
}

function renderConfig() {
  return `
    <div class="n-panel">
      <div class="n-panel-head">Szerver konfig (JSON)</div>
      <div class="n-panel-body">
        <div id="cfgMsg" style="display:none;"></div>
        <textarea id="cfgJson" style="width:100%;min-height:280px;font-family:ui-monospace,monospace;font-size:12px;padding:10px;border:1px solid var(--n-border);">${esc(JSON.stringify(cache.config || {}, null, 2))}</textarea>
        <div style="margin-top:10px;display:flex;gap:8px;">
          <button type="button" class="n-btn" id="cfgSave">Mentés</button>
          <button type="button" class="n-btn n-btn-secondary" id="cfgReload">Újratöltés</button>
        </div>
      </div>
    </div>`;
}

function bindConfig() {
  document.getElementById("cfgSave")?.addEventListener("click", async () => {
    const msg = document.getElementById("cfgMsg");
    try {
      const body = JSON.parse(document.getElementById("cfgJson").value);
      cache.config = await api("/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      msg.className = "n-msg n-msg-ok";
      msg.style.display = "block";
      msg.textContent = "Konfig mentve.";
      await refreshData();
    } catch (err) {
      msg.className = "n-msg n-msg-err";
      msg.style.display = "block";
      msg.textContent = err.message;
    }
  });
  document.getElementById("cfgReload")?.addEventListener("click", async () => {
    await refreshData();
    navigate("config");
  });
}

function renderTools() {
  return `
    <div class="n-panel">
      <div class="n-panel-head">Mock adatok visszaállítása</div>
      <div class="n-panel-body">
        <div id="toolMsg" style="display:none;"></div>
        <p style="margin-top:0;color:var(--n-muted);">A <code>POST /admin/reset</code> visszaállítja a seed adatokat. Óvatosan.</p>
        <button type="button" class="n-btn" id="resetBtn" style="background:#c62828;border-color:#c62828;">Reset futtatása</button>
      </div>
    </div>
    <div class="n-panel">
      <div class="n-panel-head">Health</div>
      <div class="n-panel-body"><pre style="margin:0;">${esc(JSON.stringify(cache.health, null, 2))}</pre></div>
    </div>`;
}

function bindTools() {
  document.getElementById("resetBtn")?.addEventListener("click", async () => {
    if (!confirm("Biztosan visszaállítod a mock adatokat?")) return;
    const msg = document.getElementById("toolMsg");
    try {
      await api("/admin/reset", { method: "POST" });
      await refreshData();
      msg.className = "n-msg n-msg-ok";
      msg.style.display = "block";
      msg.textContent = "Reset kész.";
    } catch (err) {
      msg.className = "n-msg n-msg-err";
      msg.style.display = "block";
      msg.textContent = err.message;
    }
  });
}

const RENDERERS = {
  dashboard: renderDashboard,
  schools: renderSchools,
  students: renderStudents,
  studentForm: renderStudentForm,
  teachers: renderTeachers,
  users: renderUsers,
  config: renderConfig,
  tools: renderTools
};

const BINDERS = {
  schools: bindSchools,
  studentForm: bindStudentForm,
  teachers: bindTeachers,
  users: bindUsers,
  config: bindConfig,
  tools: bindTools
};

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("overlay").style.display = "none";
}

function navigate(page) {
  if (!RENDERERS[page]) page = "dashboard";
  if (page !== "studentForm") editStudentUid = page === "students" ? editStudentUid : null;
  currentPage = page;
  document.getElementById("pageTitle").textContent = PAGE_META[page];
  document.getElementById("bcPage").textContent = PAGE_META[page];
  document.querySelectorAll(".n-nav-item").forEach((b) => {
    b.classList.toggle("active", b.dataset.page === page);
  });
  const el = document.getElementById("pageContent");
  el.innerHTML = RENDERERS[page]();
  BINDERS[page]?.();

  el.querySelectorAll("[data-go]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.go === "studentForm") editStudentUid = null;
      navigate(btn.dataset.go);
    });
  });
  el.querySelectorAll(".edit-student").forEach((btn) => {
    btn.addEventListener("click", () => {
      editStudentUid = btn.dataset.uid;
      navigate("studentForm");
    });
  });
  el.querySelectorAll(".del-student").forEach((btn) => {
    btn.addEventListener("click", () => deleteStudent(btn.dataset.uid, btn.dataset.name));
  });
  closeSidebar();
}

async function deleteStudent(uid, name) {
  if (!uid) return;
  if (!confirm("Biztosan törlöd a diákot?\n" + (name || uid) + " (" + uid + ")")) return;
  try {
    await api("/admin/students?uid=" + encodeURIComponent(uid), { method: "DELETE" });
  } catch (e) {
    // fallback: local hide list
    const key = "ujkreta_admin_deleted_students";
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem(key) || "[]"); } catch (_) {}
    if (!arr.includes(uid)) arr.push(uid);
    localStorage.setItem(key, JSON.stringify(arr));
    alert("API törlés nem elérhető (" + (e.message || e) + ").\nHelyben elrejtve. Telepítsd az admin_crud_patch.go-t a szerverre a végleges törléshez.");
  }
  try { await refreshData(); } catch (_) {}
  navigate("students");
}

async function deleteTeacher(uid, name) {
  if (!uid) return;
  if (!confirm("Biztosan törlöd a tanárt?\n" + (name || uid) + " (" + uid + ")")) return;
  // local always
  saveTeachersLocal(getTeachersLocal().filter((t) => String(t.Uid) !== String(uid)));
  try {
    await api("/admin/teacher/delete?uid=" + encodeURIComponent(uid), { method: "DELETE" });
  } catch (_) {
    try {
      await api("/admin/teacher?uid=" + encodeURIComponent(uid), { method: "DELETE" });
    } catch (e2) {
      // ignore – local already removed
    }
  }
  // if was active API teacher, try clear
  if (cache.teacher && String(cache.teacher.Uid) === String(uid)) {
    try {
      await api("/admin/teacher", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Uid: "", Nev: "" })
      });
    } catch (_) {}
  }
  try { await refreshData(); } catch (_) {}
  navigate("teachers");
}

function showLogin(err) {
  document.getElementById("appShell").style.display = "none";
  document.getElementById("loginScreen").style.display = "block";
  const box = document.getElementById("loginError");
  if (err) {
    box.style.display = "block";
    box.textContent = err;
  } else box.style.display = "none";
}

function showApp() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("appShell").style.display = "block";
  document.getElementById("adminLabel").textContent = basicUser || "admin";
  navigate("dashboard");
}

async function tryLogin() {
  const u = document.getElementById("adminUser").value.trim();
  const p = document.getElementById("adminPass").value;
  const err = document.getElementById("loginError");
  if (!u || !p) {
    err.style.display = "block";
    err.textContent = "Add meg a felhasználónevet és jelszót.";
    return;
  }
  saveAuth(u, p);
  try {
    await api("/admin/health");
    await refreshData();
    showApp();
  } catch (e) {
    clearAuth();
    err.style.display = "block";
    err.textContent = e.message === "401" ? "Hibás admin adatok." : (e.message || "Belépési hiba");
  }
}

async function boot() {
  document.getElementById("adminLoginBtn").addEventListener("click", tryLogin);
  document.getElementById("adminPass").addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryLogin();
  });
  document.getElementById("logoutBtn").addEventListener("click", () => {
    clearAuth();
    showLogin();
  });
  document.getElementById("menuBtn").addEventListener("click", () => {
    document.getElementById("sidebar").classList.add("open");
    document.getElementById("overlay").style.display = "block";
  });
  document.getElementById("overlay").addEventListener("click", closeSidebar);
  document.querySelectorAll(".n-nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.page === "studentForm") editStudentUid = null;
      navigate(btn.dataset.page);
    });
  });

  if (basicUser && basicPass) {
    try {
      await api("/admin/health");
      await refreshData();
      showApp();
      return;
    } catch (_) {
      clearAuth();
    }
  }
  showLogin();
}

boot();
