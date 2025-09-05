import React, { useEffect, useRef, useState, useMemo } from 'react';
import './Example.css';
import { PDFHighlightViewer } from '../../lib/pdf-highlight-viewer';
import { 
  HighlightData, 
  PerformanceMetrics,
  HighlightHoverEvent,
  HighlightClickEvent,
  TextSelectionEvent
} from '../../lib/pdf-highlight-viewer/types';

import kriegerData from '../../demo.json';

interface KriegerPDFDemoProps {
  className?: string;
}

export const KriegerPDFDemo: React.FC<KriegerPDFDemoProps> = ({ className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PDFHighlightViewer | null>(null);
  
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [showLoading, setShowLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(1.5);
  const [error, setError] = useState<string | null>(null);
  const [visibleCategories, setVisibleCategories] = useState<Set<string>>(new Set());
  const [isTextSelectionEnabled, setIsTextSelectionEnabled] = useState(true);
  
  const [hoveredData, setHoveredData] = useState<any>(null);
  const [clickedData, setClickedData] = useState<any>(null);
  const [selectedText, setSelectedText] = useState<any>(null);
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [currentData, setCurrentData] = useState<any>(null);

  const categoryColors = useMemo((): { [key: string]: string } => ({
    protein: '#dc2626',
    species: '#2563eb',
    chemical: '#ea580c',
    disease: '#9333ea',
    gene: '#16a34a',
    cell_line: '#0891b2'
  }), []);

  const highlightData = useMemo((): HighlightData => {
    const processedData: HighlightData = {};
    const categories = ['protein', 'species', 'chemical', 'disease', 'gene', 'cell_line'];
    
    categories.forEach(category => {
      if (kriegerData[category as keyof typeof kriegerData]) {
        const categoryData = kriegerData[category as keyof typeof kriegerData] as any;
        processedData[category] = {
          pages: categoryData.pages || {},
          terms: categoryData.terms || {}
        };
      }
    });
    
    return processedData;
  }, []);

  const stats = useMemo(() => {
    let totalHighlights = 0;
    let totalTerms = 0;
    const categoryCounts: { [key: string]: number } = {};

    Object.entries(highlightData).forEach(([category, categoryData]) => {
      let categoryHighlightCount = 0;
      Object.values(categoryData.pages).forEach(pageHighlights => {
        categoryHighlightCount += pageHighlights.length;
      });
      totalTerms += Object.keys(categoryData.terms).length;
      categoryCounts[category] = categoryHighlightCount;
      totalHighlights += categoryHighlightCount;
    });

    return { totalHighlights, categoryCounts, totalTerms };
  }, [highlightData]);

  useEffect(() => {
    setVisibleCategories(new Set(Object.keys(highlightData)));
  }, [highlightData]);

  const filteredHighlightData = useMemo((): HighlightData => {
    const filtered: HighlightData = {};
    Object.entries(highlightData).forEach(([category, categoryData]) => {
      if (visibleCategories.has(category)) {
        filtered[category] = categoryData;
      }
    });
    return filtered;
  }, [highlightData, visibleCategories]);


  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    let viewer: PDFHighlightViewer | null = null;
    let metricsInterval: ReturnType<typeof setInterval> | null = null;
    let mounted = true;

    const initViewer = async () => {
      setIsInitializing(true);
      setError(null);
      
      try {
        if (!mounted) return;
        
        viewer = new PDFHighlightViewer();
        
        viewer.addEventListener('pdfLoaded', ({ totalPages }) => {
          setTotalPages(totalPages);
          setShowLoading(false);
          setTimeout(() => setIsLoaded(true), 100);
        });

        viewer.addEventListener('pageChanged', ({ currentPage }) => {
          setCurrentPage(currentPage);
        });

        viewer.addEventListener('zoomChanged', ({ scale }) => {
          setZoom(scale);
        });

        viewer.addEventListener('textSelected', (event: TextSelectionEvent) => {
          const data = {
            event: 'textSelected',
            text: event.text,
            highlights: event.highlights
          };
          setCurrentData(data);
        });

        viewer.addEventListener('highlightHover', (event: HighlightHoverEvent) => {
          const termData = findTermById(event.termId);
          const hoverData = {
            event: 'highlightHover',
            termId: event.termId,
            term: termData?.term,
            category: event.category,
            termDetails: termData
          };
          setCurrentData(hoverData);
        });

        viewer.addEventListener('highlightClick', (event: HighlightClickEvent) => {
          const termData = findTermById(event.termId);
          const clickData = {
            event: 'highlightClick',
            termId: event.termId,
            term: termData?.term,
            category: event.category,
            termDetails: termData,
            allOccurrences: getTermOccurrences(event.termId)
          };
          setCurrentData(clickData);
        });

        viewer.addEventListener('error', ({ error }) => {
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
          accessibility: true
        });

        await viewer.loadPDF((kriegerData as any).pdf.data);

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
      
      if (metricsInterval) {
        clearInterval(metricsInterval);
      }
      
      if (viewer) {
        viewer.destroy();
      }
      
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (viewerRef.current && isLoaded) {
      viewerRef.current.loadHighlights(filteredHighlightData);
    }
  }, [filteredHighlightData, isLoaded]);

  const findTermById = (termId: string) => {
    for (const categoryData of Object.values(highlightData)) {
      if (categoryData.terms[termId]) {
        return categoryData.terms[termId];
      }
    }
    return null;
  };

  const getTermOccurrences = (termId: string) => {
    const occurrences = [];
    for (const [category, categoryData] of Object.entries(highlightData)) {
      for (const [pageNum, pageHighlights] of Object.entries(categoryData.pages)) {
        const pageOccurrences = pageHighlights.filter(h => h.termId === termId);
        if (pageOccurrences.length > 0) {
          occurrences.push({
            page: parseInt(pageNum),
            count: pageOccurrences.length,
            category,
            highlights: pageOccurrences
          });
        }
      }
    }
    return occurrences;
  };

  const handleZoomIn = () => viewerRef.current?.setZoom(zoom * 1.2);
  const handleZoomOut = () => viewerRef.current?.setZoom(zoom / 1.2);
  const handlePageChange = (page: number) => viewerRef.current?.setPage(page);
  const handleCategoryToggle = (category: string) => {
    setVisibleCategories(prev => {
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
          <button onClick={handleZoomOut} disabled={zoom <= 0.5}>−</button>
          <span className="zoom-display">{Math.round(zoom * 100)}%</span>
          <button onClick={handleZoomIn} disabled={zoom >= 5}>+</button>
        </div>
        
        <div className="controls-group">
          <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage <= 1}>←</button>
          <span className="page-display">{currentPage}/{totalPages || '...'}</span>
          <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage >= totalPages}>→</button>
        </div>

        <div className="controls-group">
          <button 
            onClick={handleToggleTextSelection}
            className={isTextSelectionEnabled ? 'active' : ''}
          >
            Text Select: {isTextSelectionEnabled ? 'ON' : 'OFF'}
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
              <span style={{ color: visibleCategories.has(category) ? categoryColors[category] : '#999' }}>
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
                  Loading PDF... ({stats.totalHighlights} highlights)
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
                stats,
                pdf: {
                  pages: totalPages,
                  currentPage,
                  zoom,
                  dataSize: `${Math.round((kriegerData as any).pdf.data.length / 1024)}KB`
                },
                metrics: metrics || null
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