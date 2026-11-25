# NurseHub — نسخة GitHub Pages المرتبطة بـ Google Sheets CSV

## الملفات
- `index.html`: الموقع الأصلي بتصميمه، مع استبدال مصدر البيانات ليقرأ من CSV.
- `config.js`: يحتوي Spreadsheet ID وأسماء الأوراق.
- `api.js`: قارئ CSV للقراءة فقط.
- `admin.html`: صفحة توضح أن التعديل يتم من Google Sheets.

## إعداد Google Sheets (مرة واحدة)
1. افتح ملف Google Sheets.
2. اضغط مشاركة (Share).
3. من الوصول العام اختر: أي شخص لديه الرابط — مشاهد (Anyone with the link — Viewer).
4. تأكد أن أسماء الأوراق مطابقة تمامًا:
   `AcademicSubjects`, `Books`, `Summaries`, `QuizQuestions`, `Videos`, `SiteSettings`, `CommunityQuestions`.
5. لا تغيّر أسماء أعمدة الصف الأول؛ الموقع يعتمد عليها.
6. لا تضع معلومات سرية في الشيت لأن البيانات المنشورة قابلة للقراءة العامة.

## رفع GitHub
ارفع الملفات الأربعة إلى جذر مستودع `NurseHub` (نفس المكان الذي يوجد فيه README أو ملف index الحالي)، واسم الصفحة الرئيسية يجب أن يكون `index.html`.
ثم افتح Settings → Pages واختر Deploy from a branch → main → /(root).

## تحديث البيانات
عدّل الصفوف مباشرة في Google Sheets. أعد تحميل الموقع بعد الحفظ. قد يستغرق ظهور التعديلات بضع دقائق بسبب التخزين المؤقت.

## ملاحظات مهمة
- هذا الربط للقراءة فقط؛ CSV لا يسمح للموقع بإضافة/تعديل/حذف صفوف في Google Sheets.
- إضافة الأسئلة من واجهة الموقع لا تُحفظ في الشيت في هذه النسخة. استخدم Google Sheets لإضافة السؤال، واجعل `status` = `pending` ثم غيّره إلى `approved` لنشره.
- `QuizQuestions.correct_option_index` يبدأ من صفر: الخيار الأول = 0، الثاني = 1، الثالث = 2، الرابع = 3.
- اجعل `is_active` = TRUE للسجل الذي تريد عرضه، وFALSE لإخفائه.
- روابط الملفات والفيديوهات يجب أن تكون روابط عامة قابلة للفتح.
