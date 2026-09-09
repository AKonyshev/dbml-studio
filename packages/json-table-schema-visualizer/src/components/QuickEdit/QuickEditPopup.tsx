import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { commitOperationFor, quickEditIntent } from "./quickEditIntent";
import { MIN_POPUP_WIDTH, useQuickEditPosition } from "./useQuickEditPosition";

import type {
  EditOperation,
  EditOutcome,
  EditRejection,
} from "shared/types/diagramEdit";
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
  openQuickEdit,
  subscribeQuickEdit,
  type QuickEditTarget,
} from "@/stores/quickEditStore";
import {
  isTableKnown,
  recordRename,
  renameTableState,
  retireTableState,
} from "@/stores/renameReconcile";
import {
  getSchemaVersion,
  isDrawnAtFullDetail,
  nextDrawnField,
  subscribeSchema,
} from "@/stores/schemaIndexStore";

const NEW_COLUMN_TEXT = "new_column varchar";

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

const currentTextOf = (target: QuickEditTarget): string => {
  if (target.field === undefined) {
    return target.table;
  }

  return (
    getDiagramEditingHost()?.readFieldText(target.table, target.field) ?? ""
  );
};

/**
 * Editing one column, or one table's name, as the text that is in the file.
 *
 * A DOM overlay rather than anything on the canvas: the diagram is drawn with
 * Konva, which has no text input of its own. A real `<textarea>` is also what
 * makes the extension's typing-focus guard fire, which is what keeps the
 * workbench's bare-letter shortcuts off the keyboard while a name is typed.
 *
 * Which key means what lives in `quickEditIntent`; what the key aims at lives
 * in `quickEditTarget`. Both are tested without this component.
 */
