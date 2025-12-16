import {
  TextContent,
  HighlightData,
  Segment,
  AnalysisResult,
  BoundingBox,
  TermOccurrence,
  TextItem,
} from '../types';

export class UnifiedLayerBuilder {
  private pageContainer: HTMLElement | null = null;
  private unifiedLayer: HTMLElement | null = null;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  constructor() {}

  async buildUnifiedLayer(
    pageContainer: HTMLElement,
    textContent: TextContent,
    highlights: HighlightData,
    pageNumber: number,
    scale = 1.5
  ): Promise<HTMLElement> {
    this.pageContainer = pageContainer;

    const analysis = this.analyzeContent(textContent, highlights, pageNumber);

    const segments = this.segmentTextWithHighlights(textContent, highlights, pageNumber);

    const unifiedLayer = this.buildDOM(segments, scale);

    this.positionLayer(unifiedLayer, pageContainer);

    this.unifiedLayer = unifiedLayer;
    return unifiedLayer;
  }

  private analyzeContent(
    textContent: TextContent,
    highlights: HighlightData,
    pageNumber: number
  ): AnalysisResult {
    const highlightRanges: {
      start: number;
      end: number;
      termId: string;
      category: string;
      coordinates: BoundingBox;
    }[] = [];

    Object.entries(highlights).forEach(([category, categoryData]) => {
      const pageHighlights = categoryData.pages[pageNumber.toString()];
      if (pageHighlights) {
        pageHighlights.forEach((occurrence) => {
          occurrence.coordinates.forEach((coord) => {
            const intersectingItems = this.findIntersectingTextItems(textContent.items, coord);
            intersectingItems.forEach(({ item, startIndex, endIndex }) => {
              highlightRanges.push({
                start: startIndex,
                end: endIndex,
                termId: occurrence.termId,
                category,
                coordinates: coord,
              });
            });
          });
        });
      }
    });

    highlightRanges.sort((a, b) => a.start - b.start);

    return {
      segments: [],
      highlightRanges,
    };
  }

  private findIntersectingTextItems(
    textItems: TextItem[],
    coordinates: BoundingBox
  ): { item: TextItem; startIndex: number; endIndex: number; itemIndex: number }[] {
    const intersecting: {
      item: TextItem;
      startIndex: number;
      endIndex: number;
      itemIndex: number;
    }[] = [];
    let globalIndex = 0;

    textItems.forEach((item, itemIndex) => {
      const itemBounds = this.getTextItemBounds(item);

      if (this.boundsIntersect(itemBounds, coordinates)) {
        intersecting.push({
          item,
          startIndex: globalIndex,
          endIndex: globalIndex + item.str.length,
          itemIndex,
        });
      }

      globalIndex += item.str.length;
    });

    return intersecting;
  }

  private getTextItemBounds(item: TextItem): BoundingBox {
    const transform = item.transform;
    const x = transform[4];
    const y = transform[5];

    return {
      x1: x,
      y1: y - item.height,
      x2: x + item.width,
      y2: y,
    };
  }

  private boundsIntersect(bounds1: BoundingBox, bounds2: BoundingBox): boolean {
    return !(
      bounds1.x2 < bounds2.x1 ||
      bounds1.x1 > bounds2.x2 ||
      bounds1.y2 < bounds2.y1 ||
      bounds1.y1 > bounds2.y2
    );
  }

