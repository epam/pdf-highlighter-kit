import { ViewportManager as IViewportManager, Priority, Viewport, BoundingBox } from '../types';

export class ViewportManager implements IViewportManager {
  private containerHeight: number = 0;
  private pageHeight: number = 800; // Default page height
  private pageGap: number = 20; // Gap between pages
  private bufferSize: number;
  private maxCachedPages: number;
  private totalPages: number = 0;
  private selectedPages: number[] | null = null; // When set, only these physical page numbers participate in layout/visibility. null = all pages.

  constructor(
    bufferSize: number = 2, // Restored to 2 to prevent white boxes
    maxCachedPages: number = 8 // Increased to 8 for better user experience
  ) {
    this.bufferSize = bufferSize;
    this.maxCachedPages = maxCachedPages;
  }

  /**
   * Update container dimensions
   */
  updateDimensions(containerHeight: number, pageHeight: number = 800): void {
    this.containerHeight = containerHeight;
    this.pageHeight = pageHeight;
  }

  /**
   * Set total pages
   */
  setTotalPages(totalPages: number): void {
    this.totalPages = totalPages;
  }

  /**
   * Set the subset of pages to show. When null, all pages 1..totalPages are used.
   */
  setSelectedPages(pages: number[] | null): void {
    this.selectedPages = pages;
  }

  /**
   * Calculate visible pages based on scroll position.
   * When selectedPages is set, returns physical page numbers from that list; otherwise 1..totalPages.
   */
  getVisiblePages(scrollTop: number, containerHeight: number): number[] {
    const list = this.getEffectivePageList();
    if (!list.length) return [];

    // Calculate which pages are in viewport
    const startY = scrollTop;
    const endY = scrollTop + containerHeight;
    const pageStep = this.pageHeight + this.pageGap;

    // Find first page that intersects viewport
    const firstIndex = Math.max(0, Math.floor(startY / pageStep));
    // Find last page that intersects viewport
    const lastIndex = Math.min(list.length - 1, Math.ceil(endY / pageStep) - 1);

    // Collect visible pages
    const visiblePages: number[] = [];
    for (let i = firstIndex; i <= lastIndex; i++) {
      visiblePages.push(list[i]);
    }
    return visiblePages;
  }

  /**
   * Get buffer pages around visible pages (physical page numbers).
   * When selectedPages is set, buffer is limited to that list.
   */
  getBufferPages(visiblePages: number[], bufferSize: number = this.bufferSize): number[] {
    if (visiblePages.length === 0) return [];

    const list = this.getEffectivePageList();
    const minPage = Math.min(...visiblePages);
    const maxPage = Math.max(...visiblePages);

    const minIdx = list.indexOf(minPage);
    const maxIdx = list.indexOf(maxPage);
    if (minIdx === -1 || maxIdx === -1) return [];

    const bufferPages: number[] = [];
    // Add buffer pages before visible range (by index in list)
    for (let i = Math.max(0, minIdx - bufferSize); i < minIdx; i++) {
      bufferPages.push(list[i]);
    }
    // Add buffer pages after visible range (by index in list)
    for (let i = maxIdx + 1; i <= Math.min(list.length - 1, maxIdx + bufferSize); i++) {
      bufferPages.push(list[i]);
    }

    return bufferPages;
  }

  /**
   * Queue pages for rendering with appropriate priority
   */
  queuePagesForRendering(pages: number[], priority: Priority): void {
    // This will be called by the consumer (PDFEngine)
    // Implementation is handled by the engine that uses this manager
  }

  /**
   * Determine which pages to unload based on distance from current view
   */
  unloadDistantPages(currentPage: number, threshold: number = 5): void {
    // This will be called by the consumer (PDFEngine)
    // Implementation is handled by the engine that uses this manager
  }

  /**
   * Get rendering strategy for current viewport
   */
  getRenderingStrategy(
    scrollTop: number,
    containerHeight: number
  ): {
    highPriority: number[];
    mediumPriority: number[];
    lowPriority: number[];
    unloadPages: number[];
  } {
    const list = this.getEffectivePageList();
    const visiblePages = this.getVisiblePages(scrollTop, containerHeight);
    const bufferPages = this.getBufferPages(visiblePages);

    // High priority: visible pages
    const highPriority = visiblePages;

    // Medium priority: buffer pages
    const mediumPriority = bufferPages;

    // Low priority: reasonable preload pages to prevent white boxes
    const lowPriority: number[] = [];
    // If there are visible pages and effective page list is not empty
    if (visiblePages.length > 0 && list.length > 0) {
      const minVisible = Math.min(...visiblePages);
      const maxVisible = Math.max(...visiblePages);
      const minIdx = list.indexOf(minVisible);
      const maxIdx = list.indexOf(maxVisible);
      const preloadSize = 2; // Increased back to 2

      // Preload pages before buffer
      for (
        let i = Math.max(0, minIdx - this.bufferSize - preloadSize);
        i < minIdx - this.bufferSize;
        i++
      ) {
        lowPriority.push(list[i]);
      }
      // Preload pages after buffer
      for (
        let i = maxIdx + this.bufferSize + 1;
        i <= Math.min(list.length - 1, maxIdx + this.bufferSize + preloadSize);
        i++
      ) {
        lowPriority.push(list[i]);
      }
    }

    // Pages to unload (far from current view) - more aggressive unloading
    const unloadPages: number[] = [];
    if (list.length > 0 && visiblePages.length > 0) {
      const minVisible = Math.min(...visiblePages);
      const maxVisible = Math.max(...visiblePages);
      const centerIdx = Math.floor((list.indexOf(minVisible) + list.indexOf(maxVisible)) / 2);
      // Mark pages for unloading if they're beyond threshold (more conservative)
      const unloadThreshold = this.bufferSize + 7; // Increased to be less aggressive
      for (let i = 0; i < list.length; i++) {
        if (Math.abs(i - centerIdx) > unloadThreshold) {
          unloadPages.push(list[i]);
        }
      }
    }

    return {
      highPriority,
      mediumPriority,
      lowPriority,
      unloadPages,
    };
  }

