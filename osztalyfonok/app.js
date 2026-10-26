/* KRÁTA Osztályfőnök – diák+user, jegy, mulasztás, házi, órarend. Nincs tanár/konfig/iskola. */
const API_BASE = "https://edukreta.onrender.com";
const LOGIN_URL = "https://e-krata.github.io/eduKRETA/";
const TOKEN_KEYS = ["access_token", "ujkreta_access_token", "of_access_token"];
const PAGE_META = {
  eugy: "e-Ügyintézés",
  documents: "Digitális dokumentumok",
  dkt: "DKT – Digitális Kollaborációs Tér",
  dashboard: "Kezdőlap",
  grade: "Jegy beírása",
  grades: "Beírt jegyek",
  absences: "Mulasztások",
  students: "Tanulók",
  studentNew: "Új diák",
  timetable: "Órarend",
  naplo: "Óra naplózása",
  homework: "Házi feladatok",
  profile: "Profil"
};
const GRADE_TEXT = { 1: "Elégtelen", 2: "Elégséges", 3: "Közepes", 4: "Jó", 5: "Jeles" };

let accessToken = null;
let cache = {};
let currentPage = "dashboard";
let pendingGrades = {};

function esc(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function empty(t) { return `<div class="n-empty">${esc(t)}</div>`; }
function fmtDate(d) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("hu-HU"); } catch { return String(d).slice(0,10); }
}
function fmtTime(d) {
  if (!d) return "";
  try { return new Date(d).toLocaleTimeString("hu-HU",{hour:"2-digit",minute:"2-digit"}); } catch { return ""; }
}
function weekdayName(date) {
  try { return new Date(date).toLocaleDateString("hu-HU",{weekday:"long"}); } catch { return date; }
}
function subjectName(x) {
  return x?.Tantargy?.Nev || x?.TantargyNev || x?.Nev || "";
}
function gradeClass(n) {
  n = Number(n);
  if (n >= 5) return "g5"; if (n >= 4) return "g4"; if (n >= 3) return "g3"; if (n >= 2) return "g2"; return "g1";
}
function genUid() {
  return "OA" + String(Date.now()).slice(-6) + String(Math.floor(Math.random()*900+100));
}

function getStoredToken() {
  for (const k of TOKEN_KEYS) {
    const v = localStorage.getItem(k);
    if (v) return v;
  }
  return null;
}
function saveToken(t) {
  accessToken = t;
  localStorage.setItem("of_access_token", t);
  localStorage.setItem("access_token", t);
}
function clearTokens() {
  TOKEN_KEYS.forEach(k => localStorage.removeItem(k));
  localStorage.removeItem("ujkreta_role");
}
function goLogin() {
  clearTokens();
  window.location.href = LOGIN_URL;
}

