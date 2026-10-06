/**
 * @jest-environment node
 */
// Node, not jsdom: jsdom has neither `DecompressionStream` nor `TextDecoder`,
// and the default unpacker is exactly the code that runs in Obsidian, so it is
// tested with the real ones Node provides rather than through a stand-in.
import { gzipSync } from "node:zlib";

import {
  ensureFrame,
  unpackFrame,
  type EmbeddedFrame,
  type FrameFiles,
} from "../frameArchive";

const gzipBase64 = (text: string): string =>
  gzipSync(Buffer.from(text, "utf8")).toString("base64");

describe("unpackFrame", () => {
  it("gives back the text that was gzipped and base64-encoded", async () => {
    // Past ASCII on purpose: the frame's script carries every catalog it has.
    const html = "<!doctype html><title>café — \u{1F5C2}</title>";

    await expect(unpackFrame(gzipBase64(html))).resolves.toBe(html);
  });

  it("carries a document bigger than one stream chunk", async () => {
    const html = `<!doctype html>${"<p>row</p>".repeat(200_000)}`;

    await expect(unpackFrame(gzipBase64(html))).resolves.toBe(html);
  });

  it("refuses what is not gzip", async () => {
    await expect(
      unpackFrame(Buffer.from("not gzip").toString("base64")),
    ).rejects.toThrow();
  });
});

/** An in-memory plugin folder that records every write, in order. */
const memoryFiles = (
  initial: Record<string, string> = {},
): FrameFiles & { files: Map<string, string>; writes: string[] } => {
  const files = new Map(Object.entries(initial));
  const writes: string[] = [];

  return {
    files,
    writes,
    exists: async (path) => files.has(path),
    read: async (path) => {
      const text = files.get(path);

      if (text === undefined) {
        throw new Error(`ENOENT: ${path}`);
      }

      return text;
    },
    write: async (path, data) => {
      writes.push(path);
      files.set(path, data);
    },
    mkdir: async (path) => {
      files.set(path, "<folder>");
    },
  };
};

const FOLDER = ".obsidian/plugins/dbml-studio/frame";
const HTML_PATH = `${FOLDER}/embed.html`;
const BUILD_PATH = `${FOLDER}/BUILD`;

const embedded = (
  build: string,
  html = "<html>frame</html>",
): { frame: EmbeddedFrame; unpack: jest.Mock<Promise<string>, []> } => {
  const unpack = jest.fn(async () => html);

  return { frame: { build, html: unpack }, unpack };
};

describe("ensureFrame", () => {
  it("writes the frame into a plugin folder that has none", async () => {
    const files = memoryFiles();
    const { frame } = embedded("abc123\n");

    await expect(ensureFrame(files, FOLDER, frame)).resolves.toBe("written");

    expect(files.files.get(HTML_PATH)).toBe("<html>frame</html>");
    expect(files.files.get(BUILD_PATH)).toBe("abc123\n");
  });

  it("writes BUILD last, so a write cut short does not look whole", async () => {
    const files = memoryFiles();

    await ensureFrame(files, FOLDER, embedded("abc123\n").frame);

    expect(files.writes).toEqual([HTML_PATH, BUILD_PATH]);
  });

  it("rewrites a frame of another build", async () => {
    const files = memoryFiles({
      [FOLDER]: "<folder>",
      [HTML_PATH]: "<html>old</html>",
      [BUILD_PATH]: "old999\n",
    });

    await expect(
      ensureFrame(files, FOLDER, embedded("abc123\n").frame),
    ).resolves.toBe("written");

    expect(files.files.get(HTML_PATH)).toBe("<html>frame</html>");
    expect(files.files.get(BUILD_PATH)).toBe("abc123\n");
  });

  it("leaves a frame of the same build alone, without unpacking", async () => {
    const files = memoryFiles({
      [FOLDER]: "<folder>",
      [HTML_PATH]: "<html>frame</html>",
      [BUILD_PATH]: "abc123\n",
    });
    const { frame, unpack } = embedded("abc123\n");

    await expect(ensureFrame(files, FOLDER, frame)).resolves.toBe("current");

    expect(files.writes).toEqual([]);
    expect(unpack).not.toHaveBeenCalled();
  });

  // BUILD present, embed.html gone: a folder someone tidied by hand.
  it("rewrites a frame whose document is missing", async () => {
    const files = memoryFiles({
      [FOLDER]: "<folder>",
      [BUILD_PATH]: "abc123\n",
    });

    await expect(
      ensureFrame(files, FOLDER, embedded("abc123\n").frame),
    ).resolves.toBe("written");

    expect(files.files.get(HTML_PATH)).toBe("<html>frame</html>");
  });

  it("writes no BUILD when the frame could not be unpacked", async () => {
    const files = memoryFiles();
    const frame = {
      build: "abc123\n",
      html: async (): Promise<string> => {
        throw new Error("corrupt");
      },
    };

    await expect(ensureFrame(files, FOLDER, frame)).rejects.toThrow("corrupt");

    expect(files.files.has(BUILD_PATH)).toBe(false);
  });
});
