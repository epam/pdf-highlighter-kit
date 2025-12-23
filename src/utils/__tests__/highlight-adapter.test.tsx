import { describe, expect, test } from 'vitest';
import { buildHighlightsIndex } from '../highlight-adapter';

interface BBoxInput {
  page: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
interface InputHighlightData {
  id: string;
  bboxes: BBoxInput[];
}

describe('Utils :: buildHighlightsIndex', () => {
  test('returns empty structures for empty input', () => {
    const input: InputHighlightData[] = [];
    const index = buildHighlightsIndex(input);

    expect(index.highlights).toEqual([]);
    expect(index.byId.size).toBe(0);
    expect(index.occurrences.length).toBe(0);
    expect(Object.keys(index.pages)).toEqual([]);
  });

  test('indexes by id and preserves original object reference in byId', () => {
    const h1: InputHighlightData = {
      id: 'a',
      bboxes: [{ page: 1, x1: 0, y1: 10, x2: 5, y2: 15 }],
    };
    const h2: InputHighlightData = {
      id: 'b',
      bboxes: [{ page: 2, x1: 0, y1: 10, x2: 5, y2: 15 }],
    };
    const index = buildHighlightsIndex([h1, h2]);

    expect(index.byId.get('a')).toBe(h1);
    expect(index.byId.get('b')).toBe(h2);
    expect(index.byId.size).toBe(2);
  });

  test('groups occurrences by page with string keys and sorts within each page', () => {
    const input: InputHighlightData[] = [
      {
        id: 'x',
        bboxes: [
          { page: 1, x1: 10, y1: 50, x2: 20, y2: 60 },
          { page: 1, x1: 0, y1: 40, x2: 5, y2: 45 },
        ],
      },
      {
        id: 'y',
        bboxes: [
          { page: 2, x1: 5, y1: 100, x2: 15, y2: 110 },
          { page: 1, x1: 1, y1: 40, x2: 6, y2: 46 },
        ],
      },
    ];

    const index = buildHighlightsIndex(input);

    const pageKeys = Object.keys(index.pages).sort();
    expect(pageKeys).toEqual(['1', '2']);

    const page1 = index.pages['1'];
    expect(page1.length).toBe(3);

    expect(page1[0].bbox.y1).toBe(40);
    expect(page1[0].bbox.x1).toBe(0);

    expect(page1[1].bbox.y1).toBe(40);
    expect(page1[1].bbox.x1).toBe(1);

    expect(page1[2].bbox.y1).toBe(50);
    expect(page1[2].bbox.x1).toBe(10);

    const page2 = index.pages['2'];
    expect(page2.length).toBe(1);
    expect(page2[0].page).toBe(2);
    expect(page2[0].bbox.y1).toBe(100);
  });

  test('global occurrences are sorted by page, then y1, then x1', () => {
    const input: InputHighlightData[] = [
      {
        id: 'a',
        bboxes: [
          { page: 2, x1: 10, y1: 100, x2: 20, y2: 110 },
          { page: 1, x1: 5, y1: 50, x2: 15, y2: 60 },
        ],
      },
      {
        id: 'b',
        bboxes: [
          { page: 1, x1: 0, y1: 40, x2: 10, y2: 50 },
          { page: 1, x1: 1, y1: 40, x2: 11, y2: 51 },
        ],
      },
    ];

    const index = buildHighlightsIndex(input);

    const occ = index.occurrences;
    expect(occ.length).toBe(4);

    expect(occ[0].page).toBe(1);
    expect(occ[0].bbox.y1).toBe(40);
    expect(occ[0].bbox.x1).toBe(0);

    expect(occ[1].page).toBe(1);
    expect(occ[1].bbox.y1).toBe(40);
    expect(occ[1].bbox.x1).toBe(1);

    expect(occ[2].page).toBe(1);
    expect(occ[2].bbox.y1).toBe(50);
    expect(occ[2].bbox.x1).toBe(5);

    expect(occ[3].page).toBe(2);
    expect(occ[3].bbox.y1).toBe(100);
    expect(occ[3].bbox.x1).toBe(10);
  });

  test('bbox is copied (immutable) and not affected by subsequent input mutations', () => {
    const input: InputHighlightData[] = [
      {
        id: 'immutable',
        bboxes: [{ page: 3, x1: 7, y1: 77, x2: 17, y2: 87 }],
      },
    ];

    const index = buildHighlightsIndex(input);

    input[0].bboxes[0].x1 = 999;
    input[0].bboxes[0].y1 = 888;

    const ref = index.occurrences.find((r) => r.id === 'immutable' && r.bboxIndex === 0);
    expect(ref).toBeTruthy();
    expect(ref!.bbox.x1).toBe(7);
    expect(ref!.bbox.y1).toBe(77);
  });

  test('bboxIndex corresponds to index within highlight bboxes array', () => {
    const input: InputHighlightData[] = [
      {
        id: 'multi',
        bboxes: [
          { page: 1, x1: 0, y1: 0, x2: 1, y2: 1 },
          { page: 1, x1: 2, y1: 2, x2: 3, y2: 3 },
          { page: 2, x1: 4, y1: 4, x2: 5, y2: 5 },
        ],
      },
    ];

    const index = buildHighlightsIndex(input);

    const refs = index.occurrences
      .filter((r) => r.id === 'multi')
      .sort((a, b) => a.bboxIndex - b.bboxIndex);
    expect(refs.map((r) => r.bboxIndex)).toEqual([0, 1, 2]);
    expect(refs[0].page).toBe(1);
    expect(refs[1].page).toBe(1);
    expect(refs[2].page).toBe(2);
  });
});
