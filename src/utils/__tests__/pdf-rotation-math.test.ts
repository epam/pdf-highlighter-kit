import { describe, expect, test } from 'vitest';
import { normalizePdfRotationDegrees, sumPdfIntrinsicAndUserRotation } from '../pdf-rotation-math';

describe('normalizePdfRotationDegrees', () => {
  test('wraps to [0, 360)', () => {
    expect(normalizePdfRotationDegrees(450)).toBe(90);
    expect(normalizePdfRotationDegrees(-90)).toBe(270);
    expect(normalizePdfRotationDegrees(0)).toBe(0);
  });
});

describe('sumPdfIntrinsicAndUserRotation', () => {
  test('combines and normalizes', () => {
    expect(sumPdfIntrinsicAndUserRotation(90, 90)).toBe(180);
    expect(sumPdfIntrinsicAndUserRotation(270, 180)).toBe(90);
  });
});
