/* NurseHub CSV reader: public, read-only Google Sheets connection. */
(function () {
  'use strict';
  const cfg = window.NURSEHUB_CONFIG || {};
  const ID = String(cfg.spreadsheetId || '').trim();
  const SHEETS = cfg.sheetNames || [];
  const CACHE_MS = Math.max(0, Number(cfg.cacheMinutes || 3)) * 60 * 1000;
  const cache = new Map();

  function csvUrl(sheet) {
    if (!ID) throw new Error('لم يتم ضبط Spreadsheet ID في config.js');
    return 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(ID) +
      '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(sheet) +
      '&_=' + Date.now();
  }

  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], next = text[i + 1];
      if (quoted) {
        if (c === '"' && next === '"') { field += '"'; i++; }
        else if (c === '"') quoted = false;
        else field += c;
      } else {
        if (c === '"') quoted = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else if (c !== '\r') field += c;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function normalize(v) {
    const s = String(v == null ? '' : v).trim();
    if (s === '') return '';
    if (s.toLowerCase() === 'true') return true;
    if (s.toLowerCase() === 'false') return false;
    return s;
  }

  async function readSheet(name) {
    const cached = cache.get(name);
    if (cached && Date.now() - cached.time < CACHE_MS) return cached.data;
    const response = await fetch(csvUrl(name), { method: 'GET', cache: 'no-store' });
    if (!response.ok) throw new Error('تعذر قراءة ورقة ' + name + ' (' + response.status + ')');
    const raw = await response.text();
    if (/^\s*</.test(raw)) throw new Error('Google Sheets لم يُرجع CSV للورقة ' + name + '. تأكد من إتاحة الشيت للمشاهدة.');
    const matrix = parseCSV(raw);
    if (!matrix.length) return [];
    const headers = matrix.shift().map(h => String(h).replace(/^\uFEFF/, '').trim());
    const data = matrix.filter(r => r.some(v => String(v).trim() !== '')).map(r => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = normalize(r[i] || ''));
      return obj;
    });
    cache.set(name, { time: Date.now(), data });
    return data;
  }

  async function getAllData() {
    const pairs = await Promise.all(SHEETS.map(async name => [name, await readSheet(name)]));
    const data = Object.fromEntries(pairs);
    const settings = {};
    (data.SiteSettings || []).forEach(row => { settings[String(row.setting_key || '')] = row.setting_value || ''; });
    data.SiteSettings = settings;
    return data;
  }

  window.NurseHubAPI = { getAllData, refresh: () => { cache.clear(); return getAllData(); } };
})();