function parseRoleFromIdToken(idToken) {
  try {
    const payload = JSON.parse(atob(idToken.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
    return payload.role || payload["kreta:role"] || "";
  } catch { return ""; }
}

async function login(username, password) {
  const body = new URLSearchParams({
    grant_type: "password",
    username,
    password,
    client_id: "ekrata-naplo-web"
  });
  const res = await fetch(API_BASE + "/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.error || "Belépés sikertelen");
  const role = parseRoleFromIdToken(data.id_token) || "";
  if (role && role !== "Osztalyfonok" && role !== "Tanar") {
    throw new Error("Ez a fiók nem osztályfőnök/tanár. Role: " + role);
  }
  localStorage.setItem("ujkreta_role", role || "Osztalyfonok");
  saveToken(data.access_token);
  if (data.refresh_token) localStorage.setItem("refresh_token", data.refresh_token);
  return data;
}

async function apiGet(path) {
  const res = await fetch(API_BASE + path, {
    headers: { Authorization: "Bearer " + accessToken, Accept: "application/json" }
  });
  if (res.status === 401) { goLogin(); throw new Error("401"); }
  if (!res.ok) return null;
  return res.json();
}
async function apiPost(path, body) {
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + accessToken,
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (res.status === 401) { goLogin(); throw new Error("401"); }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) {}
  if (!res.ok) {
    throw new Error((data && (data.message || data.error)) || ("Hiba " + res.status));
  }
  return data;
}

async function apiPut(path, body) {
  const res = await fetch((typeof API_BASE !== "undefined" ? API_BASE : "") + path, {
    method: "PUT",
    headers: {
      Authorization: "Bearer " + accessToken,
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (res.status === 401) { goLogin(); throw new Error("401"); }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) {}
  if (!res.ok) throw new Error((data && (data.message || data.error)) || ("Hiba " + res.status));
  return data;
}
async function apiDelete(path) {
  const res = await fetch(API_BASE + path, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + accessToken, Accept: "application/json" }
  });
  if (res.status === 401) { goLogin(); throw new Error("401"); }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) {}
  if (!res.ok) throw new Error((data && data.error) || ("Hiba " + res.status));
  return data;
}

async function loadAllData() {
  const map = {
    teacher: "/naplo/v3/sajat/TanarAdatlap",
    groups: "/naplo/v3/sajat/OsztalyCsoportok",
    students: "/naplo/v3/sajat/Tanulok",
    grades: "/naplo/v3/sajat/Ertekelesek",
    timetable: "/naplo/v3/sajat/OrarendElemek",
    homework: "/naplo/v3/sajat/HaziFeladatok",
    absences: "/naplo/v3/sajat/Mulasztasok"
  };
  const ofStudents = await apiGet("/naplo/v3/sajat/Of/Diakok").catch(() => null);
  const entries = await Promise.all(
    Object.entries(map).map(async ([k, p]) => {
      try { return [k, await apiGet(p)]; }
      catch (e) { console.warn("load", p, e); return [k, null]; }
    })
  );
  cache = Object.fromEntries(entries);
  if (Array.isArray(ofStudents) && ofStudents.length) {
    cache.students = ofStudents.map(s => ({
      Uid: s.Uid,
      Nev: s.Nev,
      EmailCim: s.EmailCim,
      OsztalyCsoport: { Uid: s.class_group_uid || s.OsztalyCsoportUid || "", Nev: s.class_group_nev || "" }
    }));
  }
  if (!Array.isArray(cache.students)) cache.students = [];
  if (!Array.isArray(cache.grades)) cache.grades = [];
  if (!Array.isArray(cache.groups)) cache.groups = [];
  if (!Array.isArray(cache.homework)) cache.homework = [];
  if (!Array.isArray(cache.absences)) cache.absences = [];
  if (!Array.isArray(cache.timetable)) cache.timetable = [];
  if (!cache.teacher) cache.teacher = {};
  return cache;
}

function renderDashboard() {
  const st = Array.isArray(cache.students) ? cache.students : [];
  const gr = Array.isArray(cache.grades) ? cache.grades : [];
  const hw = Array.isArray(cache.homework) ? cache.homework : [];
  const ab = Array.isArray(cache.absences) ? cache.absences : [];
  const groups = Array.isArray(cache.groups) ? cache.groups : [];
  return `
    <div class="n-stats">
      <div class="n-stat"><div class="n-stat-label">Tanulók</div><div class="n-stat-value">${st.length}</div></div>
      <div class="n-stat"><div class="n-stat-label">Jegyek</div><div class="n-stat-value">${gr.length}</div></div>
      <div class="n-stat"><div class="n-stat-label">Házik</div><div class="n-stat-value">${hw.length}</div></div>
      <div class="n-stat"><div class="n-stat-label">Mulasztások</div><div class="n-stat-value">${ab.length}</div></div>
    </div>
    <div class="n-panel">
      <div class="n-panel-head">Gyors műveletek</div>
      <div class="n-panel-body" style="display:flex;flex-wrap:wrap;gap:8px;">
        <button type="button" class="n-btn n-btn-primary" data-go="grade">Jegy beírása</button>
        <button type="button" class="n-btn" data-go="grades">Beírt jegyek</button>
        <button type="button" class="n-btn" data-go="absences">Mulasztások</button>
        <button type="button" class="n-btn" data-go="students">Tanulók</button>
        <button type="button" class="n-btn" data-go="studentNew">Új diák</button>
        <button type="button" class="n-btn" data-go="homework">Házi</button>
        <button type="button" class="n-btn" data-go="timetable">Órarend</button>
      </div>
    </div>
    <div class="n-panel">
      <div class="n-panel-head">Osztályok</div>
      <div class="n-panel-body">${groups.length ? groups.map(g => `<span class="n-badge" style="margin:2px">${esc(g.Nev || g.Uid)}</span>`).join(" ") : "—"}</div>
    </div>`;
}





function gradesByStudent(subjectUid) {
  const map = Object.create(null);
  const grades = Array.isArray(cache.grades) ? cache.grades : [];
  for (let i = 0; i < grades.length; i++) {
    const g = grades[i];
    const su = g.TantargyUid || (g.Tantargy && g.Tantargy.Uid) || "";
    if (subjectUid && su && su !== subjectUid) continue;
    const uid = g.TanuloUid || (g.Tanulo && g.Tanulo.Uid) || "";
    if (!uid) continue;
    if (!map[uid]) map[uid] = [];
    map[uid].push(g);
  }
  return map;
}
function studentGrades(studentUid, subjectUid) {
  const idx = gradesByStudent(subjectUid);
  return idx[studentUid] || [];
}
function avgOf(list) {
  if (!list || !list.length) return "—";
  let sum = 0, n = 0;
  for (let i = 0; i < list.length; i++) {
    const v = Number(list[i].SzamErtek);
    if (v > 0) { sum += v; n++; }
  }
  return n ? (sum / n).toFixed(2) : "—";
}
function gradeChipTitle(g) {
  /* legacy text helper */
  const v = g.SzamErtek ?? g.SzovegesErtek ?? "?";
  const tema = g.Tema || g.Temaja || "—";
  const jegyz = g.Megjegyzes || g.megjegyzes || "";
  return "Érték: " + v + " · Téma: " + tema + (jegyz ? (" · " + jegyz) : "");
}
function gradeChipsHtml(gs) {
  if (!gs || !gs.length) return '<span style="color:#90a4ae;">—</span>';
  let html = "";
  for (let i = 0; i < gs.length; i++) {
    const g = gs[i];
    const v = g.SzamErtek ?? g.SzovegesErtek ?? "?";
    const tema = g.Tema || g.Temaja || "";
    const jegyz = g.Megjegyzes || g.megjegyzes || "";
    const suly = g.SulySzazalekErteke != null ? g.SulySzazalekErteke : "";
    const d = g.KeszitesDatuma || g.Datum || g.RogzitesDatuma || "";
    let ds = "";
    if (d) { try { ds = new Date(d).toLocaleDateString("hu-HU"); } catch { ds = String(d).slice(0, 10); } }
    const szov = GRADE_TEXT[v] || g.SzovegesErtek || "";
    html += '<span class="k-g k-g-' + esc(g.SzamErtek) + '" data-guid="' + esc(g.Uid) +
      '" data-val="' + esc(v) +
      '" data-szov="' + esc(szov) +
      '" data-tema="' + esc(tema) +
      '" data-jegyz="' + esc(jegyz) +
      '" data-suly="' + esc(suly) +
      '" data-datum="' + esc(ds) +
      '">' + esc(v) + "</span> ";
  }
  return html;
}
function ensureGradePopover() {
  let pop = document.getElementById("kGradePop");
  if (pop) return pop;
  pop = document.createElement("div");
  pop.id = "kGradePop";
  pop.className = "k-grade-pop";
  pop.innerHTML = '<div class="k-grade-pop-head">Értékelés</div><div class="k-grade-pop-body"></div>';
  document.body.appendChild(pop);
  return pop;
}
function showGradePopover(chip) {
  const pop = ensureGradePopover();
  const body = pop.querySelector(".k-grade-pop-body");
  const v = chip.getAttribute("data-val") || "?";
  const szov = chip.getAttribute("data-szov") || "";
  const tema = chip.getAttribute("data-tema") || "—";
  const jegyz = chip.getAttribute("data-jegyz") || "";
  const suly = chip.getAttribute("data-suly") || "";
  const datum = chip.getAttribute("data-datum") || "—";
  body.innerHTML =
    '<div class="k-grade-pop-val">' + esc(v) + (szov ? (' <span style="font-size:14px;font-weight:600;color:#555;">– ' + esc(szov) + "</span>") : "") + "</div>" +
    '<div class="k-grade-pop-row"><span class="lab">Téma</span><span>' + esc(tema || "—") + "</span></div>" +
    '<div class="k-grade-pop-row"><span class="lab">Megjegyzés</span><span>' + esc(jegyz || "—") + "</span></div>" +
    (suly !== "" ? '<div class="k-grade-pop-row"><span class="lab">Súly</span><span>' + esc(suly) + "%</span></div>" : "") +
    '<div class="k-grade-pop-row"><span class="lab">Dátum</span><span>' + esc(datum) + "</span></div>";
  pop.classList.add("open");
  const r = chip.getBoundingClientRect();
  const pw = pop.offsetWidth || 260;
  const ph = pop.offsetHeight || 140;
  let left = r.left + r.width / 2 - pw / 2;
  let top = r.bottom + 8;
  if (left < 8) left = 8;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
  if (top + ph > window.innerHeight - 8) top = r.top - ph - 8;
  pop.style.left = left + "px";
  pop.style.top = top + "px";
}
function hideGradePopover() {
  const pop = document.getElementById("kGradePop");
  if (pop) pop.classList.remove("open");
}
const TEMA_PRESETS = [
  "Írásbeli felelet",
  "Szóbeli felelet",
  "Írásbeli témazáró",
  "Szóbeli témazáró",
  "Röpdolgozat",
  "Házi feladat",
  "Projektmunka",
  "Órai munka",
  "Dicséret",
  "Intő",
  "Egyéni…"
];
function temaSelectHtml(selected) {
  return TEMA_PRESETS.map((t) => {
    const val = t === "Egyéni…" ? "__custom__" : t;
    const sel = selected === t ? " selected" : "";
    return '<option value="' + esc(val) + '"' + sel + ">" + esc(t) + "</option>";
  }).join("");
}
function readTema() {
  const sel = document.getElementById("kbTema");
  if (!sel) return "Értékelés";
  if (sel.value === "__custom__") {
    const c = (document.getElementById("kbTemaCustom")?.value || "").trim();
    return c || "Értékelés";
  }
  return (sel.value || "").trim() || "Értékelés";
}

function renderGradeForm() {
  pendingGrades = {};
  const t = cache.teacher || {};
  const subjects = Array.isArray(t.Tantargyak) ? t.Tantargyak : [];
  const students = Array.isArray(cache.students) ? cache.students : [];
  const groups = Array.isArray(cache.groups) ? cache.groups : [];

  const groupOpts = groups.map((g) =>
    `<option value="${esc(g.Uid)}">${esc(g.Nev)}</option>`
  ).join("");
  const subjOpts = subjects.map((s) =>
    `<option value="${esc(s.Uid)}">${esc(s.Nev)}</option>`
  ).join("");

  const defaultGroup = groups[0]?.Uid || "";
  const defaultSubj = subjects[0]?.Uid || "";

  const filtered = students.filter((s) => {
    if (!defaultGroup) return true;
    return !s.OsztalyCsoport?.Uid || s.OsztalyCsoport.Uid === defaultGroup;
  });

  const groupName = groups.find((g) => g.Uid === defaultGroup)?.Nev || "Osztály";
  const subjName = subjects.find((s) => s.Uid === defaultSubj)?.Nev || "Tantárgy";

  const rows = filtered.length === 0
    ? `<tr><td colspan="5" class="n-empty">Nincs tanuló. (Backend: telepítsd a teacher_students_fix.go-t, hogy az összes diák látszódjon.)</td></tr>`
    : filtered.map((s, idx) => {
        const gs = studentGrades(s.Uid, defaultSubj);
        const chips = gradeChipsHtml(gs);
        return `
          <tr data-uid="${esc(s.Uid)}" data-group="${esc(s.OsztalyCsoport?.Uid || defaultGroup)}">
            <td class="k-num">${idx + 1}</td>
            <td>${esc(s.Nev)}</td>
            <td class="k-grades-cell" data-grades-for="${esc(s.Uid)}">${chips}</td>
            <td class="k-avg" data-avg-for="${esc(s.Uid)}">${avgOf(gs)}</td>
            <td>
              <div class="k-quick">
                <button type="button" class="k-q" data-v="5">5</button>
                <button type="button" class="k-q" data-v="4">4</button>
                <button type="button" class="k-q" data-v="3">3</button>
                <button type="button" class="k-q" data-v="2">2</button>
                <button type="button" class="k-q" data-v="1">1</button>
                <button type="button" class="k-q" data-v="x" title="Mégsem">x</button>
              </div>
            </td>
          </tr>`;
      }).join("");

  return `
    <div class="k-filters">
      <div>
        <label for="kbGroup">Osztály</label>
        <select id="kbGroup">${groupOpts || '<option value="">—</option>'}</select>
      </div>
      <div>
        <label for="kbSubject">Tantárgy</label>
        <select id="kbSubject">${subjOpts || '<option value="">—</option>'}</select>
      </div>
      <div>
        <label for="kbTema">Téma</label>
        <select id="kbTema" style="min-width:200px;">${temaSelectHtml("Írásbeli felelet")}</select>
        <input id="kbTemaCustom" type="text" placeholder="Egyéni téma…" style="min-width:180px;display:none;margin-top:4px;" />
      </div>
      <div>
        <label for="kbJegyz">Megjegyzés</label>
        <input id="kbJegyz" type="text" placeholder="Opcionális megjegyzés" style="min-width:200px;" />
      </div>
      <div>
        <label for="kbWeight">Súly %</label>
        <input id="kbWeight" type="number" value="100" min="1" max="400" style="min-width:90px;" />
      </div>
    </div>

    <div class="k-toolbar">
      <button type="button" class="k-btn k-btn-primary" id="kbSave">+ Mentés</button>
      <button type="button" class="k-btn k-btn-type active" data-type="1|Írásbeli|Írásbeli felelet">Osztályzat</button>
      <button type="button" class="k-btn k-btn-type" data-type="2|Szóbeli|Szóbeli felelet">Szöveges</button>
      <button type="button" class="k-btn k-btn-type" data-type="3|Dolgozat|Témazáró dolgozat">Százalékos</button>
      <button type="button" class="k-btn k-btn-danger" id="kbClearSel">Elölről</button>
      <div class="k-title" id="kbContext">${esc(groupName)} – ${esc(subjName)} – jegy / értékelés</div>
    </div>

    <div class="k-book">
      <table class="k-table" id="kbTable">
        <thead>
          <tr>
            <th style="width:36px;">#</th>
            <th class="k-name">Név</th>
            <th>Jegyek</th>
            <th style="width:56px;">Átlag</th>
            <th style="width:170px;">
              <span style="display:inline-flex;gap:2px;">
                <span class="k-q" style="pointer-events:none;opacity:.7">5</span>
                <span class="k-q" style="pointer-events:none;opacity:.7">4</span>
                <span class="k-q" style="pointer-events:none;opacity:.7">3</span>
                <span class="k-q" style="pointer-events:none;opacity:.7">2</span>
                <span class="k-q" style="pointer-events:none;opacity:.7">1</span>
                <span class="k-q" style="pointer-events:none;opacity:.7">x</span>
              </span>
            </th>
          </tr>
        </thead>
        <tbody id="kbBody">${rows}</tbody>
      </table>
    </div>
    <div class="k-status" id="kbStatus">Válassz jegyet a sor végén (csak egy / diák), majd kattints a <strong>Mentés</strong> gombra. Meglévő jegyre kattintva törölhető.</div>
  `;
}

function rebuildGradeRows() {
  const groupUid = document.getElementById("kbGroup")?.value || "";
  const subjectUid = document.getElementById("kbSubject")?.value || "";
  const students = Array.isArray(cache.students) ? cache.students : [];
  const groups = Array.isArray(cache.groups) ? cache.groups : [];
  const t = cache.teacher || {};
  const subjects = Array.isArray(t.Tantargyak) ? t.Tantargyak : [];
  const byStu = gradesByStudent(subjectUid);

  const filtered = students.filter((s) => {
    if (!groupUid) return true;
    return !s.OsztalyCsoport?.Uid || s.OsztalyCsoport.Uid === groupUid;
  });

  const body = document.getElementById("kbBody");
  if (!body) return;

  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="5" class="n-empty">Nincs tanuló ebben az osztályban.</td></tr>`;
  } else {
    body.innerHTML = filtered.map((s, idx) => {
      const gs = byStu[s.Uid] || [];
      return `<tr data-uid="${esc(s.Uid)}" data-group="${esc(s.OsztalyCsoport?.Uid || groupUid)}">
        <td class="k-num">${idx + 1}</td>
        <td>${esc(s.Nev)}</td>
        <td class="k-grades-cell" data-grades-for="${esc(s.Uid)}">${gradeChipsHtml(gs)}</td>
        <td class="k-avg" data-avg-for="${esc(s.Uid)}">${avgOf(gs)}</td>
        <td>
          <div class="k-quick">
            <button type="button" class="k-q" data-v="5">5</button>
            <button type="button" class="k-q" data-v="4">4</button>
            <button type="button" class="k-q" data-v="3">3</button>
            <button type="button" class="k-q" data-v="2">2</button>
            <button type="button" class="k-q" data-v="1">1</button>
            <button type="button" class="k-q" data-v="x" title="Mégsem">x</button>
          </div>
        </td>
      </tr>`;
    }).join("");
  }

  const groupName = groups.find((g) => g.Uid === groupUid)?.Nev || "Osztály";
  const subjName = subjects.find((s) => s.Uid === subjectUid)?.Nev || "Tantárgy";
  const ctx = document.getElementById("kbContext");
  if (ctx) ctx.textContent = groupName + " – " + subjName + " – jegy / értékelés";
  bindGradeClicks();
}

function bindGradeClicks() {
  // Select grade (does NOT save yet)
  document.querySelectorAll("#kbBody .k-q").forEach((btn) => {
    btn.onclick = () => {
      const v = btn.dataset.v;
      const row = btn.closest("tr");
      const uid = row.dataset.uid;
      const status = document.getElementById("kbStatus");

      row.querySelectorAll(".k-q").forEach((b) => b.classList.remove("k-selected"));

      if (v === "x") {
        delete pendingGrades[uid];
        if (status) {
          status.className = "k-status";
          status.textContent = "Kijelölés törölve. Válassz jegyet, majd Mentés.";
        }
        return;
      }

      btn.classList.add("k-selected");
      pendingGrades[uid] = { value: Number(v), group: row.dataset.group };
      if (status) {
        status.className = "k-status";
        status.textContent = `Kijelölve: ${row.children[1]?.textContent || uid} → ${v}. Nyomd meg a Mentés gombot.`;
      }
    };
  });

  // Hover → KRÉTA-stílusú popup (Téma + Megjegyzés)
  document.querySelectorAll("#kbBody .k-g[data-guid]").forEach((chip) => {
    chip.style.cursor = "pointer";
    chip.onmouseenter = () => showGradePopover(chip);
    chip.onmouseleave = () => hideGradePopover();
    chip.onclick = async () => {
      hideGradePopover();
      const guid = chip.dataset.guid;
      if (!guid || !confirm("Törlöd ezt a jegyet?")) return;
      const status = document.getElementById("kbStatus");
      try {
        await apiDelete("/naplo/v3/sajat/Ertekelesek?uid=" + encodeURIComponent(guid));
        cache.grades = await apiGet("/naplo/v3/sajat/Ertekelesek");
        rebuildGradeRows();
        if (status) {
          status.className = "k-status ok";
          status.textContent = "Jegy törölve.";
        }
      } catch (err) {
        if (status) {
          status.className = "k-status err";
          status.textContent = "Törlés sikertelen: " + (err.message || err) +
            " — telepítsd a teacher_students_fix.go-t (DELETE grades).";
        }
      }
    };
  });
}

async function apiDelete(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });
  if (res.status === 401) {
    goLogin();
    throw new Error("401");
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) {}
  if (!res.ok) {
    const msg = data?.error_description || data?.error || data?.message || `Hiba (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

function bindGradeForm() {
  const groupSel = document.getElementById("kbGroup");
  const subjSel = document.getElementById("kbSubject");
  if (!groupSel) return;

  groupSel.addEventListener("change", rebuildGradeRows);
  subjSel.addEventListener("change", rebuildGradeRows);

  document.querySelectorAll(".k-btn-type").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".k-btn-type").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  document.getElementById("kbTema")?.addEventListener("change", () => {
    const custom = document.getElementById("kbTemaCustom");
    if (!custom) return;
    custom.style.display = document.getElementById("kbTema").value === "__custom__" ? "block" : "none";
  });

  document.getElementById("kbClearSel")?.addEventListener("click", () => {
    pendingGrades = {};
    document.querySelectorAll("#kbBody .k-q").forEach((b) => b.classList.remove("k-selected"));
    const temaSel = document.getElementById("kbTema");
    if (temaSel) temaSel.value = "Írásbeli felelet";
    const temaCustom = document.getElementById("kbTemaCustom");
    if (temaCustom) { temaCustom.value = ""; temaCustom.style.display = "none"; }
    const jegyInp = document.getElementById("kbJegyz"); if (jegyInp) jegyInp.value = "";
    const status = document.getElementById("kbStatus");
    if (status) {
      status.className = "k-status";
      status.textContent = "Kijelölések törölve. Válassz jegyet, majd Mentés.";
    }
  });

  document.getElementById("kbSave")?.addEventListener("click", async () => {
    const status = document.getElementById("kbStatus");
    const subjectUid = document.getElementById("kbSubject").value;
    const groupUid = document.getElementById("kbGroup").value;
    const tema = readTema();
    const weight = Number(document.getElementById("kbWeight").value) || 100;
    const typeBtn = document.querySelector(".k-btn-type.active");
    const typeRaw = (typeBtn?.dataset?.type || "1|Írásbeli|Írásbeli felelet").split("|");
    const entries = Object.entries(pendingGrades);

    if (!entries.length) {
      if (status) {
        status.className = "k-status err";
        status.textContent = "Nincs kijelölt jegy. Előbb válassz 5–1-et a sor végén.";
      }
      return;
    }
    if (!subjectUid || !groupUid) {
      if (status) {
        status.className = "k-status err";
        status.textContent = "Válassz osztályt és tantárgyat.";
      }
      return;
    }

    const btn = document.getElementById("kbSave");
    btn.disabled = true;
    btn.textContent = "Mentés...";
    let ok = 0;
    let fail = 0;

    for (const [studentUid, sel] of entries) {
      try {
        await apiPost("/naplo/v3/sajat/Ertekelesek", {
          TantargyUid: subjectUid,
          Tema: tema,
          Megjegyzes: (document.getElementById("kbJegyz")?.value || "").trim(),
          SzamErtek: sel.value,
          SzovegesErtek: GRADE_TEXT[sel.value] || String(sel.value),
          SulySzazalekErteke: weight,
          Tipus: {
            Uid: typeRaw[0] || "1",
            Nev: typeRaw[1] || "Írásbeli",
            Leiras: typeRaw[2] || "Írásbeli felelet"
          },
          OsztalyCsoportUid: sel.group || groupUid,
          TanuloUid: studentUid
        });
        ok++;
      } catch (_) {
        fail++;
      }
    }

    cache.grades = await apiGet("/naplo/v3/sajat/Ertekelesek");
    pendingGrades = {};
    rebuildGradeRows();
    btn.disabled = false;
    btn.textContent = "+ Mentés";
    if (status) {
      status.className = fail ? "k-status err" : "k-status ok";
      status.textContent = `Mentve: ${ok} jegy` + (fail ? `, sikertelen: ${fail}` : "") + ".";
    }
  });

  bindGradeClicks();
}

function renderGrades() {
  const grades = Array.isArray(cache.grades) ? cache.grades : [];
  if (!grades.length) {
    return `<div class="n-panel"><div class="n-panel-body">${empty("Még nincs beírt értékelés.")}</div></div>`;
  }

  const sorted = [...grades].sort(
    (a, b) => new Date(b.KeszitesDatuma || b.RogzitesDatuma || 0) - new Date(a.KeszitesDatuma || a.RogzitesDatuma || 0)
  );

  return `
    <div class="n-panel">
      <div class="n-panel-head">Összes beírt jegy (${grades.length})</div>
      <div class="n-panel-body" style="padding:0;">
        <div class="n-table-wrap"><table class="n-table">
          <thead>
            <tr>
              <th>Dátum</th>
              <th>Jegy</th>
              <th>Tantárgy</th>
              <th>Téma</th>
              <th>Típus</th>
              <th>Tanuló</th>
              <th>Súly</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map((g) => {
              const st = studentByUid(g.TanuloUid || g.Tanulo?.Uid);
              return `<tr>
                <td>${fmtDate(g.KeszitesDatuma || g.RogzitesDatuma)}</td>
                <td><span class="n-grade ${gradeClass(g.SzamErtek)}">${esc(g.SzamErtek ?? g.SzovegesErtek ?? "?")}</span></td>
                <td>${esc(subjectName(g))}</td>
                <td>${esc(g.Tema || "—")}</td>
                <td>${esc(g.Tipus?.Nev || "—")}</td>
                <td>${esc(st?.Nev || g.TanuloUid || "—")}</td>
                <td>${g.SulySzazalekErteke != null ? esc(g.SulySzazalekErteke) + "%" : "—"}</td>
                <td><button type="button" class="n-btn n-btn-secondary del-grade" data-uid="${esc(g.Uid)}" style="color:#c62828;border-color:#ef9a9a;">Törlés</button></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table></div>
      </div>
    </div>`;
}
function renderStudents() {
  const students = Array.isArray(cache.students) ? cache.students : [];
  if (!students.length) {
    return `<div class="n-panel"><div class="n-panel-body">${empty("Nincs tanuló a listában.")}</div></div>`;
  }

  return `
    <div class="n-panel">
      <div class="n-panel-head">Tanulók (${students.length})</div>
      <div class="n-panel-body" style="padding:0;">
        <div class="n-table-wrap"><table class="n-table">
          <thead><tr><th>Név</th><th>UID</th><th>Osztály</th><th>E-mail</th><th></th></tr></thead>
          <tbody>${students.map((s) => `
            <tr>
              <td>${esc(s.Nev)}</td>
              <td>${esc(s.Uid)}</td>
              <td>${esc(s.OsztalyCsoport?.Nev || "—")}</td>
              <td>${esc(s.EmailCim || "—")}</td>
              <td><button type="button" class="n-btn n-btn-secondary grade-for" data-uid="${esc(s.Uid)}">Jegy beírása</button></td>
            </tr>`).join("")}</tbody>
        </table></div>
      </div>
    </div>`;
}
function renderStudentNew() {
  const uid = genUid();
  const groups = Array.isArray(cache.groups) ? cache.groups : [];
  return `<div class="n-panel"><div class="n-panel-head">Új diák + login</div>
    <div class="n-panel-body">
      <div id="stuMsg" style="display:none;"></div>
      <form id="ofStuForm" class="n-form-grid">
        <label>UID</label><input id="stUid" required value="${esc(uid)}" />
        <label>Név *</label><input id="stNev" required placeholder="Teljes név" />
        <label>Osztály UID</label>
        <select id="stClass"><option value="">—</option>${groups.map(g=>`<option value="${esc(g.Uid)}">${esc(g.Nev)}</option>`).join("")}</select>
        <label>Login username</label><input id="stUser" placeholder="pl. anna" />
        <label>Login jelszó</label><input id="stPass" type="password" />
        <div class="n-form-actions"><button type="submit" class="n-btn">Mentés</button></div>
      </form>
      <p style="font-size:12px;color:var(--n-muted);">Csak diák profil + diák login. Tanár/OF fiókot az <strong>Admin</strong> hoz létre.</p>
    </div></div>`;
}

function bindStudentNew() {
  document.getElementById("ofStuForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("stuMsg");
    const student = {
      Uid: document.getElementById("stUid").value.trim(),
      Nev: document.getElementById("stNev").value.trim(),
      TanevUid: "2025/2026"
    };
    const classGroupUid = document.getElementById("stClass").value.trim();
    const username = document.getElementById("stUser").value.trim();
    const password = document.getElementById("stPass").value;
    try {
      // Prefer OF endpoint; fallback admin path won't work with bearer
      try {
        await apiPost("/naplo/v3/sajat/Of/Diakok", {
          student, classGroupUid, username: username || undefined, password: password || undefined
        });
      } catch (err1) {
        // fallback: only if Of route missing
        throw err1;
      }
      msg.className = "n-msg n-msg-ok";
      msg.style.display = "block";
      msg.textContent = "Diák elmentve" + (username ? " + login." : ".");
      await loadAllData();
      setTimeout(() => navigate("students"), 700);
    } catch (err) {
      msg.className = "n-msg n-msg-err";
      msg.style.display = "block";
      msg.textContent = (err.message || err) + " — telepítsd az of_role_patch.go-t + registerOFRoutes.";
    }
  });
}


function renderHomework() {
  return renderHomeworkForm();
}
function bindHomework() {
  document.getElementById("hwForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("hwMsg");
    try {
      await apiPost("/naplo/v3/sajat/HaziFeladatok", {
        TantargyUid: document.getElementById("hwSubj").value,
        Szoveg: document.getElementById("hwText").value.trim(),
        Hatarido: document.getElementById("hwDue").value + "T23:59:00",
        OsztalyCsoportUid: document.getElementById("hwGroup").value
      });
      cache.homework = await apiGet("/naplo/v3/sajat/HaziFeladatok");
      msg.className = "n-msg n-msg-ok"; msg.style.display = "block";
      msg.textContent = "Házi mentve.";
      navigate("homework");
    } catch (err) {
      msg.className = "n-msg n-msg-err"; msg.style.display = "block";
      msg.textContent = err.message || String(err);
    }
  });
  document.querySelectorAll(".del-hw").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Törlöd a házit?")) return;
      try {
        await apiDelete("/naplo/v3/sajat/HaziFeladatok?uid=" + encodeURIComponent(btn.dataset.uid));
        cache.homework = await apiGet("/naplo/v3/sajat/HaziFeladatok");
        navigate("homework");
      } catch (err) {
        alert("Törlés: " + err.message + " (backend DELETE kell a házira)");
      }
    });
  });
}

function renderAbsences() {
  const list = Array.isArray(cache.absences) ? cache.absences : [];
  const students = Array.isArray(cache.students) ? cache.students : [];
  const groups = Array.isArray(cache.groups) ? cache.groups : [];

  const studOpts = students.map((s) =>
    `<option value="${esc(s.Uid)}" data-group="${esc(s.OsztalyCsoport?.Uid || "")}">${esc(s.Nev)}</option>`
  ).join("");
  const groupOpts = groups.map((g) =>
    `<option value="${esc(g.Uid)}">${esc(g.Nev)}</option>`
  ).join("");

  const rows = list.length === 0
    ? `<tr><td colspan="6">${empty("Nincs mulasztás.")}</td></tr>`
    : [...list].reverse().map((o) => {
        const st = studentByUid(o.TanuloUid);
        return `<tr>
          <td>${fmtDate(o.Datum || o.KeszitesDatuma)}</td>
          <td>${esc(st?.Nev || o.TanuloUid || "—")}</td>
          <td>${esc(o.Tipus?.Nev || "Hiányzás")}</td>
          <td>${o.KesesPercben ? esc(o.KesesPercben) + " perc" : "—"}</td>
          <td>${esc(o.IgazolasAllapota || "—")}</td>
          <td><button type="button" class="n-btn n-btn-secondary del-absence" data-uid="${esc(o.Uid)}" style="color:#c62828;border-color:#ef9a9a;">Törlés</button></td>
        </tr>`;
      }).join("");

  return `
    <div class="n-panel">
      <div class="n-panel-head">Új mulasztás</div>
      <div class="n-panel-body">
        <div id="absMsg" style="display:none;"></div>
        <form id="absForm" class="n-form-grid">
          <label for="absStudent">Tanuló</label>
          <select id="absStudent" required>
            <option value="">— válasszon —</option>
            ${studOpts}
          </select>
          <label for="absGroup">Osztály</label>
          <select id="absGroup" required>
            <option value="">— válasszon —</option>
            ${groupOpts}
          </select>
          <label for="absDate">Dátum</label>
          <input id="absDate" type="date" required />
          <label for="absType">Típus</label>
          <select id="absType">
            <option value="1|Hiányzás|Hiányzás">Hiányzás</option>
            <option value="2|Késés|Késés">Késés</option>
          </select>
          <label for="absLate">Késés (perc)</label>
          <input id="absLate" type="number" min="0" value="0" />
          <div class="n-form-actions">
            <button type="submit" class="n-btn">Mulasztás mentése</button>
          </div>
        </form>
      </div>
    </div>
    <div class="n-panel">
      <div class="n-panel-head">Mulasztások (${list.length})</div>
      <div class="n-panel-body" style="padding:0;">
        <div class="n-table-wrap"><table class="n-table">
          <thead><tr><th>Dátum</th><th>Tanuló</th><th>Típus</th><th>Késés</th><th>Igazolás</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>
    </div>`;
}

function bindAbsences() {
  const stud = document.getElementById("absStudent");
  const grp = document.getElementById("absGroup");
  stud?.addEventListener("change", () => {
    const opt = stud.selectedOptions[0];
    if (opt?.dataset?.group) grp.value = opt.dataset.group;
  });
  const dateEl = document.getElementById("absDate");
  if (dateEl && !dateEl.value) {
    dateEl.value = new Date().toISOString().slice(0, 10);
  }

  document.getElementById("absForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("absMsg");
    const typeRaw = document.getElementById("absType").value.split("|");
    const late = Number(document.getElementById("absLate").value) || 0;
    try {
      await apiPost("/naplo/v3/sajat/Mulasztasok", {
        TanuloUid: document.getElementById("absStudent").value,
        Datum: document.getElementById("absDate").value + "T00:00:00",
        Tipus: { Uid: typeRaw[0], Nev: typeRaw[1], Leiras: typeRaw[2] },
        KesesPercben: late,
        OsztalyCsoportUid: document.getElementById("absGroup").value
      });
      cache.absences = await apiGet("/naplo/v3/sajat/Mulasztasok");
      msg.className = "n-msg n-msg-ok";
      msg.style.display = "block";
      msg.textContent = "Mulasztás mentve.";
      navigate("absences");
    } catch (err) {
      msg.className = "n-msg n-msg-err";
      msg.style.display = "block";
      msg.textContent = err.message || "Hiba";
    }
  });

  document.querySelectorAll(".del-absence").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Törlöd a mulasztást?")) return;
      try {
        try { await apiDelete("/naplo/v3/sajat/Orarend/OraNaplozasTorles?uid=" + encodeURIComponent(btn.dataset.uid)); } catch (_) { await apiDelete("/naplo/v3/sajat/Mulasztasok?uid=" + encodeURIComponent(btn.dataset.uid)); }
        cache.absences = await apiGet("/naplo/v3/sajat/Mulasztasok");
        navigate("absences");
      } catch (err) {
        alert("Törlés sikertelen: " + (err.message || err) + "\nTelepítsd a teacher_students_fix.go-t.");
      }
    });
  });
}









/* ===== DKT – Digitális Kollaborációs Tér ===== */
let dktSelected = null;

function dktStorageKey() {
  const uid = (cache.student && (cache.student.Uid || cache.student.uid)) ||
    (cache.teacher && (cache.teacher.Uid || cache.teacher.uid)) ||
    localStorage.getItem("local_usr") || "anon";
  return "krata_dkt_files_" + uid;
}

function dktLoadFiles() {
  try { return JSON.parse(localStorage.getItem(dktStorageKey()) || "{}"); }
  catch { return {}; }
}
function dktSaveFiles(map) {
  localStorage.setItem(dktStorageKey(), JSON.stringify(map));
}

function dktWorkspaces() {
  let list = Array.isArray(cache.dkt) ? cache.dkt.slice() : [];
  if (!list.length) {
    // API üres: tantárgyak a jegyekből / órarendből / tanári profilból
    const names = new Set();
    (Array.isArray(cache.grades) ? cache.grades : []).forEach((g) => {
      const n = (g.Tantargy && (g.Tantargy.Nev || g.Tantargy.nev)) || g.TantargyNev;
      if (n) names.add(n);
    });
    (Array.isArray(cache.timetable) ? cache.timetable : []).forEach((l) => {
      const n = (typeof subjectName === "function" ? subjectName(l) : null) || l.TantargyNev || l.Nev;
      if (n && n !== "?") names.add(n);
    });
    const tSubs = cache.teacher && Array.isArray(cache.teacher.Tantargyak) ? cache.teacher.Tantargyak : [];
    tSubs.forEach((s) => { if (s.Nev) names.add(s.Nev); });
    if (!names.size) {
      ["Matematika", "Magyar nyelv és irodalom", "Történelem", "Informatika"].forEach((n) => names.add(n));
    }
    list = [...names].sort((a, b) => a.localeCompare(b, "hu")).map((n, i) => ({
      tantargyId: i + 1,
      tantargyNev: n,
      alkalmazottNev: (cache.teacher && cache.teacher.Nev) || "Szaktanár",
      osztalyCsoportNev: (Array.isArray(cache.groups) && cache.groups[0] && cache.groups[0].Nev) || "Osztály",
      tipusId: 0,
      _local: true
    }));
  }
  return list;
}

function dktEnsureSeed(wsId, subj) {
  const map = dktLoadFiles();
  const key = String(wsId);
  if (!map[key] || !map[key].length) {
    map[key] = [
      { id: key + "-1", name: subj + " – tematika.pdf", type: "PDF", size: "245 KB", date: new Date().toISOString(), note: "Év eleji tematika" },
      { id: key + "-2", name: subj + " – órai jegyzet.docx", type: "DOCX", size: "88 KB", date: new Date().toISOString(), note: "Közös jegyzet" },
      { id: key + "-3", name: "Házi feladatok mappa", type: "Mappa", size: "—", date: new Date().toISOString(), note: "Digitális beadandók" }
    ];
    dktSaveFiles(map);
  }
  return map[key];
}

function renderDKT() {
  window.location.href = "https://puspus-dev.github.io/ujkreta/dkt/";
  return `<div class="n-panel"><div class="n-panel-body">Átirányítás a DKT oldalra…
    <a href="https://puspus-dev.github.io/ujkreta/dkt/">Megnyitás →</a></div></div>`;
}
function renderDKT_legacy() {
  const list = dktWorkspaces();
  if (dktSelected == null && list.length) {
    const first = list[0];
    dktSelected = String(first.tantargyId || first.TantargyId || first.tantargyNev || 0);
  }
  const cards = list.map((d) => {
    const id = String(d.tantargyId || d.TantargyId || d.tantargyNev || "");
    const subj = d.tantargyNev || d.TantargyNev || "Tantárgy";
    const teacher = d.alkalmazottNev || d.AlkalmazottNev || "—";
    const group = d.osztalyCsoportNev || d.OsztalyCsoportNev || "—";
    const active = id === String(dktSelected) ? " dkt-card-active" : "";
    return `<button type="button" class="dkt-card${active}" data-dkt-id="${esc(id)}" data-dkt-name="${esc(subj)}">
      <img src="icons/OktatasIgenyles.png" alt="" class="dkt-card-ico">
      <div class="dkt-card-title">${esc(subj)}</div>
      <div class="dkt-card-meta">${esc(teacher)} · ${esc(group)}</div>
    </button>`;
  }).join("");

  let filesHtml = `<div class="k-card-empty">Válassz munkateret a bal oldalon.</div>`;
  if (dktSelected != null) {
    const ws = list.find((d) => String(d.tantargyId || d.TantargyId || d.tantargyNev || "") === String(dktSelected));
    const subj = (ws && (ws.tantargyNev || ws.TantargyNev)) || "Munkatér";
    const files = dktEnsureSeed(dktSelected, subj);
    filesHtml = `
      <div class="dkt-files-head">
        <div>
          <strong>${esc(subj)}</strong>
          <span class="k-grade-meta"> · ${files.length} elem</span>
        </div>
        <button type="button" class="k-btn k-btn-primary" id="dktAddBtn">＋ Új dokumentum</button>
      </div>
      <div class="n-table-wrap"><table class="n-table">
        <thead><tr><th>Név</th><th>Típus</th><th>Méret</th><th>Dátum</th><th>Megjegyzés</th><th></th></tr></thead>
        <tbody>
          ${files.map((f) => `<tr>
            <td><img src="icons/${f.type === "Mappa" ? "Egyeb" : "note_text_f"}.png" class="doc-row-ico" alt=""> ${esc(f.name)}</td>
            <td>${esc(f.type)}</td>
            <td>${esc(f.size || "—")}</td>
            <td>${typeof fmtDate === "function" ? fmtDate(f.date) : (f.date || "—").slice(0, 10)}</td>
            <td class="k-grade-meta">${esc(f.note || "")}</td>
            <td><button type="button" class="k-logout dkt-del" data-id="${esc(f.id)}">Törlés</button></td>
          </tr>`).join("")}
        </tbody>
      </table></div>`;
  }

  return `
    <div class="dkt-layout">
      <aside class="dkt-side">
        <div class="n-panel-head" style="border:1px solid var(--ek-line,#c5d3e2);border-bottom:0;background:#fff;">Munkaterek</div>
        <div class="dkt-cards">${cards || `<div class="k-card-empty">Nincs munkatér.</div>`}</div>
      </aside>
      <section class="dkt-main n-panel" style="margin:0;">
        <div class="n-panel-head">Dokumentumok a munkatérben</div>
        <div class="n-panel-body">${filesHtml}</div>
      </section>
    </div>`;
}

function bindDKT() {
  document.querySelectorAll(".dkt-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      dktSelected = btn.getAttribute("data-dkt-id");
      const el = document.getElementById("pageContent");
      if (el) { el.innerHTML = renderDKT(); bindDKT(); }
    });
  });
  document.getElementById("dktAddBtn")?.addEventListener("click", () => {
    const name = prompt("Dokumentum neve (pl. beadandó.pdf):");
    if (!name || !name.trim()) return;
    const map = dktLoadFiles();
    const key = String(dktSelected);
    const arr = map[key] || [];
    arr.unshift({
      id: key + "-" + Date.now(),
      name: name.trim(),
      type: name.toLowerCase().endsWith(".pdf") ? "PDF" : (name.toLowerCase().endsWith(".docx") ? "DOCX" : "Fájl"),
      size: "—",
      date: new Date().toISOString(),
      note: "Helyben hozzáadva"
    });
    map[key] = arr;
    dktSaveFiles(map);
    const el = document.getElementById("pageContent");
    if (el) { el.innerHTML = renderDKT(); bindDKT(); }
  });
  document.querySelectorAll(".dkt-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("Törlöd ezt az elemet?")) return;
      const map = dktLoadFiles();
      const key = String(dktSelected);
      map[key] = (map[key] || []).filter((f) => f.id !== btn.getAttribute("data-id"));
      dktSaveFiles(map);
      const el = document.getElementById("pageContent");
      if (el) { el.innerHTML = renderDKT(); bindDKT(); }
    });
  });
}



/* ===== Digitális dokumentumok – szerver/FTP API (nem localStorage) ===== */
const DIGIDOCS_BASE = "/api/digidocs";

function docsIsTeacher() {
  const r = (localStorage.getItem("ujkreta_role") || "").toLowerCase();
  return r.indexOf("tanar") !== -1 || r.indexOf("osztalyfonok") !== -1 || r === "teacher" || r === "of";
}
function docsCurrentUser() {
  return localStorage.getItem("local_usr") ||
    (cache.student && cache.student.Nev) ||
    (cache.teacher && cache.teacher.Nev) || "Felhasználó";
}
function docsToken() {
  for (const k of (typeof TOKEN_KEYS !== "undefined" ? TOKEN_KEYS : ["access_token", "ujkreta_access_token", "of_access_token", "teacher_access_token"])) {
    const v = localStorage.getItem(k);
    if (v) return v;
  }
  return localStorage.getItem("access_token");
}
function docsApiBase() {
  return (typeof API_BASE !== "undefined" ? API_BASE : "https://edukreta.onrender.com");
}
async function docsFetch(path, opts = {}) {
  const token = docsToken();
  const res = await fetch(docsApiBase() + path, {
    ...opts,
    headers: {
      Accept: "application/json",
      Authorization: "Bearer " + token,
      ...(opts.headers || {})
    }
  });
  if (res.status === 401) throw new Error("Nincs bejelentkezve / lejárt token");
  return res;
}
async function docsList() {
  const res = await docsFetch(DIGIDOCS_BASE);
  if (!res.ok) {
    const t = await res.text();
    let msg = t;
    try { msg = JSON.parse(t).error || t; } catch {}
    throw new Error(msg || ("HTTP " + res.status));
  }
  const data = await res.json();
  return Array.isArray(data) ? data.filter((d) => d.type !== "folder") : [];
}
async function docsUploadFile(file, name, note) {
  const fd = new FormData();
  fd.append("file", file, file.name);
  if (name) fd.append("name", name);
  if (note) fd.append("note", note);
  const token = docsToken();
  const res = await fetch(docsApiBase() + DIGIDOCS_BASE, {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: fd
  });
  if (!res.ok) {
    const t = await res.text();
    let msg = t;
    try { msg = JSON.parse(t).error || t; } catch {}
    throw new Error(msg || ("HTTP " + res.status));
  }
  return res.json();
}
async function docsDelete(name) {
  const res = await docsFetch(DIGIDOCS_BASE + "/" + encodeURIComponent(name), { method: "DELETE" });
  if (!res.ok) {
    const t = await res.text();
    let msg = t;
    try { msg = JSON.parse(t).error || t; } catch {}
    throw new Error(msg || ("HTTP " + res.status));
  }
}
async function docsDownload(name) {
  const token = docsToken();
  const res = await fetch(docsApiBase() + DIGIDOCS_BASE + "/" + encodeURIComponent(name), {
    headers: { Authorization: "Bearer " + token }
  });
  if (!res.ok) throw new Error("Letöltés sikertelen (" + res.status + ")");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function gradeValue(g) {
  if (g == null) return null;
  if (typeof g === "number") return g;
  if (g.SzamErtek != null) return Number(g.SzamErtek);
  if (g.Ertek != null && !isNaN(Number(g.Ertek))) return Number(g.Ertek);
  const s = String(g.SzovegesErtekelesSzoveg || g.ErtekelesSzoveg || g.Ertek || "").trim();
  const map = { "jeles": 5, "jó": 4, "jo": 4, "közepes": 3, "kozepes": 3, "elégséges": 2, "elegseges": 2, "elégtelen": 1, "elegtelen": 1 };
  const low = s.toLowerCase();
  if (map[low] != null) return map[low];
  const m = s.match(/[1-5]/);
  return m ? Number(m[0]) : null;
}
function subjectAverages() {
  const grades = Array.isArray(cache.grades) ? cache.grades : [];
  const by = {};
  grades.forEach((g) => {
    const sub = (typeof subjectName === "function" ? subjectName(g) : null) ||
      (g.Tantargy && (g.Tantargy.Nev || g.Tantargy.nev)) || g.TantargyNev || "Egyéb";
    const v = gradeValue(g);
    if (v == null || !isFinite(v)) return;
    if (!by[sub]) by[sub] = [];
    by[sub].push(v);
  });
  return Object.keys(by).sort((a, b) => a.localeCompare(b, "hu")).map((sub) => {
    const arr = by[sub];
    const avg = arr.reduce((s, x) => s + x, 0) / arr.length;
    return { subject: sub, avg, count: arr.length };
  });
}
function buildCertificateHtml() {
  const s = cache.student || {};
  const name = s.Nev || docsCurrentUser();
  const om = s.OktatasiAzonosito || s.Uid || "—";
  const school = s.IntezmenyNev || document.getElementById("instName")?.textContent || "KRÁTA";
  const group = (Array.isArray(cache.groups) && cache.groups[0] && (cache.groups[0].Nev || cache.groups[0].nev)) || "—";
  const tanev = s.TanevUid || document.getElementById("tanev")?.textContent || "";
  const rows = subjectAverages();
  const rowHtml = rows.length
    ? rows.map((r) => `<tr><td>${esc(r.subject)}</td><td style="text-align:center">${r.avg.toFixed(2)}</td><td style="text-align:center">${r.count}</td></tr>`).join("")
    : `<tr><td colspan="3" style="text-align:center">Nincs értékelés az adatbázisban.</td></tr>`;
  const now = new Date().toLocaleDateString("hu-HU");
  return `<!DOCTYPE html><html lang="hu"><head><meta charset="UTF-8"><title>Bizonyítvány – ${esc(name)}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; max-width: 800px; margin: 40px auto; color: #222; }
  h1 { text-align: center; font-size: 28px; letter-spacing: .08em; margin-bottom: 4px; }
  h2 { text-align: center; font-weight: normal; font-size: 16px; color: #444; margin-top: 0; }
  .meta { margin: 24px 0; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { border: 1px solid #333; padding: 8px 10px; }
  th { background: #eee; }
  .foot { margin-top: 48px; display: flex; justify-content: space-between; }
  .sign { text-align: center; width: 40%; }
  .line { border-top: 1px solid #333; margin-top: 48px; padding-top: 6px; font-size: 13px; }
  @media print { body { margin: 12mm; } .no-print { display: none; } }
</style></head><body>
  <p class="no-print" style="text-align:right"><button onclick="window.print()">Nyomtatás / PDF mentés</button></p>
  <h1>BIZONYÍTVÁNY</h1>
  <h2>${esc(school)}</h2>
  <div class="meta">
    <div><strong>Tanuló neve:</strong> ${esc(name)}</div>
    <div><strong>Oktatási azonosító / UID:</strong> ${esc(om)}</div>
    <div><strong>Osztály:</strong> ${esc(group)}</div>
    <div><strong>Tanév:</strong> ${esc(tanev || "—")}</div>
    <div><strong>Kiállítás dátuma:</strong> ${esc(now)}</div>
  </div>
  <table>
    <thead><tr><th>Tantárgy</th><th>Átlag</th><th>Értékelések száma</th></tr></thead>
    <tbody>${rowHtml}</tbody>
  </table>
  <div class="foot">
    <div class="sign"><div class="line">Osztályfőnök</div></div>
    <div class="sign"><div class="line">Igazgató</div></div>
  </div>
  <p style="margin-top:32px;font-size:12px;color:#666">KRÁTA – digitális másolat.</p>
</body></html>`;
}
function downloadCertificate() {
  const html = buildCertificateHtml();
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const name = (cache.student && cache.student.Nev) || docsCurrentUser();
  a.href = url;
  a.download = "Bizonyitvany_" + String(name).replace(/\s+/g, "_") + ".html";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

function renderDocuments() {
  const teacher = docsIsTeacher();
  const certBlock = !teacher ? `
    <div class="n-panel">
      <div class="n-panel-head">Bizonyítvány</div>
      <div class="n-panel-body">
        <p>A jelenlegi jegyek alapján digitális bizonyítvány-másolat generálható.</p>
        <button type="button" class="k-btn k-btn-primary" id="btnCert">📄 Bizonyítvány letöltése / nyomtatása</button>
      </div>
    </div>` : `
    <div class="n-panel">
      <div class="n-panel-head">Dokumentumtár (FTP)</div>
      <div class="n-panel-body"><p>A fájlok a szerveren tárolódnak (FTP). A diákok letölthetnek; feltölteni csak tanár / osztályfőnök tud.</p></div>
    </div>`;

  const uploadBlock = teacher ? `
    <div class="n-panel">
      <div class="n-panel-head">Dokumentum feltöltése (FTP)</div>
      <div class="n-panel-body">
        <div class="n-form" style="max-width:520px">
          <label>Fájl (PDF, DOCX, ZIP, kép, bármi – max 10 MB)</label>
          <input type="file" id="docFile" accept="*/*" />
          <label style="margin-top:8px;display:block">Megjelenő név (opcionális)</label>
          <input type="text" id="docName" placeholder="Pl. Ertesito_2026.zip" style="width:100%;padding:8px;border:1px solid #c5d3e2" />
          <label style="margin-top:8px;display:block">Megjegyzés</label>
          <input type="text" id="docNote" placeholder="Rövid leírás" style="width:100%;padding:8px;border:1px solid #c5d3e2" />
          <button type="button" class="k-btn k-btn-primary" id="docUpload" style="margin-top:12px">Feltöltés FTP-re</button>
          <p id="docStatus" class="k-grade-meta" style="margin-top:8px"></p>
        </div>
      </div>
    </div>` : "";

  return `
    ${certBlock}
    ${uploadBlock}
    <div class="n-panel">
      <div class="n-panel-head">Közös digitális dokumentumtár
        <button type="button" class="k-logout" id="docRefresh" style="float:right">Frissítés</button>
      </div>
      <div class="n-panel-body" style="padding:0">
        <div id="docTableWrap" class="n-table-wrap">
          <p class="k-card-empty" style="padding:16px">Betöltés…</p>
        </div>
      </div>
    </div>`;
}

async function docsRenderTable() {
  const wrap = document.getElementById("docTableWrap");
  if (!wrap) return;
  const teacher = docsIsTeacher();
  try {
    const list = await docsList();
    if (!list.length) {
      wrap.innerHTML = `<p class="k-card-empty" style="padding:16px">Még nincs dokumentum az FTP tárban.</p>`;
      return;
    }
    const rows = list.map((d) => {
      const ext = (d.name || "").split(".").pop() || "";
      const size = d.size != null ? (d.size < 1024 ? d.size + " B" : (d.size / 1024).toFixed(1) + " KB") : "—";
      return `<tr>
        <td><i class="fa fa-file-text-o"></i> ${esc(d.name)}</td>
        <td>${esc(ext.toUpperCase() || d.type || "Fájl")}</td>
        <td>${esc(size)}</td>
        <td style="white-space:nowrap">
          <button type="button" class="k-logout doc-dl" data-name="${esc(d.name)}">Letöltés</button>
          ${teacher ? `<button type="button" class="k-logout doc-del" data-name="${esc(d.name)}">Törlés</button>` : ""}
        </td>
      </tr>`;
    }).join("");
    wrap.innerHTML = `<table class="n-table">
      <thead><tr><th>Név</th><th>Típus</th><th>Méret</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
    wrap.querySelectorAll(".doc-dl").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          btn.disabled = true;
          await docsDownload(btn.getAttribute("data-name"));
        } catch (e) { alert(e.message || e); }
        finally { btn.disabled = false; }
      });
    });
    wrap.querySelectorAll(".doc-del").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Törlöd FTP-ről: " + btn.getAttribute("data-name") + " ?")) return;
        try {
          await docsDelete(btn.getAttribute("data-name"));
          await docsRenderTable();
        } catch (e) { alert(e.message || e); }
      });
    });
  } catch (e) {
    wrap.innerHTML = `<div class="e-error" style="margin:12px;padding:12px;background:#fdecea;color:#c62828">
      Dokumentumtár hiba: ${esc(e.message || e)}<br>
      <small>Állítsd be a szerveren: FTP_HOST, FTP_USER, FTP_PASS (GitHub Secrets / Render env), majd deploy.</small>
    </div>`;
  }
}

