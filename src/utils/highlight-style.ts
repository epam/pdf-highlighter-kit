import type { HighlightStyle } from '../types';

export type ResolvedHighlightStyle = Pick<
  HighlightStyle,
  'backgroundColor' | 'borderColor' | 'borderWidth'
>;

export function applyHighlightVisualStyle(
  element: HTMLElement,
  resolvedStyle: ResolvedHighlightStyle
): void {
  element.style.position = 'absolute';
  element.style.left = '0';
  element.style.top = '0';
  element.style.right = '0';
  element.style.bottom = '0';
  element.style.pointerEvents = 'none';
  element.style.boxSizing = 'border-box';
  element.style.mixBlendMode = 'multiply';
  element.style.backgroundColor = resolvedStyle.backgroundColor;
  element.style.border = `${resolvedStyle.borderWidth} solid ${resolvedStyle.borderColor}`;
}

export function resolveHighlightStyle(
  style?: HighlightStyle,
  fallbackBackgroundColor = '#666666'
): ResolvedHighlightStyle {
  const backgroundColor = style?.backgroundColor ?? fallbackBackgroundColor;
  const borderColor = style?.borderColor ?? backgroundColor;
  const borderWidth = style?.borderWidth ?? '1px';

  return {
    backgroundColor,
    borderColor,
    borderWidth,
  };
}

export function getHighlightBaseOpacity(style?: HighlightStyle): number {
  return typeof style?.opacity === 'number' ? style.opacity : 0.3;
}

export function getHighlightHoverOpacity(
  style: HighlightStyle | undefined,
  baseOpacity: number
): number {
  return typeof style?.hoverOpacity === 'number'
    ? style.hoverOpacity
    : Math.min(0.6, baseOpacity + 0.2);
}
