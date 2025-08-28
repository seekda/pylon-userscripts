// ==UserScript==
// @name         Pylon: Hotel-Manager & ERP Button
// @namespace    https://seekda.com
// @version      1.0.0
// @description  Fügt in der Issue Sidebar unter der Hotel-ID eine Zeile mit zwei Buttons ein: links "🏨 Hotel-Manager", rechts "🧑‍🤝‍🧑 Verrechnungspartner …". Buttons werden bei Änderungen der Hotel-ID live angepasst.
// @match        https://app.usepylon.com/issues/*
// @run-at       document-idle
// @author       you
// @updateURL    https://raw.githubusercontent.com/mg-seekda/pylon-userscripts/main/hotel-manager-btn_erp-btn.user.js
// @downloadURL  https://raw.githubusercontent.com/mg-seekda/pylon-userscripts/main/hotel-manager-btn_erp-btn.user.js
// @grant        GM_xmlhttpRequest
// @connect      hotels.seekda.com
// ==/UserScript==

(() => {
  "use strict";

  // ===== Konfiguration =====
  const HOTEL_ID_PLACEHOLDER = "Hotel-ID";
  const HOTEL_ID_LABEL_TEXTS = ["Hotel-ID", "Hotel ID"];
  const ID_REGEX = /^[A-Za-z0-9_-]{3,}$/;

  const buildHmUrl = (id) => `https://hotels.seekda.com/~/cm/${encodeURIComponent(id)}`;

  // ===== Helpers =====
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

  // ===== UI: Neue Zeile -> links HM-Button (statt Label), rechts ERP-Button (statt HM) =====
  function createCompanionRow() {
    const row = document.createElement("div");
    row.className = "relative flex min-h-8 items-center gap-x-3 px-1.5";
    row.dataset.hmErpRow = "1";

    // Linke Spalte: hier kommt der HM-Button hin (ersetzt das alte Label)
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

    // Rechte Spalte: hier der ERP-Button (wo vorher der HM-Button war)
    const right = document.createElement("div");
    right.className = "flex max-w-full min-w-0 flex-1";
    right.dataset.hmErpRight = "1";

    const erpBtn = document.createElement("a");
    erpBtn.dataset.erpLink = "1";
    erpBtn.className = "button button--primary button--md";
    erpBtn.textContent = "🧑‍🤝‍🧑 Verrechnungspartner …";
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

  // ===== ERP aus HM-Startseite =====
  function extractErpLink(htmlText) {
    const doc = new DOMParser().parseFromString(htmlText, "text/html");
    const anchors = Array.from(doc.querySelectorAll('a[href*="erpRedirect.do?partnerId="]'));
    for (const a of anchors) {
      const href = a.getAttribute("href") || "";
      const m = href.match(/erpRedirect\.do\?partnerId=(\d+)/i);
      if (m) {
        const absolute = new URL(href, "https://hotels.seekda.com/").toString();
        return { url: absolute, partnerId: m[1] };
      }
    }
    return null;
  }

  function fetchText(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        headers: { "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) resolve(res.responseText);
          else reject(new Error(`HTTP ${res.status}`));
        },
        onerror: reject,
        ontimeout: () => reject(new Error("timeout")),
      });
    });
  }

  function setErpButtonLoading(row, label = "🧑‍🤝‍🧑 Verrechnungspartner …") {
    const btn = row.querySelector('a[data-erp-link]');
    if (!btn) return;
    btn.textContent = label;
    btn.removeAttribute("href");
    btn.setAttribute("aria-disabled", "true");
    btn.style.opacity = "0.5";
    btn.style.pointerEvents = "none";
    btn.title = "Lade ERP-Link …";
  }

  function setErpButtonReady(row, url, partnerId) {
    const btn = row.querySelector('a[data-erp-link]');
    if (!btn) return;
    btn.textContent = `🧑‍🤝‍🧑 Verrechnungspartner ${partnerId}`;
    btn.href = url;
    btn.setAttribute("aria-disabled", "false");
    btn.style.opacity = "1";
    btn.style.pointerEvents = "auto";
    btn.title = `Öffnen: ${url}`;
  }

  function setErpButtonDisabled(row, reason = "nicht gefunden") {
    const btn = row.querySelector('a[data-erp-link]');
    if (!btn) return;
    btn.textContent = `🧑‍🤝‍🧑 Verrechnungspartner (${reason})`;
    btn.removeAttribute("href");
    btn.setAttribute("aria-disabled", "true");
    btn.style.opacity = "0.5";
    btn.style.pointerEvents = "none";
    btn.title = `ERP-Link ${reason}`;
  }

  // Debounce damit beim Tippen nicht dauernd geladen wird
  const debounceMap = new Map();
  function debounce(key, fn, delay = 400) {
    const prev = debounceMap.get(key);
    if (prev) clearTimeout(prev);
    const t = setTimeout(fn, delay);
    debounceMap.set(key, t);
  }

  async function updateErpButton(row, hotelId) {
    const clean = (hotelId || "").trim();
    if (!ID_REGEX.test(clean)) {
      setErpButtonDisabled(row, "ungültige Hotel-ID");
      return;
    }
    setErpButtonLoading(row);
    try {
      const hmUrl = buildHmUrl(clean);
      const html = await fetchText(hmUrl);
      const erp = extractErpLink(html);
      if (erp && erp.url && erp.partnerId) {
        setErpButtonReady(row, erp.url, erp.partnerId);
      } else {
        setErpButtonDisabled(row, "nicht gefunden");
      }
    } catch (e) {
      console.error("[Pylon HM+ERP] Fehler beim Laden:", e);
      setErpButtonDisabled(row, "Fehler beim Laden");
    }
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

    // Initial
    setBothButtons(companion, input.value || "");

    // Live-Updates
    const handler = () => setBothButtons(companion, input.value || "");
    input.addEventListener("input", handler, { passive: true });
    input.addEventListener("change", handler, { passive: true });
  }

  function processRoot(root = document) {
    const inputs = getHotelIdInputCandidates(root);
    inputs.forEach(bindToInput);

    // Fallback: statische Hotel-ID (kein Input)
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

  // Initial
  processRoot(document);

  // Beobachte SPA-Änderungen
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
