# ADHD Webcam Eye-Tracking CDSS — Research Build

این نسخه برای هم‌راستایی با پایان‌نامه طراحی شده است.

## زنجیره پژوهشی
Webcam → MediaPipe Iris → Calibration → Screen Gaze → Quality Gate → Stimulus/AOI-ready CSV → Feature Extraction → Eye-only ML → Clinical/Combined extensions

## نکته مهم
- هیچ gaze تصادفی یا `fake_adhd_data` در این نسخه وجود ندارد.
- تا زمانی که مدل با داده واقعی پژوهش آموزش و اعتبارسنجی نشده باشد، Probability/Diagnosis تولید نمی‌شود.
- برچسب `ADHD/CONTROL` باید بر اساس معیار مرجع مصوب پژوهش وارد شود؛ `UNKNOWN` برای جلسات بدون برچسب است.
- اطلاعات هویتی مستقیماً وارد CSV پژوهشی نمی‌شود؛ فقط participant_id ثبت می‌شود.
- پروتکل پایان‌نامه 10 محرک را هدف می‌گیرد. بسته فعلی فقط 9 تصویر دارد؛ نرم‌افزار تصویر دهم را جعل یا تکرار نمی‌کند و هشدار می‌دهد. قبل از جمع‌آوری اصلی، محرک دهم باید طبق پروتکل پژوهش اضافه و مستند شود.

## اجرا
1. Python 3.11 را توصیه می‌کنیم (به‌خصوص برای سازگاری MediaPipe).
2. `pip install -r requirements.txt`
3. `python screen_calibrator.py`
4. `python record_eye_data.py --participant-id P001 --label ADHD`
5. برای کنترل: `python record_eye_data.py --participant-id P002 --label CONTROL`
6. پس از جمع‌آوری چندین participant: `python train_model.py`

## Quality Gate
نسبت gaze معتبر، tracking loss، روشنایی و خطای کالیبراسیون ثبت می‌شوند. در صورت کیفیت ناکافی، جلسه برای مدل نامعتبر تلقی می‌شود و نباید به‌صورت «ریسک پایین» تفسیر شود.

## محدودیت علمی
این نرم‌افزار یک نمونه پژوهشی/CDSS است و تشخیص مستقل ADHD ارائه نمی‌کند. برای استفاده بالینی واقعی، اعتبارسنجی مستقل، پروتکل اخلاق، امنیت داده، کالیبراسیون مدل و الزامات قانونی لازم است.
