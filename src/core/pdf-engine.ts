import * as pdfjsLib from 'pdfjs-dist';
import {
  TextContent,
  Page,
  ViewerOptions,
  Priority,
  RenderingQueue,
  ThumbnailOptions,
} from '../types';
import {
  normalizePDFSource,
  validateBase64PDF,
  extractPDFMetadata,
  detectPDFSourceType,
} from '../utils/pdf-utils';

if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://unpkg.com/pdfjs-dist@5.4.149/build/pdf.worker.min.mjs';
  console.log('PDF.js worker configured to CDN:', pdfjsLib.GlobalWorkerOptions.workerSrc);
}

export class PDFEngine {
  private pdfDocument: pdfjsLib.PDFDocumentProxy | null = null;
  private pages = new Map<number, Page>();
  private renderingQueue: RenderingQueue = {
    high: [],
    medium: [],
    low: [],
    idle: [],
  };
  private isRendering = false;
  private canvasPool: HTMLCanvasElement[] = [];
  private pageRenderCallback: ((pageNumber: number) => Promise<void>) | null = null;
  private maxPoolSize = 10;

  private thumbnailCache = new Map<string, HTMLCanvasElement>();
  private static readonly THUMBNAIL_DEFAULT_SCALE = 0.2;
  private static readonly THUMBNAIL_RENDER_CONCURRENCY = 3;

  private static getThumbnailCacheKey(pageNumber: number, scale: number): string {
    return `${pageNumber}:${scale.toFixed(4)}`;
  }

  constructor(private options: ViewerOptions = {}) {
    this.initializeCanvasPool();
  }

  setPageRenderCallback(callback: (pageNumber: number) => Promise<void>): void {
    this.pageRenderCallback = callback;
  }

  async loadDocument(source: string | ArrayBuffer | Blob): Promise<void> {
    try {
      this.thumbnailCache.clear();
      const sourceType = detectPDFSourceType(source);

      if (sourceType === 'base64') {
        const base64String = source as string;
        if (!validateBase64PDF(base64String)) {
          throw new Error('Invalid base64 PDF data');
        }

        try {
          const metadata = extractPDFMetadata(base64String);
          console.log(
            `Loading PDF from base64: ${Math.round(metadata.size / 1024)}KB, version: ${metadata.version || 'unknown'}`
          );
        } catch (metaError) {
          console.warn('Could not extract PDF metadata:', metaError);
        }
      }

      const normalizedSource = await normalizePDFSource(source);

      const loadingTask = pdfjsLib.getDocument({
        data: normalizedSource,
        disableFontFace: sourceType === 'base64',
        disableRange: sourceType !== 'url',
        disableStream: sourceType === 'base64' || sourceType === 'blob',
      });

      this.pdfDocument = await loadingTask.promise;

      for (let i = 1; i <= this.pdfDocument.numPages; i++) {
        this.pages.set(i, {
          pageNumber: i,
          rendered: false,
          loading: false,
        });
      }

      console.log(
        `PDF loaded successfully: ${this.pdfDocument.numPages} pages, fingerprint: ${this.pdfDocument.fingerprints?.[0] || 'unknown'}`
      );
    } catch (error) {
      console.error('Failed to load PDF document:', error);

      if (error instanceof Error) {
        if (error.message.includes('Invalid PDF')) {
          throw new Error('Invalid PDF format or corrupted file');
        } else if (error.message.includes('base64')) {
          throw new Error('Invalid base64 PDF data - ensure the string is properly encoded');
        } else if (error.message.includes('fetch')) {
          throw new Error(
            'Failed to load PDF from URL - check network connection and file availability'
          );
        }
      }

      throw new Error('Failed to load PDF document');
    }
  }

  getDocumentInfo() {
    if (!this.pdfDocument) {
      throw new Error('No PDF document loaded');
    }

    return {
      numPages: this.pdfDocument.numPages,
      fingerprint: this.pdfDocument.fingerprints?.[0] || 'unknown',
    };
  }

