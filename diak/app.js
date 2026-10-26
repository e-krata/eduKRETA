/* ============================================================
   KRÁTA Hallgatói Web (Neptun-szerű)
   Login: csak a főoldalon. Token nélkül vissza a gyökérre.
   ============================================================ */

const API_BASE = "https://edukreta.onrender.com";
const LOGIN_URL = "https://e-krata.github.io/eduKRETA/";

const TOKEN_KEYS = ["access_token", "ujkreta_access_token"];
const REFRESH_KEYS = ["refresh_token", "ujkreta_refresh_token"];

const PAGE_META = {
  dashboard: "Kezdőlap",
  grades: "Értékelések",
  timetable: "Órarend",
  homework: "Házi feladatok",
  eugy: "e-Ügyintézés",
  documents: "Digitális dokumentumok",
  dkt: "DKT – Digitális Kollaborációs Tér",
  tests: "Számonkérések",
  absences: "Mulasztások",
  notices: "Faliújság",
  notes: "Feljegyzések",
  lep: "LEP programok",
  profile: "Személyes adatok"
};

let accessToken = null;
let cache = {};
let currentPage = "dashboard";

function redirectIfWrongRole() {
  const role = (localStorage.getItem("ujkreta_role") || "").toLowerCase();
  if (role.indexOf("osztalyfonok") !== -1 || role === "of") {
    window.location.href = "https://puspus-dev.github.io/ujkreta/osztalyfonok/";
    return true;
  }
  if (role.indexOf("tanar") !== -1 || role === "teacher") {
    window.location.href = "https://puspus-dev.github.io/ujkreta/tanar/";
    return true;
  }
  return false;
}

function getStoredToken() {
  for (const k of TOKEN_KEYS) {
    const v = localStorage.getItem(k);
    if (v) return v;
  }
  return null;
}

function clearTokens() {
  for (const k of [...TOKEN_KEYS, ...REFRESH_KEYS, "local_usr", "local_pw"]) {
    localStorage.removeItem(k);
  }
}

function goLogin() {
  clearTokens();
  window.location.href = LOGIN_URL;
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });
  if (res.status === 401) {
    goLogin();
    throw new Error("401");
  }
  if (!res.ok) {
    console.warn("API", path, res.status);
    return null;
  }
  return res.json();
}

async function loadAllData() {
  const map = {
    student: "/ellenorzo/v3/sajat/TanuloAdatlap",
    grades: "/ellenorzo/v3/sajat/Ertekelesek",
    timetable: "/ellenorzo/v3/sajat/OrarendElemek",
    homework: "/ellenorzo/v3/sajat/HaziFeladatok",
    tests: "/ellenorzo/v3/sajat/BejelentettSzamonkeresek",
    absences: "/ellenorzo/v3/sajat/Mulasztasok",
    notes: "/ellenorzo/v3/sajat/Feljegyzesek",
    notices: "/ellenorzo/v3/sajat/FaliujsagElemek",
    groups: "/ellenorzo/v3/sajat/OsztalyCsoportok",
    dkt: "/dktapi/intezmenyek/munkaterek/tanulok"
  };
  const keys = Object.keys(map);
  const vals = await Promise.all(keys.map((k) => apiGet(map[k]).catch(() => null)));
  cache = {};
  keys.forEach((k, i) => { cache[k] = vals[i]; });
  return cache;
}

function esc(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
    return d.toLocaleDateString("hu-HU");
  } catch {
    return String(iso).slice(0, 10);
  }
}

function fmtTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function weekdayName(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("hu-HU", { weekday: "long" });
  } catch {
    return "";
  }
}

function subjectName(obj) {
  if (!obj) return "?";
  return obj.Tantargy?.Nev || obj.TantargyNev || obj.TantargyNeve || obj.Nev || "?";
}

function gradeClass(n) {
  const v = Number(n);
  if (v >= 5) return "n-grade-5";
  if (v >= 4) return "n-grade-4";
  if (v >= 3) return "n-grade-3";
  if (v >= 2) return "n-grade-2";
  if (v >= 1) return "n-grade-1";
  return "";
}

