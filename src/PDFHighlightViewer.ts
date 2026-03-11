import { PDFHighlightViewer as IPDFHighlightViewer } from './api';
import {
  ViewerOptions,
  BBoxOrigin,
  BBox,
  BBoxDimensions,
  BoundingBox,
  TextRange,
  SelectionWithMetadata,
  PerformanceMetrics,
  HighlightAnalytics,
  AccessibilityFeatures,
  InteractionMode,
  InputHighlightData,
  HighlightsIndex,
  HighlightStyle,
  HighlightLabelStyle,
  ZoomValue,
  ZoomMode,
  ThumbnailOptions,
} from './types';
import { PDFEngine } from './core/pdf-engine';
import { ViewportManager } from './core/viewport-manager';
import { UnifiedLayerBuilder } from './core/unified-layer-builder';
import { UnifiedInteractionHandler, InteractionCallbacks } from './core/interaction-handler';
import { PerformanceOptimizer } from './core/performance-optimizer';
import { buildHighlightsIndex } from './utils/highlight-adapter';
import {
  applyHighlightVisualStyle,
  getHighlightBaseOpacity,
  getHighlightHoverOpacity,
  resolveHighlightStyle,
} from './utils/highlight-style';
import {
  appendLabelIcon,
  applyBaseOutlineStyle,
  applyLabelOutlineStyle,
  applyLabelStyle,
} from './utils/label-style';

const CONTAINER_PADDING = 40;
const ZOOM_STEP = 1.2;
type EventCallback = (data?: unknown) => void;

export class PDFHighlightViewer implements IPDFHighlightViewer {
  private pdfEngine: PDFEngine;
  private viewportManager: ViewportManager;
  private layerBuilder: UnifiedLayerBuilder;
  private interactionHandler: UnifiedInteractionHandler;
  private performanceOptimizer: PerformanceOptimizer;

  private container: HTMLElement | null = null;
  private pdfContainer: HTMLElement | null = null;
  private pageContainers = new Map<number, HTMLElement>();

  private options: ViewerOptions;
  private highlightsIndex: HighlightsIndex = {
    highlights: [],
    byId: new Map(),
    pages: {},
    occurrences: [],
  };
  private currentPage = 1;
  private currentScale = 1.5;
  private totalPages = 0;
  private selectedTermId: string | null = null;
  private isInitialized = false;

  private navIndex = -1;

  private pageDimensions = new Map<number, { width: number; height: number }>();
  private defaultPageHeight = 800;

  private eventListeners: { event: string; callback: EventCallback }[] = [];
  private scrollListener: (() => void) | null = null;
  private analytics: HighlightAnalytics = {
    totalHighlights: 0,
    mostViewedPages: [],
    interactionHeatmap: {},
    averageTimePerPage: 0,
  };

  constructor() {
    this.options = {
      enableTextSelection: false,
      enableVirtualScrolling: true,
      bufferPages: 2,
      maxCachedPages: 10,
      interactionMode: 'hybrid',
      performanceMode: false,
      accessibility: true,
      bboxOrigin: 'bottom-right',
    };
    this.pdfEngine = new PDFEngine(this.options);
    this.viewportManager = new ViewportManager(
      this.options.bufferPages,
      this.options.maxCachedPages
    );
    this.layerBuilder = new UnifiedLayerBuilder();
    this.performanceOptimizer = new PerformanceOptimizer({
      maxCacheSize: this.options.maxCachedPages ? this.options.maxCachedPages * 10 : 100,
      frameBudget: this.options.performanceMode ? 8 : 16,
    });

    // Setup interaction callbacks
    const interactionCallbacks: InteractionCallbacks = {
      onHighlightHover: (event) => this.emit('highlightHover', event),
      onHighlightBlur: (termId) => this.emit('highlightBlur', termId),
      onHighlightClick: (event) => this.emit('highlightClick', event),
      onTextSelected: (event) => this.emit('textSelected', event),
      onSelectionChanged: (selection) => this.emit('selectionChanged', selection),
      onInteractionModeChanged: (mode) => this.emit('interactionModeChanged', mode),
    };

    this.interactionHandler = new UnifiedInteractionHandler(interactionCallbacks);
  }

  // =============================================================================
  // Initialization
  // =============================================================================

  async init(container: HTMLElement, options?: ViewerOptions): Promise<void> {
    if (this.isInitialized) {
      throw new Error('Viewer is already initialized');
    }

    // Merge options
    this.options = { ...this.options, ...options };

    // Store container reference
    this.container = container;

    // Setup container
    this.setupContainer();

    // Load CSS
    this.loadCSS();

    // Initialize interaction handler
    this.interactionHandler.init(this.container);

    // Setup scroll handling
    this.setupScrollHandling();

    // Initialize accessibility if enabled
    if (this.options.accessibility) {
      this.setupAccessibility();
    }

    this.isInitialized = true;
    this.emit('initialized');
  }

  /**
   * Setup container with proper structure and styling
   */
  private setupContainer(): void {
    if (!this.container) return;

    // Add viewer class
    this.container.className = (this.container.className + ' pdf-highlight-viewer').trim();

    // Create PDF container
    this.pdfContainer = document.createElement('div');
    this.pdfContainer.className = 'pdf-container';
    this.container.appendChild(this.pdfContainer);

    // Setup container styles
    this.container.style.position = 'relative';
    this.container.style.overflow = 'auto';
  }

