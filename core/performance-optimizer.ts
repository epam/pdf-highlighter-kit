import {
  MemoryMetrics,
  BoundingBox,
  TermOccurrence,
  HeavyTask,
  PerformanceMetrics,
} from '../types';

export interface SpatialIndex {
  insert(bounds: BoundingBox, data: any): void;
  search(bounds: BoundingBox): any[];
  remove(bounds: BoundingBox, data: any): void;
  clear(): void;
}

export class RTree implements SpatialIndex {
  private root: RTreeNode | null = null;
  private maxEntries = 9;
  private minEntries = 4;

  insert(bounds: BoundingBox, data: any): void {
    const item: RTreeItem = { bounds, data };

    if (!this.root) {
      this.root = {
        children: [item],
        bounds: bounds,
        leaf: true,
      };
      return;
    }

    const insertPath: RTreeNode[] = [];
    const node = this._chooseSubtree(bounds, this.root, insertPath);

    node.children.push(item);
    this._adjustBounds(node);

    if (node.children.length > this.maxEntries) {
      this._split(insertPath, node);
    }
  }

  search(bounds: BoundingBox): any[] {
    if (!this.root) return [];

    const result: any[] = [];
    this._search(bounds, this.root, result);
    return result;
  }

  remove(bounds: BoundingBox, data: any): void {
    if (!this.root) return;

    const path: RTreeNode[] = [];
    const item = this._findItem(bounds, data, this.root, path);

    if (item) {
      const node = path[path.length - 1];
      const index = node.children.indexOf(item);
      node.children.splice(index, 1);

      this._condenseTree(path);
    }
  }

  clear(): void {
    this.root = null;
  }

  private _chooseSubtree(bounds: BoundingBox, node: RTreeNode, path: RTreeNode[]): RTreeNode {
    path.push(node);

    if (node.leaf) return node;

    let minEnlargement = Infinity;
    let targetNode = node.children[0] as RTreeNode;

    for (const child of node.children as RTreeNode[]) {
      const enlargement = this._enlargement(bounds, child.bounds);
      if (enlargement < minEnlargement) {
        minEnlargement = enlargement;
        targetNode = child;
      }
    }

    return this._chooseSubtree(bounds, targetNode, path);
  }

  private _search(bounds: BoundingBox, node: RTreeNode, result: any[]): void {
    if (!this._intersects(bounds, node.bounds)) return;

    if (node.leaf) {
      for (const item of node.children as RTreeItem[]) {
        if (this._intersects(bounds, item.bounds)) {
          result.push(item.data);
        }
      }
    } else {
      for (const child of node.children as RTreeNode[]) {
        this._search(bounds, child, result);
      }
    }
  }

