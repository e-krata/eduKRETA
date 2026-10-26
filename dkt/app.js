/* KRÁTA – DKT önálló oldal */
const API_BASE = "https://edukreta.onrender.com";
const LOGIN_URL = "https://e-krata.github.io/eduKRETA/";
const TOKEN_KEYS = ["access_token", "ujkreta_access_token", "of_access_token", "teacher_access_token", "tanar_access_token"];

let accessToken = null;
let cache = {
  dkt: [], grades: [], timetable: [], groups: [],
  student: null, teacher: null,
  orai: [], tananyag: [], classwork: [], solutions: []
};
let selectedId = null;
let selectedName = "";
let currentView = "workspaces"; // workspaces | orai | hazi | tananyag | files

function getToken() {
  for (const k of TOKEN_KEYS) {
    const v = localStorage.getItem(k);
    if (v) return v;
  }
  return null;
}
function clearTokens() {
  TOKEN_KEYS.forEach((k) => localStorage.removeItem(k));
}
function goLogin() {
  clearTokens();
  window.location.href = LOGIN_URL;
}
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmtDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
    return d.toLocaleString("hu-HU");
  } catch { return String(iso).slice(0, 16); }
}
function flash(msg, ok) {
  const el = document.getElementById("flash");
  if (!el) return;
  if (!msg) { el.innerHTML = ""; return; }
  el.innerHTML = `<div class="${ok ? "e-ok" : "e-error"}">${esc(msg)}</div>`;
}

async function apiGet(path) {
  const res = await fetch(API_BASE + path, {
    headers: { Authorization: "Bearer " + accessToken, Accept: "application/json" }
  });
  if (res.status === 401) { goLogin(); throw new Error("401"); }
  if (!res.ok) return null;
  try { return await res.json(); } catch { return null; }
}
async function apiPost(path, body) {
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + accessToken,
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body || {})
  });
  if (res.status === 401) { goLogin(); throw new Error("401"); }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error((data && (data.error || data.message)) || ("Hiba " + res.status));
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
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) throw new Error((data && data.error) || ("Hiba " + res.status));
  return data;
}

function storageKey() {
  const uid =
    (cache.student && (cache.student.Uid || cache.student.uid)) ||
    (cache.teacher && (cache.teacher.Uid || cache.teacher.uid)) ||
    localStorage.getItem("local_usr") || "anon";
  return "krata_dkt_files_" + uid;
}
function loadFilesMap() {
  try { return JSON.parse(localStorage.getItem(storageKey()) || "{}"); }
  catch { return {}; }
}
function saveFilesMap(map) {
  localStorage.setItem(storageKey(), JSON.stringify(map));
}

function workspaces() {
  let list = Array.isArray(cache.dkt) ? cache.dkt.slice() : [];
  if (!list.length) {
    const names = new Set();
    (cache.grades || []).forEach((g) => {
      const n = (g.Tantargy && (g.Tantargy.Nev || g.Tantargy.nev)) || g.TantargyNev;
      if (n) names.add(n);
    });
    (cache.timetable || []).forEach((l) => {
      const n = (l.Tantargy && l.Tantargy.Nev) || l.TantargyNev || l.Nev;
      if (n) names.add(n);
    });
    const tSubs = cache.teacher && Array.isArray(cache.teacher.Tantargyak) ? cache.teacher.Tantargyak : [];
    tSubs.forEach((s) => { if (s.Nev) names.add(s.Nev); });
    if (!names.size) {
      ["Matematika", "Magyar nyelv és irodalom", "Történelem", "Informatika"].forEach((n) => names.add(n));
    }
    const group = (cache.groups && cache.groups[0] && cache.groups[0].Nev) || "Osztály";
    const teacher = (cache.teacher && cache.teacher.Nev) || "Szaktanár";
    list = [...names].sort((a, b) => a.localeCompare(b, "hu")).map((n, i) => ({
      tantargyId: i + 1,
      tantargyNev: n,
      alkalmazottNev: teacher,
      osztalyCsoportNev: group,
      _local: true
    }));
  }
  return list;
}

function ensureSeed(wsId, subj) {
  const map = loadFilesMap();
  const key = String(wsId);
  if (!map[key] || !map[key].length) {
    map[key] = [
      { id: key + "-1", name: subj + " – tematika.pdf", type: "PDF", size: "245 KB", date: new Date().toISOString(), note: "Év eleji tematika" },
      { id: key + "-2", name: subj + " – órai jegyzet.docx", type: "DOCX", size: "88 KB", date: new Date().toISOString(), note: "Közös jegyzet" }
    ];
    saveFilesMap(map);
  }
  return map[key];
}

