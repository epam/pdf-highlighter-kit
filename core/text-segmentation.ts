import { TextContent, TextItem, BoundingBox, Segment, HighlightData } from '../types';

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
  category: string;
  coordinates: BoundingBox;
  priority: number; // For handling overlapping highlights
}

export class TextSegmentation {
  private debugMode = false;

  constructor(debugMode = false) {
    this.debugMode = debugMode;
  }

  segmentText(textContent: TextContent, highlights: HighlightData, pageNumber: number): Segment[] {
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

  private buildCharacterIndex(textItems: TextItem[]): Array<{
    char: string;
    itemIndex: number;
    charIndex: number;
    globalIndex: number;
    bounds: BoundingBox;
  }> {
    const index: Array<{
      char: string;
      itemIndex: number;
      charIndex: number;
      globalIndex: number;
      bounds: BoundingBox;
    }> = [];

    let globalIndex = 0;

    textItems.forEach((item, itemIndex) => {
      const itemBounds = this.getTextItemBounds(item);
      const charWidth = item.width / item.str.length;

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
    highlights: HighlightData,
    pageNumber: number,
    textItems: TextItem[]
  ): HighlightRange[] {
    const ranges: HighlightRange[] = [];

    Object.entries(highlights).forEach(([category, categoryData]) => {
      const pageHighlights = categoryData.pages[pageNumber.toString()];
      if (!pageHighlights) return;

      pageHighlights.forEach((occurrence, occIndex) => {
        occurrence.coordinates.forEach((coord, _coordIndex) => {
          const textMatches = this.findTextMatchesForCoordinate(coord, textItems);

          textMatches.forEach((match) => {
            ranges.push({
              startIndex: match.startIndex,
              endIndex: match.endIndex,
              termId: occurrence.termId,
              category,
              coordinates: coord,
              priority: this.calculateHighlightPriority(category, occIndex),
            });
          });
        });
      });
    });

    ranges.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.startIndex - b.startIndex;
    });

    return this.resolveOverlappingHighlights(ranges);
  }

  private findTextMatchesForCoordinate(
    coord: BoundingBox,
    textItems: TextItem[]
  ): Array<{ startIndex: number; endIndex: number }> {
    const matches: Array<{ startIndex: number; endIndex: number }> = [];
    let globalIndex = 0;

    textItems.forEach((item) => {
      const itemBounds = this.getTextItemBounds(item);

      if (this.boundsIntersect(itemBounds, coord)) {
        const intersectionArea = this.calculateIntersectionArea(itemBounds, coord);
        const itemArea = (itemBounds.x2 - itemBounds.x1) * (itemBounds.y2 - itemBounds.y1);
        const overlapPercent = intersectionArea / itemArea;

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
    matches: Array<{ startIndex: number; endIndex: number }>
  ): Array<{ startIndex: number; endIndex: number }> {
    if (matches.length <= 1) return matches;

    const merged: Array<{ startIndex: number; endIndex: number }> = [];
    let current = matches[0];

    for (let i = 1; i < matches.length; i++) {
      const next = matches[i];

      if (current.endIndex >= next.startIndex) {
        current.endIndex = Math.max(current.endIndex, next.endIndex);
      } else {
        merged.push(current);
        current = next;
      }
    }

    merged.push(current);
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
    const splits: HighlightRange[] = [];
    let currentStart = range.startIndex;

    overlapping.sort((a, b) => a.startIndex - b.startIndex);

    for (const overlap of overlapping) {
      if (currentStart < overlap.startIndex) {
        splits.push({
          ...range,
          startIndex: currentStart,
          endIndex: Math.min(range.endIndex, overlap.startIndex),
        });
      }

      currentStart = Math.max(currentStart, overlap.endIndex);
    }

    if (currentStart < range.endIndex) {
      splits.push({
        ...range,
        startIndex: currentStart,
        endIndex: range.endIndex,
      });
    }

    return splits.filter((split) => split.startIndex < split.endIndex);
  }

  private calculateHighlightPriority(category: string, occurrenceIndex: number): number {
    const categoryPriorities: Record<string, number> = {
      protein: 100,
      gene: 90,
      disease: 80,
      chemical: 70,
      species: 60,
      default: 50,
    };

    const basePriority = categoryPriorities[category] || categoryPriorities['default'];
    return basePriority - occurrenceIndex;
  }

  private findSegmentationPoints(
    textItems: TextItem[],
    highlightRanges: HighlightRange[]
  ): SegmentationPoint[] {
    const points: SegmentationPoint[] = [];
    let globalIndex = 0;

    textItems.forEach((item, itemIndex) => {
      if (itemIndex > 0) {
        points.push({
          globalIndex,
          itemIndex,
          charIndex: 0,
          reason: 'font-change',
        });
      }
      globalIndex += item.str.length;
    });

    highlightRanges.forEach((range) => {
      points.push({
        globalIndex: range.startIndex,
        itemIndex: this.getItemIndexForGlobalIndex(range.startIndex, textItems),
        charIndex: this.getCharIndexForGlobalIndex(range.startIndex, textItems),
        reason: 'highlight-start',
      });

      points.push({
        globalIndex: range.endIndex,
        itemIndex: this.getItemIndexForGlobalIndex(range.endIndex, textItems),
        charIndex: this.getCharIndexForGlobalIndex(range.endIndex, textItems),
        reason: 'highlight-end',
      });
    });

    points.sort((a, b) => a.globalIndex - b.globalIndex);
    return this.removeDuplicatePoints(points);
  }

  private getItemIndexForGlobalIndex(globalIndex: number, textItems: TextItem[]): number {
    let currentIndex = 0;
    for (let i = 0; i < textItems.length; i++) {
      if (globalIndex < currentIndex + textItems[i].str.length) {
        return i;
      }
      currentIndex += textItems[i].str.length;
    }
    return textItems.length - 1;
  }

  private getCharIndexForGlobalIndex(globalIndex: number, textItems: TextItem[]): number {
    let currentIndex = 0;
    for (let i = 0; i < textItems.length; i++) {
      if (globalIndex < currentIndex + textItems[i].str.length) {
        return globalIndex - currentIndex;
      }
      currentIndex += textItems[i].str.length;
    }
    return 0;
  }

  private removeDuplicatePoints(points: SegmentationPoint[]): SegmentationPoint[] {
    const unique: SegmentationPoint[] = [];
    let lastIndex = -1;

    for (const point of points) {
      if (point.globalIndex !== lastIndex) {
        unique.push(point);
        lastIndex = point.globalIndex;
      }
    }

    return unique;
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

      if (segment) {
        segments.push(segment);
      }
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
    if (startIndex >= endIndex || startIndex >= characterIndex.length) {
      return null;
    }

    const startChar = characterIndex[startIndex];
    const endIdx = Math.min(endIndex - 1, characterIndex.length - 1);
    const endChar = characterIndex[endIdx];

    const text = characterIndex
      .slice(startIndex, endIndex)
      .map((char) => char.char)
      .join('');

    const bounds: BoundingBox = {
      x1: startChar.bounds.x1,
      y1: Math.min(startChar.bounds.y1, endChar.bounds.y1),
      x2: endChar.bounds.x2,
      y2: Math.max(startChar.bounds.y2, endChar.bounds.y2),
    };

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
            category: overlappingHighlight.category,
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

    if (current) {
      optimized.push(current);
    }

    return optimized;
  }

  private canMergeSegments(segment1: Segment, segment2: Segment): boolean {
    if (segment1.hasHighlight !== segment2.hasHighlight) {
      return false;
    }

    if (segment1.hasHighlight && segment2.hasHighlight) {
      return (
        segment1.highlightInfo?.termId === segment2.highlightInfo?.termId &&
        segment1.highlightInfo?.category === segment2.highlightInfo?.category
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

  private getTextItemBounds(item: TextItem): BoundingBox {
    const transform = item.transform;
    return {
      x1: transform[4],
      y1: transform[5] - item.height,
      x2: transform[4] + item.width,
      y2: transform[5],
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
