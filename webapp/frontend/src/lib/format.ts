/** Persian (fa-IR) number, date and text formatting helpers. */

const faDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/** Convert any ASCII digits in a string to Persian digits. */
export function toPersianDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => faDigits[Number(d)]);
}

/** Convert Persian digits back to ASCII (useful before numeric parsing). */
export function fromPersianDigits(value: string): string {
  return value.replace(/[۰-۹]/g, (d) => String(faDigits.indexOf(d)));
}

const numberFormatter = new Intl.NumberFormat('fa-IR');
const percentFormatter = new Intl.NumberFormat('fa-IR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Format an integer/decimal with Persian grouping and digits. */
export function formatNumber(value: number | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  return numberFormatter.format(value);
}

/** Format a 0..1 ratio as a Persian percentage. */
export function formatPercent(value: number | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  return percentFormatter.format(value);
}

/** Format a decimal with fixed precision using Persian digits. */
export function formatDecimal(value: number | null | undefined, digits = 2, fallback = '—'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  return toPersianDigits(
    new Intl.NumberFormat('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value),
  );
}

const dateFormatter = new Intl.DateTimeFormat('fa-IR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('fa-IR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('fa-IR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  return d ? dateFormatter.format(d) : '—';
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  return d ? dateTimeFormatter.format(d) : '—';
}

export function formatTime(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  return d ? timeFormatter.format(d) : '—';
}

/** Milliseconds → mm:ss ( Western digits, used inside numeric chips ). */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/** Western-digit copy for chart axes / tooltips where Inter is used. */
export function enNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Sex code → Persian label. */
export function sexLabel(sex: string | null | undefined): string {
  if (!sex) return '—';
  const s = sex.toUpperCase();
  if (s === 'M' || s === 'MALE') return 'مرد';
  if (s === 'F' || s === 'FEMALE') return 'زن';
  return sex;
}

/** Session/status/label codes → Persian display labels. */
export const labelFa: Record<string, string> = {
  ADHD: 'ADHD',
  CONTROL: 'گروه کنترل',
  UNKNOWN: 'نامشخص',
  VALID: 'معتبر',
  INVALID: 'نامعتبر',
  COLLECTING: 'در حال جمعآوری',
  COMPLETED: 'تکمیلشده',
  CONNERS: 'کانرز',
  IVA2: 'IVA-2',
};

export function codeLabel(code: string | null | undefined): string {
  if (!code) return '—';
  return labelFa[code] ?? code;
}