function setNavActive(view) {
  currentView = view;
  document.querySelectorAll(".e-nav-item[data-view]").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-view") === view);
  });
}

function renderWsList() {
  const list = workspaces();
  const root = document.getElementById("wsList");
  if (!root) return;
  root.innerHTML = list.map((d) => {
    const id = String(d.tantargyId || d.TantargyId || d.tantargyNev || "");
    const subj = d.tantargyNev || d.TantargyNev || "Tantárgy";
    const teacher = d.alkalmazottNev || d.AlkalmazottNev || "—";
    const group = d.osztalyCsoportNev || d.OsztalyCsoportNev || "—";
    const active = id === String(selectedId) ? " active" : "";
    return `<button type="button" class="dkt-card${active}" data-id="${esc(id)}" data-name="${esc(subj)}">
      <img src="icons/OktatasIgenyles.png" class="dkt-card-ico" alt="">
      <div class="dkt-card-title">${esc(subj)}</div>
      <div class="dkt-card-meta">${esc(teacher)} · ${esc(group)}</div>
    </button>`;
  }).join("") || `<div class="e-empty">Nincs munkatér.</div>`;

  root.querySelectorAll(".dkt-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedId = btn.getAttribute("data-id");
      selectedName = btn.getAttribute("data-name") || "";
      const nf = document.getElementById("navFiles");
      if (nf) nf.disabled = false;
      renderWsList();
      if (currentView === "files" || currentView === "workspaces") {
        setNavActive("files");
        renderFiles();
      }
    });
  });
}

function renderFiles() {
  const title = document.getElementById("pageTitle");
  const root = document.getElementById("appRoot");
  if (!selectedId) {
    title.textContent = "Válassz munkateret";
    root.innerHTML = `<div class="e-panel"><div class="e-panel-body e-empty">A bal oldali listából válassz egy tantárgyi munkateret.</div></div>`;
    return;
  }
  const files = ensureSeed(selectedId, selectedName);
  title.textContent = selectedName + " – dokumentumok";
  root.innerHTML = `
    <div class="e-panel">
      <div class="e-panel-body" style="padding:0">
        <table class="e-table"><thead><tr><th>Név</th><th>Típus</th><th>Megjegyzés</th><th>Dátum</th></tr></thead>
        <tbody>
          ${files.map((f) => `<tr>
            <td>${esc(f.name)}</td><td>${esc(f.type)}</td>
            <td>${esc(f.note || "")}</td><td>${fmtDate(f.date)}</td>
          </tr>`).join("")}
        </tbody></table>
      </div>
    </div>`;
}

