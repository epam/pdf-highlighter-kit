import { PDFHighlightViewer as IPDFHighlightViewer } from './api';
import {
  ViewerOptions,
  HighlightData,
  TermOccurrence,
  CategoryStyle,
  TextRange,
  SelectionWithMetadata,
  PerformanceMetrics,
  HighlightAnalytics,
  AccessibilityFeatures,
  InteractionMode,
  TermMetadata
} from './types';
import { PDFEngine } from './core/pdf-engine';
import { ViewportManager } from './core/viewport-manager';
import { UnifiedLayerBuilder } from './core/unified-layer-builder';
import { UnifiedInteractionHandler, InteractionCallbacks } from './core/interaction-handler';
import { PerformanceOptimizer } from './core/performance-optimizer';
import { CategoryStyleManager } from './core/style-manager';

export class PDFHighlightViewer implements IPDFHighlightViewer {
  private pdfEngine: PDFEngine;
  private viewportManager: ViewportManager;
  private layerBuilder: UnifiedLayerBuilder;
  private interactionHandler: UnifiedInteractionHandler;
  private performanceOptimizer: PerformanceOptimizer;
  private styleManager: CategoryStyleManager;

  private container: HTMLElement | null = null;
  private pdfContainer: HTMLElement | null = null;
  private pageContainers = new Map<number, HTMLElement>();

  private options: ViewerOptions;
  private highlightData: HighlightData = {};
  private currentPage = 1;
  private currentScale = 1.5;
  private totalPages = 0;
  private selectedTermId: string | null = null;
  private isInitialized = false;

  private pageDimensions = new Map<number, { width: number; height: number }>();
  private defaultPageHeight = 800;

  private eventListeners: Array<{ event: string; callback: (...args: any[]) => void }> = [];
  private scrollListener: (() => void) | null = null;
  private analytics: HighlightAnalytics = {
    totalHighlights: 0,
    categoryBreakdown: {},
    mostViewedPages: [],
    interactionHeatmap: {},
    averageTimePerPage: 0
  };

