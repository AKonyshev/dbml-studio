import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ClipboardEvent,
  type ReactNode,
} from "react";

import type { ConnectionFields } from "../../extension/connectionForm/connectionFields";
import {
  canSave,
  errors,
  initialState,
  persistable,
  reduce,
  visibleFields,
} from "../../extension/connectionForm/formState";
import type {
  FormToHost,
  HostToForm,
} from "../../extension/connectionForm/messages";

// The only page-side imports from the extension are the pure form model and
// the message types: connectionString.ts, strings.ts and the panel pull in
// `vscode` and the database drivers, which must not end up in this bundle.

const vscode = acquireVsCodeApi<unknown>();

const post = (message: FormToHost): void => vscode.postMessage(message);

const format = (text: string, ...args: Array<string | number>): string =>
  text.replace(/\{(\d+)\}/g, (_match, index: string) =>
    String(args[Number(index)] ?? ""),
  );

const isHostMessage = (value: unknown): value is HostToForm =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { type?: unknown }).type === "string";

const DIALECTS = [
  { value: "postgres", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL / MariaDB" },
  { value: "mssql", label: "SQL Server" },
] as const;

type TextKey =
  "name" | "host" | "port" | "instance" | "user" | "database" | "options";

export function ConnectionForm() {
  const [state, dispatch] = useReducer(reduce, undefined, initialState);
  // Undefined until the host's `init` arrives, so nothing flashes in English.
  const [strings, setStrings] = useState<Record<string, string>>();
  // The databases of the last successful test. Kept apart from `state.test`,
  // which is cleared by every edit, so the suggestions survive typing.
  const [databases, setDatabases] = useState<string[]>([]);
  // A field shows its error once the user has been in it, not on a blank form.
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>): void => {
      const message = event.data;
      if (!isHostMessage(message)) {
        return;
      }
      if (message.type === "init") {
        setStrings(message.strings ?? {});
        setDatabases([]);
        // An edit starts with its errors visible: a stored connection that
        // could not be read opens with empty fields, and Save says why it is off.
        setTouched(new Set(message.mode === "edit" ? ["name", "host"] : []));
        dispatch({ type: "init", message });
      } else {
        dispatch({ type: "host", message });
      }
    };
    window.addEventListener("message", onMessage);
    post({ type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Never the password: `persistable` leaves it out.
  useEffect(() => {
    vscode.setState(persistable(state));
  }, [state]);

  useEffect(() => {
    if (state.test?.ok === true) {
      setDatabases(state.test.databases);
    }
  }, [state.test]);

  // Starting a test disables the focused Test button and the fieldset; focus
  // moves to Cancel so keyboard users stay in the page.
  useEffect(() => {
    if (state.testing) {
      cancelRef.current?.focus();
    }
  }, [state.testing]);

  const fieldErrors = useMemo(() => errors(state), [state]);

  if (strings === undefined) {
    return null;
  }

  const t = (key: string): string => strings[key] ?? key;
  const { fields, testing } = state;
  const visible = new Set(visibleFields(fields.dialect));

  const touch = (key: string): void =>
    setTouched((previous) =>
      previous.has(key) ? previous : new Set(previous).add(key),
    );
  const setField = (key: keyof ConnectionFields, value: string | boolean) => {
    touch(key);
    dispatch({ type: "field", key, value });
  };
  // The error a field shows: only once it has been touched.
  const shownError = (key: "name" | "host" | "port"): string | undefined =>
    touched.has(key) ? fieldErrors[key] : undefined;
  // Props that tie an input to its error element.
  const invalidProps = (key: "name" | "host" | "port") =>
    shownError(key) === undefined
      ? {}
      : { "aria-invalid": true, "aria-describedby": `e-${key}` };
  const errorFor = (key: "name" | "host" | "port"): ReactNode => {
    const error = shownError(key);
    return error !== undefined ? (
      <div id={`e-${key}`} className="field-error" role="alert">
        {t(error)}
      </div>
    ) : null;
  };

  // The pasted text goes to the host and is never kept: not in state, not in
  // the box.
  const sendPaste = (text: string): void => {
    post({ type: "paste", text });
    if (pasteRef.current !== null) {
      pasteRef.current.value = "";
    }
  };
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>): void => {
    const text = event.clipboardData.getData("text");
    if (text !== "") {
      event.preventDefault();
      if (text.trim() !== "") {
        sendPaste(text);
      }
    }
  };
  const onPasteBlur = (): void => {
    const text = pasteRef.current?.value ?? "";
    if (text.trim() !== "") {
      sendPaste(text);
    } else if (pasteRef.current !== null) {
      pasteRef.current.value = "";
    }
  };

  const textRow = (
    key: TextKey,
    label: string,
    options: { optional?: boolean; placeholder?: string; list?: string } = {},
  ): ReactNode => (
    <>
      <label htmlFor={`f-${key}`}>
        {label}
        {options.optional === true ? (
          <span className="optional"> ({t("optional")})</span>
        ) : null}
      </label>
      <div className="control">
        <input
          id={`f-${key}`}
          type="text"
          value={fields[key]}
          list={options.list}
          placeholder={options.placeholder}
          spellCheck={false}
          autoComplete="off"
          {...(key === "name" ? invalidProps("name") : {})}
          onChange={(event) => setField(key, event.target.value)}
          onBlur={() => touch(key)}
        />
        {key === "name" ? errorFor("name") : null}
      </div>
    </>
  );

  const checkRow = (
    key: "encrypt" | "trustServerCertificate",
    label: string,
  ): ReactNode => (
    <>
      <div />
      <div className="control">
        <label className="check">
          <input
            type="checkbox"
            checked={fields[key]}
            onChange={(event) => setField(key, event.target.checked)}
          />
          {label}
        </label>
      </div>
    </>
  );

  const title =
    state.mode === "edit" && state.editing !== undefined
      ? format(t("Edit connection: {0}"), state.editing)
      : t("New connection");

  const test = state.test;

  return (
    <form
      className="form"
      onSubmit={(event) => event.preventDefault()}
      noValidate
    >
      <h1>{title}</h1>

      <fieldset disabled={testing}>
        <div className="paste">
          <label htmlFor="f-paste">
            {t(
              "Paste a connection string (optional) — the fields below fill in",
            )}
          </label>
          <textarea
            id="f-paste"
            ref={pasteRef}
            rows={2}
            spellCheck={false}
            autoComplete="off"
            onPaste={onPaste}
            onBlur={onPasteBlur}
          />
          {state.pasteError !== undefined ? (
            <div className="field-error" role="alert">
              {state.pasteError}
            </div>
          ) : null}
        </div>

        <div className="grid">
          {textRow("name", t("Name"))}

          <label htmlFor="f-dialect">{t("Database kind")}</label>
          <div className="control">
            <select
              id="f-dialect"
              value={fields.dialect}
              onChange={(event) => setField("dialect", event.target.value)}
            >
              {DIALECTS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {t(label)}
                </option>
              ))}
            </select>
          </div>

          <label htmlFor="f-host">{t("Host")}</label>
          <div className="control">
            <div className="hostport">
              <input
                id="f-host"
                type="text"
                value={fields.host}
                spellCheck={false}
                autoComplete="off"
                {...invalidProps("host")}
                onChange={(event) => setField("host", event.target.value)}
                onBlur={() => touch("host")}
              />
              <label htmlFor="f-port" className="port-label">
                {t("Port")}
              </label>
              <input
                id="f-port"
                type="text"
                inputMode="numeric"
                value={fields.port}
                spellCheck={false}
                autoComplete="off"
                {...invalidProps("port")}
                onChange={(event) => setField("port", event.target.value)}
                onBlur={() => touch("port")}
              />
            </div>
            {errorFor("host")}
            {errorFor("port")}
          </div>

          {visible.has("instance")
            ? textRow("instance", t("Instance"), { optional: true })
            : null}

          {textRow("user", t("User"))}

          <label htmlFor="f-password">{t("Password")}</label>
          <div className="control">
            <input
              id="f-password"
              type="password"
              value={state.password}
              autoComplete="off"
              placeholder={
                state.keepsPassword
                  ? t("Leave empty to keep the current password")
                  : undefined
              }
              onChange={(event) =>
                dispatch({ type: "password", value: event.target.value })
              }
            />
          </div>

          {textRow("database", t("Database"), {
            optional: true,
            list: "f-databases",
          })}

          {visible.has("encrypt")
            ? checkRow("encrypt", t("Encrypt connection"))
            : null}
          {visible.has("trustServerCertificate")
            ? checkRow("trustServerCertificate", t("Trust server certificate"))
            : null}

          {textRow("options", t("Additional parameters"), { optional: true })}
        </div>
        <datalist id="f-databases">
          {databases.map((database) => (
            <option key={database} value={database} />
          ))}
        </datalist>
      </fieldset>

      <div className="actions">
        <button
          type="button"
          disabled={!canSave(state)}
          onClick={() =>
            post({
              type: "save",
              fields,
              password: state.password || undefined,
            })
          }
        >
          {t("Save")}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={testing}
          onClick={() =>
            post({
              type: "test",
              fields,
              password: state.password || undefined,
            })
          }
        >
          {testing ? t("Testing…") : t("Test")}
        </button>
        <button
          type="button"
          className="secondary"
          ref={cancelRef}
          // Outside the disabled fieldset: Cancel always works.
          onClick={() => post({ type: "cancel" })}
        >
          {t("Cancel")}
        </button>
      </div>

      {state.saveError !== undefined ? (
        <div className="save-error" role="alert">
          {state.saveError}
        </div>
      ) : null}

      <div className="result" aria-live="polite">
        {test?.ok === true ? (
          <span className="ok">
            ✓ {format(t("Connected — {0} databases"), test.databases.length)}
          </span>
        ) : test?.ok === false ? (
          <span className="fail">✗ {test.message}</span>
        ) : null}
      </div>
    </form>
  );
}
