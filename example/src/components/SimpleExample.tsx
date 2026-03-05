import { HighlightStyle, InputHighlightData, PDFHighlightViewer, ZoomMode } from '../../../src';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ButtonVariant, DialButton, DialDropdown } from '@epam/ai-dial-ui-kit';
import '@epam/ai-dial-ui-kit/styles.css';

const PDF_URL = 'https://ontheline.trincoll.edu/images/bookdown/sample-local-pdf.pdf';

const initialHighlights: InputHighlightData[] = [
  {
    id: 'red-zone',
    bboxes: [{ x1: 180, y1: 110, x2: 340, y2: 130, page: 1 }],
    style: { backgroundColor: '#ff6b6b', opacity: 0.4 },
    label: 'Red zone',
    labelStyle: { fontSize: 10, border: '1px solid rgba(255, 107, 107, 0.55)', padding: '2px 4px' },
    tooltipText: 'Red highlight zone',
  },
  {
    id: 'blue-zone',
    bboxes: [{ x1: 30, y1: 140, x2: 400, y2: 164, page: 1 }],
    style: { backgroundColor: '#4ecdc4', opacity: 0.4 },
    tooltipText: 'Blue highlight zone',
  },
  {
    id: 'yellow-zone',
    bboxes: [{ x1: 100, y1: 200, x2: 350, y2: 220, page: 1 }],
    style: { backgroundColor: '#ffe66d', opacity: 0.4 },
    tooltipText: 'Yellow highlight zone',
  },
  {
    id: 'green-zone',
    bboxes: [
      { x1: 90, y1: 250, x2: 280, y2: 270, page: 2 },
      { x1: 300, y1: 300, x2: 450, y2: 320, page: 3 },
    ],
    style: { backgroundColor: '#03ff0bff', opacity: 0.4 },
    tooltipText: 'Green highlight zone (p2 + p3)',
  },
  {
    id: 'purple-zone',
    bboxes: [{ x1: 125, y1: 700, x2: 320, y2: 720, page: 1 }],
    style: { backgroundColor: '#9d50ff', opacity: 0.4 },
    tooltipText: 'Purple highlight zone',
  },
  {
    id: 'orange-zone',
    bboxes: [{ x1: 35, y1: 400, x2: 205, y2: 410, page: 3 }],
    style: { backgroundColor: '#ff8c00', opacity: 0.4 },
    tooltipText: 'Orange highlight zone (p3)',
  },
];

type UiEvent = { ts: number; event: string; data: any };

