import { describe, expect, it, vi } from 'vitest';
import { PDFHighlightViewer } from '../PDFHighlightViewer';

const PAGE_HEIGHT = 1000;

/*
 * Builds a viewer with three page containers and stubs the pieces that need a
 * loaded PDF, so `setPage` and the zoom re-render run without pdf.js.
 */
const createViewer = () => {
  const viewer = new PDFHighlightViewer();
  const internals = viewer as unknown as {
    container: HTMLElement;
    documentNumPages: number;
    totalPages: number;
    pageContainers: Map<number, HTMLElement>;
    reRenderVisiblePages: () => Promise<void>;
  };

  const container = document.createElement('div');
  internals.container = container;
  internals.documentNumPages = 3;
  internals.totalPages = 3;
  for (let page = 1; page <= 3; page++) {
    internals.pageContainers.set(page, document.createElement('div'));
  }

  vi.spyOn(viewer as never, 'getPageScrollTop').mockImplementation(
    ((page: number) => (page - 1) * PAGE_HEIGHT) as never
  );
  vi.spyOn(viewer as never, 'getPageDimensions').mockResolvedValue({
    width: 800,
    height: PAGE_HEIGHT,
  } as never);
  vi.spyOn(viewer as never, 'renderPage').mockResolvedValue(undefined as never);

  return { viewer, internals, container };
};

describe('setPage', () => {
  it('updates the current page and emits pageChanged without waiting for a scroll event', () => {
    const { viewer, container } = createViewer();
    const onPageChanged = vi.fn();
    viewer.addEventListener('pageChanged', onPageChanged);

    viewer.setPage(2);

    expect(container.scrollTop).toBe(PAGE_HEIGHT);
    expect(viewer.getCurrentPage()).toBe(2);
    expect(onPageChanged).toHaveBeenCalledTimes(1);
    expect(onPageChanged).toHaveBeenCalledWith({
      currentPage: 2,
      previousPage: 1,
      totalPages: 3,
    });
  });

  it('does not emit pageChanged when the page is already current', () => {
    const { viewer } = createViewer();
    const onPageChanged = vi.fn();
    viewer.addEventListener('pageChanged', onPageChanged);

    viewer.setPage(1);

    expect(onPageChanged).not.toHaveBeenCalled();
  });

  it('ignores a page outside the displayed list', () => {
    const { viewer } = createViewer();

    viewer.setPage(7);

    expect(viewer.getCurrentPage()).toBe(1);
  });

  it('keeps the requested page when a zoom re-render runs before the scroll event', async () => {
    const { viewer, internals, container } = createViewer();

    viewer.setPage(2);
    await internals.reRenderVisiblePages();

    expect(container.scrollTop).toBe(PAGE_HEIGHT);
    expect(viewer.getCurrentPage()).toBe(2);
  });
});
