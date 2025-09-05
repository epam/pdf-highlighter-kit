# PDF Highlight Viewer

## Quick Start

### Basic Usage

```javascript
import { PDFHighlightViewer } from './lib/pdf-highlight-viewer';

// Create viewer instance
const viewer = new PDFHighlightViewer();

// Initialize with container element
const container = document.getElementById('pdf-container');
await viewer.init(container, {
  enableTextSelection: true,
  enableVirtualScrolling: true,
  bufferPages: 2,
  maxCachedPages: 10,
  interactionMode: 'hybrid'
});

// Load PDF document
await viewer.loadPDF('path/to/document.pdf');

// Add highlights
viewer.loadHighlights({
  category1: {
    pages: {
      '1': [
        {
          termId: 'term-001',
          coordinates: [{ x1: 100, y1: 200, x2: 300, y2: 220 }]
        }
      ]
    },
    terms: {
      'term-001': {
        term: 'Important Term',
        category: 'category1',
        frequency: 5,
        pages: [1, 3, 7]
      }
    }
  }
});
```

### React Integration

For a complete React implementation example, refer to the demo in `src/components/Example.tsx`. The library provides full React compatibility while remaining framework-agnostic.

```jsx
import { useEffect, useRef } from 'react';
import { PDFHighlightViewer } from './lib/pdf-highlight-viewer';

function PDFViewer({ pdfUrl, highlights }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);

  useEffect(() => {
    const initViewer = async () => {
      const viewer = new PDFHighlightViewer();
      await viewer.init(containerRef.current);
      await viewer.loadPDF(pdfUrl);
      viewer.loadHighlights(highlights);
      viewerRef.current = viewer;
    };

    initViewer();

    return () => {
      viewerRef.current?.destroy();
    };
  }, [pdfUrl]);

  return <div ref={containerRef} className="pdf-container" />;
}
```

## API Reference

### Initialization

#### `init(container: HTMLElement, options?: ViewerOptions): Promise<void>`

Initialize the viewer with a container element and optional configuration.

**Options:**
- `enableTextSelection`: Enable text selection functionality (default: false)
- `enableVirtualScrolling`: Enable virtual scrolling for performance (default: true)
- `bufferPages`: Number of pages to buffer around visible area (default: 2)
- `maxCachedPages`: Maximum number of pages to keep in cache (default: 10)
- `interactionMode`: Interaction mode - 'hybrid', 'highlight', or 'select' (default: 'hybrid')
- `performanceMode`: Enable performance optimizations (default: false)
- `accessibility`: Enable accessibility features (default: true)

### Document Management

#### `loadPDF(source: string | ArrayBuffer | Blob): Promise<void>`

Load a PDF document from various sources.

#### `setPage(pageNumber: number): void`

Navigate to a specific page.

#### `setZoom(scale: number): void`

Set the zoom level (1.0 = 100%).

#### `getCurrentPage(): number`

Get the current page number.

#### `getTotalPages(): number`

Get the total number of pages in the document.

### Highlight Management

#### `loadHighlights(data: HighlightData): void`

Load highlight data for all categories and pages.

#### `addHighlight(pageNumber: number, highlight: TermOccurrence): void`

Add a single highlight to a specific page.

#### `removeHighlight(termId: string): void`

Remove all occurrences of a highlight by term ID.

#### `updateHighlightStyle(category: string, style: Partial<CategoryStyle>): void`

Update the visual style for a highlight category.

#### `getHighlightsForPage(pageNumber: number): TermOccurrence[]`

Get all highlights for a specific page.

### Text Selection

The viewer provides a comprehensive text selection API:

```javascript
// Enable text selection
viewer.textSelection.enable();

// Get current selection
const selectedText = viewer.textSelection.getSelection();

// Get selection with context
const selectionData = viewer.textSelection.getSelectionWithContext();

// Create highlight from selection
const newHighlight = viewer.textSelection.createHighlightFromSelection('category');

// Clear selection
viewer.textSelection.clearSelection();
```

### Navigation

#### `goToHighlight(termId: string, occurrenceIndex?: number): void`

Navigate to a specific highlight occurrence.

#### `nextHighlight(category?: string): void`

Navigate to the next highlight, optionally filtered by category.

#### `previousHighlight(category?: string): void`

Navigate to the previous highlight, optionally filtered by category.

### Events

The viewer emits various events for interaction handling:

```javascript
viewer.addEventListener('pdfLoaded', ({ totalPages }) => {
  console.log(`PDF loaded with ${totalPages} pages`);
});

viewer.addEventListener('pageChanged', ({ currentPage }) => {
  console.log(`Current page: ${currentPage}`);
});

viewer.addEventListener('highlightHover', ({ termId, category }) => {
  console.log(`Hovering over ${termId} in category ${category}`);
});

viewer.addEventListener('highlightClick', ({ termId, category }) => {
  console.log(`Clicked ${termId} in category ${category}`);
});

viewer.addEventListener('textSelected', ({ text, highlights }) => {
  console.log(`Selected text: ${text}`);
});
```

## Data Structures

### HighlightData

```typescript
interface HighlightData {
  [category: string]: {
    pages: {
      [pageNumber: string]: TermOccurrence[];
    };
    terms: {
      [termId: string]: TermMetadata;
    };
  };
}
```

### TermOccurrence

```typescript
interface TermOccurrence {
  termId: string;
  coordinates: BoundingBox[];
}
```

### TermMetadata

```typescript
interface TermMetadata {
  term: string;
  category: string;
  frequency: number;
  aliases?: string[];
  relatedTerms?: string[];
  pages: number[];
}
```

## Performance Optimization

The library includes several performance optimization features:

### Virtual Scrolling

Virtual scrolling renders only visible pages and a configurable buffer, significantly reducing memory usage for large documents.

### Intelligent Caching

Pages are cached based on user interaction patterns with automatic memory management.

### Performance Monitoring

```javascript
// Get performance metrics
const metrics = viewer.getPerformanceMetrics();
console.log('Render time:', metrics.renderTime);
console.log('Cache hit rate:', metrics.cacheHitRate);

// Enable profiling
viewer.enableProfiling();
```

## Accessibility

The library includes built-in accessibility features:

- Keyboard navigation support
- Screen reader compatibility
- ARIA labels and roles
- Focus management
- High contrast mode support

Access accessibility features through:

```javascript
viewer.accessibility.enableScreenReaderAnnouncements();
viewer.accessibility.setHighContrastMode(true);
viewer.accessibility.announcePageChange(pageNumber);
```

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Requirements

- PDF.js library for PDF rendering
- Modern JavaScript environment with ES6+ support
- WebWorker support for optimal performance

## Development

### Building from Source

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```