  /**
   * List of physical page numbers that participate in layout (either selectedPages or 1..totalPages).
   */
  private getEffectivePageList(): number[] {
    if (this.selectedPages && this.selectedPages.length > 0) {
      return this.selectedPages;
    }
    const list: number[] = [];
    for (let i = 1; i <= this.totalPages; i++) {
      list.push(i);
    }
    return list;
  }

  /**
   * Calculate page position in viewport (by index in effective page list when selectedPages is set).
   */
  getPagePosition(pageNumber: number): { top: number; bottom: number } {
    const list = this.getEffectivePageList();
    const idx = list.indexOf(pageNumber);
    if (idx === -1) {
      return { top: 0, bottom: this.pageHeight };
    }
    const top = idx * (this.pageHeight + this.pageGap);
    const bottom = top + this.pageHeight;
    return { top, bottom };
  }

  /**
   * Calculate which page contains a specific Y coordinate
   */
  getPageAtPosition(y: number): number {
    const list = this.getEffectivePageList();
    if (!list.length) return 1;
    const idx = Math.max(
      0,
      Math.min(list.length - 1, Math.floor(y / (this.pageHeight + this.pageGap)))
    );
    return list[idx];
  }

  /**
   * Check if a page is visible in current viewport
   */
  isPageVisible(pageNumber: number, scrollTop: number, containerHeight: number): boolean {
    const pagePos = this.getPagePosition(pageNumber);
    const viewportTop = scrollTop;
    const viewportBottom = scrollTop + containerHeight;

    // Check if page intersects with viewport
    return !(pagePos.bottom < viewportTop || pagePos.top > viewportBottom);
  }

  /**
   * Get optimal scroll position to center a page. When selectedPages is set, only pages in the list have valid positions.
   */
  getScrollPositionForPage(pageNumber: number): number {
    // Page not in displayed list (e.g. not in selectedPages) — return 0 so we don't scroll to a fake position
    const list = this.getEffectivePageList();
    const idx = list.indexOf(pageNumber);
    if (idx === -1) return 0;
    const pagePos = this.getPagePosition(pageNumber);
    const pageCenter = pagePos.top + this.pageHeight / 2;
    const viewportCenter = this.containerHeight / 2;
    return Math.max(0, pageCenter - viewportCenter);
  }

  /**
   * Calculate viewport bounds for spatial indexing
   */
  getViewportBounds(scrollTop: number, containerHeight: number, scale: number = 1): BoundingBox {
    return {
      x1: 0,
      y1: scrollTop / scale,
      x2: Number.MAX_SAFE_INTEGER, // Full width
      y2: (scrollTop + containerHeight) / scale,
    };
  }

  /**
   * Performance optimization: predict next viewport based on scroll direction
   */
  predictNextViewport(
    currentScrollTop: number,
    scrollVelocity: number,
    deltaTime: number
  ): { scrollTop: number; visiblePages: number[] } {
    const predictedScrollTop = currentScrollTop + scrollVelocity * deltaTime;
    const predictedVisiblePages = this.getVisiblePages(predictedScrollTop, this.containerHeight);

    return {
      scrollTop: predictedScrollTop,
      visiblePages: predictedVisiblePages,
    };
  }

  /**
   * Get memory usage estimation for current strategy
   */
  estimateMemoryUsage(strategy: ReturnType<typeof this.getRenderingStrategy>): {
    highPriorityMB: number;
    mediumPriorityMB: number;
    lowPriorityMB: number;
    totalMB: number;
  } {
    const estimatedPageSizeMB = 2; // Rough estimate per rendered page

    const highPriorityMB = strategy.highPriority.length * estimatedPageSizeMB;
    const mediumPriorityMB = strategy.mediumPriority.length * estimatedPageSizeMB;
    const lowPriorityMB = strategy.lowPriority.length * estimatedPageSizeMB;

    return {
      highPriorityMB,
      mediumPriorityMB,
      lowPriorityMB,
      totalMB: highPriorityMB + mediumPriorityMB + lowPriorityMB,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: {
    bufferSize?: number;
    maxCachedPages?: number;
    pageHeight?: number;
    pageGap?: number;
  }): void {
    if (config.bufferSize !== undefined) {
      this.bufferSize = config.bufferSize;
    }
    if (config.maxCachedPages !== undefined) {
      this.maxCachedPages = config.maxCachedPages;
    }
    if (config.pageHeight !== undefined) {
      this.pageHeight = config.pageHeight;
    }
    if (config.pageGap !== undefined) {
      this.pageGap = config.pageGap;
    }
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return {
      bufferSize: this.bufferSize,
      maxCachedPages: this.maxCachedPages,
      pageHeight: this.pageHeight,
      pageGap: this.pageGap,
      containerHeight: this.containerHeight,
    };
  }
}
