/**
 * NurseHub API for GitHub Pages + Google Sheets
 * Deploy this project as a Google Apps Script Web App (Execute as: Me; Access: Anyone).
 * The password hash is stored in Script Properties, never in the website repository.
 */
const SPREADSHEET_ID = '1cJJz0AaMrtU7fDkueh3p1xLWwzK9GxOFd6iLZZb-bSI';
const ALLOWED_SHEETS = ['AcademicSubjects','Books','Summaries','QuizQuestions','Videos','SiteSettings','CommunityQuestions'];
const ADMIN_HASH_PROPERTY = 'NURSEHUB_ADMIN_SHA256';
const RESULT_TTL_SECONDS = 180;
const SESSION_TTL_SECONDS = 21600;

/** JSONP is used for browser reads because Apps Script ContentService does not expose configurable CORS headers. */
function doGet(e) {
  const p = (e && e.parameter) || {};
  const callback = String(p.callback || '');
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(callback)) {
    return ContentService.createTextOutput('/* NurseHub API: missing/invalid callback */')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  let result;
  try {
    switch (String(p.action || '')) {
      case 'getPublicData':
        result = { ok: true, data: getPublicData_() };
        break;
      case 'adminGetData':
        requireAdmin_(String(p.token || ''));
        result = { ok: true, data: getAdminData_() };
        break;
      case 'getResult': {
        const requestId = validRequestId_(p.requestId);
        const cache = CacheService.getScriptCache();
        const raw = cache.get('result:' + requestId);
        if (!raw) throw new Error('انتهت مهلة الطلب. حاول مرة أخرى.');
        cache.remove('result:' + requestId);
        result = JSON.parse(raw);
        break;
      }
      case 'health':
        result = { ok: true, message: 'NurseHub API is running.' };
        break;
      default:
        throw new Error('طلب API غير معروف.');
    }
  } catch (err) {
    result = { ok: false, error: safeError_(err) };
  }
  return ContentService.createTextOutput(callback + '(' + JSON.stringify(result) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

/** POST requests are sent as text/plain in no-cors mode; the browser retrieves the result via a one-time JSONP requestId. */
function doPost(e) {
  const p = (e && e.postData && e.postData.contents) || '';
  let requestId = '';
  try {
    const body = JSON.parse(p);
    requestId = validRequestId_(body.requestId);
    let result;
    switch (String(body.action || '')) {
      case 'adminLogin':
        result = { ok: true, token: adminLogin_(String(body.password || '')) };
        break;
      case 'submitCommunityQuestion':
        result = submitCommunityQuestion_(body.payload || {});
        break;
      case 'adminSave':
        requireAdmin_(String(body.token || ''));
        result = adminSave_(String(body.sheetName || ''), body.record || {});
        break;
      case 'adminDelete':
        requireAdmin_(String(body.token || ''));
        result = adminDelete_(String(body.sheetName || ''), String(body.id || ''));
        break;
      case 'adminSetStatus':
        requireAdmin_(String(body.token || ''));
        result = adminSetStatus_(String(body.id || ''), String(body.status || ''));
        break;
      default:
        throw new Error('عملية غير معروفة.');
    }
    result = Object.assign({ ok: true }, result || {});
    CacheService.getScriptCache().put('result:' + requestId, JSON.stringify(result), RESULT_TTL_SECONDS);
  } catch (err) {
    if (requestId) {
      CacheService.getScriptCache().put('result:' + requestId,
        JSON.stringify({ ok: false, error: safeError_(err) }), RESULT_TTL_SECONDS);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ received: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getPublicData_() {
  const data = {};
  ALLOWED_SHEETS.forEach(name => {
    const rows = readSheet_(name);
    if (name === 'SiteSettings') {
      data.SiteSettings = {};
      rows.forEach(r => { data.SiteSettings[String(r.setting_key)] = r.setting_value; });
    } else if (name === 'CommunityQuestions') {
      // Never expose pending questions in the public response.
      data[name] = rows.filter(r => ['approved','published','مقبول','منشور'].includes(String(r.status || '').toLowerCase()));
    } else {
      data[name] = rows.filter(isActive_);
    }
  });
  return data;
}

function getAdminData_() {
  const out = {};
  ALLOWED_SHEETS.forEach(name => { out[name] = readSheet_(name); });
  return out;
}

function readSheet_(name) {
  assertSheet_(name);
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
  if (!sh) throw new Error('الورقة غير موجودة: ' + name);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(h => String(h).trim());
  return values.slice(1).filter(row => row.some(v => v !== '' && v !== null))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = normalizeValue_(row[i]); });
      return obj;
    });
}

function submitCommunityQuestion_(payload) {
  const author = clean_(payload.author, 100);
  const question = clean_(payload.question_text, 2000);
  if (!author || !question) throw new Error('يرجى كتابة الاسم والسؤال.');
  const sh = getSheet_('CommunityQuestions');
  sh.appendRow([
    nextId_('CommunityQuestions'), safeCell_(author), safeCell_(clean_(payload.year, 50)),
    safeCell_(clean_(payload.subject, 100)), safeCell_(question), '', new Date(), 'pending'
  ]);
  return { message: 'تم استلام سؤالك وسيظهر بعد مراجعته.' };
}

function adminLogin_(password) {
  const stored = PropertiesService.getScriptProperties().getProperty(ADMIN_HASH_PROPERTY);
  if (!stored) throw new Error('كلمة مرور الإدارة غير مضبوطة. نفّذ setInitialAdminPassword من محرر Apps Script أولاً.');
  const digest = sha256_(password);
  if (!constantTimeEqual_(digest, stored)) throw new Error('كلمة المرور غير صحيحة.');
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('admin:' + token, '1', SESSION_TTL_SECONDS);
  return token;
}

function adminSave_(sheetName, record) {
  assertSheet_(sheetName);
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('بيانات السجل غير صحيحة.');
  const sh = getSheet_(sheetName);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(x => String(x).trim());
  const cleanRecord = {};
  headers.forEach(h => { if (Object.prototype.hasOwnProperty.call(record, h)) cleanRecord[h] = record[h]; });

  if (sheetName === 'SiteSettings') {
    const key = String(cleanRecord.setting_key || '').trim();
    if (!key) throw new Error('setting_key مطلوب.');
    const values = sh.getDataRange().getValues();
    let target = -1;
    for (let i = 1; i < values.length; i++) if (String(values[i][0]) === key) { target = i + 1; break; }
    const row = headers.map(h => toSheetValue_(cleanRecord[h]));
    if (target > 0) sh.getRange(target, 1, 1, headers.length).setValues([row]); else sh.appendRow(row);
    return { action: target > 0 ? 'updated' : 'created' };
  }

  if (!cleanRecord.id) cleanRecord.id = nextId_(sheetName);
  const id = String(cleanRecord.id);
  const values = sh.getDataRange().getValues();
  let target = -1;
  for (let i = 1; i < values.length; i++) if (String(values[i][0]) === id) { target = i + 1; break; }
  const row = headers.map(h => toSheetValue_(cleanRecord[h]));
  if (target > 0) sh.getRange(target, 1, 1, headers.length).setValues([row]); else sh.appendRow(row);
  return { action: target > 0 ? 'updated' : 'created', id: id };
}

function adminDelete_(sheetName, id) {
  assertSheet_(sheetName);
  if (sheetName === 'SiteSettings') throw new Error('لا يُنصح بحذف إعدادات الموقع.');
  const sh = getSheet_(sheetName);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) { sh.deleteRow(i + 1); return { deleted: true }; }
  }
  throw new Error('السجل غير موجود.');
}

