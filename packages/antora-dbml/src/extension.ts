import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  diagramHtml,
  errorHtml,
  FRAME_DIR,
  frameSrc,
  hostAssetsHtml,
  MODELS_DIR,
  pageId,
  parseHeight,
  parseTables,
  parseTheme,
  resolveModel,
} from "./block";
import { readConfig, type DbmlConfig, type Theme } from "./config";
import {
  findingMessage,
  runValidator,
  type CollectedBlock,
} from "./validation";

// The few parts of Antora and Asciidoctor.js this file touches, typed here:
// neither ships types for its extension API.
interface Logger {
  warn: (message: string) => void;
  error: (message: string) => void;
}
interface SiteFile {
  contents: Buffer;
  out: { path: string };
}
interface Vars {
  playbook: { dir?: string };
  siteAsciiDocConfig: { extensions?: unknown[] };
  siteCatalog: { addFile: (file: SiteFile) => void };
}
export interface AntoraContext {
  getLogger: (name: string) => Logger;
  once: (event: "beforeProcess", listener: (vars: Vars) => void) => void;
  on: (event: "documentsConverted", listener: (vars: Vars) => void) => void;
}
interface PageFile {
  src: { component: string; version: string; module: string; relative: string };
  out?: { rootPath: string };
}
interface MacroDsl {
  named: (name: string) => void;
  process: (
    fn: (
      parent: unknown,
      target: string,
      attrs: Record<string, unknown>,
    ) => unknown,
  ) => void;
  createBlock: (parent: unknown, context: "pass", source: string) => unknown;
}
interface Registry {
  blockMacro: (definition: (this: MacroDsl) => void) => void;
}

const LOGGER = "antora-dbml";

/** Every file under `dir`, as paths relative to it with `/` separators. */
const filesUnder = (dir: string, prefix = ""): string[] =>
  readdirSync(path.join(dir, prefix), { withFileTypes: true }).flatMap(
    (entry) => {
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      return entry.isDirectory() ? filesUnder(dir, relative) : [relative];
    },
  );

/**
 * The extension, with the folder its frame, host script and validator are
 * read from. `src/index.ts` binds the package's own `vendor/`; the build test
 * binds a fake one.
 *
 * `register` destructures `{ config }` in its parameter list on purpose:
 * that is how Antora knows to call it with the variables object and the
 * generator as `this` (see tsconfig.build.json on why the target matters).
 */
