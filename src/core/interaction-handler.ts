import {
  InteractionIntent,
  InteractionMode,
  SelectionState,
  TextRange,
  SelectionWithMetadata,
  PageBBoxRef,
  BoundingBox,
  HighlightHoverEvent,
  HighlightClickEvent,
  TextSelectionEvent,
} from '../types';

export interface InteractionCallbacks {
  onHighlightHover?: (event: HighlightHoverEvent) => void;
  onHighlightBlur?: (termId: string) => void;
  onHighlightClick?: (event: HighlightClickEvent) => void;
  onTextSelected?: (event: TextSelectionEvent) => void;
  onSelectionChanged?: (selection: string) => void;
  onInteractionModeChanged?: (mode: InteractionMode) => void;
}

export class UnifiedInteractionHandler {
  private container: HTMLElement | null = null;
  private interactionMode: InteractionMode = 'hybrid';
  private callbacks: InteractionCallbacks = {};
  private hoveredTermId: string | null = null;

  private selectionState: SelectionState = {
    isSelecting: false,
    startPoint: null,
    endPoint: null,
    selectedText: '',
    overlappingHighlights: [],
  };

  private isMouseDown = false;
  private dragStartTime = 0;
  private dragThreshold = 5;
  private clickTimeout = 200;

  private eventListeners: {
    element: Element | Document;
    event: string;
    handler: EventListener;
  }[] = [];

  constructor(callbacks: InteractionCallbacks = {}) {
    this.callbacks = callbacks;
  }

  init(container: HTMLElement): void {
    this.container = container;
    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    if (!this.container) return;

    const events = [
      { event: 'mousedown', handler: this.handleMouseDown.bind(this) as EventListener },
      { event: 'mousemove', handler: this.handleMouseMove.bind(this) as EventListener },
      { event: 'mouseup', handler: this.handleMouseUp.bind(this) as EventListener },
      { event: 'click', handler: this.handleClick.bind(this) as EventListener },
      { event: 'dblclick', handler: this.handleDoubleClick.bind(this) as EventListener },
      { event: 'contextmenu', handler: this.handleContextMenu.bind(this) as EventListener },
      { event: 'keydown', handler: this.handleKeyDown.bind(this) as EventListener },
      { event: 'selectstart', handler: this.handleSelectStart.bind(this) as EventListener },
      { event: 'selectionchange', handler: this.handleSelectionChange.bind(this) as EventListener },
    ];

    events.forEach(({ event, handler }) => {
      const target = event === 'selectionchange' ? document : this.container!;
      target.addEventListener(event, handler);
      this.eventListeners.push({ element: target, event, handler });
    });
  }

  private detectIntent(event: MouseEvent): InteractionIntent {
    const target = event.target as HTMLElement;
    const highlight = target.closest('.highlight-wrapper');

    if (event.shiftKey || event.ctrlKey) return 'text-select';
    if (event.altKey) return 'highlight-interact';

    switch (this.interactionMode) {
      case 'select':
        return 'text-select';
      case 'highlight':
        return 'highlight-interact';
      case 'hybrid':
      default:
        if (highlight && !this.isSelectionGesture(event)) {
          return 'highlight-interact';
        }
        return 'auto';
    }
  }

  private isSelectionGesture(event: MouseEvent): boolean {
    if (event.detail === 2) return true;

    return false;
  }

  private handleMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return;

    this.isMouseDown = true;
    this.dragStartTime = Date.now();

    const intent = this.detectIntent(event);

    this.selectionState.startPoint = { x: event.clientX, y: event.clientY };
    this.selectionState.isSelecting = false;

