import { PDFHighlightViewer } from './PDFHighlightViewer';
import type { ViewerOptions } from './types';

export { PDFHighlightViewer } from './PDFHighlightViewer';

export type { PDFHighlightViewer as IPDFHighlightViewer } from './api';

export type {
  ViewerOptions,
  HighlightData,
  TermOccurrence,
  TermMetadata,
  CategoryStyle,
  TextRange,
  SelectionWithMetadata,
  PerformanceMetrics,
  HighlightAnalytics,
  AccessibilityFeatures,
  InteractionMode,
  BoundingBox,
  Viewport,
  Priority,
  Segment,
  TextContent,
  TextItem,
  Page,
  RenderingQueue,
  InteractionIntent,
  SelectionState,
  HighlightHoverEvent,
  HighlightClickEvent,
  HighlightSelectEvent,
  TextSelectionEvent,
  SelectionCopyEvent,
  SelectionHighlightEvent,
  PageChangeEvent,
  ZoomChangeEvent,
  RenderCompleteEvent,
  PerformanceWarningEvent,
  MemoryMetrics,
  UserAction,
  AnalysisResult,
  HeavyTask,
  EventSystem
} from './types';

export { PDFEngine } from './core/pdf-engine';
export { ViewportManager } from './core/viewport-manager';
export { UnifiedLayerBuilder } from './core/unified-layer-builder';
export { TextSegmentation } from './core/text-segmentation';
export { UnifiedInteractionHandler } from './core/interaction-handler';
export { 
  PerformanceOptimizer,
  MemoryManager,
  RenderOptimizer,
  WorkerTaskManager,
  RTree
} from './core/performance-optimizer';
export { CategoryStyleManager } from './core/style-manager';

export { 
  b64toBlob,
  b64toArrayBuffer,
  blobToArrayBuffer,
  detectPDFSourceType,
  normalizePDFSource,
  validateBase64PDF,
  extractPDFMetadata,
  createPDFDataURL,
  processBase64InChunks
} from './utils/pdf-utils';
export type { PDFSourceType } from './utils/pdf-utils';

export { configurePDFViewer, getConfig, resetConfig } from './config';
export type { PDFViewerConfig } from './config';

export { setupWorker, getWorkerSource, isWorkerReady } from './utils/worker-loader-simple';

export const VERSION = '1.0.0';

export const DEFAULT_OPTIONS: ViewerOptions = {
  enableTextSelection: false,
  enableVirtualScrolling: true,
  bufferPages: 2,
  maxCachedPages: 10,
  interactionMode: 'hybrid',
  performanceMode: false,
  accessibility: true
};

export const createViewer = (container: HTMLElement, options?: ViewerOptions) => {
  const viewer = new PDFHighlightViewer();
  viewer.init(container, options);
  return viewer;
};

export const loadCSS = () => {
  if (typeof document !== 'undefined' && !document.getElementById('pdf-highlight-viewer-styles')) {
    const link = document.createElement('link');
    link.id = 'pdf-highlight-viewer-styles';
    link.rel = 'stylesheet';
    link.href = '/src/lib/pdf-highlight-viewer/styles/pdf-highlight-viewer.css';
    document.head.appendChild(link);
  }
};

export const isSupported = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  return !!(
    window.HTMLCanvasElement &&
    window.Worker &&
    typeof window.requestAnimationFrame === 'function' &&
    typeof window.getSelection === 'function' &&
    document.createRange
  );
};

export const getPerformanceInfo = () => {
  const info: any = {
    hardwareConcurrency: navigator.hardwareConcurrency || 1,
    memory: (performance as any).memory,
    connection: (navigator as any).connection,
    userAgent: navigator.userAgent
  };
  
  return info;
};

export default PDFHighlightViewer;