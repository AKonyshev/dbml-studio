import { tableCoordsStore } from "./tableCoords";
import { tableDetailLevelStore } from "./tableDetailLevelStore";
import { tableRelationsVisibilityStore } from "./tableRelationsVisibilityStore";

/**
 * A table's name is its identity in every store we keep, and DBML gives a table
 * nothing more stable to be keyed by. So a rename has to be carried by hand —
 * but it can be carried exactly rather than guessed at, because the rename came
 * from us and both names are known.
 *
 * Called only after the host confirms the write. A rejected rename must not
 * leave the stores describing a document that does not exist.
 */
export const renameTableState = (oldName: string, newName: string): void => {
  if (oldName === newName) {
    return;
  }

  tableCoordsStore.renameKey(oldName, newName);
  tableRelationsVisibilityStore.renameKey(oldName, newName);
  tableDetailLevelStore.renameKey(oldName, newName);
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
      pair.appliedForward = false;
      continue;
    }

    if (!pair.appliedForward && hasNew && !hasOld) {
      renameTableState(pair.from, pair.to);
      pair.appliedForward = true;
    }
  }
};
