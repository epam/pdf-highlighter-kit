import type { HighlightLabelStyle, HighlightStyle } from '../types';
import { sanitizeIconHtml } from './sanitize-icon-html';

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
  'opacity',
  'color',
  'backgroundColor',
  'padding',
  'borderRadius',
  'fontFamily',
  'border',
  'borderColor',
  'borderWidth',
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
 * Appends a sanitized icon element to a label when beforeIcon is provided.
 */
export function appendLabelIcon(
  labelEl: HTMLElement,
  beforeIcon: string | undefined,
  style?: HighlightLabelStyle
): void {
  if (!beforeIcon) return;

  const iconWrap = document.createElement('span');
  iconWrap.className = 'highlight-label-icon';
  iconWrap.innerHTML = sanitizeIconHtml(beforeIcon);
  const svg = iconWrap.querySelector('svg');
  if (svg) {
    svg.removeAttribute('width');
    svg.removeAttribute('height');
  }

  const size = normalizeSize(style?.iconSize);
  iconWrap.style.width = size;
  iconWrap.style.height = size;
  applyIconStyle(iconWrap, style);
  labelEl.appendChild(iconWrap);
}

const LABEL_SIDE_OUTLINE_CLASS = 'label-side-outline';

function getLabelSideOutline(el: HTMLElement): HTMLElement | undefined {
  return Array.from(el.children).find((child) =>
    (child as HTMLElement).classList.contains(LABEL_SIDE_OUTLINE_CLASS)
  ) as HTMLElement | undefined;
}

export function applyBaseOutlineStyle(
  el: HTMLElement,
  style: Partial<HighlightStyle & HighlightLabelStyle> | undefined
): void {
  el.style.outline = style?.outline ?? '';
  el.style.outlineOffset = '';
}

export function applyLabelOutlineStyle(
  el: HTMLElement,
  style: Partial<HighlightLabelStyle> | undefined
): void {
  applyBaseOutlineStyle(el, style);

  const existingSideOutline = getLabelSideOutline(el);
  if (!style?.outline || !style?.outlineRight) {
    existingSideOutline?.remove();
    return;
  }

  el.style.outline = '';
  el.style.outlineOffset = '';

  const sideOutline = existingSideOutline ?? document.createElement('span');
  if (!el.style.position) {
    el.style.position = 'relative';
  }
  sideOutline.className = LABEL_SIDE_OUTLINE_CLASS;
  sideOutline.style.position = 'absolute';
  sideOutline.style.top = '0';
  sideOutline.style.right = '0';
  sideOutline.style.bottom = '0';
  sideOutline.style.left = '0';
  sideOutline.style.pointerEvents = 'none';
  sideOutline.style.boxSizing = 'border-box';
  const baseSideOutline = style?.outline ?? '';
  sideOutline.style.borderTop = baseSideOutline;
  sideOutline.style.borderRight = style.outlineRight;
  sideOutline.style.borderBottom = baseSideOutline;
  sideOutline.style.borderLeft = baseSideOutline;
  sideOutline.style.borderRadius = style?.borderRadius ?? '';
  sideOutline.style.zIndex = '1';

  if (!existingSideOutline) {
    el.prepend(sideOutline);
  }
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