  async getPage(pageNumber: number): Promise<pdfjsLib.PDFPageProxy> {
    if (!this.pdfDocument) {
      throw new Error('No PDF document loaded');
    }

    return await this.pdfDocument.getPage(pageNumber);
  }

  async extractTextContent(pageNumber: number): Promise<TextContent> {
    const page = await this.getPage(pageNumber);
    const textContent = await page.getTextContent();

    const pageData = this.pages.get(pageNumber);
    if (pageData) {
      pageData.textContent = textContent as TextContent;
      this.pages.set(pageNumber, pageData);
    }

    return textContent as TextContent;
  }

  async renderPage(
    pageNumber: number,
    scale = 1.5,
    canvas?: HTMLCanvasElement
  ): Promise<HTMLCanvasElement> {
    console.log(`PDF Engine: renderPage ${pageNumber} at scale ${scale}`);

    const pageData = this.pages.get(pageNumber);
    if (!pageData) {
      throw new Error(`Page ${pageNumber} not found`);
    }

    if (pageData.rendered && pageData.canvas && pageData.scale === scale) {
      console.log(
        `PDF Engine: Page ${pageNumber} already rendered at scale ${scale}, returning cached`
      );
      return pageData.canvas;
    }

    if (pageData.rendered && pageData.scale !== scale) {
      console.log(
        `PDF Engine: Page ${pageNumber} scale changed from ${pageData.scale} to ${scale}, re-rendering`
      );
      pageData.rendered = false;
      pageData.canvas = undefined;
    }

    const page = await this.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    const renderCanvas = canvas || this.getCanvasFromPool();
    const context = renderCanvas.getContext('2d');

    if (!context) {
      throw new Error('Failed to get 2D context');
    }

    renderCanvas.width = viewport.width;
    renderCanvas.height = viewport.height;

    const renderContext = {
      canvasContext: context,
      viewport: viewport,
      canvas: renderCanvas,
    };

    try {
      pageData.loading = true;
      await page.render(renderContext).promise;

      pageData.canvas = renderCanvas;
      pageData.viewport = viewport;
      pageData.rendered = true;
      pageData.loading = false;
      pageData.scale = scale;

      this.pages.set(pageNumber, pageData);

      return renderCanvas;
    } catch (error) {
      pageData.loading = false;
      this.pages.set(pageNumber, pageData);
      console.error(`Failed to render page ${pageNumber}:`, error);
      throw error;
    }
  }

  queuePagesForRendering(pageNumbers: number[], priority: Priority): void {
    const targetQueue = this.renderingQueue[priority];

    pageNumbers.forEach((pageNumber) => {
      const pageData = this.pages.get(pageNumber);
      if (pageData && !pageData.rendered && !pageData.loading) {
        this.removeFromAllQueues(pageData);
        targetQueue.push(pageData);
      }
    });

    if (!this.isRendering) {
      this.processRenderQueue();
    }
  }