function bindDocuments() {
  document.getElementById("btnCert")?.addEventListener("click", () => {
    try { downloadCertificate(); }
    catch (e) { alert("Bizonyítvány hiba: " + (e.message || e)); }
  });
  document.getElementById("docRefresh")?.addEventListener("click", () => docsRenderTable());
  document.getElementById("docUpload")?.addEventListener("click", async () => {
    const fileInput = document.getElementById("docFile");
    const file = fileInput && fileInput.files && fileInput.files[0];
    const nameOverride = (document.getElementById("docName")?.value || "").trim();
    const note = (document.getElementById("docNote")?.value || "").trim();
    const st = document.getElementById("docStatus");
    if (!file) { alert("Válassz fájlt."); return; }
    if (file.size > 10 * 1024 * 1024) { alert("Max. 10 MB."); return; }
    try {
      if (st) st.textContent = "Feltöltés…";
      await docsUploadFile(file, nameOverride || file.name, note);
      if (st) st.textContent = "Kész: " + (nameOverride || file.name);
      if (fileInput) fileInput.value = "";
      await docsRenderTable();
    } catch (e) {
      if (st) st.textContent = "";
      alert("Feltöltés sikertelen: " + (e.message || e));
    }
  });
  docsRenderTable();
}



function renderEUGY() {
  window.location.href = "https://puspus-dev.github.io/ujkreta/eugyintezes/";
  return `<div class="n-panel"><div class="n-panel-body">Átirányítás az e-Ügyintézéshez…
    <a class="k-logout" href="https://puspus-dev.github.io/ujkreta/eugyintezes/">Megnyitás →</a></div></div>`;
}



