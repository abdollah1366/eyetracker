# ADHD Eye-Tracking CDSS — Web Application Specification (v1)

ج方向: RTL فارسی · پلتفرم: وب (دسکتاپ Chrome/Edge هدف اول) · حس: پزشکی-آرام، حرفهای، غیر-MVP.

## 1. معماری کلی
```
webapp/
  SPEC.md                  ← این فایل (قرارداد مشترک بکاند/فرانتاند)
  docker-compose.yml       ← postgres + backend + frontend(nginx)  (HTTPS-ready)
  .env.example
  backend/
    Dockerfile
    requirements.txt
    app/
      main.py              ← FastAPI app، CORS، include routers، startup init_db
      config.py            ← pydantic-settings (DATABASE_URL, JWT_SECRET, CORS_ORIGINS, ...)
      db.py                ← SQLAlchemy engine/session، Base
      models.py            ← ORM جداول
      schemas.py           ← Pydantic requests/responses
      security.py          ← hash password (bcrypt)، JWT، roles، dependencies
      audit.py             ← audit logging helper
      routers/ auth.py clinics.py users.py participants.py sessions.py assessments.py models.py reports.py sync.py admin.py
      services/ gaze.py quality.py features.py ml.py report.py xai.py storage.py
      core/ (copy adapted from legacy project) quality.py feature_extraction.py ml_model.py
      seeds/ seed.py       ← admin + demo clinic
    tests/ test_smoke.py
  frontend/
    Dockerfile
    nginx.conf
    package.json
    vite.config.ts
    tsconfig.json
    index.html
    src/
      main.tsx
      App.tsx
      styles/tokens.css, global.css
      lib/ api.ts, auth.tsx, types.ts, i18n.ts
      components/ layout/AppShell.tsx, ui/*, gaze/MediaPipeGaze.ts, gaze/Calibration.tsx, gaze/Collection.tsx, Heatmap.tsx, QualityBadge.tsx
      pages/ Login.tsx, Dashboard.tsx, Participants.tsx, ParticipantDetail.tsx, SessionWizard.tsx, SessionDetail.tsx, Assessments.tsx, ModelLab.tsx, Admin.tsx, SyncCenter.tsx
```

## 2. قرارداد API (پیشوند `/api/v1`)
تمام پاسخها JSON به part从 exception handler شامل `{detail}`اند. احراز هویت: `Authorization: Bearer <JWT>`.

### Auth
- `POST /auth/login` `{email,password}` → `{access_token,token_type,user:{id,email,name,role,clinic_id,clinic_name}}`
- `GET  /auth/me` → user
- `POST /auth/change-password` `{old_password,new_password}`

### Clinics / Users (admin)
- `GET/POST /clinics` — `{name,code,is_active}`
- `PATCH /clinics/{id}`
- `GET/POST /users` — `{email,password,name,role,clinic_id}` ; roles: `admin|clinician|researcher`
- `PATCH /users/{id}` `{is_active,role,clinic_id}`

### Participants
- `GET /participants?search=&clinic_id=&skip=&limit=` → `{items,total}`
- `POST /participants` `{research_id,birth_year,age,sex,clinic_id,consent_guardian:bool,consent_assent:bool,consent_date}` → participant
- `GET/PATCH /participants/{id}`
- `GET /participants/{id}/sessions`

### Sessions
- `GET /sessions?participant_id=&status=&clinic_id=`
- `POST /sessions` `{participant_id,label,stimulus_set,screen_width,screen_height,calibration,started_at,client_meta,idempotency_key}` → session `(status=COLLECTING)`
  - `label` ∈ `ADHD|CONTROL|UNKNOWN` ; `calibration` = `{coef:number[][],mean_error_px,median_error_px,points,created_at}`
  - `idempotency_key` تکراری → همان session برگردانده میشود (برای Sync).
- `POST /sessions/{id}/samples` `{stimulus, samples:[{timestamp,frame_id,gaze_x,gaze_y,gaze_valid,left_iris_x,left_iris_y,right_iris_x,right_iris_y}], quality_partial}` → `{accepted:int}`
- `POST /sessions/{id}/complete` `{ended_at, quality}` → `{id,status,quality,features,risk}` ;Quality Gate:
  - `status=VALID` فقط اگر `valid_gaze_ratio>=threshold`, brightness_ok, calibration_ok, max_gap_ok.
  - اگر INVALID: `features` و `risk` **must be null** و پیام `Eye Tracking Result: Not Calculated – Insufficient Data Quality`.