function empty(t) {
  return `<div class="n-empty">${esc(t)}</div>`;
}

/* ---------- pages ---------- */

function renderDashboard() {
  const grades = (Array.isArray(cache.grades) ? cache.grades : []).slice(0, 8);
  const abs = (Array.isArray(cache.absences) ? cache.absences : []).slice(0, 5);
  const notes = (Array.isArray(cache.notes) ? cache.notes : []).slice(0, 5);
  const tests = (Array.isArray(cache.tests) ? cache.tests : []).slice(0, 5);
  const notices = Array.isArray(cache.notices) ? cache.notices : [];

  const gradeRows = grades.length ? grades.map(g => {
    const n = g.SzamErtek ?? g.szamErtek ?? "";
    const sub = (g.Tantargy && (g.Tantargy.Nev || g.Tantargy.nev)) || g.Tema || "—";
    const d = fmtDate(g.KeszitesDatuma || g.RogzitesDatuma || "");
    return `<div class="k-grade-row"><div class="k-grade-num">${esc(n)}</div>
      <div><div>${esc(sub)}</div><div class="k-grade-meta">${esc(d)}</div></div></div>`;
  }).join("") : `<div class="k-card-empty">Nincsenek megjeleníthető értékelések</div>`;

  const absBody = abs.length ? abs.map(a =>
    `<div class="k-grade-row"><div>${esc(fmtDate(a.Datum || a.Kezdete || ""))}</div>
     <div class="k-grade-meta">${esc(a.Tipus?.Nev || a.IgazolasAllapota?.Nev || "Mulasztás")}</div></div>`
  ).join("") : `<div class="k-card-empty">Nincsenek megjeleníthető mulasztások</div>`;

  const noteBody = notes.length ? notes.map(n =>
    `<div class="k-grade-row"><div>${esc(n.Cim || n.Tipus?.Nev || "Feljegyzés")}</div>
     <div class="k-grade-meta">${esc(fmtDate(n.Datum || n.KeszitesDatuma || ""))}</div></div>`
  ).join("") : `<div class="k-card-empty">Nincs feljegyzés</div>`;

  const testBody = tests.length ? tests.map(t =>
    `<div class="k-grade-row"><div>${esc(t.Nev || t.Tema || "Dolgozat")}</div>
     <div class="k-grade-meta">${esc(fmtDate(t.Datum || t.BejelentesDatuma || ""))}</div></div>`
  ).join("") : `<div class="k-card-empty">Nincsenek megjeleníthető bejelentett dolgozatok</div>`;

  const tl = notices.length ? notices.map(n =>
    `<div class="k-tl-item"><div class="t">${esc(n.Cim || n.Title || "Bejegyzés")}</div>
     <div class="d">${esc(fmtDate(n.Datum || n.KeszitesDatuma || ""))}</div>
     <div>${esc(n.Szoveg || n.Leiras || "")}</div></div>`
  ).join("") : `<div class="k-tl-body">A faliújság jelenleg üres</div>`;

  return `
    <div class="k-dash">
      <div class="k-card"><div class="k-card-h">Legutóbbi értékelések</div><div class="k-card-b">${gradeRows}</div></div>
      <div class="k-card"><div class="k-card-h">Legutóbbi mulasztások</div><div class="k-card-b">${absBody}</div></div>
      <div class="k-card"><div class="k-card-h">Legutóbbi feljegyzések</div><div class="k-card-b">${noteBody}</div></div>
      <div class="k-card"><div class="k-card-h">Következő bejelentett dolgozatok</div><div class="k-card-b">${testBody}</div></div>
    </div>
    <div class="k-timeline">
      <div class="k-tl-bar">Nincs bejegyzés</div>
      ${notices.length ? `<div class="k-tl-body">${tl}</div>` : `<div class="k-tl-body">A faliújság jelenleg üres</div>`}
    </div>`;
}