function renderProfile() {
  const t = cache.teacher || {};
  const subjects = Array.isArray(t.Tantargyak) ? t.Tantargyak : [];
  const classes = Array.isArray(t.OsztalyFonokOsztalyok) ? t.OsztalyFonokOsztalyok : [];
  return `
    <div class="n-panel" style="margin-bottom:12px;">
      <div class="n-panel-body" style="display:flex;align-items:center;gap:16px;">
        <img src="icons/noprofilepic.png" alt="Profilkép" class="profile-pic" width="72" height="72"
          style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:2px solid var(--ek-line,#c5d3e2);background:#f4f4f4;">
        <div>
          <div style="font-size:18px;font-weight:700;">${esc(t.Nev || localStorage.getItem("local_usr") || "—")}</div>
          <div style="color:var(--n-muted,#5a6a70);font-size:13px;">${esc(t.EmailCim || "")}</div>
          <div style="color:var(--n-muted,#5a6a70);font-size:13px;">Szerepkör: Osztályfőnök</div>
        </div>
      </div>
    </div>
    <div class="n-panel">
      <div class="n-panel-head">Oktatói adatok</div>
      <div class="n-panel-body" style="padding:0;">
        <div class="n-kv">
          <div class="k">Név</div><div>${esc(t.Nev || "—")}</div>
          <div class="k">E-mail</div><div>${esc(t.EmailCim || "—")}</div>
          <div class="k">Telefon</div><div>${esc(t.Telefonszam || "—")}</div>
          <div class="k">UID</div><div>${esc(t.Uid || "—")}</div>
          <div class="k">Intézmény</div><div>${esc(t.IntezmenyNev || "—")}</div>
          <div class="k">Int. azonosító</div><div>${esc(t.IntezmenyAzonosito || "—")}</div>
        </div>
      </div>
    </div>
    <div class="n-grid n-grid-2">
      <div class="n-panel">
        <div class="n-panel-head">Tantárgyak</div>
        <div class="n-panel-body">
          ${subjects.length === 0 ? empty("Nincs tantárgy.") : `<ul class="n-list">${subjects.map((s) => `
            <li><div class="n-list-title">${esc(s.Nev)}</div><div class="n-list-meta">${esc(s.Uid)}</div></li>
          `).join("")}</ul>`}
        </div>
      </div>
      <div class="n-panel">
        <div class="n-panel-head">Osztályfőnöki osztályok</div>
        <div class="n-panel-body">
          ${classes.length === 0 ? empty("Nincs.") : `<ul class="n-list">${classes.map((c) => `
            <li><div class="n-list-title">${esc(c.Nev)}</div><div class="n-list-meta">${esc(c.Uid)}</div></li>
          `).join("")}</ul>`}
        </div>
      </div>
    </div>`;
}