export const createExtension = (vendorDir: string) =>
  function register(
    this: AntoraContext,
    { config }: { config: Record<string, unknown> },
  ) {
    const logger = this.getLogger(LOGGER);
    let settings: DbmlConfig | null = null;
    // Every use is after `beforeProcess`, which sets it or stops the build.
    const loaded = (): DbmlConfig => {
      if (settings === null)
        throw new Error("antora-dbml: used before its settings were read");
      return settings;
    };
    const blocks = new Map<string, CollectedBlock>();
    // Path inside the models folder → absolute file.
    const models = new Map<string, string>();
    // Path inside the models folder → its text, so a model named on many pages
    // is read once.
    const texts = new Map<string, string>();
    // Blocks that ended as an in-page error; `validate: error` counts them.
    let unresolved = 0;

    const isFile = (file: string): boolean => {
      try {
        return statSync(file).isFile();
      } catch {
        return false;
      }
    };

    const drawBlock = (
      file: PageFile,
      index: number,
      target: string,
      attrs: Record<string, unknown>,
      first: boolean,
    ): string => {
      const current = loaded();
      const page = pageId(file.src);
      const where = `${page}, block ${index}`;
      const rootPath = file.out?.rootPath ?? ".";

      const resolved = resolveModel(target);
      if (!resolved.ok) {
        unresolved += 1;
        logger.error(`${where}: ${resolved.problem}`);
        return errorHtml(resolved.problem);
      }
      const modelFile = path.join(current.modelsDir, resolved.relative);
      if (!isFile(modelFile)) {
        const problem = `no model ${resolved.relative} in the models folder`;
        unresolved += 1;
        logger.error(`${where}: ${problem}`);
        return errorHtml(problem);
      }

      let height = current.height;
      if (attrs.height !== undefined) {
        const parsed = parseHeight(attrs.height);
        if (parsed === null) {
          logger.warn(
            `${where}: height must be a positive whole number, not ${String(attrs.height)}`,
          );
        } else {
          height = parsed;
        }
      }
      let blockTheme: Theme | null = null;
      if (attrs.theme !== undefined) {
        blockTheme = parseTheme(attrs.theme);
        if (blockTheme === null) {
          logger.warn(
            `${where}: theme must be light or dark, not ${String(attrs.theme)}`,
          );
        }
      }
      const theme = blockTheme ?? current.theme ?? "light";
      const tables = parseTables(attrs.tables);

      models.set(resolved.relative, modelFile);
      let text = texts.get(resolved.relative);
      if (text === undefined) {
        text = readFileSync(modelFile, "utf8");
        texts.set(resolved.relative, text);
      }
      const id = `${page}#${index}`;
      blocks.set(id, {
        id,
        page,
        index,
        model: resolved.relative,
        text,
        tables,
      });

      return (
        (first ? hostAssetsHtml(rootPath) : "") +
        diagramHtml({
          src: frameSrc(rootPath, resolved.relative, tables, theme),
          height,
          title: target.trim(),
        })
      );
    };

    this.once("beforeProcess", ({ playbook, siteAsciiDocConfig }) => {
      // Throws ConfigError, which stops the build with its message.
      settings = readConfig(config, playbook.dir ?? process.cwd());

      siteAsciiDocConfig.extensions = [
        ...(siteAsciiDocConfig.extensions ?? []),
        {
          // Antora calls this once per document it loads, with that page.
          register: (registry: Registry, { file }: { file: PageFile }) => {
            let index = 0;
            let hostEmitted = false;
            registry.blockMacro(function () {
              this.named("dbml");
              this.process((parent, target, attrs) => {
                index += 1;
                const html = drawBlock(
                  file,
                  index,
                  target,
                  attrs,
                  !hostEmitted,
                );
                if (html.includes("<iframe")) hostEmitted = true;
                return this.createBlock(parent, "pass", html);
              });
            });
          },
        },
      ];
    });

    this.on("documentsConverted", ({ siteCatalog }) => {
      const current = loaded();
      let problems = 0;

      if (current.validate !== "off" && blocks.size > 0) {
        const all = [...blocks.values()];
        const findings = runValidator(
          path.join(vendorDir, "validate.mjs"),
          all,
        );
        for (const finding of findings) {
          const block = blocks.get(finding.id);
          if (block === undefined) continue;
          const message = findingMessage(block, finding);
          if (current.validate === "error") logger.error(message);
          else logger.warn(message);
        }
        problems = findings.length;
      }

      // Checked before the early return below: a site whose only blocks are
      // broken must fail too. Antora's default failure level is `fatal`, so a
      // logged error alone would not fail the build that asked for exactly that.
      if (current.validate === "error" && problems + unresolved > 0) {
        const parts: string[] = [];
        if (problems > 0) parts.push(`${problems} problem(s) in DBML models`);
        if (unresolved > 0)
          parts.push(`${unresolved} block(s) without a model`);
        throw new Error(
          `antora-dbml: ${parts.join(" and ")} (validate: error)`,
        );
      }

      if (blocks.size === 0) return;

      const add = (outPath: string, file: string): void => {
        siteCatalog.addFile({
          contents: readFileSync(file),
          out: { path: outPath },
        });
      };

      const frameDir = path.join(vendorDir, "frame");
      for (const relative of filesUnder(frameDir)) {
        add(`${FRAME_DIR}/${relative}`, path.join(frameDir, relative));
      }
      for (const name of ["frame-host.js", "frame-host.css"]) {
        add(`${FRAME_DIR}/${name}`, path.join(vendorDir, name));
      }
      for (const [relative, file] of models) {
        add(`${FRAME_DIR}/${MODELS_DIR}/${relative}`, file);
      }
    });
  };