    switch (intent) {
      case 'highlight-interact':
        this.startHighlightInteraction(event);
        break;
      case 'text-select':
        this.startTextSelection(event);
        break;
      case 'auto':
        this.startAutoDetection(event);
        break;
    }
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.isMouseDown) {
      this.handleHover(event);
      return;
    }

    const currentPoint = { x: event.clientX, y: event.clientY };

    if (this.selectionState.startPoint) {
      const distance = Math.sqrt(
        Math.pow(currentPoint.x - this.selectionState.startPoint.x, 2) +
          Math.pow(currentPoint.y - this.selectionState.startPoint.y, 2)
      );

      if (distance > this.dragThreshold && !this.selectionState.isSelecting) {
        this.selectionState.isSelecting = true;
        this.startTextSelection(event);
      }
    }

    if (this.selectionState.isSelecting) {
      this.updateTextSelection(event);
    }
  }

  private handleMouseUp(event: MouseEvent): void {
    if (event.button !== 0) return;

    this.isMouseDown = false;

    if (this.selectionState.isSelecting) {
      this.finishTextSelection(event);
    }

    this.selectionState.isSelecting = false;
    this.selectionState.startPoint = null;
    this.selectionState.endPoint = null;
  }

  private handleClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const highlight = target.closest('.highlight-wrapper') || target.closest('.highlight');

    if (highlight && this.interactionMode !== 'select') {
      this.handleHighlightClick(event, highlight);
    }
  }

  private handleDoubleClick(event: MouseEvent): void {
    this.selectWordAtPoint(event);
  }

  private handleContextMenu(event: MouseEvent): void {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim() === '') {
      event.preventDefault();
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.ctrlKey && event.key === 'a') {
      this.selectAllText();
      event.preventDefault();
    }

    if (event.key === 'Escape') {
      this.clearSelection();
    }

    if (event.key === 'h' && event.ctrlKey) {
      this.setInteractionMode('highlight');
      event.preventDefault();
    }
    if (event.key === 's' && event.ctrlKey) {
      this.setInteractionMode('select');
      event.preventDefault();
    }
  }

  private handleSelectStart(event: Event): void {
    if (this.interactionMode === 'highlight') {
      event.preventDefault();
    }
  }

  private handleSelectionChange(): void {
    const selection = window.getSelection();
    if (!selection) return;

    const selectedText = selection.toString();
    this.selectionState.selectedText = selectedText;

    if (selectedText.trim() !== '') {
      this.processTextSelection();
    }

    if (this.callbacks.onSelectionChanged) {
      this.callbacks.onSelectionChanged(selectedText);
    }
  }

  private startHighlightInteraction(event: MouseEvent): void {
    event.preventDefault();
    document.body.style.userSelect = 'none';
  }

  private startTextSelection(_event: MouseEvent): void {
    document.body.style.userSelect = 'text';
    this.selectionState.isSelecting = true;
  }

  private startAutoDetection(_event: MouseEvent): void {
    return;
  }

  private handleHover(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const highlight = target.closest('.highlight-wrapper') || target.closest('.highlight');

    if (highlight) {
      const termId = highlight.getAttribute('data-term-id');
      if (termId) {
        this.hoveredTermId = termId;
        this.handleHighlightHover(event, highlight, termId);
      }
    } else if (this.hoveredTermId) {
      this.handleHighlightBlur(event, this.hoveredTermId);
    }
  }

  private handleHighlightHover(event: MouseEvent, element: Element, termId: string): void {
    const rect = element.getBoundingClientRect();

    const bboxIndex = this.getBBoxIndexFromElement(element);
    const pageNumber = this.getPageNumberFromElement(element);

    const hoverEvent: HighlightHoverEvent = {
      termId,
      pageNumber,
      bboxIndex,
      bbox: {
        x1: rect.left,
        y1: rect.top,
        x2: rect.right,
        y2: rect.bottom,
      },
      mouseEvent: event,
    };

    if (this.callbacks.onHighlightHover) {
      this.callbacks.onHighlightHover(hoverEvent);
    }
  }

  private handleHighlightBlur(event: MouseEvent, termId: string): void {
    this.hoveredTermId = null;
    if (this.callbacks.onHighlightBlur) {
      this.callbacks.onHighlightBlur(termId);
    }
  }

  private handleHighlightClick(event: MouseEvent, element: Element): void {
    const termId = element.getAttribute('data-term-id');
    if (!termId) return;

    const rect = element.getBoundingClientRect();

    const bboxIndex = this.getBBoxIndexFromElement(element);
    const pageNumber = this.getPageNumberFromElement(element);

    const clickEvent: HighlightClickEvent = {
      termId,
      pageNumber,
      bboxIndex,
      bbox: {
        x1: rect.left,
        y1: rect.top,
        x2: rect.right,
        y2: rect.bottom,
      },
      mouseEvent: event,
    };

    if (this.callbacks.onHighlightClick) {
      this.callbacks.onHighlightClick(clickEvent);
    }
  }

  private updateTextSelection(event: MouseEvent): void {
    this.selectionState.endPoint = { x: event.clientX, y: event.clientY };
  }

  private finishTextSelection(_event: MouseEvent): void {
    this.processTextSelection();
    document.body.style.userSelect = '';
  }

  private processTextSelection(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const selectedText = selection.toString().trim();

    if (selectedText === '') return;

    const highlights = this.findHighlightsInRange(range);

    const pages = this.getPagesFromRange(range);

    const selectionEvent: TextSelectionEvent = {
      text: selectedText,
      highlights,
      range,
      pageNumbers: pages,
    };

    if (this.callbacks.onTextSelected) {
      this.callbacks.onTextSelected(selectionEvent);
    }
  }

  private getBBoxIndexFromElement(element: Element): number | undefined {
    const raw = element.getAttribute('data-bbox-index');
    if (raw == null) return undefined;

    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }

  private findHighlightsInRange(range: Range): PageBBoxRef[] {
    const result = new Map<string, PageBBoxRef>();

    const container = range.commonAncestorContainer;
    const walker = document.createTreeWalker(
      container.nodeType === Node.TEXT_NODE ? container.parentNode! : container,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node: Element) => {
          return node.classList.contains('highlight-wrapper') ||
            node.classList.contains('highlight')
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        },
      }
    );

    let node: Node | null;
    while ((node = walker.nextNode())) {
      const element = node as Element;

      const id = element.getAttribute('data-term-id');
      if (!id) continue;

      if (!range.intersectsNode(element)) continue;

      const page = this.getPageNumberFromElement(element);
      const bboxIndex = this.getBBoxIndexFromElement(element) ?? 0;

      const rect = element.getBoundingClientRect();
      const bbox: BoundingBox = {
        x1: rect.left,
        y1: rect.top,
        x2: rect.right,
        y2: rect.bottom,
      };

      const key = `${id}:${page}:${bboxIndex}`;
      if (!result.has(key)) {
        result.set(key, { id, page, bboxIndex, bbox });
      }
    }

    return Array.from(result.values());
  }

  private getPagesFromRange(range: Range): number[] {
    const pages = new Set<number>();

    const container = range.commonAncestorContainer;
    const walker = document.createTreeWalker(
      container.nodeType === Node.TEXT_NODE ? container.parentNode! : container,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node: Element) => {
          return node.classList.contains('pdf-page-container')
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        },
      }
    );

    let node: Node | null;
    while ((node = walker.nextNode())) {
      const element = node as Element;
      const pageNumber = parseInt(element.getAttribute('data-page-number') || '1');
      pages.add(pageNumber);
    }

    return Array.from(pages).sort((a, b) => a - b);
  }

  private selectWordAtPoint(event: MouseEvent): void {
    const selection = window.getSelection();
    if (!selection) return;

    const range = document.caretRangeFromPoint(event.clientX, event.clientY);
    if (!range) return;

    selection.removeAllRanges();
    selection.addRange(range);
    selection.modify('move', 'backward', 'word');
    selection.modify('extend', 'forward', 'word');

    this.processTextSelection();
  }

  private selectAllText(): void {
    if (!this.container) return;

    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(this.container);
    selection.removeAllRanges();
    selection.addRange(range);

    this.processTextSelection();
  }

  /**
   * Clear selection
   */
  clearSelection(): void {
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
    this.selectionState.selectedText = '';
    this.selectionState.overlappingHighlights = [];
  }

  getSelectionWithContext(): SelectionWithMetadata | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();

    if (text === '') return null;

    return {
      text,
      pages: this.getPagesFromRange(range),
      highlights: this.findHighlightsInRange(range),
      context: this.getSelectionContext(range),
      range: this.convertToTextRange(range),
    };
  }

  private getSelectionContext(range: Range): string {
    const contextLength = 50;
    const container = range.commonAncestorContainer;
    const fullText = container.textContent || '';

    const selectedText = range.toString();
    const startIndex = fullText.indexOf(selectedText);

    if (startIndex === -1) return '';

    const contextStart = Math.max(0, startIndex - contextLength);
    const contextEnd = Math.min(fullText.length, startIndex + selectedText.length + contextLength);

    return fullText.substring(contextStart, contextEnd);
  }

  private convertToTextRange(range: Range): TextRange {
    return {
      startPage: 1,
      endPage: 1,
      startOffset: 0,
      endOffset: range.toString().length,
    };
  }

  private getPageNumberFromElement(element: Element): number {
    const direct = element.getAttribute('data-page');
    if (direct) {
      const n = Number(direct);
      if (Number.isFinite(n)) return n;
    }

    const pageContainer = element.closest('.pdf-page-container');
    return pageContainer ? parseInt(pageContainer.getAttribute('data-page-number') || '1') : 1;
  }

  private isDoubleClick(_event: MouseEvent): boolean {
    return Date.now() - this.dragStartTime < this.clickTimeout;
  }

  setInteractionMode(mode: InteractionMode): void {
    const oldMode = this.interactionMode;
    this.interactionMode = mode;

    if (this.callbacks.onInteractionModeChanged && oldMode !== mode) {
      this.callbacks.onInteractionModeChanged(mode);
    }
  }

  getInteractionMode(): InteractionMode {
    return this.interactionMode;
  }

  destroy(): void {
    this.eventListeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
    this.eventListeners = [];

    this.selectionState = {
      isSelecting: false,
      startPoint: null,
      endPoint: null,
      selectedText: '',
      overlappingHighlights: [],
    };

    this.container = null;
  }
}
