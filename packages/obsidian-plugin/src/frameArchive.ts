/**
 * The diagram frame `main.js` carries, and putting it where the frame element
 * can load it from.
 *
 * Obsidian installs a plugin from the Community plugins directory as three
 * files — `main.js`, `manifest.json`, `styles.css` — and nothing else. The
 * frame (`frame/embed.html`, about 11.6 MB) has to be a file in the plugin
 * folder all the same: an `<iframe>` needs a URL with an origin of its own,
 * which `getResourcePath` gives and `blob:` or `srcdoc` do not (probe of
 * 2026-09-25). So `scripts/build-plugin.mjs` gzips the frame into the bundle,
 * and on load the plugin writes it out, once per build. Nothing is downloaded:
 * the file written is the one the plugin was shipped with.
 */

/**
 * The few calls of Obsidian's `DataAdapter` this needs. The plugin folder is
 * not part of the vault's file tree — `Vault` does not list it — so the
 * adapter, which addresses any path under the vault folder, is the right door.
 */
export interface FrameFiles {
  exists: (path: string) => Promise<boolean>;
  read: (path: string) => Promise<string>;
  write: (path: string, data: string) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
}

export interface EmbeddedFrame {
  /** `frame/BUILD` as the build wrote it: names the commit the frame is of. */
  build: string;
  /** The frame document itself; unpacked only when it has to be written. */
  html: () => Promise<string>;
}

/** gzip bytes in, the text they hold out. */
export type Gunzip = (bytes: Uint8Array<ArrayBuffer>) => Promise<string>;

/**
 * The browser's own gzip, which Obsidian's Chromium has: no inflater has to
 * ride in the bundle. Read as it is written, so a frame bigger than the
 * stream's buffer never stalls waiting for a reader.
 */
const gunzipWithStream: Gunzip = async (bytes) => {
  const stream = new DecompressionStream("gzip");
  const writer = stream.writable.getWriter();
  // The errors of a broken input come out of the reader below; these two
  // promises would only report the same failure a second time, unhandled.
  writer.write(bytes).catch(() => undefined);
  writer.close().catch(() => undefined);

  const reader = stream.readable.getReader();
  const decoder = new TextDecoder();
  let text = "";

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      return text + decoder.decode();
    }

    text += decoder.decode(value, { stream: true });
  }
};

const fromBase64 = (base64: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

/** The frame document out of the base64 of its gzip, as the build packs it. */
export const unpackFrame = async (
  base64: string,
  gunzip: Gunzip = gunzipWithStream,
): Promise<string> => await gunzip(fromBase64(base64));

/**
 * Makes `<folder>/embed.html` the frame this build carries.
 *
 * `BUILD` decides: when it names this build and the document is there, nothing
 * is unpacked or written — the usual case, every start after the first. When
 * it is missing or names another build (a first run, an update), the document
 * is written first and `BUILD` last, so a write cut short leaves a folder that
 * is rewritten next time rather than one that claims to be whole.
 */
export const ensureFrame = async (
  files: FrameFiles,
  folder: string,
  frame: EmbeddedFrame,
): Promise<"written" | "current"> => {
  const htmlPath = `${folder}/embed.html`;
  const buildPath = `${folder}/BUILD`;

  if (
    (await files.exists(buildPath)) &&
    (await files.read(buildPath)) === frame.build &&
    (await files.exists(htmlPath))
  ) {
    return "current";
  }

  const html = await frame.html();

  if (!(await files.exists(folder))) {
    await files.mkdir(folder);
  }

  await files.write(htmlPath, html);
  await files.write(buildPath, frame.build);

  return "written";
};
