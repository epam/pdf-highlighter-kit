import * as pdfjsLib from 'pdfjs-dist';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PDFEngine } from '../core/pdf-engine';
import { getDefaultWorkerCdnUrl } from '../utils/worker-loader-simple';

vi.mock('pdfjs-dist', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pdfjs-dist')>();
  return { ...actual, getDocument: vi.fn() };
});

/*
 * A PDF.js 6 document: it has no `destroy()`, only its loading task can
 * release it.
 */
const mockLoadingTask = (destroy = vi.fn().mockResolvedValue(undefined)) => {
  const pdfDocument = { numPages: 2, fingerprints: ['fp'] };
  const loadingTask = { promise: Promise.resolve(pdfDocument), destroy };
  vi.mocked(pdfjsLib.getDocument).mockReturnValue(
    loadingTask as unknown as ReturnType<typeof pdfjsLib.getDocument>
  );
  return loadingTask;
};

describe('PDFEngine.destroy', () => {
  afterEach(() => {
    vi.mocked(pdfjsLib.getDocument).mockReset();
  });

  it('releases the document through its loading task', async () => {
    const loadingTask = mockLoadingTask();
    const engine = new PDFEngine();
    await engine.loadDocument(new ArrayBuffer(8));

    expect(() => engine.destroy()).not.toThrow();
    expect(loadingTask.destroy).toHaveBeenCalledOnce();
    expect(engine.isDocumentLoaded()).toBe(false);
  });

  it('releases the document only once when destroyed twice', async () => {
    const loadingTask = mockLoadingTask();
    const engine = new PDFEngine();
    await engine.loadDocument(new ArrayBuffer(8));

    engine.destroy();
    engine.destroy();

    expect(loadingTask.destroy).toHaveBeenCalledOnce();
  });

  it('does not surface a rejected release', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    mockLoadingTask(vi.fn().mockRejectedValue(new Error('worker gone')));
    const engine = new PDFEngine();
    await engine.loadDocument(new ArrayBuffer(8));

    engine.destroy();
    await new Promise((resolve) => setTimeout(resolve, 0));

    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('does nothing when no document was loaded', () => {
    expect(() => new PDFEngine().destroy()).not.toThrow();
  });
});

describe('getDefaultWorkerCdnUrl', () => {
  it('points at the worker of the installed pdfjs-dist version', () => {
    expect(getDefaultWorkerCdnUrl()).toBe(
      `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
    );
  });
});