  /**
   * Load CSS dynamically
   */
  private loadCSS(): void {
    // Check if CSS is already loaded
    if (document.getElementById('pdf-highlight-viewer-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'pdf-highlight-viewer-styles';
    style.textContent = `
      .pdf-highlight-viewer {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: auto;
        background: #f5f5f5;
      }
      
      .pdf-container {
        position: relative;
        margin: 0 auto;
        padding: 20px;
      }
      
      .pdf-page-container {
        position: relative;
        margin: 0 auto 20px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        background: white;
        border-radius: 4px;
      }
      
      .pdf-canvas {
        position: relative;
        z-index: 1;
        display: block;
        width: 100%;
        height: auto;
        user-select: none;
      }
      
      .unified-layer {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 2;
        pointer-events: none;
      }
      
      .highlight-wrapper {
        position: absolute;
        pointer-events: all;
        cursor: pointer;
        transition: opacity 0.2s ease;
      }
      
      .highlight-wrapper:hover {
        opacity: 0.8;
      }
      
      .highlight-background {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: -1;
        border-radius: 2px;
        opacity: 0.3;
      }
      
      /* Text segment styling */
      .text-segment {
        position: relative;
        z-index: 1;
        color: #333;
        font-family: inherit;
        white-space: pre;
      }
      
      .text-segment.selectable {
        user-select: text;
      }
      
      /* Loading states */
      .pdf-page-container.loading {
        min-height: 800px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #666;
      }

      .pdf-page-container.loading::after {
        content: "Loading page...";
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 12px;
        color: #999;
        background: rgba(255, 255, 255, 0.9);
        padding: 4px 8px;
        border-radius: 4px;
        pointer-events: none;
        z-index: 10;
      }
      
    `;
    document.head.appendChild(style);
  }

  /**
   * Setup scroll handling for virtual viewport management
   */
  private setupScrollHandling(): void {
    if (!this.container) return;

    let scrollTimeout: number;
    let isScrolling = false;

    this.scrollListener = () => {
      if (!isScrolling) {
        isScrolling = true;
        this.container?.classList.add('scrolling');
      }

      clearTimeout(scrollTimeout);
      scrollTimeout = window.setTimeout(() => {
        isScrolling = false;
        this.container?.classList.remove('scrolling');
        this.handleScroll();
      }, 50); // Reduced debounce time for better responsiveness
    };

    this.container.addEventListener('scroll', this.scrollListener);
  }

  private getPageScrollTop(pageNumber: number): number {
    const el = this.pageContainers.get(pageNumber);
    if (el) return el.offsetTop;
    return this.viewportManager.getScrollPositionForPage(pageNumber);
  }

  /**
   * Handle scroll events for virtual viewport management
   */
  private handleScroll(): void {
    if (!this.container) return;

    const scrollTop = this.container.scrollTop;
    const containerHeight = this.container.clientHeight;

    // Get what pages should be visible
    const visiblePages = this.viewportManager.getVisiblePages(scrollTop, containerHeight);
    const bufferPages = this.viewportManager.getBufferPages(visiblePages, 1);

    // 1. RENDER VISIBLE PAGES IMMEDIATELY - No delays, no complex logic
    visiblePages.forEach((pageNumber) => {
      const pageContainer = this.pageContainers.get(pageNumber);
      if (pageContainer && !pageContainer.classList.contains('rendered')) {
        // Render immediately for visible pages
        this.renderPage(pageNumber).catch((error) => {
          console.error(`Failed to render visible page ${pageNumber}:`, error);
        });
      }
    });

    // 2. RENDER BUFFER PAGES WITH SMALL DELAY
    setTimeout(() => {
      bufferPages.forEach((pageNumber) => {
        const pageContainer = this.pageContainers.get(pageNumber);
        if (pageContainer && !pageContainer.classList.contains('rendered')) {
          this.renderPage(pageNumber).catch((error) => {
            console.error(`Failed to render buffer page ${pageNumber}:`, error);
          });
        }
      });
    }, 100);

    // 3. UNLOAD DISTANT PAGES (simple logic)
    const allRelevantPages = new Set([...visiblePages, ...bufferPages]);
    this.pageContainers.forEach((pageContainer, pageNumber) => {
      if (!allRelevantPages.has(pageNumber) && pageContainer.classList.contains('rendered')) {
        const distance = Math.min(...visiblePages.map((vp) => Math.abs(pageNumber - vp)));
        if (distance > 5) {
          // Only unload if really far
          pageContainer.innerHTML = '';
          pageContainer.classList.remove('rendered');
          this.setPagePlaceholderSize(pageContainer, pageNumber);
        }
      }
    });

    // Update current page
    if (visiblePages.length > 0) {
      const newCurrentPage = visiblePages[0];
      if (newCurrentPage !== this.currentPage) {
        const previousPage = this.currentPage;
        this.currentPage = newCurrentPage;
        this.emit('pageChanged', {
          currentPage: newCurrentPage,
          previousPage: previousPage,
          totalPages: this.totalPages,
        });
      }
    }
  }

  /**
   * Set placeholder size for a page container using real PDF dimensions
   */
  private setPagePlaceholderSize(pageContainer: HTMLElement, pageNumber: number): void {
    const dimensions = this.pageDimensions.get(pageNumber);
    if (dimensions) {
      pageContainer.style.height = `${dimensions.height}px`;
      pageContainer.style.width = `${dimensions.width}px`;
    } else {
      // Fallback to default height
      pageContainer.style.height = `${this.defaultPageHeight}px`;
    }
  }

  /**
   * Get and cache real page dimensions
   */
  private async getPageDimensions(pageNumber: number): Promise<{ width: number; height: number }> {
    // Return cached dimensions if available
    const cached = this.pageDimensions.get(pageNumber);
    if (cached) return cached;

    // Get PDF page and its viewport at current scale
    const page = await this.pdfEngine.getPage(pageNumber);
    const viewport = page.getViewport({ scale: this.currentScale });

    const dimensions = {
      width: viewport.width,
      height: viewport.height,
    };

    // Cache the dimensions
    this.pageDimensions.set(pageNumber, dimensions);
    return dimensions;
  }

  /**
   * Setup accessibility features
   */
  private setupAccessibility(): void {
    if (!this.container) return;

    // Add ARIA attributes
    this.container.setAttribute('role', 'application');
    this.container.setAttribute('aria-label', 'PDF Highlight Viewer');
    this.container.setAttribute('tabindex', '0');

    // Add keyboard navigation
    this.container.addEventListener('keydown', this.handleKeyboardNavigation.bind(this));
  }

  /**
   * Handle keyboard navigation
   */
  private handleKeyboardNavigation(event: KeyboardEvent): void {
    switch (event.key) {
      case 'PageDown':
      case 'ArrowDown':
        this.setPage(Math.min(this.totalPages, this.currentPage + 1));
        event.preventDefault();
        break;
      case 'PageUp':
      case 'ArrowUp':
        this.setPage(Math.max(1, this.currentPage - 1));
        event.preventDefault();
        break;
      case 'Home':
        this.setPage(1);
        event.preventDefault();
        break;
      case 'End':
        this.setPage(this.totalPages);
        event.preventDefault();
        break;
      case '+':
      case '=':
        this.setZoom(this.currentScale * ZOOM_STEP);
        event.preventDefault();
        break;
      case '-':
        this.setZoom(this.currentScale / ZOOM_STEP);
        event.preventDefault();
        break;
    }
  }

  // =============================================================================
  // PDF Management
  // =============================================================================

  async loadPDF(source: string | ArrayBuffer | Blob): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Viewer must be initialized before loading PDF');
    }

    try {
      // Load document with PDF engine
      await this.pdfEngine.loadDocument(source);

      const docInfo = this.pdfEngine.getDocumentInfo();
      this.totalPages = docInfo.numPages;

      // Update viewport manager with total pages
      this.viewportManager.setTotalPages(this.totalPages);

      // Create page containers
      await this.createPageContainers();

      // Load initial pages
      await this.loadInitialPages();

      if (this.options.enableVirtualScrolling === false) {
        await this.renderAllPagesBatched(2);
      }

      this.emit('pdfLoaded', { totalPages: this.totalPages });
    } catch (error) {
      this.emit('error', { type: 'pdf-load-error', error });
      throw error;
    }
  }

  /**
   * Create DOM containers for all pages with real PDF dimensions
   */
  private async createPageContainers(): Promise<void> {
    if (!this.pdfContainer) return;

    // Clear existing containers
    this.pdfContainer.innerHTML = '';
    this.pageContainers.clear();

    const firstPageDimensions = await this.getPageDimensions(1);
    const avgPageHeight = firstPageDimensions.height;

    for (let pageNumber = 1; pageNumber <= this.totalPages; pageNumber++) {
      const pageContainer = document.createElement('div');
      pageContainer.className = 'pdf-page-container';
      pageContainer.setAttribute('data-page-number', pageNumber.toString());
      pageContainer.style.marginBottom = '20px';
      pageContainer.style.position = 'relative';

      const dimensions = await this.getPageDimensions(pageNumber);
      pageContainer.style.height = `${dimensions.height}px`;
      pageContainer.style.width = `${dimensions.width}px`;

      this.pdfContainer.appendChild(pageContainer);
      this.pageContainers.set(pageNumber, pageContainer);
    }

    // Update viewport manager with real page dimensions
    this.viewportManager.updateDimensions(this.container?.clientHeight || 600, avgPageHeight);
  }

  /**
   * Load initial pages (simple and reliable)
   */
  private async loadInitialPages(): Promise<void> {
    if (!this.container) return;

    // Get what should be visible at the top
    const visiblePages = this.viewportManager.getVisiblePages(0, this.container.clientHeight);

    // Load first page immediately
    try {
      await this.renderPage(1);
    } catch (error) {
      console.error('Failed to load initial page:', error);
    }

    // Load other visible pages with small delay
    setTimeout(() => {
      visiblePages
        .filter((page) => page > 1)
        .forEach((pageNumber) => {
          this.renderPage(pageNumber).catch((error) => {
            console.error(`Failed to load initial page ${pageNumber}:`, error);
          });
        });
    }, 100);
  }

