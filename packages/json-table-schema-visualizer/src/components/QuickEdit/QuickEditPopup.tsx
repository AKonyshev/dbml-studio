import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { commitOperationFor, quickEditIntent } from "./quickEditIntent";
import { useQuickEditPosition } from "./useQuickEditPosition";

import type { EditOperation, EditRejection } from "shared/types/diagramEdit";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { FONT_FAMILY } from "@/constants/font";
import { COLUMN_HEIGHT, FONT_SIZES, PADDINGS } from "@/constants/sizing";
import { useThemeColors } from "@/hooks/theme";
import { type MessageKey } from "@/i18n/messages";
import { t } from "@/i18n/t";
import { focusColumn } from "@/stores/currentTarget";
import { getDiagramEditingHost } from "@/stores/diagramEditing";
import {
  closeQuickEdit,
  getQuickEditTarget,
  subscribeQuickEdit,
} from "@/stores/quickEditStore";
import { recordRename, renameTableState } from "@/stores/renameReconcile";

const NEW_COLUMN_TEXT = "new_column varchar";
const MIN_POPUP_WIDTH = 200;

/**
 * A rejection in the reader's own language, with the parser's own words kept
 * verbatim underneath. The parser speaks English only, and paraphrasing a
 * syntax error into another language would lose the part that says where.
 */
const messageForRejection = (reason: EditRejection): string => {
  if (reason.code === "parseError") {
    return `${t("quickEdit.rejected")} ${reason.message}`;
  }

  return t(`quickEdit.${reason.code}` as MessageKey);
};

/**
 * Editing one column, or one table's name, as the text that is in the file.
 *
 * A DOM overlay rather than anything on the canvas: the diagram is drawn with
 * Konva, which has no text input of its own. A real `<textarea>` is also what
 * makes the extension's typing-focus guard fire, which is what keeps the
 * workbench's bare-letter shortcuts off the keyboard while a name is typed.
 *
 * Which key means what lives in `quickEditIntent`, where it can be tested.
 */
