export type Priority = 'high' | 'medium' | 'low' | 'idle';

export interface BBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  page: number;
}

export interface PageBBoxRef {
  id: string;
  page: number;
  bboxIndex: number;
  bbox: BoundingBox;
}

export interface HighlightsIndex {
  highlights: InputHighlightData[];
  byId: Map<string, InputHighlightData>;
  pages: Record<string, PageBBoxRef[]>;
  occurrences: PageBBoxRef[];
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
    style?: HighlightStyle;
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
  }[];
}

export type InteractionIntent = 'highlight-interact' | 'text-select' | 'auto';
export type InteractionMode = 'select' | 'highlight' | 'hybrid';

export interface SelectionState {
  isSelecting: boolean;
  startPoint: { x: number; y: number } | null;
  endPoint: { x: number; y: number } | null;
  selectedText: string;
  overlappingHighlights: PageBBoxRef[];
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
  highlights: PageBBoxRef[];
  context: string;
  range: TextRange;
}

export interface HighlightHoverEvent {
  termId: string;
  pageNumber: number;
  bboxIndex?: number;
  bbox?: BoundingBox;
  highlight?: InputHighlightData;
  mouseEvent: MouseEvent;
}

export interface HighlightClickEvent {
  termId: string;
  pageNumber: number;
  bboxIndex?: number;
  bbox?: BoundingBox;
  highlight?: InputHighlightData;
  mouseEvent: MouseEvent;
}

export interface HighlightSelectEvent {
  termId: string;
  occurrences: PageBBoxRef[];
}

export interface TextSelectionEvent {
  text: string;
  highlights: PageBBoxRef[];
  range: Range;
  pageNumbers: number[];
}

export interface SelectionCopyEvent {
  text: string;
  format: 'plain' | 'formatted' | 'citation';
}

export interface SelectionHighlightEvent {
  text: string;
  termId: string;
  highlight: InputHighlightData;
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
  mostViewedPages: number[];
  interactionHeatmap: Record<number, number>;
  averageTimePerPage: number;
}

export interface Page {
  pageNumber: number;
  canvas?: HTMLCanvasElement;
  textContent?: TextContent;
  rendered: boolean;
  loading: boolean;
  viewport?: any;
  scale?: number;
}

export interface HighlightsConfig {
  enableMultilineHover?: boolean;
  defaultStyle?: HighlightStyle; // optional fallback if highlight.style is missing
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

export interface SpatialHit {
  termId: string;
  pageNumber: number;
  bboxIndex: number;
  coordinates: BoundingBox;
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

export enum ZoomMode {
  AUTO = 'auto',
  PAGE_FIT = 'page-fit',
}

export type ZoomValue = ZoomMode | number;