  private async renderAllPagesBatched(batchSize = 2): Promise<void> {
    for (let i = 1; i <= this.totalPages; i += batchSize) {
      const batch: Promise<void>[] = [];

      for (let j = i; j < i + batchSize && j <= this.totalPages; j++) {
        const pageContainer = this.pageContainers.get(j);
        if (pageContainer && !pageContainer.classList.contains('rendered')) {
          batch.push(
            this.renderPage(j).catch((error) => {
              console.debug(`Failed to render page ${j}:`, error);
            })
          );
        }
      }

      await Promise.all(batch);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  /**
   * Render a specific page
   */
  private async renderPage(pageNumber: number): Promise<void> {
    const pageContainer = this.pageContainers.get(pageNumber);
    if (!pageContainer) return;

    // Check if already rendered
    if (pageContainer.classList.contains('rendered')) {
      console.log(`Page ${pageNumber}: skipping, already has 'rendered' class`);
      return;
    }

    console.log(`Page ${pageNumber}: rendering at scale ${this.currentScale}`);

    try {
      // Add loading state
      pageContainer.classList.add('loading');

      // Render PDF canvas
      const canvas = await this.pdfEngine.renderPage(pageNumber, this.currentScale);

      // Clear container and add canvas
      pageContainer.innerHTML = '';
      pageContainer.appendChild(canvas);
      pageContainer.style.height = `${canvas.height}px`;
      pageContainer.style.width = `${canvas.width}px`;
      pageContainer.style.position = 'relative';

      // Add text layer for selection (must be added before highlights)
      await this.addTextLayerToPage(pageNumber);

      // Add simple highlight overlays
      await this.addHighlightsToPage(pageNumber, canvas.width, canvas.height);

      // Mark as rendered and remove loading state
      pageContainer.classList.add('rendered');
      pageContainer.classList.remove('loading');

      this.emit('renderComplete', {
        pageNumber,
        renderTime: 0,
        highlightCount: this.getHighlightCountForPage(pageNumber),
      });
    } catch (error) {
      pageContainer.classList.remove('loading');
      console.error(`Failed to render page ${pageNumber}:`, error);
      this.emit('renderError', { pageNumber, error });
    }
  }

  preloadPages(pageNumbers: number[]): Promise<void> {
    return Promise.all(pageNumbers.map((pageNumber) => this.renderPage(pageNumber))).then(() => {
      return;
    });
  }

  setPage(pageNumber: number): void {
    if (pageNumber < 1 || pageNumber > this.totalPages) return;

    if (this.container) {
      this.container.scrollTop = this.getPageScrollTop(pageNumber);
    }
  }

  getZoom(): number {
    return this.currentScale;
  }

  setZoom(value: ZoomValue): void {
    if (value === ZoomMode.AUTO) {
      void this.setAutoZoom();
    } else if (value === ZoomMode.PAGE_FIT) {
      void this.setPageFitZoom();
    } else {
      this.applyZoom(value);
    }
  }

  private applyZoom(scale: number): void {
    const previousScale = this.currentScale;
    this.currentScale = Math.max(0.5, Math.min(5.0, scale));

    // Re-render visible pages with new scale
    this.reRenderVisiblePages();

    this.emit('zoomChanged', { scale: this.currentScale, previousScale });
  }

  private async setAutoZoom(): Promise<void> {
    const scales = await this.computeFitScales();
    this.applyZoom(scales.scaleX);
  }

  private async setPageFitZoom(): Promise<void> {
    const scales = await this.computeFitScales();
    this.applyZoom(Math.min(scales.scaleX, scales.scaleY));
  }

  private async computeFitScales(): Promise<{ scaleX: number; scaleY: number }> {
    if (!this.container) {
      return { scaleX: 1, scaleY: 1 };
    }
    const page = await this.pdfEngine.getPage(this.currentPage || 1);
    const viewport = page.getViewport({ scale: 1 });
    const scaleX = (this.container.clientWidth - CONTAINER_PADDING) / viewport.width;
    const scaleY = (this.container.clientHeight - CONTAINER_PADDING) / viewport.height;
    return { scaleX, scaleY };
  }

  zoomIn(): void {
    this.applyZoom(this.currentScale * ZOOM_STEP);
  }

  zoomOut(): void {
    this.applyZoom(this.currentScale / ZOOM_STEP);
  }

  resetZoom(): void {
    this.applyZoom(1.5);
  }

  getCurrentPage(): number {
    return this.currentPage;
  }

  getTotalPages(): number {
    return this.totalPages;
  }

  async getThumbnails(
    pageNumbers: number[],
    options?: ThumbnailOptions
  ): Promise<Map<number, HTMLCanvasElement>> {
    return this.pdfEngine.getThumbnails(pageNumbers, options);
  }

  async getThumbnailsDataUrl(
    pageNumbers: number[],
    options?: ThumbnailOptions
  ): Promise<Map<number, string>> {
    const canvases = await this.getThumbnails(pageNumbers, options);
    const format = options?.format ?? 'image/webp';
    const quality = options?.quality ?? 0.85;
    const result = new Map<number, string>();
    canvases.forEach((canvas, pageNumber) => {
      result.set(pageNumber, canvas.toDataURL(format, quality));
    });
    return result;
  }
  // =============================================================================
  // Text Selection Management
  // =============================================================================

  /**
   * Enable text selection functionality
   */
  enableTextSelection(): void {
    if (!this.options.enableTextSelection) {
      this.options.enableTextSelection = true;

      // Add text layers to all currently rendered pages
      this.pageContainers.forEach(async (pageContainer, pageNumber) => {
        if (pageContainer.classList.contains('rendered')) {
          await this.addTextLayerToPage(pageNumber);
        }
      });

      this.emit('textSelectionEnabled');
    }
  }

  /**
   * Disable text selection functionality
   */
  disableTextSelection(): void {
    if (this.options.enableTextSelection) {
      this.options.enableTextSelection = false;

      // Remove text layers from all pages
      this.pageContainers.forEach((pageContainer) => {
        const textLayer = pageContainer.querySelector('.text-layer');
        if (textLayer) {
          textLayer.remove();
        }
      });

      this.emit('textSelectionDisabled');
    }
  }

  /**
   * Toggle text selection functionality
   */
  toggleTextSelection(): boolean {
    if (this.options.enableTextSelection) {
      this.disableTextSelection();
      return false;
    } else {
      this.enableTextSelection();
      return true;
    }
  }

  /**
   * Check if text selection is currently enabled
   */
  isTextSelectionEnabled(): boolean {
    return this.options.enableTextSelection || false;
  }

  // =============================================================================
  // Highlight Management
  // =============================================================================

  loadHighlights(data: InputHighlightData[]): void {
    this.highlightsIndex = buildHighlightsIndex(data);
    this.navIndex = -1;

    this.updateAnalytics();

    // refresh rendered pages
    this.updateAllUnifiedLayers();

    this.buildAllSpatialIndices();

    this.emit('highlightsLoaded', { count: data.length });
  }

  addHighlight(highlight: InputHighlightData): void {
    const prev = this.highlightsIndex.byId.get(highlight.id);

    const affectedPages = new Set<number>();
    prev?.bboxes?.forEach((b) => affectedPages.add(b.page));
    highlight.bboxes.forEach((b) => affectedPages.add(b.page));

    const nextList = [...this.highlightsIndex.highlights];
    const idx = nextList.findIndex((h) => h.id === highlight.id);

    if (idx >= 0) nextList[idx] = highlight;
    else nextList.push(highlight);

    this.highlightsIndex = buildHighlightsIndex(nextList);
    this.navIndex = -1;

    this.updateAnalytics();

    // Refresh only affected pages
    for (const pageNumber of affectedPages) {
      this.refreshHighlightLayerForPage(pageNumber);
      this.updatePageUnifiedLayer(pageNumber);
      this.buildSpatialIndexForPage(pageNumber);
    }

    this.emit('highlightAdded', { highlight, pages: Array.from(affectedPages) });
  }

  removeHighlight(termId: string): void {
    const prev = this.highlightsIndex.byId.get(termId);
    if (!prev) return;

    const affectedPages = new Set<number>();
    prev.bboxes.forEach((b) => affectedPages.add(b.page));

    const nextList = this.highlightsIndex.highlights.filter((h) => h.id !== termId);
    this.highlightsIndex = buildHighlightsIndex(nextList);
    this.navIndex = -1;

    // If removed highlight was selected — clear selection visuals
    if (this.selectedTermId === termId) {
      this.selectedTermId = null;
      this.clearSelectedTermHighlighting();
    }

    this.updateAnalytics();

    for (const pageNumber of affectedPages) {
      this.refreshHighlightLayerForPage(pageNumber);
      this.updatePageUnifiedLayer(pageNumber);
      this.buildSpatialIndexForPage(pageNumber);
    }

    this.emit('highlightRemoved', { termId, pages: Array.from(affectedPages) });
  }

  updateHighlightStyle(termId: string, stylePatch: Partial<HighlightStyle>): void {
    const prev = this.highlightsIndex.byId.get(termId);
    if (!prev) return;

    const next: InputHighlightData = {
      ...prev,
      style: {
        ...(prev.style ?? {}),
        ...stylePatch,
      } as HighlightStyle,
    };

    const affectedPages = new Set<number>();
    prev.bboxes.forEach((b) => affectedPages.add(b.page));

    const nextList = [...this.highlightsIndex.highlights];
    const idx = nextList.findIndex((h) => h.id === termId);
    if (idx >= 0) nextList[idx] = next;

    this.highlightsIndex = buildHighlightsIndex(nextList);

    this.navIndex = -1;

    this.updateAnalytics();

    for (const pageNumber of affectedPages) {
      this.refreshHighlightLayerForPage(pageNumber);
      this.updatePageUnifiedLayer(pageNumber);
      this.buildSpatialIndexForPage(pageNumber);
    }

    this.emit('styleUpdated', { termId, style: next.style, patch: stylePatch });
  }

  /**
   * Update unified layer for a specific page
   */
  private updatePageUnifiedLayer(pageNumber: number): void {
    const pageContainer = this.pageContainers.get(pageNumber);
    if (!pageContainer) return;

    const pageData = this.pdfEngine.getPageData(pageNumber);
    if (!pageData?.textContent) return;

    const normalizedHighlights = this.highlightsIndex.highlights.map((highlight) => ({
      ...highlight,
      bboxes: highlight.bboxes.map((bbox) => {
        const normalized = this.normalizeBBoxForPage(
          bbox,
          bbox.page,
          highlight.bboxSourceDimensions,
          highlight.bboxOrigin
        );
        return {
          ...bbox,
          x1: normalized.x1,
          y1: normalized.y1,
          x2: normalized.x2,
          y2: normalized.y2,
        };
      }),
    }));

    this.layerBuilder.updateHighlights(
      pageContainer,
      normalizedHighlights,
      pageNumber,
      pageData.textContent,
      this.currentScale
    );
  }
  /**
   * Update all unified layers
   */
  private updateAllUnifiedLayers(): void {
    this.pageContainers.forEach((pageContainer, pageNumber) => {
      // Only update pages that are already rendered
      if (pageContainer.classList.contains('rendered')) {
        // Remove existing highlight layer first
        const existingHighlightLayer = pageContainer.querySelector('.highlight-layer');
        if (existingHighlightLayer) {
          existingHighlightLayer.remove();
        }

        // Re-add highlights to already rendered pages
        const canvas = pageContainer.querySelector('canvas');
        if (canvas) {
          this.addHighlightsToPage(pageNumber, canvas.width, canvas.height);
        }
      }
    });
  }

  /**
   * Re-render visible pages (e.g., after zoom change)
   */
  private async reRenderVisiblePages(): Promise<void> {
    if (!this.container) return;

    console.log('Zoom changed to:', this.currentScale);

    // Clear ALL cached data for the new scale
    this.pdfEngine.clearAllPageCache();
    this.pageDimensions.clear(); // Clear dimension cache

    // Clear all containers and update their sizes for new scale
    let totalHeight = 0;
    let validDimensions = 0;

    for (const [pageNumber, pageContainer] of this.pageContainers) {
      // Clear content
      pageContainer.innerHTML = '';
      pageContainer.classList.remove('rendered');

      // Get new dimensions for the new scale
      try {
        const newDimensions = await this.getPageDimensions(pageNumber);
        pageContainer.style.height = `${newDimensions.height}px`;
        pageContainer.style.width = `${newDimensions.width}px`;

        // Track for average calculation
        totalHeight += newDimensions.height;
        validDimensions++;
      } catch {
        pageContainer.style.height = `${this.defaultPageHeight}px`;
      }
    }

    // Calculate new average page height and update viewport manager
    const avgPageHeight =
      validDimensions > 0 ? totalHeight / validDimensions : this.defaultPageHeight;
    this.viewportManager.updateDimensions(this.container?.clientHeight || 600, avgPageHeight);

    // Render currently visible pages
    const scrollTop = this.container.scrollTop;
    const containerHeight = this.container.clientHeight;
    const visiblePages = this.viewportManager.getVisiblePages(scrollTop, containerHeight);

    console.log('Re-rendering visible pages at new scale:', visiblePages);

    // Render visible pages immediately
    for (const pageNumber of visiblePages) {
      try {
        await this.renderPage(pageNumber);
      } catch (error) {
        console.error(`Failed to re-render page ${pageNumber}:`, error);
      }
    }
  }

  // =============================================================================
  // Text Selection Implementation
  // =============================================================================

  textSelection = {
    enable: (): void => {
      this.interactionHandler.setInteractionMode('select');
    },

    disable: (): void => {
      this.interactionHandler.setInteractionMode('highlight');
    },

    getSelection: (): string => {
      const selection = window.getSelection();
      return selection ? selection.toString() : '';
    },

    getSelectionWithContext: (): SelectionWithMetadata | null => {
      return this.interactionHandler.getSelectionWithContext();
    },

    clearSelection: (): void => {
      this.interactionHandler.clearSelection();
    },

    selectText: (range: TextRange): void => {
      // TODO: Implement programmatic text selection
      console.log('selectText not yet implemented:', range);
    },

    copySelection: (format: 'plain' | 'formatted' | 'citation' = 'plain'): void => {
      const selection = this.textSelection.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection).catch(console.error);
        this.emit('selectionCopied', { text: selection, format });
      }
    },

    createHighlightFromSelection: (style?: HighlightStyle): InputHighlightData | null => {
      const selectionData = this.textSelection.getSelectionWithContext();
      if (!selectionData) return null;

      const id = `selection-${Date.now()}`;

      const highlight: InputHighlightData = {
        id,
        bboxes: [], // still TODO: compute bboxes from selection
        style,
        tooltipText: selectionData.text,
        metadata: {
          pages: selectionData.pages,
          context: selectionData.context,
          range: selectionData.range,
        },
      };

      this.addHighlight(highlight);

      this.emit('selectionHighlighted', { text: selectionData.text, termId: id });
      return highlight;
    },
  };