function renderGrades() {
  const grades = Array.isArray(cache.grades) ? cache.grades : [];
  if (!grades.length) return `<div class="n-panel"><div class="n-panel-body">${empty("Nincsenek értékelések.")}</div></div>`;

  const by = {};
  grades.forEach((g) => {
    const n = subjectName(g);
    (by[n] ||= []).push(g);
  });

  return Object.entries(by)
    .sort(([a], [b]) => a.localeCompare(b, "hu"))
    .map(([name, list]) => {
      const nums = list.map((g) => Number(g.SzamErtek)).filter((n) => n > 0);
      const avg = nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : "—";
      const rows = [...list]
        .sort((a, b) => new Date(b.KeszitesDatuma || b.RogzitesDatuma || 0) - new Date(a.KeszitesDatuma || a.RogzitesDatuma || 0))
        .map((g) => `
          <tr>
            <td><span class="n-grade ${gradeClass(g.SzamErtek)}">${esc(g.SzamErtek ?? g.SzovegesErtek ?? "?")}</span></td>
            <td>${esc(g.Tema || "—")}</td>
            <td>${esc(g.Tipus?.Nev || "—")}</td>
            <td>${esc(g.ErtekeloTanarNeve || "—")}</td>
            <td>${g.SulySzazalekErteke != null ? esc(g.SulySzazalekErteke) + "%" : "—"}</td>
            <td>${fmtDate(g.KeszitesDatuma || g.RogzitesDatuma)}</td>
          </tr>`).join("");
      return `
        <div class="n-panel">
          <div class="n-panel-head">${esc(name)} <span style="font-weight:500;color:var(--n-muted);">· átlag: ${esc(avg)} · ${list.length} db</span></div>
          <div class="n-panel-body" style="padding:0;">
            <div class="n-table-wrap"><table class="n-table">
              <thead><tr><th>Jegy</th><th>Téma</th><th>Típus</th><th>Tanár</th><th>Súly</th><th>Dátum</th></tr></thead>
              <tbody>${rows}</tbody>
            </table></div>
          </div>
        </div>`;
    })
    .join("");
}

function renderTimetable() {
  const lessons = Array.isArray(cache.timetable) ? cache.timetable : [];
  if (!lessons.length) return `<div class="n-panel"><div class="n-panel-body">${empty("Nincs órarend adat.")}</div></div>`;

  const by = {};
  lessons.forEach((l) => {
    const k = (l.Datum || "").slice(0, 10) || "ismeretlen";
    (by[k] ||= []).push(l);
  });

  return Object.entries(by)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => {
      const sorted = [...list].sort((a, b) => (a.Oraszam || 0) - (b.Oraszam || 0));
      return `
        <div class="n-panel">
          <div class="n-panel-head">${esc(weekdayName(date))} · ${fmtDate(date)}</div>
          <div class="n-panel-body" style="padding:0;">
            ${sorted.map((l) => `
              <div class="n-lesson">
                <div class="n-lesson-num">${esc(l.Oraszam ?? "")}.</div>
                <div class="n-lesson-time">${fmtTime(l.KezdetIdopont)}–${fmtTime(l.VegIdopont)}</div>
                <div>
                  <div class="n-lesson-subj">${esc(subjectName(l) || l.Nev)}</div>
                  <div class="n-lesson-meta">${esc(l.TanarNeve || "")}${l.Allapot?.Nev ? " · " + esc(l.Allapot.Nev) : ""}</div>
                </div>
                <div class="n-lesson-meta">${esc(l.TeremNeve || "")}</div>
              </div>`).join("")}
          </div>
        </div>`;
    })
    .join("");
}

function renderHomework() {
  const list = Array.isArray(cache.homework) ? cache.homework : [];
  if (!list.length) return `<div class="n-panel"><div class="n-panel-body">${empty("Nincsenek házi feladatok.")}</div></div>`;

  const sorted = [...list].sort((a, b) => new Date(a.HataridoDatuma || a.Hatarido || 0) - new Date(b.HataridoDatuma || b.Hatarido || 0));

  return `
    <div class="n-panel">
      <div class="n-panel-head">Házi feladatok</div>
      <div class="n-panel-body" style="padding:0;">
        <div class="n-table-wrap"><table class="n-table">
          <thead><tr><th>Tantárgy</th><th>Feladat</th><th>Tanár</th><th>Feladva</th><th>Határidő</th><th>Állapot</th></tr></thead>
          <tbody>${sorted.map((h) => {
            const done = !!h.IsMegoldva;
            return `<tr>
              <td>${esc(subjectName(h))}</td>
              <td>${esc(h.Szoveg || "—")}</td>
              <td>${esc(h.RogzitoTanarNeve || "—")}</td>
              <td>${fmtDate(h.FeladasDatuma || h.RogzitesIdopontja)}</td>
              <td>${fmtDate(h.HataridoDatuma || h.Hatarido)}</td>
              <td><span class="n-badge ${done ? "n-badge-ok" : "n-badge-warn"}">${done ? "Kész" : "Nyitott"}</span></td>
            </tr>`;
          }).join("")}</tbody>
        </table></div>
      </div>
    </div>`;
}