function renderTimetable() {
  const lessons = Array.isArray(cache.timetable) ? cache.timetable.slice() : [];
  const groups = Array.isArray(cache.groups) ? cache.groups : [];
  const t = cache.teacher || {};
  const subjects = Array.isArray(t.Tantargyak) ? t.Tantargyak : [];
  const groupOpts = groups.map((g) => `<option value="${esc(g.Uid)}">${esc(g.Nev)}</option>`).join("");
  const subjOpts = subjects.map((s) => `<option value="${esc(s.Uid)}">${esc(s.Nev)}</option>`).join("");

  lessons.sort((a, b) => {
    const da = (a.Datum || "").slice(0, 10);
    const db = (b.Datum || "").slice(0, 10);
    if (da !== db) return da.localeCompare(db);
    return (a.Oraszam || 0) - (b.Oraszam || 0);
  });

  const rows = lessons.length
    ? lessons.map((l) => {
        const date = (l.Datum || "").slice(0, 10);
        return `<tr data-uid="${esc(l.Uid)}">
          <td>${fmtDate(date)} <span class="k-grade-meta">${esc(weekdayName(date))}</span></td>
          <td>${esc(l.Oraszam ?? "")}.</td>
          <td>${fmtTime(l.KezdetIdopont)}–${fmtTime(l.VegIdopont)}</td>
          <td>${esc(subjectName(l) || l.Nev || "—")}</td>
          <td>${esc(l.OsztalyCsoport?.Nev || "")}</td>
          <td>${esc(l.TeremNeve || "")}</td>
          <td>${esc(l.Tema || "")}</td>
          <td style="white-space:nowrap">
            <button type="button" class="k-logout tt-edit" data-uid="${esc(l.Uid)}">Szerkeszt</button>
            <button type="button" class="k-logout tt-del" data-uid="${esc(l.Uid)}">Törlés</button>
            <button type="button" class="k-logout tt-log" data-uid="${esc(l.Uid)}" title="Óra naplózása">Napló</button>
          </td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="8" class="n-empty">Nincs órarendi elem. Add hozzá lent.</td></tr>`;

  return `
    <div class="n-panel">
      <div class="n-panel-head">Órarend szerkesztése</div>
      <div class="n-panel-body">
        <form id="ttForm" class="n-form" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;align-items:end;">
          <input type="hidden" id="ttUid" value="" />
          <div><label>Dátum</label><input type="date" id="ttDate" required /></div>
          <div><label>Óraszám</label><input type="number" id="ttOra" min="1" max="12" value="1" /></div>
          <div><label>Kezdet</label><input type="time" id="ttStart" value="08:00" /></div>
          <div><label>Vég</label><input type="time" id="ttEnd" value="08:45" /></div>
          <div><label>Tantárgy</label><select id="ttSubj">${subjOpts || '<option value="">—</option>'}</select></div>
          <div><label>vagy tantárgy név</label><input type="text" id="ttSubjName" placeholder="pl. Matematika" /></div>
          <div><label>Osztály</label><select id="ttGroup">${groupOpts || '<option value="">—</option>'}</select></div>
          <div><label>Terem</label><input type="text" id="ttRoom" placeholder="pl. 12." /></div>
          <div style="grid-column:1/-1"><label>Téma (órai)</label><input type="text" id="ttTema" placeholder="Óra témája" style="width:100%" /></div>
          <div style="grid-column:1/-1;display:flex;gap:8px;align-items:center;">
            <button type="submit" class="k-btn k-btn-primary" id="ttSave">Mentés / hozzáadás</button>
            <button type="button" class="k-btn" id="ttReset">Új óra</button>
            <span id="ttMsg" class="k-grade-meta"></span>
          </div>
        </form>
      </div>
    </div>
    <div class="n-panel">
      <div class="n-panel-head">Órarendi elemek</div>
      <div class="n-panel-body" style="padding:0">
        <div class="n-table-wrap"><table class="n-table">
          <thead><tr>
            <th>Dátum</th><th>Óra</th><th>Idő</th><th>Tantárgy</th><th>Osztály</th><th>Terem</th><th>Téma</th><th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>
    </div>`;
}

function bindTimetable() {
  const form = document.getElementById("ttForm");
  if (!form) return;
  const msg = document.getElementById("ttMsg");
  document.getElementById("ttReset")?.addEventListener("click", () => {
    form.reset();
    document.getElementById("ttUid").value = "";
    if (msg) msg.textContent = "Új óra hozzáadása";
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const uid = document.getElementById("ttUid").value.trim();
    const subjSel = document.getElementById("ttSubj");
    const subjName = (document.getElementById("ttSubjName").value || "").trim() ||
      (subjSel.options[subjSel.selectedIndex]?.text || "");
    const groupSel = document.getElementById("ttGroup");
    const body = {
      Uid: uid || undefined,
      Datum: document.getElementById("ttDate").value,
      Oraszam: Number(document.getElementById("ttOra").value) || 1,
      KezdetIdopont: document.getElementById("ttStart").value,
      VegIdopont: document.getElementById("ttEnd").value,
      TantargyUid: subjSel.value,
      TantargyNev: subjName,
      OsztalyCsoportUid: groupSel.value,
      OsztalyCsoportNev: groupSel.options[groupSel.selectedIndex]?.text || "",
      TeremNeve: document.getElementById("ttRoom").value.trim(),
      Tema: document.getElementById("ttTema").value.trim()
    };
    try {
      if (msg) msg.textContent = "Mentés…";
      if (uid) {
        await apiPut("/naplo/v3/sajat/OrarendElemek", body);
      } else {
        await apiPost("/naplo/v3/sajat/OrarendElemek", body);
      }
      cache.timetable = await apiGet("/naplo/v3/sajat/OrarendElemek");
      navigate("timetable");
    } catch (err) {
      if (msg) msg.textContent = "Hiba: " + (err.message || err);
    }
  });
  document.querySelectorAll(".tt-del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Törlöd ezt az órarendi elemet?")) return;
      try {
        await apiDelete("/naplo/v3/sajat/OrarendElemek?uid=" + encodeURIComponent(btn.dataset.uid));
        cache.timetable = await apiGet("/naplo/v3/sajat/OrarendElemek");
        navigate("timetable");
      } catch (err) {
        alert(err.message || err);
      }
    });
  });
  document.querySelectorAll(".tt-edit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const l = (cache.timetable || []).find((x) => x.Uid === btn.dataset.uid);
      if (!l) return;
      document.getElementById("ttUid").value = l.Uid || "";
      document.getElementById("ttDate").value = (l.Datum || "").slice(0, 10);
      document.getElementById("ttOra").value = l.Oraszam || 1;
      const st = (l.KezdetIdopont || "").match(/T(\d{2}:\d{2})/);
      const en = (l.VegIdopont || "").match(/T(\d{2}:\d{2})/);
      if (st) document.getElementById("ttStart").value = st[1];
      if (en) document.getElementById("ttEnd").value = en[1];
      const subj = document.getElementById("ttSubj");
      if (subj && l.Tantargy?.Uid) subj.value = l.Tantargy.Uid;
      document.getElementById("ttSubjName").value = subjectName(l) || l.Nev || "";
      const grp = document.getElementById("ttGroup");
      if (grp && l.OsztalyCsoport?.Uid) grp.value = l.OsztalyCsoport.Uid;
      document.getElementById("ttRoom").value = l.TeremNeve || "";
      document.getElementById("ttTema").value = l.Tema || "";
      if (msg) msg.textContent = "Szerkesztés: " + (subjectName(l) || l.Uid);
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  document.querySelectorAll(".tt-log").forEach((btn) => {
    btn.addEventListener("click", () => {
      navigate("naplo", { lessonUid: btn.dataset.uid });
    });
  });
}