function renderOrai() {
  document.getElementById("pageTitle").textContent = "Órai feladatok";
  const list = Array.isArray(cache.orai) ? cache.orai : [];
  const root = document.getElementById("appRoot");
  if (!list.length) {
    root.innerHTML = `<div class="e-panel"><div class="e-panel-body e-empty">Nincs órai feladat. (API: /dktapi/orak/oraifeladat)</div></div>`;
    return;
  }
  root.innerHTML = `<div class="e-panel"><div class="e-panel-body" style="padding:0">
    <table class="e-table">
      <thead><tr><th>Cím</th><th>Tantárgy</th><th>Dátum</th><th>Óra</th><th>Leírás</th></tr></thead>
      <tbody>
        ${list.map((x) => `<tr>
          <td>${esc(x.cim || x.Cim || "—")}</td>
          <td>${esc(x.tantargyNev || "—")}</td>
          <td>${esc(x.oraDatum || "—")}</td>
          <td>${esc(x.oraszam ?? "—")}</td>
          <td>${esc(x.szoveg || "")}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div></div>`;
}

function renderTananyag() {
  document.getElementById("pageTitle").textContent = "Tananyagok";
  const list = Array.isArray(cache.tananyag) ? cache.tananyag : [];
  const root = document.getElementById("appRoot");
  if (!list.length) {
    root.innerHTML = `<div class="e-panel"><div class="e-panel-body e-empty">Nincs tananyag. (API: .../orak/tananyagok)</div></div>`;
    return;
  }
  root.innerHTML = `<div class="e-panel"><div class="e-panel-body" style="padding:0">
    <table class="e-table">
      <thead><tr><th>Cím</th><th>Tantárgy</th><th>Leírás</th><th>Létrehozva</th></tr></thead>
      <tbody>
        ${list.map((x) => `<tr>
          <td>${esc(x.cim || "—")}</td>
          <td>${esc(x.tantargyNev || "—")}</td>
          <td>${esc(x.szoveg || "")}</td>
          <td>${fmtDate(x.letrehozasIdeje)}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div></div>`;
}

function renderHazi() {
  document.getElementById("pageTitle").textContent = "Házi feladatok / beadás";
  const cw = Array.isArray(cache.classwork) ? cache.classwork : [];
  const sols = Array.isArray(cache.solutions) ? cache.solutions : [];
  const root = document.getElementById("appRoot");

  const cwRows = cw.length
    ? cw.map((x) => {
        const id = x.id ?? x.haziFeladatId ?? "";
        return `<tr>
          <td>${esc(x.cim || "—")}</td>
          <td>${esc(x.tantargyNev || "—")}</td>
          <td>${esc(x.szoveg || "")}</td>
          <td>${esc(x.oraDatum || "—")}</td>
          <td><button type="button" class="e-btn btn-submit" data-id="${esc(id)}">Beadás</button></td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="5" class="e-empty">Nincs classwork / házi a szerveren.</td></tr>`;

  const solRows = sols.length
    ? sols.map((s) => `<tr>
        <td>${esc(s.haziFeladatId)}</td>
        <td>${esc(s.szoveg || "")}</td>
        <td>${fmtDate(s.bekuldesIdeje)}</td>
        <td>${esc(s.statusz || "")}</td>
        <td><button type="button" class="e-btn btn-del-sol" data-id="${esc(s.haziFeladatId)}">Törlés</button></td>
      </tr>`).join("")
    : `<tr><td colspan="5" class="e-empty">Még nincs beküldött megoldás.</td></tr>`;

  root.innerHTML = `
    <div class="e-panel" style="margin-bottom:12px">
      <div class="e-panel-head" style="padding:10px 12px;font-weight:700;border-bottom:1px solid #e5e9ec">Feladatok (getclasswork)</div>
      <div class="e-panel-body" style="padding:0">
        <table class="e-table">
          <thead><tr><th>Cím</th><th>Tantárgy</th><th>Leírás</th><th>Dátum</th><th></th></tr></thead>
          <tbody>${cwRows}</tbody>
        </table>
      </div>
    </div>
    <div class="e-panel" style="margin-bottom:12px">
      <div class="e-panel-head" style="padding:10px 12px;font-weight:700;border-bottom:1px solid #e5e9ec">Új beadás</div>
      <div class="e-panel-body">
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:end">
          <div>
            <label>Házi ID</label><br>
            <input id="hwId" type="text" placeholder="pl. 101" style="padding:6px 8px;border:1px solid #c5d3e2;min-width:100px" />
          </div>
          <div style="flex:1;min-width:200px">
            <label>Megoldás szövege</label><br>
            <input id="hwText" type="text" placeholder="Írd ide a megoldást…" style="padding:6px 8px;border:1px solid #c5d3e2;width:100%" />
          </div>
          <button type="button" class="e-btn" id="hwSend">Beküldés</button>
        </div>
      </div>
    </div>
    <div class="e-panel">
      <div class="e-panel-head" style="padding:10px 12px;font-weight:700;border-bottom:1px solid #e5e9ec">Beküldött megoldások</div>
      <div class="e-panel-body" style="padding:0">
        <table class="e-table">
          <thead><tr><th>Házi ID</th><th>Szöveg</th><th>Időpont</th><th>Státusz</th><th></th></tr></thead>
          <tbody>${solRows}</tbody>
        </table>
      </div>
    </div>`;

  root.querySelectorAll(".btn-submit").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("hwId").value = btn.getAttribute("data-id") || "";
      document.getElementById("hwText").focus();
    });
  });
  document.getElementById("hwSend")?.addEventListener("click", async () => {
    const id = (document.getElementById("hwId")?.value || "").trim();
    const szoveg = (document.getElementById("hwText")?.value || "").trim();
    if (!id && !szoveg) { flash("Adj meg ID-t vagy szöveget.", false); return; }
    try {
      await apiPost(`/dktapi/orak/hazifeladat/megoldasok/${encodeURIComponent(id || "0")}/bekuldes`, {
        haziFeladatId: id,
        szoveg
      });
      flash("Beadás elküldve.", true);
      cache.solutions = (await apiGet("/dktapi/orak/hazifeladat/megoldasok")) || [];
      renderHazi();
    } catch (e) {
      flash(e.message || String(e), false);
    }
  });
  root.querySelectorAll(".btn-del-sol").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      if (!confirm("Törlöd a megoldást? ID: " + id)) return;
      try {
        await apiDelete(`/dktapi/orak/hazifeladat/megoldasok/${encodeURIComponent(id)}/torles`);
        flash("Törölve.", true);
        cache.solutions = (await apiGet("/dktapi/orak/hazifeladat/megoldasok")) || [];
        renderHazi();
      } catch (e) {
        flash(e.message || String(e), false);
      }
    });
  });
}