function renderTests() {
  const list = Array.isArray(cache.tests) ? cache.tests : [];
  if (!list.length) return `<div class="n-panel"><div class="n-panel-body">${empty("Nincsenek bejelentett számonkérések.")}</div></div>`;

  const sorted = [...list].sort((a, b) => new Date(a.Datum || 0) - new Date(b.Datum || 0));

  return `
    <div class="n-panel">
      <div class="n-panel-head">Bejelentett számonkérések</div>
      <div class="n-panel-body" style="padding:0;">
        <div class="n-table-wrap"><table class="n-table">
          <thead><tr><th>Dátum</th><th>Tantárgy</th><th>Téma</th><th>Mód</th><th>Tanár</th><th>Bejelentés</th></tr></thead>
          <tbody>${sorted.map((t) => `
            <tr>
              <td>${fmtDate(t.Datum)}</td>
              <td>${esc(subjectName(t))}</td>
              <td>${esc(t.Temaja || "—")}</td>
              <td>${esc(t.Modja?.Nev || "—")}</td>
              <td>${esc(t.RogzitoTanarNeve || "—")}</td>
              <td>${fmtDate(t.BejelentesDatuma)}</td>
            </tr>`).join("")}</tbody>
        </table></div>
      </div>
    </div>`;
}


function absenceIcon(a) {
  const t = ((a.Tipus && (a.Tipus.Nev || a.Tipus.nev)) || a.TipusNev || "").toLowerCase();
  const ig = ((a.IgazolasAllapota && (a.IgazolasAllapota.Nev || a.IgazolasAllapota.nev)) || "").toLowerCase();
  if (t.indexOf("késés") >= 0 || t.indexOf("keses") >= 0) {
    if (ig.indexOf("igazolatlan") >= 0) return "icons/icon_igazolatlan_keses.png";
    if (ig.indexOf("igazolt") >= 0) return "icons/icon_igazolt_keses.png";
    return "icons/icon_pending_keses.png";
  }
  if (ig.indexOf("igazolatlan") >= 0) return "icons/icon_igazolatlan_hianyzas.png";
  if (ig.indexOf("igazolt") >= 0) return "icons/icon_igazolt_hianyzas.png";
  if (ig.indexOf("pending") >= 0 || ig.indexOf("függő") >= 0) return "icons/icon_pending_hianyzas.png";
  return "icons/icon_jelenlet.png";
}

function renderAbsences() {
  const list = Array.isArray(cache.absences) ? cache.absences : [];
  if (!list.length) return `<div class="n-panel"><div class="n-panel-body">${empty("Nincsenek mulasztások.")}</div></div>`;

  const sorted = [...list].sort((a, b) => new Date(b.Datum || 0) - new Date(a.Datum || 0));

  return `
    <div class="n-panel">
      <div class="n-panel-head">Mulasztások</div>
      <div class="n-panel-body" style="padding:0;">
        <div class="n-table-wrap"><table class="n-table">
          <thead><tr><th>Dátum</th><th>Tantárgy</th><th>Óra</th><th>Típus</th><th>Igazolás</th><th>Tanár</th></tr></thead>
          <tbody>${sorted.map((m) => {
            const st = m.IgazolasAllapota || "";
            const badge = st === "Igazolt" ? "n-badge-ok" : st ? "n-badge-warn" : "n-badge-bad";
            return `<tr>
              <td>${fmtDate(m.Datum)}</td>
              <td>${esc(subjectName(m))}</td>
              <td>${esc(m.Ora?.Oraszam ?? "—")}</td>
              <td>${esc(m.Tipus?.Nev || "—")}</td>
              <td><span class="n-badge ${badge}">${esc(st || "Nincs")}</span></td>
              <td>${esc(m.RogzitoTanarNeve || "—")}</td>
            </tr>`;
          }).join("")}</tbody>
        </table></div>
      </div>
    </div>`;
}

