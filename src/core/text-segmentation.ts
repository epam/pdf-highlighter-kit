import {
  TextContent,
  TextItem,
  BoundingBox,
  Segment,
  InputHighlightData,
  HighlightStyle,
} from '../types';

export interface SegmentationPoint {
  globalIndex: number;
  itemIndex: number;
  charIndex: number;
  reason: 'highlight-start' | 'highlight-end' | 'font-change' | 'line-break';
}

export interface HighlightRange {
  startIndex: number;
  endIndex: number;
  termId: string;
  coordinates: BoundingBox;
  priority: number; // Used to keep deterministic order when overlaps exist
  style?: HighlightStyle;
}

export class TextSegmentation {
  private debugMode = false;

  constructor(debugMode = false) {
    this.debugMode = debugMode;
  }

  /**
   * Split text items into segments based on highlight boundaries and typography changes.
   * Input highlights are provided as InputHighlightData[].
   */
  segmentText(
    textContent: TextContent,
    highlights: InputHighlightData[],
    pageNumber: number
  ): Segment[] {
    const characterIndex = this.buildCharacterIndex(textContent.items);

    const highlightRanges = this.mapHighlightsToCharacters(
      highlights,
      pageNumber,
      textContent.items
    );

    const segmentationPoints = this.findSegmentationPoints(textContent.items, highlightRanges);

    const segments = this.createSegments(
      textContent.items,
      characterIndex,
      segmentationPoints,
      highlightRanges
    );

    return this.optimizeSegments(segments);
  }

  private buildCharacterIndex(textItems: TextItem[]): {
    char: string;
    itemIndex: number;
    charIndex: number;
    globalIndex: number;
    bounds: BoundingBox;
  }[] {
    const index: {
      char: string;
      itemIndex: number;
      charIndex: number;
      globalIndex: number;
      bounds: BoundingBox;
    }[] = [];

    let globalIndex = 0;

    textItems.forEach((item, itemIndex) => {
      const itemBounds = this.getTextItemBounds(item);
      const charWidth = item.str.length > 0 ? item.width / item.str.length : 0;

      for (let charIndex = 0; charIndex < item.str.length; charIndex++) {
        const char = item.str[charIndex];

        const charBounds: BoundingBox = {
          x1: itemBounds.x1 + charIndex * charWidth,
          y1: itemBounds.y1,
          x2: itemBounds.x1 + (charIndex + 1) * charWidth,
          y2: itemBounds.y2,
        };

        index.push({
          char,
          itemIndex,
          charIndex,
          globalIndex,
          bounds: charBounds,
        });

        globalIndex++;
      }
    });

    return index;
  }

