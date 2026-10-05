import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'md' | 'sm';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-chip font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:cursor-not-allowed disabled:opacity-50';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'border border-teal bg-teal text-paper hover:bg-ink hover:border-ink',
  secondary: 'border border-ink bg-paper text-ink hover:bg-mist',
  ghost: 'border border-transparent bg-transparent text-ink hover:bg-mist',
};

const SIZES: Record<ButtonSize, string> = {
  md: 'h-11 px-5 text-body',
  sm: 'h-9 px-3 text-small',
};

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra = ''): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;
}

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  children: ReactNode;
}

export function Button({ variant, size, icon, children, className, type = 'button', ...rest }: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}

export function ButtonLink({ variant, size, icon, children, className, ...rest }: CommonProps & LinkProps) {
  return (
    <Link className={buttonClass(variant, size, typeof className === 'string' ? className : '')} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
