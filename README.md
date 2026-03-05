<div align="center">
  <h1>PDF Highlight Viewer</h1>
  <p>High-performance PDF viewer with intelligent highlighting and text selection capabilities for web applications.</p>

[![npm version](https://img.shields.io/npm/v/@epam/pdf-highlighter-kit)](https://www.npmjs.com/package/@epam/pdf-highlighter-kit) [![License](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/epam/pdf-highlighter-kit/pulls)

  <p>An open-source project by <strong>BadgerDoc</strong> <img src="./logo.svg" alt="BadgerDoc" width="22" height="21" style="vertical-align: middle; margin-bottom: 3px;"></p>
</div>

---

## Installation

```bash
npm install @epam/pdf-highlighter-kit pdfjs-dist
```

> Peer dependency: `pdfjs-dist` (see Requirements).

## Quick Start

```ts
import { PDFHighlightViewer } from '@epam/pdf-highlighter-kit';
import type { InputHighlightData } from '@epam/pdf-highlighter-kit';
import '@epam/pdf-highlighter-kit/styles/pdf-highlight-viewer.css';

// Create viewer instance
const viewer = new PDFHighlightViewer();

// Initialize with container element
const container = document.getElementById('pdf-container') as HTMLElement;

await viewer.init(container, {
  enableTextSelection: true,
  enableVirtualScrolling: true,
  bufferPages: 2,
  maxCachedPages: 10,
  interactionMode: 'hybrid',
});

// Load PDF document
await viewer.loadPDF('/path/to/document.pdf');

// Highlights
const highlights: InputHighlightData[] = [
  {
    id: 'term-001',
    bboxes: [
      // page is 1-based
      { page: 1, x1: 100, y1: 200, x2: 300, y2: 220 },
      { page: 3, x1: 80, y1: 140, x2: 260, y2: 160 },
    ],
    style: {
      backgroundColor: '#ffeb3b',
      opacity: 0.3,
      borderColor: '#d4c400',
      borderWidth: '1px',
    },
    label: 'Important Term',
    labelStyle: { fontSize: 11 },
    tooltipText: 'Important Term',
    metadata: {
      frequency: 5,
      tags: ['important', 'glossary'],
    },
  },
];

viewer.loadHighlights(highlights);

// Navigate to a highlight occurrence
viewer.goToHighlight('term-001', 0);
```

## Data Model

### `InputHighlightData`

Each highlight carries its own style. No categories are required.

**Labels:** You can add an optional `label` that is displayed to the left of the highlight, flush against it. By default the label uses the highlight’s color (from `style.borderColor` or `style.backgroundColor`), `border: 1px solid`, and `padding: 2px 4px`. Override any of these with `labelStyle` (e.g. `fontSize`, `color`, `padding`, `border`).

```ts
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

export interface HighlightLabelStyle {
  fontSize?: string | number;
  color?: string;
  backgroundColor?: string;
  padding?: string;
  borderRadius?: string;
  fontFamily?: string;
  fontWeight?: string | number;
  border?: string;
  whiteSpace?: string;
}

export interface InputHighlightData {
  id: string;
  bboxes: BBox[];
  style?: HighlightStyle;
  label?: string;
  labelStyle?: HighlightLabelStyle;
  tooltipText?: string;
  metadata?: Record<string, any>;
}
```

## Configuration Options

### ViewerConfig

```ts
interface ViewerConfig {
  // Enable text selection functionality
  enableTextSelection?: boolean;

  // Enable virtual scrolling for better performance
  enableVirtualScrolling?: boolean;

  // Number of pages to buffer above/below viewport
  bufferPages?: number;

  // Maximum number of pages to keep in cache
  maxCachedPages?: number;

  // Interaction mode: 'select' | 'highlight' | 'hybrid'
  interactionMode?: 'select' | 'highlight' | 'hybrid';

  // Custom styles configuration (viewer/selection CSS). Highlight styles are per-highlight.
  customStyles?: StyleConfig;

  // PDF.js worker source URL
  workerSrc?: string;

  // Highlight UI config (style is per highlight)
  highlightsConfig?: {
    enableMultilineHover?: boolean;
  };
}
```

## API Reference

### Main Methods

#### `init(container: HTMLElement, config?: ViewerConfig): Promise<void>`

Initialize the viewer with a container element and optional configuration.

#### `loadPDF(source: string | ArrayBuffer): Promise<void>`

Load a PDF document from URL or ArrayBuffer.

#### `loadHighlights(highlights: InputHighlightData[]): void`

Replace current highlights with the provided list.

#### `addHighlight(highlight: InputHighlightData): void`

Add a single highlight (incremental update).

#### `removeHighlight(termId: string): void`

Remove highlight by its `id`.

#### `updateHighlightStyle(termId: string, stylePatch: Partial<HighlightStyle>): void`

Update highlight style by id (patch merge).

#### `goToHighlight(termId: string, bboxIndex?: number): void`

Navigate to a specific highlight occurrence. `bboxIndex` defaults to `0`.

#### `nextHighlight(termId?: string): void` / `previousHighlight(termId?: string): void`

Navigate across highlight occurrences:

- without `termId` → across all highlights in document order
- with `termId` → only within that highlight’s occurrences

#### `goToPage(pageNumber: number): void`

Navigate to a specific page (1-based).

#### `zoomIn(): void` / `zoomOut(): void`

Zoom in or out of the PDF.

#### `setZoom(scale: number): void`

Set a specific zoom level (e.g., 1.0 for 100%, 1.5 for 150%).

#### `destroy(): void`

Clean up and destroy the viewer instance.

## Events

The viewer emits various events that you can listen to:

```ts
viewer.addEventListener('initialized', () => {
  console.log('Viewer initialized');
});

viewer.addEventListener('pdfLoaded', (e) => {
  console.log('PDF loaded. Total pages:', e.totalPages);
});

viewer.addEventListener('pageChanged', (e) => {
  console.log('Current page:', e.pageNumber);
});

viewer.addEventListener('zoomChanged', (e) => {
  console.log('Zoom changed:', e.scale);
});

viewer.addEventListener('renderComplete', (e) => {
  console.log('Page rendered:', e.pageNumber);
});

viewer.addEventListener('renderError', (e) => {
  console.error('Render error:', e.pageNumber, e.error);
});

viewer.addEventListener('highlightsLoaded', (e) => {
  console.log('Highlights loaded:', e.data?.length ?? 0);
});

viewer.addEventListener('highlightHover', (e) => {
  console.log('Highlight hover:', e.termId, 'page', e.pageNumber, 'bbox', e.bboxIndex);
});

viewer.addEventListener('highlightBlur', (e) => {
  console.log('Highlight blur:', e.termId);
});

viewer.addEventListener('highlightClick', (e) => {
  console.log('Highlight clicked:', e.termId, 'page', e.pageNumber, 'bbox', e.bboxIndex);
});

viewer.addEventListener('navigationComplete', (e) => {
  console.log('Navigation complete:', e.termId, e.pageNumber, e.occurrenceIndex);
});

viewer.addEventListener('selectionChanged', (e) => {
  console.log('Text selected:', e.text);
  console.log('Pages:', e.pageNumbers);
  console.log('Overlapping highlights:', e.highlights); // array of bbox refs
});

viewer.addEventListener('selectionHighlighted', (e) => {
  console.log('Selection highlighted:', e.termId);
});

viewer.addEventListener('error', (e) => {
  console.error('Viewer error:', e);
});
```

> Event payload fields may include `termId`, `pageNumber`, `bboxIndex`, and `bbox` depending on event type.

## Advanced Usage

### Custom Styling (per highlight)

```ts
const highlight: InputHighlightData = {
  id: 'note-001',
  bboxes: [{ page: 2, x1: 120, y1: 330, x2: 420, y2: 355 }],
  style: {
    backgroundColor: '#ffd54f',
    opacity: 0.25,
    borderColor: '#ff8f00',
    borderWidth: '1px',
    hoverOpacity: 0.6,
  },
  label: 'My note',
  labelStyle: { padding: '2px 6px', borderRadius: '4px' },
  tooltipText: 'My note',
};

viewer.addHighlight(highlight);
```

### React Integration

```tsx
import { useEffect, useRef } from 'react';
import { PDFHighlightViewer } from '@epam/pdf-highlighter-kit';
import type { InputHighlightData } from '@epam/pdf-highlighter-kit';
import '@epam/pdf-highlighter-kit/styles/pdf-highlight-viewer.css';

export function PDFViewer({
  pdfUrl,
  highlights,
}: {
  pdfUrl: string;
  highlights: InputHighlightData[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PDFHighlightViewer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const viewer = new PDFHighlightViewer();
    viewerRef.current = viewer;

    (async () => {
      await viewer.init(containerRef.current!, {
        enableTextSelection: true,
        enableVirtualScrolling: true,
      });

      await viewer.loadPDF(pdfUrl);
      viewer.loadHighlights(highlights);
    })();

    return () => {
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [pdfUrl]);

  useEffect(() => {
    viewerRef.current?.loadHighlights(highlights);
  }, [highlights]);

  return <div ref={containerRef} style={{ width: '100%', height: '100vh' }} />;
}
```

## Browser Support

- Chrome/Edge (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)

## Requirements

- `pdfjs-dist`: ^5.4.149 (peer dependency)

## License

Apache-2.0

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please use the GitHub Issues page.
