// ==UserScript==
// @name         Pylon: Hotel-Manager, ERP & Time Tracker
// @namespace    https://seekda.com
// @version      1.7.2
// @description  HM & ERP Buttons unter Hotel-ID; Time-Tracker-Button darunter (öffnet HTS mit aktuellem Ticket + User).
// @match        https://app.usepylon.com/support/*
// @run-at       document-start
// @author       Seekda
// @updateURL    https://raw.githubusercontent.com/seekda/pylon-userscripts/main/hotel-manager-btn_erp-btn.user.js
// @downloadURL  https://raw.githubusercontent.com/seekda/pylon-userscripts/main/hotel-manager-btn_erp-btn.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      analytics.seekda.com
// ==/UserScript==

(() => {
  "use strict";

  /* =========================
     HTS Time Tracker (user + issue from Pylon; SSO used, no EMBED_TOKEN)
  ========================= */
  const HTS_EMBED_BASE = "https://hts.seekda.com/embed/time-tracker";
  const PYLON_HTS_EMAIL_ATTR = "data-pylon-hts-email";
  const PYLON_HTS_ISSUE_ATTR = "data-pylon-hts-issue-id";
  const PYLON_HTS_TICKET_NUMBER_ATTR = "data-pylon-hts-ticket-number";

  let currentUserEmail = null;
  let currentIssueId = null;
  let currentTicketNumber = null;
  let timeTrackerPollTimer = null;

  function normalizeEmail(val) {
    if (typeof val !== "string") return null;
    const trimmed = val.trim();
    return trimmed.indexOf("@") !== -1 ? trimmed : null;
  }

  function readPylonDataFromDOM() {
    const root = document.documentElement;
    const emailRaw = root.getAttribute(PYLON_HTS_EMAIL_ATTR);
    const issueIdRaw = root.getAttribute(PYLON_HTS_ISSUE_ATTR);
    const ticketNumberRaw = root.getAttribute(PYLON_HTS_TICKET_NUMBER_ATTR);
    const email = normalizeEmail(emailRaw);
    const issueId = issueIdRaw && issueIdRaw.trim ? issueIdRaw.trim() : issueIdRaw;
    const ticketNumber = ticketNumberRaw != null && ticketNumberRaw !== "" ? String(ticketNumberRaw).trim() : null;
    let changed = false;
    if (email && email !== currentUserEmail) {
      currentUserEmail = email;
      changed = true;
    }
    if (issueId && issueId !== currentIssueId) {
      currentIssueId = issueId;
      changed = true;
    }
    if (ticketNumber !== currentTicketNumber) {
      currentTicketNumber = ticketNumber;
      changed = true;
    }
    if (changed) maybeUpdateTimeTracker();
  }

  function buildTimeTrackerHref() {
    const params = new URLSearchParams();
    if (currentIssueId) params.set("issue_id", currentIssueId);
    if (currentUserEmail) params.set("actor_email", currentUserEmail);
    // Ticket number: prefer Pylon ticket page URL param (issueNumber=25969), else GraphQL/DOM
    const issueNumberFromUrl = typeof window !== "undefined" && window.location && window.location.search
      ? new URLSearchParams(window.location.search).get("issueNumber")
      : null;
    const ticketNumberForLink = (issueNumberFromUrl && issueNumberFromUrl.trim()) || currentTicketNumber;
    if (ticketNumberForLink) params.set("ticket_number", String(ticketNumberForLink).trim());
    const qs = params.toString();
    return qs ? `${HTS_EMBED_BASE}?${qs}` : HTS_EMBED_BASE;
  }

  function maybeUpdateTimeTracker() {
    document.querySelectorAll("[data-hts-time-tracker]").forEach(a => {
      if (a instanceof HTMLAnchorElement) {
        a.href = buildTimeTrackerHref();
        a.style.opacity = currentIssueId && currentUserEmail ? "1" : "0.5";
        a.style.pointerEvents = currentIssueId && currentUserEmail ? "auto" : "none";
      }
    });
  }

  function startTimeTrackerPoll() {
    if (timeTrackerPollTimer) return;
    timeTrackerPollTimer = setInterval(function () {
      readPylonDataFromDOM();
      if (currentUserEmail && currentIssueId) {
        clearInterval(timeTrackerPollTimer);
        timeTrackerPollTimer = null;
      }
    }, 400);
    setTimeout(function () {
      if (timeTrackerPollTimer) {
        clearInterval(timeTrackerPollTimer);
        timeTrackerPollTimer = null;
      }
    }, 20000);
  }

  (function injectInterceptor() {
    const script = document.createElement("script");
    script.id = "pylon-hts-interceptor";
    script.textContent = [
      "(function(){",
      "var r=document.documentElement;",
      "var origFetch=window.fetch;",
      "if(origFetch){",
      "window.fetch=function(){",
      "var u=typeof arguments[0]==='string'?arguments[0]:arguments[0]&&arguments[0].url;",
      "return origFetch.apply(this,arguments).then(function(res){",
      "var c=res.clone();",
      "if(u&&u.indexOf('graph.usepylon.com/auth')!==-1){c.text().then(function(t){try{var d=JSON.parse(t);if(d&&typeof d.email==='string'){var e=d.email.trim();if(e.indexOf('@')!==-1){r.setAttribute('data-pylon-hts-email',e);}}}catch(e){}}).catch(function(){});}",
      "if(u&&u.indexOf('graph.usepylon.com/graphql')!==-1){c.text().then(function(t){try{var d=JSON.parse(t);var o=d&&d.data&&d.data.organization&&d.data.organization.issue;if(o){var id=o.id;if(id&&typeof id==='string'){r.setAttribute('data-pylon-hts-issue-id',id);}var num=o.ticketNumber!=null?o.ticketNumber:o.number;if(num!=null){r.setAttribute('data-pylon-hts-ticket-number',String(num));}else{r.removeAttribute('data-pylon-hts-ticket-number');}}}catch(e){}}).catch(function(){});}",
      "return res;});};}",
      "var O=window.XMLHttpRequest;",
      "if(O){",
      "window.XMLHttpRequest=function(){",
      "var x=new O(),url='';",
      "var open=x.open;x.open=function(m,u){url=u;return open.apply(this,arguments);};",
      "x.addEventListener('load',function(){",
      "if(url&&url.indexOf('graph.usepylon.com/auth')!==-1&&x.responseText){try{var d=JSON.parse(x.responseText);if(d&&typeof d.email==='string'){var e=d.email.trim();if(e.indexOf('@')!==-1){r.setAttribute('data-pylon-hts-email',e);}}}catch(e){}}",
      "if(url&&url.indexOf('graph.usepylon.com/graphql')!==-1&&x.responseText){try{var d=JSON.parse(x.responseText);var o=d&&d.data&&d.data.organization&&d.data.organization.issue;if(o){var id=o.id;if(id&&typeof id==='string'){r.setAttribute('data-pylon-hts-issue-id',id);}var num=o.ticketNumber!=null?o.ticketNumber:o.number;if(num!=null){r.setAttribute('data-pylon-hts-ticket-number',String(num));}else{r.removeAttribute('data-pylon-hts-ticket-number');}}}catch(e){}}",
      "});",
      "return x;};}",
      "})();"
    ].join("");
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  })();

  /* =========================
     Konfiguration
  ========================= */
  const HOTEL_ID_TEXTS = ["Hotel-ID", "Hotel ID", "HotelId", "Hotel identifier"];
  const VALID_ID_REGEX = /^[A-Za-z0-9_-]{3,}$/;

  const HM_BASE = "https://hotels.seekda.com/~/cm/";
  const ERP_BASE =
    "https://erp.seekda.com/web#model=res.partner&view_type=form&id=";

  const ANALYTICS_BASE =
    "https://analytics.seekda.com/api/queries/2983/results.json";

  const STORAGE_KEY = "pylon_analytics_api_key";
  const CACHE_KEY = "_pylon_erp_cache";

  const norm = s => (s || "").replace(/\s+/g, " ").trim();
  const textsLower = HOTEL_ID_TEXTS.map(t => t.toLowerCase());

  /* =========================
     API Key Management
  ========================= */
  function getStoredApiKey() {
    try {
      return (GM_getValue(STORAGE_KEY, "") || "").trim();
    } catch {
      return "";
    }
  }

  function setStoredApiKey(v) {
    try {
      GM_setValue(STORAGE_KEY, (v || "").trim());
    } catch {}
  }

  function buildAnalyticsUrl(key) {
    if (!key) return null;
    const u = new URL(ANALYTICS_BASE);
    u.searchParams.set("api_key", key);
    return u.toString();
  }

  GM_registerMenuCommand("Set analytics API key", () => {
    const current = getStoredApiKey();
    const val = prompt("Paste your analytics API key:", current || "");
    if (val === null) return;
    setStoredApiKey(val);
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {}
    erpCache = new Map();
    didFetch = false;
    processRoot(document);
  });

  /* =========================
     Cache
  ========================= */
  function loadCache() {
    try {
      return new Map(
        Object.entries(JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"))
      );
    } catch {
      return new Map();
    }
  }

  function saveCache(map) {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify(Object.fromEntries(map))
      );
    } catch {}
  }

  let erpCache = loadCache();
  let didFetch = false;

  /* =========================
     ERP Fetch
  ========================= */
  async function fetchErpData() {
    const key = getStoredApiKey();
    const url = buildAnalyticsUrl(key);
    if (!url) return erpCache;

    const res = await new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        onload: r => resolve(JSON.parse(r.responseText)),
        onerror: reject
      });
    });

    const rows = res?.query_result?.data?.rows || [];
    const map = new Map();

    rows.forEach(r => {
      const hid = norm(r.name);
      if (hid && r.erp_res_partner_id) {
        map.set(hid, {
          erp: r.erp_res_partner_id
        });
      }
    });

    saveCache(map);
    erpCache = map;
    return map;
  }

  async function ensureErpData() {
    if (erpCache.size > 0) return erpCache;
    if (didFetch) return erpCache;
    didFetch = true;
    return await fetchErpData();
  }

  /* =========================
     DOM Helper
  ========================= */
  const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));

  const getSidebarRow = el =>
    el?.closest?.('div[class*="group/sidebar-row"]') || null;

  const getFieldRow = el =>
    el?.closest?.(
      'div[class*="relative"][class*="flex"][class*="items-center"]'
    ) || null;

  /* =========================
     Companion Row (HM, ERP + Time Tracker underneath)
  ========================= */
  function createRow() {
    const row = document.createElement("div");
    row.dataset.hmErpRow = "1";
    row.className = "relative flex flex-col gap-y-1 px-1.5";

    const inner = document.createElement("div");
    inner.className = "flex min-h-8 items-center gap-x-3";

    const left = document.createElement("div");
    left.style.minWidth = "150px";

    const hm = document.createElement("a");
    hm.dataset.hm = "1";
    hm.className = "button button--primary button--md";
    hm.textContent = "🏨 Hotel-Manager";
    hm.target = "_blank";
    hm.rel = "noopener noreferrer";

    const right = document.createElement("div");
    right.className = "flex flex-1";

    const erp = document.createElement("a");
    erp.dataset.erp = "1";
    erp.className = "button button--primary button--md";
    erp.textContent = "🧑‍🤝‍🧑 Partner …";
    erp.style.opacity = "0.5";
    erp.style.pointerEvents = "none";

    left.appendChild(hm);
    right.appendChild(erp);
    inner.appendChild(left);
    inner.appendChild(right);
    row.appendChild(inner);

    const timeTrackerLine = document.createElement("div");
    timeTrackerLine.className = "flex min-h-8 items-center gap-x-3";
    const timeTrackerLeft = document.createElement("div");
    timeTrackerLeft.style.minWidth = "150px";
    const timeTrackerBtn = document.createElement("a");
    timeTrackerBtn.dataset.htsTimeTracker = "1";
    timeTrackerBtn.className = "button button--primary button--md";
    timeTrackerBtn.textContent = "⏱ Time Tracker";
    timeTrackerBtn.target = "_blank";
    timeTrackerBtn.rel = "noopener noreferrer";
    timeTrackerBtn.href = buildTimeTrackerHref();
    timeTrackerBtn.style.opacity = currentIssueId && currentUserEmail ? "1" : "0.5";
    timeTrackerBtn.style.pointerEvents = currentIssueId && currentUserEmail ? "auto" : "none";
    timeTrackerLeft.appendChild(timeTrackerBtn);
    timeTrackerLine.appendChild(timeTrackerLeft);
    row.appendChild(timeTrackerLine);

    return row;
  }

  function findOrCreateRow(anchor) {
    const field = getFieldRow(anchor);
    const sidebar = getSidebarRow(field);
    if (!field || !sidebar) return null;

    const existing = sidebar.querySelector(
      ':scope > [data-hm-erp-row="1"]'
    );
    if (existing) {
      readPylonDataFromDOM();
      return existing;
    }

    const row = createRow();
    sidebar.insertBefore(row, field.nextSibling);
    readPylonDataFromDOM();
    startTimeTrackerPoll();
    return row;
  }

  /* =========================
     Apply Buttons
  ========================= */
  function applyHm(row, hotelId) {
    const btn = row.querySelector("[data-hm]");
    const id = norm(hotelId);
    if (VALID_ID_REGEX.test(id)) {
      btn.href = HM_BASE + encodeURIComponent(id);
      btn.style.opacity = "1";
      btn.style.pointerEvents = "auto";
    } else {
      btn.removeAttribute("href");
      btn.style.opacity = "0.5";
      btn.style.pointerEvents = "none";
    }
  }

  function applyErp(row, hotelId) {
    const btn = row.querySelector("[data-erp]");
    const id = norm(hotelId);
    const hit = erpCache.get(id);

    if (hit?.erp) {
      btn.href = ERP_BASE + hit.erp;
      btn.textContent = "🧑‍🤝‍🧑 Partner öffnen";
      btn.target = "_blank";
      btn.rel = "noopener noreferrer";
      btn.style.opacity = "1";
      btn.style.pointerEvents = "auto";
    } else {
      btn.removeAttribute("href");
      btn.textContent = "🧑‍🤝‍🧑 Partner …";
      btn.style.opacity = "0.5";
      btn.style.pointerEvents = "none";
    }
  }

  /* =========================
     Bind
  ========================= */
  function bind(anchor) {
    if (anchor.dataset.bound) return;
    anchor.dataset.bound = "1";

    const row = findOrCreateRow(anchor);
    if (!row) return;

    const applyAll = async () => {
      const val = anchor.value || "";
      applyHm(row, val);
      await ensureErpData();
      applyErp(row, val);
      maybeUpdateTimeTracker();
    };

    applyAll();
    anchor.addEventListener("input", applyAll, { passive: true });
    anchor.addEventListener("change", applyAll, { passive: true });
  }

  /* =========================
     Bootstrap
  ========================= */
  function processRoot(root) {
    const field = qsa("input,textarea", root).find(el =>
      textsLower.includes((el.placeholder || "").toLowerCase())
    );
    if (field) bind(field);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => processRoot(document));
  } else {
    processRoot(document);
  }

  let raf = false;
  new MutationObserver(() => {
    if (raf) return;
    raf = true;
    requestAnimationFrame(() => {
      raf = false;
      processRoot(document);
    });
  }).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
