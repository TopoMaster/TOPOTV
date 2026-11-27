/** Diseño de móvil (barra de abajo): pantallas estrechas y móviles en horizontal (táctiles con poca altura).
 *  Es la misma condición que usan las reglas @media de index.css. */
export const PHONE_QUERY = '(max-width: 700px), (pointer: coarse) and (max-height: 500px)';
export const isPhoneLayout = () => typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches;
