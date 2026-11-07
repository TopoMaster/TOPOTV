import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { ExternalLink, RotateCw, Trophy } from 'lucide-react';

const FLASHSCORE_URL = 'https://www.flashscore.es/';

export function FlashscorePage() {
  const [frameVersion, setFrameVersion] = useState(0);

  // Flashscore no permite incrustarse en el WebView de Android: se abre en el navegador del sistema.
  if (Capacitor.isNativePlatform()) {
    return (
      <section className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <Trophy size={44} strokeWidth={1.4} style={{ color: 'var(--accent)' }} />
        <h1 className="font-display" style={{ fontSize: '1.8rem' }}>Marcadores</h1>
        <p style={{ maxWidth: 420, color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.6 }}>
          Resultados y marcadores en directo de Flashscore. Se abren en tu navegador para que funcionen todos los servicios del sitio.
        </p>
        <a
          href={FLASHSCORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2"
          style={{ minHeight: 48, padding: '0 22px', borderRadius: 'var(--radius-md)', background: 'var(--accent-gradient)', color: '#080a0e', fontWeight: 700, fontSize: '0.9rem', textDecoration: 'none' }}
        >
          Abrir Flashscore <ExternalLink size={16} />
        </a>
      </section>
    );
  }

  return (
    <section className="flex h-full flex-col gap-3 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display" style={{ fontSize: '1.8rem', lineHeight: 1.1 }}>Marcadores</h1>
          <p style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: '0.75rem' }}>Flashscore</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFrameVersion(version => version + 1)}
            aria-label="Recargar Flashscore"
            title="Recargar"
            className="flex items-center justify-center"
            style={{ width: 38, height: 38, border: '1px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <RotateCw size={16} />
          </button>
          <a
            href={FLASHSCORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2"
            style={{ height: 38, padding: '0 12px', border: '1px solid var(--border-mid)', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: '0.76rem', textDecoration: 'none' }}
          >
            Abrir en navegador <ExternalLink size={14} />
          </a>
        </div>
      </header>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', background: '#fff' }}>
        <iframe
          key={frameVersion}
          src={FLASHSCORE_URL}
          title="Marcadores en Flashscore"
          referrerPolicy="strict-origin-when-cross-origin"
          style={{ display: 'block', width: '100%', height: '100%', minHeight: 0, border: 0 }}
        />
      </div>
    </section>
  );
}