import { describe, expect, test } from 'vitest';
import { RotationDirection } from '../../types';
import {
  clockwiseToCcw,
  displayRotationToClockwise,
  rotateBoundingBoxForCcwRotation,
} from '../rotate-bbox';

describe('displayRotationToClockwise', () => {
  test('cw preserves degrees', () => {
    expect(displayRotationToClockwise(90, RotationDirection.Clockwise)).toBe(90);
    expect(displayRotationToClockwise(180, RotationDirection.Clockwise)).toBe(180);
    expect(displayRotationToClockwise(270, RotationDirection.Clockwise)).toBe(270);
  });

  test('ccw maps to complementary clockwise', () => {
    expect(displayRotationToClockwise(90, RotationDirection.CounterClockwise)).toBe(270);
    expect(displayRotationToClockwise(270, RotationDirection.CounterClockwise)).toBe(90);
    expect(displayRotationToClockwise(180, RotationDirection.CounterClockwise)).toBe(180);
  });

  test('0 ignores direction', () => {
    expect(displayRotationToClockwise(0, RotationDirection.Clockwise)).toBe(0);
    expect(displayRotationToClockwise(0, RotationDirection.CounterClockwise)).toBe(0);
  });
});

describe('clockwiseToCcw', () => {
  test('maps clockwise delta to CCW', () => {
    expect(clockwiseToCcw(90)).toBe(270);
    expect(clockwiseToCcw(270)).toBe(90);
    expect(clockwiseToCcw(180)).toBe(180);
    expect(clockwiseToCcw(0)).toBe(0);
  });
});

describe('rotateBoundingBoxForCcwRotation', () => {
  test('returns copy for 0°', () => {
    const b = { x1: 1, y1: 2, x2: 5, y2: 8 };
    const out = rotateBoundingBoxForCcwRotation(b, 100, 200, 0);
    expect(out).toEqual(b);
    expect(out).not.toBe(b);
  });

  test('rotates zero-width segment to horizontal', () => {
    const b = { x1: 10, y1: 10, x2: 10, y2: 20 };
    const out = rotateBoundingBoxForCcwRotation(b, 100, 200, 90);
    expect(out.y1).toBeCloseTo(out.y2);
    expect(out.x1).toBeCloseTo(10);
    expect(out.x2).toBeCloseTo(20);
    expect(out.y1).toBeCloseTo(90);
  });

  test('90° CCW on non-square page swaps extent', () => {
    const origW = 200;
    const origH = 100;
    const b = { x1: 0, y1: 0, x2: 50, y2: 40 };
    const out = rotateBoundingBoxForCcwRotation(b, origW, origH, 90);
    expect(out.x1).toBe(0);
    expect(out.y1).toBeCloseTo(150);
    expect(out.x2).toBe(40);
    expect(out.y2).toBeCloseTo(200);
  });

  test('90° CW equals 270° CCW', () => {
    const origW = 120;
    const origH = 80;
    const b = { x1: 10, y1: 20, x2: 60, y2: 50 };
    const cw90 = rotateBoundingBoxForCcwRotation(b, origW, origH, clockwiseToCcw(90));
    const ccw270 = rotateBoundingBoxForCcwRotation(b, origW, origH, 270);
    expect(cw90).toEqual(ccw270);
  });

  test('180° flips around both axes', () => {
    const w = 100;
    const h = 80;
    const b = { x1: 10, y1: 20, x2: 40, y2: 50 };
    const out = rotateBoundingBoxForCcwRotation(b, w, h, 180);
    expect(out).toEqual({ x1: 60, y1: 30, x2: 90, y2: 60 });
  });
});
