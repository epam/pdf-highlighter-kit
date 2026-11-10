import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFHighlightViewer } from '../PDFHighlightViewer';
import { ViewportManager } from '../core/viewport-manager';
import { ZoomMode, type ZoomValue } from '../types';

/* Model real layout: page sizes change with zoom, but padding and gaps do not. */
const createViewer = (
  heights = [1000, 1000, 1000, 1000, 1000, 1000],
  pages = heights.map((_, i) => i + 1)
) => {
  const viewer = new PDFHighlightViewer();
  const internals = viewer as unknown as {
    container: HTMLElement;
    documentNumPages: number;
    totalPages: number;
    selectedPages: number[] | null;
    pageContainers: Map<number, HTMLElement>;
    viewportManager: ViewportManager;
    handleScroll(): void;
    reRenderVisiblePages(previousScale?: number): Promise<void>;
  };
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientHeight', { value: 600 });
  internals.container = container;
  internals.documentNumPages = Math.max(...pages);
  internals.totalPages = pages.length;
  internals.selectedPages = pages;
  internals.viewportManager.setTotalPages(Math.max(...pages));
  internals.viewportManager.setSelectedPages(pages);
  internals.viewportManager.updateDimensions(600, heights[0]);
  for (const [index, page] of pages.entries()) {
    const element = document.createElement('div');
    element.style.height = `${heights[index]}px`;
    Object.defineProperties(element, {
      offsetHeight: { get: () => parseFloat(element.style.height) },
      offsetTop: {
        get: () =>
          20 +
          pages
            .slice(0, index)
            .reduce((sum, p) => sum + internals.pageContainers.get(p)!.offsetHeight + 20, 0),
      },
    });
    internals.pageContainers.set(page, element);
  }
  vi.spyOn(viewer as never, 'getPageDimensions').mockImplementation((async (page: number) => ({
    width: (800 * viewer.getZoom()) / 1.5,
    height: (heights[pages.indexOf(page)] * viewer.getZoom()) / 1.5,
  })) as never);
  vi.spyOn(viewer as never, 'renderPage').mockResolvedValue(undefined as never);
  const rerender = vi.spyOn(internals, 'reRenderVisiblePages');
  const zoom = async (scale?: ZoomValue) => {
    if (scale === undefined) viewer.zoomIn();
    else viewer.setZoom(scale);
    await Promise.resolve();
    await rerender.mock.results.at(-1)!.value;
  };
  return { viewer, internals, container, zoom };
};

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('zoom scroll position', () => {
  it('disables browser scroll anchoring in the managed PDF viewport', async () => {
    const viewer = new PDFHighlightViewer();
    const container = document.createElement('div');
    try {
      await viewer.init(container);
      expect(container.style.overflowAnchor).toBe('none');
    } finally {
      viewer.destroy();
    }
  });

  it('keeps a cited page when a small tail of the previous page is visible', async () => {
    const { viewer, internals, container, zoom } = createViewer();
    const bbox = { page: 5, x1: 0, y1: 0, x2: 100, y2: 20 };
    vi.spyOn(viewer as never, 'getHighlightById').mockReturnValue({ bboxes: [bbox] } as never);
    vi.spyOn(viewer as never, 'normalizeBBoxForPage').mockReturnValue(bbox as never);
    viewer.goToHighlight('citation');
    await Promise.resolve();
    expect(container.scrollTop).toBe(internals.pageContainers.get(5)!.offsetTop - 60);
    internals.handleScroll();
    expect(viewer.getCurrentPage()).toBe(5);
    await zoom();
    expect(container.scrollTop).toBe(internals.pageContainers.get(5)!.offsetTop - 60);
  });

  it('uses actual page bounds for documents with mixed page heights', async () => {
    const { viewer, internals, container, zoom } = createViewer([1000, 700, 800, 900, 1000, 1000]);
    viewer.setPage(5);
    internals.handleScroll();
    expect(viewer.getCurrentPage()).toBe(5);
    await zoom(1.8);
    expect(container.scrollTop).toBe(internals.pageContainers.get(5)!.offsetTop);
  });

  it('preserves the position within the page when zooming in and out', async () => {
    const { viewer, internals, container, zoom } = createViewer();
    viewer.setPage(5);
    container.scrollTop += 250;
    await zoom(1.8);
    expect(container.scrollTop).toBeCloseTo(internals.pageContainers.get(5)!.offsetTop + 300);
    await zoom(1.5);
    expect(container.scrollTop).toBeCloseTo(internals.pageContainers.get(5)!.offsetTop + 250);
  });

  it('captures the visible page even before the debounced scroll handler runs', async () => {
    const { internals, container, zoom } = createViewer();
    container.scrollTop = internals.pageContainers.get(5)!.offsetTop + 100;
    await zoom(1.8);
    expect(container.scrollTop).toBeCloseTo(internals.pageContainers.get(5)!.offsetTop + 120);
  });

  it('supports a subset of physical pages', async () => {
    const { viewer, internals, container, zoom } = createViewer([1000, 700, 1000], [2, 5, 9]);
    viewer.setPage(9);
    internals.handleScroll();
    expect(viewer.getCurrentPage()).toBe(9);
    await zoom(1.8);
    expect(container.scrollTop).toBe(internals.pageContainers.get(9)!.offsetTop);
  });

  it('keeps the auto-zoom reading position through repeated zoom-out and zoom-in cycles', async () => {
    const { viewer, internals, container, zoom } = createViewer();
    vi.spyOn(viewer as never, 'computeFitScales').mockResolvedValue({
      scaleX: 1.2,
      scaleY: 1,
    } as never);
    await zoom(ZoomMode.AUTO);
    viewer.setPage(5);
    container.scrollTop += 400;
    const originalTop = container.scrollTop;
    for (let cycle = 0; cycle < 4; cycle++) {
      for (const scale of [1, 0.5, 1, 1.2]) {
        await zoom(scale);
        internals.handleScroll();
      }
      expect(container.scrollTop).toBeCloseTo(originalTop);
    }
  });

  it('uses the new reading position after the user scrolls between zooms', async () => {
    const { viewer, internals, container, zoom } = createViewer();
    viewer.setPage(5);
    await zoom(1);
    container.scrollTop = internals.pageContainers.get(3)!.offsetTop + 100;
    await zoom(1.5);
    expect(container.scrollTop).toBeCloseTo(internals.pageContainers.get(3)!.offsetTop + 150);
  });

  it('keeps the anchor when another zoom starts while page sizes are still changing', async () => {
    const { viewer, container, zoom } = createViewer();
    viewer.setPage(5);
    container.scrollTop += 400;
    const originalTop = container.scrollTop;
    const firstZoom = zoom(0.75);
    await Promise.resolve();
    const secondZoom = zoom(1.5);
    await Promise.all([firstZoom, secondZoom]);
    expect(container.scrollTop).toBeCloseTo(originalTop);
  });

  it('does not accumulate rounding error across zoom cycles', async () => {
    const { viewer, container, zoom } = createViewer();
    let roundedScrollTop = 0;
    Object.defineProperty(container, 'scrollTop', {
      get: () => roundedScrollTop,
      set: (value: number) => {
        roundedScrollTop = Math.round(value);
      },
    });
    viewer.setPage(5);
    container.scrollTop += 251;
    const originalTop = container.scrollTop;
    for (let cycle = 0; cycle < 5; cycle++) {
      await zoom(1.1);
      await zoom(0.5);
      await zoom(1.5);
      expect(container.scrollTop).toBe(originalTop);
    }
  });

  it('replaces the zoom anchor after explicit page navigation', async () => {
    const { viewer, internals, container, zoom } = createViewer();
    viewer.setPage(5);
    await zoom(1);
    viewer.setPage(2);
    await zoom(1.5);
    expect(container.scrollTop).toBe(internals.pageContainers.get(2)!.offsetTop);
  });

  it('keeps the old page layout and content until all new dimensions are ready', async () => {
    const { viewer, internals, container, zoom } = createViewer();
    viewer.setPage(5);
    const oldTop = container.scrollTop;
    const page = internals.pageContainers.get(5)!;
    const canvas = document.createElement('canvas');
    page.appendChild(canvas);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(viewer as never, 'getPageDimensions').mockImplementation((async (number: number) => {
      if (number === 6) await pending;
      return { width: 960, height: 1200 };
    }) as never);
    const changing = zoom(1.8);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(container.scrollTop).toBe(oldTop);
    expect(internals.pageContainers.get(1)!.style.height).toBe('1000px');
    expect(page.contains(canvas)).toBe(true);
    release();
    await changing;
    expect(page.contains(canvas)).toBe(true);
    expect(page.style.height).toBe('1200px');
    expect(container.scrollTop).toBe(page.offsetTop);
  });

  it('keeps a citation near the page bottom at the same screen position through zoom cycles', async () => {
    const { viewer, internals, container, zoom } = createViewer();
    const bbox = { page: 5, x1: 40, y1: 580, x2: 200, y2: 600 };
    vi.spyOn(viewer as never, 'getHighlightById').mockReturnValue({ bboxes: [bbox] } as never);
    vi.spyOn(viewer as never, 'normalizeBBoxForPage').mockReturnValue(bbox as never);
    viewer.goToHighlight('bottom-citation');
    await Promise.resolve();
    internals.handleScroll();
    /* The next page occupies more of the viewport, but is not the navigation target. */
    expect(viewer.getCurrentPage()).toBe(6);
    for (const scale of [1, 0.75, 1, 1.5, 2, 3]) {
      await zoom(scale);
      internals.handleScroll();
      const citationTop = internals.pageContainers.get(5)!.offsetTop + bbox.y1 * scale;
      expect(citationTop - container.scrollTop).toBeCloseTo(60);
    }
  });

  it('releases the citation anchor after manual scrolling', async () => {
    const { viewer, internals, container, zoom } = createViewer();
    const bbox = { page: 5, x1: 40, y1: 580, x2: 200, y2: 600 };
    vi.spyOn(viewer as never, 'getHighlightById').mockReturnValue({ bboxes: [bbox] } as never);
    vi.spyOn(viewer as never, 'normalizeBBoxForPage').mockReturnValue(bbox as never);
    viewer.goToHighlight('bottom-citation');
    await Promise.resolve();
    await zoom(1);
    container.scrollTop = internals.pageContainers.get(2)!.offsetTop + 100;
    await zoom(1.5);
    expect(container.scrollTop).toBeCloseTo(internals.pageContainers.get(2)!.offsetTop + 150);
  });

  it('replaces the previous citation anchor on a new citation', async () => {
    const { viewer, internals, container, zoom } = createViewer();
    const bbox = { page: 5, x1: 40, y1: 580, x2: 200, y2: 600 };
    vi.spyOn(viewer as never, 'getHighlightById').mockImplementation(
      () => ({ bboxes: [bbox] }) as never
    );
    vi.spyOn(viewer as never, 'normalizeBBoxForPage').mockImplementation(() => bbox as never);
    viewer.goToHighlight('first');
    await Promise.resolve();
    await zoom(1);
    bbox.page = 3;
    bbox.y1 = 400;
    viewer.goToHighlight('second');
    await Promise.resolve();
    await zoom(2);
    expect(internals.pageContainers.get(3)!.offsetTop + 800 - container.scrollTop).toBeCloseTo(60);
  });

  it('preserves the target screen position after coordinate navigation', async () => {
    const { viewer, internals, container, zoom } = createViewer();
    vi.spyOn(viewer as never, 'normalizeBBoxForPage').mockReturnValue({
      x1: 40,
      y1: 620,
      x2: 40,
      y2: 620,
    } as never);
    viewer.goToCoordinate(5, 40, 620);
    await zoom(3);
    expect(internals.pageContainers.get(5)!.offsetTop + 620 * 3 - container.scrollTop).toBeCloseTo(
      600 * 0.3
    );
  });
});
