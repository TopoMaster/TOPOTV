/** Marca TOPOTV: el topo asomando de su madriguera (mismo dibujo que public/favicon.svg). */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <img src={`${import.meta.env.BASE_URL}favicon.svg`} width={size} height={size} alt="" aria-hidden="true" draggable={false}
      style={{ flexShrink: 0, borderRadius: size * 0.22, filter: 'drop-shadow(0 4px 12px rgba(226,201,126,0.25))' }} />
  );
}
export function LogoWord() {
  return <span className="font-display" style={{ fontSize: '1.7rem', letterSpacing: '0.12em', lineHeight: 1, background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>TOPOTV</span>;
}
