import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  BrainCircuit,
  ChevronDown,
  ClipboardList,
  Eye,
  LayoutDashboard,
  LogOut,
  Layers,
  Menu,
  RefreshCw,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { getQueueCount } from '../../lib/idb';
import { syncApi } from '../../lib/api';

const navItems = [
  { to: '/dashboard', label: 'داشبورد', icon: LayoutDashboard },
  { to: '/participants', label: 'شرکتکنندگان', icon: Users },
  { to: '/assessments', label: 'ارزیابیها', icon: ClipboardList },
  { to: '/sessions/new', label: 'جلسه جدید', icon: Eye },
  { to: '/models', label: 'آزمایشگاه مدل', icon: BrainCircuit },
  { to: '/heatmap', label: 'نقشه حرارتی کلی', icon: Layers },
  { to: '/sync', label: 'مرکز همگامسازی', icon: RefreshCw },
];

const roleLabel: Record<string, string> = {
  admin: 'مدیر',
  clinician: 'بالینشناس',
  researcher: 'پژوهشگر',
};

function SyncPill() {
  const [count, setCount] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const refresh = () => {
      setOnline(navigator.onLine);
      void getQueueCount().then(setCount).catch(() => setCount(0));
      if (navigator.onLine) void syncApi.status().catch(() => undefined);
    };
    refresh();
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    const id = window.setInterval(refresh, 20_000);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      window.clearInterval(id);
    };
  }, []);

  return (
    <button
      onClick={() => (window.location.href = '/sync')}
      className={`flex h-9 items-center gap-2 rounded-pill border px-3 text-[11px] font-semibold transition-colors ${
        count > 0 || !online
          ? 'border-warning/30 bg-warning-soft text-warning hover:bg-warning/20'
          : 'border-success/25 bg-success-soft text-success hover:bg-success/15'
      }`}
      title="وضعیت همگامسازی"
    >
      <span className={`h-2 w-2 rounded-full ${online ? 'bg-success' : 'bg-warning'}`} />
      {online ? (count > 0 ? `${count} در صف` : 'همگام') : 'آفلاین'}
    </button>
  );
}

export function AppShell() {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas" dir="rtl">
      {/* ---- sidebar ---- */}
      <aside
        className={[
          'fixed inset-y-0 right-0 z-40 flex w-[264px] flex-col bg-sidebar text-sidebar-text transition-transform duration-300 ease-clinical lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        <div className="flex h-[72px] shrink-0 items-center gap-3 border-b border-white/10 px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white">
            <Activity size={22} strokeWidth={2} />
          </div>
          <div>
            <p className="text-sm font-extrabold leading-tight text-white">ردیابی چشم</p>
            <p className="text-[10px] text-white/55">پشتیبان تصمیم پژوهشی</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="mr-auto flex h-9 w-9 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 lg:hidden"
            aria-label="بستن منو"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wide text-white/35">
            منوی اصلی
          </p>
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  'flex h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold transition-all duration-150',
                  isActive
                    ? 'bg-white/15 text-white shadow-sm'
                    : 'text-white/65 hover:bg-white/10 hover:text-white',
                ].join(' ')
              }
            >
              <Icon size={20} strokeWidth={1.9} className="flip-rtl" />
              <span>{label}</span>
            </NavLink>
          ))}

          {hasRole('admin') ? (
            <>
              <p className="mb-2 mt-6 px-3 text-[10px] font-bold uppercase tracking-wide text-white/35">
                مدیریت
              </p>
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  [
                    'flex h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold transition-all duration-150',
                    isActive
                      ? 'bg-white/15 text-white shadow-sm'
                      : 'text-white/65 hover:bg-white/10 hover:text-white',
                  ].join(' ')
                }
              >
                <Settings size={20} strokeWidth={1.9} className="flip-rtl" />
                <span>تنظیمات سامانه</span>
              </NavLink>
            </>
          ) : null}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              {user?.name?.charAt(0) ?? '؟'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-white">{user?.name ?? '—'}</p>
              <p className="text-[10px] text-white/50">
                {user?.role ? roleLabel[user.role] ?? user.role : '—'}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="خروج"
              title="خروج"
            >
              <LogOut size={18} className="flip-rtl" />
            </button>
          </div>
        </div>
      </aside>

      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-30 bg-sidebar/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      {/* ---- main column ---- */}
      <div className="flex min-w-0 flex-1 flex-col lg:mr-[264px]">
        <header className="sticky top-0 z-20 flex h-[72px] shrink-0 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-muted hover:bg-surface-2 lg:hidden"
            aria-label="باز کردن منو"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
            <ShieldCheck size={18} className="text-primary" />
            <span className="hidden sm:inline">سامانه پشتیبان تصمیم بالینی</span>
          </div>

          <div className="mr-auto flex items-center gap-2">
            <SyncPill />
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-2.5 transition-colors hover:bg-surface-2"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft text-[11px] font-bold text-primary">
                  {user?.name?.charAt(0) ?? '؟'}
                </div>
                <span className="hidden text-xs font-semibold text-ink sm:inline">{user?.name}</span>
                <ChevronDown size={15} className="text-ink-subtle" />
              </button>
              {menuOpen ? (
                <div className="absolute left-0 top-[calc(100%+8px)] z-30 w-52 rounded-xl border border-border bg-surface p-2 shadow-modal animate-scale-in">
                  <div className="border-b border-border/70 px-3 py-2">
                    <p className="truncate text-xs font-bold text-ink">{user?.name}</p>
                    <p className="truncate text-[10px] text-ink-muted" dir="ltr">
                      {user?.email}
                    </p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-error transition-colors hover:bg-error-soft"
                  >
                    <LogOut size={16} className="flip-rtl" /> خروج از حساب
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="mx-auto w-full max-w-[1440px] animate-fade-in">
            <Outlet />
          </div>
        </main>

        <footer
          className="sticky bottom-0 z-10 flex min-h-[36px] items-center justify-center gap-2 border-t border-border bg-surface/95 px-4 py-1.5 text-center text-[11px] font-medium text-ink-muted backdrop-blur"
          role="note"
        >
          <ShieldCheck size={14} className="shrink-0 text-primary" />
          <span>ابزار پشتیبان تصمیم پژوهشی است، جایگزین تشخیص متخصص نیست.</span>
        </footer>
      </div>
    </div>
  );
}