const QuickEditPopup = (): JSX.Element | null => {
  const target = useSyncExternalStore(
    subscribeQuickEdit,
    getQuickEditTarget,
    getQuickEditTarget,
  );
  const schemaVersion = useSyncExternalStore(
    subscribeSchema,
    getSchemaVersion,
    getSchemaVersion,
  );
  const position = useQuickEditPosition(target);
  const themeColors = useThemeColors();
  const [text, setText] = useState("");
  const [original, setOriginal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const commitRef = useRef<() => Promise<EditOutcome | null>>(async () => null);
  const sending = useRef(false);
  const loadedFor = useRef<string | null>(null);

  /**
   * Load the text when the box opens, and again when a schema arrives — but
   * only while the reader has not typed, and only for as long as the box is
   * on the same thing. A box opened on a column that was just added has
   * nothing to show until the document after that edit has come back; a box
   * the reader is already typing into is theirs.
   *
   * The box outlives what it was open on: it is one component, kept mounted,
   * and closing it leaves the typed text in place. So the reader who renamed
   * a table and then opened one of its columns met the name they had just
   * typed sitting in the column's box, with `Enter` refusing it — the typed
   * text was not `original` any more, and the guard read that as typing to
   * protect. Whose text it is is decided by what the box is open on.
   */
  useEffect(() => {
    if (target === null) {
      return;
    }

    const opensOn = `${target.table}\u0000${target.field ?? ""}`;
    const stillTheSame = loadedFor.current === opensOn;
    loadedFor.current = opensOn;

    const current = currentTextOf(target);
    setText((typed) => (stillTheSame && typed !== original ? typed : current));
    setOriginal(current);
    setError(null);
    // `original` is the previous load and is compared against on purpose; it
    // must not re-run this when it changes.
  }, [target, schemaVersion]);

  /**
   * Grow to whatever the text needs.
   *
   * A column's line is longer than the table is wide once its settings and note
   * are in it, so the field wraps — and a fixed height showed the first wrapped
   * line and hid the rest, which read as the box having lost the text.
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

      void commitRef.current().then((outcome) => {
        if (outcome?.ok === true) closeQuickEdit();
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

  /**
   * Ask the host for one change, and keep the diagram's own state in step.
   *
   * A rename carries the table's saved position, detail level and hidden
   * relations to the new name. It is carried *ahead* of the write whenever that
   * is safe, because the write sends a new schema and the diagram draws the
   * table under its new name — and a table reads its position when it is
   * drawn. Not safe when the diagram already files something under the new
   * name: the host's collision check has not run yet, and carrying over it
   * would overwrite another table's state. Then the move waits for the reply,
   * and the store's re-key event has the drawn table read its position again.
   */
  const sendToHost = async (
    operation: EditOperation,
    expectedText?: string,
  ): Promise<EditOutcome | null> => {
    const host = getDiagramEditingHost();
    if (host === null) {
      return null;
    }

    let carried: string | null = null;
    if (operation.kind === "renameTable") {
      // The host is asked what the name will be rather than the typed text
      // being taken for it. They differ whenever a schema is in play: the
      // reader edits `acl.analysis` down to `analysis111` and the table comes
      // back as `acl.analysis111`. Carrying the position to the typed text
      // filed it under a name no table ever had, so the table arrived with no
      // coordinates and was drawn at the origin until the reply re-keyed it —
      // half a second of the table sitting in the top-left corner.
      const guess =
        getDiagramEditingHost()?.resolveRenamedTable?.(
          operation.table,
          operation.newName,
        ) ?? operation.newName.trim();
      if (guess !== operation.table && !isTableKnown(guess)) {
        renameTableState(operation.table, guess);
        carried = guess;
      }
    }

    const outcome = await host.submit(operation, expectedText);

    if (!outcome.ok) {
      if (carried !== null) {
        // Back, and then gone: the carry copies rather than moves, so putting
        // the state back under the old name leaves the guessed one behind, and
        // a name the diagram still files something under is a name the next
        // carry refuses to use.
        renameTableState(carried, operation.table);
        retireTableState(carried);
      }
      if (outcome.reason.code === "staleText") {
        // Offered by doing it: the box now holds the line as it stands, and
        // the message says why the typed one was not taken.
        const current = currentTextOf(target);
        setText(current);
        setOriginal(current);
      }
      setError(messageForRejection(outcome.reason));

      return outcome;
    }

    setError(null);

    if (operation.kind === "renameTable") {
      // The host decides the real name; a guess may differ on a schema prefix.
      renameTableState(carried ?? operation.table, outcome.table);
      recordRename(operation.table, outcome.table);
    }

    return outcome;
  };

  /**
   * One change at a time.
   *
   * Every key that writes goes through here, and the host takes a moment to
   * answer. A second `Enter` on the way back sent the same line again — which
   * comes back refused as stale, reading as a failure the reader did nothing
   * to cause — and a second `Ctrl+Enter` added two columns instead of one.
   */
  const send = async (
    operation: EditOperation,
    expectedText?: string,
  ): Promise<EditOutcome | null> => {
    if (sending.current) {
      return null;
    }

    sending.current = true;
    try {
      return await sendToHost(operation, expectedText);
    } finally {
      sending.current = false;
    }
  };

  const commit = async (): Promise<EditOutcome | null> => {
    if (text === original) {
      return { ok: true, table: target.table, field: target.field };
    }

    return await send(
      commitOperationFor(target, text),
      target.field === undefined ? undefined : original,
    );
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
      const outcome = await send({
        kind: "deleteField",
        table: target.table,
        field: target.field,
      });
      if (outcome?.ok === true) closeQuickEdit();

      return;
    }

    if (intent.kind === "move" && target.field !== undefined) {
      const outcome = await send({
        kind: "moveField",
        table: target.table,
        field: target.field,
        direction: intent.direction,
      });
      if (outcome?.ok !== true) return;

      // The box follows the row it is editing.
      const offsetY =
        target.offsetY +
        (intent.direction === "up" ? -COLUMN_HEIGHT : COLUMN_HEIGHT);
      focusColumn(target.table, target.field, offsetY);
      openQuickEdit({ table: target.table, field: target.field, offsetY });

      return;
    }

    const committed = await commit();
    if (committed?.ok !== true) {
      return;
    }

    // The column may have been renamed in the same keystroke: everything after
    // this aims at the name the host reports, not the one the box opened on.
    const field = committed.field ?? target.field;

    if (intent.kind === "commitAndAddBelow" && field !== undefined) {
      const added = await send({
        kind: "insertFieldAfter",
        table: target.table,
        field,
        text: NEW_COLUMN_TEXT,
      });
      if (added?.ok !== true || added.field === undefined) return;

      // Rows are drawn only at full detail, so that is the only level at
      // which a box can sit on the new one.
      if (!isDrawnAtFullDetail(target.table)) {
        closeQuickEdit();

        return;
      }

      const offsetY = target.offsetY + COLUMN_HEIGHT;
      focusColumn(target.table, added.field, offsetY);
      openQuickEdit({ table: target.table, field: added.field, offsetY });

      return;
    }

    if (intent.kind === "commitAndNext" && target.field !== undefined) {
      // Looked up by the name the box opened on: the order of rows has not
      // changed, whatever this one is now called.
      const next = nextDrawnField(target.table, target.field);
      if (next === null) {
        closeQuickEdit();

        return;
      }

      focusColumn(target.table, next.field, next.offsetY);
      openQuickEdit({
        table: target.table,
        field: next.field,
        offsetY: next.offsetY,
      });

      return;
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
