/* KRÁTA e-Ügyintézés – üzenetek (táblázatos lista, mint a hivatalos modul) */
const API_BASE = "https://edukreta.onrender.com";
const LOGIN_URL = "https://e-krata.github.io/eduKRETA/";
const DIAK_URL = "https://e-krata.github.io/eduKRETA/diak/";
const TOKEN_KEYS = ["access_token", "ujkreta_access_token", "of_access_token", "teacher_access_token", "tanar_access_token", "diak_access_token"];
const MSG_BASE = "/integration-kretamobile-api/v1/kommunikacio";

let accessToken = null;
let messages = [];
let selectedId = null;
let folder = "inbox";
let sortKey = "date"; // date | from | subj
let sortAsc = false;

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
    return d.toLocaleString("hu-HU", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    });
  } catch { return String(iso); }
}
function flash(msg, ok) {
  const el = document.getElementById("flash");
  if (!msg) { el.innerHTML = ""; return; }
  el.innerHTML = `<div class="${ok ? "e-ok" : "e-error"}">${esc(msg)}</div>`;
}

async function api(path, opts = {}) {
  const skipLogin = opts.skipLoginRedirect === true;
  const fetchOpts = { ...opts };
  delete fetchOpts.skipLoginRedirect;
  const res = await fetch(API_BASE + path, {
    ...fetchOpts,
    headers: {
      Accept: "application/json",
      Authorization: "Bearer " + accessToken,
      ...(fetchOpts.body ? { "Content-Type": "application/json" } : {}),
      ...(fetchOpts.headers || {})
    }
  });
  if (res.status === 401) {
    if (!skipLogin) goLogin();
    throw new Error("401 – nincs jogosultság / lejárt token");
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {
    if (!res.ok) throw new Error(text || ("HTTP " + res.status));
    return text;
  }
  if (!res.ok) {
    throw new Error((data && (data.error_description || data.error || data.message)) || ("HTTP " + res.status));
  }
  return data;
}

async function loadList() {
  const data = await api(MSG_BASE + "/postaladaelemek/sajat");
  messages = Array.isArray(data) ? data : [];
  updateBadges();
}
async function loadDetail(id) {
  return api(MSG_BASE + "/postaladaelemek/" + encodeURIComponent(id));
}
async function markRead(ids) {
  if (!ids.length) return;
  await api(MSG_BASE + "/uzenetek/olvasott", {
    method: "POST",
    body: JSON.stringify({ isOlvasott: true, uzenetAzonositoLista: ids })
  });
  messages.forEach((m) => {
    if (ids.includes(m.azonosito)) m.isElolvasva = true;
  });
  updateBadges();
}
function updateBadges() {
  const unread = messages.filter((m) => !m.isElolvasva && !m.isToroltElem).length;
  const bi = document.getElementById("badgeInbox");
  const bu = document.getElementById("badgeUnread");
  bi.hidden = messages.length === 0;
  bi.textContent = String(messages.length);
  bu.hidden = unread === 0;
  bu.textContent = String(unread);
}

function filteredMessages() {
  let list = messages.filter((m) => !m.isToroltElem);
  if (folder === "unread") list = list.filter((m) => !m.isElolvasva);
  const q = (document.getElementById("msgSearch")?.value || "").trim().toLowerCase();
  if (q) {
    list = list.filter((m) => {
      const u = m.uzenet || {};
      return [u.targy, u.feladoNev, u.szoveg, String(m.azonosito)].join(" ").toLowerCase().includes(q);
    });
  }
  list.sort((a, b) => {
    const ua = a.uzenet || {}, ub = b.uzenet || {};
    let va, vb;
    if (sortKey === "from") { va = ua.feladoNev || ""; vb = ub.feladoNev || ""; }
    else if (sortKey === "subj") { va = ua.targy || ""; vb = ub.targy || ""; }
    else { va = ua.kuldesDatum || ""; vb = ub.kuldesDatum || ""; }
    const c = String(va).localeCompare(String(vb), "hu");
    return sortAsc ? c : -c;
  });
  return list;
}

function setFolder(f) {
  folder = f;
  selectedId = null;
  if (f === "surveys") { surveyView = "list"; currentSurveyId = null; }
  document.querySelectorAll("[data-folder]").forEach((b) => {
    b.classList.toggle("active", b.dataset.folder === folder);
  });
  const titles = { inbox: "Beérkezett üzenetek", unread: "Olvasatlan üzenetek", compose: "Új üzenet", surveys: "Kérdőívek" };
  document.getElementById("pageTitle").textContent = titles[folder] || "Üzenetek";
  if (bootEl) bootEl.style.display = "none";
  render();
}


function render() {
  const root = document.getElementById("appRoot");
  if (folder === "surveys") {
    surveyView = surveyView || "list";
    if (folder === "surveys") { renderSurveys(); return; }
  }
  if (folder === "compose") {
    root.innerHTML = `
      <div class="e-panel">
        <form class="e-form" id="composeForm">
          <label for="cTargy">Tárgy *</label>
          <input id="cTargy" required maxlength="200" />
          <label for="cCimzettUid">Címzett UID</label>
          <input id="cCimzettUid" placeholder="pl. diák UID" />
          <label for="cCimzettNev">Címzett neve</label>
          <input id="cCimzettNev" />
          <label for="cSzoveg">Üzenet *</label>
          <textarea id="cSzoveg" required></textarea>
          <div>
            <button type="submit" class="e-btn e-btn-primary">Küldés</button>
            <button type="button" class="e-btn" id="cCancel">Mégse</button>
          </div>
        </form>
      </div>`;
    document.getElementById("cCancel").onclick = () => setFolder("inbox");
    document.getElementById("composeForm").onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api(MSG_BASE + "/uzenetek", {
          method: "POST",
          body: JSON.stringify({
            targy: document.getElementById("cTargy").value.trim(),
            szoveg: document.getElementById("cSzoveg").value.trim(),
            cimzettUid: document.getElementById("cCimzettUid").value.trim(),
            cimzettNev: document.getElementById("cCimzettNev").value.trim()
          })
        });
        flash("Üzenet elküldve.", true);
        await loadList();
        setFolder("inbox");
      } catch (err) {
        flash(err.message || String(err), false);
      }
    };
    return;
  }

  const list = filteredMessages();
  root.innerHTML = `
    <div class="e-panel">
      <div class="e-toolbar">
        <input type="search" class="e-search" id="msgSearch" placeholder="Keresés feladó, tárgy…" />
        <button type="button" class="e-btn" id="btnMarkAll">Összes olvasott</button>
        <button type="button" class="e-btn e-btn-primary" id="btnNew">＋ Új üzenet</button>
      </div>
      <div style="overflow-x:auto">
        <table class="e-table">
          <thead>
            <tr>
              <th data-sort="from">Feladó</th>
              <th data-sort="subj">Tárgy</th>
              <th data-sort="date">Időpont</th>
            </tr>
          </thead>
          <tbody>
            ${list.length ? list.map(rowHtml).join("") : `<tr><td colspan="3" class="e-empty">Nincs megjeleníthető üzenet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
    <div class="e-detail-wrap" id="detailWrap" ${selectedId ? "" : 'style="display:none"'}>
      <div class="e-detail" id="detailBody">Betöltés…</div>
    </div>`;

  document.getElementById("msgSearch")?.addEventListener("input", () => render());
  document.getElementById("btnNew")?.addEventListener("click", () => setFolder("compose"));
  document.getElementById("btnMarkAll")?.addEventListener("click", async () => {
    const ids = filteredMessages().filter((m) => !m.isElolvasva).map((m) => m.azonosito);
    try {
      await markRead(ids);
      flash("Olvasottnak jelölve.", true);
      render();
    } catch (e) { flash(e.message || String(e), false); }
  });
  document.querySelectorAll(".e-table th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const k = th.dataset.sort;
      if (sortKey === k) sortAsc = !sortAsc;
      else { sortKey = k; sortAsc = true; }
      render();
    });
  });
  document.querySelectorAll("tr[data-id]").forEach((tr) => {
    tr.addEventListener("click", () => openDetail(Number(tr.dataset.id)));
  });
  if (selectedId) openDetail(selectedId);
}

function rowHtml(m) {
  const u = m.uzenet || {};
  const unread = !m.isElolvasva ? " unread" : "";
  const active = selectedId === m.azonosito ? " active" : "";
  return `<tr class="${unread}${active}" data-id="${esc(m.azonosito)}">
    <td class="from">${esc(u.feladoNev || "—")}${u.feladoTitulus ? " <span style='color:#5a6a70;font-weight:400'>(" + esc(u.feladoTitulus) + ")</span>" : ""}</td>
    <td class="subj">${esc(u.targy || "(nincs tárgy)")}</td>
    <td class="date">${esc(fmtDate(u.kuldesDatum))}</td>
  </tr>`;
}

async function openDetail(id) {
  selectedId = id;
  document.querySelectorAll("tr[data-id]").forEach((tr) => {
    tr.classList.toggle("active", Number(tr.dataset.id) === id);
  });
  const wrap = document.getElementById("detailWrap");
  const body = document.getElementById("detailBody");
  if (!wrap || !body) return;
  wrap.style.display = "block";
  body.innerHTML = "Betöltés…";
  try {
    const full = await loadDetail(id);
    if (!full.isElolvasva) {
      try { await markRead([id]); } catch (_) {}
    }
    const u = full.uzenet || {};
    const cimzettek = (u.cimzettLista || []).map((c) => esc(c.nev || c.kretaAzonosito)).join(", ") || "—";
    const attaches = (u.csatolmanyok || []).map((a) => `<li>📎 ${esc(a.fajlNev || a.azonosito)}</li>`).join("");
    body.innerHTML = `
      <h2 class="e-detail-subj">${esc(u.targy || "(nincs tárgy)")}</h2>
      <div class="e-meta">
        <div><strong>Feladó:</strong> ${esc(u.feladoNev || "—")}${u.feladoTitulus ? " (" + esc(u.feladoTitulus) + ")" : ""}</div>
        <div><strong>Címzettek:</strong> ${cimzettek}</div>
        <div><strong>Küldve:</strong> ${esc(fmtDate(u.kuldesDatum))}</div>
      </div>
      <div class="e-detail-text">${esc(u.szoveg || "")}</div>
      ${attaches ? `<ul>${attaches}</ul>` : ""}
      <div class="e-detail-actions">
        <button type="button" class="e-btn" id="btnCloseDetail">Vissza a listához</button>
        <button type="button" class="e-btn e-btn-primary" id="btnReply">Válasz</button>
      </div>`;
    document.getElementById("btnCloseDetail").onclick = () => {
      selectedId = null;
      wrap.style.display = "none";
      render();
    };
    document.getElementById("btnReply").onclick = () => {
      setFolder("compose");
      setTimeout(() => {
        document.getElementById("cTargy").value = "Re: " + (u.targy || "");
        document.getElementById("cCimzettNev").value = u.feladoNev || "";
      }, 50);
    };
    const idx = messages.findIndex((m) => m.azonosito === id);
    if (idx >= 0) messages[idx].isElolvasva = true;
    updateBadges();
  } catch (e) {
    body.innerHTML = `<div class="e-error">${esc(e.message || e)}</div>`;
  }
}

async function boot() {
  const bootEl = document.getElementById("bootMsg");
  accessToken = getToken();
  if (!accessToken) { goLogin(); return; }
  const role = localStorage.getItem("ujkreta_role") || "";
  userRole = role;
  const name = localStorage.getItem("local_usr") || "Felhasználó";
  document.getElementById("userLabel").textContent = name + (role ? " · " + role : "");
  document.getElementById("logoutBtn").onclick = goLogin;
  document.getElementById("btnRefresh").onclick = async () => {
    try { await loadList(); flash("Frissítve.", true); render(); }
    catch (e) { flash(e.message || String(e), false); }
  };
  document.getElementById("btnBackDiak").onclick = () => {
    const r = (localStorage.getItem("ujkreta_role") || "").toLowerCase();
    if (r.indexOf("osztalyfonok") !== -1)
      window.location.href = "https://puspus-dev.github.io/ujkreta/osztalyfonok/";
    else if (r.indexOf("tanar") !== -1)
      window.location.href = "https://puspus-dev.github.io/ujkreta/tanar/";
    else
      window.location.href = DIAK_URL;
  };
  document.querySelectorAll("[data-folder]").forEach((btn) => {
    btn.addEventListener("click", () => setFolder(btn.dataset.folder));
  });
  try { await loadList(); }
  catch (e) {
    flash("Postafiók betöltése sikertelen: " + (e.message || e) + " (messages.go deploy kell)", false);
  }
  if (bootEl) bootEl.style.display = "none";
  document.querySelectorAll(".e-topbar, .e-nav, .e-body").forEach((el) => {
    el.style.display = "";
  });
  render();
}
document.addEventListener("DOMContentLoaded", boot);


/* ========== KÉRDŐÍVEK ========== */
const SURVEY_BASE = "/api/surveys";
let userRole = "";
let surveyView = "list"; // list | create | fill | results
let currentSurveyId = null;

function isTeacher() {
  const r = (userRole || localStorage.getItem("ujkreta_role") || "").toLowerCase();
  return r.indexOf("tanar") !== -1 || r.indexOf("osztalyfonok") !== -1 || r === "teacher";
}

async function loadSurveyList() {
  return api(SURVEY_BASE, { skipLoginRedirect: true });
}
async function loadSurvey(id) {
  return api(SURVEY_BASE + "/" + id, { skipLoginRedirect: true });
}
async function loadSurveyResponses(id) {
  return api(SURVEY_BASE + "/" + id + "/responses", { skipLoginRedirect: true });
}

function renderSurveys() {
  document.getElementById("pageTitle").textContent = "Kérdőívek";
  const root = document.getElementById("appRoot");
  if (surveyView === "create" && isTeacher()) {
    root.innerHTML = renderSurveyCreate();
    bindSurveyCreate();
    return;
  }
  if (surveyView === "fill" && currentSurveyId) {
    root.innerHTML = `<div class="e-panel"><div class="e-empty">Betöltés…</div></div>`;
    loadSurvey(currentSurveyId).then((sv) => {
      root.innerHTML = renderSurveyFill(sv);
      bindSurveyFill(sv);
    }).catch((e) => {
      root.innerHTML = `<div class="e-error">${esc(e.message)}</div>`;
    });
    return;
  }
  if (surveyView === "results" && currentSurveyId && isTeacher()) {
    root.innerHTML = `<div class="e-panel"><div class="e-empty">Betöltés…</div></div>`;
    Promise.all([loadSurvey(currentSurveyId), loadSurveyResponses(currentSurveyId)])
      .then(([sv, resps]) => {
        root.innerHTML = renderSurveyResults(sv, resps);
        document.getElementById("btnBackSurveys")?.addEventListener("click", () => {
          surveyView = "list"; renderSurveys();
        });
      })
      .catch((e) => {
        root.innerHTML = `<div class="e-error">${esc(e.message)}</div>`;
      });
    return;
  }
  // list
  root.innerHTML = `<div class="e-panel"><div class="e-empty">Betöltés…</div></div>`;
  loadSurveyList().then((list) => {
    if (!Array.isArray(list)) list = [];
    const rows = list.map((s) => {
      const status = s.filled ? "Kitöltve" : (s.active ? "Kitölthető" : "Lezárva");
      let actions = "";
      if (isTeacher()) {
        actions = `<button type="button" class="e-btn" data-res="${s.id}">Válaszok</button>
          <button type="button" class="e-btn" data-del="${s.id}">Törlés</button>`;
      } else if (!s.filled && s.active) {
        actions = `<button type="button" class="e-btn e-btn-primary" data-fill="${s.id}">Kitöltés</button>`;
      } else if (s.filled) {
        actions = `<span style="color:#2e7d32;font-size:12px;font-weight:650">✓ Kész</span>`;
      }
      return `<tr>
        <td>${esc(s.title)}</td>
        <td>${esc(s.description || "—")}</td>
        <td>${s.questionCount ?? "—"}</td>
        <td>${esc(status)}</td>
        <td>${actions}</td>
      </tr>`;
    }).join("") || `<tr><td colspan="5" class="e-empty">Nincs kérdőív.</td></tr>`;

    root.innerHTML = `
      <div class="e-panel">
        <div class="e-toolbar">
          ${isTeacher() ? `<button type="button" class="e-btn e-btn-primary" id="btnNewSurvey">＋ Új kérdőív</button>` : ""}
          <button type="button" class="e-btn" id="btnRefreshSurveys">Frissítés</button>
        </div>
        <div style="overflow-x:auto">
          <table class="e-table">
            <thead><tr><th>Cím</th><th>Leírás</th><th>Kérdések</th><th>Állapot</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
    document.getElementById("btnNewSurvey")?.addEventListener("click", () => {
      surveyView = "create"; renderSurveys();
    });
    document.getElementById("btnRefreshSurveys")?.addEventListener("click", () => renderSurveys());
    document.querySelectorAll("[data-fill]").forEach((b) => {
      b.addEventListener("click", () => {
        currentSurveyId = Number(b.dataset.fill);
        surveyView = "fill";
        renderSurveys();
      });
    });
    document.querySelectorAll("[data-res]").forEach((b) => {
      b.addEventListener("click", () => {
        currentSurveyId = Number(b.dataset.res);
        surveyView = "results";
        renderSurveys();
      });
    });
    document.querySelectorAll("[data-del]").forEach((b) => {
      b.addEventListener("click", async () => {
        if (!confirm("Törlöd a kérdőívet?")) return;
        try {
          await api(SURVEY_BASE + "/" + b.dataset.del, { method: "DELETE" });
          flash("Törölve.", true);
          renderSurveys();
        } catch (e) { flash(e.message || String(e), false); }
      });
    });
  }).catch((e) => {
    root.innerHTML = `<div class="e-error">
      <strong>Kérdőívek betöltése sikertelen</strong><br>
      ${esc(e.message || e)}<br>
      <small>Ha 401: a szerveren a survey route-okat <code>requireAuthSession</code>-nel kell regisztrálni (surveys.go), majd újra deploy.</small>
    </div>`;
  });
}

