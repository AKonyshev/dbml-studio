import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import DiagramApp from "json-table-schema-visualizer/src/components/DiagramApp/DiagramApp";
import {
  applyThemeClass,
  useCreateTheme,
  useThemeClass,
} from "json-table-schema-visualizer/src/hooks/theme";
import { initI18n } from "json-table-schema-visualizer/src/i18n/initI18n";
import { PER_DOCUMENT_STORES } from "json-table-schema-visualizer/src/stores/perDocumentStores";
import { switchDocument } from "json-table-schema-visualizer/src/stores/switchDocument";
import { tableCoordsStore } from "json-table-schema-visualizer/src/stores/tableCoords";
import { ScrollDirection } from "json-table-schema-visualizer/src/types/scrollDirection";
import { Theme } from "json-table-schema-visualizer/src/types/theme";
import { type JSONTableSchema } from "shared/types/tableSchema";

import { loadSchemaText } from "../catalog/loadSchemaText";
import { parseDbmlText } from "../document/parseDbmlText";
import { resolveBrowserLocale } from "../i18n/resolveBrowserLocale";

import { embedErrorText } from "./embedError";
import { parseEmbedParams, themeFromName } from "./embedParams";
import ExpandButton from "./ExpandButton";
import { filterSchema } from "./filterSchema";
import {
  helloMessage,
  isFromHost,
  parseHostMessage,
  postToHost,
} from "./frameHost";
import {
  onHostDocument,
  waitForHostDocument,
  type HostDocumentMessage,
} from "./hostedDocument";
import { loadModelText } from "./loadModelText";
import { useHostExpand } from "./useHostExpand";

// The visualizer's own stylesheet, the same one the full site uses: the
// Tailwind directives and the full-height rules do not change because the host
// is a frame.
import "json-table-schema-visualizer/src/styles/index.css";

// `languages` rather than `language`: the first choice may be one we do not
// have, and the reader's second choice is a better answer than English.
initI18n(resolveBrowserLocale(navigator.languages));

/**
 * This document's entry in every per-document store, dropped from storage.
 *
 * `switchDocument` is what computes the layout, and computing it is also what
 * writes it: `tableCoordsStore.switchTo` persists on the way through. So the
 * frame cannot avoid storing a layout by declining to save one — it has to
 * take it back out.
 *
 * Which is worth doing twice over. A diagram in a documentation page should
 * look the same to every reader and to the author who placed it, and a stored
 * layout would leave tables added to the model later piled at the origin. And
 * the site of documentation is one origin with hundreds of pages: a key per
 * frame per page accumulates against a quota shared with the full application
 * next door.
 *
 * By key rather than `forgetAllDocuments`, for that same neighbour: clearing
 * every document would take the reader's own arrangements in `/_dbml/` with it.
 *
 * Storage only — what the stores hold in memory is what this render draws.
 */
const forgetThisDocument = (documentKey: string): void => {
  for (const store of PER_DOCUMENT_STORES) {
    try {
      store.clear(documentKey);
    } catch {
      // Storage that refuses a delete is storage nothing reached either.
    }
  }
};

/** How long a frame with no `src` and no `model` waits before deciding it has no host. */
const HOST_DOCUMENT_TIMEOUT_MS = 2000;

/**
 * One key for a hosted frame's whole life.
 *
 * A hosted frame draws one block, and a block whose text the author changes is
 * re-rendered by the host into a new frame. The documents that arrive after the
 * first are therefore re-sends of the same one — a theme change, a refresh — and
 * they should land on the layout already on screen rather than beside it.
 *
 * Unique without being unique: the stores are module singletons, and a frame is
 * its own JS context, so two frames in one page never share this.
 */
const HOSTED_DOCUMENT_KEY = "hosted";

/** What the frame is drawing, or why it is not. */
interface Drawn {
  schema: JSONTableSchema | null;
  errorMessage: string | null;
  documentKey: string;
}

/**
 * The text and table filter a `Drawn` was made from.
 *
 * Kept so a hosted frame can tell a re-send of the document already on screen
 * — a theme change, the host's own "refresh" command — from one that actually
 * changed, without re-parsing to find out.
 */
interface HostedSource {
  text: string;
  tables: string[] | null;
}

const sameTables = (a: string[] | null, b: string[] | null): boolean => {
  if (a === null || b === null) {
    return a === b;
  }

  return a.length === b.length && a.every((name, index) => name === b[index]);
};

const sameHostedSource = (a: HostedSource, b: HostedSource): boolean =>
  a.text === b.text && sameTables(a.tables, b.tables);

type ParsedAndFiltered =
  | { ok: true; schema: JSONTableSchema }
  | { ok: false; errorMessage: string | null };

const parseAndFilter = (
  text: string,
  tables: string[] | null,
): ParsedAndFiltered => {
  const parsed = parseDbmlText(text);

  if (parsed.schema === null) {
    return { ok: false, errorMessage: parsed.errorMessage };
  }

  const filtered = filterSchema(parsed.schema, tables);

  if (!filtered.ok) {
    return { ok: false, errorMessage: embedErrorText(filtered.error) };
  }

  return { ok: true, schema: filtered.schema };
};

