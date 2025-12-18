import { InputHighlightData, PDFHighlightViewer } from '@epam/pdf-highlighter-kit';
import React, { useEffect, useRef } from 'react';

const simpleHighlights: InputHighlightData[] = [
  {
    id: 'red-zone',
    bboxes: [{ x1: 180, y1: 110, x2: 340, y2: 130, page: 1 }],
    style: {
      backgroundColor: '#ff6b6b',
      opacity: 0.4,
    },
    tooltipText: 'Red highlight zone',
    metadata: {
      category: 'red-custom',
    },
  },
  {
    id: 'blue-zone',
    bboxes: [{ x1: 30, y1: 140, x2: 400, y2: 164, page: 1 }],
    style: {
      backgroundColor: '#4ecdc4',
      opacity: 0.4,
    },
    tooltipText: 'Blue highlight zone',
    metadata: {
      category: 'blue-custom',
    },
  },
  {
    id: 'yellow-zone',
    bboxes: [{ x1: 100, y1: 200, x2: 350, y2: 220, page: 1 }],
    style: {
      backgroundColor: '#ffe66d',
      opacity: 0.4,
    },
    tooltipText: 'Yellow highlight zone',
    metadata: {
      category: 'yellow-custom',
    },
  },
  {
    id: 'green-zone',
    bboxes: [{ x1: 90, y1: 250, x2: 280, y2: 270, page: 1 }],
    style: {
      backgroundColor: '#03ff0bff',
      opacity: 0.4,
    },
    tooltipText: 'Green highlight zone',
    metadata: {
      category: 'green-custom',
    },
  },
];

export const SimpleExample: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PDFHighlightViewer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let viewer: PDFHighlightViewer | null = null;
    let mounted = true;

    const initViewer = async () => {
      try {
        viewer = new PDFHighlightViewer();

        await viewer.init(containerRef.current!, {
          enableTextSelection: true,
          enableVirtualScrolling: false,
          performanceMode: false,
          highlightsConfig: {
            enableMultilineHover: false,
            getHighlightColor: (termId: string) => {
              const highlight = simpleHighlights.find((h) => h.id === termId);
              return highlight?.style?.backgroundColor || '#666666';
            },
          },
        });

        await viewer.loadPDF('https://ontheline.trincoll.edu/images/bookdown/sample-local-pdf.pdf');

        viewer.loadHighlights(simpleHighlights);

        if (mounted) {
          viewerRef.current = viewer;
        }
      } catch (err) {
        console.error('Error in initViewer:', err);
      }
    };

    initViewer();

    return () => {
      mounted = false;
      if (viewer) {
        viewer.destroy();
      }
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          background: 'white',
          overflow: 'auto',
        }}
      />
    </div>
  );
};
