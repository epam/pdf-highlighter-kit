import {
  PDFSource,
  ViewerOptions,
  LoadPDFOptions,
  TextRange,
  SelectionWithMetadata,
  PerformanceMetrics,
  HighlightAnalytics,
  AccessibilityFeatures,
  InteractionMode,
  InputHighlightData,
  HighlightStyle,
  HighlightLabelStyle,
  ZoomValue,
  ThumbnailOptions,
  PageRotationDegrees,
  RotationDirection,
} from './types';

export interface PDFHighlightViewer {
  init(container: HTMLElement, options?: ViewerOptions): Promise<void>;

  loadPDF(source: PDFSource, options?: LoadPDFOptions): Promise<void>;

  preloadPages(pageNumbers: number[]): Promise<void>;

  setPage(pageNumber: number): void;

  getZoom(): number;

  setZoom(value: ZoomValue): void;

  getCurrentPage(): number;

  getTotalPages(): number;

  /**
   * Set extra clockwise display rotation for a page (on top of PDF intrinsic rotation).
   * Pass degrees 0 to clear. For non-zero, direction selects CW vs CCW for that angle.
   */
  setPageDisplayRotation(
    pageNumber: number,
    degrees: PageRotationDegrees,
    direction?: RotationDirection
  ): void;

  getPageDisplayRotation(pageNumber: number): PageRotationDegrees;

  getThumbnails(
    pageNumbers: number[],
    options?: ThumbnailOptions
  ): Promise<Map<number, HTMLCanvasElement>>;

  getThumbnailsDataUrl(
    pageNumbers: number[],
    options?: ThumbnailOptions
  ): Promise<Map<number, string>>;

  loadHighlights(data: InputHighlightData[]): void;

  addHighlight(highlight: InputHighlightData): void;

  removeHighlight(termId: string): void;

  updateHighlightStyle(
    termId: string,
    style: Partial<HighlightStyle>,
    labelStyle?: Partial<HighlightLabelStyle>
  ): void;

  textSelection: {
    enable(): void;

    disable(): void;

    getSelection(): string;

    getSelectionWithContext(): SelectionWithMetadata | null;

    clearSelection(): void;

    selectText(range: TextRange): void;

    copySelection(format?: 'plain' | 'formatted' | 'citation'): void;

    createHighlightFromSelection(style?: HighlightStyle): InputHighlightData | null;
  };

  goToHighlight(termId: string, occurrenceIndex?: number): void;

  nextHighlight(): void;

  previousHighlight(): void;

  goToCoordinate(pageNumber: number, x: number, y: number): void;

  setInteractionMode(mode: InteractionMode): void;

  getInteractionMode(): InteractionMode;

  getPerformanceMetrics(): PerformanceMetrics;

  getAnalytics(): HighlightAnalytics;

  enableProfiling(): void;

  disableProfiling(): void;

  accessibility: AccessibilityFeatures;

  addEventListener(event: string, callback: (...args: unknown[]) => void): void;

  removeEventListener(event: string, callback: (...args: unknown[]) => void): void;

  emit(event: string, data?: unknown): void;

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
