import { statSync } from "node:fs";
import path from "node:path";

export type Theme = "light" | "dark";
export type ValidateMode = "warn" | "error" | "off";

export interface DbmlConfig {
  /** Absolute path of the folder the blocks' models are read from. */
  modelsDir: string;
  height: number;
  /** `null`: no site-wide theme; a block's own, else light. */
  theme: Theme | null;
  validate: ValidateMode;
}

/** A playbook entry this extension cannot run with. Stops the build. */
export class ConfigError extends Error {}

export const DEFAULT_HEIGHT = 500;

// `id` and `enabled` are Antora's own entries; 3.2.1 strips them before the
// extension sees its config, older 3.x passes them through. Neither is used.
const KNOWN_KEYS = new Set([
  "models",
  "height",
  "theme",
  "validate",
  "id",
  "enabled",
]);

const fail = (message: string): never => {
  throw new ConfigError(`antora-dbml: ${message}`);
};

export const readConfig = (
  raw: Record<string, unknown>,
  playbookDir: string,
): DbmlConfig => {
  const unknown = Object.keys(raw).filter((key) => !KNOWN_KEYS.has(key));
  if (unknown.length > 0) {
    fail(
      `unknown setting ${unknown.join(", ")}; the settings are models, height, theme and validate`,
    );
  }

  const models = raw.models;
  if (typeof models !== "string" || models.trim() === "") {
    return fail(
      "set `models` to the folder of .dbml files, relative to the playbook",
    );
  }
  const modelsDir = path.resolve(playbookDir, models);
  let isDir = false;
  try {
    isDir = statSync(modelsDir).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) fail(`the models folder ${modelsDir} does not exist`);

  let height = DEFAULT_HEIGHT;
  if (raw.height !== undefined) {
    const value = Number(raw.height);
    if (!Number.isInteger(value) || value <= 0) {
      fail(
        `height must be a positive whole number of pixels, not ${String(raw.height)}`,
      );
    }
    height = value;
  }

  let theme: Theme | null = null;
  if (raw.theme !== undefined && raw.theme !== null) {
    if (raw.theme !== "light" && raw.theme !== "dark") {
      fail(`theme must be light or dark, not ${String(raw.theme)}`);
    }
    theme = raw.theme as Theme;
  }

  let validate: ValidateMode = "warn";
  if (raw.validate === false) validate = "off";
  else if (raw.validate === "error") validate = "error";
  else if (raw.validate !== undefined && raw.validate !== true) {
    fail(`validate must be true, false or error, not ${String(raw.validate)}`);
  }

  return { modelsDir, height, theme, validate };
};