  // =============================================================================
  // Navigation
  // =============================================================================

  private getNavOccurrences(): {
    termId: string;
    pageNumber: number;
    occurrenceIndex: number;
    x1: number;
    y1: number;
  }[] {
    const list: {
      termId: string;
      pageNumber: number;
      occurrenceIndex: number;
      x1: number;
      y1: number;
    }[] = [];

    for (const h of this.highlightsIndex.highlights) {
      for (let i = 0; i < h.bboxes.length; i++) {
        const b = h.bboxes[i];
        const normalized = this.normalizeBBoxForPage(
          b,
          b.page,
          h.bboxSourceDimensions,
          h.bboxOrigin
        );
        list.push({
          termId: h.id,
          pageNumber: b.page,
          occurrenceIndex: i,
          x1: normalized.x1,
          y1: normalized.y1,
        });
      }
    }

    list.sort((a, b) => a.pageNumber - b.pageNumber || a.y1 - b.y1 || a.x1 - b.x1);
    return list;
  }

  goToHighlight(termId: string, occurrenceIndex = 0): void {
    const highlight = this.getHighlightById(termId);
    if (!highlight) return;

    const bbox = highlight.bboxes[occurrenceIndex];
    if (!bbox) return;

    const page = bbox.page;
    const normalizedBBox = this.normalizeBBoxForPage(
      bbox,
      page,
      highlight.bboxSourceDimensions,
      highlight.bboxOrigin
    );

    this.highlightSelectedTerm(termId);

    this.setPage(page);

    void this.renderPage(page)
      .then(() => {
        const pageContainer = this.pageContainers.get(page);
        if (!pageContainer || !this.container) {
          this.emit('navigationComplete', { termId, pageNumber: page, occurrenceIndex });
          return;
        }

        const pageTop = pageContainer.offsetTop;
        const y = normalizedBBox.y1 * this.currentScale;
        this.container.scrollTop = Math.max(0, pageTop + y - 60);

        this.emit('navigationComplete', { termId, pageNumber: page, occurrenceIndex });
      })
      .catch((error) => {
        console.error('goToHighlight render/scroll failed:', error);
        this.emit('navigationError', { termId, pageNumber: page, occurrenceIndex, error });
      });
  }

  nextHighlight(): void {
    const list = this.getNavOccurrences();
    if (list.length === 0) return;

    this.navIndex = (this.navIndex + 1) % list.length;
    const next = list[this.navIndex];
    this.goToHighlight(next.termId, next.occurrenceIndex);
  }

  previousHighlight(): void {
    const list = this.getNavOccurrences();
    if (list.length === 0) return;

    this.navIndex = (this.navIndex - 1 + list.length) % list.length;
    const prev = list[this.navIndex];
    this.goToHighlight(prev.termId, prev.occurrenceIndex);
  }

  goToCoordinate(pageNumber: number, x: number, y: number): void {
    this.setPage(pageNumber);

    if (!this.container) return;

    const pageTop = this.getPageScrollTop(pageNumber);
    const origin = this.options.bboxOrigin ?? 'bottom-right';
    const pixelDimensions = this.pageDimensions.get(pageNumber);
    if (!pixelDimensions) {
      throw new Error(`Page dimensions for page ${pageNumber} are not available`);
    }

    const dimensions = this.toPageCoordinateDimensions(pixelDimensions);
    const normalizedY = origin.startsWith('bottom') ? dimensions.height - y : y;
    const targetY = pageTop + normalizedY * this.currentScale - this.container.clientHeight * 0.3;

    this.container.scrollTop = Math.max(0, targetY);

    this.emit('coordinateNavigation', { pageNumber, x, y });
  }

  // =============================================================================
  // Search & Filter
  // =============================================================================

  searchHighlights(query: string): InputHighlightData[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    return this.highlightsIndex.highlights.filter((h) => {
      if (h.id.toLowerCase().includes(q)) return true;
      if ((h.tooltipText ?? '').toLowerCase().includes(q)) return true;

      if (h.metadata) {
        try {
          return JSON.stringify(h.metadata).toLowerCase().includes(q);
        } catch {
          // ignore non-serializable metadata
        }
      }

      return false;
    });
  }

  // =============================================================================
  // Interaction Modes
  // =============================================================================

  setInteractionMode(mode: InteractionMode): void {
    this.interactionHandler.setInteractionMode(mode);
  }

  getInteractionMode(): InteractionMode {
    return this.interactionHandler.getInteractionMode();
  }

  // =============================================================================
  // Performance & Analytics
  // =============================================================================