  private async processRenderQueue(): Promise<void> {
    if (this.isRendering) return;

    this.isRendering = true;
    const frameBudget = 16;

    while (this.hasQueuedItems()) {
      const startTime = performance.now();
      const page = this.getNextPageFromQueue();

      if (page) {
        try {
          if (this.pageRenderCallback) {
            await this.pageRenderCallback(page.pageNumber);
          } else {
            await this.renderPage(page.pageNumber);
          }
        } catch (error) {
          console.error(`Failed to render queued page ${page.pageNumber}:`, error);
        }
      }

      const elapsed = performance.now() - startTime;
      if (elapsed > frameBudget) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    this.isRendering = false;
  }

  private getNextPageFromQueue(): Page | null {
    if (this.renderingQueue.high.length > 0) {
      return this.renderingQueue.high.shift()!;
    }
    if (this.renderingQueue.medium.length > 0) {
      return this.renderingQueue.medium.shift()!;
    }
    if (this.renderingQueue.low.length > 0) {
      return this.renderingQueue.low.shift()!;
    }
    if (this.renderingQueue.idle.length > 0) {
      return this.renderingQueue.idle.shift()!;
    }
    return null;
  }

  private hasQueuedItems(): boolean {
    return Object.values(this.renderingQueue).some((queue) => queue.length > 0);
  }

  private removeFromAllQueues(page: Page): void {
    Object.values(this.renderingQueue).forEach((queue) => {
      const index = queue.indexOf(page);
      if (index !== -1) {
        queue.splice(index, 1);
      }
    });
  }

  unloadDistantPages(currentPage: number, threshold = 5): void {
    this.pages.forEach((page, pageNumber) => {
      const distance = Math.abs(pageNumber - currentPage);
      if (distance > threshold && page.rendered) {
        if (page.canvas) {
          this.returnCanvasToPool(page.canvas);
        }

        page.canvas = undefined;
        page.rendered = false;
        page.textContent = undefined;

        this.pages.set(pageNumber, page);
      }
    });
  }

  private initializeCanvasPool(): void {
    for (let i = 0; i < this.maxPoolSize; i++) {
      const canvas = document.createElement('canvas');
      this.canvasPool.push(canvas);
    }
  }

  private getCanvasFromPool(): HTMLCanvasElement {
    return this.canvasPool.pop() || document.createElement('canvas');
  }

  private returnCanvasToPool(canvas: HTMLCanvasElement): void {
    if (this.canvasPool.length < this.maxPoolSize) {
      const context = canvas.getContext('2d');
      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
      }
      this.canvasPool.push(canvas);
    }
  }

  async renderThumbnail(
    pageNumber: number,
    options?: ThumbnailOptions
  ): Promise<HTMLCanvasElement> {
    if (!this.pdfDocument) {
      throw new Error('No PDF document loaded');
    }

    const pageData = this.pages.get(pageNumber);
    if (!pageData) {
      throw new Error(`Page ${pageNumber} not found`);
    }

    const page = await this.getPage(pageNumber);
    let scale = options?.scale ?? PDFEngine.THUMBNAIL_DEFAULT_SCALE;
    if (options?.maxWidth != null && options.maxWidth > 0) {
      const baseViewport = page.getViewport({ scale: 1 });
      scale = options.maxWidth / baseViewport.width;
    }

    const cacheKey = PDFEngine.getThumbnailCacheKey(pageNumber, scale);
    const cached = this.thumbnailCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to get 2D context for thumbnail');
    }

    await page.render({
      canvasContext: context,
      viewport,
      canvas,
    }).promise;

    this.thumbnailCache.set(cacheKey, canvas);
    return canvas;
  }

  async getThumbnails(
    pageNumbers: number[],
    options?: ThumbnailOptions
  ): Promise<Map<number, HTMLCanvasElement>> {
    const result = new Map<number, HTMLCanvasElement>();
    const concurrency = PDFEngine.THUMBNAIL_RENDER_CONCURRENCY;
    const queue = [...pageNumbers];

    const worker = async (): Promise<void> => {
      while (queue.length > 0) {
        const pageNumber = queue.shift()!;
        try {
          const canvas = await this.renderThumbnail(pageNumber, options);
          result.set(pageNumber, canvas);
        } catch (error) {
          console.warn(`Failed to render thumbnail for page ${pageNumber}:`, error);
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    return result;
  }

  getPageData(pageNumber: number): Page | undefined {
    return this.pages.get(pageNumber);
  }

  getAllPages(): Map<number, Page> {
    return this.pages;
  }

  isDocumentLoaded(): boolean {
    return this.pdfDocument !== null;
  }

  clearAllPageCache(): void {
    console.log('PDF Engine: Clearing all cached page renders');
    this.pages.forEach((page, pageNumber) => {
      if (page.canvas) {
        this.returnCanvasToPool(page.canvas);
      }
      page.canvas = undefined;
      page.rendered = false;
      page.textContent = undefined;
      page.scale = undefined;
      this.pages.set(pageNumber, page);
    });
  }

  destroy(): void {
    if (this.pdfDocument) {
      this.pdfDocument.destroy();
      this.pdfDocument = null;
    }

    this.pages.clear();
    this.renderingQueue = { high: [], medium: [], low: [], idle: [] };
    this.canvasPool = [];
    this.thumbnailCache.clear();
    this.isRendering = false;
  }
}