  private _intersects(a: BoundingBox, b: BoundingBox): boolean {
    return !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2);
  }

  private _enlargement(bounds: BoundingBox, nodeBounds: BoundingBox): number {
    const newBounds = this._extend(nodeBounds, bounds);
    return this._area(newBounds) - this._area(nodeBounds);
  }

  private _extend(a: BoundingBox, b: BoundingBox): BoundingBox {
    return {
      x1: Math.min(a.x1, b.x1),
      y1: Math.min(a.y1, b.y1),
      x2: Math.max(a.x2, b.x2),
      y2: Math.max(a.y2, b.y2),
    };
  }

  private _area(bounds: BoundingBox): number {
    return (bounds.x2 - bounds.x1) * (bounds.y2 - bounds.y1);
  }

  private _adjustBounds(node: RTreeNode): void {
    if (node.children.length === 0) return;

    const first = node.children[0];
    let bounds = 'bounds' in first ? first.bounds : (first as RTreeItem).bounds;

    for (let i = 1; i < node.children.length; i++) {
      const child = node.children[i];
      const childBounds = 'bounds' in child ? child.bounds : (child as RTreeItem).bounds;
      bounds = this._extend(bounds, childBounds);
    }

    node.bounds = bounds;
  }

  private _split(insertPath: RTreeNode[], node: RTreeNode): void {
    const newNode = {
      children: [],
      bounds: { x1: 0, y1: 0, x2: 0, y2: 0 },
      leaf: node.leaf,
    };

    this._chooseSplitAxis(node, newNode);

    this._adjustBounds(node);
    this._adjustBounds(newNode);

    if (insertPath.length === 1) {
      this.root = {
        children: [node, newNode],
        bounds: this._extend(node.bounds, newNode.bounds),
        leaf: false,
      };
    } else {
      const parent = insertPath[insertPath.length - 2];
      parent.children.push(newNode);
    }
  }

  private _chooseSplitAxis(node: RTreeNode, newNode: RTreeNode): void {
    const mid = Math.ceil(node.children.length / 2);
    newNode.children = node.children.splice(mid);
  }

  private _condenseTree(path: RTreeNode[]): void {
    for (let i = path.length - 1; i >= 0; i--) {
      const node = path[i];
      if (node.children.length < this.minEntries && i > 0) {
        const parent = path[i - 1];
        const index = parent.children.indexOf(node);
        parent.children.splice(index, 1);
      }
    }
  }

  private _findItem(
    bounds: BoundingBox,
    data: any,
    node: RTreeNode,
    path: RTreeNode[]
  ): RTreeItem | null {
    path.push(node);

    if (node.leaf) {
      return (
        (node.children as RTreeItem[]).find(
          (item) => item.data === data && this._boundsEqual(item.bounds, bounds)
        ) || null
      );
    }

    for (const child of node.children as RTreeNode[]) {
      if (this._intersects(bounds, child.bounds)) {
        const result = this._findItem(bounds, data, child, path);
        if (result) return result;
      }
    }

    path.pop();
    return null;
  }

  private _boundsEqual(a: BoundingBox, b: BoundingBox): boolean {
    return a.x1 === b.x1 && a.y1 === b.y1 && a.x2 === b.x2 && a.y2 === b.y2;
  }
}

interface RTreeNode {
  children: (RTreeNode | RTreeItem)[];
  bounds: BoundingBox;
  leaf: boolean;
}

interface RTreeItem {
  bounds: BoundingBox;
  data: any;
}

export class MemoryManager {
  private cache = new Map<string, { data: any; lastAccess: number; size: number }>();
  private maxCacheSize: number;
  private currentCacheSize = 0;

  constructor(maxCacheSizeMB = 100) {
    this.maxCacheSize = maxCacheSizeMB * 1024 * 1024;
    this.startMemoryMonitoring();
  }

  set(key: string, data: any): void {
    const size = this.estimateSize(data);

    if (this.cache.has(key)) {
      const oldItem = this.cache.get(key)!;
      this.currentCacheSize -= oldItem.size;
    }

    this.cache.set(key, {
      data,
      lastAccess: Date.now(),
      size,
    });
    this.currentCacheSize += size;

    this.evictIfNeeded();
  }

  get(key: string): any | null {
    const item = this.cache.get(key);
    if (item) {
      item.lastAccess = Date.now();
      return item.data;
    }
    return null;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): void {
    const item = this.cache.get(key);
    if (item) {
      this.currentCacheSize -= item.size;
      this.cache.delete(key);
    }
  }

  clear(): void {
    this.cache.clear();
    this.currentCacheSize = 0;
  }

  getMemoryUsage(): MemoryMetrics {
    const memoryInfo = (performance as any).memory;

    return {
      pages: this.calculatePageMemory(),
      highlights: this.calculateHighlightMemory(),
      cache: Math.round(this.currentCacheSize / 1024 / 1024), // MB
      total: memoryInfo ? Math.round(memoryInfo.usedJSHeapSize / 1024 / 1024) : undefined,
    };
  }

