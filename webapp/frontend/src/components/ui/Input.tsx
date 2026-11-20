import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helper?: string;
  icon?: ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, helper, icon, className = '', containerClassName = '', id, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy = error ? `${inputId}-error` : helper ? `${inputId}-helper` : undefined;

  return (
    <div className={`w-full ${containerClassName}`}>
      {label ? (
        <label htmlFor={inputId} className="mb-1.5 block text-xs font-semibold text-ink">
          {label}
        </label>
      ) : null}
      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-subtle">
            {icon}
          </span>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
          className={[
            'h-11 w-full rounded-xl border bg-surface px-3.5 text-sm text-ink transition-colors duration-150',
            'placeholder:text-ink-subtle',
            'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary',
            'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-subtle',
            icon ? 'pr-10' : '',
            error ? 'border-error focus:border-error focus:ring-error/25' : 'border-border',
            className,
          ].join(' ')}
          {...rest}
        />
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="mt-1.5 text-[11px] font-medium text-error">
          {error}
        </p>
      ) : helper ? (
        <p id={`${inputId}-helper`} className="mt-1.5 text-[11px] text-ink-subtle">
          {helper}
        </p>
      ) : null}
    </div>
  );
});
