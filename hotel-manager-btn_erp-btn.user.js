// ==UserScript==
// @name         Pylon: Hotel-Manager & ERP Button (ERP uses erp_res_partner_id)
// @namespace    https://seekda.com
// @version      1.5.0
// @description  Fügt unter der Hotel-ID eine eigene Row mit zwei Buttons ein (HM & ERP). ERP-Link nutzt erp_res_partner_id, angezeigt wird account_partner_id.
// @match        https://app.usepylon.com/issues/*
// @run-at       document-idle
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

  // === Konfiguration ===
  const HOTEL_ID_TEXTS = ["Hotel-ID", "Hotel ID", "HotelId", "Hotel identifier"];
  const ID_REGEX_INLINE = /([A-Za-z0-9_-]{3,})/;
  const VALID_ID_REGEX = /^[A-Za-z0-9_-]{3,}$/;
  const HM_BASE = "https://hotels.seekda.com/";
  const ANALYTICS_BASE = "https://analytics.seekda.com/api/queries/2983/results.json";
  const STORAGE_KEY = "pylon_analytics_api_key";
  const CACHE_KEY = "_pylon_erp_cache";

  const buildHmUrl = id => `${HM_BASE}~/cm/${encodeURIComponent(id)}`;
  const norm = s => (s || "").replace(/\s+/g, " ").trim();

  // === API Key Management ===
  function getStoredApiKey() {
    try {
      const k = GM_getValue(STORAGE_KEY, "");
      return typeof k === "string" ? k.trim() : "";
    } catch {
      return "";
    }
  }

  function setStoredApiKey(k) {
    try {
      GM_setValue(STORAGE_KEY, (k || "").trim());
    } catch (e) {
      console.error("Could not store API key", e);
    }
  }

  function buildAnalyticsUrlWithKey(key) {
    if (!key) return null;
    const url = new URL(ANALYTICS_BASE);
    url.searchParams.set("api_key", key);
    return url.toString();
  }

  GM_registerMenuCommand("Set analytics API key", () => {
    const current = getStoredApiKey();
    const val = prompt("Paste your analytics API key (will be stored locally):", current || "");
    if (val === null) return;
    setStoredApiKey(val);
    alert(val ? "API key saved (local)." : "API key cleared.");
    try { localStorage.removeItem(CACHE_KEY); } catch {}
    requestAnimationFrame(() => processRoot(document));
  });

  // === DOM Helpers ===
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const raf = fn => requestAnimationFrame(fn);
  const textsLower = HOTEL_ID_TEXTS.map(t => t.toLowerCase());
  const looksLikeHotelLabel = el => textsLower.includes(norm(el.textContent).toLowerCase());

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

  function createCompanionRow() {
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

  function findOrCreateCompanionRow(anchorEl) {
    const fieldRow = findFieldRow(anchorEl) || closestRow(anchorEl);
    if (!fieldRow || !fieldRow.parentElement) return null;

    const next = fieldRow.nextElementSibling;
    if (next?.dataset?.hmErpRow === "1") return next;

    const row = createCompanionRow();
    fieldRow.parentElement.insertBefore(row, fieldRow.nextSibling);
    return row;
  }

  // === Button Logic ===
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

  function setErpButtonReady(row, accountId, erpId) {
    const btn = row.querySelector('a[data-erp-link]');
    if (!btn) return;

    // Anzeige: account_partner_id
    btn.textContent = `🧑‍🤝‍🧑 Partner ${accountId}`;

    // Linkziel: erp_res_partner_id
    btn.href = `https://erp.seekda.com/web#id=${erpId}&view_type=form&model=res.partner`;
    btn.setAttribute("aria-disabled", "false");
    btn.style.opacity = "1";
    btn.style.pointerEvents = "auto";
    btn.title = `Öffnen: ERP Partner ${erpId}`;
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

  // === Cache ===
  const saveCache = map => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(map))); } catch {} };
  const loadCache = () => { try { return new Map(Object.entries(JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"))); } catch { return new Map(); } };

  // === Fetch ERP data (now includes both IDs) ===
  async function fetchErpData() {
    const cached = loadCache();
    if (cached.size > 0) return cached;
    try {
      const apiKey = getStoredApiKey();
      const analyticsUrl = buildAnalyticsUrlWithKey(apiKey);
      if (!analyticsUrl) {
        console.warn("No analytics API key configured for ERP lookup.");
        return new Map();
      }

      const r = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url: analyticsUrl,
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
        const accountId = (item.account_partner_id ?? "").toString().trim();
        const erpId = (item.erp_res_partner_id ?? "").toString().trim();
        if (hid && accountId && erpId) {
          map.set(hid, { account: accountId, erp: erpId });
        }
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

    const apiKey = getStoredApiKey();
    if (!apiKey) {
      setErpButtonDisabled(row, "no API key");
      return;
    }

    setErpButtonLoading(row);
    const map = await fetchErpData();
    const data = map.get(clean);
    if (data && data.account && data.erp) {
      setErpButtonReady(row, data.account, data.erp);
    } else {
      setErpButtonDisabled(row, "nicht gefunden");
    }
  }

  // === Debounce + Combined ===
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

  // === Feld-/Wert-Finder ===
  function getHotelFieldCandidates(root=document) {
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

  function bindDynamic(anchor, getter) {
    const companion = findOrCreateCompanionRow(anchor);
    if (!companion) return;
    const apply = () => setBothButtons(companion, getter() || "");
    apply();
    const fieldRow = findFieldRow(anchor) || closestRow(anchor) || anchor;
    const mo = new MutationObserver(apply);
    mo.observe(fieldRow, { childList: true, subtree: true, characterData: true, attributes: true });
    if (/^(INPUT|TEXTAREA)$/.test(anchor.tagName)) {
      anchor.addEventListener("input", apply, { passive: true });
      anchor.addEventListener("change", apply, { passive: true });
    }
  }

  function processRoot(root=document) {
    const fields = getHotelFieldCandidates(root);
    if (fields.length) {
      fields.forEach(f => bindDynamic(f, () => f.value || ""));
      return;
    }
    const byLabel = findByLabel(root);
    if (byLabel) {
      bindDynamic(byLabel.anchor, byLabel.getter);
      return;
    }
    const brute = bruteForceScan(root);
    if (brute) {
      bindDynamic(brute.anchor, brute.getter);
    }
  }

  // === Initial start ===
  processRoot(document);
  let scheduled = false;
  const mo = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    raf(() => { scheduled = false; processRoot(document); });
  });
  mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

})();
