/* NurseHub CSV reader — public, read-only Google Sheets connection. */
(function () {
  "use strict";

  const cfg = window.NURSEHUB_CONFIG || {};
  const PUBLISHED_URL = String(cfg.publishedUrl || "").trim().replace(/\/+$/, "");
  const SHEETS = Array.isArray(cfg.sheetNames) ? cfg.sheetNames : [];
  const CACHE_MS = Math.max(0, Number(cfg.cacheMinutes ?? 3)) * 60 * 1000;
  const cache = new Map();

  function csvUrl(sheet) {
    if (!PUBLISHED_URL) {
      throw new Error("لم يتم ضبط رابط Google Sheets المنشور في config.js");
    }
    // Google Sheets publishes a CSV export per tab. `sheet` selects the tab name.
    const url = new URL(PUBLISHED_URL);
    url.searchParams.set("output", "csv");
    url.searchParams.set("sheet", sheet);
    url.searchParams.set("_", String(Date.now()));
    return url.toString();
  }

  function parseCSV(input) {
    const rows = [];
    let row = [], field = "", quoted = false;
    for (let i = 0; i < input.length; i++) {
      const c = input[i], next = input[i + 1];
      if (quoted) {
        if (c === '"' && next === '"') { field += '"'; i++; }
        else if (c === '"') quoted = false;
        else field += c;
      } else {
        if (c === '"') quoted = true;
        else if (c === ",") { row.push(field); field = ""; }
        else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
        else if (c !== "\r") field += c;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function normalize(value) {
    const s = String(value == null ? "" : value).trim();
    if (!s) return "";
    if (s.toLowerCase() === "true") return true;
    if (s.toLowerCase() === "false") return false;
    return s;
  }

  async function readSheet(name) {
    const cached = cache.get(name);
    if (cached && Date.now() - cached.time < CACHE_MS) return cached.data;

    const response = await fetch(csvUrl(name), {
      method: "GET",
      cache: "no-store"
    });
    if (!response.ok) {
      throw new Error("تعذرت قراءة ورقة " + name + " (" + response.status + ")");
    }

    const raw = await response.text();
    if (/^\s*</.test(raw)) {
      throw new Error(
        "Google Sheets لم يُرجع CSV للورقة " + name +
        ". تأكد من نشر هذه الورقة ضمن Publish to web وإتاحتها للعرض."
      );
    }

    const matrix = parseCSV(raw);
    if (!matrix.length) return [];

    const headers = matrix.shift().map(h =>
      String(h).replace(/^\uFEFF/, "").trim()
    );
    const data = matrix
      .filter(r => r.some(v => String(v).trim() !== ""))
      .map(r => {
        const obj = {};
        headers.forEach((header, i) => {
          if (header) obj[header] = normalize(r[i] ?? "");
        });
        return obj;
      });

    cache.set(name, { time: Date.now(), data });
    return data;
  }

  async function getAllData() {
    const pairs = await Promise.all(
      SHEETS.map(async name => [name, await readSheet(name)])
    );
    const data = Object.fromEntries(pairs);

    // Convert SiteSettings rows into { setting_key: setting_value }.
    const settings = {};
    (data.SiteSettings || []).forEach(row => {
      const key = String(row.setting_key || row.key || "").trim();
      if (key) settings[key] = row.setting_value ?? row.value ?? "";
    });
    data.SiteSettings = settings;

    return data;
  }

  window.NurseHubAPI = {
    getAllData,
    refresh: () => {
      cache.clear();
      return getAllData();
    }
  };
})();