/**
 * Text in, `Drawn` out — with the store switched on the way, before the render
 * that mounts the viewer.
 *
 * `DiagramViewer` is keyed on the document key, so React mounts it during the
 * render that follows; an effect would arrive after the viewer had already read
 * coordinates for tables this document has never held any for — which is all of
 * them, and they would be piled at one point.
 *
 * For the document a key is adopted with — the frame's first render under that
 * key. A hosted frame's second and later document keeps the same key for its
 * whole life and must not come back through here; see `redraw`.
 */
const draw = (
  text: string,
  tables: string[] | null,
  documentKey: string,
): Drawn => {
  const result = parseAndFilter(text, tables);

  if (!result.ok) {
    return { schema: null, errorMessage: result.errorMessage, documentKey };
  }

  switchDocument(documentKey, result.schema.tables, result.schema.refs);
  forgetThisDocument(documentKey);

  return { schema: result.schema, errorMessage: null, documentKey };
};

/**
 * Text in, `Drawn` out, for a hosted frame's second and later document.
 *
 * `draw`'s twin, and deliberately not `draw` again: the document key does not
 * change between hosted pushes — one frame draws one block for its whole life
 * — so `switchDocument` would flush this same key's stored positions and then
 * immediately recover the very map it just flushed, made for the table set
 * before this one. A table added or renamed has no entry in it, and
 * `tableCoordsStore.getCoords` falls back to `defaultTableCoord` for a name it
 * does not hold — every new table piled at `{x:0,y:0}` instead of laid out.
 *
 * `resetPositions(…, { force: true })` skips that recovery and computes a
 * fresh layout for the tables that are actually there — the same primitive
 * `TablesPositionsProvider`'s own "reset layout" already forces. The reader's
 * arrangement is not being sacrificed here; it is protected one level up, in
 * the caller that only reaches `redraw` once the text or the table filter has
 * actually changed. A re-send of the document already on screen never gets
 * this far.
 */
const redraw = (
  text: string,
  tables: string[] | null,
  documentKey: string,
): Drawn => {
  const result = parseAndFilter(text, tables);

  if (!result.ok) {
    return { schema: null, errorMessage: result.errorMessage, documentKey };
  }

  tableCoordsStore.resetPositions(result.schema.tables, result.schema.refs, {
    force: true,
  });
  forgetThisDocument(documentKey);

  return { schema: result.schema, errorMessage: null, documentKey };
};

interface FrameProps {
  initial: Drawn;
  theme: Theme;
  /** Whether this frame's model arrives as messages rather than over the wire. */
  hosted: boolean;
  /**
   * The text and table filter `initial` was drawn from — `null` for every mode
   * but `hosted`, where it seeds the comparison the first later `document`
   * needs in order to tell a re-send apart from a change.
   */
  initialHostedSource: HostedSource | null;
}

/**
 * The frame, once its first model is in hand.
 *
 * Everything the host says afterwards changes state here rather than replacing
 * this component. That is deliberate: remounting rebuilds the Konva stage, and
 * the diagram then re-fits — which throws away wherever the reader had scrolled
 * and zoomed to. A theme switch on a documentation page is an ordinary,
 * repeatable act, and it must cost nothing but colours.
 *
 * `useCreateTheme` rather than `usePageTheme`, and that is the whole difference:
 * `usePageTheme` writes the reader's choice to `web:theme`, a key shared by
 * every page on this origin. A frame doing that would silently reset the theme
 * of the full application next door.
 */