function renderNaplo(opts = {}) {
  const students = Array.isArray(cache.students) ? cache.students : [];
  const lessons = Array.isArray(cache.timetable) ? cache.timetable : [];
  const lessonUid = opts.lessonUid || "";
  const lessonOpts = lessons
    .slice()
    .sort((a, b) => String(b.Datum || "").localeCompare(String(a.Datum || "")))
    .map((l) => {
      const label = `${fmtDate(l.Datum)} ${l.Oraszam || ""}. ${subjectName(l) || l.Nev || ""} (${l.OsztalyCsoport?.Nev || ""})`;
      return `<option value="${esc(l.Uid)}"${l.Uid === lessonUid ? " selected" : ""}>${esc(label)}</option>`;
    })
    .join("");

  const rows = students.map((s, i) => {
    const uid = s.Uid || s.uid;
    return `<tr data-uid="${esc(uid)}">
      <td>${i + 1}</td>
      <td>${esc(s.Nev || uid)}</td>
      <td>
        <span class="seg" data-uid="${esc(uid)}">
          <button type="button" class="att-j on-j" data-v="jelen">Jelen</button>
          <button type="button" class="att-h" data-v="hianyzas">Hiányzik</button>
          <button type="button" class="att-k" data-v="keses">Késés</button>
        </span>
      </td>
      <td><input type="number" min="0" max="45" value="" class="late-inp" data-uid="${esc(uid)}" style="width:56px" title="Késés perc" /></td>
    </tr>`;
  }).join("") || `<tr><td colspan="4" class="n-empty">Nincs diák a listában.</td></tr>`;

  return `
    <div class="n-panel">
      <div class="n-panel-head">Óra naplózása</div>
      <div class="n-panel-body">
        <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin-bottom:12px;">
          <div>
            <label>Órarendi óra</label>
            <select id="naploLesson" style="min-width:280px">${lessonOpts || '<option value="">— nincs órarend —</option>'}</select>
          </div>
          <div>
            <label>Óra témája</label>
            <input id="naploTema" type="text" placeholder="pl. Másodfokú egyenletek" style="min-width:220px;padding:6px;border:1px solid #c5d3e2" />
          </div>
          <button type="button" class="k-btn k-btn-primary" id="naploSave">Jelenlét mentése</button>
          <span id="naploMsg" class="k-grade-meta"></span>
        </div>
        <div class="n-table-wrap"><table class="n-table">
          <thead><tr><th>#</th><th>Név</th><th>Jelenlét</th><th>Késés (perc)</th></tr></thead>
          <tbody id="naploBody">${rows}</tbody>
        </table></div>
        <p class="k-grade-meta" style="margin-top:8px">Hiányzás / késés mentésekor mulasztás jön létre. Az óra témája az órarendi elemre is ráíródik (ha van kiválasztott óra).</p>
      </div>
    </div>`;
}

