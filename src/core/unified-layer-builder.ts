import {
  TextContent,
  Segment,
  BoundingBox,
  TextItem,
  InputHighlightData,
  HighlightStyle,
  HighlightLabelStyle,
} from '../types';

interface ItemHighlight {
  termId: string;
  coordinates: BoundingBox;
  style?: HighlightStyle;
  label?: string;
  labelStyle?: HighlightLabelStyle;
}

export class UnifiedLayerBuilder {
  private pageContainer: HTMLElement | null = null;
  private unifiedLayer: HTMLElement | null = null;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  constructor() {}

  buildUnifiedLayer(
    pageContainer: HTMLElement,
    textContent: TextContent,
    highlights: InputHighlightData[],
    pageNumber: number,
    scale = 1.5
  ): HTMLElement {
    this.pageContainer = pageContainer;

    const existing = pageContainer.querySelector('.unified-layer');
    if (existing) existing.remove();

    const segments = this.segmentTextWithHighlights(textContent, highlights, pageNumber);
    const unifiedLayer = this.buildDOM(segments, scale);

    this.positionLayer(unifiedLayer, pageContainer);

    this.unifiedLayer = unifiedLayer;
    return unifiedLayer;
  }

  updateHighlights(
    pageContainer: HTMLElement,
    highlights: InputHighlightData[],
    pageNumber: number,
    textContent: TextContent,
    scale = 1.5
  ): void {
    this.buildUnifiedLayer(pageContainer, textContent, highlights, pageNumber, scale);
  }

  private buildPageHighlights(
    highlights: InputHighlightData[],
    pageNumber: number
  ): ItemHighlight[] {
    const out: ItemHighlight[] = [];
    for (const h of highlights) {
      for (const b of h.bboxes) {
        if (b.page !== pageNumber) continue;
        out.push({
          termId: h.id,
          style: h.style,
          label: h.label,
          labelStyle: h.labelStyle,
          coordinates: { x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 },
        });
      }
    }
    return out;
  }

  private segmentTextWithHighlights(
    textContent: TextContent,
    highlights: InputHighlightData[],
    pageNumber: number
  ): Segment[] {
    const segments: Segment[] = [];
    const pageHighlights = this.buildPageHighlights(highlights, pageNumber);

    textContent.items.forEach((textItem) => {
      const itemBounds = this.getTextItemBounds(textItem);
      const itemHighlights = this.getHighlightsForTextItem(itemBounds, pageHighlights);

      if (itemHighlights.length === 0) {
        segments.push({
          text: textItem.str,
          bounds: itemBounds,
          hasHighlight: false,
          transform: textItem.transform,
          fontName: textItem.fontName,
        });
      } else {
        const highlightedSegments = this.createHighlightedSegments(textItem, itemHighlights);
        segments.push(...highlightedSegments);
      }
    });

    return this.mergeAdjacentSegments(segments);
  }

  private getHighlightsForTextItem(
    itemBounds: BoundingBox,
    pageHighlights: ItemHighlight[]
  ): ItemHighlight[] {
    const itemHighlights: ItemHighlight[] = [];
    for (const h of pageHighlights) {
      if (this.boundsIntersect(itemBounds, h.coordinates)) itemHighlights.push(h);
    }
    return itemHighlights;
  }

  private createHighlightedSegments(
    textItem: TextItem,
    itemHighlights: ItemHighlight[]
  ): Segment[] {
    const segments: Segment[] = [];
    const itemBounds = this.getTextItemBounds(textItem);

    const primary = itemHighlights[0];

    segments.push({
      text: textItem.str,
      bounds: itemBounds,
      hasHighlight: true,
      highlightInfo: {
        termId: primary.termId,
        style: primary.style,
        label: primary.label,
        labelStyle: primary.labelStyle,
      },
      transform: textItem.transform,
      fontName: textItem.fontName,
    });

    return segments;
  }

  private mergeAdjacentSegments(segments: Segment[]): Segment[] {
    if (segments.length <= 1) return segments;

    const merged: Segment[] = [];
    let current = segments[0];

    for (let i = 1; i < segments.length; i++) {
      const next = segments[i];

      if (this.canMergeSegments(current, next)) {
        current = this.mergeSegments(current, next);
      } else {
        merged.push(current);
        current = next;
      }
    }

    merged.push(current);
    return merged;
  }

