import type { ConnectionFields } from "./connectionFields";

// The contract between the connection form (a webview page) and the extension
// host. No HostToForm variant carries a password or a connection string: a
// pasted string is parsed on the host and comes back as fields, and the
// password only ever travels from the form to the host.
export type FormToHost =
  | { type: "ready" }
  | { type: "paste"; text: string }
  | { type: "test"; fields: ConnectionFields; password?: string }
  | { type: "save"; fields: ConnectionFields; password?: string }
  | { type: "cancel" };

export type HostToForm =
  | {
      type: "init";
      mode: "new" | "edit";
      fields: ConnectionFields;
      strings: Record<string, string>;
      // Every saved name except the one being edited, so the page validates
      // against exactly the names a save would collide with.
      savedNames: string[];
      editing?: string;
      // Whether the host holds a password for these fields. A flag, not the
      // password: the page offers "leave empty to keep" only when it is true.
      hasPassword: boolean;
    }
  | {
      type: "pasted";
      fields: Omit<ConnectionFields, "name">;
      hasPassword: boolean;
    }
  | { type: "pasteError"; message: string }
  | { type: "testing" }
  | { type: "testResult"; ok: true; databases: string[] }
  | { type: "testResult"; ok: false; message: string }
  | { type: "saveError"; message: string };