function adminSetStatus_(id, status) {
  const sh = getSheet_('CommunityQuestions');
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) { sh.getRange(i + 1, 8).setValue(status); return { updated: true }; }
  }
  throw new Error('السؤال غير موجود.');
}

function setInitialAdminPassword() {
  const password = Browser.inputBox('NurseHub Admin', 'اكتب كلمة مرور قوية (12 حرفاً على الأقل). ستُحفظ كبصمة مشفرة فقط.', Browser.Buttons.OK_CANCEL);
  if (password === 'cancel') return;
  if (!password || password.length < 12) throw new Error('كلمة المرور يجب أن تكون 12 حرفاً على الأقل.');
  PropertiesService.getScriptProperties().setProperty(ADMIN_HASH_PROPERTY, sha256_(password));
  Logger.log('تم إعداد كلمة مرور الإدارة بنجاح. لا توجد كلمة مرور نصية محفوظة في الكود.');
}

function requireAdmin_(token) {
  if (!token || CacheService.getScriptCache().get('admin:' + token) !== '1') throw new Error('انتهت جلسة الإدارة. سجّل الدخول مرة أخرى.');
}
function getSheet_(name) {
  assertSheet_(name);
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
  if (!sh) throw new Error('الورقة غير موجودة: ' + name);
  return sh;
}
function assertSheet_(name) { if (ALLOWED_SHEETS.indexOf(name) === -1) throw new Error('اسم ورقة غير مسموح.'); }
function validRequestId_(value) {
  const id = String(value || '');
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(id)) throw new Error('معرّف الطلب غير صالح.');
  return id;
}
function nextId_(name) {
  const sh = getSheet_(name);
  if (sh.getLastRow() < 2) return 1;
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().flat().map(Number).filter(Number.isFinite);
  return (ids.length ? Math.max.apply(null, ids) : 0) + 1;
}
function isActive_(row) {
  return row.is_active === true || String(row.is_active).toLowerCase() === 'true' || row.is_active === 1 || row.is_active === '' || row.is_active === null;
}
function normalizeValue_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
  return v;
}
function clean_(value, max) { return String(value == null ? '' : value).trim().slice(0, max); }
function safeCell_(value) { const s = String(value == null ? '' : value); return /^[=+\-@]/.test(s) ? "'" + s : s; }
function toSheetValue_(value) {
  if (value === true || value === false) return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string') return safeCell_(value);
  return value;
}
function safeError_(err) { return String(err && err.message ? err.message : err || 'حدث خطأ غير معروف').slice(0, 500); }
function sha256_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(b => (b + 256).toString(16).slice(-2)).join('');
}
function constantTimeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