export const SimpleExample: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PDFHighlightViewer | null>(null);

  const [highlights, setHighlights] = useState<InputHighlightData[]>(initialHighlights);

  const [events, setEvents] = useState<UiEvent[]>([]);
  const [alertOnEvents, setAlertOnEvents] = useState(false);

  const [initKey, setInitKey] = useState(0);

  // Viewer options that we want to validate
  const [enableVirtualScrolling, setEnableVirtualScrolling] = useState(false);
  const [enableMultilineHover, setEnableMultilineHover] = useState(false);
  const [performanceMode, setPerformanceMode] = useState(false);

  // Debug state (from events)
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [currentZoom, setCurrentZoom] = useState<number | null>(null);
  const [renderedPages, setRenderedPages] = useState<Set<number>>(new Set());

  const pushEvent = useCallback(
    (event: string, data: any) => {
      setEvents((prev) => {
        const next = [{ ts: Date.now(), event, data }, ...prev];
        return next.slice(0, 60);
      });

      if (alertOnEvents) {
        const short = data?.termId ? `${event}: termId=${data.termId}` : event;
        // eslint-disable-next-line no-alert
        alert(short);
      }
    },
    [alertOnEvents]
  );

  const clearEvents = useCallback(() => {
    setEvents([]);
    pushEvent('ui.clearEvents', {});
  }, [pushEvent]);

  const reinitViewer = useCallback(() => {
    setRenderedPages(new Set());
    setTotalPages(null);
    setCurrentPage(1);
    setCurrentZoom(null);
    setInitKey((k) => k + 1);
    pushEvent('ui.reinit', {
      enableVirtualScrolling,
      enableMultilineHover,
      performanceMode,
    });
  }, [enableMultilineHover, enableVirtualScrolling, performanceMode, pushEvent]);

  const goTo = useCallback((id: string) => viewerRef.current?.goToHighlight(id), []);

  const dropdownHighlightItems = useMemo(
    () =>
      highlights.map((h) => ({
        key: h.id,
        label: h.tooltipText || h.id,
        onClick: () => goTo(h.id),
      })),
    [highlights, goTo]
  );

  const dropdownPageItems = useMemo(() => {
    const pages = totalPages ?? 5;
    return Array.from({ length: pages }, (_, i) => i + 1).map((p) => ({
      key: String(p),
      label: `Go to page ${p}`,
      onClick: () => viewerRef.current?.setPage(p),
    }));
  }, [totalPages]);

  const resetHighlights = useCallback(() => {
    const next = initialHighlights;
    setHighlights(next);
    viewerRef.current?.loadHighlights(next);
    pushEvent('ui.resetHighlights', { count: next.length });
  }, [pushEvent]);

  const clearHighlights = useCallback(() => {
    setHighlights([]);
    viewerRef.current?.loadHighlights([]);
    pushEvent('ui.clearHighlights', {});
  }, [pushEvent]);

  const reloadHighlightsIntoViewer = useCallback(() => {
    viewerRef.current?.loadHighlights(highlights);
    pushEvent('ui.reloadHighlights', { count: highlights.length });
  }, [highlights, pushEvent]);

  const addRandomHighlight = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const page = viewer.getCurrentPage?.() ?? currentPage ?? 1;
    const id = `rand-${Date.now()}`;

    const style: HighlightStyle = {
      backgroundColor: '#22c55e',
      opacity: 0.35,
      borderColor: '#0f172a',
      borderWidth: '1px',
    };

    const h: InputHighlightData = {
      id,
      bboxes: [{ x1: 80, y1: 120, x2: 280, y2: 145, page }],
      style,
      tooltipText: `Random on page ${page}`,
      metadata: { source: 'ui' },
    };

    if ((viewer as any).addHighlight) {
      (viewer as any).addHighlight(h);
    } else {
      viewer.loadHighlights([...highlights, h]);
    }

    setHighlights((prev) => [...prev, h]);
    pushEvent('ui.addRandomHighlight', { id, page });
  }, [currentPage, highlights, pushEvent]);

  const removeLastHighlight = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const last = highlights[highlights.length - 1];
    if (!last) return;

    if ((viewer as any).removeHighlight) {
      (viewer as any).removeHighlight(last.id);
    } else {
      viewer.loadHighlights(highlights.slice(0, -1));
    }

    setHighlights((prev) => prev.slice(0, -1));
    pushEvent('ui.removeLastHighlight', { id: last.id });
  }, [highlights, pushEvent]);

  const mutateRedStyle = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const target = highlights.find((h) => h.id === 'red-zone');
    if (!target) return;

    const nextHighlight: InputHighlightData = {
      ...target,
      style: {
        ...(target.style ?? { backgroundColor: '#ff6b6b' }),
        opacity: 0.15,
        borderColor: '#000000',
        borderWidth: '2px',
      },
    };

    if ((viewer as any).addHighlight) {
      (viewer as any).addHighlight(nextHighlight);
    } else {
      viewer.loadHighlights(highlights.map((h) => (h.id === target.id ? nextHighlight : h)));
    }

    setHighlights((prev) => prev.map((h) => (h.id === target.id ? nextHighlight : h)));
    pushEvent('ui.mutateStyle', { id: target.id });
  }, [highlights, pushEvent]);

  const assertPage3Rendered = useCallback(() => {
    const ok = renderedPages.has(3);
    pushEvent(ok ? 'ui.assertPage3Rendered.ok' : 'ui.assertPage3Rendered.fail', {
      renderedPages: Array.from(renderedPages).sort((a, b) => a - b),
    });
  }, [pushEvent, renderedPages]);

  const dumpMetrics = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const perf = viewer.getPerformanceMetrics?.();
    const analytics = viewer.getAnalytics?.();
    pushEvent('ui.dumpMetrics', { perf, analytics });
  }, [pushEvent]);

  const jumpToPage3Top = useCallback(() => {
    viewerRef.current?.setPage(3);
    pushEvent('ui.jumpToPage3Top', {});
  }, [pushEvent]);

  const jumpToPage3Coord = useCallback(() => {
    viewerRef.current?.goToCoordinate(3, 0, 10);
    pushEvent('ui.jumpToPage3Coord', { page: 3, x: 0, y: 10 });
  }, [pushEvent]);

  useEffect(() => {
    if (!containerRef.current) return;

    let viewer: PDFHighlightViewer | null = null;
    let mounted = true;

    const initViewer = async () => {
      try {
        viewer = new PDFHighlightViewer();

        await viewer.init(containerRef.current!, {
          enableTextSelection: true,
          enableVirtualScrolling,
          performanceMode,
          highlightsConfig: {
            enableMultilineHover,
          },
        });

        const on = (event: string) => (data: any) => {
          pushEvent(event, data);

          if (event === 'pdfLoaded') {
            const tp = data?.totalPages ?? data?.pages ?? null;
            if (typeof tp === 'number') setTotalPages(tp);
          }

          if (event === 'pageChanged') {
            const p = data?.pageNumber ?? data?.page ?? null;
            if (typeof p === 'number') setCurrentPage(p);
          }

          if (event === 'zoomChanged') {
            const z = data?.scale ?? data?.zoom ?? data?.currentScale ?? null;
            if (typeof z === 'number') setCurrentZoom(z);
          }

          if (event === 'renderComplete') {
            const p = data?.pageNumber ?? data?.page ?? null;
            if (typeof p === 'number') {
              setRenderedPages((prev) => {
                const next = new Set(prev);
                next.add(p);
                return next;
              });
            }
          }
        };

        const listeners: Array<{ event: string; cb: (d: any) => void }> = [
          { event: 'initialized', cb: on('initialized') },
          { event: 'pdfLoaded', cb: on('pdfLoaded') },
          { event: 'highlightsLoaded', cb: on('highlightsLoaded') },

          { event: 'highlightClick', cb: on('highlightClick') },
          { event: 'highlightHover', cb: on('highlightHover') },
          { event: 'highlightBlur', cb: on('highlightBlur') },

          { event: 'pageChanged', cb: on('pageChanged') },
          { event: 'zoomChanged', cb: on('zoomChanged') },

          { event: 'navigationComplete', cb: on('navigationComplete') },
          { event: 'coordinateNavigation', cb: on('coordinateNavigation') },

          { event: 'selectionChanged', cb: on('selectionChanged') },
          { event: 'selectionCopied', cb: on('selectionCopied') },
          { event: 'selectionHighlighted', cb: on('selectionHighlighted') },

          { event: 'renderComplete', cb: on('renderComplete') },
          { event: 'renderError', cb: on('renderError') },

          { event: 'highlightAdded', cb: on('highlightAdded') },
          { event: 'highlightRemoved', cb: on('highlightRemoved') },
          { event: 'styleUpdated', cb: on('styleUpdated') },

          { event: 'refreshComplete', cb: on('refreshComplete') },
          { event: 'interactionModeChanged', cb: on('interactionModeChanged') },

          { event: 'error', cb: on('error') },
          { event: 'destroyed', cb: on('destroyed') },
        ];

        listeners.forEach(({ event, cb }) => viewer!.addEventListener(event, cb));

        await viewer.loadPDF(PDF_URL);
        viewer.loadHighlights(highlights);

        if (mounted) {
          viewerRef.current = viewer;
        }
      } catch (err) {
        console.error('Error in initViewer:', err);
        pushEvent('ui.initError', err);
      }
    };

    initViewer();

    return () => {
      mounted = false;
      if (viewer) viewer.destroy();
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initKey]);

  // Keep viewer highlights in sync when state changes (manual reload button is also available)
  useEffect(() => {
    // Don’t auto-reload on every change; leave manual control for testing.
  }, [highlights]);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 10,
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
          padding: 8,
          borderRadius: 8,
          boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
          maxWidth: 'calc(300px)',
          background: 'rgba(0,0,0,0.75)',
        }}
        className="text-primary"
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <DialDropdown menu={{ items: dropdownHighlightItems }} matchReferenceWidth={false}>
            <DialButton label="Go to highlight" variant={ButtonVariant.Primary} />
          </DialDropdown>

          <DialDropdown menu={{ items: dropdownPageItems }} matchReferenceWidth={false}>
            <DialButton label="Go to page" variant={ButtonVariant.Secondary} />
          </DialDropdown>

          <DialButton
            label="Page 3 top"
            variant={ButtonVariant.Secondary}
            onClick={jumpToPage3Top}
          />
          <DialButton
            label="Page 3 coord"
            variant={ButtonVariant.Secondary}
            onClick={jumpToPage3Coord}
          />

          <DialButton
            label="Prev HL"
            variant={ButtonVariant.Secondary}
            onClick={() => viewerRef.current?.previousHighlight()}
          />
          <DialButton
            label="Next HL"
            variant={ButtonVariant.Secondary}
            onClick={() => viewerRef.current?.nextHighlight()}
          />

          <DialButton
            label="Zoom +"
            variant={ButtonVariant.Secondary}
            onClick={() => viewerRef.current?.zoomIn()}
          />
          <DialButton
            label="Zoom -"
            variant={ButtonVariant.Secondary}
            onClick={() => viewerRef.current?.zoomOut()}
          />
          <DialButton
            label="Auto zoom"
            variant={ButtonVariant.Secondary}
            onClick={() => viewerRef.current?.setZoom(ZoomMode.AUTO)}
          />
          <DialButton
            label="Fit Page zoom"
            variant={ButtonVariant.Secondary}
            onClick={() => viewerRef.current?.setZoom(ZoomMode.PAGE_FIT)}
          />
          <DialButton
            label="Reset zoom"
            variant={ButtonVariant.Secondary}
            onClick={() => viewerRef.current?.resetZoom()}
          />

          <DialButton
            label="Toggle selection"
            variant={ButtonVariant.Secondary}
            onClick={() => viewerRef.current?.toggleTextSelection()}
          />

          <DialButton
            label="Add random"
            variant={ButtonVariant.Secondary}
            onClick={addRandomHighlight}
          />
          <DialButton
            label="Remove last"
            variant={ButtonVariant.Secondary}
            onClick={removeLastHighlight}
          />
          <DialButton
            label="Mutate red style"
            variant={ButtonVariant.Secondary}
            onClick={mutateRedStyle}
          />

          <DialButton
            label="Reset HL"
            variant={ButtonVariant.Secondary}
            onClick={resetHighlights}
          />
          <DialButton
            label="Clear HL"
            variant={ButtonVariant.Secondary}
            onClick={clearHighlights}
          />
          <DialButton
            label="Reload HL"
            variant={ButtonVariant.Secondary}
            onClick={reloadHighlightsIntoViewer}
          />

          <DialButton
            label="Assert p3 rendered"
            variant={ButtonVariant.Secondary}
            onClick={assertPage3Rendered}
          />
          <DialButton
            label="Dump metrics"
            variant={ButtonVariant.Secondary}
            onClick={dumpMetrics}
          />

          <DialButton
            label="Clear events"
            variant={ButtonVariant.Secondary}
            onClick={clearEvents}
          />
          <DialButton label="Reinit" variant={ButtonVariant.Secondary} onClick={reinitViewer} />
        </div>

        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            marginLeft: 8,
            flexWrap: 'wrap',
          }}
        >
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={alertOnEvents}
              onChange={(e) => setAlertOnEvents(e.target.checked)}
            />
            alert
          </label>

          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={enableVirtualScrolling}
              onChange={(e) => setEnableVirtualScrolling(e.target.checked)}
            />
            virtual scrolling
          </label>

          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={enableMultilineHover}
              onChange={(e) => setEnableMultilineHover(e.target.checked)}
            />
            multiline hover
          </label>

          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={performanceMode}
              onChange={(e) => setPerformanceMode(e.target.checked)}
            />
            performance mode
          </label>

          <div style={{ fontFamily: 'monospace', fontSize: 12, opacity: 0.8 }}>
            page: <b>{currentPage}</b>
            {totalPages ? (
              <>
                {' '}
                / <b>{totalPages}</b>
              </>
            ) : null}
            {'  '}zoom: <b>{currentZoom ?? '—'}</b>
            {'  '}rendered:{' '}
            <b>
              {Array.from(renderedPages)
                .sort((a, b) => a - b)
                .join(', ') || '—'}
            </b>
          </div>
        </div>

        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
          Note: changing checkboxes requires <b>Reinit</b> to apply.
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          right: 12,
          top: 12,
          zIndex: 9999,
          width: 460,
          maxHeight: '60vh',
          overflow: 'auto',
          background: 'rgba(0,0,0,0.75)',
          color: 'white',
          padding: 10,
          borderRadius: 8,
          fontFamily: 'monospace',
          fontSize: 12,
        }}
      >
        <div style={{ marginBottom: 8, opacity: 0.9 }}>Events (latest first)</div>
        {events.map((e) => (
          <div
            key={e.ts + e.event}
            style={{
              marginBottom: 10,
              borderBottom: '1px solid rgba(255,255,255,0.12)',
              paddingBottom: 10,
            }}
          >
            <div style={{ opacity: 0.95 }}>
              {new Date(e.ts).toLocaleTimeString()} — <b>{e.event}</b>
            </div>
            <div style={{ opacity: 0.8, whiteSpace: 'pre-wrap' }}>
              {(() => {
                try {
                  return JSON.stringify(e.data, null, 2);
                } catch {
                  return String(e.data);
                }
              })()}
            </div>
          </div>
        ))}
      </div>

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
