# PDF Highlight Viewer

High-performance PDF viewer with intelligent highlighting and text selection capabilities for web applications.

## Installation

```bash
npm install @epam/pdf-highlighter-kit pdfjs-dist
```

## Quick Start

```typescript
import { PDFHighlightViewer } from '@epam/pdf-highlighter-kit';
import '@epam/pdf-highlighter-kit/styles/pdf-highlight-viewer.css';

// Create viewer instance
const viewer = new PDFHighlightViewer();

// Initialize with container element
const container = document.getElementById('pdf-container');
await viewer.init(container, {
  enableTextSelection: true,
  enableVirtualScrolling: true,
  bufferPages: 2,
  maxCachedPages: 10,
  interactionMode: 'hybrid',
});

// Load PDF document
await viewer.loadPDF('/path/to/document.pdf');

// Add highlights
viewer.loadHighlights({
  category1: {
    pages: {
      '1': [
        {
          termId: 'term-001',
          coordinates: [{ x1: 100, y1: 200, x2: 300, y2: 220 }],
        },
      ],
    },
    terms: {
      'term-001': {
        term: 'Important Term',
        category: 'category1',
        frequency: 5,
        pages: [1, 3, 7],
      },
    },
  },
});
```

## Configuration Options

### ViewerConfig

```typescript
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

  // Custom styles configuration
  customStyles?: StyleConfig;

  // PDF.js worker source URL
  workerSrc?: string;
}
```

## API Reference

### Main Methods

#### `init(container: HTMLElement, config?: ViewerConfig): Promise<void>`

Initialize the viewer with a container element and optional configuration.

#### `loadPDF(source: string | ArrayBuffer): Promise<void>`

Load a PDF document from URL or ArrayBuffer.

#### `loadHighlights(highlights: HighlightData): void`

Load highlight data to display in the PDF.

#### `goToPage(pageNumber: number): void`

Navigate to a specific page.

#### `zoomIn(): void` / `zoomOut(): void`

Zoom in or out of the PDF.

#### `setZoom(scale: number): void`

Set a specific zoom level (e.g., 1.0 for 100%, 1.5 for 150%).

#### `search(query: string): Promise<SearchResult[]>`

Search for text in the PDF document.

#### `destroy(): void`

Clean up and destroy the viewer instance.

### Events

The viewer emits various events that you can listen to:

```typescript
viewer.on('pageChange', (pageNumber: number) => {
  console.log('Current page:', pageNumber);
});

viewer.on('textSelected', (selection: SelectionData) => {
  console.log('Text selected:', selection.text);
});

viewer.on('highlightClick', (highlight: HighlightInfo) => {
  console.log('Highlight clicked:', highlight.term);
});
```

## Advanced Usage

### Custom Styling

```typescript
const viewer = new PDFHighlightViewer();
await viewer.init(container, {
  customStyles: {
    highlightColor: '#ffeb3b',
    highlightOpacity: 0.3,
    selectionColor: '#2196f3',
    selectionOpacity: 0.4,
  },
});
```

### React Integration

```tsx
import { useEffect, useRef } from 'react';
import { PDFHighlightViewer } from '@epam/pdf-highlighter-kit';
import '@epam/pdf-highlighter-kit/styles/pdf-highlight-viewer.css';

function PDFViewer({ pdfUrl, highlights }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PDFHighlightViewer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const viewer = new PDFHighlightViewer();
    viewerRef.current = viewer;

    viewer
      .init(containerRef.current, {
        enableTextSelection: true,
        enableVirtualScrolling: true,
      })
      .then(() => {
        viewer.loadPDF(pdfUrl);
        if (highlights) {
          viewer.loadHighlights(highlights);
        }
      });

    return () => {
      viewer.destroy();
    };
  }, [pdfUrl]);

  useEffect(() => {
    if (viewerRef.current && highlights) {
      viewerRef.current.loadHighlights(highlights);
    }
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

For issues and questions, please use the [GitHub Issues](https://github.com/epam/pdf-highlighter-kit/issues) page.