  private canMergeSegments(segment1: Segment, segment2: Segment): boolean {
    if (segment1.hasHighlight !== segment2.hasHighlight) return false;

    if (segment1.hasHighlight && segment2.hasHighlight) {
      return segment1.highlightInfo?.termId === segment2.highlightInfo?.termId;
    }

    return segment1.fontName === segment2.fontName;
  }

  private mergeSegments(segment1: Segment, segment2: Segment): Segment {
    return {
      text: segment1.text + segment2.text,
      bounds: {
        x1: Math.min(segment1.bounds.x1, segment2.bounds.x1),
        y1: Math.min(segment1.bounds.y1, segment2.bounds.y1),
        x2: Math.max(segment1.bounds.x2, segment2.bounds.x2),
        y2: Math.max(segment1.bounds.y2, segment2.bounds.y2),
      },
      hasHighlight: segment1.hasHighlight,
      highlightInfo: segment1.highlightInfo,
      transform: segment1.transform,
      fontName: segment1.fontName,
    };
  }

  private buildDOM(segments: Segment[], scale: number): HTMLElement {
    const unifiedLayer = document.createElement('div');
    unifiedLayer.className = 'unified-layer';

    segments.forEach((segment) => {
      const el = segment.hasHighlight
        ? this.createHighlightElement(segment, scale)
        : this.createTextElement(segment, scale);
      unifiedLayer.appendChild(el);
    });

    return unifiedLayer;
  }

  private createTextElement(segment: Segment, scale: number): HTMLElement {
    const span = document.createElement('span');
    span.className = 'text-segment selectable';
    span.textContent = segment.text;

    this.applyTextPositioning(span, segment, scale);
    return span;
  }

  private createHighlightElement(segment: Segment, scale: number): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'highlight-wrapper';
    wrapper.setAttribute('data-term-id', segment.highlightInfo?.termId || '');

    // Label first (left of highlight), then inner container: background + text
    if (segment.highlightInfo?.label) {
      const labelEl = document.createElement('span');
      labelEl.className = 'highlight-label';
      labelEl.textContent = segment.highlightInfo.label;
      this.applyDefaultLabelStyle(labelEl, segment.highlightInfo.style);
      this.applyLabelStyle(labelEl, segment.highlightInfo.labelStyle);
      wrapper.appendChild(labelEl);
    }

    const inner = document.createElement('span');
    inner.style.position = 'relative';
    inner.style.display = 'inline';

    const background = document.createElement('span');
    background.className = 'highlight-background';
    background.style.position = 'absolute';
    background.style.left = '0';
    background.style.top = '0';
    background.style.right = '0';
    background.style.bottom = '0';
    background.style.pointerEvents = 'none';

    const textSpan = document.createElement('span');
    textSpan.className = 'text-segment selectable';
    textSpan.textContent = segment.text;
    textSpan.style.position = 'relative';
    textSpan.style.zIndex = '1';

    inner.appendChild(background);
    inner.appendChild(textSpan);
    wrapper.appendChild(inner);

    wrapper.style.display = 'inline-flex';
    wrapper.style.alignItems = 'baseline';
    wrapper.style.gap = '0';

    this.applyInlineHighlightStyle(background, segment.highlightInfo?.style);

    this.applyTextPositioning(wrapper, segment, scale);
    wrapper.style.position = 'absolute';
    wrapper.style.userSelect = 'text';

