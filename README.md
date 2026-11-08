# ADHD Webcam Eye-Tracking CDSS — Research Build

این نسخه نمونه اولیه (pilot) نرم‌افزار است، هم‌راستا با پایان‌نامه
«طراحی و توسعه سامانه پشتیبان تصمیم برای تشخیص ADHD مبتنی بر داده‌های
ردیابی حرکات چشم».

## زنجیره پژوهشی
Webcam → MediaPipe Iris → Calibration → Screen Gaze → Quality Gate →
Stimulus/AOI-ready CSV → Feature Extraction → Eye-only ML → Clinical/Combined extensions

## نکات روش‌شناختی مهم
- هیچ gaze تصادفی یا داده جعلی در این نسخه تولید نمی‌شود.
- تا زمانی که مدل با داده واقعی پژوهش آموزش و اعتبارسنجی نشده باشد،
  Probability/Diagnosis تولید نمی‌شود (`ml_model.predict` فقط بعد از
  `train_model.py` موفق قابل استفاده است و در UI فعلی فراخوانی نمی‌شود).
- برچسب `ADHD/CONTROL` باید بر اساس معیار مرجع مصوب پژوهش وارد شود؛
  `UNKNOWN` برای جلسات بدون برچسب است.
- اطلاعات هویتی مستقیماً وارد CSV پژوهشی نمی‌شود؛ فقط `participant_id` ثبت می‌شود.
- تصاویر داخل `stimuli/ADHD/` در حال حاضر **placeholder** هستند، نه
  محرک نهایی پژوهش — پیش از جمع‌آوری داده واقعی، `stimuli/ADHD/README.md`
  را بخوان.

## ساختار پروژه
```
Main.py                  اپ دسکتاپ PyQt5 — نقطه ورود اصلی
config.py                مسیرها و ثابت‌های قابل تنظیم
gaze_engine.py           استخراج ویژگی چشم (MediaPipe) + مدل نگاشت نگاه به صفحه
screen_calibrator.py     کالیبراسیون ۹ نقطه‌ای
quality.py               Quality Gate (نسبت gaze معتبر، افت روشنایی، gap ردیابی، خطای کالیبراسیون)
record_eye_data.py       اجرای یک جلسه ثبت داده (نمایش محرک‌ها + ذخیره CSV)
feature_extraction.py    استخراج ویژگی از CSV خام یک جلسه
ml_model.py               آموزش/پیش‌بینی مدل eye-only (Logistic Regression, grouped CV)
train_model.py           ساخت دیتاست از همه جلسات برچسب‌دار + آموزش مدل
tools/
  camtest.py              تست سریع دوربین (اختیاری، خارج از pipeline اصلی)
  generate_placeholder_stimuli.py   تولید/بازتولید تصاویر placeholder
stimuli/ADHD/             تصاویر محرک (در حال حاضر placeholder)
eye_data/ outputs/ models/ calibrations/   خروجی‌های محلی (در git ردیابی نمی‌شوند)
```

## اجرا در VS Code

۱. **Python 3.11 نصب کن** (مهم‌ترین نسخه — سازگاری MediaPipe با 3.12+ هنوز کامل نیست).

۲. ریپو را کلون کن و در VS Code باز کن:
   ```
   git clone https://github.com/abdollah1366/eyetracker
   code eyetracker
   ```

۳. یک محیط مجازی بساز و فعال کن (در ترمینال داخلی VS Code):
   - Windows:
     ```
     python -m venv .venv
     .venv\Scripts\activate
     ```
   - macOS/Linux:
     ```
     python3.11 -m venv .venv
     source .venv/bin/activate
     ```
   در VS Code از گوشه پایین‌راست یا `Ctrl+Shift+P` → `Python: Select Interpreter`،
   مفسر داخل `.venv` را انتخاب کن.

۴. کتابخانه‌های لازم را نصب کن:
   ```
   pip install -r requirements.txt
   ```

۵. (اختیاری ولی توصیه‌شده برای تست) تصاویر placeholder را بساز، اگر از قبل
   در ریپو نبودند یا خواستی دوباره بسازی:
   ```
   python tools/generate_placeholder_stimuli.py
   ```

۶. اپ را اجرا کن (یا با `F5` در VS Code — تنظیمات `launch.json` آماده است):
   ```
   python Main.py
   ```
   از داخل برنامه: ابتدا «کالیبراسیون» را اجرا کن، بعد «شروع جمع‌آوری داده».

   یا مستقیم از خط فرمان:
   ```
   python screen_calibrator.py
   python record_eye_data.py --participant-id P001 --label ADHD
   python record_eye_data.py --participant-id P002 --label CONTROL
   python train_model.py
   ```

## Quality Gate
نسبت gaze معتبر، بزرگ‌ترین gap پیوسته‌ی ازدست‌رفتن ردیابی، روشنایی و خطای
کالیبراسیون ثبت و بررسی می‌شوند. در صورت کیفیت ناکافی، جلسه برای مدل
نامعتبر تلقی می‌شود و نباید به‌صورت «ریسک پایین» تفسیر شود.

## محدودیت علمی
این نرم‌افزار یک نمونه پژوهشی/CDSS است و تشخیص مستقل ADHD ارائه نمی‌کند.
برای استفاده بالینی واقعی، اعتبارسنجی مستقل، پروتکل اخلاق، امنیت داده،
کالیبراسیون مدل و الزامات قانونی لازم است.
