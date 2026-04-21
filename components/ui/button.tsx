import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonBaseProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  children?: ReactNode;
}

/**
 * Primary button — gold gradient, used for the main call to action.
 * Ported from session.html BtnPrimary.
 */
export function BtnPrimary({ icon, children, className = '', ...rest }: ButtonBaseProps) {
  return (
    <button
      type="button"
      className={`inline-flex cursor-pointer items-center gap-2 border border-gold-dim bg-gradient-to-b from-gold-bright to-gold px-[18px] py-[10px] font-ui text-[13px] font-semibold tracking-wide text-bg-deep shadow-[0_2px_0_var(--color-gold-dim)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...rest}
    >
      {icon && <span aria-hidden>{icon}</span>}
      {children}
    </button>
  );
}

interface GhostProps extends ButtonBaseProps {
  active?: boolean;
}

/**
 * Ghost button — framed outline, used for secondary actions.
 * Ported from session.html BtnGhost.
 */
export function BtnGhost({ icon, children, active, className = '', ...rest }: GhostProps) {
  const activeClasses = active
    ? 'bg-[rgba(212,166,76,0.15)] text-gold-bright border-gold'
    : 'text-text border-line hover:border-gold-dim';
  return (
    <button
      type="button"
      className={`inline-flex cursor-pointer items-center gap-2 border px-4 py-[10px] font-ui text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${activeClasses} ${className}`}
      {...rest}
    >
      {icon && <span aria-hidden>{icon}</span>}
      {children}
    </button>
  );
}