function renderSurveyCreate() {
  return `
  <div class="e-panel">
    <form class="e-form" id="svForm" style="max-width:720px">
      <label>Cím *</label>
      <input id="svTitle" required placeholder="Pl. Szülői elégedettség 2026" />
      <label>Leírás</label>
      <textarea id="svDesc" style="min-height:60px" placeholder="Rövid tájékoztató a kitöltőknek"></textarea>
      <div id="svQuestions"></div>
      <button type="button" class="e-btn" id="svAddQ">＋ Kérdés</button>
      <div style="margin-top:12px">
        <button type="submit" class="e-btn e-btn-primary">Kérdőív mentése</button>
        <button type="button" class="e-btn" id="svCancel">Mégse</button>
      </div>
    </form>
  </div>`;
}

function bindSurveyCreate() {
  let qn = 0;
  const box = document.getElementById("svQuestions");
  function addQ() {
    qn++;
    const id = qn;
    const div = document.createElement("div");
    div.className = "e-panel";
    div.style.marginTop = "10px";
    div.style.padding = "12px";
    div.dataset.qid = String(id);
    div.innerHTML = `
      <label>Kérdés ${id}</label>
      <input class="sq-text" required placeholder="Kérdés szövege" />
      <label>Típus</label>
      <select class="sq-type">
        <option value="text">Szabad szöveg</option>
        <option value="single">Egy választás</option>
        <option value="multi">Több választás</option>
      </select>
      <label>Opciók (vesszővel, single/multi esetén)</label>
      <input class="sq-opts" placeholder="Igen, Nem, Nem tudom" />
      <label><input type="checkbox" class="sq-req" checked /> Kötelező</label>
      <button type="button" class="e-btn sq-del">Kérdés törlése</button>`;
    div.querySelector(".sq-del").onclick = () => div.remove();
    box.appendChild(div);
  }
  document.getElementById("svAddQ").onclick = addQ;
  addQ();
  document.getElementById("svCancel").onclick = () => { surveyView = "list"; renderSurveys(); };
  document.getElementById("svForm").onsubmit = async (e) => {
    e.preventDefault();
    const questions = [];
    box.querySelectorAll("[data-qid]").forEach((div, i) => {
      const type = div.querySelector(".sq-type").value;
      const opts = div.querySelector(".sq-opts").value.split(",").map((x) => x.trim()).filter(Boolean);
      questions.push({
        id: i + 1,
        text: div.querySelector(".sq-text").value.trim(),
        type,
        options: (type === "text") ? [] : opts,
        required: div.querySelector(".sq-req").checked
      });
    });
    try {
      await api(SURVEY_BASE, {
        method: "POST",
        body: JSON.stringify({
          title: document.getElementById("svTitle").value.trim(),
          description: document.getElementById("svDesc").value.trim(),
          questions,
          active: true
        })
      });
      flash("Kérdőív létrehozva.", true);
      surveyView = "list";
      renderSurveys();
    } catch (err) {
      flash(err.message || String(err), false);
    }
  };
}

