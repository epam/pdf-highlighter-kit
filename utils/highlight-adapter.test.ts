import { describe, it, expect } from 'vitest';
import {
  adaptHighlightData,
  extractCategoryStyles,
  validateInputData,
  mergeHighlightData,
} from './highlight-adapter';
import type { InputHighlightData, HighlightData } from '../types';

describe('Highlight Adapter', () => {
  describe('adaptHighlightData', () => {
    it('should convert basic input data to HighlightData format', () => {
      const input: InputHighlightData[] = [
        {
          id: 'highlight-1',
          bboxes: [{ x1: 10, y1: 20, x2: 100, y2: 30, page: 1 }],
          style: {
            backgroundColor: '#ff0000',
            opacity: 0.5,
          },
          tooltipText: 'Test Term',
          metadata: {
            category: 'test',
          },
        },
      ];

      const result = adaptHighlightData(input, {
        categoryResolver: (h) => h.metadata?.category as string,
      });

      expect(result).toHaveProperty('test');
      expect(result.test.pages).toHaveProperty('1');
      expect(result.test.pages['1']).toHaveLength(1);
      expect(result.test.pages['1'][0].termId).toBe('highlight-1');
      expect(result.test.terms).toHaveProperty('highlight-1');
      expect(result.test.terms['highlight-1'].term).toBe('Test Term');
    });

    it('should handle multiple bboxes on the same page', () => {
      const input: InputHighlightData[] = [
        {
          id: 'highlight-1',
          bboxes: [
            { x1: 10, y1: 20, x2: 100, y2: 30, page: 1 },
            { x1: 10, y1: 40, x2: 100, y2: 50, page: 1 },
          ],
          style: {
            backgroundColor: '#ff0000',
          },
          tooltipText: 'Multi-line Term',
          metadata: {
            category: 'test',
          },
        },
      ];

      const result = adaptHighlightData(input, {
        categoryResolver: (h) => h.metadata?.category as string,
      });

      expect(result.test.pages['1'][0].coordinates).toHaveLength(2);
    });

    it('should handle highlights across multiple pages', () => {
      const input: InputHighlightData[] = [
        {
          id: 'highlight-1',
          bboxes: [
            { x1: 10, y1: 20, x2: 100, y2: 30, page: 1 },
            { x1: 50, y1: 100, x2: 200, y2: 120, page: 2 },
            { x1: 30, y1: 50, x2: 180, y2: 70, page: 3 },
          ],
          style: {
            backgroundColor: '#0000ff',
          },
          tooltipText: 'Multi-page Term',
          metadata: {
            category: 'test',
          },
        },
      ];

      const result = adaptHighlightData(input, {
        categoryResolver: (h) => h.metadata?.category as string,
      });

      expect(result.test.pages).toHaveProperty('1');
      expect(result.test.pages).toHaveProperty('2');
      expect(result.test.pages).toHaveProperty('3');
      expect(result.test.terms['highlight-1'].pages).toEqual([1, 2, 3]);
    });

    it('should use custom category resolver', () => {
      const input: InputHighlightData[] = [
        {
          id: 'highlight-1',
          bboxes: [{ x1: 10, y1: 20, x2: 100, y2: 30, page: 1 }],
          style: { backgroundColor: '#ff0000' },
          tooltipText: 'Test',
          metadata: { type: 'protein' },
        },
      ];

      const result = adaptHighlightData(input, {
        categoryResolver: (h) => (h.metadata?.type as string) || 'unknown',
      });

      expect(result).toHaveProperty('protein');
      expect(result.protein.terms['highlight-1'].category).toBe('protein');
    });

    it('should group by style when enabled', () => {
      const input: InputHighlightData[] = [
        {
          id: 'red-1',
          bboxes: [{ x1: 10, y1: 20, x2: 100, y2: 30, page: 1 }],
          style: { backgroundColor: '#ff0000' },
          tooltipText: 'Red highlight',
        },
        {
          id: 'red-2',
          bboxes: [{ x1: 50, y1: 100, x2: 200, y2: 120, page: 1 }],
          style: { backgroundColor: '#ff0000' },
          tooltipText: 'Another red',
        },
        {
          id: 'blue-1',
          bboxes: [{ x1: 30, y1: 50, x2: 180, y2: 70, page: 1 }],
          style: { backgroundColor: '#0000ff' },
          tooltipText: 'Blue highlight',
        },
      ];

      const result = adaptHighlightData(input, {
        groupByStyle: true,
      });

      expect(result).toHaveProperty('#ff0000');
      expect(result).toHaveProperty('#0000ff');
      expect(result['#ff0000'].pages['1']).toHaveLength(2);
      expect(result['#0000ff'].pages['1']).toHaveLength(1);
    });

    it('should use default category when no category is provided', () => {
      const input: InputHighlightData[] = [
        {
          id: 'highlight-1',
          bboxes: [{ x1: 10, y1: 20, x2: 100, y2: 30, page: 1 }],
          style: { backgroundColor: '#ff0000' },
          tooltipText: 'Test',
        },
      ];

      const result = adaptHighlightData(input, {
        groupByStyle: false,
        defaultCategory: 'general',
      });

      expect(result).toHaveProperty('general');
    });

    it('should use custom term name resolver', () => {
      const input: InputHighlightData[] = [
        {
          id: 'highlight-1',
          bboxes: [{ x1: 10, y1: 20, x2: 100, y2: 30, page: 1 }],
          style: { backgroundColor: '#ff0000' },
          tooltipText: 'Tooltip Text',
          metadata: { displayName: 'Custom Name', category: 'test' },
        },
      ];

      const result = adaptHighlightData(input, {
        termNameResolver: (h) => (h.metadata?.displayName as string) || h.id,
        categoryResolver: (h) => h.metadata?.category as string,
      });

      expect(result.test.terms['highlight-1'].term).toBe('Custom Name');
    });
  });

  describe('extractCategoryStyles', () => {
    it('should extract styles from input data', () => {
      const input: InputHighlightData[] = [
        {
          id: 'highlight-1',
          bboxes: [{ x1: 10, y1: 20, x2: 100, y2: 30, page: 1 }],
          style: {
            backgroundColor: '#ff0000',
            borderColor: '#990000',
            opacity: 0.5,
            hoverOpacity: 0.8,
          },
          tooltipText: 'Test',
          metadata: { category: 'test' },
        },
      ];

      const styles = extractCategoryStyles(input, {
        categoryResolver: (h) => h.metadata?.category as string,
      });

      expect(styles.has('test')).toBe(true);
      const testStyle = styles.get('test');
      expect(testStyle?.backgroundColor).toBe('#ff0000');
      expect(testStyle?.borderColor).toBe('#990000');
      expect(testStyle?.opacity).toBe(0.5);
      expect(testStyle?.hoverOpacity).toBe(0.8);
    });
  });

  describe('validateInputData', () => {
    it('should validate correct input data', () => {
      const input: InputHighlightData[] = [
        {
          id: 'highlight-1',
          bboxes: [{ x1: 10, y1: 20, x2: 100, y2: 30, page: 1 }],
          style: { backgroundColor: '#ff0000' },
          tooltipText: 'Test',
        },
      ];

      const result = validateInputData(input);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing id', () => {
      const input = [
        {
          bboxes: [{ x1: 10, y1: 20, x2: 100, y2: 30, page: 1 }],
          style: { backgroundColor: '#ff0000' },
        },
      ];

      const result = validateInputData(input);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect invalid bboxes', () => {
      const input = [
        {
          id: 'highlight-1',
          bboxes: [{ x1: 10, y1: 'invalid', x2: 100, y2: 30, page: 1 }],
          style: { backgroundColor: '#ff0000' },
        },
      ];

      const result = validateInputData(input);
      expect(result.valid).toBe(false);
    });

    it('should detect non-array input', () => {
      const result = validateInputData({ invalid: 'data' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('must be an array');
    });
  });

  describe('mergeHighlightData', () => {
    it('should merge multiple HighlightData objects', () => {
      const data1: HighlightData = {
        category1: {
          pages: {
            '1': [{ termId: 'term-1', coordinates: [{ x1: 10, y1: 20, x2: 100, y2: 30 }] }],
          },
          terms: {
            'term-1': {
              term: 'Term 1',
              category: 'category1',
              frequency: 1,
              aliases: [],
              relatedTerms: [],
              pages: [1],
              explanations: [],
            },
          },
        },
      };

      const data2: HighlightData = {
        category2: {
          pages: {
            '2': [{ termId: 'term-2', coordinates: [{ x1: 50, y1: 100, x2: 200, y2: 120 }] }],
          },
          terms: {
            'term-2': {
              term: 'Term 2',
              category: 'category2',
              frequency: 1,
              aliases: [],
              relatedTerms: [],
              pages: [2],
              explanations: [],
            },
          },
        },
      };

      const merged = mergeHighlightData(data1, data2);

      expect(merged).toHaveProperty('category1');
      expect(merged).toHaveProperty('category2');
      expect(merged.category1.pages['1']).toHaveLength(1);
      expect(merged.category2.pages['2']).toHaveLength(1);
    });

    it('should merge same categories', () => {
      const data1: HighlightData = {
        test: {
          pages: {
            '1': [{ termId: 'term-1', coordinates: [{ x1: 10, y1: 20, x2: 100, y2: 30 }] }],
          },
          terms: {
            'term-1': {
              term: 'Term 1',
              category: 'test',
              frequency: 1,
              aliases: [],
              relatedTerms: [],
              pages: [1],
              explanations: [],
            },
          },
        },
      };

      const data2: HighlightData = {
        test: {
          pages: {
            '2': [{ termId: 'term-2', coordinates: [{ x1: 50, y1: 100, x2: 200, y2: 120 }] }],
          },
          terms: {
            'term-2': {
              term: 'Term 2',
              category: 'test',
              frequency: 1,
              aliases: [],
              relatedTerms: [],
              pages: [2],
              explanations: [],
            },
          },
        },
      };

      const merged = mergeHighlightData(data1, data2);

      expect(merged.test.pages).toHaveProperty('1');
      expect(merged.test.pages).toHaveProperty('2');
      expect(Object.keys(merged.test.terms)).toHaveLength(2);
    });
  });
});
