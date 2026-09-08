import { tableCoordsStore } from "./tableCoords";
import { tableDetailLevelStore } from "./tableDetailLevelStore";
import { tableRelationsVisibilityStore } from "./tableRelationsVisibilityStore";

/**
 * A table's name is its identity in every store we keep, and DBML gives a table
 * nothing more stable to be keyed by. So a rename has to be carried by hand —
 * but it can be carried exactly rather than guessed at, because the rename came
 * from us and both names are known.
 *
 * Each store announces the move to the tables that draw from it, so a table
 * already drawn under the new name reads its position again. Nothing on the
 * canvas moves, and the view is not re-framed.
 */
export const renameTableState = (oldName: string, newName: string): void => {
  if (oldName === newName) {
    return;
  }

  tableCoordsStore.renameKey(oldName, newName);
  tableRelationsVisibilityStore.renameKey(oldName, newName);
  tableDetailLevelStore.renameKey(oldName, newName);
};

/**
 * Whether the diagram already files state under this name.
 *
 * Asked before a rename is carried ahead of the write: carrying it onto a name
 * another table holds would overwrite that table's state, and the host's own
 * collision check has not run yet at that point.
 */
export const isTableKnown = (name: string): boolean =>
  tableCoordsStore.hasCoords(name);

/**
 * Forget every trace of a name the document no longer has.
 *
 * The other half of `renameTableState`, which copies rather than moves so that
 * the table still drawn under the old name keeps its position, its level and
 * its hidden relations while the write is in flight. This is what finally lets
 * the old name go, and it is called only once a schema has arrived proving the
 * table is no longer called that.
 */
export const retireTableState = (name: string): void => {
  tableCoordsStore.retireKey(name);
  tableRelationsVisibilityStore.retireKey(name);
  tableDetailLevelStore.retireKey(name);
};

interface RenamePair {
  from: string;
  to: string;
  /** Which way round the stores are keyed right now. */
  appliedForward: boolean;
}

/**
 * Undo restores the text and nothing else.
 *
 * A rename is two halves — characters in the file, and keys in these stores —
 * and only the first is on the workbench's undo stack. So the pairs we created
 * are kept for as long as the diagram is open, and a document that goes back to
 * the old name takes the stores back with it. The same rule covers redo, which
 * is why a pair records which way it currently points instead of being thrown
 * away after one use.
 *
 * In memory only, and only for renames made here. A rename typed by hand in the
 * text editor is not something we try to follow: telling one apart from a
 * delete plus an insert would be a guess, and a wrong guess moves a reader's
 * layout onto the wrong table.
 */
const renames: RenamePair[] = [];

export const recordRename = (from: string, to: string): void => {
  renames.push({ from, to, appliedForward: true });
};

export const forgetRenames = (): void => {
  renames.length = 0;
};

/** Called with the table names of each new schema the host sends. */
export const reconcileAfterSchemaChange = (
  tableNames: readonly string[],
): void => {
  if (renames.length === 0) {
    return;
  }

  const present = new Set(tableNames);

  for (const pair of renames) {
    const hasOld = present.has(pair.from);
    const hasNew = present.has(pair.to);

    if (pair.appliedForward && hasOld && !hasNew) {
      renameTableState(pair.to, pair.from);
      retireTableState(pair.to);
      pair.appliedForward = false;
      continue;
    }

    if (!pair.appliedForward && hasNew && !hasOld) {
      renameTableState(pair.from, pair.to);
      retireTableState(pair.from);
      pair.appliedForward = true;
      continue;
    }

    // Already pointing the way the document does. The name on the other side
    // is what the carry left behind, and this schema says nothing is called
    // that any more — but only when the side that *is* live is here to prove
    // it. Halfway through a chain of renames both names are absent, and
    // dropping one there would leave a second undo with nothing to carry back.
    if (pair.appliedForward && hasNew && !hasOld) {
      retireTableState(pair.from);
    } else if (!pair.appliedForward && hasOld && !hasNew) {
      retireTableState(pair.to);
    }
  }
};