  private evictIfNeeded(): void {
    while (this.currentCacheSize > this.maxCacheSize) {
      const lruKey = this.findLRUKey();
      if (lruKey) {
        this.delete(lruKey);
      } else {
        break;
      }
    }
  }

  private findLRUKey(): string | null {
    let lruKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, item] of this.cache) {
      if (item.lastAccess < oldestTime) {
        oldestTime = item.lastAccess;
        lruKey = key;
      }
    }

    return lruKey;
  }

  private estimateSize(data: any): number {
    if (data === null || data === undefined) return 0;
    if (typeof data === 'string') return data.length * 2;
    if (typeof data === 'number') return 8;
    if (typeof data === 'boolean') return 4;
    if (data instanceof HTMLCanvasElement) {
      return data.width * data.height * 4;
    }
    if (Array.isArray(data)) {
      return data.reduce((sum, item) => sum + this.estimateSize(item), 0);
    }
    if (typeof data === 'object') {
      return Object.keys(data).reduce(
        (sum, key) => sum + this.estimateSize(key) + this.estimateSize(data[key]),
        0
      );
    }
    return 1000;
  }

  private calculatePageMemory(): number {
    let pageMemory = 0;
    for (const [key, item] of this.cache) {
      if (key.startsWith('page:')) {
        pageMemory += item.size;
      }
    }
    return Math.round(pageMemory / 1024 / 1024);
  }

  private calculateHighlightMemory(): number {
    let highlightMemory = 0;
    for (const [key, item] of this.cache) {
      if (key.startsWith('highlight:')) {
        highlightMemory += item.size;
      }
    }
    return Math.round(highlightMemory / 1024 / 1024);
  }

  private startMemoryMonitoring(): void {
    setInterval(() => {
      const usage = this.getMemoryUsage();
      if (usage.total && usage.total > 200) {
        console.warn('High memory usage detected:', usage);
        this.forceEviction();
      }
    }, 10000);
  }

  private forceEviction(): void {
    const targetSize = this.maxCacheSize * 0.7;

    while (this.currentCacheSize > targetSize) {
      const lruKey = this.findLRUKey();
      if (lruKey) {
        this.delete(lruKey);
      } else {
        break;
      }
    }
  }
}

export class RenderOptimizer {
  private frameBudget = 16;
  private renderQueue: (() => Promise<void>)[] = [];
  private isProcessing = false;

  constructor(frameBudget = 16) {
    this.frameBudget = frameBudget;
  }

  queueRenderTask(task: () => Promise<void>): void {
    this.renderQueue.push(task);
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    this.isProcessing = true;

    while (this.renderQueue.length > 0) {
      const frameStart = performance.now();

      while (this.renderQueue.length > 0 && performance.now() - frameStart < this.frameBudget) {
        const task = this.renderQueue.shift()!;
        try {
          await task();
        } catch (error) {
          console.error('Render task failed:', error);
        }
      }

      if (this.renderQueue.length > 0) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }

    this.isProcessing = false;
  }

  measureRenderTime(fn: () => void | Promise<void>): Promise<number> {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve) => {
      const start = performance.now();
      await fn();
      const end = performance.now();
      resolve(end - start);
    });
  }

  clearQueue(): void {
    this.renderQueue = [];
  }

  getQueueStatus(): { queueLength: number; isProcessing: boolean } {
    return {
      queueLength: this.renderQueue.length,
      isProcessing: this.isProcessing,
    };
  }
}

export class WorkerTaskManager {
  private workers: Worker[] = [];
  private taskQueue: HeavyTask[] = [];
  private maxWorkers = navigator.hardwareConcurrency || 4;

  constructor(workerScript: string) {
    this.initializeWorkers(workerScript);
  }

  private initializeWorkers(workerScript: string): void {
    for (let i = 0; i < this.maxWorkers; i++) {
      try {
        const worker = new Worker(workerScript);
        this.workers.push(worker);
      } catch (error) {
        console.warn('Failed to create worker:', error);
      }
    }
  }