- `GET /sessions/{id}` → جزئیات + quality + features + risk + xai
- `GET /sessions/{id}/heatmap` → `[{stimulus,points:[[x,y],...]}]` (برای Canvas)
- `GET /sessions/{id}/events` → event log (شروع/پایان هر محرک، خطاها)

### Assessments (Conners / IVA-2)
- `GET/POST /participants/{id}/assessments` `{kind:'CONNERS'|'IVA2',version,scores:object,assessed_at,notes}`
- `DELETE /assessments/{id}`
- `GET /rating-scales/parent` → بانک سؤالات SNAP-IV (۲۶ آیتم، ۴ گزینه لیکرت، ۳ خردهمقیاس). متن سؤالات سمت سرور است تا کلاینت نتواند از نمرهگذاری منحرف شود.
- `POST /participants/{id}/parent-rating` `{instrument:'SNAP-IV-26', answers:[{item_id:1..26, value:0..3}], notes?, assessed_at?}` → ارزیابی با `kind=PARENT_RATING` و `version=SNAP-IV-26` بهطور خودکار در پرونده همان مراجع ذخیره میشود. میانگینهای `inattention`، `hyperactivity`، `odd` و `adhd_total` + شدت آنها **سرور محاسبه میکند** (کلاینت فقط پاسخ خام میفرستد). اعتبار پاسخها: ۲۶ آیتم دقیقاً یکبار، مقادیر ۰ تا ۳.
  - یادداشت: SNAP-IV یک ابزار غربالگری آزاد است؛ مقیاسهای تجاری کانرز (MHS) کپی نشدهاند و در صورت داشتن مجوز میشوند جایگزین شوند.
- `GET /cpt/protocol` → پروتکل ثابت و سرورمحور تست پیوسته (IVA-style): ۴۰ کارآزمایی در دو بلوک دیداری و شنیداری؛ **رقم ۱ هدف و رقم ۲ غیرهدف** در هر دو بخش (مدت محرک ۶۰۰ms / فاصله ۱۴۰۰ms).
- `POST /participants/{id}/iva-cpt` `{protocol_version:'IVA-CPT-1', results:[{trial_index:0..39, reaction_ms:float|null, response_count:int}], notes?, assessed_at?}` → ارزیابی `kind=IVA2`، `version=IVA-CPT-1` بهطور خودکار در پرونده مراجع ذخیره میشود. کلاینت فقط پاسخ خام (زمان واکنش به میلیثانیه) میفرستد؛ **تمام شاخصها سرور محاسبه میکند**: hits, misses, false alarms, correct rejections, hit rate, FA rate, d′ (با تصحیح 0.5/N)، mean hit RT و RT SD — جداگانه برای دیداری، شنیداری و کلی.
  - پیادهسازی آزاد و الهامگرفته از الگوی IVA است؛ محتوای اختصاصی IVA-2 (آیتمها و جداول هنجار) کپی نشده است.

### Models
- `GET /models` → لیست نسخهها + متریکها
- `POST /models/train` `{min_labeled_sessions:int}` →_train با `StratifiedGroupKFold` بر اساس **تعداد participantها** (نه تعداد نمونهها)؛ return metrics شامل auc, accuracy, sensitivity, specificity, f1, calibration, confusion_matrix, n_participants, feature_names, model_version
- `GET /models/{version}` → model card
- `POST /models/{version}/predict` `{session_id}` → `{risk,version,xai:[{feature,contribution}],disclaimer}`

### Reports
- `GET /reports/session/{id}` → ساختار ۱۰بخشی فصل ۳ (مشخصات، کیفیت، ET، Conners، IVA2، مقایسه منابع، مدل، XAI، محدودیت، نتیجه)
- `GET /reports/session/{id}.pdf` → PDF (WeasyPrint؛ در شکست، HTML چاپپذیر)

### Sync / Offline
- `POST /sync/batch` `{events:[{idempotency_key,type,payload}]}` → `{results:[{idempotency_key,status,resource_id}]}` ; تکراری → `duplicate`.
- `GET /sync/status`

### Admin
- `GET /config/quality` → آستانهها (قابل تنظیم توسط admin)
- `PATCH /config/quality`
- `GET /audit?user_id=&from=&to=&action=`

