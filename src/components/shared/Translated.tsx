import { useEffect, useState } from 'react';
import { Languages } from 'lucide-react';
import { useSettingsStore } from '@/store/useSettingsStore';
import { looksLike, translate } from '@/lib/translate';

/**
 * Texto que se traduce solo al idioma del usuario (Ajustes → Idioma) si está en otro idioma.
 * `from` es el idioma de origen si se sabe (p. ej. «en» para Cinemeta, «de» para un canal alemán).
 */
export function useTranslated(text: string | undefined, from?: string): { text: string; translated: boolean } {
  const { translateAuto, translateTo } = useSettingsStore();
  const [out, setOut] = useState<{ src: string; text: string } | null>(null);
  const src = text ?? '';
  const skip = !translateAuto || !src || from === translateTo || (!from && looksLike(src, translateTo));
  useEffect(() => {
    if (skip) return;
    let cancelled = false;
    void translate(src, translateTo, from).then(t => { if (!cancelled) setOut({ src, text: t }); });
    return () => { cancelled = true; };
  }, [src, translateTo, from, skip]);
  if (skip || !out || out.src !== src || out.text === src) return { text: src, translated: false };
  return { text: out.text, translated: true };
}

export function Translated({ text, from, showIcon = false }: { text?: string; from?: string; showIcon?: boolean }) {
  const r = useTranslated(text, from);
  return <>{showIcon && r.translated && <Languages size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px', opacity: 0.7 }} aria-label="Traducido" />}<span title={r.translated ? `Original: ${text}` : undefined}>{r.text}</span></>;
}