function bindNaplo(opts = {}) {
  document.querySelectorAll("#naploBody .seg button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const seg = btn.closest(".seg");
      seg.querySelectorAll("button").forEach((b) => b.classList.remove("on-j", "on-h", "on-k"));
      const v = btn.dataset.v;
      if (v === "jelen") btn.classList.add("on-j");
      else if (v === "hianyzas") btn.classList.add("on-h");
      else btn.classList.add("on-k");
    });
  });
  const lesSel = document.getElementById("naploLesson");
  const fillTema = () => {
    const l = (cache.timetable || []).find((x) => x.Uid === lesSel?.value);
    const tema = document.getElementById("naploTema");
    if (l && tema && !tema.value) tema.value = l.Tema || "";
  };
  lesSel?.addEventListener("change", fillTema);
  fillTema();

  document.getElementById("naploSave")?.addEventListener("click", async () => {
    const msg = document.getElementById("naploMsg");
    const tema = (document.getElementById("naploTema")?.value || "").trim();
    const lessonUid = document.getElementById("naploLesson")?.value || "";
    const lesson = (cache.timetable || []).find((x) => x.Uid === lessonUid);
    const jelenletek = [];
    document.querySelectorAll("#naploBody tr[data-uid]").forEach((row) => {
      const uid = row.dataset.uid;
      const active = row.querySelector(".seg button.on-j, .seg button.on-h, .seg button.on-k");
      const v = active?.dataset?.v || "jelen";
      const late = Number(row.querySelector(".late-inp")?.value) || 0;
      jelenletek.push({
        TanuloUid: uid,
        Tipus: v,
        KesesPercben: v === "keses" ? (late || 5) : 0
      });
    });
    try {
      if (msg) msg.textContent = "Mentés…";
      const res = await apiPost("/naplo/v3/sajat/Orarend/OraNaplozas", {
        OrarendElemUid: lessonUid,
        Datum: (lesson?.Datum || new Date().toISOString()).slice(0, 10),
        Tema: tema,
        OsztalyCsoportUid: lesson?.OsztalyCsoport?.Uid || "",
        Jelenletek: jelenletek
      });
      try { cache.absences = await apiGet("/naplo/v3/sajat/Mulasztasok"); } catch (_) {}
      try { cache.timetable = await apiGet("/naplo/v3/sajat/OrarendElemek"); } catch (_) {}
      if (msg) {
        const n = (res && res.mulasztasDb != null) ? res.mulasztasDb : "?";
        msg.textContent = "Naplózva. Mulasztások: " + n + (tema ? " · téma mentve" : "");
      }
    } catch (err) {
      if (msg) msg.textContent = "Hiba: " + (err.message || err);
    }
  });
}

