export type VersionedSnapshot = { snapshot: unknown; correctedSnapshot?: unknown | null; correctionVersion?: number };

/** Customer-facing consumers always use the corrected snapshot when a one-time correction exists. */
export function effectiveSnapshot(document: VersionedSnapshot) {
  return document.correctionVersion === 1 && document.correctedSnapshot ? document.correctedSnapshot : document.snapshot;
}
