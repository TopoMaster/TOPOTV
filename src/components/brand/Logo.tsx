/** Marca TOPOTV: pantalla con play sobre fondo dorado. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ flexShrink: 0, filter: 'drop-shadow(0 4px 12px rgba(226,201,126,0.25))' }}>
      <defs><linearGradient id="tt-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f1dd9b" /><stop offset="1" stopColor="#d4b25c" /></linearGradient></defs>
      <rect width="64" height="64" rx="14" fill="url(#tt-g)" />
      <rect x="11" y="16" width="42" height="28" rx="6" fill="none" stroke="#080a0e" strokeWidth="4.5" />
      <path d="M28 24.5v13l11-6.5z" fill="#080a0e" />
      <path d="M23 50h18" stroke="#080a0e" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  );
}
export function LogoWord() {
  return <span className="font-display" style={{ fontSize: '1.7rem', letterSpacing: '0.12em', lineHeight: 1, background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>TOPOTV</span>;
}
