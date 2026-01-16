/**
 * Shared styling recipes (Tailwind classes).
 * Using semantic tokens from theme.css (via tailwind config).
 */

export const TEXT_STYLES = {
  /** Small uppercase label */
  label: 'text-[9px] text-text-muted uppercase tracking-wider font-semibold',
  /** Section title in sidebar */
  sidebarTitle: 'text-[10px] font-bold text-text uppercase tracking-wide',
  /** Hint/helper text */
  hint: 'text-[9px] text-text-muted',
  /** Small mono text for values */
  mono: 'text-[11px] text-text-muted font-mono',
} as const;

export const INPUT_STYLES = {
  /** Ribbon input: usage fixed height h-7 usually handled by parent or specific class */
  ribbon:
    'w-full h-7 bg-surface-2 border border-border rounded flex items-center px-2 text-xs text-text focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-text-muted/50',
  /** Light-themed input replacement (now generic surface1) */
  sidebar:
    'w-full h-7 px-2 text-[11px] bg-surface-1 border border-border rounded text-text focus:outline-none focus:border-primary transition-all placeholder:text-text-muted/50',
  /** Disabled state */
  disabled: 'bg-surface-2/50 text-text-muted cursor-not-allowed border-transparent',
} as const;

// Base button shared classes
const BUTTON_BASE =
  'rounded transition-colors text-text-muted hover:text-text hover:bg-surface-2 border border-transparent active:bg-surface-2/80 focus:outline-none';

export const BUTTON_STYLES = {
  /** Base button style */
  base: BUTTON_BASE,
  /** Centered flex button */
  centered: `flex items-center justify-center ${BUTTON_BASE}`,
  /** Active/selected state (primary variant) */
  active: 'bg-primary/20 text-primary hover:text-text border border-primary/30',
  /** Destructive/Delete action */
  danger: 'text-red-500 hover:bg-red-500/10 hover:border-red-500/20',
} as const;