function renderNotices() {
  const list = Array.isArray(cache.notices) ? cache.notices : [];
  if (!list.length) return `<div class="n-panel"><div class="n-panel-body">${empty("A faliújság üres.")}</div></div>`;

  return list.map((n) => `
    <div class="n-panel">
      <div class="n-panel-head">${esc(n.Cim || "Közlemény")}</div>
      <div class="n-panel-body">
        <div class="n-list-meta" style="margin-bottom:8px;">${esc(n.RogzitoNeve || "")} · ${fmtDate(n.ErvenyessegKezdete)} – ${fmtDate(n.ErvenyessegVege)}</div>
        <div style="white-space:pre-wrap;">${esc(n.TartalomText || n.Tartalom || "")}</div>
      </div>
    </div>`).join("");
}

function renderNotes() {
  const list = Array.isArray(cache.notes) ? cache.notes : [];
  if (!list.length) return `<div class="n-panel"><div class="n-panel-body">${empty("Nincsenek feljegyzések.")}</div></div>`;

  const sorted = [...list].sort((a, b) => new Date(b.Datum || b.KeszitesDatuma || 0) - new Date(a.Datum || a.KeszitesDatuma || 0));

  return `
    <div class="n-panel">
      <div class="n-panel-head">Feljegyzések</div>
      <div class="n-panel-body" style="padding:0;">
        <div class="n-table-wrap"><table class="n-table">
          <thead><tr><th>Dátum</th><th>Cím / típus</th><th>Tartalom</th><th>Tanár</th></tr></thead>
          <tbody>${sorted.map((n) => `
            <tr>
              <td>${fmtDate(n.Datum || n.KeszitesDatuma)}</td>
              <td>${esc(n.Cim || n.Tipus?.Nev || "—")}</td>
              <td>${esc(n.Tartalom || n.Szoveg || "—")}</td>
              <td>${esc(n.KeszitoTanarNeve || "—")}</td>
            </tr>`).join("")}</tbody>
        </table></div>
      </div>
    </div>`;
}

function renderProfile() {
  const s = cache.student || {};
  const groups = Array.isArray(cache.groups) ? cache.groups : [];
  const gonds = Array.isArray(s.Gondviselok) ? s.Gondviselok : [];
  const birth = s.SzuletesiEv && s.SzuletesiHonap && s.SzuletesiNap
    ? `${s.SzuletesiEv}.${String(s.SzuletesiHonap).padStart(2, "0")}.${String(s.SzuletesiNap).padStart(2, "0")}.`
    : "—";

  return `
    <div class="n-panel" style="margin-bottom:12px;">
      <div class="n-panel-body" style="display:flex;align-items:center;gap:16px;">
        <img src="icons/noprofilepic.png" alt="Profilkép" class="profile-pic" width="72" height="72"
          style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:2px solid var(--ek-line,#c5d3e2);background:#f4f4f4;">
        <div>
          <div style="font-size:18px;font-weight:700;">${esc(s.Nev || "—")}</div>
          <div style="color:var(--k-muted,#5a6a70);font-size:13px;">${esc(s.EmailCim || "")}</div>
        </div>
      </div>
    </div>
    <div class="n-grid n-grid-2">
      <div class="n-panel">
        <div class="n-panel-head">Személyes adatok</div>
        <div class="n-panel-body" style="padding:0;">
          <div class="n-kv">
            <div class="k">Név</div><div>${esc(s.Nev || "—")}</div>
            <div class="k">E-mail</div><div>${esc(s.EmailCim || "—")}</div>
            <div class="k">Születési dátum</div><div>${esc(birth)}</div>
            <div class="k">Cím</div><div>${esc((s.Cimek && s.Cimek[0]) || "—")}</div>
            <div class="k">UID</div><div>${esc(s.Uid || "—")}</div>
          </div>
        </div>
      </div>
      <div class="n-panel">
        <div class="n-panel-head">Intézmény / képzés</div>
        <div class="n-panel-body" style="padding:0;">
          <div class="n-kv">
            <div class="k">Intézmény</div><div>${esc(s.IntezmenyNev || "—")}</div>
            <div class="k">Azonosító</div><div>${esc(s.IntezmenyAzonosito || "—")}</div>
            <div class="k">Tanév</div><div>${esc(s.TanevUid || "—")}</div>
            <div class="k">Osztály</div><div>${esc(groups.map((g) => g.Nev).filter(Boolean).join(", ") || "—")}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="n-panel">
      <div class="n-panel-head">Gondviselők</div>
      <div class="n-panel-body">
        ${gonds.length === 0 ? empty("Nincs gondviselő adat.") : `<ul class="n-list">${gonds.map((g) => `
          <li>
            <div class="n-list-title">${esc(g.Nev || "—")}</div>
            <div class="n-list-meta">${esc(g.EmailCim || "")}${g.Telefonszam ? " · " + esc(g.Telefonszam) : ""}${g.IsTorvenyesKepviselo ? " · Törvényes képviselő" : ""}</div>
          </li>`).join("")}</ul>`}
      </div>
    </div>`;
}

