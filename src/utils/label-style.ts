import type { HighlightLabelStyle } from '../types';

function setStyle(
  el: HTMLElement,
  key: keyof CSSStyleDeclaration,
  value?: string | number,
  transform?: (value: string | number) => string
): void {
  if (value == null) return;
  const final = transform ? transform(value) : String(value);
  (el.style as unknown as Record<string, string>)[key as string] = final;
}

const DIRECT_LABEL_STYLE_KEYS = [
  'color',
  'backgroundColor',
  'padding',
  'borderRadius',
  'fontFamily',
  'border',
  'whiteSpace',
] as const;

/**
 * Applies label style properties to an HTMLElement. Used by both
 * UnifiedLayerBuilder and PDFHighlightViewer so defaults and edge-cases
 * stay consistent.
 */
export function applyLabelStyle(el: HTMLElement, style?: HighlightLabelStyle): void {
  if (!style) return;

  setStyle(el, 'fontSize', style.fontSize, (value) =>
    typeof value === 'number' ? `${value}px` : String(value)
  );
  setStyle(el, 'fontWeight', style.fontWeight);

  for (const key of DIRECT_LABEL_STYLE_KEYS) {
    setStyle(el, key, style[key]);
  }
}

/**
 * Applies icon-specific style (e.g. iconColor) to the icon wrapper element.
 * Used when rendering beforeIcon so icon and label can have different colors.
 */
export function applyIconStyle(el: HTMLElement, style?: HighlightLabelStyle): void {
  if (!style?.iconColor) return;
  el.style.color = style.iconColor;
}

/**
 * Normalizes icon size to a CSS value (e.g. for label icons).
 * - null/undefined → '1em'
 * - number → 'Npx'
 * - string → as-is (e.g. '1em', '16px')
 */
export function normalizeSize(iconSize?: number | string): string {
  if (iconSize == null) return '1em';
  if (typeof iconSize === 'number') return `${iconSize}px`;
  return String(iconSize);
}