  getPerformanceMetrics(): PerformanceMetrics {
    const baseMetrics = this.performanceOptimizer.getPerformanceMetrics();

    const renderedPages = Array.from(this.pageContainers.values()).filter((container) =>
      container.classList.contains('rendered')
    ).length;

    const memoryEstimate = renderedPages * 2; // ~2MB per rendered page (rough estimate)

    return {
      ...baseMetrics,
      memoryUsage: {
        pages: renderedPages,
        highlights: this.highlightsIndex.highlights.length,
        cache: this.pageDimensions.size,
        total: memoryEstimate,
      },
    };
  }
  /**
   * Get current memory and performance stats
   */
  getMemoryStats(): {
    renderedPages: number;
    totalPages: number;
    estimatedMemoryMB: number;
    cachedDimensions: number;
  } {
    const renderedPages = Array.from(this.pageContainers.entries()).filter(([_, container]) =>
      container.classList.contains('rendered')
    ).length;

    return {
      renderedPages,
      totalPages: this.totalPages,
      estimatedMemoryMB: renderedPages * 2, // ~2MB per page
      cachedDimensions: this.pageDimensions.size,
    };
  }

  getAnalytics(): HighlightAnalytics {
    return { ...this.analytics };
  }

  enableProfiling(): void {
    // TODO: Enable detailed performance profiling
    console.log('Profiling enabled');
  }

  disableProfiling(): void {
    // TODO: Disable detailed performance profiling
    console.log('Profiling disabled');
  }

  // =============================================================================
  // Accessibility
  // =============================================================================

  accessibility: AccessibilityFeatures = {
    enableKeyboardNavigation: (): void => {
      // Already enabled in setupAccessibility
    },

    enableScreenReader: (): void => {
      // Add screen reader support
      if (this.container) {
        this.container.setAttribute('aria-live', 'polite');
      }
    },

    setAriaLabels: (labels: Record<string, string>): void => {
      // Apply ARIA labels
      Object.entries(labels).forEach(([selector, label]) => {
        const elements = this.container?.querySelectorAll(selector);
        elements?.forEach((el) => el.setAttribute('aria-label', label));
      });
    },

    announceHighlight: (termId: string): void => {
      // Announce highlight to screen readers
      const announcement = document.createElement('div');
      announcement.setAttribute('aria-live', 'assertive');
      announcement.setAttribute('aria-atomic', 'true');
      announcement.style.position = 'absolute';
      announcement.style.left = '-10000px';
      announcement.textContent = `Highlighted term: ${termId}`;
      document.body.appendChild(announcement);

      setTimeout(() => document.body.removeChild(announcement), 1000);
    },
  };

  // =============================================================================
  // Event Management
  // =============================================================================

  addEventListener(event: string, callback: EventCallback): void {
    this.eventListeners.push({ event, callback });
  }

