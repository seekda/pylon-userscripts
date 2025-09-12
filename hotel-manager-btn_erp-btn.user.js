// ==UserScript==
// @name         Pylon: Hotel-Manager & ERP Button
// @namespace    https://seekda.com
// @version      1.4.0
// @description  Fügt unter der Hotel-ID eine eigene Row mit zwei Buttons ein (HM & ERP). Robust gegen DOM-Änderungen: Input/Textarea/Read-only + Textscan.
// @match        https://app.usepylon.com/issues/*
// @run-at       document-idle
// @author       you
// @updateURL    https://raw.githubusercontent.com/mg-seekda/pylon-userscripts/main/hotel-manager-btn_erp-btn.user.js
// @downloadURL  https://raw.githubusercontent.com/mg-seekda/pylon-userscripts/main/hotel-manager-btn_erp-btn.user.js
// @grant        GM_xmlhttpRequest
// @connect      analytics.seekda.com
// ==/UserScript==

(() => {
  "use strict";

  // === Konfiguration ===
  const HOTEL_ID_TEXTS = ["Hotel-ID", "Hotel ID", "HotelId", "Hotel identifier"];
  const ID_REGEX_INLINE = /([A-Za-z0-9_-]{3,})/;
  const VALID_ID_REGEX = /^[A-Za-z0-9_-]{3,}$/;
  const HM_BASE = "https://hotels.seekda.com/";
  const ANALYTICS_URL = "https://analytics.seekda.com/api/queries/2983/results.json?api_key=wsEZCx6Y4E2pnuuWBGeHDjxtnVOs1rtGve5Ge545";

  const buildHmUrl = id => `${HM_BASE}~/cm/${encodeURIComponent(id)}`;
  const norm = s => (s || "").replace(/\s+/g, " ").trim();

  // === Helpers ===
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const raf = fn => requestAnimationFrame(fn);
  const textsLower = HOTEL_ID_TEXTS.map(t => t.toLowerCase());
  const looksLikeHotelLabel = el => textsLower.includes(norm(el.textContent).toLowerCase());

  // findet die äußere Feld-ROW (dein Beispiel: 'relative flex min-h-8 items-center gap-x-3 px-1.5')
  function findFieldRow(el) {
    if (!el) return null;
    let cur = el;
    while (cur && cur !== document.documentElement) {
      if (
        cur.nodeType === 1 &&
        cur.tagName === "DIV" &&
        cur.classList.contains("relative") &&
        cur.classList.contains("flex") &&
        cur.className.includes("min-h-8") &&
        cur.className.includes("items-center") &&
        cur.className.includes("gap-x-3") &&
        cur.className.includes("px-1.5")
      ) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  // etwas großzügigerer Row-Finder als Fallback
  function closestRow(el) {
    return el?.closest?.(
      [
        'div[class*="relative"][class*="flex"][class*="min-h-8"][class*="items-center"][class*="px-1.5"]',
        'div[class*="flex"][class*="items-center"]',
        'div[class*="grid"]',
        'section',
        'li',
        '[data-testid*="field"]',
        '[role="row"]',
      ].join(',')
    ) || el?.parentElement || null;
  }

  // === UI: Buttons ===
  function createCompanionRow() {
    // gleiche Grundstruktur wie die Feld-Row
    const row = document.createElement("div");
    row.dataset.hmErpRow = "1";
    row.className = "relative flex min-h-8 items-center gap-x-3 px-1.5";

    const left = document.createElement("div");
    left.className = "relative flex shrink-0 items-center gap-2";
    left.style.minWidth = "150px";

    const hmBtn = document.createElement("a");
    hmBtn.dataset.hotelManagerLink = "1";
    hmBtn.className = "button button--primary button--md";
    hmBtn.textContent = "🏨 Hotel-Manager";
    hmBtn.target = "_blank";
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
    erpBtn.target = "_blank";
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

  // **WICHTIG**: immer NACH der äußeren Feld-Row einfügen, nicht in deren rechter Spalte
  function findOrCreateCompanionRow(anchorEl) {
    const fieldRow = findFieldRow(anchorEl) || closestRow(anchorEl);
    if (!fieldRow || !fieldRow.parentElement) return null;

    // Falls bereits vorhanden: direktes Sibling prüfen
    const next = fieldRow.nextElementSibling;
    if (next?.dataset?.hmErpRow === "1") return next;

    const row = createCompanionRow();
    fieldRow.parentElement.insertBefore(row, fieldRow.nextSibling);
    return row;
  }

  function setHmButton(row, hotelId) {
    const btn = row.querySelector('a[data-hotel-manager-link]');
    if (!btn) return;
    const clean = norm(hotelId);
    if (VALID_ID_REGEX.test(clean)) {
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

  function setErpButtonLoading(row, label = "🧑‍🤝‍🧑 Partner …") {
    const btn = row.querySelector('a[data-erp-link]');
    if (!btn) return;
    btn.textContent = label;
    btn.removeAttribute("href");
    btn.setAttribute("aria-disabled", "true");
    btn.style.opacity = "0.5";
    btn.style.pointerEvents = "none";
    btn.title = "Lade ERP-Link …";
  }

  function setErpButtonReady(row, partnerId) {
    const btn = row.querySelector('a[data-erp-link]');
    if (!btn) return;
    btn.textContent = `🧑‍🤝‍🧑 Partner ${partnerId}`;
    btn.href = `https://erp.seekda.com/web#id=${partnerId}&view_type=form&model=res.partner`;
    btn.setAttribute("aria-disabled", "false");
    btn.style.opacity = "1";
    btn.style.pointerEvents = "auto";
    btn.title = `Öffnen: Partner ${partnerId}`;
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

  // === Cache ERP ===
  const CACHE_KEY = "_pylon_erp_cache";
  const saveCache = map => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(map))); } catch {} };
  const loadCache = () => { try { return new Map(Object.entries(JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"))); } catch { return new Map(); } };

  async function fetchErpData() {
    const cached = loadCache();
    if (cached.size > 0) return cached;
    try {
      const r = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url: ANALYTICS_URL,
          headers: { "Accept": "application/json" },
          onload: res => { try { resolve(JSON.parse(res.responseText)); } catch(e){ reject(e); } },
          onerror: reject,
          ontimeout: () => reject(new Error("timeout"))
        });
      });
      const rows = r?.query_result?.data?.rows || [];
      const map = new Map();
      rows.forEach(item => {
        const hid = norm(item.name);
        const pid = (item.account_partner_id ?? "").toString().trim();
        if (hid && pid) map.set(hid, pid);
      });
      saveCache(map);
      return map;
    } catch(e) {
      console.error("ERP-Load failed", e);
      return new Map();
    }
  }

  async function updateErpButton(row, hotelId) {
    const clean = norm(hotelId);
    if (!VALID_ID_REGEX.test(clean)) {
      setErpButtonDisabled(row, "invalid Hotel-ID");
      return;
    }
    setErpButtonLoading(row);
    const map = await fetchErpData();
    const partnerId = map.get(clean);
    if (partnerId) setErpButtonReady(row, partnerId);
    else setErpButtonDisabled(row, "nicht gefunden");
  }

  const debounceMap = new Map();
  function debounce(key, fn, delay = 400) {
    clearTimeout(debounceMap.get(key));
    const t = setTimeout(() => { debounceMap.delete(key); fn(); }, delay);
    debounceMap.set(key, t);
  }

  function setBothButtons(row, hotelId) {
    setHmButton(row, hotelId);
    debounce(row, () => updateErpButton(row, hotelId), 450);
  }

  // === Feld-/Wert-Finder (mehrstufig) ===
  function getHotelFieldCandidates(root=document) {
    // Inputs & Textareas via placeholder/name/aria
    const sel = 'input[placeholder],textarea[placeholder],input[name],textarea[name],input[aria-label],textarea[aria-label]';
    return qsa(sel, root).filter(el => {
      const ph = (el.getAttribute('placeholder')||'').toLowerCase();
      const nm = (el.getAttribute('name')||'').toLowerCase();
      const al = (el.getAttribute('aria-label')||'').toLowerCase();
      return [ph,nm,al].some(v => textsLower.includes(v)) || /\bhotel\b/i.test(nm) || /\bhotel\b/i.test(al);
    });
  }

  function findValueNear(el) {
    if (/^(INPUT|TEXTAREA)$/.test(el.tagName)) return () => el.value || "";

    const row = findFieldRow(el) || closestRow(el);
    const valEl = row?.querySelector?.('input,textarea,[data-testid*="value"],[data-readonly-value],.value,.truncate,.whitespace-nowrap,span,div,code,kbd');
    if (valEl) {
      if (/^(INPUT|TEXTAREA)$/.test(valEl.tagName)) return () => valEl.value || "";
      return () => norm(valEl.textContent);
    }

    const sib = el.nextElementSibling;
    if (sib) return () => norm(sib.textContent);

    return () => norm(el.textContent);
  }

  function findByLabel(root=document) {
    const labels = qsa('span,div,label,p,strong,dt,th', root).filter(looksLikeHotelLabel);
    for (const lab of labels) {
      const nearField = (findFieldRow(lab) || closestRow(lab))?.querySelector?.('input,textarea') || lab.parentElement?.querySelector?.('input,textarea');
      if (nearField) return { anchor: nearField, getter: () => nearField.value || "" };
      const getter = findValueNear(lab);
      const row = findFieldRow(lab) || closestRow(lab);
      return { anchor: row || lab, getter };
    }
    return null;
  }

  function bruteForceScan(root=document) {
    const nodes = qsa('div,section,li,dt,dd,p,span');
    for (const n of nodes) {
      const txt = norm(n.textContent);
      if (!txt || txt.length > 200) continue;
      if (!/hotel[\s-]?id/i.test(txt)) continue;
      const m = txt.match(/hotel[\s-]?id[:\s]*([A-Za-z0-9_-]{3,})/i);
      if (m && m[1]) {
        const id = m[1];
        const row = findFieldRow(n) || closestRow(n) || n;
        return { anchor: row, getter: () => id };
      }
    }
    return null;
  }

  // Row binden + live aktualisieren
  function bindDynamic(anchor, getter) {
    const companion = findOrCreateCompanionRow(anchor);
    if (!companion) return;

    const apply = () => setBothButtons(companion, getter() || "");
    apply();

    // Live-Updates: Änderungen am Feld-Row beobachten
    const fieldRow = findFieldRow(anchor) || closestRow(anchor) || anchor;
    const mo = new MutationObserver(apply);
    mo.observe(fieldRow, { childList: true, subtree: true, characterData: true, attributes: true });

    if (/^(INPUT|TEXTAREA)$/.test(anchor.tagName)) {
      anchor.addEventListener("input", apply, { passive: true });
      anchor.addEventListener("change", apply, { passive: true });
    }
  }

  function processRoot(root=document) {
    // 1) Direkte Felder
    const fields = getHotelFieldCandidates(root);
    if (fields.length) {
      fields.forEach(f => bindDynamic(f, () => f.value || ""));
      return;
    }
    // 2) Label-Fallback
    const byLabel = findByLabel(root);
    if (byLabel) {
      bindDynamic(byLabel.anchor, byLabel.getter);
      return;
    }
    // 3) Brute-Force-Scan
    const brute = bruteForceScan(root);
    if (brute) {
      bindDynamic(brute.anchor, brute.getter);
    }
  }

  // Initial + DOM-Änderungen
  processRoot(document);

  let scheduled = false;
  const mo = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    raf(() => { scheduled = false; processRoot(document); });
  });
  mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
