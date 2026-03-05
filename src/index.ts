import { PDFHighlightViewer } from './PDFHighlightViewer';

export { PDFHighlightViewer } from './PDFHighlightViewer';

export type { PDFHighlightViewer as IPDFHighlightViewer } from './api';

export type {
  ViewerOptions,
  InputHighlightData,
  BBox,
  HighlightStyle,
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
  EventSystem,
  ZoomMode,
  ZoomValue,
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
  RTree,
} from './core/performance-optimizer';

export {
  b64toBlob,
  b64toArrayBuffer,
  blobToArrayBuffer,
  detectPDFSourceType,
  normalizePDFSource,
  validateBase64PDF,
  extractPDFMetadata,
  createPDFDataURL,
  processBase64InChunks,
} from './utils/pdf-utils';
export type { PDFSourceType } from './utils/pdf-utils';

export { configurePDFViewer, getConfig, resetConfig } from './config';
export type { PDFViewerConfig } from './config';

export { setupWorker, getWorkerSource, isWorkerReady } from './utils/worker-loader-simple';

export default PDFHighlightViewer;