  removeEventListener(event: string, callback: EventCallback): void {
    const index = this.eventListeners.findIndex(
      (listener) => listener.event === event && listener.callback === callback
    );
    if (index !== -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  emit(event: string, data?: unknown): void {
    this.eventListeners
      .filter((listener) => listener.event === event)
      .forEach((listener) => {
        try {
          listener.callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
  }

  // =============================================================================
  // Utility Methods
  // =============================================================================

  exportAsImage(format: 'png' | 'jpeg' = 'png', quality = 0.9): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx || !this.pdfContainer) {
        reject(new Error('Canvas context not available'));
        return;
      }

      // TODO: Implement image export
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob'));
          }
        },
        `image/${format}`,
        quality
      );
    });
  }

  getViewport() {
    return {
      pageNumber: this.currentPage,
      scale: this.currentScale,
      scrollTop: this.container?.scrollTop || 0,
      visibleArea: {
        x: 0,
        y: this.container?.scrollTop || 0,
        width: this.container?.clientWidth || 0,
        height: this.container?.clientHeight || 0,
      },
    };
  }

  refresh(): void {
    // Re-render current viewport
    this.reRenderVisiblePages();
    this.updateAllUnifiedLayers();
    this.emit('refreshComplete');
  }

  // =============================================================================
  // Private Helper Methods
  // =============================================================================

  private refreshHighlightLayerForPage(pageNumber: number): void {
    const pageContainer = this.pageContainers.get(pageNumber);
    if (!pageContainer || !pageContainer.classList.contains('rendered')) return;

    const existingHighlightLayer = pageContainer.querySelector('.highlight-layer');
    if (existingHighlightLayer) existingHighlightLayer.remove();

    const canvas = pageContainer.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return;

    this.addHighlightsToPage(pageNumber, canvas.width, canvas.height);
  }

  /**
   * Add highlights to a rendered page
   */
  private async addHighlightsToPage(
    pageNumber: number,
    canvasWidth: number,
    canvasHeight: number
  ): Promise<void> {
    const pageContainer = this.pageContainers.get(pageNumber);
    if (!pageContainer) return;

    // Check if highlights already added
    if (pageContainer.querySelector('.highlight-layer')) {
      return;
    }

    try {
      const scale = this.currentScale;

      const highlightLayer = document.createElement('div');
      highlightLayer.className = 'highlight-layer';
      highlightLayer.style.position = 'absolute';
      highlightLayer.style.top = '0';
      highlightLayer.style.left = '0';
      highlightLayer.style.width = `${canvasWidth}px`;
      highlightLayer.style.height = `${canvasHeight}px`;
      highlightLayer.style.zIndex = '2';
      highlightLayer.style.pointerEvents = 'none';

      for (const highlight of this.highlightsIndex.highlights) {
        const style = highlight.style;
        const resolvedStyle = resolveHighlightStyle(style);

        for (let bboxIndex = 0; bboxIndex < highlight.bboxes.length; bboxIndex++) {
          const bbox = highlight.bboxes[bboxIndex];
          if (bbox.page !== pageNumber) continue;

          const normalizedBBox = this.normalizeBBoxForPage(
            bbox,
            pageNumber,
            highlight.bboxSourceDimensions,
            highlight.bboxOrigin
          );

          const highlightDiv = document.createElement('div');
          highlightDiv.className = 'highlight';
          highlightDiv.setAttribute('data-term-id', highlight.id);
          highlightDiv.setAttribute('data-page', String(pageNumber));
          highlightDiv.setAttribute('data-bbox-index', String(bboxIndex));

          const left = normalizedBBox.x1 * scale;
          const top = normalizedBBox.y1 * scale;
          const width = (normalizedBBox.x2 - normalizedBBox.x1) * scale;
          const height = (normalizedBBox.y2 - normalizedBBox.y1) * scale;

          highlightDiv.style.position = 'absolute';
          highlightDiv.style.left = `${left}px`;
          highlightDiv.style.top = `${top}px`;
          highlightDiv.style.width = `${width}px`;
          highlightDiv.style.height = `${height}px`;

          highlightDiv.style.pointerEvents = 'auto';
          highlightDiv.style.cursor = 'pointer';
          highlightDiv.style.boxSizing = 'border-box';
          highlightDiv.style.userSelect = 'none';

          const highlightVisual = document.createElement('span');
          highlightVisual.className = 'highlight-visual';
          applyHighlightVisualStyle(highlightVisual, resolvedStyle);
          applyBaseOutlineStyle(highlightVisual, style);
          highlightDiv.appendChild(highlightVisual);

          const baseOpacity = getHighlightBaseOpacity(style);

          const overlappingCount = this.countOverlappingHighlights(
            highlightLayer,
            normalizedBBox,
            scale
          );
          const effectiveOpacity = Math.max(
            0.05,
            baseOpacity / Math.max(1, overlappingCount * 0.7)
          );

          highlightVisual.style.opacity = effectiveOpacity.toString();
          highlightDiv.dataset.originalOpacity = effectiveOpacity.toString();

          const hoverOpacity = getHighlightHoverOpacity(style, effectiveOpacity);
          const termLabelsSelector = `.highlight-label[data-term-id="${highlight.id}"]`;

          highlightDiv.addEventListener('mouseenter', () => {
            if (this.options.highlightsConfig?.enableMultilineHover) {
              const same = highlightLayer.querySelectorAll(
                `.highlight[data-term-id="${highlight.id}"]`
              );
              same.forEach((el) => {
                const htmlEl = el as HTMLDivElement;
                const visual = htmlEl.querySelector<HTMLElement>('.highlight-visual');
                if (visual) visual.style.opacity = String(hoverOpacity);
              });
              this.getLabelsForTerm(highlightLayer, highlight.id).forEach((sameLabel) => {
                sameLabel.style.opacity = String(hoverOpacity);
              });

              const other = highlightLayer.querySelectorAll(
                `.highlight[data-term-id]:not([data-term-id="${highlight.id}"])`
              );
              other.forEach((el) => {
                const htmlEl = el as HTMLDivElement;
                const visual = htmlEl.querySelector<HTMLElement>('.highlight-visual');
                if (visual) visual.style.opacity = '0.1';
              });
              highlightLayer
                .querySelectorAll<HTMLElement>(
                  `.highlight-label:not([data-term-id="${highlight.id}"])`
                )
                .forEach((otherLabel) => {
                  otherLabel.style.opacity = '0.1';
                });
            } else {
              highlightVisual.style.opacity = String(hoverOpacity);
            }
            highlightLayer.querySelectorAll<HTMLElement>(termLabelsSelector).forEach((labelEl) => {
              labelEl.style.opacity = String(hoverOpacity);
            });
          });

          highlightDiv.addEventListener('mouseleave', () => {
            if (this.options.highlightsConfig?.enableMultilineHover) {
              const all = highlightLayer.querySelectorAll('.highlight[data-term-id]');
              const baseOpacityByTermId = new Map<string, string>();
              all.forEach((el) => {
                const htmlEl = el as HTMLDivElement;
                const original = htmlEl.dataset.originalOpacity ?? '0.3';
                const visual = htmlEl.querySelector<HTMLElement>('.highlight-visual');
                if (visual) visual.style.opacity = original;
                const termId = htmlEl.getAttribute('data-term-id');
                if (termId) {
                  baseOpacityByTermId.set(termId, original);
                }
              });
              highlightLayer
                .querySelectorAll<HTMLElement>('.highlight-label')
                .forEach((allLabel) => {
                  const allTermId = allLabel.getAttribute('data-term-id');
                  if (!allTermId) return;
                  const fallbackBaseOpacity = baseOpacityByTermId.get(allTermId);
                  if (fallbackBaseOpacity !== undefined) {
                    allLabel.style.opacity = fallbackBaseOpacity;
                    return;
                  }
                  const allHighlight = this.getHighlightById(allTermId);
                  allLabel.style.opacity = String(
                    typeof allHighlight?.style?.opacity === 'number'
                      ? allHighlight.style.opacity
                      : 0.3
                  );
                });
            } else {
              highlightVisual.style.opacity = highlightDiv.dataset.originalOpacity ?? '0.3';
            }
            highlightLayer.querySelectorAll<HTMLElement>(termLabelsSelector).forEach((labelEl) => {
              labelEl.style.opacity = String(effectiveOpacity);
            });
          });

          highlightLayer.appendChild(highlightDiv);

          if (highlight.label || highlight.beforeIcon) {
            const labelEl = document.createElement('span');
            labelEl.className = 'highlight-label';
            labelEl.setAttribute('data-term-id', highlight.id);
            labelEl.setAttribute('data-bbox-index', String(bboxIndex));
            labelEl.dataset.baseLeft = String(left);
            labelEl.dataset.baseTop = String(top);
            const { left: labelOffsetLeft, top: labelOffsetTop } = this.getLabelOffsets(
              highlight.labelStyle
            );
            labelEl.style.position = 'absolute';
            labelEl.style.left = `${left + labelOffsetLeft}px`;
            labelEl.style.top = `${top + labelOffsetTop}px`;
            labelEl.style.boxSizing = 'border-box';
            labelEl.style.zIndex = '3';
            labelEl.style.transform = 'translateX(-100%)';
            labelEl.style.display = 'flex';
            labelEl.style.alignItems = 'center';
            labelEl.style.justifyContent = 'flex-end';
            labelEl.style.gap = '4px';
            labelEl.style.pointerEvents = 'auto';
            labelEl.style.cursor = 'pointer';
            labelEl.style.whiteSpace = 'nowrap';

            if (
              highlight.labelStyle?.borderColor !== undefined ||
              highlight.labelStyle?.borderWidth !== undefined
            ) {
              const borderColor = highlight.labelStyle?.borderColor ?? 'currentColor';
              const borderWidth = highlight.labelStyle?.borderWidth ?? '1px';
              labelEl.style.border = `${borderWidth} solid ${borderColor}`;
            }
            applyLabelOutlineStyle(labelEl, highlight.labelStyle);

            applyLabelStyle(labelEl, highlight.labelStyle);
            labelEl.style.opacity = String(effectiveOpacity);

            appendLabelIcon(labelEl, highlight.beforeIcon, highlight.labelStyle);
            if (highlight.label) {
              labelEl.appendChild(document.createTextNode(highlight.label));
            }

            highlightLayer.appendChild(labelEl);
          }
        }
      }

      pageContainer.appendChild(highlightLayer);

      if (this.selectedTermId) {
        this.applySelectionToPage(pageNumber);
      }
    } catch (error) {
      console.error(`Failed to add highlights to page ${pageNumber}:`, error);
    }
  }

  private getHighlightById(termId: string): InputHighlightData | undefined {
    const byId = this.highlightsIndex?.byId;
    if (byId && typeof byId.get === 'function') {
      const fromMap = byId.get(termId) as InputHighlightData | undefined;
      if (fromMap) return fromMap;
    }

    return this.highlightsIndex.highlights.find((h) => h.id === termId);
  }

  private getHighlightStyle(termId: string): HighlightStyle | undefined {
    return this.getHighlightById(termId)?.style;
  }

  private getLabelOffsets(style?: Partial<HighlightLabelStyle>): { left: number; top: number } {
    return {
      left: style?.offsetLeft ?? 0,
      top: style?.offsetTop ?? -1,
    };
  }

  private getLabelsForTerm(highlightLayer: Element, termId: string): HTMLElement[] {
    return Array.from(
      highlightLayer.querySelectorAll<HTMLElement>(`.highlight-label[data-term-id="${termId}"]`)
    );
  }

  private getHighlightElements(root: ParentNode, termId?: string): HTMLElement[] {
    const selector = termId
      ? `.highlight[data-term-id="${termId}"], .highlight-wrapper[data-term-id="${termId}"]`
      : '.highlight, .highlight-wrapper';

    return Array.from(root.querySelectorAll<HTMLElement>(selector));
  }

  /**
   * Update highlights colors for specified page
   * */
  updateHighlightsStyles(pageNumber: number, hoveredIds?: string[]) {
    const pageContainer = this.pageContainers.get(pageNumber);
    if (!pageContainer) return;

    const highlightLayer = pageContainer.querySelector('.highlight-layer');
    if (!highlightLayer) return;

    const allHighlights = pageContainer.querySelectorAll<HTMLDivElement>(
      '.highlight, .highlight-wrapper'
    );
    allHighlights.forEach((el) => {
      const termId = el.getAttribute('data-term-id');
      if (!termId) return;

      const highlight = this.getHighlightById(termId);
      const style = this.getHighlightStyle(termId);
      const {
        backgroundColor: bg,
        borderColor,
        borderWidth,
      } = resolveHighlightStyle(style, el.style.backgroundColor || '#666666');

      const visual = el.querySelector<HTMLElement>('.highlight-visual') ?? el;
      visual.style.backgroundColor = bg;
      visual.style.border = `${borderWidth} solid ${borderColor}`;
      applyBaseOutlineStyle(visual, style);
      const highlightBaseOpacity =
        typeof style?.opacity === 'number'
          ? style.opacity
          : parseFloat(el.dataset.originalOpacity ?? '0.3');

      const bboxIdx = el.getAttribute('data-bbox-index');
      const isWrapper = el.classList.contains('highlight-wrapper');
      const labelEl = isWrapper
        ? el.querySelector<HTMLElement>('.highlight-label')
        : bboxIdx !== null
          ? highlightLayer.querySelector<HTMLElement>(
              `.highlight-label[data-term-id="${termId}"][data-bbox-index="${bboxIdx}"]`
            )
          : highlightLayer.querySelector<HTMLElement>(`.highlight-label[data-term-id="${termId}"]`);
      if (labelEl) {
        if (isWrapper) {
          const { left: wrapperOffsetLeft, top: wrapperOffsetTop } = this.getLabelOffsets(
            highlight?.labelStyle
          );
          labelEl.style.left = `${wrapperOffsetLeft}px`;
          labelEl.style.top = `${wrapperOffsetTop}px`;
        } else {
          const baseLabelLeft = parseFloat(labelEl.dataset.baseLeft ?? '0');
          const baseLabelTop = parseFloat(labelEl.dataset.baseTop ?? '0');
          const { left: labelOffsetLeft, top: labelOffsetTop } = this.getLabelOffsets(
            highlight?.labelStyle
          );
          labelEl.style.left = `${baseLabelLeft + labelOffsetLeft}px`;
          labelEl.style.top = `${baseLabelTop + labelOffsetTop}px`;
        }
        if (highlight?.labelStyle?.borderColor !== undefined) {
          labelEl.style.borderColor = highlight.labelStyle.borderColor;
        } else {
          labelEl.style.borderColor = '';
        }
        if (highlight?.labelStyle?.borderWidth !== undefined) {
          labelEl.style.borderWidth = highlight.labelStyle.borderWidth;
        } else {
          labelEl.style.borderWidth = '';
        }
        applyLabelOutlineStyle(labelEl, highlight?.labelStyle);
        labelEl.style.opacity = String(highlightBaseOpacity);
      }

      if (
        this.options.highlightsConfig?.enableMultilineHover &&
        hoveredIds &&
        Array.isArray(hoveredIds)
      ) {
        const baseOpacity = style
          ? getHighlightBaseOpacity(style)
          : parseFloat(el.dataset.originalOpacity ?? '0.3');

        const hoverOpacity = getHighlightHoverOpacity(style, baseOpacity);

        if (hoveredIds.includes(termId)) {
          visual.style.opacity = String(hoverOpacity);
          if (labelEl) {
            labelEl.style.opacity = String(hoverOpacity);
          }
        } else if (hoveredIds.length > 0) {
          visual.style.opacity = '0.1';
          if (labelEl) {
            labelEl.style.opacity = '0.1';
          }
        } else {
          visual.style.opacity = String(baseOpacity);
          if (labelEl) {
            labelEl.style.opacity = String(baseOpacity);
          }
        }
      }
    });
  }

  /**
   * Build spatial index for a specific page
   */
  private buildSpatialIndexForPage(pageNumber: number): void {
    const refs = this.highlightsIndex.pages[String(pageNumber)] ?? [];
    const normalizedRefs = refs.map((ref) => {
      const highlight = this.highlightsIndex.byId.get(ref.id);
      return {
        ...ref,
        bbox: this.normalizeBBoxForPage(
          highlight?.bboxes[ref.bboxIndex] ?? {
            ...ref.bbox,
            page: ref.page,
          },
          ref.page,
          highlight?.bboxSourceDimensions,
          highlight?.bboxOrigin
        ),
      };
    });
    this.performanceOptimizer.buildSpatialIndex(normalizedRefs, pageNumber);
  }

  private toPageCoordinateDimensions(pixelDimensions: { width: number; height: number }): {
    width: number;
    height: number;
  } {
    const scale = this.currentScale > 0 ? this.currentScale : 1;
    return {
      width: pixelDimensions.width / scale,
      height: pixelDimensions.height / scale,
    };
  }

  private normalizeBBoxForPage(
    bbox: BBox | (BoundingBox & { page?: number }),
    pageNumber: number,
    bboxSourceDimensions?: BBoxDimensions,
    bboxOrigin?: BBoxOrigin
  ): BoundingBox {
    const origin: BBoxOrigin = bboxOrigin ?? this.options.bboxOrigin ?? 'bottom-right';
    const computedSourceDimensions = bboxSourceDimensions ?? this.options.bboxSourceDimensions;
    const pixelDimensions = this.pageDimensions.get(pageNumber);
    if (!pixelDimensions) {
      throw new Error(`Page dimensions for page ${pageNumber} are not available`);
    }

    const { width: pageWidth, height: pageHeight } =
      this.toPageCoordinateDimensions(pixelDimensions);

    let x1 = bbox.x1;
    let x2 = bbox.x2;
    let y1 = bbox.y1;
    let y2 = bbox.y2;

    if (
      computedSourceDimensions &&
      computedSourceDimensions.width &&
      computedSourceDimensions.height
    ) {
      const xScale = pageWidth / computedSourceDimensions.width;
      const yScale = pageHeight / computedSourceDimensions.height;
      x1 *= xScale;
      x2 *= xScale;
      y1 *= yScale;
      y2 *= yScale;
    }

    if (origin.endsWith('right')) {
      x1 = pageWidth - x1;
      x2 = pageWidth - x2;
    }

    if (origin.startsWith('bottom')) {
      y1 = pageHeight - y1;
      y2 = pageHeight - y2;
    }

    return {
      x1: Math.min(x1, x2),
      y1: Math.min(y1, y2),
      x2: Math.max(x1, x2),
      y2: Math.max(y1, y2),
    };
  }
  /**
   * Build spatial indices for all pages
   */
  private buildAllSpatialIndices(): void {
    for (let pageNumber = 1; pageNumber <= this.totalPages; pageNumber++) {
      this.buildSpatialIndexForPage(pageNumber);
    }
  }

  /**
   * Get the number of highlights on a given page.
   *
   * This reads from the precomputed `highlightsIndex.pages` map, which stores
   * arrays of highlight references keyed by the page number as a string.
   * If there are no references for the requested page, an empty array is used,
   * and the method returns 0.
   *
   * @param pageNumber - The 1-based page number to count highlights for.
   * @returns The total number of highlight references on the page.
   */
  private getHighlightCountForPage(pageNumber: number): number {
    const refs = this.highlightsIndex.pages[String(pageNumber)] ?? [];
    return refs.length;
  }

  /**
   * Update analytics information based on the current highlights index.
   *
   * This method recalculates the total number of highlights by reading the
   * length of `this.highlightsIndex.highlights` and updates the
   * `this.analytics` object with the new `totalHighlights` value, while
   * preserving all other existing analytics properties.
   */
  private updateAnalytics(): void {
    const totalHighlights = this.highlightsIndex.highlights.length;

    this.analytics = {
      ...this.analytics,
      totalHighlights,
    };
  }

  /**
   * Highlight all instances of a selected term
   */
  highlightSelectedTerm(termId: string): void {
    if (!this.container) return;

    // Store the selected term ID for persistence across page renders
    this.selectedTermId = termId;

    // Remove previous selection highlighting
    this.clearSelectedTermHighlighting(false);

    // Add selected class to all instances of this term
    const termElements = this.getHighlightElements(this.container, termId);

    termElements.forEach((element) => {
      element.classList.add('selected-term');

      // Override inline styles for selected term
      const htmlElement = element as HTMLElement;
      htmlElement.style.opacity = '0.75';
      htmlElement.style.filter = 'brightness(1.05) contrast(1.05) saturate(1.1)';
      htmlElement.style.boxShadow =
        '0 0 0 1px rgba(255, 255, 255, 0.6), 0 0 4px rgba(102, 126, 234, 0.3)';
      htmlElement.style.transform = 'scale(1.02)';
      htmlElement.style.zIndex = '12';
      htmlElement.style.borderWidth = '1px';
      htmlElement.style.transition = 'all 0.3s ease';
    });

    // Also dim all other highlights
    const allHighlights = this.getHighlightElements(this.container);

    allHighlights.forEach((element) => {
      const elementTermId = element.getAttribute('data-term-id');
      if (!elementTermId || elementTermId !== termId) {
        element.classList.add('dimmed-highlight');

        // Override inline styles for dimmed highlights
        const htmlElement = element as HTMLElement;
        htmlElement.style.opacity = '0.15';
        htmlElement.style.filter = 'brightness(0.6) contrast(0.7) saturate(0.4) grayscale(0.3)';
        htmlElement.style.transition = 'all 0.3s ease';
      }
    });
  }

  /**
   * Clear selected term highlighting
   */
  clearSelectedTermHighlighting(clearStoredSelection = true): void {
    if (!this.container) return;

    if (clearStoredSelection) {
      this.selectedTermId = null;
    }

    const selectedElements = this.container.querySelectorAll(
      '.highlight.selected-term, .highlight-wrapper.selected-term'
    );
    selectedElements.forEach((element) => {
      element.classList.remove('selected-term');

      // Reset inline styles for selected elements
      const htmlElement = element as HTMLElement;
      htmlElement.style.filter = '';
      htmlElement.style.boxShadow = '';
      htmlElement.style.transform = '';
      htmlElement.style.borderWidth = '';
      // Keep original opacity as it was set by the original rendering
    });

    const dimmedElements = this.container.querySelectorAll(
      '.highlight.dimmed-highlight, .highlight-wrapper.dimmed-highlight'
    );
    dimmedElements.forEach((element) => {
      element.classList.remove('dimmed-highlight');

      // Reset inline styles for dimmed elements
      const htmlElement = element as HTMLElement;
      htmlElement.style.filter = '';
      htmlElement.style.transform = '';
      htmlElement.style.boxShadow = '';
      htmlElement.style.borderWidth = '';

      // Restore original opacity from stored value
      const originalOpacity = htmlElement.dataset.originalOpacity;
      if (originalOpacity) {
        htmlElement.style.opacity = originalOpacity;
        delete htmlElement.dataset.originalOpacity;
      } else {
        htmlElement.style.opacity = '0.3'; // Default fallback
      }
    });
  }

  /**
   * Add text layer for text selection functionality
   */
  private async addTextLayerToPage(pageNumber: number): Promise<void> {
    // Check if text selection is enabled
    if (!this.options.enableTextSelection) {
      return;
    }

    const pageContainer = this.pageContainers.get(pageNumber);
    if (!pageContainer) return;

    // Check if text layer already exists
    if (pageContainer.querySelector('.text-layer')) {
      return;
    }

    try {
      // Get the PDF page and its viewport
      const pdfPage = await this.pdfEngine.getPage(pageNumber);
      const viewport = pdfPage.getViewport({ scale: this.currentScale });

      // Extract text content from PDF
      const textContent = await pdfPage.getTextContent();

      // Create text layer container
      const textLayer = document.createElement('div');
      textLayer.className = 'text-layer';
      textLayer.style.position = 'absolute';
      textLayer.style.left = '0';
      textLayer.style.top = '0';
      textLayer.style.width = `${viewport.width}px`;
      textLayer.style.height = `${viewport.height}px`;
      textLayer.style.overflow = 'hidden';
      textLayer.style.lineHeight = '1';
      textLayer.style.zIndex = '1'; // Below highlights but above canvas
      // textLayer.style.opacity = '0.1'; // Uncomment for debugging text boundaries

      // Process text items with proper PDF coordinate transformation
      textContent.items.forEach((item) => {
        if (!('str' in item) || !('transform' in item) || !('fontName' in item)) {
          return;
        }
        if (!item.str || !item.str.trim()) return; // Skip empty text

        const textSpan = document.createElement('span');
        textSpan.textContent = item.str;
        textSpan.style.position = 'absolute';
        textSpan.style.color = 'transparent'; // Invisible text for selection
        textSpan.style.backgroundColor = 'transparent'; // No background interference
        // textSpan.style.border = '1px solid blue'; // Uncomment for debugging boundaries
        textSpan.style.cursor = 'text';
        textSpan.style.userSelect = 'text';
        textSpan.style.whiteSpace = 'pre';
        textSpan.style.pointerEvents = 'auto';

        // Use PDF.js transform matrix directly for accurate positioning
        const transform = item.transform;

        // Extract position and scaling from transform matrix
        const scaleX = transform[0];
        const scaleY = transform[3];
        const translateX = transform[4];
        const translateY = transform[5];

        // Apply viewport transformation to get screen coordinates
        const [screenX, screenY] = viewport.convertToViewportPoint(translateX, translateY);

        // Calculate font size with proper viewport scaling
        const fontSize = Math.abs(scaleY) * this.currentScale;

        // Calculate text width with proper viewport scaling
        let textWidth = 0;
        if (item.width) {
          // Use PDF.js provided width and apply viewport scaling
          textWidth = item.width * this.currentScale;
        } else {
          // Calculate based on font metrics with scaling
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.font = `${fontSize}px ${item.fontName || 'serif'}`;
            const metrics = ctx.measureText(item.str);
            textWidth = metrics.width;
          } else {
            // Fallback calculation with scaling
            textWidth = fontSize * item.str.length * 0.6;
          }
        }

        // Apply horizontal scaling from transform matrix
        const horizontalScale = Math.abs(scaleX);
        const verticalScale = Math.abs(scaleY);
        if (Math.abs(horizontalScale - verticalScale) > 0.01) {
          const scaleRatio = horizontalScale / verticalScale;
          textWidth = textWidth * scaleRatio;
        }

        // Set position and dimensions using screen coordinates
        textSpan.style.left = `${screenX}px`;
        textSpan.style.top = `${screenY - fontSize}px`; // Adjust for text baseline
        textSpan.style.width = `${textWidth}px`;
        textSpan.style.height = `${fontSize}px`;
        textSpan.style.fontSize = `${fontSize}px`;
        textSpan.style.fontFamily = item.fontName || 'serif';
        textSpan.style.overflow = 'hidden'; // Prevent text from extending beyond width
        textSpan.style.textOverflow = 'clip'; // Clip text at boundaries
        textSpan.style.whiteSpace = 'nowrap'; // Prevent text wrapping
        textSpan.style.letterSpacing = '0px'; // Remove any letter spacing interference
        textSpan.style.wordSpacing = '0px'; // Remove word spacing interference

        // Add data attributes for debugging
        textSpan.setAttribute('data-text', item.str);
        textSpan.setAttribute('data-width', textWidth.toString());
        textSpan.setAttribute('data-original-width', item.width?.toString() || 'unknown');

        // Handle horizontal scaling if different from vertical
        if (Math.abs(horizontalScale - verticalScale) > 0.1) {
          const scaleRatio = horizontalScale / verticalScale;
          textSpan.style.transform = `scaleX(${scaleRatio})`;
          textSpan.style.transformOrigin = '0 0';
        }

        // Handle rotation if present in transform
        if (Math.abs(transform[1]) > 0.01 || Math.abs(transform[2]) > 0.01) {
          const angle = (Math.atan2(transform[1], transform[0]) * 180) / Math.PI;
          textSpan.style.transform = `rotate(${angle}deg)`;
        }

        textLayer.appendChild(textSpan);
      });

      pageContainer.appendChild(textLayer);

      console.log(
        `Text layer added to page ${pageNumber} with ${textContent.items.length} text items`
      );
      console.log('Text span style applied:', textLayer.children[0]?.getAttribute('style'));
    } catch (error) {
      console.error(`Failed to add text layer to page ${pageNumber}:`, error);
    }
  }

  /**
   * Count overlapping highlights at the same coordinates
   */
  private countOverlappingHighlights(
    highlightLayer: HTMLElement,
    coord: BoundingBox,
    scale: number
  ): number {
    const targetLeft = coord.x1 * scale;
    const targetTop = coord.y1 * scale;
    const targetWidth = (coord.x2 - coord.x1) * scale;
    const targetHeight = (coord.y2 - coord.y1) * scale;

    const existingHighlights = highlightLayer.children;
    let overlappingCount = 0;

    for (let i = 0; i < existingHighlights.length; i++) {
      const existing = existingHighlights[i] as HTMLElement;
      const existingLeft = parseFloat(existing.style.left);
      const existingTop = parseFloat(existing.style.top);
      const existingWidth = parseFloat(existing.style.width);
      const existingHeight = parseFloat(existing.style.height);

      // Check if highlights overlap significantly (>80% overlap)
      const overlapLeft = Math.max(targetLeft, existingLeft);
      const overlapTop = Math.max(targetTop, existingTop);
      const overlapRight = Math.min(targetLeft + targetWidth, existingLeft + existingWidth);
      const overlapBottom = Math.min(targetTop + targetHeight, existingTop + existingHeight);

      if (overlapRight > overlapLeft && overlapBottom > overlapTop) {
        const overlapArea = (overlapRight - overlapLeft) * (overlapBottom - overlapTop);
        const targetArea = targetWidth * targetHeight;
        const overlapPercentage = overlapArea / targetArea;

        if (overlapPercentage > 0.8) {
          overlappingCount++;
        }
      }
    }

    return overlappingCount;
  }

  /**
   * Apply selected term highlighting to a specific page
   */
  private applySelectionToPage(pageNumber: number): void {
    if (!this.selectedTermId) return;

    const pageContainer = this.pageContainers.get(pageNumber);
    if (!pageContainer) return;

    // Find all highlights in this page
    const allHighlights = pageContainer.querySelectorAll('.highlight, .highlight-wrapper');

    // Apply styling to all highlights
    allHighlights.forEach((element) => {
      const elementTermId = element.getAttribute('data-term-id');
      const htmlElement = element as HTMLElement;

      if (elementTermId === this.selectedTermId) {
        // Apply selected styling to matching terms
        element.classList.add('selected-term');
        element.classList.remove('dimmed-highlight');

        htmlElement.style.opacity = '0.75';
        htmlElement.style.filter = 'brightness(1.05) contrast(1.05) saturate(1.1)';
        htmlElement.style.boxShadow =
          '0 0 0 1px rgba(255, 255, 255, 0.6), 0 0 4px rgba(102, 126, 234, 0.3)';
        htmlElement.style.transform = 'scale(1.02)';
        htmlElement.style.zIndex = '12';
        htmlElement.style.borderWidth = '1px';
        htmlElement.style.transition = 'all 0.3s ease';
      } else {
        // Apply dimmed styling to non-selected highlights
        element.classList.add('dimmed-highlight');
        element.classList.remove('selected-term');

        // Store original opacity to restore later
        if (!htmlElement.dataset.originalOpacity) {
          htmlElement.dataset.originalOpacity = htmlElement.style.opacity || '0.3';
        }

        htmlElement.style.opacity = '0.15';
        htmlElement.style.filter = 'brightness(0.6) contrast(0.7) saturate(0.4) grayscale(0.3)';
        htmlElement.style.transform = '';
        htmlElement.style.boxShadow = '';
        htmlElement.style.borderWidth = '';
        htmlElement.style.transition = 'all 0.3s ease';
      }
    });
  }

  // =============================================================================
  // Cleanup
  // =============================================================================

  destroy(): void {
    // Remove event listeners
    if (this.scrollListener && this.container) {
      this.container.removeEventListener('scroll', this.scrollListener);
    }

    // Destroy components
    this.pdfEngine.destroy();
    this.interactionHandler.destroy();
    this.performanceOptimizer.destroy();

    // Clear DOM references
    this.container = null;
    this.pdfContainer = null;
    this.pageContainers.clear();

    // Clear state
    this.eventListeners = [];
    this.isInitialized = false;

    this.emit('destroyed');
  }
}

export default PDFHighlightViewer;
