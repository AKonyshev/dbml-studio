import { getWebviewHtml } from "virtual:vscode";
import {
  Uri,
  ViewColumn,
  window,
  type ExtensionContext,
  type WebviewPanel,
} from "vscode";
import { DbImportError, listDatabases } from "db-to-dbml";

import {
  getConnection,
  listConnections,
  renameConnection,
  saveConnection,
} from "../connectionStore";

import {
  DEFAULT_PORTS,
  emptyFields,
  sameFields,
  validateFields,
  type ConnectionFields,
} from "./connectionFields";
import { buildConnection, parseConnection } from "./connectionString";
import type { FormToHost, HostToForm } from "./messages";
import {
  editTitle,
  connectionGoneMessage,
  fieldErrorMessage,
  formStrings,
  newTitle,
  saveFailedMessage,
  testFailureMessage,
  unreadableMessage,
} from "./strings";

export interface FormDeps {
  context: ExtensionContext;
  // The tree provider's refresh; callers without a tree pass a no-op.
  refresh: () => void;
}

// `undefined` is a tab closed without saving.
export type FormOutcome =
  { name: string; connectionString: string } | undefined;

// What the host keeps of a connection string it has read: the string itself,
// the fields parsed out of it, and the two things the page must never see.
interface Source {
  text: string;
  fields: Omit<ConnectionFields, "name">;
  password: string;
  hiddenOptions: string;
}

// One tab for a new connection, one per edited name. A second open reveals the
// tab that is there and returns its pending outcome.
const open = new Map<
  string,
  { panel: WebviewPanel; outcome: Promise<FormOutcome> }
>();

// The edited connection is identified by its exact stored key: `shop` and
// `SHOP` can both be saved, and each has its own tab.
const tabKey = (edit?: string): string =>
  edit === undefined ? "new" : `edit:${edit}`;

// Closes the edit tab for this saved name, if one is open (after the
// connection was deleted, so the tab cannot write it back).
export function closeConnectionForm(name: string): void {
  open.get(tabKey(name))?.panel.dispose();
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const FIELD_STRINGS = [
  "name",
  "host",
  "port",
  "instance",
  "user",
  "database",
  "options",
] as const;

// The page is our own, but its messages are still input: a message that is not
// the shape the contract says is dropped rather than crashing the handler.
function isFields(value: unknown): value is ConnectionFields {
  return (
    isRecord(value) &&
    FIELD_STRINGS.every((key) => typeof value[key] === "string") &&
    typeof value.encrypt === "boolean" &&
    typeof value.trustServerCertificate === "boolean" &&
    typeof value.dialect === "string" &&
    Object.hasOwn(DEFAULT_PORTS, value.dialect)
  );
}

function asMessage(value: unknown): FormToHost | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  switch (value.type) {
    case "ready":
    case "cancel":
      return { type: value.type };
    case "paste":
      return typeof value.text === "string"
        ? { type: "paste", text: value.text }
        : undefined;
    case "test":
    case "save":
      return isFields(value.fields) &&
        (value.password === undefined || typeof value.password === "string")
        ? { type: value.type, fields: value.fields, password: value.password }
        : undefined;
    default:
      return undefined;
  }
}

