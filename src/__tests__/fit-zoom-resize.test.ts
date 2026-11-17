import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFHighlightViewer } from '../PDFHighlightViewer';
import { ZoomMode } from '../types';

const DEBOUNCE_MS = 100;
/* Page size at scale 1; the fit scales below divide the container size by it. */
const PAGE_WIDTH = 500;
const PAGE_HEIGHT = 800;

let resizeCallbacks: (() => void)[] = [];
let disconnectSpy: ReturnType<typeof vi.fn>;

class ResizeObserverStub {
  constructor(callback: () => void) {
    resizeCallbacks.push(callback);
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect(): void {
    disconnectSpy();
  }
}

const createViewer = async () => {
  const viewer = new PDFHighlightViewer();
  const container = document.createElement('div');
  const size = { width: 800, height: 600 };
  Object.defineProperties(container, {
    offsetWidth: { get: () => size.width },
    offsetHeight: { get: () => size.height },
  });
  await viewer.init(container);
  vi.spyOn(viewer as never, 'computeFitScales').mockImplementation((async () => ({
    scaleX: size.width / PAGE_WIDTH,
    scaleY: size.height / PAGE_HEIGHT,
  })) as never);
  const rerender = vi
    .spyOn(viewer as never, 'reRenderVisiblePages')
    .mockResolvedValue(undefined as never);
  /* Settles the async fit computation started by `setZoom` or a resize. */
  const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };
  /* Changes the container size and notifies the observer, without waiting for the debounce. */
  const setSize = (width: number, height = size.height) => {
    size.width = width;
    size.height = height;
    resizeCallbacks.forEach((callback) => callback());
  };
  const resize = async (width: number, height = size.height) => {
    setSize(width, height);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flush();
  };
  return { viewer, rerender, flush, setSize, resize };
};

beforeEach(() => {
  vi.useFakeTimers();
  resizeCallbacks = [];
  disconnectSpy = vi.fn();
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fit zoom modes follow the container size', () => {
  it('re-fits the page width in auto mode when the container widens', async () => {
    const { viewer, flush, resize } = await createViewer();
    viewer.setZoom(ZoomMode.AUTO);
    await flush();
    expect(viewer.getZoom()).toBeCloseTo(800 / PAGE_WIDTH);

    await resize(1200);

    expect(viewer.getZoom()).toBeCloseTo(1200 / PAGE_WIDTH);
  });

  it('debounces a resize burst into one re-fit', async () => {
    const { viewer, rerender, flush, setSize, resize } = await createViewer();
    viewer.setZoom(ZoomMode.AUTO);
    await flush();
    rerender.mockClear();

    for (const width of [850, 900, 950]) {
      setSize(width);
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS / 2);
    }
    await resize(1000);

    expect(rerender).toHaveBeenCalledTimes(1);
    expect(viewer.getZoom()).toBeCloseTo(1000 / PAGE_WIDTH);
  });

  it('ignores a height-only change in auto mode', async () => {
    const { viewer, rerender, flush, resize } = await createViewer();
    viewer.setZoom(ZoomMode.AUTO);
    await flush();
    rerender.mockClear();

    await resize(800, 900);

    expect(rerender).not.toHaveBeenCalled();
  });

  it('re-fits on a height change in page-fit mode', async () => {
    const { viewer, flush, resize } = await createViewer();
    viewer.setZoom(ZoomMode.PAGE_FIT);
    await flush();
    expect(viewer.getZoom()).toBeCloseTo(600 / PAGE_HEIGHT);

    await resize(800, 1200);

    expect(viewer.getZoom()).toBeCloseTo(1200 / PAGE_HEIGHT);
  });

  it('keeps a fixed zoom on resize', async () => {
    const { viewer, flush, resize } = await createViewer();
    viewer.setZoom(ZoomMode.AUTO);
    await flush();
    viewer.setZoom(2);

    await resize(1200);

    expect(viewer.getZoom()).toBe(2);
  });

  it('leaves auto mode on zoom in', async () => {
    const { viewer, flush, resize } = await createViewer();
    viewer.setZoom(ZoomMode.AUTO);
    await flush();
    viewer.zoomIn();
    const zoomedIn = viewer.getZoom();

    await resize(1200);

    expect(viewer.getZoom()).toBe(zoomedIn);
  });

  it('drops a fit that resolves after a fixed zoom was chosen', async () => {
    const { viewer, flush } = await createViewer();
    viewer.setZoom(ZoomMode.AUTO);
    viewer.setZoom(2);
    await flush();

    expect(viewer.getZoom()).toBe(2);
  });

  it('stops observing the container on destroy', async () => {
    const { viewer } = await createViewer();
    viewer.destroy();

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });
});
