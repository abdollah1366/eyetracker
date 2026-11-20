import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Activity, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { apiErrorMessage } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export function Login() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/dashboard';

  if (!isLoading && isAuthenticated) return <Navigate to={from} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ email, password });
      navigate(from, { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-canvas" dir="rtl">
      {/* brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-sidebar p-12 text-white lg:flex">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-primary/25 blur-3xl" />
        <div className="absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
            <Activity size={26} />
          </div>
          <div>
            <p className="text-lg font-extrabold">ردیابی چشم</p>
            <p className="text-xs text-white/55">سامانه پشتیبان تصمیم پژوهشی</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-3xl font-extrabold leading-relaxed">
            تحلیل رفتار نگاه،
            <br />
            با دقت بالینی
          </h1>
          <p className="mt-5 text-sm leading-8 text-white/65">
            جمعآوری استاندارد دادههای ردیابی چشم، ارزیابی کیفیت، و استخراج ویژگیها در یک
            بستر امن و یکپارچه.
          </p>
          <div className="mt-8 space-y-3">
            {['کالیبراسیون ۹ نقطهای', 'درجهبندی کیفیت خودکار', 'گزارش ساختاریافته ۱۰ بخشی'].map(
              (t) => (
                <div key={t} className="flex items-center gap-2 text-xs text-white/75">
                  <ShieldCheck size={16} className="text-primary" /> {t}
                </div>
              ),
            )}
          </div>
        </div>
        <p className="relative text-[11px] text-white/45">
          ابزار پشتیبان تصمیم پژوهشی است، جایگزین تشخیص متخصص نیست.
        </p>
      </div>

      {/* form panel */}
      <div className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-[400px] animate-fade-in">
          <div className="mb-8 lg:hidden">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white">
              <Activity size={26} />
            </div>
            <h1 className="text-2xl font-extrabold">ردیابی چشم</h1>
          </div>

          <h2 className="text-2xl font-extrabold text-ink">خوش آمدید</h2>
          <p className="mt-2 text-sm text-ink-muted">برای ورود به سامانه، اطلاعات حساب خود را وارد کنید.</p>

          {error ? (
            <div className="mt-6 rounded-xl border border-error/25 bg-error-soft px-4 py-3 text-xs font-semibold text-error">
              {error}
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <Input
              label="ایمیل"
              type="email"
              dir="ltr"
              autoComplete="email"
              placeholder="name@clinic.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail size={18} />}
              required
            />
            <Input
              label="رمز عبور"
              type="password"
              dir="ltr"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              icon={<LockKeyhole size={18} />}
              required
            />
            <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
              ورود به سامانه
            </Button>
          </form>

          <p className="mt-8 text-center text-[11px] leading-6 text-ink-subtle">
            دسترسی به سامانه تنها برای کاربران مجاز کلینیکها و مراکز پژوهشی میسر است.
          </p>
        </div>
      </div>
    </div>
  );
}