const QuickEditPopup = (): JSX.Element | null => {
  const target = useSyncExternalStore(
    subscribeQuickEdit,
    getQuickEditTarget,
    getQuickEditTarget,
  );
  const position = useQuickEditPosition(target);
  const [text, setText] = useState("");
  const [original, setOriginal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const themeColors = useThemeColors();
  // Read by the pointer listener below, which is registered once and must not
  // be looking at the text as it was when it was registered.
  const commitRef = useRef<() => Promise<boolean>>(async () => true);

  useEffect(() => {
    if (target === null) {
      return;
    }

    const host = getDiagramEditingHost();
    const current =
      target.field === undefined
        ? target.table
        : host?.readFieldText(target.table, target.field) ?? "";

    setText(current);
    setOriginal(current);
    setError(null);
  }, [target]);

  /**
   * Grow to whatever the text needs.
   *
   * A column's line is longer than the table is wide once its settings and note
   * are in it, so the field wraps — and a fixed height showed the first wrapped
   * line and hid the rest, which reads as the box having lost the text.
   */
  useEffect(() => {
    const input = inputRef.current;
    if (input === null) return;

    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  }, [text, position?.scale]);

  /**
   * A click anywhere else ends the edit, the way it does in a spreadsheet cell.
   *
   * It applies rather than discards: the reader has typed something and
   * clicking away is not how anyone asks for their typing to be thrown out —
   * `Escape` is. A refused edit keeps the box open with its reason, so nothing
   * is lost silently either way.
   *
   * `pointerdown` on the window rather than the field's own `blur`, because
   * blur also fires when the whole window loses focus, and switching to another
   * application is not an instruction to write to the file.
   */
  useEffect(() => {
    if (target === null) {
      return;
    }

    const onPointerDown = (event: PointerEvent): void => {
      if (boxRef.current?.contains(event.target as Node) === true) {
        return;
      }

      void commitRef.current().then((applied) => {
        if (applied) closeQuickEdit();
      });
    };

    window.addEventListener("pointerdown", onPointerDown, true);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [target]);

  if (target === null || position === null) {
    return null;
  }

  const send = async (operation: EditOperation): Promise<boolean> => {
    const host = getDiagramEditingHost();
    if (host === null) {
      return false;
    }

    const outcome = await host.submit(
      operation,
      operation.kind === "renameTable" ? undefined : original,
    );

    if (!outcome.ok) {
      setError(messageForRejection(outcome.reason));

      return false;
    }

    setError(null);

    // Only now, and never before: a rejected rename must not leave the stores
    // describing a document that does not exist.
    if (operation.kind === "renameTable") {
      renameTableState(operation.table, outcome.table);
      recordRename(operation.table, outcome.table);
    }

    if (outcome.field !== undefined) {
      // A column added below sits one row further down; anything else is the
      // row the popup is already on.
      const offsetY =
        operation.kind === "insertFieldAfter"
          ? target.offsetY + COLUMN_HEIGHT
          : target.offsetY;
      focusColumn(outcome.table, outcome.field, offsetY);
    }

    return true;
  };

  const commit = async (): Promise<boolean> => {
    if (text === original) {
      return true;
    }

    return await send(commitOperationFor(target, text));
  };

  commitRef.current = commit;

  const onKeyDown = async (
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
  ): Promise<void> => {
    const intent = quickEditIntent(event, target.field !== undefined);
    if (intent === null || intent.kind === "passThrough") {
      return;
    }

    event.preventDefault();

    if (intent.kind === "close") {
      closeQuickEdit();

      return;
    }

    if (intent.kind === "delete" && target.field !== undefined) {
      await send({
        kind: "deleteField",
        table: target.table,
        field: target.field,
      });
      closeQuickEdit();

      return;
    }

    if (intent.kind === "move" && target.field !== undefined) {
      await send({
        kind: "moveField",
        table: target.table,
        field: target.field,
        direction: intent.direction,
      });

      return;
    }

    if (!(await commit())) {
      return;
    }

    if (intent.kind === "commitAndAddBelow" && target.field !== undefined) {
      await send({
        kind: "insertFieldAfter",
        table: target.table,
        field: target.field,
        text: NEW_COLUMN_TEXT,
      });
    }

    closeQuickEdit();
  };

  // Typed and coloured like the row it covers, and scaled with the diagram, so
  // it reads as that row opened for editing rather than a dialog on top of it.
  const fontSize = FONT_SIZES.md * position.scale;

  return (
    <div
      ref={boxRef}
      className="absolute z-50 overflow-hidden rounded shadow-lg"
      style={{
        left: position.x,
        top: position.y,
        width: Math.max(position.width, MIN_POPUP_WIDTH),
        backgroundColor: themeColors.table.bg,
        outline: `${Math.max(1, position.scale)}px solid ${themeColors.selection.stroke}`,
      }}
    >
      <textarea
        ref={inputRef}
        autoFocus
        aria-label={target.field ?? target.table}
        rows={1}
        className="block w-full resize-none overflow-hidden bg-transparent outline-none"
        style={{
          color: themeColors.text[900],
          fontFamily: FONT_FAMILY,
          fontSize,
          lineHeight: `${COLUMN_HEIGHT * position.scale}px`,
          padding: `0 ${PADDINGS.sm * position.scale}px`,
        }}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
        }}
        onKeyDown={(event) => {
          void onKeyDown(event);
        }}
      />
      {error !== null && (
        // On the note bubble's own surface, which is the one pair of colours
        // this palette guarantees reads in both themes; the table surface
        // behind it is chosen against the canvas, not against a warning.
        <p
          className="whitespace-pre-wrap"
          style={{
            backgroundColor: themeColors.note.bg,
            color: themeColors.note.danger,
            fontFamily: FONT_FAMILY,
            fontSize: FONT_SIZES.badge * position.scale,
            padding: `0 ${PADDINGS.sm * position.scale}px ${PADDINGS.xs * position.scale}px`,
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
};

export default QuickEditPopup;
