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
  savedNames: string[];
  editing?: string;
  testing: boolean;
  test?: { ok: true; databases: string[] } | { ok: false; message: string };
  pasteError?: string;
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
  savedNames: [],
  testing: false,
});

export function reduce(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "init":
      return {
        ...initialState(),
        mode: action.message.mode,
        fields: action.message.fields,
        savedNames: action.message.savedNames,
        editing: action.message.editing,
        portTouched: action.message.mode === "edit",
      };
    case "field": {
      if (action.key === "dialect") {
        const dialect = action.value as DialectId;
        return {
          ...state,
          test: undefined,
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
        portTouched: state.portTouched || action.key === "port",
        fields: { ...state.fields, [action.key]: action.value },
      };
    }
    case "password":
      return { ...state, test: undefined, password: action.value };
    case "host":
      switch (action.message.type) {
        case "pasted":
          return {
            ...state,
            pasteError: undefined,
            portTouched: true,
            fields: { ...action.message.fields, name: state.fields.name },
          };
        case "pasteError":
          return { ...state, pasteError: action.message.message };
        case "testing":
          return { ...state, testing: true, test: undefined };
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
            test: { ok: false, message: action.message.message },
          };
        default:
          return state;
      }
    default:
      return state;
  }
}

export const errors = (s: FormState): FieldErrors =>
  validateFields(s.fields, s.savedNames, s.editing);

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
