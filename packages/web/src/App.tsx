import { useCallback, useMemo, useRef, useState } from "react";
import DiagramApp from "json-table-schema-visualizer/src/components/DiagramApp/DiagramApp";
import { Theme } from "json-table-schema-visualizer/src/types/theme";
import { switchDocument } from "json-table-schema-visualizer/src/stores/switchDocument";
import { tableCoordsStore } from "json-table-schema-visualizer/src/stores/tableCoords";
import { ScrollDirection } from "json-table-schema-visualizer/src/types/scrollDirection";

import { type Catalog } from "./catalog/catalogManifest";
import { loadSchemaText } from "./catalog/loadSchemaText";
import DocumentActions from "./components/DocumentActions";
import EditorPane from "./components/EditorPane";
import FileTree from "./components/FileTree";
import SplitLayout from "./components/SplitLayout";
import { toDbmlFilename } from "./document/dbmlFilename";
import { downloadTextFile } from "./document/downloadTextFile";
import { parseDbmlText } from "./document/parseDbmlText";
import { writeLayoutIntoText } from "./document/writeLayoutIntoText";
import { useDebouncedValue } from "./hooks/useDebouncedValue";
import { useFileDrop } from "./hooks/useFileDrop";
import {
  documentText,
  loadedOf,
  type LoadedTexts,
} from "./session/documentText";
import { pointStoresAtDocument } from "./session/pointStoresAtDocument";
import {
  addLocalFile,
  documentKeyOf,
  localFileById,
  NO_DOCUMENT_KEY,
  removeLocalFile,
  revertCatalogFile,
  selectDocument,
  textOf,
  updateSelectedText,
  type DocumentId,
  type Session,
} from "./session/session";
import { useSessionPersistence } from "./session/useSessionPersistence";
import { usePageTheme } from "./theme/usePageTheme";

import type { JSX } from "react";

export interface AppProps {
  /** Restored from storage by the entry point, which has already pointed the
   * diagram's stores at the selected document. */
  initialSession: Session;
  /** The schemas the image was built with, or `null` when it carries none. */
  catalog: Catalog | null;
  /** What the entry point fetched for the selected document, when that document
   * is a project file. */
  initialLoaded: string | null;
}

