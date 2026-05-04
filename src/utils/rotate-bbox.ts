import type { BoundingBox, PageRotationDegrees } from '../types';
import { RotationDirection } from '../types';
import { normalizePdfRotationDegrees, PDF_ROTATION_FULL_CIRCLE_DEGREES } from './pdf-rotation-math';

/**
 * PDF.js applies viewport rotation clockwise. User display delta is clockwise;
 * this helper converts to CCW for `rotateBoundingBoxForCcwRotation`.
 */
export function clockwiseToCcw(clockwise: PageRotationDegrees): PageRotationDegrees {
  return normalizePdfRotationDegrees(
    PDF_ROTATION_FULL_CIRCLE_DEGREES - clockwise
  ) as PageRotationDegrees;
}

/**
 * Combine quadrant degrees (0|90|180|270) with direction → extra clockwise delta (0|90|180|270).
 * For `degrees === 0`, returns 0 and ignores `direction`.
 */
export function displayRotationToClockwise(
  degrees: PageRotationDegrees,
  direction: RotationDirection
): PageRotationDegrees {
  if (degrees === 0) {
    return 0;
  }
  if (direction === RotationDirection.Clockwise) {
    return degrees;
  }
  return normalizePdfRotationDegrees(
    PDF_ROTATION_FULL_CIRCLE_DEGREES - degrees
  ) as PageRotationDegrees;
}

/** Rotate a point (intrinsic top-left, y-down) by CCW rotation around the intrinsic top-left corner. */
export function rotatePointCcw(
  x: number,
  y: number,
  origWidth: number,
  origHeight: number,
  rotationCcw: PageRotationDegrees
): [number, number] {
  const d = normalizePdfRotationDegrees(rotationCcw);
  if (d === 0) {
    return [x, y];
  }
  if (d === 90) {
    return [y, origWidth - x];
  }
  if (d === 180) {
    return [origWidth - x, origHeight - y];
  }
  if (d === 270) {
    return [origHeight - y, x];
  }
  throw new Error(`Unsupported rotation: ${rotationCcw}`);
}

/**
 * Rotate an axis-aligned bbox (top-left origin, y-down) around the top-left corner
 * of an origWidth × origHeight intrinsic page into display space.
 */
export function rotateBoundingBoxForCcwRotation(
  bbox: BoundingBox,
  origWidth: number,
  origHeight: number,
  rotationCcw: PageRotationDegrees
): BoundingBox {
  if (rotationCcw === 0) {
    return { ...bbox };
  }

  let x1 = bbox.x1;
  let x2 = bbox.x2;
  let y1 = bbox.y1;
  let y2 = bbox.y2;

  if (x2 < x1) {
    [x1, x2] = [x2, x1];
  }
  if (y2 < y1) {
    [y1, y2] = [y2, y1];
  }

  if (x1 === x2 && y1 === y2) {
    const [px, py] = rotatePointCcw(x1, y1, origWidth, origHeight, rotationCcw);
    return { x1: px, y1: py, x2: px, y2: py };
  }

  if (x1 === x2 || y1 === y2) {
    const [ax, ay] = rotatePointCcw(x1, y1, origWidth, origHeight, rotationCcw);
    const [bx, by] = rotatePointCcw(x2, y2, origWidth, origHeight, rotationCcw);
    return {
      x1: Math.min(ax, bx),
      y1: Math.min(ay, by),
      x2: Math.max(ax, bx),
      y2: Math.max(ay, by),
    };
  }

  const corners: [number, number][] = [
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2],
  ];

  const d = normalizePdfRotationDegrees(rotationCcw);
  let transformed: [number, number][];
  if (d === 90) {
    transformed = corners.map(([x, y]) => [y, origWidth - x]);
  } else if (d === 180) {
    transformed = corners.map(([x, y]) => [origWidth - x, origHeight - y]);
  } else if (d === 270) {
    transformed = corners.map(([x, y]) => [origHeight - y, x]);
  } else {
    throw new Error(`Unsupported rotation: ${rotationCcw}`);
  }

  const xs = transformed.map((p) => p[0]);
  const ys = transformed.map((p) => p[1]);
  return {
    x1: Math.min(...xs),
    y1: Math.min(...ys),
    x2: Math.max(...xs),
    y2: Math.max(...ys),
  };
}
