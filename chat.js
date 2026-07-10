/**
 * Widget de messagerie anonyme -> Telegram (cote client)
 * ------------------------------------------------------
 * Integration dans une app :
 *   <script>
 *     window.MESSAGERIE_CONFIG = {
 *       endpoint: "https://messagerie-relais.TON-SOUS-DOMAINE.workers.dev",
 *       titre: "Support Coffre",           // optionnel
 *       accroche: "Une question ? Ecris-nous."  // optionnel
 *     };
 *   </script>
 *   <script src="chat.js" defer></script>
 *
 * 100% autonome, aucune dependance. Cree un bouton flottant + un panneau.
 * L'identifiant de conversation est aleatoire, stocke en local, sans compte.
 */
(function () {
  "use strict";

  var CFG = window.MESSAGERIE_CONFIG || {};
  var ENDPOINT = (CFG.endpoint || "").replace(/\/+$/, "");
  var TITRE = CFG.titre || "Contact";
  var ACCROCHE = CFG.accroche || "Ecris-nous, ta reponse arrive ici.";
  var POLL_MS = 4000;
  var STORE_CONV = "msgr_conv";
  var STORE_SEEN = "msgr_seen";
  var STORE_LOG = "msgr_log";

  /* --------- identite anonyme --------- */
  function getConv() {
    var c = localStorage.getItem(STORE_CONV);
    if (!c || !/^[a-f0-9]{16,64}$/.test(c)) {
      var b = new Uint8Array(16);
      crypto.getRandomValues(b);
      c = Array.prototype.map.call(b, function (x) {
        return ("0" + x.toString(16)).slice(-2);
      }).join("");
      localStorage.setItem(STORE_CONV, c);
    }
    return c;
  }
  var CONV = getConv();

  /* --------- journal local (affichage instantane) --------- */
  function loadLog() {
    try { return JSON.parse(localStorage.getItem(STORE_LOG)) || []; }
    catch (e) { return []; }
  }
  function saveLog(log) {
    try { localStorage.setItem(STORE_LOG, JSON.stringify(log.slice(-200))); } catch (e) {}
  }
  var LOG = loadLog();
  var lastSeen = Number(localStorage.getItem(STORE_SEEN) || 0);

  /* --------- styles --------- */
  var css = ""
    + ".msgr-btn{position:fixed;right:18px;bottom:18px;width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;z-index:2147483000;background:linear-gradient(135deg,#6d5efc,#22d3ee);box-shadow:0 8px 24px rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;transition:transform .15s}"
    + ".msgr-btn:hover{transform:scale(1.06)}"
    + ".msgr-btn svg{width:28px;height:28px;fill:#fff}"
    + ".msgr-badge{position:absolute;top:-3px;right:-3px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#ff4d6d;color:#fff;font:700 12px/20px system-ui;text-align:center;display:none}"
    + ".msgr-panel{position:fixed;right:18px;bottom:88px;width:340px;max-width:calc(100vw - 24px);height:480px;max-height:calc(100vh - 120px);z-index:2147483000;background:#141a2b;color:#e7ecf5;border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.45);display:none;flex-direction:column;overflow:hidden;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}"
    + ".msgr-panel.open{display:flex}"
    + ".msgr-head{padding:14px 16px;background:linear-gradient(135deg,#6d5efc,#22d3ee);color:#fff}"
    + ".msgr-head h3{margin:0;font-size:16px;font-weight:700}"
    + ".msgr-head p{margin:2px 0 0;font-size:12px;opacity:.9}"
    + ".msgr-head .msgr-x{position:absolute;top:10px;right:12px;background:none;border:none;color:#fff;font-size:22px;cursor:pointer;line-height:1}"
    + ".msgr-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px}"
    + ".msgr-msg{max-width:82%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.35;word-wrap:break-word;white-space:pre-wrap}"
    + ".msgr-user{align-self:flex-end;background:#6d5efc;color:#fff;border-bottom-right-radius:4px}"
    + ".msgr-support{align-self:flex-start;background:#243049;color:#e7ecf5;border-bottom-left-radius:4px}"
    + ".msgr-meta{align-self:center;font-size:11px;opacity:.55;padding:4px}"
    + ".msgr-foot{padding:10px;display:flex;gap:8px;border-top:1px solid rgba(255,255,255,.08);background:#0f1524}"
    + ".msgr-foot textarea{flex:1;resize:none;border:1px solid rgba(255,255,255,.12);background:#1b2438;color:#e7ecf5;border-radius:12px;padding:9px 11px;font:14px system-ui;height:40px;max-height:100px;outline:none}"
    + ".msgr-foot button{border:none;border-radius:12px;padding:0 14px;cursor:pointer;background:linear-gradient(135deg,#6d5efc,#22d3ee);color:#fff;font-weight:700}"
    + ".msgr-foot button:disabled{opacity:.5;cursor:default}"
    + "@media (prefers-color-scheme: light){.msgr-panel{background:#f5f7fc;color:#1b2233}.msgr-support{background:#e6ebf5;color:#1b2233}.msgr-foot{background:#eef1f8;border-top-color:rgba(0,0,0,.08)}.msgr-foot textarea{background:#fff;color:#1b2233;border-color:rgba(0,0,0,.15)}}";

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  /* --------- DOM --------- */
  var btn = document.createElement("button");
  btn.className = "msgr-btn";
  btn.setAttribute("aria-label", "Ouvrir le contact");
  btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg><span class="msgr-badge">0</span>';
  var badge = btn.querySelector(".msgr-badge");

  var panel = document.createElement("div");
  panel.className = "msgr-panel";
  panel.innerHTML =
    '<div class="msgr-head"><button class="msgr-x" aria-label="Fermer">&times;</button>' +
    '<h3></h3><p></p></div>' +
    '<div class="msgr-body"></div>' +
    '<div class="msgr-foot"><textarea placeholder="Ton message..." maxlength="4000"></textarea>' +
    '<button type="button">Envoyer</button></div>';
  panel.querySelector("h3").textContent = TITRE;
  panel.querySelector("p").textContent = ACCROCHE;

  var body = panel.querySelector(".msgr-body");
  var ta = panel.querySelector("textarea");
  var send = panel.querySelector(".msgr-foot button");

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  /* --------- rendu --------- */
  function fmt(ts) {
    var d = new Date(ts);
    return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  function render() {
    body.innerHTML = "";
    if (!LOG.length) {
      var hint = document.createElement("div");
      hint.className = "msgr-meta";
      hint.textContent = "Aucun message pour l'instant.";
      body.appendChild(hint);
    }
    LOG.forEach(function (m) {
      var el = document.createElement("div");
      el.className = "msgr-msg " + (m.from === "user" ? "msgr-user" : "msgr-support");
      el.textContent = m.text;
      body.appendChild(el);
      var meta = document.createElement("div");
      meta.className = "msgr-meta";
      meta.textContent = (m.from === "user" ? "Toi" : "Support") + " · " + fmt(m.ts);
      body.appendChild(meta);
    });
    body.scrollTop = body.scrollHeight;
  }
  render();

  function setBadge(n) {
    if (n > 0 && !panel.classList.contains("open")) {
      badge.textContent = n > 9 ? "9+" : String(n);
      badge.style.display = "block";
    } else {
      badge.style.display = "none";
    }
  }

  /* --------- reseau --------- */
  function haveEndpoint() {
    return !!ENDPOINT;
  }

  async function doSend(text) {
    var msg = { from: "user", text: text, ts: Date.now() };
    LOG.push(msg);
    saveLog(LOG);
    render();
    if (!haveEndpoint()) return;
    try {
      await fetch(ENDPOINT + "/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conv: CONV, text: text }),
      });
    } catch (e) { /* silencieux : le message reste affiche localement */ }
  }

  async function poll() {
    if (!haveEndpoint()) return;
    try {
      var r = await fetch(ENDPOINT + "/api/poll?conv=" + CONV + "&after=" + lastSeen);
      if (!r.ok) return;
      var data = await r.json();
      var incoming = (data.messages || []).filter(function (m) { return m.from === "support"; });
      if (incoming.length) {
        incoming.forEach(function (m) {
          LOG.push({ from: "support", text: m.text, ts: m.ts });
        });
        LOG.sort(function (a, b) { return a.ts - b.ts; });
        saveLog(LOG);
        var maxTs = Math.max.apply(null, data.messages.map(function (m) { return m.ts; }));
        lastSeen = Math.max(lastSeen, maxTs);
        localStorage.setItem(STORE_SEEN, String(lastSeen));
        render();
        setBadge(incoming.length);
      } else if (data.now) {
        // rien de nouveau
      }
    } catch (e) { /* hors ligne : on reessaiera */ }
  }

  /* --------- interactions --------- */
  function open() {
    panel.classList.add("open");
    setBadge(0);
    ta.focus();
    body.scrollTop = body.scrollHeight;
  }
  function close() { panel.classList.remove("open"); }

  btn.addEventListener("click", function () {
    panel.classList.contains("open") ? close() : open();
  });
  panel.querySelector(".msgr-x").addEventListener("click", close);

  function trySend() {
    var text = ta.value.trim();
    if (!text) return;
    ta.value = "";
    doSend(text);
  }
  send.addEventListener("click", trySend);
  ta.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); trySend(); }
  });
  ta.addEventListener("input", function () {
    ta.style.height = "40px";
    ta.style.height = Math.min(ta.scrollHeight, 100) + "px";
  });

  // Ouverture automatique (utile sur une page de contact dediee)
  if (CFG.autoOpen) open();

  // Polling
  poll();
  setInterval(poll, POLL_MS);
})();