export function openConnectionForm(
  deps: FormDeps,
  edit?: string,
): Promise<FormOutcome> {
  const key = tabKey(edit);
  const existing = open.get(key);
  if (existing !== undefined) {
    existing.panel.reveal();
    return existing.outcome;
  }

  const { context } = deps;
  const { secrets } = context;
  const panel = window.createWebviewPanel(
    "dbmlStudio.connectionForm",
    edit === undefined ? newTitle() : editTitle(edit),
    ViewColumn.Active,
    {
      enableScripts: true,
      // Keeps the typed fields while the tab is in the background; nothing is
      // persisted.
      retainContextWhenHidden: true,
      localResourceRoots: [Uri.joinPath(context.extensionUri, "dist")],
    },
  );
  panel.webview.html = getWebviewHtml({
    serverUrl:
      process.env.VITE_DEV_SERVER_URL === undefined
        ? undefined
        : `${process.env.VITE_DEV_SERVER_URL}/connection-form.html`,
    webview: panel.webview,
    context,
    inputName: "connection-form",
  });

  let resolveOutcome: (outcome: FormOutcome) => void = () => undefined;
  const outcome = new Promise<FormOutcome>((resolve) => {
    resolveOutcome = resolve;
  });
  open.set(key, { panel, outcome });

  let disposed = false;
  // The string the connection was read from (stored, or pasted over it), with
  // what was parsed out of it. Held here and never posted.
  let source: Source | undefined;
  // The save in flight or done: its outcome is the panel's, even when the tab
  // is closed while the write is under way.
  let pendingSave: Promise<FormOutcome> | undefined;
  let testRun = 0;

  const post = (message: HostToForm): void => {
    if (disposed) {
      return;
    }
    void Promise.resolve(panel.webview.postMessage(message)).catch(
      () => undefined,
    );
  };

  panel.onDidDispose(() => {
    disposed = true;
    if (open.get(key)?.panel === panel) {
      open.delete(key);
    }
    if (pendingSave === undefined) {
      resolveOutcome(undefined);
    } else {
      void pendingSave.then(resolveOutcome);
    }
  });

  // The password in a message wins; then the one that came with the string.
  const connectionString = (
    fields: ConnectionFields,
    typedPassword: string | undefined,
  ): string => {
    const typed = typedPassword ?? "";
    if (
      source !== undefined &&
      typed === "" &&
      sameFields(fields, source.fields)
    ) {
      return source.text;
    }
    return buildConnection(
      fields,
      typed !== "" ? typed : (source?.password ?? ""),
      source?.hiddenOptions ?? "",
    );
  };

  // Every saved name but the one being edited: the names a save would collide
  // with. `shop` and `SHOP` are different keys, so editing one does not waive
  // the other.
  const otherNames = async (): Promise<string[]> =>
    (await listConnections(secrets)).filter((name) => name !== edit);

  const ready = async (): Promise<void> => {
    const savedNames = await otherNames();
    const stored =
      edit === undefined ? undefined : await getConnection(secrets, edit);
    // Nothing awaits from here to the post: the page starts from what `init`
    // says, so the host's idea of the connection is reset to match it,
    // dropping whatever an earlier paste left.
    let fields = emptyFields();
    let pasteError: string | undefined;
    source = undefined;
    if (edit !== undefined) {
      // Without a host Save stays off until the fields are filled or a string
      // is pasted, so the defaults cannot overwrite a stored string that could
      // not be read.
      fields = { ...fields, name: edit, host: "" };
      if (stored !== undefined) {
        try {
          const text = stored.trim();
          const parsed = parseConnection(text);
          source = { text, ...parsed };
          fields = { ...parsed.fields, name: edit };
        } catch {
          pasteError = unreadableMessage();
        }
      }
    }
    post({
      type: "init",
      mode: edit === undefined ? "new" : "edit",
      fields,
      strings: formStrings(),
      savedNames,
      editing: edit,
      hasPassword: (source?.password ?? "") !== "",
    });
    if (pasteError !== undefined) {
      post({ type: "pasteError", message: pasteError });
    }
  };

  const paste = (text: string): void => {
    try {
      const trimmed = text.trim();
      const parsed = parseConnection(trimmed);
      source = { text: trimmed, ...parsed };
      post({
        type: "pasted",
        fields: parsed.fields,
        hasPassword: parsed.password !== "",
      });
    } catch {
      post({ type: "pasteError", message: unreadableMessage() });
    }
  };

  const test = async (
    fields: ConnectionFields,
    password: string | undefined,
  ): Promise<void> => {
    const run = ++testRun;
    post({ type: "testing" });
    const { host, port } = validateFields(fields, []);
    const unusable = host ?? port;
    if (unusable !== undefined) {
      post({
        type: "testResult",
        ok: false,
        message: fieldErrorMessage(unusable),
      });
      return;
    }
    try {
      const databases = await listDatabases(connectionString(fields, password));
      if (run === testRun) {
        post({ type: "testResult", ok: true, databases });
      }
    } catch (error) {
      if (run === testRun) {
        post({
          type: "testResult",
          ok: false,
          message: testFailureMessage(
            error instanceof DbImportError ? error.code : undefined,
            fields.dialect,
          ),
        });
      }
    }
  };

  // Resolves the outcome when the connection was stored, `undefined` when
  // nothing was.
  const save = async (
    fields: ConnectionFields,
    password: string | undefined,
  ): Promise<FormOutcome> => {
    let saved: FormOutcome;
    try {
      const errors = validateFields(fields, await otherNames());
      const firstError = errors.name ?? errors.host ?? errors.port;
      if (firstError !== undefined) {
        post({ type: "saveError", message: fieldErrorMessage(firstError) });
        return undefined;
      }
      const name = fields.name.trim();
      const string = connectionString(fields, password);
      // An edit is one read-modify-write that drops the old key and sets the new
      // one, so a rename cannot be left half done, and a connection deleted in
      // the meantime is not written back.
      if (edit !== undefined) {
        if (!(await renameConnection(secrets, edit, name, string))) {
          post({ type: "saveError", message: connectionGoneMessage() });
          return undefined;
        }
      } else {
        await saveConnection(secrets, name, string);
      }
      saved = { name, connectionString: string };
    } catch {
      post({ type: "saveError", message: saveFailedMessage() });
      return undefined;
    }
    try {
      deps.refresh();
    } catch {
      // The connection is stored; a tree that failed to refresh is not a failed
      // save.
    }
    resolveOutcome(saved);
    panel.dispose();
    return saved;
  };

  const startSave = (
    fields: ConnectionFields,
    password: string | undefined,
  ): void => {
    if (pendingSave !== undefined) {
      return;
    }
    const run = save(fields, password);
    pendingSave = run;
    void run.then((result) => {
      // A failed save leaves the form usable, and a later close is a plain close.
      if (result === undefined && pendingSave === run) {
        pendingSave = undefined;
      }
    });
  };

  panel.webview.onDidReceiveMessage((raw: unknown) => {
    const message = asMessage(raw);
    if (message === undefined || disposed) {
      return;
    }
    switch (message.type) {
      case "ready":
        void ready();
        break;
      case "paste":
        paste(message.text);
        break;
      case "test":
        void test(message.fields, message.password);
        break;
      case "save":
        startSave(message.fields, message.password);
        break;
      case "cancel":
        // The outcome follows from the dispose, so a save under way still counts.
        panel.dispose();
        break;
    }
  });

  return outcome;
}