  executeTask(task: HeavyTask): Promise<any> {
    return new Promise((resolve, reject) => {
      const availableWorker = this.workers.find((worker) => !worker.onmessage);

      if (availableWorker) {
        availableWorker.onmessage = (e) => {
          resolve(e.data);
          availableWorker.onmessage = null;
        };
        availableWorker.onerror = reject;
        availableWorker.postMessage(task);
      } else {
        this.taskQueue.push(task);
        setTimeout(() => this.processQueue(), 100);
      }
    });
  }

  private processQueue(): void {
    if (this.taskQueue.length === 0) return;

    const availableWorker = this.workers.find((worker) => !worker.onmessage);
    if (availableWorker && this.taskQueue.length > 0) {
      const task = this.taskQueue.shift()!;
      this.executeTask(task);
    }
  }

  destroy(): void {
    this.workers.forEach((worker) => worker.terminate());
    this.workers = [];
    this.taskQueue = [];
  }
}

export class PerformanceOptimizer {
  public memoryManager: MemoryManager;
  public spatialIndex: SpatialIndex;
  public renderOptimizer: RenderOptimizer;
  public workerManager: WorkerTaskManager | null = null;

  private performanceMetrics: PerformanceMetrics = {
    renderTime: 0,
    highlightRenderTime: 0,
    interactionLatency: 0,
    memoryUsage: { pages: 0, highlights: 0, cache: 0 },
    fps: 60,
  };

  constructor(
    options: {
      maxCacheSize?: number;
      frameBudget?: number;
      workerScript?: string;
    } = {}
  ) {
    this.memoryManager = new MemoryManager(options.maxCacheSize);
    this.spatialIndex = new RTree();
    this.renderOptimizer = new RenderOptimizer(options.frameBudget);

    if (options.workerScript) {
      this.workerManager = new WorkerTaskManager(options.workerScript);
    }

    this.startPerformanceMonitoring();
  }

  buildSpatialIndex(highlights: TermOccurrence[], pageNumber: number): void {
    this.spatialIndex.clear();

    highlights.forEach((highlight) => {
      highlight.coordinates.forEach((coord) => {
        this.spatialIndex.insert(coord, {
          termId: highlight.termId,
          pageNumber,
          coordinates: coord,
        });
      });
    });
  }

  findHighlightsInViewport(viewportBounds: BoundingBox): any[] {
    return this.spatialIndex.search(viewportBounds);
  }

  getPerformanceMetrics(): PerformanceMetrics {
    this.performanceMetrics.memoryUsage = this.memoryManager.getMemoryUsage();
    return { ...this.performanceMetrics };
  }

  updateMetric(metric: keyof PerformanceMetrics, value: any): void {
    (this.performanceMetrics as any)[metric] = value;
  }

  private startPerformanceMonitoring(): void {
    let frameCount = 0;
    let lastTime = performance.now();

    const monitorFPS = () => {
      const currentTime = performance.now();
      frameCount++;

      if (currentTime - lastTime >= 1000) {
        this.performanceMetrics.fps = frameCount;
        frameCount = 0;
        lastTime = currentTime;
      }

      requestAnimationFrame(monitorFPS);
    };

    monitorFPS();
  }

  optimize(): void {
    const metrics = this.getPerformanceMetrics();

    if (metrics.fps < 30) {
      this.renderOptimizer = new RenderOptimizer(8);
    } else if (metrics.fps > 50) {
      this.renderOptimizer = new RenderOptimizer(16);
    }

    if (metrics.memoryUsage.total && metrics.memoryUsage.total > 150) {
      this.memoryManager.clear();
    }
  }

  destroy(): void {
    this.memoryManager.clear();
    this.spatialIndex.clear();
    this.renderOptimizer.clearQueue();

    if (this.workerManager) {
      this.workerManager.destroy();
    }
  }
}
