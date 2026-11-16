import * as pdfjsLib from 'pdfjs-dist';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFEngine } from '../core/pdf-engine';

vi.mock('pdfjs-dist', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pdfjs-dist')>();
  return { ...actual, getDocument: vi.fn() };
});

const PAGE_WIDTH = 600;
const PAGE_HEIGHT = 800;

/*
 * A one-page document whose page reports a viewport of
 * PAGE_WIDTH × PAGE_HEIGHT at scale 1 and records every render call.
 */
const mockDocument = () => {
  const render = vi.fn(() => ({ promise: Promise.resolve() }));
  const page = {
    rotate: 0,
    getViewport: ({ scale, rotation = 0 }: { scale: number; rotation?: number }) => ({
      width: PAGE_WIDTH * scale,
      height: PAGE_HEIGHT * scale,
      rotation,
    }),
    render,
  };
  const pdfDocument = {
    numPages: 1,
    fingerprints: ['fp'],
    getPage: vi.fn().mockResolvedValue(page),
  };
  vi.mocked(pdfjsLib.getDocument).mockReturnValue({
    promise: Promise.resolve(pdfDocument),
    destroy: vi.fn().mockResolvedValue(undefined),
  } as unknown as ReturnType<typeof pdfjsLib.getDocument>);
  return { render };
};

const setDevicePixelRatio = (ratio: number) => {
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: ratio });
};

describe('PDFEngine.renderPage backing store', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      {} as unknown as CanvasRenderingContext2D
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(pdfjsLib.getDocument).mockReset();
    setDevicePixelRatio(1);
  });

  it('renders in CSS pixels on a 1× display', async () => {
    setDevicePixelRatio(1);
    const { render } = mockDocument();
    const engine = new PDFEngine();
    await engine.loadDocument(new ArrayBuffer(8));

    const canvas = await engine.renderPage(1, 1);

    expect(canvas.width).toBe(PAGE_WIDTH);
    expect(canvas.height).toBe(PAGE_HEIGHT);
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ transform: undefined }));
  });

  it('renders in device pixels on a 1.5× display', async () => {
    setDevicePixelRatio(1.5);
    const { render } = mockDocument();
    const engine = new PDFEngine();
    await engine.loadDocument(new ArrayBuffer(8));

    const canvas = await engine.renderPage(1, 1);

    expect(canvas.width).toBe(PAGE_WIDTH * 1.5);
    expect(canvas.height).toBe(PAGE_HEIGHT * 1.5);
    expect(canvas.dataset.outputScale).toBe('1.5');
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ transform: [1.5, 0, 0, 1.5, 0, 0] })
    );
  });

  it('caps the ratio with maxPixelRatio', async () => {
    setDevicePixelRatio(2);
    mockDocument();
    const engine = new PDFEngine();
    engine.setOutputScaleOptions({ maxPixelRatio: 1 });
    await engine.loadDocument(new ArrayBuffer(8));

    const canvas = await engine.renderPage(1, 1);

    expect(canvas.width).toBe(PAGE_WIDTH);
  });

  it('re-renders a cached page when the device pixel ratio changes', async () => {
    setDevicePixelRatio(1);
    const { render } = mockDocument();
    const engine = new PDFEngine();
    await engine.loadDocument(new ArrayBuffer(8));

    await engine.renderPage(1, 1);
    await engine.renderPage(1, 1);
    expect(render).toHaveBeenCalledOnce();

    setDevicePixelRatio(2);
    const canvas = await engine.renderPage(1, 1);

    expect(render).toHaveBeenCalledTimes(2);
    expect(canvas.width).toBe(PAGE_WIDTH * 2);
  });
});
