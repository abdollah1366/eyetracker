/**
 * Fullscreen helpers for the calibration and stimulus-presentation overlays.
 *
 * Calibration targets are stored in *screen pixels*, so calibration and data
 * collection must run in the same full-screen viewport. `requestFullscreen`
 * has to be invoked synchronously from a user gesture (the wizard buttons),
 * therefore these helpers never throw and callers can safely await them.
 */

type FullscreenCapableElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenCapableDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
};

/** Enter true fullscreen on the whole document. Returns false if unsupported/denied. */
export async function enterFullscreen(): Promise<boolean> {
  try {
    const doc = document as FullscreenCapableDocument;
    if (doc.fullscreenElement) return true;

    const el = doc.documentElement as FullscreenCapableElement;
    const request = el.requestFullscreen ?? el.webkitRequestFullscreen;
    if (!request) return false;

    await request.call(el);
    return true;
  } catch {
    // Fullscreen can be blocked by permissions/policy; overlays still use the
    // whole browser viewport via fixed positioning, so the app stays usable.
    return false;
  }
}

/** Leave fullscreen if this document owns it. Safe to call repeatedly. */
export async function exitFullscreen(): Promise<void> {
  try {
    const doc = document as FullscreenCapableDocument;
    if (!doc.fullscreenElement) return;
    const exit = doc.exitFullscreen ?? doc.webkitExitFullscreen;
    if (!exit) return;
    await exit.call(doc);
  } catch {
    // The browser may have already exited fullscreen (e.g. Esc key).
  }
}

/**
 * Subscribe to viewport changes caused by fullscreen transitions or resizing.
 * Used to recompute calibration targets in actual screen pixels.
 */
export function onViewportChange(callback: () => void): () => void {
  window.addEventListener('resize', callback);
  document.addEventListener('fullscreenchange', callback);
  document.addEventListener('webkitfullscreenchange', callback);
  return () => {
    window.removeEventListener('resize', callback);
    document.removeEventListener('fullscreenchange', callback);
    document.removeEventListener('webkitfullscreenchange', callback);
  };
}
