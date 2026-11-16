import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_CANVAS_PIXELS,
  DEFAULT_MAX_PIXEL_RATIO,
  getOutputScale,
} from '../output-scale';

describe('getOutputScale', () => {
  it('follows the device pixel ratio', () => {
    expect(getOutputScale(800, 1000, {}, 1)).toBe(1);
    expect(getOutputScale(800, 1000, {}, 1.5)).toBe(1.5);
    expect(getOutputScale(800, 1000, {}, 2)).toBe(2);
  });

  it('caps the ratio at maxPixelRatio', () => {
    expect(getOutputScale(800, 1000, {}, 3)).toBe(DEFAULT_MAX_PIXEL_RATIO);
    expect(getOutputScale(800, 1000, { maxPixelRatio: 1 }, 2)).toBe(1);
    expect(getOutputScale(800, 1000, { maxPixelRatio: 3 }, 3)).toBe(3);
  });

  it('ignores a non-positive maxPixelRatio', () => {
    expect(getOutputScale(800, 1000, { maxPixelRatio: 0 }, 3)).toBe(DEFAULT_MAX_PIXEL_RATIO);
  });

  it('lowers the ratio so the canvas stays within maxCanvasPixels', () => {
    const scale = getOutputScale(4000, 5000, {}, 2);

    expect(scale).toBeLessThan(2);
    expect(4000 * scale * (5000 * scale)).toBeLessThanOrEqual(DEFAULT_MAX_CANVAS_PIXELS + 1);
  });

  it('applies no area cap when maxCanvasPixels is 0', () => {
    expect(getOutputScale(4000, 5000, { maxCanvasPixels: 0 }, 2)).toBe(2);
  });

  it('falls back to 1 for an unusable device pixel ratio', () => {
    expect(getOutputScale(800, 1000, {}, Number.NaN)).toBe(1);
    expect(getOutputScale(800, 1000, {}, 0)).toBe(1);
  });
});
