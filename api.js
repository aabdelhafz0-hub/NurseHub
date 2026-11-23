/* NurseHub browser API bridge: JSONP reads + simple no-cors POST writes. */
(function () {
  'use strict';

  function endpoint() {
    const url = String(window.NURSEHUB_API_URL || '').trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(url)) {
      throw new Error('لم يتم ضبط رابط قاعدة البيانات بعد. افتح config.js وضع رابط Web App.');
    }
    return url;
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID().replace(/[^A-Za-z0-9_-]/g, '');
    return 'nh' + Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }

  function jsonp(params) {
    return new Promise((resolve, reject) => {
      const cb = '__nursehub_jsonp_' + makeId();
      const script = document.createElement('script');
      let timer;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        delete window[cb];
        script.remove();
      };
      window[cb] = (result) => {
        cleanup();
        if (!result || result.ok === false) reject(new Error(result && result.error ? result.error : 'تعذر الاتصال بقاعدة البيانات.'));
        else resolve(result);
      };
      script.onerror = () => { cleanup(); reject(new Error('فشل تحميل البيانات من Google Apps Script. تأكد من نشره كتطبيق ويب متاح للجميع.')); };
      const query = new URLSearchParams(Object.assign({}, params, { callback: cb, _: String(Date.now()) }));
      script.src = endpoint() + '?' + query.toString();
      timer = setTimeout(() => { cleanup(); reject(new Error('انتهت مهلة الاتصال بقاعدة البيانات.')); }, 20000);
      document.head.appendChild(script);
    });
  }

  async function post(payload) {
    const requestId = makeId();
    const body = Object.assign({}, payload, { requestId: requestId });
    // text/plain is a CORS-safelisted content type; no-cors lets the browser submit the write
    // without requiring custom CORS headers from Apps Script. The response is fetched separately.
    await fetch(endpoint(), {
      method: 'POST',
      mode: 'no-cors',
      credentials: 'omit',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(body)
    });

    // Apps Script stores the operation result briefly; the unpredictable ID makes it one-time.
    let lastError;
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        const result = await jsonp({ action: 'getResult', requestId: requestId });
        return result;
      } catch (err) {
        lastError = err;
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    throw lastError || new Error('لم يصل تأكيد العملية من الخادم.');
  }

  async function call(method, ...args) {
    switch (method) {
      case 'getPublicData': {
        const result = await jsonp({ action: 'getPublicData' });
        return result.data || {};
      }
      case 'submitCommunityQuestion':
        return post({ action: 'submitCommunityQuestion', payload: args[0] || {} });
      case 'adminLogin': {
        const result = await post({ action: 'adminLogin', password: String(args[0] || '') });
        if (!result.token) throw new Error('لم يرجع الخادم رمز جلسة الإدارة.');
        return result.token;
      }
      case 'adminGetData': {
        const result = await jsonp({ action: 'adminGetData', token: String(args[0] || '') });
        return result.data || {};
      }
      case 'adminSave':
        return post({ action: 'adminSave', token: args[0], sheetName: args[1], record: args[2] });
      case 'adminDelete':
        return post({ action: 'adminDelete', token: args[0], sheetName: args[1], id: args[2] });
      case 'adminSetStatus':
        return post({ action: 'adminSetStatus', token: args[0], id: args[1], status: args[2] });
      default:
        throw new Error('عملية غير مدعومة: ' + method);
    }
  }

  window.NurseHubAPI = { call: call, jsonp: jsonp };
})();