const RENDERERS = {
  eugy: renderEUGY,
  documents: renderDocuments,
  dkt: renderDKT,
  dashboard: renderDashboard,
  grade: renderGradeForm,
  grades: renderGrades,
  absences: renderAbsences,
  students: renderStudents,
  studentNew: renderStudentNew,
  timetable: renderTimetable,
  naplo: renderNaplo,
  homework: renderHomework,
  profile: renderProfile
};

function closeSidebar() {
  document.getElementById("sidebar")?.classList.remove("open");
  const o = document.getElementById("overlay");
  if (o) o.style.display = "none";
}
function fillHeader() {
  const t = cache.teacher || {};
  document.getElementById("userName").textContent = t.Nev || localStorage.getItem("local_usr") || "Osztályfőnök";
  document.getElementById("userCode").textContent = t.Uid ? ("UID: " + t.Uid) : "";
  document.getElementById("instName").textContent = t.IntezmenyNev || "KRÁTA";
  const ty = document.getElementById("tanev");
  if (ty) ty.textContent = t.TanevUid || "";
}

function navigate(page, opts = {}) {
  if (page === "eugy") {
    window.location.href = "https://puspus-dev.github.io/ujkreta/eugyintezes/";
    return;
  }
  if (page === "dkt") {
    window.location.href = "https://puspus-dev.github.io/ujkreta/dkt/";
    return;
  }
  if (!RENDERERS[page]) page = "dashboard";
  currentPage = page;
  const title = (PAGE_META && PAGE_META[page]) ? String(PAGE_META[page]) : page;
  const pt = document.getElementById("pageTitle");
  if (pt) pt.textContent = title;
  const bc = document.getElementById("bcPage");
  if (bc) bc.textContent = title;
  document.querySelectorAll(".n-nav-item, .k-nav-item").forEach((b) => {
    b.classList.toggle("active", b.dataset.page === page);
  });
  const el = document.getElementById("pageContent");
  if (!el) return;
  try {
    el.innerHTML = (RENDERERS[page] || renderDashboard)();
  } catch (err) {
    console.error(err);
    el.innerHTML = `<div class="n-panel"><div class="n-panel-body">Nézet hiba: ${esc(err.message || err)}</div></div>`;
  }
  try {
    if (page === "grade") {
      if (typeof bindGradeForm === "function") bindGradeForm();
      if (typeof bindGradeClicks === "function") bindGradeClicks();
    }
    if (page === "absences" && typeof bindAbsences === "function") bindAbsences();
    if (page === "studentNew" && typeof bindStudentNew === "function") bindStudentNew();
    if (page === "homework" && typeof bindHomework === "function") bindHomework();
    if (page === "documents" && typeof bindDocuments === "function") bindDocuments();
  if (page === "timetable" && typeof bindTimetable === "function") bindTimetable();
  if (page === "naplo" && typeof bindNaplo === "function") bindNaplo(opts || {});

    if (page === "grades") {
      document.querySelectorAll(".del-grade").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!confirm("Törlöd a jegyet?")) return;
          try {
            await apiDelete("/naplo/v3/sajat/Ertekelesek?uid=" + encodeURIComponent(btn.dataset.uid));
            cache.grades = await apiGet("/naplo/v3/sajat/Ertekelesek");
            navigate("grades");
          } catch (err) {
            alert("Törlés sikertelen: " + (err.message || err));
          }
        });
      });
    }
    document.querySelectorAll("[data-go]").forEach((b) => {
      b.onclick = () => navigate(b.getAttribute("data-go"));
    });
  } catch (err) {
    console.error("bind page", err);
  }
  closeSidebar();
}

async function boot() {
  accessToken = getStoredToken();
  if (!accessToken) {
    window.location.href = LOGIN_URL;
    return;
  }

  document.getElementById("logoutBtn").addEventListener("click", goLogin);
  document.getElementById("menuBtn").addEventListener("click", () => {
    document.getElementById("sidebar").classList.add("open");
    document.getElementById("overlay").style.display = "block";
  });
  document.getElementById("overlay").addEventListener("click", closeSidebar);
  document.querySelectorAll(".n-nav-item").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.page));
  });

  document.querySelectorAll(".m-tab[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.page));
  });
  document.getElementById("moreBtn")?.addEventListener("click", () => {
    document.getElementById("sidebar").classList.add("open");
    document.getElementById("overlay").style.display = "block";
  });

  try {
    await loadAllData();
  } catch (e) {
    console.error("loadAllData", e);
  }
  try {
    document.getElementById("bootMsg").style.display = "none";
    document.getElementById("appShell").style.display = "block";
    fillHeader();
    navigate("dashboard");
  } catch (e) {
    console.error("boot UI", e);
    const bm = document.getElementById("bootMsg");
    if (bm) bm.innerHTML = '<div class="boot-text">Betöltési hiba: ' + (e.message || e) + '</div>';
  }
}

boot();
