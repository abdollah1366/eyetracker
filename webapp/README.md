# ADHD Eye-Tracking CDSS — وباپ

نسخه وب (مرورگرمحور) مطابق معماری Client–Server فصل سوم پایاننامه. دوربین و استنتاج gaze کاملاً داخل مرورگر انجام میشود؛ **هیچ فریم خامی به سرور ارسال نمیشود** — فقط مختصات/ویژگیهای مشتقشده و آمارهای کیفیت.

## ساختار
- `SPEC.md` — قرارداد API، مدلهای داده، قوانین کیفیت و ایمنی (مرجع مشترک).
- `DESIGN.md` — سیستم طراحی RTL و پالت رنگ.
- `frontend/` — Vite + React + TypeScript + MediaPipe Tasks Vision + Tailwind.
- `backend/` — FastAPI + PostgreSQL + SQLAlchemy + JWT + WeasyPrint.
- `docker-compose.yml` / `.env.example` — استقرار Docker.

## اجرا

### با Docker (توصیهشده)
```bash
cp .env.example .env
# مقادیر POSTGRES_*، JWT_SECRET و ADMIN_* را تنظیم کنید
docker compose up --build -d
```
- فرانتاند: `http://localhost:8080` (یا پورتی که در compose تنظیم شده)
- بکاند: `http://localhost:8000/docs`
- حساب پیشفرض ادمین از طریق متغیرهای `ADMIN_EMAIL` / `ADMIN_PASSWORD` در `.env` ساخته میشود.

### اجرای محلی (بدون Docker)
```bash
# بکاند
cd backend
python -m venv .venv && . .venv/Scripts/activate   # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# فرانتاند (ترمینال دوم)
cd frontend
npm install
npm run dev        # http://localhost:5173
```
در حالت development، vite بهصورت خودکار `/api` را به `http://localhost:8000` پراکسی میکند.

## نکات مهم
1. **دوربین فقط روی HTTPS یا localhost کار میکند** (`getUserMedia`). برای استقرار روی دامنه واقعی حتماً nginx را پشت TLS قرار دهید؛ در غیر این صورت مرورگر دسترسی به دوربین را رد میکند.
2. **محرک دهم:** پروتکل پایاننامه ۱۰ محرک میخواهد، اما تنها ۹ فایل (`1.jpg`…`9.jpg`) در پروژه موجود است. وباپ صریحاً هشدار میدهد و محرک دهم را جعل نمیکند. برای تکمیل پروتکل، فایل دهم را در `frontend/public/stimuli/ADHD/10.jpg` قرار دهید.
3. **Quality Gate الزامی است:** اگر کیفیت جلسه `INVALID` باشد، ویژگیها و احتمال مدل `null` میشوند و رابط «Not Calculated» نمایش میدهد. هیچ عددی ساختگی نیست.
4. **آفلاین:** رویدادها در IndexedDB صف میشوند و از صفحه Sync Center ارسال مجدد میگردند (idempotent بر اساس `idempotency_key`).
5. **MediaPipe** در حال حاضر WASM و مدل را از CDN بارگذاری میکند. برای کلینیک کاملاً آفلاین، این فایلها باید vendor شوند (یک کار آتی).

## ایمنی
این ابزار یک **سیستم پشتیبان تصمیم پژوهشی** است و جایگزین تشخیص متخصص نیست. این پیام در تمام صفحات نمایش داده میشود.
