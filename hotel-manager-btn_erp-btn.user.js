// ==UserScript==
// @name         Pylon: Hotel-Manager & ERP Button
// @namespace    https://seekda.com
// @version      1.1.0
// @description  Fügt in der Issue Sidebar unter der Hotel-ID eine Zeile mit zwei Buttons ein: links "🏨 Hotel-Manager", rechts "🧑‍🤝‍🧑 Verrechnungspartner …". ERP-Link über persistenten Cache und Analytics-Query.
// @match        https://app.usepylon.com/issues/*
// @run-at       document-idle
// @author       you
// @updateURL    https://raw.githubusercontent.com/mg-seekda/pylon-userscripts/main/hotel-manager-btn_erp-btn.user.js
// @downloadURL  https://raw.githubusercontent.com/mg-seekda/pylon-userscripts/main/hotel-manager-btn_erp-btn.user.js
// @grant        GM_xmlhttpRequest
// @connect      analytics.seekda.com
// @connect      hotels.seekda.com
// ==/UserScript==

(() => {
  "use strict";

  const HOTEL_ID_PLACEHOLDER = "Hotel-ID";
  const HOTEL_ID_LABEL_TEXTS = ["Hotel-ID", "Hotel ID"];
  const ID_REGEX = /^[A-Za-z0-9_-]{3,}$/;
  const HM_BASE = "https://hotels.seekda.com/";
  const ANALYTICS_URL = "http://analytics.seekda.com/api/queries/2983/results.json?api_key=wsEZCx6Y4E2pnuuWBGeHDjxtnVOs1rtGve5Ge545";
  const CACHE_KEY = "hmErpCache";
  const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

  const buildHmUrl = (id) => `${HM_BASE}~/cm/${encodeURIComponent(id)}`;

  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const textEq = (el, s) => ((el.textContent || "").trim().toLowerCase() === s.toLowerCase());
  const raf = (fn) => requestAnimationFrame(fn);

  function closestRow(el) {
    while (el && el !== document.documentElement) {
      if (el.tagName === "DIV" && el.classList.contains("flex") && el.className.includes("min-h-8")) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  function getHotelIdInputCandidates(root) {
    const fromPlaceholder = qsa(`input[placeholder="${HOTEL_ID_PLACEHOLDER}"]`, root);
    const spanLabels = qsa("span", root).filter(el =>
      HOTEL_ID_LABEL_TEXTS.some(t => textEq(el, t))
    );
    const fromSibling = [];
    for (const lab of spanLabels) {
      const sib = lab.nextElementSibling;
      if (sib && sib.tagName === "INPUT") fromSibling.push(sib);
    }
    return Array.from(new Set([...fromPlaceholder, ...fromSibling]));
  }

  function createCompanionRow() {
    const row = document.createElement("div");
    row.className = "relative flex min-h-8 items-center gap-x-3 px-1.5";
    row.dataset.hmErpRow = "1";

    const left = document.createElement("div");
    left.className = "relative flex shrink-0 items-center gap-2";
    left.style.minWidth = "150px";

    const hmBtn = document.createElement("a");
    hmBtn.dataset.hotelManagerLink = "1";
    hmBtn.className = "button button--primary button--md";
    hmBtn.textContent = "🏨 Hotel-Manager";
    hmBtn.target = "blank";
    hmBtn.rel = "noopener noreferrer";
    hmBtn.style.whiteSpace = "nowrap";

    left.appendChild(hmBtn);

    const right = document.createElement("div");
    right.className = "flex max-w-full min-w-0 flex-1";
    right.dataset.hmErpRight = "1";

    const erpBtn = document.createElement("a");
    erpBtn.dataset.erpLink = "1";
    erpBtn.className = "button button--primary button--md";
    erpBtn.textContent = "🧑‍🤝‍🧑 Partner …";
    erpBtn.target = "blank";
    erpBtn.rel = "noopener noreferrer";
    erpBtn.style.whiteSpace = "nowrap";
    erpBtn.setAttribute("aria-disabled", "true");
    erpBtn.style.opacity = "0.5";
    erpBtn.style.pointerEvents = "none";

    right.appendChild(erpBtn);
    row.appendChild(left);
    row.appendChild(right);
    return row;
  }

  function findOrCreateCompanionRow(afterRow) {
    const nextSibling = afterRow.nextElementSibling;
    if (nextSibling && nextSibling.dataset && nextSibling.dataset.hmErpRow === "1") {
      return nextSibling;
    }
    const row = createCompanionRow();
    afterRow.parentElement.insertBefore(row, afterRow.nextSibling);
    return row;
  }

  function setHmButton(row, hotelId) {
    const btn = row.querySelector('a[data-hotel-manager-link]');
    if (!btn) return;
    const clean = (hotelId || "").trim();
    if (ID_REGEX.test(clean)) {
      const url = buildHmUrl(clean);
      btn.href = url;
      btn.title = `Öffnen: ${url}`;
      btn.style.opacity = "1";
      btn.style.pointerEvents = "auto";
      btn.setAttribute("aria-disabled", "false");
    } else {
      btn.removeAttribute("href");
      btn.title = "Bitte gültige Hotel-ID eingeben";
      btn.style.opacity = "0.5";
      btn.style.pointerEvents = "none";
      btn.setAttribute("aria-disabled", "true");
    }
  }

  function setErpButtonLoading(row) {
    const btn = row.querySelector('a[data-erp-link]');
    if (!btn) return;
    btn.textContent = "🧑‍🤝‍🧑 Partner …";
    btn.removeAttribute("href");
    btn.setAttribute("aria-disabled", "true");
    btn.style.opacity = "0.5";
    btn.style.pointerEvents = "none";
    btn.title = "Lade ERP-Link …";
  }

  function setErpButtonReady(row, url, partnerId) {
    const btn = row.querySelector('a[data-erp-link]');
    if (!btn) return;
    btn.textContent = `🧑‍🤝‍🧑 Partner ${partnerId}`;
    btn.href = url;
    btn.setAttribute("aria-disabled", "false");
    btn.style.opacity = "1";
    btn.style.pointerEvents = "auto";
    btn.title = `Öffnen: ${url}`;
  }

  function setErpButtonDisabled(row, reason = "nicht gefunden") {
    const btn = row.querySelector('a[data-erp-link]');
    if (!btn) return;
    btn.textContent = `🧑‍🤝‍🧑 Partner (${reason})`;
    btn.removeAttribute("href");
    btn.setAttribute("aria-disabled", "true");
    btn.style.opacity = "0.5";
    btn.style.pointerEvents = "none";
    btn.title = `ERP-Link ${reason}`;
  }

  // ===== Cache =====
  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (Date.now() - obj.timestamp > CACHE_TTL) return null;
      return new Map(obj.data);
    } catch (e) {
      console.error("Fehler beim Laden des ERP-Caches", e);
      return null;
    }
  }

  function saveCache(map) {
    try {
      const obj = { timestamp: Date.now(), data: Array.from(map.entries()) };
      localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
    } catch (e) {
      console.error("Fehler beim Speichern des ERP-Caches", e);
    }
  }

  async function fetchErpData() {
    try {
      const r = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url: ANALYTICS_URL,
          headers: { "Accept": "application/json" },
          onload: res => resolve(JSON.parse(res.responseText)),
          onerror: reject,
          ontimeout: () => reject(new Error("timeout"))
        });
      });

      const map = new Map();
      r.forEach(item => {
        const hid = (item.name || "").trim();
        const pid = (item.account_partner_id || "").trim();
        if (hid && pid) map.set(hid, pid);
      });

      saveCache(map);
      return map;
    } catch (e) {
      console.error("Fehler beim Laden der ERP-Daten", e);
      return new Map();
    }
  }

  async function updateErpButton(row, hotelId) {
    const clean = (hotelId || "").trim();
    if (!ID_REGEX.test(clean)) {
      setErpButtonDisabled(row, "invalid Hotel-ID");
      return;
    }

    setErpButtonLoading(row);

    let map = loadCache();
    if (!map) map = await fetchErpData();

    let partnerId = map.get(clean);
    if (!partnerId) {
      map = await fetchErpData();
      partnerId = map.get(clean);
    }

    if (partnerId) {
      const url = `${HM_BASE}~/erpRedirect.do?partnerId=${partnerId}`;
      setErpButtonReady(row, url, partnerId);
    } else {
      setErpButtonDisabled(row, "nicht gefunden");
    }
  }

  const debounceMap = new Map();
  function debounce(key, fn, delay = 400) {
    const prev = debounceMap.get(key);
    if (prev) clearTimeout(prev);
    const t = setTimeout(fn, delay);
    debounceMap.set(key, t);
  }

  function setBothButtons(row, hotelId) {
    setHmButton(row, hotelId);
    debounce(row, () => updateErpButton(row, hotelId), 450);
  }

  function bindToInput(input) {
    if (input.dataset._hmErpBound) return;
    input.dataset._hmErpBound = "1";

    const row = closestRow(input);
    if (!row) return;

    const companion = findOrCreateCompanionRow(row);

    setBothButtons(companion, input.value || "");

    const handler = () => setBothButtons(companion, input.value || "");
    input.addEventListener("input", handler, { passive: true });
    input.addEventListener("change", handler, { passive: true });
  }

  function processRoot(root = document) {
    const inputs = getHotelIdInputCandidates(root);
    inputs.forEach(bindToInput);

    if (inputs.length === 0) {
      const spanLabels = qsa("span", root).filter(el =>
        HOTEL_ID_LABEL_TEXTS.some(t => textEq(el, t))
      );
      for (const lab of spanLabels) {
        const valEl = lab.nextElementSibling;
        if (!valEl) continue;
        const parentRow = closestRow(lab);
        if (!parentRow) continue;

        const companion = findOrCreateCompanionRow(parentRow);
        if (!companion.dataset._hmErpBoundStatic) {
          companion.dataset._hmErpBoundStatic = "1";
          const readVal = () => (valEl.textContent || "").trim();
          setBothButtons(companion, readVal());

          const mo = new MutationObserver(() => setBothButtons(companion, readVal()));
          mo.observe(valEl, { childList: true, subtree: true, characterData: true });
        }
      }
    }
  }

  processRoot(document);

  let scheduled = false;
  const mo = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    raf(() => {
      scheduled = false;
      processRoot(document);
    });
  });
  mo.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
})();
