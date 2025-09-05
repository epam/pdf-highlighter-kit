
import { ViewportManager as IViewportManager, Priority, Viewport, BoundingBox } from '../types';

export class ViewportManager implements IViewportManager {
  private containerHeight: number = 0;
  private pageHeight: number = 800; // Default page height
  private pageGap: number = 10; // Gap between pages
  private bufferSize: number;
  private maxCachedPages: number;
  private totalPages: number = 0;

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
   * Calculate visible pages based on scroll position
   */
  getVisiblePages(scrollTop: number, containerHeight: number): number[] {
    const visiblePages: number[] = [];
    
    // Calculate which pages are in viewport
    const startY = scrollTop;
    const endY = scrollTop + containerHeight;
    
    // Find first page that intersects viewport
    const firstPage = Math.max(1, Math.floor(startY / (this.pageHeight + this.pageGap)) + 1);
    
    // Find last page that intersects viewport  
    const lastPage = Math.min(this.totalPages, Math.ceil(endY / (this.pageHeight + this.pageGap)));
    
    for (let page = firstPage; page <= lastPage; page++) {
      visiblePages.push(page);
    }
    
    return visiblePages;
  }

  /**
   * Get buffer pages around visible pages
   */
  getBufferPages(visiblePages: number[], bufferSize: number = this.bufferSize): number[] {
    if (visiblePages.length === 0) return [];
    
    const minPage = Math.min(...visiblePages);
    const maxPage = Math.max(...visiblePages);
    
    const bufferPages: number[] = [];
    
    // Add buffer pages before visible range
    for (let i = Math.max(1, minPage - bufferSize); i < minPage; i++) {
      bufferPages.push(i);
    }
    
    // Add buffer pages after visible range
    for (let i = maxPage + 1; i <= maxPage + bufferSize; i++) {
      bufferPages.push(i);
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
  getRenderingStrategy(scrollTop: number, containerHeight: number): {
    highPriority: number[];
    mediumPriority: number[];
    lowPriority: number[];
    unloadPages: number[];
  } {
    const visiblePages = this.getVisiblePages(scrollTop, containerHeight);
    const bufferPages = this.getBufferPages(visiblePages);
    
    // High priority: visible pages
    const highPriority = visiblePages;
    
    // Medium priority: buffer pages
    const mediumPriority = bufferPages;
    
    // Low priority: reasonable preload pages to prevent white boxes
    const lowPriority: number[] = [];
    if (visiblePages.length > 0) {
      const minVisible = Math.min(...visiblePages);
      const maxVisible = Math.max(...visiblePages);
      const preloadSize = 2; // Increased back to 2
      
      // Preload pages before buffer
      for (let i = Math.max(1, minVisible - this.bufferSize - preloadSize); 
           i < minVisible - this.bufferSize; i++) {
        if (i >= 1) lowPriority.push(i);
      }
      
      // Preload pages after buffer
      for (let i = maxVisible + this.bufferSize + 1; 
           i <= Math.min(this.totalPages, maxVisible + this.bufferSize + preloadSize); i++) {
        if (i <= this.totalPages) lowPriority.push(i);
      }
    }
    
    // Pages to unload (far from current view) - more aggressive unloading
    const unloadPages: number[] = [];
    const currentCenter = visiblePages.length > 0 
      ? Math.floor((Math.min(...visiblePages) + Math.max(...visiblePages)) / 2)
      : 1;
    
    // Mark pages for unloading if they're beyond threshold (more conservative)
    const unloadThreshold = this.bufferSize + 7; // Increased to be less aggressive
    for (let page = 1; page <= this.totalPages; page++) {
      const distance = Math.abs(page - currentCenter);
      if (distance > unloadThreshold) {
        unloadPages.push(page);
      }
    }
    
    return {
      highPriority,
      mediumPriority,
      lowPriority,
      unloadPages
    };
  }

  /**
   * Calculate page position in viewport
   */
  getPagePosition(pageNumber: number): { top: number; bottom: number } {
    const top = (pageNumber - 1) * (this.pageHeight + this.pageGap);
    const bottom = top + this.pageHeight;
    
    return { top, bottom };
  }

  /**
   * Calculate which page contains a specific Y coordinate
   */
  getPageAtPosition(y: number): number {
    return Math.max(1, Math.floor(y / (this.pageHeight + this.pageGap)) + 1);
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
   * Get optimal scroll position to center a page
   */
  getScrollPositionForPage(pageNumber: number): number {
    const pagePos = this.getPagePosition(pageNumber);
    const pageCenter = pagePos.top + (this.pageHeight / 2);
    const viewportCenter = this.containerHeight / 2;
    
    return Math.max(0, pageCenter - viewportCenter);
  }

  /**
   * Calculate viewport bounds for spatial indexing
   */
  getViewportBounds(
    scrollTop: number, 
    containerHeight: number,
    scale: number = 1
  ): BoundingBox {
    return {
      x1: 0,
      y1: scrollTop / scale,
      x2: Number.MAX_SAFE_INTEGER, // Full width
      y2: (scrollTop + containerHeight) / scale
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
    const predictedScrollTop = currentScrollTop + (scrollVelocity * deltaTime);
    const predictedVisiblePages = this.getVisiblePages(predictedScrollTop, this.containerHeight);
    
    return {
      scrollTop: predictedScrollTop,
      visiblePages: predictedVisiblePages
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
      totalMB: highPriorityMB + mediumPriorityMB + lowPriorityMB
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
      containerHeight: this.containerHeight
    };
  }
}