    return wrapper;
  }

  private applyDefaultLabelStyle(el: HTMLElement, highlightStyle?: HighlightStyle): void {
    const color = highlightStyle?.borderColor ?? highlightStyle?.backgroundColor ?? '#666666';
    el.style.border = `1px solid ${color}`;
  }

  private applyLabelStyle(el: HTMLElement, style?: HighlightLabelStyle): void {
    if (!style) return;
    if (style.fontSize != null)
      el.style.fontSize =
        typeof style.fontSize === 'number' ? `${style.fontSize}px` : String(style.fontSize);
    if (style.color != null) el.style.color = style.color;
    if (style.backgroundColor != null) el.style.backgroundColor = style.backgroundColor;
    if (style.padding != null) el.style.padding = style.padding;
    if (style.borderRadius != null) el.style.borderRadius = style.borderRadius;
    if (style.fontFamily != null) el.style.fontFamily = style.fontFamily;
    if (style.fontWeight != null) el.style.fontWeight = String(style.fontWeight);
    if (style.border != null) el.style.border = style.border;
    if (style.whiteSpace != null) el.style.whiteSpace = style.whiteSpace;
  }

  private applyInlineHighlightStyle(el: HTMLElement, style?: HighlightStyle): void {
    if (!style?.backgroundColor) return;

    const bg = style.backgroundColor;
    el.style.backgroundColor = bg;

    const borderColor = style.borderColor || bg;
    const borderWidth = style.borderWidth || '1px';
    el.style.border = `${borderWidth} solid ${borderColor}`;

    const baseOpacity = typeof style.opacity === 'number' ? style.opacity : 0.3;
    el.style.opacity = String(baseOpacity);
    el.dataset.baseOpacity = String(baseOpacity);

    const hoverOpacity =
      typeof style.hoverOpacity === 'number'
        ? style.hoverOpacity
        : Math.min(0.6, baseOpacity + 0.2);
    el.dataset.hoverOpacity = String(hoverOpacity);
  }

  private getTextItemBounds(item: TextItem): BoundingBox {
    // item.transform: [a, b, c, d, e, f]
    // e,f are translation; widths/heights are approximations based on item.width/height where available
    const x = item.transform[4];
    const y = item.transform[5];

    // Fallbacks (pdf.js items differ)
    const w = (item.width ?? 0) as number;
    const h = (item.height ?? 0) as number;

    return {
      x1: x,
      y1: y - h,
      x2: x + w,
      y2: y,
    };
  }

  private boundsIntersect(a: BoundingBox, b: BoundingBox): boolean {
    return !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2);
  }

  private applyTextPositioning(element: HTMLElement, segment: Segment, scale: number): void {
    const transform = segment.transform;
    const x = transform[4] * scale;
    const y = transform[5] * scale;
    const scaleX = transform[0] * scale;
    const scaleY = transform[3] * scale;

    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    element.style.transform = `scale(${scaleX}, ${scaleY})`;
    element.style.transformOrigin = '0% 0%';
    element.style.whiteSpace = 'pre';
    element.style.userSelect = 'text';
    element.style.color = 'transparent';
    element.style.fontFamily = segment.fontName;
    element.style.cursor = segment.hasHighlight ? 'pointer' : 'text';
  }

  private positionLayer(unifiedLayer: HTMLElement, pageContainer: HTMLElement): void {
    unifiedLayer.style.position = 'absolute';
    unifiedLayer.style.top = '0';
    unifiedLayer.style.left = '0';
    unifiedLayer.style.width = '100%';
    unifiedLayer.style.height = '100%';
    unifiedLayer.style.zIndex = '2';
    unifiedLayer.style.pointerEvents = 'auto';
    unifiedLayer.style.opacity = '1';

    const STYLE_ID = 'pdf-highlighter-unified-layer-style';
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        .unified-layer .text-segment,
        .unified-layer .highlight-wrapper {
          pointer-events: auto;
          cursor: pointer;
        }
        .highlight.selected-term,
        .unified-layer .highlight-wrapper.selected-term,
        div.highlight.selected-term,
        div.highlight-wrapper.selected-term {
          opacity: 1 !important;
          filter: brightness(2) contrast(1.5) saturate(2) !important;
          box-shadow: 0 0 0 3px rgba(255, 255, 255, 1), 0 0 10px rgba(255, 255, 0, 0.8), 0 0 20px rgba(255, 255, 0, 0.4) !important;
          z-index: 15 !important;
          transform: scale(1.1) !important;
          transition: all 0.3s ease !important;
          border-width: 3px !important;
          outline: 2px solid rgba(255, 255, 255, 0.9) !important;
          outline-offset: 1px !important;
        }
        .highlight.dimmed-highlight,
        .unified-layer .highlight-wrapper.dimmed-highlight,
        div.highlight.dimmed-highlight,
        div.highlight-wrapper.dimmed-highlight {
          opacity: 0.15 !important;
          filter: brightness(0.4) contrast(0.8) saturate(0.5) !important;
          transition: all 0.3s ease !important;
        }
        .highlight,
        .unified-layer .highlight-wrapper,
        div.highlight,
        div.highlight-wrapper {
          transition: all 0.3s ease;
        }
      `;
      document.head.appendChild(style);
    }

    pageContainer.appendChild(unifiedLayer);
  }

  clear(): void {
    if (this.unifiedLayer && this.unifiedLayer.parentNode) {
      this.unifiedLayer.parentNode.removeChild(this.unifiedLayer);
    }
    this.unifiedLayer = null;
    this.pageContainer = null;
  }

  getUnifiedLayer(): HTMLElement | null {
    return this.unifiedLayer;
  }
}
