/** Full circle in degrees (PDF.js / CSS rotation convention). */
export const PDF_ROTATION_FULL_CIRCLE_DEGREES = 360 as const;

/**
 * Normalize any signed rotation to [0, 360).
 */
export function normalizePdfRotationDegrees(degrees: number): number {
  const full = PDF_ROTATION_FULL_CIRCLE_DEGREES;
  return ((degrees % full) + full) % full;
}

/**
 * Combine PDF page intrinsic `/Rotate` (clockwise, degrees) with extra user clockwise delta.
 */
export function sumPdfIntrinsicAndUserRotation(
  intrinsicRotateDegrees: number,
  userClockwiseDegrees: number
): number {
  return normalizePdfRotationDegrees(intrinsicRotateDegrees + userClockwiseDegrees);
}
