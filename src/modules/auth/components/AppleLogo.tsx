/** The real Apple wordmark (lucide's `apple` is a fruit, not the brand). */
export function AppleLogo({ size = 18 }: { size?: number }) {
  return (
    // design-rules: allow inline-svg (a brand logo, which the icon-set rule exempts; lucide has no Apple mark)
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" className="block">
      <path d="M17.05 12.04c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.89-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.89 2.65 3.23 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.39.81 1.4-.02 2.29-1.27 3.14-2.53.99-1.45 1.4-2.85 1.42-2.92-.03-.01-2.73-1.05-2.76-4.16zM14.6 4.59c.71-.86 1.19-2.06 1.06-3.25-1.02.04-2.26.68-2.99 1.54-.66.76-1.23 1.98-1.08 3.15 1.14.09 2.3-.58 3.01-1.44z" />
    </svg>
  )
}

/** Sign in with Apple — Firebase's apple.com provider (design/apple-signin-scope.md).
 *  One button for the sign-in page and the Keep your list sheet, so they match. */
export function AppleButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className="w-full inline-flex items-center justify-center gap-2.5 rounded-[14px] py-[14px] text-[0.9375rem] font-bold text-white bg-black disabled:opacity-70"
    >
      <AppleLogo size={18} /> {label}
    </button>
  )
}
