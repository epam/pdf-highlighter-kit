import { InputHighlightData, HighlightsIndex, PageBBoxRef, BoundingBox } from '../types';

export function buildHighlightsIndex(highlights: InputHighlightData[]): HighlightsIndex {
  const byId = new Map<string, InputHighlightData>();
  const pages: Record<string, PageBBoxRef[]> = {};
  const occurrences: PageBBoxRef[] = [];

  for (const h of highlights) {
    byId.set(h.id, h);

    for (let bboxIndex = 0; bboxIndex < h.bboxes.length; bboxIndex++) {
      const b = h.bboxes[bboxIndex];

      const bbox: BoundingBox = { x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 };

      const ref: PageBBoxRef = {
        id: h.id,
        page: b.page,
        bboxIndex,
        bbox,
      };

      const key = String(b.page);
      (pages[key] ??= []).push(ref);
      occurrences.push(ref);
    }
  }

  const cmp = (a: PageBBoxRef, b: PageBBoxRef) =>
    a.page - b.page || a.bbox.y1 - b.bbox.y1 || a.bbox.x1 - b.bbox.x1;

  occurrences.sort(cmp);
  Object.keys(pages).forEach((k) => pages[k].sort(cmp));

  return { highlights, byId, pages, occurrences };
}
