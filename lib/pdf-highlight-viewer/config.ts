
export interface PDFViewerConfig {
  workerSrc?: string | null;

  baseUrl?: string;

  debug?: boolean;

  cdnFallback?: boolean;
}

export const defaultConfig: PDFViewerConfig = {
  workerSrc: null,
  baseUrl: '',
  debug: false,
  cdnFallback: true
};

let globalConfig: PDFViewerConfig = { ...defaultConfig };

export function configurePDFViewer(config: Partial<PDFViewerConfig>): void {
  globalConfig = { ...globalConfig, ...config };
  
  if (config.workerSrc !== undefined && typeof window !== 'undefined') {
    const pdfjsLib = (window as any).pdfjsLib;
    if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = config.workerSrc || getDefaultWorkerSrc();
    }
  }
}

export function getConfig(): PDFViewerConfig {
  return { ...globalConfig };
}

export function getWorkerSrc(): string {
  if (globalConfig.workerSrc) {
    return globalConfig.workerSrc;
  }
  return getDefaultWorkerSrc();
}

function getDefaultWorkerSrc(): string {
  return 'https://unpkg.com/pdfjs-dist@5.4.149/build/pdf.worker.min.mjs';
}

export function resetConfig(): void {
  globalConfig = { ...defaultConfig };
}