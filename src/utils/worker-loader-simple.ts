import * as pdfjsLib from 'pdfjs-dist';

export async function setupWorker(
  options: {
    workerSrc?: string;
    debug?: boolean;
    cdnFallback?: boolean;
  } = {}
): Promise<string> {
  const { workerSrc, debug = false, cdnFallback = true } = options;

  if (pdfjsLib.GlobalWorkerOptions.workerSrc) {
    return pdfjsLib.GlobalWorkerOptions.workerSrc;
  }

  if (workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
    if (debug) console.log('[Worker] Using provided source:', workerSrc);
    return workerSrc;
  }

  const paths = [
    '/pdf.worker.min.mjs',
    '/pdf.worker.mjs',
    './pdf.worker.min.mjs',
    '/static/pdf.worker.min.mjs',
    '/assets/pdf.worker.min.mjs',

    '/node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
    './node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
    '../node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
  ];

  if (typeof fetch !== 'undefined') {
    for (const path of paths) {
      try {
        const response = await fetch(path, { method: 'HEAD' });
        if (response.ok) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = path;
          if (debug) console.log('[Worker] Found at:', path);
          return path;
        }
      } catch {}
    }
  }

  if (cdnFallback) {
    const cdnUrl = 'https://unpkg.com/pdfjs-dist@5.4.149/build/pdf.worker.min.mjs';
    pdfjsLib.GlobalWorkerOptions.workerSrc = cdnUrl;
    if (debug) console.log('[Worker] Using CDN fallback:', cdnUrl);
    return cdnUrl;
  }

  try {
    const fallbackPath = 'pdfjs-dist/build/pdf.worker.min.mjs';
    pdfjsLib.GlobalWorkerOptions.workerSrc = fallbackPath;
    if (debug) console.log('[Worker] Using package path:', fallbackPath);
    return fallbackPath;
  } catch {
    const cdnUrl = 'https://unpkg.com/pdfjs-dist@5.4.149/build/pdf.worker.min.mjs';
    pdfjsLib.GlobalWorkerOptions.workerSrc = cdnUrl;
    if (debug) console.log('[Worker] Final CDN fallback:', cdnUrl);
    return cdnUrl;
  }
}

export function getWorkerSource(): string | undefined {
  return pdfjsLib.GlobalWorkerOptions.workerSrc;
}

export function isWorkerReady(): boolean {
  return !!pdfjsLib.GlobalWorkerOptions.workerSrc;
}
