/**
 * Sanitizes an HTML/SVG string for safe use as beforeIcon content to prevent XSS.
 * Uses DOMParser + allowlist of SVG elements and attributes; strips script,
 * event handlers, foreignObject, and dangerous hrefs.
 */

const ALLOWED_TAGS = new Set([
  'svg',
  'path',
  'circle',
  'rect',
  'line',
  'polyline',
  'polygon',
  'g',
  'defs',
  'use',
  'symbol',
  'title',
  'clipPath',
  'linearGradient',
  'stop',
  'radialGradient',
]);

const ALLOWED_ATTRS = new Set([
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-miterlimit',
  'fill-rule',
  'clip-rule',
  'viewBox',
  'xmlns',
  'xmlns:xlink',
  'class',
  'transform',
  'd',
  'cx',
  'cy',
  'r',
  'x',
  'y',
  'width',
  'height',
  'rx',
  'ry',
  'x1',
  'y1',
  'x2',
  'y2',
  'points',
  'opacity',
  'fill-opacity',
  'style',
  'id',
  'xlink:href',
  'href',
  'offset',
  'stop-color',
  'stop-opacity',
]);

const UNSAFE_HREF = /^\s*(javascript|data|vbscript|file):/i;

const escapeText = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function isAllowedAttr(name: string, value: string): boolean {
  const lower = name.toLowerCase();
  if (lower.startsWith('on')) return false;
  if (!ALLOWED_ATTRS.has(lower) && !ALLOWED_ATTRS.has(name)) return false;
  if (lower === 'href' || lower === 'xlink:href')
    return value.trim().startsWith('#') || !UNSAFE_HREF.test(value.trim());
  return true;
}

function serializeNode(node: Node, out: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    out.push(escapeText(node.textContent || ''));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (!ALLOWED_TAGS.has(tag)) return;

  const attrs = [...el.attributes]
    .filter((a) => isAllowedAttr(a.name, a.value))
    .map((a) => `${a.name}="${escapeAttr(a.value)}"`);
  out.push(`<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>`);
  for (const child of el.childNodes) serializeNode(child, out);
  out.push(`</${tag}>`);
}

function toSanitizedString(node: Node): string {
  const out: string[] = [];
  serializeNode(node, out);
  return out.join('');
}

function toSanitizedStringFromChildren(parent: Element): string {
  const out: string[] = [];
  for (const child of parent.childNodes) serializeNode(child, out);
  return out.join('');
}

function findSvgAndSanitize(doc: Document): string {
  const svg =
    doc.querySelector('svg') ??
    (doc.documentElement?.tagName.toLowerCase() === 'svg' ? doc.documentElement : null);
  return svg ? toSanitizedString(svg) : '';
}

/**
 * Sanitizes an HTML/SVG string for safe injection as icon content (e.g. beforeIcon).
 * Returns a string safe to assign to innerHTML, or empty string if parsing fails or
 * no allowed content is present.
 */
export function sanitizeIconHtml(html: string): string {
  if (typeof html !== 'string' || !html.trim()) return '';

  try {
    const doc = new DOMParser().parseFromString(html, 'image/svg+xml');
    const root = doc.documentElement;
    if (root?.tagName.toLowerCase() === 'svg') return toSanitizedString(root);
    const wrapped = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg">${html}</svg>`,
      'image/svg+xml'
    ).documentElement;
    return wrapped ? toSanitizedStringFromChildren(wrapped) : '';
  } catch {
    try {
      return findSvgAndSanitize(new DOMParser().parseFromString(html, 'text/html'));
    } catch {
      return '';
    }
  }
}