const RENDERERS = {
  dashboard: renderDashboard,
  grades: renderGrades,
  timetable: renderTimetable,
  homework: renderHomework,
  tests: renderTests,
  absences: renderAbsences,
  notices: renderNotices,
  notes: renderNotes,
  lep: renderLEP,
  eugy: renderEUGY,
  documents: renderDocuments,
  dkt: renderDKT,
  profile: renderProfile
};

function closeSidebar() {
  document.getElementById("sidebar")?.classList.remove("open");
  const o = document.getElementById("overlay");
  if (o) o.style.display = "none";
}

function navigate(page) {
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
  document.querySelectorAll(".k-nav-item").forEach((b) => {
    b.classList.toggle("active", b.dataset.page === page);
  });
  document.querySelectorAll(".m-tab[data-page]").forEach((b) => {
    b.classList.toggle("active", b.dataset.page === page);
  });
  const el = document.getElementById("pageContent");
  try {
    el.innerHTML = RENDERERS[page]();
    if (page === "dkt") bindDKT();
    if (page === "documents") bindDocuments();
    if (page === "lep") bindLEP();
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="k-panel">Hiba a nézet megjelenítésekor.</div>`;
  }
}

function fillHeader() {
  const s = cache.student || {};
  document.getElementById("userName").textContent = s.Nev || localStorage.getItem("local_usr") || "Hallgató";
  document.getElementById("userCode").textContent = s.Uid ? `UID: ${s.Uid}` : "";
  document.getElementById("instName").textContent = s.IntezmenyNev || "KRÁTA";
  const ty = document.getElementById("tanev");
  if (ty) ty.textContent = s.TanevUid || "";
}



/* ===== Böngésző értesítés új jegyről ===== */
async function requestNotificationPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    try { await Notification.requestPermission(); } catch (_) {}
  }
}

function gradeKey(g) {
  return String(g.Uid || g.Id || (g.Tantargy && (g.Tantargy.Nev || g.Tantargy.nev) || "") + "|" + (g.KeszitesDatuma || g.RogzitesDatuma || "") + "|" + (g.SzamErtek ?? g.SzovegesErtek ?? ""));
}

let lastKnownGradeIds = new Set(JSON.parse(localStorage.getItem("lastGradeIds") || "[]"));

async function checkNewGrades() {
  try {
    const grades = await apiGet("/ellenorzo/v3/sajat/Ertekelesek");
    if (!Array.isArray(grades)) return;
    const currentIds = new Set(grades.map(gradeKey));
    const isFirstRun = lastKnownGradeIds.size === 0;
    const newOnes = isFirstRun ? [] : grades.filter((g) => !lastKnownGradeIds.has(gradeKey(g)));
    if (newOnes.length && Notification.permission === "granted") {
      newOnes.forEach((g) => {
        const subject = (g.Tantargy && (g.Tantargy.Nev || g.Tantargy.nev)) || g.Tema || "Ismeretlen tárgy";
        const value = g.SzamErtek ?? g.SzovegesErtek ?? "?";
        try {
          new Notification("Új jegy érkezett!", {
            body: subject + ": " + value,
            icon: "krata-logo.png",
            tag: "uj-jegy-" + gradeKey(g)
          });
        } catch (_) {}
      });
    }
    lastKnownGradeIds = currentIds;
    localStorage.setItem("lastGradeIds", JSON.stringify([...currentIds]));
  } catch (e) {
    console.warn("checkNewGrades", e);
  }
}




/* ===== LEP programok ===== */
function instituteCode() {
  const s = cache.student || {};
  return s.IntezmenyAzonosito || s.IntezmenyKod || localStorage.getItem("institute_code") || "demo";
}

function renderLEP() {
  return `<div class="k-page-title">LEP programok</div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-title">Események</div>
      <div id="lepList"><div class="loading">Betöltés…</div></div>
    </div>`;
}

async function bindLEP() {
  const box = document.getElementById("lepList");
  if (!box) return;
  try {
    const list = await apiGet("/kapcsolodas/LEP/mobileAPI/Eloadasok");
    const arr = Array.isArray(list) ? list : [];
    if (!arr.length) {
      box.innerHTML = `<div class="empty">Nincs LEP esemény.</div>`;
      return;
    }
    box.innerHTML = arr.map(ev => {
      const full = ev.MaxLetszam > 0 && ev.JelentkezokSzama >= ev.MaxLetszam;
      const done = (ev.Statusz || "").toLowerCase() === "befejezett";
      return `<div class="list-row" data-uid="${esc(ev.Uid)}">
        <div style="flex:1">
          <div class="list-title">${esc(ev.Cim || "Esemény")}</div>
          <div class="list-meta">${esc(ev.Kezdet || "")}${ev.Hely ? " · " + esc(ev.Hely) : ""} · ${esc(ev.Statusz || "")}
            · ${ev.JelentkezokSzama || 0}${ev.MaxLetszam ? "/" + ev.MaxLetszam : ""} fő</div>
        </div>
        ${done ? `<span class="badge">Befejezett</span>` : full ? `<span class="badge">Betelt</span>` :
          `<button type="button" class="btn lep-join" data-uid="${esc(ev.Uid)}">Jelentkezés</button>`}
      </div>`;
    }).join("");
    box.querySelectorAll(".lep-join").forEach(btn => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          await apiPost("/kapcsolodas/LEP/EventJoin", { Uid: btn.dataset.uid });
          bindLEP();
        } catch (e) {
          alert("Jelentkezés sikertelen: " + (e.message || e));
          btn.disabled = false;
        }
      });
    });
  } catch (e) {
    box.innerHTML = `<div class="empty">Nem sikerült betölteni a LEP listát.</div>`;
  }
}

async function apiPost(path, body) {
  let token = "";
  for (const k of (typeof TOKEN_KEYS !== "undefined" ? TOKEN_KEYS : ["access_token"])) {
    token = localStorage.getItem(k);
    if (token) break;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + (token || "")
    },
    body: JSON.stringify(body || {})
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("json")) return res.json();
  return {};
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
  document.querySelectorAll(".k-nav-item").forEach((btn) => {
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
  document.getElementById("bootMsg").style.display = "none";
  document.getElementById("appShell").style.display = "block";
  try { fillHeader(); } catch (e) { console.warn(e); }
  navigate("dashboard");
  requestNotificationPermission();
  checkNewGrades();
  setInterval(checkNewGrades, 3 * 60 * 1000);
}

boot();




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
  return (typeof API_BASE !== "undefined" ? API_BASE : "https://ujkreta.onrender.com");
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
  return `<div class="k-panel"><p>Átirányítás az e-Ügyintézéshez…</p>
    <p><a class="k-logout" href="https://puspus-dev.github.io/ujkreta/eugyintezes/">Megnyitás →</a></p></div>`;
}
