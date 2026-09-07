import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor/editor/editor.api";

import {
  DBML_DARK_THEME_ID,
  DBML_LANGUAGE_ID,
  DBML_LIGHT_THEME_ID,
} from "../editor/dbmlLanguage";

export interface EditorPaneProps {
  value: string;
  onChange: (next: string) => void;
  /** For the one state that has no document behind it: an empty tree, where
   * anything typed would have nowhere to go. */
  readOnly?: boolean;
  /** The page's theme. Monaco is not styled by the stylesheet, so it has to be
   * told. */
  dark: boolean;
}

// Monaco is mounted directly rather than through `@monaco-editor/react`.
//
// That wrapper is a loader: given nothing it fetches the editor from a public
// CDN at run time, and even when handed a bundled copy it leaves the CDN URL in
// the build as a default it no longer uses. A string nobody can distinguish from
// a live one is worse than no wrapper — the whole point of this ticket is that
// the built artefact contains no CDN host at all.
//
// Still two properties to the page above it: current text, and a callback.
const themeIdFor = (dark: boolean): string =>
  dark ? DBML_DARK_THEME_ID : DBML_LIGHT_THEME_ID;

const EditorPane = ({
  value,
  onChange,
  readOnly = false,
  dark,
}: EditorPaneProps): JSX.Element => {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  // Read through a ref so a new callback identity on every render does not tear
  // the editor down and rebuild it.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }

    const editor = monaco.editor.create(host, {
      value,
      language: DBML_LANGUAGE_ID,
      theme: themeIdFor(dark),
      minimap: { enabled: false },
      fontSize: 13,
      scrollBeyondLastLine: false,
      // The pane is resized by the split divider, which fires no window resize.
      automaticLayout: true,
      renderWhitespace: "none",
      tabSize: 2,
      readOnly,
    });

    editorRef.current = editor;

    const subscription = editor.onDidChangeModelContent(() => {
      onChangeRef.current(editor.getValue());
    });

    return () => {
      subscription.dispose();
      editor.dispose();
      editorRef.current = null;
    };
    // Deliberately empty: the editor is created once. `value` seeds it here and
    // afterwards flows through the effect below, so that typing a character does
    // not tear the editor down and build a new one.
  }, []);

  // Seeded above and kept in step here, because the editor outlives the state:
  // it is created once, and neither whether there is a document to type into
  // nor which theme the page is in stays still.
  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly });
  }, [readOnly]);

  useEffect(() => {
    // `monaco.editor.setTheme` rather than an option on the instance: a theme is
    // registered globally, and Monaco applies it to every editor at once.
    monaco.editor.setTheme(themeIdFor(dark));
  }, [dark]);

  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel() ?? null;
    // Only when the two have genuinely diverged — writing the value back on
    // every keystroke would reset the caret to the start of the document.
    if (editor === null || model === null || editor.getValue() === value) {
      return;
    }

    // `executeEdits` between two undo stops rather than `setValue`, which
    // discards the undo history outright. Everything that reaches this effect is
    // a command the reader ran — writing the layout into the text — and a
    // command that cannot be undone is worse than one that does nothing. The
    // two stops are what make each of them a single step rather than merging
    // with whatever was typed before it.
    editor.pushUndoStop();

    // The model's own line ending wins over the text being written into it —
    // Monaco rewrites every `\r\n` in an edit to whatever the buffer uses. The
    // buffer starts on `\n`, so without this a file saved on Windows arrives,
    // silently loses its carriage returns, and downloads three bytes shorter per
    // line than it went in. Set first, so the edit below is normalised to the
    // ending the file actually had.
    //
    // What no setting can preserve is a file of mixed endings: one buffer holds
    // one ending, so the minority is converted either way.
    model.setEOL(
      value.includes("\r\n")
        ? monaco.editor.EndOfLineSequence.CRLF
        : monaco.editor.EndOfLineSequence.LF,
    );

    editor.executeEdits("host", [
      { range: model.getFullModelRange(), text: value },
    ]);
    editor.pushUndoStop();
  }, [value]);

  return <div ref={hostRef} className="h-full w-full bg-surface-sunken" />;
};

export default EditorPane;
