/**
 * Phase 4 canvas drag state.
 *
 * The HTML5 drag-and-drop API only natively shuttles strings, so a
 * module-scoped ref carries the structured payload between source and
 * target. Same pattern as `chainAssemblyStorage.dragState` for the
 * profile-tree mode, but kept separate so canvas drag types don't
 * pollute the existing union.
 *
 * Only two payload kinds in Phase 4:
 * - `library-custom-node`: dragging a custom node row from the
 *   canvas-mode library tree onto a canvas drop zone. Triggers
 *   auto-pin + addCustomUsage (C26).
 * - `canvas-custom`: dragging an existing canvas custom card to
 *   another edge (re-anchor) or adjacent edge in the same interval
 *   (reorder). Triggers moveCustomUsage.
 */
export type CanvasDragPayload =
  | {
      kind: "library-custom-node";
      resourceInstanceId: string;
      nodeId: string;
      /**
       * The branch this node comes from. Drop handler may auto-pin
       * this branch (Resolved Edge Case "auto-pin on first drag")
       * before adding the usage.
       */
      branchId: string;
    }
  | {
      kind: "canvas-custom";
      /** Index into profile.custom_node_usages — passed to mutations. */
      arrayIndex: number;
    };

/** Single in-flight drag at a time fits the canvas use case. */
export const canvasDragState: { value: CanvasDragPayload | null } = {
  value: null
};

/**
 * Drop-zone position descriptor — what the renderer hands to a
 * drop handler when it lands. The handler resolves this into an
 * anchor + (optionally) a beforeCustomArrayIndex.
 */
export interface CanvasDropPosition {
  /**
   * The chain node id at or after the drop point — used as the
   * `insert_before` anchor for both new and moved customs. `null`
   * means "no slot follows" (tail).
   */
  anchorChainId: string | null;
  /**
   * For drops between adjacent customs in the same interval, the
   * arrayIndex of the custom immediately after the drop point.
   * `undefined` means "drop at end of bucket" — used both for new
   * additions and for moves that don't need precise within-bucket
   * positioning.
   */
  beforeCustomArrayIndex?: number;
}
