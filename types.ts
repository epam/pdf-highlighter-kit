export type Priority = 'high' | 'medium' | 'low' | 'idle';

export interface BBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  page: number;
}

export interface HighlightStyle {
  backgroundColor: string;
  borderColor?: string;
  borderWidth?: string;
  opacity?: number;
  hoverOpacity?: number;
  pulseAnimation?: boolean;
}

export interface InputHighlightData {
  id: string;
  bboxes: BBox[];
  style?: HighlightStyle;
  tooltipText?: string;
  metadata?: Record<string, any>;
}

export interface RenderingQueue {
  high: Page[];
  medium: Page[];
  low: Page[];
  idle: Page[];
}

export interface ViewportManager {
  getVisiblePages(scrollTop: number, containerHeight: number): number[];
  getBufferPages(visiblePages: number[], bufferSize: number): number[];
  queuePagesForRendering(pages: number[], priority: Priority): void;
  unloadDistantPages(currentPage: number, threshold: number): void;
  setTotalPages(totalPages: number): void;
  getRenderingStrategy(
    scrollTop: number,
    containerHeight: number
  ): {
    highPriority: number[];
    mediumPriority: number[];
    lowPriority: number[];
    unloadPages: number[];
  };
}

export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  bounds: BoundingBox;
}

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TermOccurrence {
  termId: string;
  coordinates: BoundingBox[];
}

export interface TermMetadata {
  term: string;
  category: string;
  frequency: number;
  aliases: string[];
  relatedTerms: string[];
  pages: number[];
  explanations: {
    page: number;
    coordinates: BoundingBox;
    text: string;
  }[];
}

export type HighlightData = Record<
  string,
  {
    pages: Record<string, TermOccurrence[]>;
    terms: Record<string, TermMetadata>;
  }
>;

export interface TextContent {
  items: TextItem[];
  styles: any;
}

export interface TextItem {
  str: string;
  dir: string;
  width: number;
  height: number;
  transform: number[];
  fontName: string;
}

export interface Segment {
  text: string;
  bounds: BoundingBox;
  hasHighlight: boolean;
  highlightInfo?: {
    termId: string;
    category: string;
  };
  transform: number[];
  fontName: string;
}

export interface AnalysisResult {
  segments: Segment[];
  highlightRanges: {
    start: number;
    end: number;
    termId: string;
    category: string;
  }[];
}

export type InteractionIntent = 'highlight-interact' | 'text-select' | 'auto';
export type InteractionMode = 'select' | 'highlight' | 'hybrid';

export interface SelectionState {
  isSelecting: boolean;
  startPoint: { x: number; y: number } | null;
  endPoint: { x: number; y: number } | null;
  selectedText: string;
  overlappingHighlights: TermOccurrence[];
}

export interface TextRange {
  startPage: number;
  endPage: number;
  startOffset: number;
  endOffset: number;
}

export interface SelectionWithMetadata {
  text: string;
  pages: number[];
  highlights: TermOccurrence[];
  context: string;
  range: TextRange;
}

export interface HighlightHoverEvent {
  termId: string;
  category: string;
  coordinates: BoundingBox;
  pageNumber: number;
  mouseEvent: MouseEvent;
}

export interface HighlightClickEvent {
  termId: string;
  category: string;
  coordinates: BoundingBox;
  pageNumber: number;
  mouseEvent: MouseEvent;
}

export interface HighlightSelectEvent {
  termId: string;
  category: string;
  occurrences: TermOccurrence[];
}

export interface TextSelectionEvent {
  text: string;
  highlights: TermOccurrence[];
  range: Range;
  pageNumbers: number[];
}

export interface SelectionCopyEvent {
  text: string;
  format: 'plain' | 'formatted' | 'citation';
}

export interface SelectionHighlightEvent {
  text: string;
  category: string;
  coordinates: BoundingBox[];
}

export interface PageChangeEvent {
  currentPage: number;
  previousPage: number;
  totalPages: number;
}

export interface ZoomChangeEvent {
  scale: number;
  previousScale: number;
}

export interface RenderCompleteEvent {
  pageNumber: number;
  renderTime: number;
  highlightCount: number;
}

export interface PerformanceWarningEvent {
  type: string;
  message: string;
  metrics: any;
}

export interface CategoryStyle {
  backgroundColor: string;
  borderColor: string;
  opacity?: number;
  hoverOpacity?: number;
  pulseAnimation?: boolean;
}

export interface CategoryStyleManager {
  registerCategory(name: string, style: CategoryStyle): void;
  getComputedStyle(termId: string, state: 'default' | 'hover' | 'selected'): React.CSSProperties;
}

export interface MemoryMetrics {
  pages: number;
  highlights: number;
  cache: number;
  total?: number;
}

export interface PerformanceMetrics {
  renderTime: number;
  highlightRenderTime: number;
  interactionLatency: number;
  memoryUsage: MemoryMetrics;
  fps: number;
}

export interface UserAction {
  type: string;
  timestamp: number;
  data: any;
}

export interface HighlightAnalytics {
  totalHighlights: number;
  categoryBreakdown: Record<string, number>;
  mostViewedPages: number[];
  interactionHeatmap: Record<number, number>;
  averageTimePerPage: number;
}

export interface Page {
  pageNumber: number;
  canvas?: HTMLCanvasElement;
  textContent?: TextContent;
  highlights?: TermOccurrence[];
  rendered: boolean;
  loading: boolean;
  viewport?: any;
  scale?: number;
}

export interface HighlightsConfig {
  enableMultilineHover?: boolean;
  getHighlightColor?: (termId: string) => string;
}

export interface ViewerOptions {
  enableTextSelection?: boolean;
  enableVirtualScrolling?: boolean;
  bufferPages?: number;
  maxCachedPages?: number;
  interactionMode?: InteractionMode;
  performanceMode?: boolean;
  accessibility?: boolean;
  highlightsConfig?: HighlightsConfig;
}

export interface AccessibilityFeatures {
  enableKeyboardNavigation(): void;
  enableScreenReader(): void;
  setAriaLabels(labels: Record<string, string>): void;
  announceHighlight(termId: string): void;
}

export interface HeavyTask {
  type: 'text-extraction' | 'highlight-processing' | 'spatial-indexing';
  data: any;
  pageNumber?: number;
}

export interface RTree {
  insert(bounds: BoundingBox, data: any): void;
  search(bounds: BoundingBox): any[];
  remove(bounds: BoundingBox, data: any): void;
}

export interface EventSystem {
  onHighlightHover: (event: HighlightHoverEvent) => void;
  onHighlightClick: (event: HighlightClickEvent) => void;
  onHighlightSelect: (event: HighlightSelectEvent) => void;

  onTextSelected: (event: TextSelectionEvent) => void;
  onSelectionCopied: (event: SelectionCopyEvent) => void;
  onSelectionHighlighted: (event: SelectionHighlightEvent) => void;

  onPageChanged: (event: PageChangeEvent) => void;
  onZoomChanged: (event: ZoomChangeEvent) => void;

  onRenderComplete: (event: RenderCompleteEvent) => void;
  onPerformanceWarning: (event: PerformanceWarningEvent) => void;
}