function showView(view) {
  setNavActive(view);
  flash("");
  if (view === "workspaces") {
    document.getElementById("pageTitle").textContent = "Munkaterek";
    document.getElementById("appRoot").innerHTML =
      `<div class="e-panel"><div class="e-panel-body e-empty">Válassz munkateret a bal oldalon, majd nyisd meg a Dokumentumok fület.</div></div>`;
    renderWsList();
  } else if (view === "files") {
    renderFiles();
  } else if (view === "orai") {
    renderOrai();
  } else if (view === "hazi") {
    renderHazi();
  } else if (view === "tananyag") {
    renderTananyag();
  }
}

function goBack() {
  const role = (localStorage.getItem("ujkreta_role") || "").toLowerCase();
  if (role.indexOf("tanar") !== -1) window.location.href = "../tanar/";
  else if (role.indexOf("osztaly") !== -1 || role === "of") window.location.href = "../osztalyfonok/";
  else window.location.href = "../diak/";
}

async function loadData() {
  const role = (localStorage.getItem("ujkreta_role") || "").toLowerCase();
  const tasks = [
    apiGet("/dktapi/intezmenyek/munkaterek/tanulok").then((d) => { cache.dkt = Array.isArray(d) ? d : []; }),
    apiGet("/dktapi/orak/oraifeladat").then((d) => { cache.orai = Array.isArray(d) ? d : []; }),
    apiGet("/dktapi/intezmenyek/munkaterek/tanulok/orak/tananyagok").then((d) => { cache.tananyag = Array.isArray(d) ? d : []; }),
    apiGet("/dktapi/getclasswork").then((d) => { cache.classwork = Array.isArray(d) ? d : []; }),
    apiGet("/dktapi/orak/hazifeladat/megoldasok").then((d) => { cache.solutions = Array.isArray(d) ? d : []; })
  ];
  if (role.indexOf("tanar") !== -1 || role.indexOf("osztaly") !== -1 || role === "of") {
    tasks.push(apiGet("/naplo/v3/sajat/TanarAdatlap").then((d) => { cache.teacher = d; }));
    tasks.push(apiGet("/naplo/v3/sajat/OrarendElemek").then((d) => { cache.timetable = Array.isArray(d) ? d : []; }));
  } else {
    tasks.push(apiGet("/ellenorzo/v3/sajat/TanuloAdatlap").then((d) => { cache.student = d; }));
    tasks.push(apiGet("/ellenorzo/v3/sajat/Ertekelesek").then((d) => { cache.grades = Array.isArray(d) ? d : []; }));
    tasks.push(apiGet("/ellenorzo/v3/sajat/OrarendElemek").then((d) => { cache.timetable = Array.isArray(d) ? d : []; }));
    tasks.push(apiGet("/ellenorzo/v3/sajat/OsztalyCsoportok").then((d) => { cache.groups = Array.isArray(d) ? d : []; }));
  }
  await Promise.all(tasks);
}

async function boot() {
  accessToken = getToken();
  if (!accessToken) { goLogin(); return; }

  document.getElementById("logoutBtn")?.addEventListener("click", goLogin);
  document.getElementById("btnBack")?.addEventListener("click", goBack);
  document.getElementById("btnRefresh")?.addEventListener("click", async () => {
    try {
      await loadData();
      showView(currentView);
      flash("Frissítve.", true);
    } catch (e) {
      flash(e.message || String(e), false);
    }
  });

  document.querySelectorAll(".e-nav-item[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      showView(btn.getAttribute("data-view"));
    });
  });

  try {
    await loadData();
  } catch (e) {
    console.error(e);
    flash("Adatok betöltése részben sikertelen (deployold a DKT API-t).", false);
  }

  const name =
    (cache.student && cache.student.Nev) ||
    (cache.teacher && cache.teacher.Nev) ||
    localStorage.getItem("local_usr") || "Felhasználó";
  const ul = document.getElementById("userLabel");
  if (ul) ul.textContent = name;

  document.getElementById("bootMsg").style.display = "none";
  document.getElementById("appShell").style.display = "block";
  renderWsList();
  showView("workspaces");
}

document.addEventListener("DOMContentLoaded", boot);
