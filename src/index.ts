import { PDFHighlightViewer } from './PDFHighlightViewer';

export { PDFHighlightViewer } from './PDFHighlightViewer';
export { RotationDirection, ZoomMode } from './types';

export type { PDFHighlightViewer as IPDFHighlightViewer } from './api';

export type {
  AccessibilityFeatures,
  AnalysisResult,
  BBox,
  BBoxOrigin,
  BoundingBox,
  EventSystem,
  HeavyTask,
  HighlightAnalytics,
  HighlightClickEvent,
  HighlightHoverEvent,
  HighlightLabelStyle,
  HighlightSelectEvent,
  HighlightStyle,
  InputHighlightData,
  InteractionIntent,
  InteractionMode,
  LoadPDFOptions,
  MemoryMetrics,
  Page,
  PageDisplayRotationClockwise,
  PageRotationDegrees,
  PageChangeEvent,
  PDFSource,
  PerformanceMetrics,
  PerformanceWarningEvent,
  Priority,
  RenderCompleteEvent,
  RenderingQueue,
  Segment,
  SelectionCopyEvent,
  SelectionHighlightEvent,
  SelectionState,
  SelectionWithMetadata,
  TextContent,
  TextItem,
  TextRange,
  TextSelectionEvent,
  ThumbnailOptions,
  UserAction,
  ViewerOptions,
  Viewport,
  ZoomChangeEvent,
  ZoomValue,
} from './types';

export { UnifiedInteractionHandler } from './core/interaction-handler';
export { PDFEngine } from './core/pdf-engine';
export {
  MemoryManager,
  PerformanceOptimizer,
  RenderOptimizer,
  RTree,
  WorkerTaskManager,
} from './core/performance-optimizer';
export { TextSegmentation } from './core/text-segmentation';
export { UnifiedLayerBuilder } from './core/unified-layer-builder';
export type { TextLayerViewport } from './core/unified-layer-builder';
export { ViewportManager } from './core/viewport-manager';

export {
  clockwiseToCcw,
  displayRotationToClockwise,
  rotateBoundingBoxForCcwRotation,
  rotatePointCcw,
} from './utils/rotate-bbox';
export {
  normalizePdfRotationDegrees,
  PDF_ROTATION_FULL_CIRCLE_DEGREES,
  sumPdfIntrinsicAndUserRotation,
} from './utils/pdf-rotation-math';
export {
  b64toArrayBuffer,
  b64toBlob,
  blobToArrayBuffer,
  createPDFDataURL,
  detectPDFSourceType,
  extractPDFMetadata,
  normalizePDFSource,
  processBase64InChunks,
  validateBase64PDF,
} from './utils/pdf-utils';
export type { PDFSourceType } from './utils/pdf-utils';

export { configurePDFViewer, getConfig, resetConfig } from './config';
export type { PDFViewerConfig } from './config';

export { getWorkerSource, isWorkerReady, setupWorker } from './utils/worker-loader-simple';

export default PDFHighlightViewer;