## 3. مدلهای داده (فیلدهای ضروری)
`clinics(id,name,code,is_active)` · `users(id,clinic_id,email,password_hash,name,role,is_active,created_at)` ·
`participants(id,clinic_id,research_id,birth_year,age,sex,consent_*,created_at)` ·
`sessions(id,participant_id,label,status,stimulus_set,screen_width,screen_height,calibration_json,started_at,ended_at,client_meta_json,created_at)` ·
`gaze_samples(id,session_id,stimulus,timestamp,frame_id,gaze_x,gaze_y,gaze_valid,left_iris_x,...,quality_partial_json)` ·
`quality_reports(session_id PK,status,valid_gaze_ratio,tracking_loss_ratio,mean_brightness,brightness_cv,max_tracking_gap_s,calibration_error_px,reasons,per_stimulus_json)` ·
`features(session_id PK,feature_json,extractor_version)` ·
`assessments(id,participant_id,kind,version,scores_json,assessed_at)` ·
`predictions(id,session_id,model_version,risk,xai_json,created_at)` ·
`model_versions(version PK,metrics_json,features_json,created_at,artifact_path)` ·
`events(id,session_id,type,payload_json,created_at)` ·
`audit_logs(id,user_id,action,entity,entity_id,meta_json,created_at)` ·
`sync_events(idempotency_key PK,type,payload_json,resource_id,created_at)`.

## 4. زنجیره کیفیت (باید در بکاند اعمال شود، نه فقط ثبت)
- `MIN_VALID_GAZE_RATIO=0.70`, `MAX_TRACKING_GAP_SEC=0.75`, brightness `25..235`, calibration error `<=180px` (همه قابل تنظیم).
- «نگاه خارج از صفحه» نباید بهعنوان tracking loss شمرده شود → فیلد `off_screen` جداگانه در sample.
- کیفیت **per-stimulus** هم محاسبه و ذخیره شود.
- Short gap (< threshold) نباید جلسه را رد کند؛ long gap → INVALID.

## 5. ویژگیها (feature extraction)
حداقل: `valid_gaze_ratio, gaze_x/y mean/std, scanpath_length_px, mean_gaze_step_px, mean_gaze_velocity_px_s, fixation_count, mean_fixation_ms, saccade_count, aoi_enter_counts (3x3)`, `brightness_cv` بهعنوان quality Feature **not predictor**.

## 6. طراحی UI (RTL، پالی_rsa تأییدشده)
Primary `#0E7490` · on-primary `#FFFFFF` · Accent `#D1390F` (فقط یک CTA در صفحه) ·
Neutral bg `#F7F8F8`, surface `#FFFFFF`, border `#D6DADC`, text `#303536` ·
Success `#15793A`, Error `#BF2222`, Warning `#D08A11`, Info `#2270BF` ·
Dark sidebar `#0F4757` · فاصلهها ضریب ۸ · شعاع 12–16px · فونت Vazirmatn + Inter ·
آیکونها lucide-react outline 20–24px، ناحیه لمس ≥ 48px، RTL آینه میشود ·
یک Primary Action در هر صفحه · هشدار ثابت در تمام صفحات: «ابزار پشتیبان تصمیم پژوهشی است، جایگزین تشخیص متخصص نیست.»

صفحات: Login · Dashboard · Participants · ParticipantDetail · SessionWizard (consent → camera check → 9-point calibration → 10-stimulus collection → quality result) · SessionDetail (heatmap + report + risk + XAI) · Assessments · ModelLab · Admin · SyncCenter.

## 7. قوانین سختگیرانه
1. هیچ gaze/j_prediction جعلی و هیچ عدد نمایشی ساختگی وجود ندارد.
2. probability تنها زمانی نمایش داده میشود که مدل وجود داشته باشد و کیفیت VALID باشد؛ در غیر اینصورت `Not Calculated`.
3. فریم خام دوربین به سرور ارسال نمیشود؛ فقط ویژگیها/نقاط نگاشتشده.
4. داده هویتی (نام/تلفن) در جدول جداگانهی participant نگهداری وارد CSV پژوهشی نمیشود.
5. هر Prediction همراه model_version، feature_version و timestamp ذخیره میشود.
6. تمام اقدامات حساس (login, create, delete, train, threshold change) در audit_log ثبت شوند.