function renderSurveyFill(sv) {
  const qs = (sv.questions || []).map((q) => {
    let input = "";
    if (q.type === "single") {
      input = (q.options || []).map((o) =>
        `<label style="display:block;margin:4px 0"><input type="radio" name="q${q.id}" value="${esc(o)}" /> ${esc(o)}</label>`
      ).join("");
    } else if (q.type === "multi") {
      input = (q.options || []).map((o) =>
        `<label style="display:block;margin:4px 0"><input type="checkbox" name="q${q.id}" value="${esc(o)}" /> ${esc(o)}</label>`
      ).join("");
    } else {
      input = `<textarea name="q${q.id}" style="width:100%;min-height:70px;padding:8px;border:1px solid #c5d0d4"></textarea>`;
    }
    return `<div class="e-panel" style="margin-bottom:10px;padding:12px">
      <div style="font-weight:650;margin-bottom:8px">${esc(q.text)}${q.required ? " *" : ""}</div>
      ${input}
    </div>`;
  }).join("");
  return `
    <div class="e-panel" style="padding:14px">
      <h2 style="margin:0 0 6px;font-size:18px">${esc(sv.title)}</h2>
      <p style="color:#5a6a70;font-size:13px">${esc(sv.description || "")}</p>
      <form id="fillForm">${qs}
        <button type="submit" class="e-btn e-btn-primary">Beküldés</button>
        <button type="button" class="e-btn" id="fillCancel">Mégse</button>
      </form>
    </div>`;
}

