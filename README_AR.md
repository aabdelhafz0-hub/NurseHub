# NurseHub — GitHub Pages + Google Sheets

## محتويات المشروع
- `index.html`: واجهة الطلاب.
- `admin.html`: لوحة إدارة المحتوى.
- `config.js`: ضع فيه رابط Web App المنشور من Apps Script.
- `api.js`: طبقة الاتصال بين الموقع وواجهة Apps Script.
- `backend/Code.gs`: كود API الذي يقرأ ويكتب في Google Sheets.

## 1) رفع الموقع على GitHub
ارفع كل الملفات والمجلد `backend` إلى جذر مستودع `NurseHub` (نفس مستوى README). لا ترفع `Code.gs` إلى جذر الموقع؛ اتركه داخل `backend` للنسخ إلى مشروع Apps Script.

## 2) تجهيز Google Apps Script API
1. افتح جدول Google Sheets المستخدم في NurseHub.
2. من Extensions > Apps Script افتح مشروع Apps Script.
3. افتح `Code.gs`، واستبدل محتواه بالكامل بمحتوى `backend/Code.gs` من هذا المشروع.
4. اضغط حفظ.
5. من قائمة الدوال اختر `setInitialAdminPassword` ثم اضغط Run. ستظهر نافذة لإدخال كلمة مرور المدير (12 حرفاً على الأقل). لا تضع كلمة المرور في ملفات GitHub.
6. وافق على أذونات Google المطلوبة.
7. Deploy > New deployment > Web app. اختر Execute as: Me، وWho has access: Anyone، ثم Deploy.
8. انسخ رابط Web App الذي ينتهي بـ `/exec`.

## 3) ربط GitHub Pages بالـ API
افتح `config.js` في GitHub واضغط Edit، واستبدل `PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE` برابط `/exec` الذي نسخته. احفظ Commit changes.

## 4) تفعيل GitHub Pages
1. من المستودع افتح Settings > Pages.
2. تحت Build and deployment اختر Deploy from a branch.
3. اختر Branch: `main` وFolder: `/ (root)` ثم Save.
4. انتظر ظهور رابط الموقع.

## روابط الموقع
- الموقع: `https://aabdelhafz0-hub.github.io/NurseHub/`
- لوحة الإدارة: `https://aabdelhafz0-hub.github.io/NurseHub/admin.html`

## ملاحظات أمنية وتشغيلية
- كلمة مرور المدير تُخزّن كبصمة SHA-256 في Script Properties، ولا تُحفظ في مستودع GitHub.
- لا تجعل كلمة مرور المدير جزءاً من `config.js` أو أي ملف أمامي.
- رابط Apps Script API عام للقراءة وإرسال أسئلة الطلاب؛ عمليات التعديل والحذف تتطلب جلسة مدير.
- إعداد الوصول Anyone مطلوب كي يتمكن زوار GitHub Pages من الاتصال. قد لا يتوفر هذا الخيار لبعض حسابات Google Workspace.
- بعد تعديل `Code.gs` أعد نشر إصدار جديد من Web App: Deploy > Manage deployments > Edit > New version > Deploy.
- إذا كان جدول البيانات لا يحتوي على الأوراق والأعمدة المتوقعة، يجب مطابقتها مع قالب NurseHub قبل التشغيل.