  private mapHighlightsToCharacters(
    highlights: InputHighlightData[],
    pageNumber: number,
    textItems: TextItem[]
  ): HighlightRange[] {
    const ranges: HighlightRange[] = [];

    highlights.forEach((highlight, highlightIndex) => {
      for (let bboxIndex = 0; bboxIndex < highlight.bboxes.length; bboxIndex++) {
        const bbox = highlight.bboxes[bboxIndex];
        if (bbox.page !== pageNumber) continue;

        const coord: BoundingBox = { x1: bbox.x1, y1: bbox.y1, x2: bbox.x2, y2: bbox.y2 };

        const textMatches = this.findTextMatchesForCoordinate(coord, textItems);

        textMatches.forEach((match) => {
          ranges.push({
            startIndex: match.startIndex,
            endIndex: match.endIndex,
            termId: highlight.id,
            coordinates: coord,
            style: highlight.style,
            priority: this.calculateHighlightPriority(highlightIndex, bboxIndex),
          });
        });
      }
    });

    ranges.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.startIndex - b.startIndex;
    });

    return this.resolveOverlappingHighlights(ranges);
  }

  private calculateHighlightPriority(highlightIndex: number, bboxIndex: number): number {
    // Deterministic ordering: earlier highlights win ties, earlier bboxes win ties.
    // Large base to keep values positive and comparable.
    return 1_000_000 - highlightIndex * 1_000 - bboxIndex;
  }

  private findTextMatchesForCoordinate(
    coord: BoundingBox,
    textItems: TextItem[]
  ): { startIndex: number; endIndex: number }[] {
    const matches: { startIndex: number; endIndex: number }[] = [];
    let globalIndex = 0;

    textItems.forEach((item) => {
      const itemBounds = this.getTextItemBounds(item);

      if (this.boundsIntersect(itemBounds, coord)) {
        const intersectionArea = this.calculateIntersectionArea(itemBounds, coord);
        const itemArea = (itemBounds.x2 - itemBounds.x1) * (itemBounds.y2 - itemBounds.y1);
        const overlapPercent = itemArea > 0 ? intersectionArea / itemArea : 0;

        if (overlapPercent > 0.5) {
          matches.push({
            startIndex: globalIndex,
            endIndex: globalIndex + item.str.length,
          });
        }
      }

      globalIndex += item.str.length;
    });

    return this.mergeAdjacentMatches(matches);
  }

  private calculateIntersectionArea(bounds1: BoundingBox, bounds2: BoundingBox): number {
    const left = Math.max(bounds1.x1, bounds2.x1);
    const right = Math.min(bounds1.x2, bounds2.x2);
    const top = Math.max(bounds1.y1, bounds2.y1);
    const bottom = Math.min(bounds1.y2, bounds2.y2);

    if (left >= right || top >= bottom) {
      return 0;
    }
    return (right - left) * (bottom - top);
  }

  private mergeAdjacentMatches(
    matches: { startIndex: number; endIndex: number }[]
  ): { startIndex: number; endIndex: number }[] {
    if (matches.length <= 1) return matches;

    const sorted = [...matches].sort((a, b) => a.startIndex - b.startIndex);
    const merged: { startIndex: number; endIndex: number }[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const last = merged[merged.length - 1];
      const current = sorted[i];

      if (current.startIndex <= last.endIndex + 1) {
        last.endIndex = Math.max(last.endIndex, current.endIndex);
      } else {
        merged.push(current);
      }
    }

    return merged;
  }

  private resolveOverlappingHighlights(ranges: HighlightRange[]): HighlightRange[] {
    const resolved: HighlightRange[] = [];

    for (const range of ranges) {
      const overlapping = resolved.filter((existing) => this.rangesOverlap(range, existing));

      if (overlapping.length === 0) {
        resolved.push(range);
      } else {
        const splitRanges = this.splitRangeAroundOverlaps(range, overlapping);
        resolved.push(...splitRanges);
      }
    }

    return resolved;
  }

  private rangesOverlap(range1: HighlightRange, range2: HighlightRange): boolean {
    return !(range1.endIndex <= range2.startIndex || range1.startIndex >= range2.endIndex);
  }

  private splitRangeAroundOverlaps(
    range: HighlightRange,
    overlapping: HighlightRange[]
  ): HighlightRange[] {
    const points = new Set<number>([range.startIndex, range.endIndex]);
    overlapping.forEach((o) => {
      points.add(o.startIndex);
      points.add(o.endIndex);
    });

    const sorted = Array.from(points).sort((a, b) => a - b);
    const result: HighlightRange[] = [];

    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];

      if (a >= range.startIndex && b <= range.endIndex && a < b) {
        result.push({ ...range, startIndex: a, endIndex: b });
      }
    }

    return result;
  }

  private findSegmentationPoints(
    textItems: TextItem[],
    highlightRanges: HighlightRange[]
  ): SegmentationPoint[] {
    const points: SegmentationPoint[] = [
      { globalIndex: 0, itemIndex: 0, charIndex: 0, reason: 'line-break' },
    ];

    // highlight boundary points
    highlightRanges.forEach((range) => {
      points.push({
        globalIndex: range.startIndex,
        itemIndex: 0,
        charIndex: 0,
        reason: 'highlight-start',
      });
      points.push({
        globalIndex: range.endIndex,
        itemIndex: 0,
        charIndex: 0,
        reason: 'highlight-end',
      });
    });

    let globalIndex = 0;
    for (let itemIndex = 0; itemIndex < textItems.length; itemIndex++) {
      const item = textItems[itemIndex];

      if (itemIndex > 0) {
        const prev = textItems[itemIndex - 1];
        if (prev.fontName !== item.fontName) {
          points.push({ globalIndex, itemIndex, charIndex: 0, reason: 'font-change' });
        }

        // Heuristic: treat significant Y jump as a line break
        if (Math.abs(prev.transform[5] - item.transform[5]) > 3) {
          points.push({ globalIndex, itemIndex, charIndex: 0, reason: 'line-break' });
        }
      }

      globalIndex += item.str.length;
    }

    const unique = new Map<number, SegmentationPoint>();
    points.forEach((p) => {
      if (!unique.has(p.globalIndex)) unique.set(p.globalIndex, p);
    });

    return Array.from(unique.values()).sort((a, b) => a.globalIndex - b.globalIndex);
  }

  private createSegments(
    textItems: TextItem[],
    characterIndex: ReturnType<typeof this.buildCharacterIndex>,
    segmentationPoints: SegmentationPoint[],
    highlightRanges: HighlightRange[]
  ): Segment[] {
    const segments: Segment[] = [];

    for (let i = 0; i < segmentationPoints.length - 1; i++) {
      const startPoint = segmentationPoints[i];
      const endPoint = segmentationPoints[i + 1];

      const segment = this.createSegment(
        startPoint.globalIndex,
        endPoint.globalIndex,
        textItems,
        characterIndex,
        highlightRanges
      );

      if (segment) segments.push(segment);
    }

    return segments;
  }

  private createSegment(
    startIndex: number,
    endIndex: number,
    textItems: TextItem[],
    characterIndex: ReturnType<typeof this.buildCharacterIndex>,
    highlightRanges: HighlightRange[]
  ): Segment | null {
    if (startIndex >= endIndex || startIndex >= characterIndex.length) return null;

    const startChar = characterIndex[startIndex];

    let text = '';
    for (let i = startIndex; i < endIndex && i < characterIndex.length; i++) {
      text += characterIndex[i].char;
    }

    let bounds: BoundingBox = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
    for (let i = startIndex; i < endIndex && i < characterIndex.length; i++) {
      const b = characterIndex[i].bounds;
      bounds = {
        x1: Math.min(bounds.x1, b.x1),
        y1: Math.min(bounds.y1, b.y1),
        x2: Math.max(bounds.x2, b.x2),
        y2: Math.max(bounds.y2, b.y2),
      };
    }

    const overlappingHighlight = highlightRanges.find(
      (range) => startIndex >= range.startIndex && endIndex <= range.endIndex
    );

    const textItem = textItems[startChar.itemIndex];

    return {
      text,
      bounds,
      hasHighlight: !!overlappingHighlight,
      highlightInfo: overlappingHighlight
        ? {
            termId: overlappingHighlight.termId,
            style: overlappingHighlight.style,
          }
        : undefined,
      transform: textItem.transform,
      fontName: textItem.fontName,
    };
  }

  private optimizeSegments(segments: Segment[]): Segment[] {
    const optimized: Segment[] = [];
    let current: Segment | null = null;

    for (const segment of segments) {
      if (!current) {
        current = segment;
        continue;
      }

      if (this.canMergeSegments(current, segment)) {
        current = this.mergeSegments(current, segment);
      } else {
        optimized.push(current);
        current = segment;
      }
    }

    if (current) optimized.push(current);
    return optimized;
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

  private getTextItemBounds(item: TextItem): BoundingBox {
    const transform = item.transform;
    const x = transform[4];
    const y = transform[5];
    const height = item.height;

    return {
      x1: x,
      y1: y - height,
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
}
