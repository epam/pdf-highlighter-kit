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

export interface PDFHighlightViewer {
  init(container: HTMLElement, options?: ViewerOptions): Promise<void>;

  loadPDF(source: string | ArrayBuffer | Blob): Promise<void>;

  preloadPages(pageNumbers: number[]): Promise<void>;

  setPage(pageNumber: number): void;

  getZoom(): number;

  setZoom(scale: number): void;

  getCurrentPage(): number;

  getTotalPages(): number;

  loadHighlights(data: HighlightData): void;

  addHighlight(pageNumber: number, highlight: TermOccurrence): void;

  removeHighlight(termId: string): void;

  updateHighlightStyle(category: string, style: Partial<CategoryStyle>): void;

  getHighlightsForPage(pageNumber: number): TermOccurrence[];

  textSelection: {
    enable(): void;

    disable(): void;

    getSelection(): string;

    getSelectionWithContext(): SelectionWithMetadata | null;

    clearSelection(): void;

    selectText(range: TextRange): void;

    copySelection(format?: 'plain' | 'formatted' | 'citation'): void;

    createHighlightFromSelection(category: string): TermOccurrence | null;
  };


  goToHighlight(termId: string, occurrenceIndex?: number): void;

  nextHighlight(category?: string): void;

  previousHighlight(category?: string): void;

  goToCoordinate(pageNumber: number, x: number, y: number): void;


  searchTerms(query: string): TermMetadata[];

  filterByCategory(categories: string[]): void;

  highlightSearchResults(query: string): void;

  clearSearchResults(): void;


  setInteractionMode(mode: InteractionMode): void;

  getInteractionMode(): InteractionMode;


  getPerformanceMetrics(): PerformanceMetrics;

  getAnalytics(): HighlightAnalytics;

  enableProfiling(): void;

  disableProfiling(): void;


  accessibility: AccessibilityFeatures;


  addEventListener(event: string, callback: (...args: any[]) => void): void;

  removeEventListener(event: string, callback: (...args: any[]) => void): void;

  emit(event: string, data?: any): void;


  exportAsImage(format?: 'png' | 'jpeg', quality?: number): Promise<Blob>;

  getViewport(): {
    pageNumber: number;
    scale: number;
    scrollTop: number;
    visibleArea: { x: number; y: number; width: number; height: number };
  };

  refresh(): void;


  destroy(): void;
}
