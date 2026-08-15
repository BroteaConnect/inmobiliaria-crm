import type { ButtonHTMLAttributes } from 'react';

/**
 * Exactly two levels, as the design insists: `primary` for the one action a
 * screen is about, `ghost` for everything else. A third level is a decision to
 * be made in the design, not an extra class invented at a call site.
 *
 * `primary` keeps the `.primario` class alongside its own so the CSS the rest
 * of the CRM already relies on does not regress while call sites migrate.
 */
export default function Button({
  variant = 'ghost',
  className = '',
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }) {
  const legacy = variant === 'primary' ? ' primario' : '';
  return (
    <button
      type={type}
      className={`ui-btn ui-btn-${variant}${legacy}${className ? ` ${className}` : ''}`}
      {...rest}
    />
  );
}