  private segmentTextWithHighlights(
    textContent: TextContent,
    highlights: HighlightData,
    pageNumber: number
  ): Segment[] {
    const segments: Segment[] = [];
    const analysis = this.analyzeContent(textContent, highlights, pageNumber);

    textContent.items.forEach((textItem, itemIndex) => {
      const itemBounds = this.getTextItemBounds(textItem);

      const itemHighlights = this.getHighlightsForTextItem(
        textItem,
        itemBounds,
        highlights,
        pageNumber
      );

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
    textItem: TextItem,
    itemBounds: BoundingBox,
    highlights: HighlightData,
    pageNumber: number
  ): { termId: string; category: string; coordinates: BoundingBox }[] {
    const itemHighlights: { termId: string; category: string; coordinates: BoundingBox }[] = [];

    Object.entries(highlights).forEach(([category, categoryData]) => {
      const pageHighlights = categoryData.pages[pageNumber.toString()];
      if (pageHighlights) {
        pageHighlights.forEach((occurrence) => {
          occurrence.coordinates.forEach((coord) => {
            if (this.boundsIntersect(itemBounds, coord)) {
              itemHighlights.push({
                termId: occurrence.termId,
                category,
                coordinates: coord,
              });
            }
          });
        });
      }
    });

    return itemHighlights;
  }

  private createHighlightedSegments(
    textItem: TextItem,
    itemHighlights: { termId: string; category: string; coordinates: BoundingBox }[]
  ): Segment[] {
    const segments: Segment[] = [];
    const itemBounds = this.getTextItemBounds(textItem);

    const primaryHighlight = itemHighlights[0];

    segments.push({
      text: textItem.str,
      bounds: itemBounds,
      hasHighlight: true,
      highlightInfo: {
        termId: primaryHighlight.termId,
        category: primaryHighlight.category,
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
    if (segment1.hasHighlight !== segment2.hasHighlight) {
      return false;
    }

    if (segment1.hasHighlight && segment2.hasHighlight) {
      return (
        segment1.highlightInfo?.category === segment2.highlightInfo?.category &&
        segment1.highlightInfo?.termId === segment2.highlightInfo?.termId
      );
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

    const fragment = document.createDocumentFragment();
    const batch: HTMLElement[] = [];

    segments.forEach((segment, index) => {
      const element = segment.hasHighlight
        ? this.createHighlightElement(segment, scale)
        : this.createTextElement(segment, scale);

      batch.push(element);

      if (batch.length >= 100) {
        batch.forEach((el) => fragment.appendChild(el));
        batch.length = 0;
      }
    });

    batch.forEach((el) => fragment.appendChild(el));

    unifiedLayer.appendChild(fragment);
    return unifiedLayer;
  }

  private createTextElement(segment: Segment, scale: number): HTMLElement {
    const span = document.createElement('span');
    span.className = 'text-segment';
    span.textContent = segment.text;

    this.applyTextPositioning(span, segment, scale);

    return span;
  }

  private createHighlightElement(segment: Segment, scale: number): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = `highlight-wrapper ${segment.highlightInfo?.category}-highlight`;
    wrapper.setAttribute('data-term-id', segment.highlightInfo?.termId || '');

    const textSpan = document.createElement('span');
    textSpan.className = 'text-segment selectable';
    textSpan.textContent = segment.text;

    const background = document.createElement('span');
    background.className = 'highlight-background';

    wrapper.appendChild(textSpan);
    wrapper.appendChild(background);

    this.applyTextPositioning(wrapper, segment, scale);

    return wrapper;
  }

  private applyTextPositioning(element: HTMLElement, segment: Segment, scale: number): void {
    const transform = segment.transform;
    const x = transform[4] * scale;
    const y = transform[5] * scale;
    const scaleX = transform[0] * scale;
    const scaleY = transform[3] * scale;

    element.style.position = 'absolute';
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

    const style = document.createElement('style');
    style.textContent = `
      .unified-layer .text-segment,
      .unified-layer .highlight-wrapper {
        pointer-events: auto;
        cursor: pointer;
      }
      .unified-layer .highlight-wrapper {
        background-color: rgba(102, 126, 234, 0.15);
      }
      .unified-layer .highlight-wrapper:hover {
        background-color: rgba(102, 126, 234, 0.25);
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
        filter: brightness(0.4) contrast(0.6) saturate(0.3) grayscale(0.3) !important;
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

    pageContainer.appendChild(unifiedLayer);
  }

  updateHighlights(highlights: HighlightData, pageNumber: number, textContent?: TextContent): void {
    if (!this.unifiedLayer || !this.pageContainer) {
      throw new Error('Unified layer not initialized');
    }

    if (textContent) {
      this.buildUnifiedLayer(this.pageContainer, textContent, highlights, pageNumber);
    } else {
      this.updateExistingHighlights(highlights, pageNumber);
    }
  }

  private updateExistingHighlights(highlights: HighlightData, pageNumber: number): void {
    if (!this.unifiedLayer) return;

    const existingHighlights = this.unifiedLayer.querySelectorAll('.highlight-wrapper');
    existingHighlights.forEach((highlight) => {
      highlight.classList.remove(
        ...Array.from(highlight.classList).filter((cls) => cls.endsWith('-highlight'))
      );
    });

    Object.entries(highlights).forEach(([category, categoryData]) => {
      const pageHighlights = categoryData.pages[pageNumber.toString()];
      if (pageHighlights) {
        pageHighlights.forEach((occurrence) => {
          const elements = this.unifiedLayer!.querySelectorAll(
            `[data-term-id="${occurrence.termId}"]`
          );
          elements.forEach((element) => {
            element.classList.add(`${category}-highlight`);
          });
        });
      }
    });
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
