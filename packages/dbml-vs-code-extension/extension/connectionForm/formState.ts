import type { DialectId } from "db-to-dbml";

import {
  DEFAULT_PORTS,
  emptyFields,
  validateFields,
  type ConnectionFields,
  type FieldErrors,
} from "./connectionFields";
import type { HostToForm } from "./messages";

// The form's state and the one function that changes it. Pure and free of
// vscode and Node imports: the webview page bundles this file.
export interface FormState {
  mode: "new" | "edit";
  fields: ConnectionFields;
  // Whether the port is the user's (or a stored connection's) rather than the
  // default of the current kind, which follows the kind until it is edited.
  portTouched: boolean;
  // Only in memory, never persisted.
  password: string;
  // The host holds a password for these fields (stored or pasted), which stays
  // in force until one is typed. A flag from the host, not the password.
  keepsPassword: boolean;
  savedNames: string[];
  editing?: string;
  testing: boolean;
  test?: { ok: true; databases: string[] } | { ok: false; message: string };
  pasteError?: string;
  // A failed save, kept apart from the test line: the test result stays valid.
  saveError?: string;
}

export type FormAction =
  | { type: "init"; message: Extract<HostToForm, { type: "init" }> }
  | { type: "field"; key: keyof ConnectionFields; value: string | boolean }
  | { type: "password"; value: string }
  | { type: "host"; message: Exclude<HostToForm, { type: "init" }> };

export const initialState = (): FormState => ({
  mode: "new",
  fields: emptyFields(),
  portTouched: false,
  password: "",
  keepsPassword: false,
  savedNames: [],
  testing: false,
});

// A new action or message variant that reduce does not handle fails to compile
// here; a malformed one from the host is still ignored at runtime.
const unhandled = (state: FormState, _action: never): FormState => state;

export function reduce(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "init":
      return {
        ...initialState(),
        mode: action.message.mode,
        fields: action.message.fields,
        savedNames: action.message.savedNames,
        editing: action.message.editing,
        keepsPassword: action.message.hasPassword,
        // A stored connection on its kind's default port follows a kind change
        // like a new one; so does one that could not be read (empty fields).
        portTouched:
          action.message.mode === "edit" &&
          action.message.fields.port !==
            DEFAULT_PORTS[action.message.fields.dialect],
      };
    case "field": {
      if (action.key === "dialect") {
        const dialect = action.value as DialectId;
        return {
          ...state,
          test: undefined,
          saveError: undefined,
          pasteError: undefined,
          fields: {
            ...state.fields,
            dialect,
            port: state.portTouched
              ? state.fields.port
              : DEFAULT_PORTS[dialect],
          },
        };
      }
      return {
        ...state,
        test: undefined,
        saveError: undefined,
        pasteError: undefined,
        portTouched: state.portTouched || action.key === "port",
        fields: { ...state.fields, [action.key]: action.value },
      };
    }
    case "password":
      return {
        ...state,
        test: undefined,
        saveError: undefined,
        pasteError: undefined,
        password: action.value,
      };
    case "host":
      switch (action.message.type) {
        case "pasted":
          return {
            ...state,
            pasteError: undefined,
            saveError: undefined,
            test: undefined,
            // The pasted string's own password, if any, is held by the host and
            // applies unless one is typed afterwards.
            password: "",
            keepsPassword: action.message.hasPassword,
            portTouched: true,
            fields: { ...action.message.fields, name: state.fields.name },
          };
        case "pasteError":
          return { ...state, pasteError: action.message.message };
        case "testing":
          return {
            ...state,
            testing: true,
            test: undefined,
            saveError: undefined,
          };
        case "testResult":
          return {
            ...state,
            testing: false,
            test: action.message.ok
              ? { ok: true, databases: action.message.databases }
              : { ok: false, message: action.message.message },
          };
        case "saveError":
          return {
            ...state,
            testing: false,
            saveError: action.message.message,
          };
        default:
          return unhandled(state, action.message);
      }
    default:
      return unhandled(state, action);
  }
}

// `savedNames` already leaves out the connection being edited.
export const errors = (s: FormState): FieldErrors =>
  validateFields(s.fields, s.savedNames);

export const canSave = (s: FormState): boolean =>
  Object.keys(errors(s)).length === 0 && !s.testing;

export const persistable = ({
  password: _password,
  ...rest
}: FormState): Omit<FormState, "password"> => rest;

const COMMON: Array<keyof ConnectionFields> = [
  "name",
  "dialect",
  "host",
  "port",
  "user",
  "database",
  "options",
];

export const visibleFields = (d: DialectId): Array<keyof ConnectionFields> =>
  d === "mssql"
    ? [...COMMON, "instance", "encrypt", "trustServerCertificate"]
    : COMMON;
