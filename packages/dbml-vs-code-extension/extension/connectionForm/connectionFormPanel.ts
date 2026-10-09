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
  deleteConnection,
  getConnection,
  listConnections,
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

const tabKey = (edit?: string): string =>
  edit === undefined ? "new" : `edit:${edit.toLowerCase()}`;

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
  let saving = false;
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
    resolveOutcome(undefined);
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

  const ready = async (): Promise<void> => {
    let fields = emptyFields();
    let pasteError: string | undefined;
    if (edit !== undefined) {
      fields = { ...fields, name: edit };
      const stored = await getConnection(secrets, edit);
      if (stored !== undefined) {
        try {
          const parsed = parseConnection(stored);
          // A paste that got in first stays the original.
          source ??= { text: stored, ...parsed };
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
      savedNames: await listConnections(secrets),
      editing: edit,
    });
    if (pasteError !== undefined) {
      post({ type: "pasteError", message: pasteError });
    }
  };

  const paste = (text: string): void => {
    try {
      const parsed = parseConnection(text);
      source = { text, ...parsed };
      post({ type: "pasted", fields: parsed.fields });
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

  const save = async (
    fields: ConnectionFields,
    password: string | undefined,
  ): Promise<void> => {
    if (saving) {
      return;
    }
    saving = true;
    try {
      const errors = validateFields(
        fields,
        await listConnections(secrets),
        edit,
      );
      const firstError = errors.name ?? errors.host ?? errors.port;
      if (firstError !== undefined) {
        post({ type: "saveError", message: fieldErrorMessage(firstError) });
        saving = false;
        return;
      }
      const name = fields.name.trim();
      const string = connectionString(fields, password);
      await saveConnection(secrets, name, string);
      // After the new spelling is stored, so a case-only rename ends with the
      // new key and without the old one.
      if (edit !== undefined && edit !== name) {
        await deleteConnection(secrets, edit);
      }
      deps.refresh();
      resolveOutcome({ name, connectionString: string });
      panel.dispose();
    } catch {
      saving = false;
      post({ type: "saveError", message: saveFailedMessage() });
    }
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
        void save(message.fields, message.password);
        break;
      case "cancel":
        resolveOutcome(undefined);
        panel.dispose();
        break;
    }
  });

  return outcome;
}