  constructor() {
    this.options = {
      enableTextSelection: false,
      enableVirtualScrolling: true,
      bufferPages: 2,
      maxCachedPages: 10,
      interactionMode: 'hybrid',
      performanceMode: false,
      accessibility: true
    };
    this.pdfEngine = new PDFEngine(this.options);
    this.viewportManager = new ViewportManager(this.options.bufferPages, this.options.maxCachedPages);
    this.layerBuilder = new UnifiedLayerBuilder();
    this.performanceOptimizer = new PerformanceOptimizer({
      maxCacheSize: this.options.maxCachedPages ? this.options.maxCachedPages * 10 : 100,
      frameBudget: this.options.performanceMode ? 8 : 16
    });
    this.styleManager = new CategoryStyleManager();

    // Setup interaction callbacks
    const interactionCallbacks: InteractionCallbacks = {
      onHighlightHover: (event) => this.emit('highlightHover', event),
      onHighlightBlur: (termId) => this.emit('highlightBlur', termId),
      onHighlightClick: (event) => this.emit('highlightClick', event),
      onTextSelected: (event) => this.emit('textSelected', event),
      onSelectionChanged: (selection) => this.emit('selectionChanged', selection),
      onInteractionModeChanged: (mode) => this.emit('interactionModeChanged', mode)
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
      
      /* Category-specific highlight colors */
      .protein-highlight .highlight-background {
        background-color: #ff6b6b;
      }
      
      .species-highlight .highlight-background {
        background-color: #4ecdc4;
      }
      
      .chemical-highlight .highlight-background {
        background-color: #45b7d1;
      }
      
      .disease-highlight .highlight-background {
        background-color: #f7b731;
      }
      
      .gene-highlight .highlight-background {
        background-color: #5f27cd;
      }
      
      .cell_line-highlight .highlight-background {
        background-color: #00d2d3;
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
    visiblePages.forEach(pageNumber => {
      const pageContainer = this.pageContainers.get(pageNumber);
      if (pageContainer && !pageContainer.classList.contains('rendered')) {
        // Render immediately for visible pages
        this.renderPage(pageNumber).catch(error => {
          console.error(`Failed to render visible page ${pageNumber}:`, error);
        });
      }
    });

    // 2. RENDER BUFFER PAGES WITH SMALL DELAY
    setTimeout(() => {
      bufferPages.forEach(pageNumber => {
        const pageContainer = this.pageContainers.get(pageNumber);
        if (pageContainer && !pageContainer.classList.contains('rendered')) {
          this.renderPage(pageNumber).catch(error => {
            console.error(`Failed to render buffer page ${pageNumber}:`, error);
          });
        }
      });
    }, 100);

    // 3. UNLOAD DISTANT PAGES (simple logic)
    const allRelevantPages = new Set([...visiblePages, ...bufferPages]);
    this.pageContainers.forEach((pageContainer, pageNumber) => {
      if (!allRelevantPages.has(pageNumber) && pageContainer.classList.contains('rendered')) {
        const distance = Math.min(...visiblePages.map(vp => Math.abs(pageNumber - vp)));
        if (distance > 5) { // Only unload if really far
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
          totalPages: this.totalPages
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

    try {
      // Get PDF page and its viewport at current scale
      const page = await this.pdfEngine.getPage(pageNumber);
      const viewport = page.getViewport({ scale: this.currentScale });

      const dimensions = {
        width: viewport.width,
        height: viewport.height
      };

      // Cache the dimensions
      this.pageDimensions.set(pageNumber, dimensions);
      return dimensions;

    } catch (error) {
      console.error(`Failed to get dimensions for page ${pageNumber}:`, error);
      return { width: 600, height: this.defaultPageHeight };
    }
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
        this.setZoom(this.currentScale * 1.2);
        event.preventDefault();
        break;
      case '-':
        this.setZoom(this.currentScale / 1.2);
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

    // Get dimensions for the first page to estimate all others
    let avgPageHeight = this.defaultPageHeight;
    try {
      const firstPageDimensions = await this.getPageDimensions(1);
      avgPageHeight = firstPageDimensions.height;
    } catch (error) {
      console.warn('Could not get first page dimensions, using default');
    }

    for (let pageNumber = 1; pageNumber <= this.totalPages; pageNumber++) {
      const pageContainer = document.createElement('div');
      pageContainer.className = 'pdf-page-container';
      pageContainer.setAttribute('data-page-number', pageNumber.toString());
      pageContainer.style.marginBottom = '20px';
      pageContainer.style.position = 'relative';

      // Try to set real dimensions, or use estimated height
      try {
        const dimensions = await this.getPageDimensions(pageNumber);
        pageContainer.style.height = `${dimensions.height}px`;
        pageContainer.style.width = `${dimensions.width}px`;
      } catch (error) {
        // Use average height as fallback
        pageContainer.style.height = `${avgPageHeight}px`;
      }

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
      visiblePages.filter(page => page > 1).forEach(pageNumber => {
        this.renderPage(pageNumber).catch(error => {
          console.error(`Failed to load initial page ${pageNumber}:`, error);
        });
      });
    }, 100);
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
        highlightCount: this.getHighlightCountForPage(pageNumber)
      });

    } catch (error) {
      pageContainer.classList.remove('loading');
      console.error(`Failed to render page ${pageNumber}:`, error);
      this.emit('renderError', { pageNumber, error });
    }
  }


  preloadPages(pageNumbers: number[]): Promise<void> {
    return Promise.all(
      pageNumbers.map(pageNumber => this.renderPage(pageNumber))
    ).then(() => {});
  }

  setPage(pageNumber: number): void {
    if (pageNumber < 1 || pageNumber > this.totalPages) return;

    const pagePosition = this.viewportManager.getScrollPositionForPage(pageNumber);
    if (this.container) {
      this.container.scrollTop = pagePosition;
    }
  }

  getZoom(): number {
    return this.currentScale;
  }

  setZoom(scale: number): void {
    const previousScale = this.currentScale;
    this.currentScale = Math.max(0.5, Math.min(5.0, scale));


    // Re-render visible pages with new scale
    this.reRenderVisiblePages();

    this.emit('zoomChanged', { scale: this.currentScale, previousScale });
  }

  zoomIn(): void {
    this.setZoom(this.currentScale * 1.2);
  }

  zoomOut(): void {
    this.setZoom(this.currentScale / 1.2);
  }

  resetZoom(): void {
    this.setZoom(1.5);
  }

  getCurrentPage(): number {
    return this.currentPage;
  }

  getTotalPages(): number {
    return this.totalPages;
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

  loadHighlights(data: HighlightData): void {
    this.highlightData = data;
    this.updateAnalytics();

    // Update unified layers for all rendered pages
    this.updateAllUnifiedLayers();

    // Update spatial indices
    this.buildAllSpatialIndices();

    this.emit('highlightsLoaded', { data });
  }

  addHighlight(pageNumber: number, highlight: TermOccurrence): void {
    // Add to first available category or create 'custom' category
    const categoryKey = Object.keys(this.highlightData)[0] || 'custom';

    if (!this.highlightData[categoryKey]) {
      this.highlightData[categoryKey] = { pages: {}, terms: {} };
    }

    if (!this.highlightData[categoryKey].pages[pageNumber.toString()]) {
      this.highlightData[categoryKey].pages[pageNumber.toString()] = [];
    }

    this.highlightData[categoryKey].pages[pageNumber.toString()].push(highlight);

    // Update page if rendered
    this.updatePageUnifiedLayer(pageNumber);
    this.buildSpatialIndexForPage(pageNumber);

    this.updateAnalytics();
    this.emit('highlightAdded', { pageNumber, highlight });
  }

  removeHighlight(termId: string): void {
    let found = false;

    // Remove from all categories
    Object.keys(this.highlightData).forEach(category => {
      Object.keys(this.highlightData[category].pages).forEach(pageNumber => {
        const page = this.highlightData[category].pages[pageNumber];
        const initialLength = page.length;

        this.highlightData[category].pages[pageNumber] = page.filter(
          highlight => highlight.termId !== termId
        );

        if (page.length !== initialLength) {
          found = true;
          this.updatePageUnifiedLayer(parseInt(pageNumber));
          this.buildSpatialIndexForPage(parseInt(pageNumber));
        }
      });

      // Remove from terms
      delete this.highlightData[category].terms[termId];
    });

    if (found) {
      this.updateAnalytics();
      this.emit('highlightRemoved', { termId });
    }
  }

  updateHighlightStyle(category: string, style: Partial<CategoryStyle>): void {
    this.styleManager.updateCategoryStyle(category, style);
    this.emit('styleUpdated', { category, style });
  }

  getHighlightsForPage(pageNumber: number): TermOccurrence[] {
    const highlights: TermOccurrence[] = [];

    Object.values(this.highlightData).forEach(categoryData => {
      const pageHighlights = categoryData.pages[pageNumber.toString()];
      if (pageHighlights) {
        highlights.push(...pageHighlights);
      }
    });

    return highlights;
  }

  /**
   * Update unified layer for a specific page
   */
  private updatePageUnifiedLayer(pageNumber: number): void {
    const pageContainer = this.pageContainers.get(pageNumber);
    if (!pageContainer) return;

    const pageData = this.pdfEngine.getPageData(pageNumber);
    if (!pageData || !pageData.textContent) return;

    this.layerBuilder.updateHighlights(this.highlightData, pageNumber, pageData.textContent);
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
      } catch (error) {
        pageContainer.style.height = `${this.defaultPageHeight}px`;
      }
    }

    // Calculate new average page height and update viewport manager
    const avgPageHeight = validDimensions > 0 ? totalHeight / validDimensions : this.defaultPageHeight;
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

    createHighlightFromSelection: (category: string): TermOccurrence | null => {
      const selectionData = this.textSelection.getSelectionWithContext();
      if (!selectionData) return null;

      // Create new term occurrence from selection
      const termId = `selection-${Date.now()}`;
      const occurrence: TermOccurrence = {
        termId,
        coordinates: [] // TODO: Calculate coordinates from selection
      };

      // Add to highlights
      selectionData.pages.forEach(pageNumber => {
        this.addHighlight(pageNumber, occurrence);
      });

      this.emit('selectionHighlighted', { text: selectionData.text, category, coordinates: [] });
      return occurrence;
    }
  };

  // =============================================================================
  // Navigation
  // =============================================================================

  goToHighlight(termId: string, occurrenceIndex: number = 0): void {
    // Find highlight location
    for (const [, categoryData] of Object.entries(this.highlightData)) {
      for (const [pageNumber, highlights] of Object.entries(categoryData.pages)) {
        const highlight = highlights.find(h => h.termId === termId);
        if (highlight && highlight.coordinates[occurrenceIndex]) {
          const page = parseInt(pageNumber);
          this.setPage(page);

          // TODO: Scroll to specific coordinates within page
          this.emit('navigationComplete', { termId, pageNumber: page, occurrenceIndex });
          return;
        }
      }
    }
  }

  nextHighlight(category?: string): void {
    // TODO: Implement next highlight navigation
    console.log('nextHighlight not yet implemented:', category);
  }

  previousHighlight(category?: string): void {
    // TODO: Implement previous highlight navigation
    console.log('previousHighlight not yet implemented:', category);
  }

  goToCoordinate(pageNumber: number, x: number, y: number): void {
    this.setPage(pageNumber);
    // TODO: Scroll to specific coordinates
    this.emit('coordinateNavigation', { pageNumber, x, y });
  }

  // =============================================================================
  // Search & Filter
  // =============================================================================

  searchTerms(query: string): TermMetadata[] {
    const results: TermMetadata[] = [];

    Object.values(this.highlightData).forEach(categoryData => {
      Object.values(categoryData.terms).forEach(term => {
        if (term.term.toLowerCase().includes(query.toLowerCase()) ||
            term.aliases.some(alias => alias.toLowerCase().includes(query.toLowerCase()))) {
          results.push(term);
        }
      });
    });

    return results;
  }

  filterByCategory(categories: string[]): void {
    // TODO: Implement category filtering
    console.log('filterByCategory not yet implemented:', categories);
  }

  highlightSearchResults(query: string): void {
    // TODO: Implement search result highlighting
    console.log('highlightSearchResults not yet implemented:', query);
  }

  clearSearchResults(): void {
    // TODO: Implement search result clearing
    console.log('clearSearchResults not yet implemented');
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

    // Add memory usage info
    const renderedPages = Array.from(this.pageContainers.entries())
      .filter(([_, container]) => container.classList.contains('rendered')).length;

    const memoryEstimate = renderedPages * 2; // ~2MB per rendered page

    return {
      ...baseMetrics,
      memoryUsage: {
        pages: renderedPages,
        highlights: Object.keys(this.highlightData).length,
        cache: this.pageDimensions.size,
        total: memoryEstimate
      }
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
    const renderedPages = Array.from(this.pageContainers.entries())
      .filter(([_, container]) => container.classList.contains('rendered')).length;

    return {
      renderedPages,
      totalPages: this.totalPages,
      estimatedMemoryMB: renderedPages * 2, // ~2MB per page
      cachedDimensions: this.pageDimensions.size
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

    setAriaLabels: (labels: { [key: string]: string }): void => {
      // Apply ARIA labels
      Object.entries(labels).forEach(([selector, label]) => {
        const elements = this.container?.querySelectorAll(selector);
        elements?.forEach(el => el.setAttribute('aria-label', label));
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
    }
  };

  // =============================================================================
  // Event Management
  // =============================================================================

  addEventListener(event: string, callback: (...args: any[]) => void): void {
    this.eventListeners.push({ event, callback });
  }

  removeEventListener(event: string, callback: (...args: any[]) => void): void {
    const index = this.eventListeners.findIndex(
      listener => listener.event === event && listener.callback === callback
    );
    if (index !== -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  emit(event: string, data?: any): void {
    this.eventListeners
      .filter(listener => listener.event === event)
      .forEach(listener => {
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

  exportAsImage(format: 'png' | 'jpeg' = 'png', quality: number = 0.9): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx || !this.pdfContainer) {
        reject(new Error('Canvas context not available'));
        return;
      }

      // TODO: Implement image export
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob'));
        }
      }, `image/${format}`, quality);
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
        height: this.container?.clientHeight || 0
      }
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

  /**
   * Add highlights to a rendered page
   */
  private async addHighlightsToPage(pageNumber: number, canvasWidth: number, canvasHeight: number): Promise<void> {
    const pageContainer = this.pageContainers.get(pageNumber);
    if (!pageContainer) return;

    // Check if highlights already added
    if (pageContainer.querySelector('.highlight-layer')) {
      return;
    }

    // Get the actual PDF page to get proper dimensions
    try {
      // Simple approach - just scale coordinates by the current zoom level
      // The coordinates in the JSON appear to be at scale 1.0
      const scale = this.currentScale;

      // Create highlight layer
      const highlightLayer = document.createElement('div');
      highlightLayer.className = 'highlight-layer';
      highlightLayer.style.position = 'absolute';
      highlightLayer.style.top = '0';
      highlightLayer.style.left = '0';
      highlightLayer.style.width = `${canvasWidth}px`;
      highlightLayer.style.height = `${canvasHeight}px`;
      highlightLayer.style.zIndex = '2'; // Above text layer
      highlightLayer.style.pointerEvents = 'none';

      // Add highlights from each category
      Object.entries(this.highlightData).forEach(([category, categoryData]) => {
        const pageHighlights = categoryData.pages[pageNumber.toString()];
        if (!pageHighlights) return;

        pageHighlights.forEach((highlight) => {
          if (highlight.coordinates && highlight.coordinates.length > 0) {

            highlight.coordinates.forEach(coord => {
              const highlightDiv = document.createElement('div');
              highlightDiv.className = `highlight ${category}-highlight`;
              highlightDiv.setAttribute('data-term-id', highlight.termId);
              highlightDiv.setAttribute('data-category', category);

              // Scale coordinates by current zoom level
              const left = coord.x1 * scale;
              const top = coord.y1 * scale;
              const width = (coord.x2 - coord.x1) * scale;
              const height = (coord.y2 - coord.y1) * scale;

              highlightDiv.style.position = 'absolute';
              highlightDiv.style.left = `${left}px`;
              highlightDiv.style.top = `${top}px`;
              highlightDiv.style.width = `${width}px`;
              highlightDiv.style.height = `${height}px`;
              highlightDiv.style.backgroundColor = this.getHighlightColor(highlight.termId, category);
              highlightDiv.style.border = `1px solid ${this.getHighlightColor(highlight.termId, category)}`;
              highlightDiv.style.pointerEvents = 'auto';
              highlightDiv.style.cursor = 'pointer';
              highlightDiv.style.boxSizing = 'border-box';
              highlightDiv.style.userSelect = 'none'; // Prevent highlight div from being selected
              highlightDiv.style.mixBlendMode = 'multiply'; // Better color blending

              // Check for overlapping highlights and adjust opacity
              const overlappingCount = this.countOverlappingHighlights(highlightLayer, coord, scale);
              const baseOpacity = Math.max(0.15, 0.3 / Math.max(1, overlappingCount * 0.7));
              highlightDiv.style.opacity = baseOpacity.toString();

              // todo make hover opacities configurable?
              // Add hover effect with dynamic opacity
              const originalOpacity = baseOpacity.toString();
              const hoverOpacity = Math.min(0.6, baseOpacity + 0.2).toString();

              highlightDiv.addEventListener('mouseenter', () => {
                if (this.options.highlightsConfig?.enableMultilineHover) {
                  const highlightBoxes = highlightLayer.querySelectorAll(`[data-term-id="${highlight.termId}"]`);
                  highlightBoxes.forEach((highlightBox) => {
                    (highlightBox as HTMLDivElement).style.opacity = hoverOpacity;
                  });
                  const unhoveredBoxes = highlightLayer.querySelectorAll(`div[data-term-id]:not([data-term-id="${highlight.termId}"])`);
                  unhoveredBoxes.forEach((highlightBox) => {
                    (highlightBox as HTMLDivElement).style.opacity = '0.1';
                  });
                } else {
                  highlightDiv.style.opacity = hoverOpacity;
                }
              });
              highlightDiv.addEventListener('mouseleave', () => {
                if (this.options.highlightsConfig?.enableMultilineHover) {
                  const allBoxes = highlightLayer.querySelectorAll(`div[data-term-id]`);
                  allBoxes.forEach((highlightBox) => {
                    (highlightBox as HTMLDivElement).style.opacity = originalOpacity;
                  });
                } else {
                  highlightDiv.style.opacity = originalOpacity;
                }
              });

              highlightLayer.appendChild(highlightDiv);
            });
          }
        });
      });

      pageContainer.appendChild(highlightLayer);

      // Apply selected term highlighting if there's a selected term
      if (this.selectedTermId) {
        this.applySelectionToPage(pageNumber);
      }
    } catch (error) {
      console.error(`Failed to add highlights to page ${pageNumber}:`, error);
    }
  }

  /**
   * Update highlights colors for specified page
   * */
  updateHighlightsStyles(pageNumber: number, hoveredIds?: string[]) {
    const pageContainer = this.pageContainers.get(pageNumber);
    if (!pageContainer) {
      return;
    }

    const highlightLayer = pageContainer.querySelector('.highlight-layer') as HTMLDivElement;
    if (!highlightLayer) {
      return;
    }

    // Find all highlights in this page
    const allHighlights = pageContainer.querySelectorAll('.highlight, .highlight-wrapper');
    allHighlights.forEach((highlight) => {
      const elementTermId = highlight.getAttribute('data-term-id');
      const category = highlight.getAttribute('data-category');

      if (elementTermId && category) {
        (highlight as HTMLDivElement).style.backgroundColor = this.getHighlightColor(elementTermId, category);
        (highlight as HTMLDivElement).style.border = `1px solid ${this.getHighlightColor(elementTermId, category)}`;

        if (this.options.highlightsConfig?.enableMultilineHover && hoveredIds && Array.isArray(hoveredIds)) {
          const baseOpacity = 0.3;
          const originalOpacity = baseOpacity.toString();
          const hoverOpacity = Math.min(0.6, baseOpacity + 0.2).toString();
          const unhoveredOpacity = '0.1';

          if (hoveredIds.includes(elementTermId)) {
            (highlight as HTMLDivElement).style.opacity = hoverOpacity;
          } else if (hoveredIds.length > 0) {
            (highlight as HTMLDivElement).style.opacity = unhoveredOpacity;
          } else {
            (highlight as HTMLDivElement).style.opacity = originalOpacity;
          }
        }
      }
    });
  }

  /**
   * Get highlight color
   */
  private getHighlightColor(termId: string, category: string): string {
    if (this.options.highlightsConfig && this.options.highlightsConfig.getHighlightColor) {
      return this.options.highlightsConfig.getHighlightColor(termId);
    }

    return this.getCategoryColor(category);
  }

  /**
   * Get color for highlight category
   */
  private getCategoryColor(category: string): string {
    const colors: { [key: string]: string } = {
      protein: '#ff6b6b',
      species: '#4ecdc4',
      chemical: '#45b7d1',
      disease: '#f7b731',
      gene: '#5f27cd',
      cell_line: '#00d2d3'
    };
    return colors[category] || '#666666';
  }

  /**
   * Build spatial index for a specific page
   */
  private buildSpatialIndexForPage(pageNumber: number): void {
    const highlights = this.getHighlightsForPage(pageNumber);
    this.performanceOptimizer.buildSpatialIndex(highlights, pageNumber);
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
   * Get highlight count for a page
   */
  private getHighlightCountForPage(pageNumber: number): number {
    return this.getHighlightsForPage(pageNumber).length;
  }

  /**
   * Update analytics data
   */
  private updateAnalytics(): void {
    let totalHighlights = 0;
    const categoryBreakdown: { [category: string]: number } = {};

    Object.entries(this.highlightData).forEach(([category, categoryData]) => {
      let categoryCount = 0;
      Object.values(categoryData.pages).forEach(highlights => {
        categoryCount += highlights.length;
      });
      categoryBreakdown[category] = categoryCount;
      totalHighlights += categoryCount;
    });

    this.analytics = {
      ...this.analytics,
      totalHighlights,
      categoryBreakdown
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
    this.clearSelectedTermHighlighting();

    // Add selected class to all instances of this term
    const termElements = this.container.querySelectorAll(`[data-term-id="${termId}"]`);

    termElements.forEach((element) => {
      element.classList.add('selected-term');

      // Override inline styles for selected term
      const htmlElement = element as HTMLElement;
      htmlElement.style.opacity = '0.75';
      htmlElement.style.filter = 'brightness(1.05) contrast(1.05) saturate(1.1)';
      htmlElement.style.boxShadow = '0 0 0 1px rgba(255, 255, 255, 0.6), 0 0 4px rgba(102, 126, 234, 0.3)';
      htmlElement.style.transform = 'scale(1.02)';
      htmlElement.style.zIndex = '12';
      htmlElement.style.borderWidth = '1px';
      htmlElement.style.transition = 'all 0.3s ease';
    });

    // Also dim all other highlights
    const allHighlights = this.container.querySelectorAll('.highlight, .highlight-wrapper');

    allHighlights.forEach(element => {
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
  clearSelectedTermHighlighting(): void {
    if (!this.container) return;

    // Clear the selected term ID
    this.selectedTermId = null;

    const selectedElements = this.container.querySelectorAll('.selected-term');
    selectedElements.forEach(element => {
      element.classList.remove('selected-term');

      // Reset inline styles for selected elements
      const htmlElement = element as HTMLElement;
      htmlElement.style.filter = '';
      htmlElement.style.boxShadow = '';
      htmlElement.style.transform = '';
      htmlElement.style.borderWidth = '';
      // Keep original opacity as it was set by the original rendering
    });

    const dimmedElements = this.container.querySelectorAll('.dimmed-highlight');
    dimmedElements.forEach(element => {
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
      textContent.items.forEach((item: any) => {
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
          const angle = Math.atan2(transform[1], transform[0]) * 180 / Math.PI;
          textSpan.style.transform = `rotate(${angle}deg)`;
        }

        textLayer.appendChild(textSpan);
      });

      pageContainer.appendChild(textLayer);

      console.log(`Text layer added to page ${pageNumber} with ${textContent.items.length} text items`);
      console.log('Text span style applied:', textLayer.children[0]?.getAttribute('style'));
    } catch (error) {
      console.error(`Failed to add text layer to page ${pageNumber}:`, error);
    }
  }

  /**
   * Count overlapping highlights at the same coordinates
   */
  private countOverlappingHighlights(highlightLayer: HTMLElement, coord: any, scale: number): number {
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
    allHighlights.forEach(element => {
      const elementTermId = element.getAttribute('data-term-id');
      const htmlElement = element as HTMLElement;

      if (elementTermId === this.selectedTermId) {
        // Apply selected styling to matching terms
        element.classList.add('selected-term');
        element.classList.remove('dimmed-highlight');

        htmlElement.style.opacity = '0.75';
        htmlElement.style.filter = 'brightness(1.05) contrast(1.05) saturate(1.1)';
        htmlElement.style.boxShadow = '0 0 0 1px rgba(255, 255, 255, 0.6), 0 0 4px rgba(102, 126, 234, 0.3)';
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
    this.styleManager.destroy();

    // Clear DOM references
    this.container = null;
    this.pdfContainer = null;
    this.pageContainers.clear();

    // Clear state
    this.eventListeners = [];
    this.highlightData = {};
    this.isInitialized = false;

    this.emit('destroyed');
  }
}

export default PDFHighlightViewer;
