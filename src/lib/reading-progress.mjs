const clamp01 = (value) => Math.min(Math.max(value, 0), 1);

// A 2% opening is about 2 CSS pixels on the current 36px SVG ring.
// Keep that opening until the reading endpoint is actually reached so a
// subpixel remainder cannot be anti-aliased into an apparently closed ring.
export const INCOMPLETE_RING_FILL_CAP = 0.98;

export function calculateVisibleRingProgress(progress) {
  if (!Number.isFinite(progress)) return 0;

  const safeProgress = clamp01(progress);
  return safeProgress >= 1
    ? 1
    : Math.min(safeProgress, INCOMPLETE_RING_FILL_CAP);
}

/**
 * Calculate article reading progress in document coordinates.
 *
 * `viewportTop` and `viewportHeight` should describe the visual viewport when
 * available. Mobile browser chrome and on-screen keyboards can resize that
 * viewport without changing the layout viewport represented by innerHeight.
 * `maximumViewportTop` is the last document position the visual viewport can
 * reach. It prevents the ring from completing merely because the final screen
 * of article content has just become visible.
 */
export function calculateReadingProgress({
  contentTop,
  contentBottom,
  viewportTop,
  viewportHeight,
  topOffset = 0,
  maximumViewportTop,
}) {
  const values = [contentTop, contentBottom, viewportTop, viewportHeight, topOffset];
  if (!values.every(Number.isFinite) || viewportHeight <= 0 || contentBottom < contentTop) {
    return 0;
  }

  const safeTopOffset = Math.max(topOffset, 0);
  const readingStart = contentTop - safeTopOffset;
  const idealReadingEnd = contentBottom - safeTopOffset;
  const readingEnd = Number.isFinite(maximumViewportTop)
    ? Math.min(idealReadingEnd, Math.max(maximumViewportTop, readingStart))
    : idealReadingEnd;
  const readingDistance = readingEnd - readingStart;

  if (readingDistance <= 0) {
    return viewportTop + viewportHeight >= contentBottom ? 1 : 0;
  }

  return clamp01((viewportTop - readingStart) / readingDistance);
}