function bindSurveyFill(sv) {
  document.getElementById("fillCancel").onclick = () => { surveyView = "list"; renderSurveys(); };
  document.getElementById("fillForm").onsubmit = async (e) => {
    e.preventDefault();
    const answers = [];
    for (const q of (sv.questions || [])) {
      if (q.type === "multi") {
        const vals = [...document.querySelectorAll(`input[name="q${q.id}"]:checked`)].map((x) => x.value);
        if (q.required && !vals.length) { flash("Tölts ki minden kötelező mezőt.", false); return; }
        answers.push({ questionId: q.id, values: vals });
      } else if (q.type === "single") {
        const el = document.querySelector(`input[name="q${q.id}"]:checked`);
        const v = el ? el.value : "";
        if (q.required && !v) { flash("Tölts ki minden kötelező mezőt.", false); return; }
        answers.push({ questionId: q.id, value: v });
      } else {
        const el = document.querySelector(`[name="q${q.id}"]`);
        const v = el ? el.value.trim() : "";
        if (q.required && !v) { flash("Tölts ki minden kötelező mezőt.", false); return; }
        answers.push({ questionId: q.id, value: v });
      }
    }
    try {
      await api(SURVEY_BASE + "/" + sv.id + "/submit", {
        method: "POST",
        body: JSON.stringify({ answers })
      });
      flash("Köszönjük, a válaszokat rögzítettük.", true);
      surveyView = "list";
      renderSurveys();
    } catch (err) {
      flash(err.message || String(err), false);
    }
  };
}

function renderSurveyResults(sv, resps) {
  if (!Array.isArray(resps)) resps = [];
  const blocks = resps.map((r) => {
    const ans = (r.answers || []).map((a) => {
      const q = (sv.questions || []).find((x) => x.id === a.questionId);
      const label = q ? q.text : ("#" + a.questionId);
      const val = a.values && a.values.length ? a.values.join(", ") : (a.value || "—");
      return `<div style="margin:4px 0"><strong>${esc(label)}:</strong> ${esc(val)}</div>`;
    }).join("");
    return `<div class="e-panel" style="margin:8px 0;padding:12px">
      <div style="font-size:13px;color:#5a6a70">${esc(r.username)} · ${esc(r.submittedAt || "")}</div>
      ${ans}
    </div>`;
  }).join("") || `<div class="e-empty">Még nincs kitöltés.</div>`;
  return `
    <div class="e-panel" style="padding:14px">
      <button type="button" class="e-btn" id="btnBackSurveys">← Vissza</button>
      <h2 style="margin:12px 0 6px">${esc(sv.title)} – válaszok (${resps.length})</h2>
      ${blocks}
    </div>`;
}

// Hook into setFolder / render
