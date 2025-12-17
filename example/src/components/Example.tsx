import React, { useEffect, useRef, useState, useMemo } from 'react';
import './Example.css';

import type {
  HighlightData,
  InputHighlightData,
  PerformanceMetrics,
  HighlightHoverEvent,
  HighlightClickEvent,
  TextSelectionEvent,
} from '../../../types';

import { PDFHighlightViewer } from '../../../PDFHighlightViewer';

import kriegerDataOld from '../../demo.json';
import kriegerDataNew from '../../demo-new-format.json';

interface KriegerPDFDemoProps {
  className?: string;
  useNewFormat?: boolean;
}

export const KriegerPDFDemo: React.FC<KriegerPDFDemoProps> = ({
  className = '',
  useNewFormat = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PDFHighlightViewer | null>(null);

  const [isLoaded, setIsLoaded] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [showLoading, setShowLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(1.5);
  const [zoomInput, setZoomInput] = useState('100');
  const [error, setError] = useState<string | null>(null);
  const [visibleCategories, setVisibleCategories] = useState<Set<string>>(new Set());
  const [isTextSelectionEnabled, setIsTextSelectionEnabled] = useState(true);
  const [dataFormat, setDataFormat] = useState<'old' | 'new'>(useNewFormat ? 'new' : 'old');

  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [currentData, setCurrentData] = useState<any>(null);

  const categoryColors = useMemo(
    (): { [key: string]: string } => ({
      protein: '#dc2626',
      species: '#2563eb',
      chemical: '#ea580c',
      disease: '#9333ea',
      gene: '#16a34a',
      cell_line: '#0891b2',
    }),
    []
  );

  const highlightData = useMemo((): HighlightData | InputHighlightData[] => {
    if (dataFormat === 'new') {
      const demoData = kriegerDataNew as any;
      return demoData.highlights as InputHighlightData[];
    } else {
      const processedData: HighlightData = {};
      const categories = ['protein', 'species', 'chemical', 'disease', 'gene', 'cell_line'];

      categories.forEach((category) => {
        const categoryKey = category as keyof typeof kriegerDataOld;
        if (kriegerDataOld[categoryKey]) {
          const categoryData = kriegerDataOld[categoryKey] as any;
          processedData[category] = {
            pages: categoryData.pages || {},
            terms: categoryData.terms || {},
          };
        }
      });

      return processedData;
    }
  }, [dataFormat]);

  const stats = useMemo(() => {
    if (dataFormat === 'new') {
      const demoData = kriegerDataNew as any;
      const highlights = demoData.highlights as InputHighlightData[];
      const categoryCounts: { [key: string]: number } = {};

      highlights.forEach((h: InputHighlightData) => {
        const category = h.metadata?.category || 'default';
        categoryCounts[category] = (categoryCounts[category] || 0) + h.bboxes.length;
      });

      return {
        totalHighlights: highlights.reduce(
          (sum: number, h: InputHighlightData) => sum + h.bboxes.length,
          0
        ),
        categoryCounts,
        totalTerms: highlights.length,
      };
    } else {
      let totalHighlights = 0;
      let totalTerms = 0;
      const categoryCounts: { [key: string]: number } = {};

      Object.entries(highlightData as HighlightData).forEach(([category, categoryData]) => {
        let categoryHighlightCount = 0;
        Object.values(categoryData.pages).forEach((pageHighlights) => {
          categoryHighlightCount += pageHighlights.length;
        });
        totalTerms += Object.keys(categoryData.terms).length;
        categoryCounts[category] = categoryHighlightCount;
        totalHighlights += categoryHighlightCount;
      });

      return { totalHighlights, categoryCounts, totalTerms };
    }
  }, [highlightData, dataFormat]);

  useEffect(() => {
    setVisibleCategories(new Set(Object.keys(stats.categoryCounts)));
  }, [stats.categoryCounts]);

  const filteredHighlightData = useMemo((): HighlightData | InputHighlightData[] => {
    if (dataFormat === 'new') {
      const highlights = highlightData as InputHighlightData[];
      return highlights.filter((h: InputHighlightData) => {
        const category = h.metadata?.category || 'default';
        return visibleCategories.has(category);
      });
    } else {
      const filtered: HighlightData = {};
      Object.entries(highlightData as HighlightData).forEach(([category, categoryData]) => {
        if (visibleCategories.has(category)) {
          filtered[category] = categoryData;
        }
      });
      return filtered;
    }
  }, [highlightData, visibleCategories, dataFormat]);

  // Main initialization effect - runs when dataFormat or isTextSelectionEnabled changes
  useEffect(() => {
    if (!containerRef.current) return;

    let viewer: PDFHighlightViewer | null = null;
    let mounted = true;

    const initViewer = async () => {
      // Cleanup previous viewer if exists
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }

      setIsInitializing(true);
      setIsLoaded(false);
      setShowLoading(true);
      setError(null);

      try {
        if (!mounted) return;

        viewer = new PDFHighlightViewer();

        viewer.addEventListener('pdfLoaded', ({ totalPages }: any) => {
          setTotalPages(totalPages);
          setShowLoading(false);
          setTimeout(() => setIsLoaded(true), 100);
        });

        viewer.addEventListener('pageChanged', ({ currentPage }: any) => {
          setCurrentPage(currentPage);
        });

        viewer.addEventListener('zoomChanged', ({ scale }: any) => {
          setZoom(scale);
        });

        viewer.addEventListener('textSelected', (event: TextSelectionEvent) => {
          setCurrentData({
            event: 'textSelected',
            text: event.text,
            highlights: event.highlights,
          });
        });

        viewer.addEventListener('highlightHover', (event: HighlightHoverEvent) => {
          setCurrentData({
            event: 'highlightHover',
            termId: event.termId,
            category: event.category,
            format: dataFormat,
          });
        });

        viewer.addEventListener('highlightClick', (event: HighlightClickEvent) => {
          setCurrentData({
            event: 'highlightClick',
            termId: event.termId,
            category: event.category,
            format: dataFormat,
          });
        });

        viewer.addEventListener('error', ({ error }: any) => {
          setError(error.message);
        });

        if (!containerRef.current) {
          throw new Error('Container element not found');
        }

        await viewer.init(containerRef.current, {
          enableTextSelection: isTextSelectionEnabled,
          enableVirtualScrolling: true,
          bufferPages: 2,
          maxCachedPages: 10,
          interactionMode: 'hybrid',
          performanceMode: true,
          accessibility: true,
        });

        const pdfData =
          dataFormat === 'new'
            ? (kriegerDataNew as any).pdf?.data
            : (kriegerDataOld as any).pdf?.data;

        if (!pdfData) {
          throw new Error('PDF data not found in the demo file');
        }

        await viewer.loadPDF(pdfData);
        viewer.loadHighlights(filteredHighlightData);

        if (mounted) {
          viewerRef.current = viewer;
        }
      } catch (error) {
        if (mounted) {
          setError(error instanceof Error ? error.message : 'Unknown error');
        }
      } finally {
        if (mounted) {
          setIsInitializing(false);
        }
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
  }, [dataFormat, isTextSelectionEnabled, filteredHighlightData]);

  useEffect(() => {
    setZoomInput(Math.round(zoom * 100).toString());
  }, [zoom]);

  const handleToggleFormat = () => {
    setDataFormat((prev) => (prev === 'old' ? 'new' : 'old'));
  };

  const handleZoomIn = () => viewerRef.current?.setZoom(zoom + 0.25);
  const handleZoomOut = () => viewerRef.current?.setZoom(zoom - 0.25);

  const handleZoomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d+$/.test(value)) {
      setZoomInput(value);
    }
  };

  const handleZoomInputBlur = () => {
    const numValue = parseInt(zoomInput, 10);
    if (isNaN(numValue) || numValue < 50) {
      viewerRef.current?.setZoom(0.5);
      setZoomInput('50');
    } else if (numValue > 400) {
      viewerRef.current?.setZoom(4.0);
      setZoomInput('400');
    } else {
      viewerRef.current?.setZoom(numValue / 100);
      setZoomInput(numValue.toString());
    }
  };

  const handleZoomInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setZoomInput(Math.round(zoom * 100).toString());
      (e.target as HTMLInputElement).blur();
    }
  };

  const handlePageChange = (page: number) => viewerRef.current?.setPage(page);

  const handleCategoryToggle = (category: string) => {
    setVisibleCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  const handleToggleTextSelection = () => {
    if (viewerRef.current) {
      const newState = viewerRef.current.toggleTextSelection();
      setIsTextSelectionEnabled(newState);
    }
  };

  return (
    <div className={`demo-container ${className}`}>
      <div className="controls">
        <div className="controls-group">
          <button onClick={handleZoomOut} disabled={zoom <= 0.5}>
            −
          </button>
          <input
            type="text"
            className="zoom-input"
            value={zoomInput}
            onChange={handleZoomInputChange}
            onBlur={handleZoomInputBlur}
            onKeyDown={handleZoomInputKeyDown}
            placeholder="100"
            aria-label="Zoom percentage"
          />
          <span className="zoom-unit">%</span>
          <button onClick={handleZoomIn} disabled={zoom >= 4}>
            +
          </button>
        </div>

        <div className="controls-group">
          <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage <= 1}>
            ←
          </button>
          <span className="page-display">
            {currentPage}/{totalPages || '...'}
          </span>
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            →
          </button>
        </div>

        <div className="controls-group">
          <button
            onClick={handleToggleTextSelection}
            className={isTextSelectionEnabled ? 'active' : ''}
          >
            Text Select: {isTextSelectionEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="controls-group">
          <button onClick={handleToggleFormat} className={dataFormat === 'new' ? 'active' : ''}>
            Format: {dataFormat.toUpperCase()}
          </button>
        </div>

        <div className="controls-group categories">
          {Object.entries(stats.categoryCounts).map(([category, count]) => (
            <label key={category}>
              <input
                type="checkbox"
                checked={visibleCategories.has(category)}
                onChange={() => handleCategoryToggle(category)}
              />
              <span
                style={{
                  color: visibleCategories.has(category) ? categoryColors[category] : '#999',
                }}
              >
                {category} ({count})
              </span>
            </label>
          ))}
        </div>

        {error && <div className="error">{error}</div>}
      </div>

      <div className="main-layout">
        <div className="pdf-viewer-wrapper">
          <div className="pdf-viewport">
            <div className="pdf-scroll-container">
              <div ref={containerRef} className="pdf-render-target" />
            </div>
            {showLoading && (
              <div className="pdf-loading-state">
                <div className="loading-indicator">
                  Loading PDF... ({stats.totalHighlights} highlights, {dataFormat} format)
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="json-inspector">
          <pre>
            {JSON.stringify(
              currentData || {
                status: 'Ready',
                format: dataFormat,
                stats,
                pdf: { pages: totalPages, currentPage, zoom },
                metrics: metrics || null,
              },
              null,
              2
            )}
          </pre>
        </div>
      </div>
    </div>
  );
};
