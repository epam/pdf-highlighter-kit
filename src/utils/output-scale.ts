/**
 * Default cap for the backing-store pixel ratio. Above 2× the extra pixels
 * are hard to see while memory and render time keep growing with its square.
 */
export const DEFAULT_MAX_PIXEL_RATIO = 2;

/**
 * Default cap for one page canvas, in pixels (width × height). 2^24 is the
 * largest canvas area iOS Safari renders; bigger canvases come out blank.
 */
export const DEFAULT_MAX_CANVAS_PIXELS = 16_777_216;

export interface OutputScaleOptions {
  /** Upper bound for the pixel ratio; `1` restores the old CSS-pixel rendering. */
  maxPixelRatio?: number;
  /** Upper bound for the canvas area in pixels; `0` disables the cap. */
  maxCanvasPixels?: number;
}

const readDevicePixelRatio = (): number =>
  typeof window !== 'undefined' ? window.devicePixelRatio : 1;

/**
 * Backing-store scale for a page canvas of `cssWidth` × `cssHeight` CSS pixels.
 *
 * A canvas sized in CSS pixels is upscaled by the browser on any display whose
 * `devicePixelRatio` is above 1 (HiDPI screens, Windows scaling at 125 % or
 * 150 %), which blurs the text. Rendering at the device ratio keeps it sharp;
 * the ratio is capped by `maxPixelRatio` and reduced further when the canvas
 * would exceed `maxCanvasPixels`, so a page at high zoom still renders instead
 * of failing on the browser's canvas size limit.
 */
export function getOutputScale(
  cssWidth: number,
  cssHeight: number,
  options: OutputScaleOptions = {},
  devicePixelRatio: number = readDevicePixelRatio()
): number {
  const maxPixelRatio =
    options.maxPixelRatio != null && options.maxPixelRatio > 0
      ? options.maxPixelRatio
      : DEFAULT_MAX_PIXEL_RATIO;
  const maxCanvasPixels = options.maxCanvasPixels ?? DEFAULT_MAX_CANVAS_PIXELS;

  const deviceRatio =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  let scale = Math.min(deviceRatio, maxPixelRatio);

  const area = cssWidth * cssHeight;
  if (maxCanvasPixels > 0 && area > 0) {
    const areaLimitedScale = Math.sqrt(maxCanvasPixels / area);
    scale = Math.min(scale, areaLimitedScale);
  }

  return scale;
}