const App = ({
  initialSession,
  catalog,
  initialLoaded,
}: AppProps): JSX.Element => {
  const [session, setSession] = useState(initialSession);
  const [loaded, setLoaded] = useState<LoadedTexts>(
    initialSession.selected?.kind === "catalog" && initialLoaded !== null
      ? { [initialSession.selected.path]: initialLoaded }
      : {},
  );

  // Which project file refused to open, and nothing more: the tree says it next
  // to the row it happened on, and the next successful open clears it.
  const [failedPath, setFailedPath] = useState<string | null>(null);

  // The session as the handlers below see it. They are stable callbacks, so
  // reading state through a closure would give them whatever it was when the
  // callback was built — which for `onChange` is the first render.
  const sessionRef = useRef(session);
  const loadedRef = useRef(loaded);

  const selected = session.selected;
  const documentKey = selected === null ? null : documentKeyOf(selected);
  const text = selected === null ? "" : documentText(session, loaded, selected);

  /**
   * Every change to the session goes through here, because every change might
   * be a change of document.
   *
   * `switchDocument` runs in the handler rather than in an effect, and that is
   * not a preference: `DiagramViewer` is keyed on the document key, so React
   * mounts the new one during the render that follows. An effect would run
   * after that mount, and the viewer would have already read the previous
   * document's table positions. Doing it here means the stores point at the new
   * document before the render begins — which is also how the extension does
   * it, from its message handler.
   */
  const changeSession = useCallback((next: Session) => {
    const current = sessionRef.current;
    const opened = next.selected;
    const currentKey =
      current.selected === null ? null : documentKeyOf(current.selected);

    if (opened === null) {
      // Nothing open, so the stores are parked: left pointing at the document
      // that just went, they would write its layout back under a key nothing
      // will ever claim again.
      if (currentKey !== null) {
        switchDocument(NO_DOCUMENT_KEY, [], []);
      }
    } else if (documentKeyOf(opened) !== currentKey) {
      pointStoresAtDocument(next, loadedRef.current, opened);
    }

    sessionRef.current = next;
    setSession(next);
  }, []);

  /**
   * Every transition reads the session as it is now and commits what the
   * transition returns. Through a ref rather than through `session`, so these
   * callbacks stay stable and a handler built on the first render does not
   * commit the first render's session on the hundredth.
   */
  const applyToSession = useCallback(
    (transition: (current: Session) => Session) => {
      changeSession(transition(sessionRef.current));
    },
    [changeSession],
  );

  // Not debounced on the document key: switching documents must land in the
  // same render as the key, or the viewer arranges the outgoing schema's tables
  // and files the result under the incoming schema's name.
  const debouncedText = useDebouncedValue(text, documentKey ?? "");
  const { schema, errorMessage } = useMemo(
    () => parseDbmlText(debouncedText),
    [debouncedText],
  );
  const { theme, themeColors, setTheme } = usePageTheme();

  useSessionPersistence(session, sessionRef);

  /**
   * What a newly loaded schema does to the diagram.
   *
   * A file arrives as a whole document rather than as an edit, so it can bring
   * tables nothing has ever held a position for — which is every table, the
   * first time it is opened. Left alone they all take the same default
   * coordinate and land in one pile.
   *
   * `resetPositions` computes a layout and then keeps whatever stored position
   * it recognises, so a schema arranged last week still opens arranged.
   * Reserved for opening: running it on every edit would rearrange the diagram
   * under someone mid-sentence.
   */
  const arrangeLoadedText = useCallback((contents: string, key: string) => {
    const { schema: loadedSchema } = parseDbmlText(contents);

    if (loadedSchema === null) {
      return;
    }

    // A file carrying its own layout block overrules whatever was remembered
    // for it, and the stored positions have to be cleared for it to be heard at
    // all: `resetPositions` only consults a file's coordinates when it finds
    // nothing stored. Without this, a file arranged in the extension opens on
    // the site in a layout the site invented — which is the round trip the whole
    // format exists for.
    if (loadedSchema.tables.some((table) => table.fromMetaInfo === true)) {
      tableCoordsStore.clear(key);
    }

    tableCoordsStore.resetPositions(loadedSchema.tables, loadedSchema.refs);
  }, []);

  const rememberLoaded = useCallback((path: string, contents: string) => {
    loadedRef.current = { ...loadedRef.current, [path]: contents };
    setLoaded(loadedRef.current);
  }, []);

  /**
   * Opening a file of the reader's own: the picker in the tree and a file
   * dropped on the page both end here.
   *
   * Decoded as UTF-8 and never sent anywhere — the read happens in the page,
   * which is what lets someone open a production schema without it becoming a
   * request.
   *
   * One byte does not survive the trip: `File.text()` strips a leading UTF-8
   * BOM, so a file written by a Windows editor comes back three bytes shorter.
   * Keeping it would mean carrying it as state the reader cannot see, and
   * keeping it *in the text* is worse — the parser rejects U+FEFF, so the
   * diagram would go blank for exactly those files.
   */
  const addFile = useCallback(
    (file: File) => {
      void file.text().then((contents) => {
        applyToSession((current) => addLocalFile(current, file.name, contents));

        const opened = sessionRef.current.selected;
        if (opened !== null) {
          arrangeLoadedText(contents, documentKeyOf(opened));
        }
      });
    },
    [applyToSession, arrangeLoadedText],
  );

  useFileDrop(addFile);

  const selectFile = useCallback(
    (id: DocumentId) => {
      // A local file is already here, and so is a project file fetched earlier
      // this visit: choosing it is a selection, not a load.
      if (id.kind === "local" || loadedRef.current[id.path] !== undefined) {
        applyToSession((current) => selectDocument(current, id));
        return;
      }

      void loadSchemaText(id.path).then((contents) => {
        if (contents === null) {
          // The manifest is built once, at container start, and a mounted
          // folder can change under a running container. Said in the tree
          // rather than by opening an empty document named after a file that is
          // not there.
          setFailedPath(id.path);
          return;
        }

        setFailedPath(null);
        rememberLoaded(id.path, contents);
        applyToSession((current) => selectDocument(current, id));
        arrangeLoadedText(contents, documentKeyOf(id));
      });
    },
    [applyToSession, arrangeLoadedText, rememberLoaded],
  );

  const revert = useCallback(
    (path: string) => {
      applyToSession((current) => revertCatalogFile(current, path));

      // Before the arranging and not after, which is the opposite of the order
      // deleting needs: the document does not change here, so nothing flushes
      // the store behind us, and `resetPositions` reads storage to decide
      // whether to keep an arrangement. Cleared, it reaches for the project
      // file's own coordinates instead — or computes a fresh layout.
      const key = documentKeyOf({ kind: "catalog", path });
      tableCoordsStore.clear(key);

      const contents = loadedRef.current[path];
      if (contents !== undefined) {
        arrangeLoadedText(contents, key);
      }
    },
    [applyToSession, arrangeLoadedText],
  );

  const remove = useCallback(
    (id: number) => {
      applyToSession((current) => removeLocalFile(current, id));

      // After the transition, never before it. `clear` empties storage and
      // leaves the store holding what it held, so clearing first and switching
      // second writes the deleted document's layout straight back — the switch
      // flushes the outgoing store before it loads the incoming one. By here
      // the stores point elsewhere, and the key stays gone.
      tableCoordsStore.clear(documentKeyOf({ kind: "local", id }));
    },
    [applyToSession],
  );

  /**
   * Handing a schema to the reader, from anywhere in the tree.
   *
   * A project file they have never opened has not been fetched, and handing
   * them an empty file would be worse than making them wait for the request:
   * this is the download the row menu promises even when the schema is too
   * broken to draw, so it cannot be the one that quietly produces nothing.
   */
  const download = useCallback(
    (id: DocumentId) => {
      void (async () => {
        const current = sessionRef.current;
        let contents = textOf(current, id, loadedOf(loadedRef.current, id));

        if (contents === null && id.kind === "catalog") {
          contents = await loadSchemaText(id.path);

          if (contents === null) {
            setFailedPath(id.path);
            return;
          }

          rememberLoaded(id.path, contents);
        }

        const name =
          id.kind === "local"
            ? (localFileById(current, id.id)?.name ?? "")
            : id.path;

        downloadTextFile(toDbmlFilename(name), contents ?? "");
      })();
    },
    [rememberLoaded],
  );

  /**
   * Writing the table positions into the text, so the layout travels with the
   * file. The answer goes back only if it differs: a command that changed
   * nothing — the button pressed twice, or before a diagram exists — stays out
   * of the editor's undo history rather than leaving an empty step in it.
   */
  const writeLayout = useCallback(() => {
    applyToSession((current) => {
      const id = current.selected;

      if (id === null) {
        return current;
      }

      const contents = documentText(current, loadedRef.current, id);
      const updated = writeLayoutIntoText(
        contents,
        tableCoordsStore.getCoordEntriesForMetaInfo(),
      );

      return updated === contents
        ? current
        : updateSelectedText(current, updated);
    });
  }, [applyToSession]);

  return (
    <div className="flex h-full w-full bg-surface text-content">
      <FileTree
        catalogFiles={catalog?.files ?? []}
        localFiles={session.localFiles}
        selected={selected}
        editedPaths={Object.keys(session.edits)}
        failedPath={failedPath}
        onSelect={selectFile}
        onAddFile={addFile}
        onDownload={download}
        onRevert={revert}
        onRemove={remove}
      />
      <div className="min-w-0 flex-1">
        <SplitLayout
          left={
            // `min-h-0` so the editor shrinks inside the column rather than
            // growing the page.
            <div className="flex h-full min-h-0 flex-col">
              <EditorPane
                // Keyed on the document so switching gives the editor the other
                // schema's text outright, rather than as an edit — an edit would
                // leave the undo history of one schema attached to another.
                key={documentKey ?? NO_DOCUMENT_KEY}
                value={text}
                // Typing into a page with nothing open would go nowhere:
                // `updateSelectedText` has no document to write to.
                readOnly={selected === null}
                dark={theme === Theme.dark}
                onChange={(next) => {
                  // Monaco reports the edits the page itself wrote back into
                  // it, and those are not the reader's: restoring a project
                  // file would file the project's own text as their version of
                  // it, leaving the row marked as changed for good.
                  if (next === text) {
                    return;
                  }

                  applyToSession((current) =>
                    updateSelectedText(current, next),
                  );
                }}
              />
            </div>
          }
          right={
            <DiagramApp
              // Nothing open is not an empty schema: `parseDbmlText("")` yields
              // a schema with no tables, which the viewer would draw as an empty
              // canvas. `null` is what makes it say so instead.
              schema={selected === null ? null : schema}
              schemaErrorMessage={selected === null ? null : errorMessage}
              documentKey={documentKey}
              theme={theme}
              themeColors={themeColors}
              setTheme={setTheme}
              scrollDirection={ScrollDirection.UpOut}
              hostActions={
                selected === null ? null : (
                  <DocumentActions
                    onDownload={() => {
                      download(selected);
                    }}
                    onWriteLayout={writeLayout}
                  />
                )
              }
            />
          }
        />
      </div>
    </div>
  );
};

export default App;