const Frame = ({
  initial,
  theme,
  hosted,
  initialHostedSource,
}: FrameProps): JSX.Element => {
  const [drawn, setDrawn] = useState(initial);
  const { themeColors, setTheme, theme: current } = useCreateTheme(theme);
  const { supported, expanded, toggle } = useHostExpand();
  // The document `drawn` was last made from — bookkeeping for the next
  // message, not state a render reads, so a ref rather than `useState`.
  const hostedSource = useRef(initialHostedSource);

  // `applyThemeClass` before the first render sets this once; this keeps it in
  // step afterwards. Without it the canvas would turn over on a host's word and
  // the page behind it would stay the colour it was.
  useThemeClass(current);

  useEffect(() => {
    if (!hosted) {
      return;
    }

    // `isFromHost`, and not left to callers to add on their own: a hosted
    // frame is handed its model by the window that created it, and nothing
    // else on the page — another frame, a script with a stale reference —
    // gets to answer for it. Without this, whichever of them posts first at
    // startup can win the race `waitForHostDocument` runs in `bootstrap`.
    return onHostDocument(
      window,
      isFromHost,
      (message: HostDocumentMessage) => {
        const next: HostedSource = {
          text: message.text,
          tables: message.tables,
        };
        const previous = hostedSource.current;
        hostedSource.current = next;

        // A re-send of the document already on screen — a theme change, the
        // host's own "refresh diagrams" command, or simply `useHostExpand`'s
        // own "hello" bringing a second reply — lands on the layout already
        // there. Redrawing for one would either throw the reader's own
        // arrangement away (`draw`) or recompute it for nothing (`redraw`);
        // only the theme below is worth doing again.
        if (previous === null || !sameHostedSource(previous, next)) {
          setDrawn(redraw(message.text, message.tables, HOSTED_DOCUMENT_KEY));
        }

        setTheme(themeFromName(message.theme));
      },
    );
  }, [hosted, setTheme]);

  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      if (!isFromHost(event)) {
        return;
      }

      const message = parseHostMessage(event.data);

      if (message?.type === "theme") {
        setTheme(themeFromName(message.theme));
      }
    };

    window.addEventListener("message", onMessage);

    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [setTheme]);

  return (
    <DiagramApp
      schema={drawn.schema}
      schemaErrorMessage={drawn.errorMessage}
      documentKey={drawn.documentKey}
      theme={current}
      themeColors={themeColors}
      setTheme={setTheme}
      scrollDirection={ScrollDirection.UpIn}
      hostActions={
        supported ? (
          <ExpandButton expanded={expanded} onToggle={toggle} />
        ) : null
      }
      autoFit
      revealControlsOnHover
    />
  );
};

/**
 * Everything that has to happen before the first render, in order.
 *
 * No `unload` handler saving table positions, unlike `src/main.tsx`: dragging a
 * table still works, it just does not outlive a reload.
 */
const bootstrap = async (): Promise<void> => {
  const container = document.getElementById("app");

  if (container === null) {
    return;
  }

  const parsed = parseEmbedParams(window.location.search, window.location.href);

  // Light when the query could not be read at all: `useCreateTheme` defaults to
  // dark, and a dark error message in a light documentation page reads as a
  // second thing having gone wrong.
  const theme = parsed.ok ? parsed.params.theme : Theme.light;

  // Before the first paint, so the frame is never the wrong colour corrected a
  // frame later — the page around it is not going to repaint with us.
  applyThemeClass(theme);

  const root = createRoot(container);

  const render = (
    initial: Drawn,
    hosted: boolean,
    initialHostedSource: HostedSource | null,
  ): void => {
    root.render(
      <Frame
        initial={initial}
        theme={theme}
        hosted={hosted}
        initialHostedSource={initialHostedSource}
      />,
    );
  };

  const failed = (errorMessage: string | null, documentKey: string): void => {
    render({ schema: null, errorMessage, documentKey }, false, null);
  };

  if (!parsed.ok) {
    failed(embedErrorText(parsed.error), "embed");
    return;
  }

  const { source, tables } = parsed.params;

  if (source.kind === "hosted") {
    // A host in this mode has no `src` or `model` to answer, and its script
    // ordinarily waits for the frame's own "hello" before sending anything —
    // the same handshake `useHostExpand` speaks once mounted. That component
    // does not exist yet here, because there is nothing to draw until the
    // host answers, so the frame says hello itself before it starts waiting.
    // `useHostExpand` says it again once `Frame` mounts, so a hosted frame
    // always greets twice — see `helloMessage`'s own comment for why that is
    // cheap rather than something to prevent. Skipped when there is no host
    // to hear it: opened straight from the address bar, `window.parent` is
    // this window, and posting would only talk to ourselves.
    if (window.parent !== window) {
      postToHost(helloMessage());
    }

    const first = await waitForHostDocument(
      window,
      isFromHost,
      HOST_DOCUMENT_TIMEOUT_MS,
    );

    if (first === null) {
      // The same message the frame gave before there was a hosted mode at all,
      // and for the same reason: `embed.html` opened by hand has to explain
      // itself rather than sit blank.
      failed(embedErrorText({ kind: "srcMissing" }), HOSTED_DOCUMENT_KEY);
      return;
    }

    render(draw(first.text, first.tables, HOSTED_DOCUMENT_KEY), true, {
      text: first.text,
      tables: first.tables,
    });
    return;
  }

  // What the reader is shown when this goes wrong, and what the layout is keyed
  // on: the path for a catalogue model, the URL for one the site serves itself.
  const shown = source.kind === "catalog" ? source.path : source.url;

  const text =
    source.kind === "catalog"
      ? await loadSchemaText(source.path)
      : await loadModelText(source.url);

  if (text === null) {
    failed(embedErrorText({ kind: "notFound", src: shown }), `embed:${shown}`);
    return;
  }

  // Keyed on what was asked for, not just on the file: two frames on one page
  // showing different slices of the same model are different documents as far as
  // the table layouts are concerned.
  render(
    draw(text, tables, `embed:${shown}?${tables?.join(",") ?? ""}`),
    false,
    null,
  );
};

// Nothing awaits this: the page is what it produces.
void bootstrap();
