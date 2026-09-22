import { loadModelText } from "../loadModelText";

const asFetch = (fn: unknown): typeof fetch => fn as typeof fetch;

describe("loadModelText", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns the text the site answered with", async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];

    global.fetch = asFetch(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);

      return { ok: true, text: async () => "Table a { id integer }" };
    });

    expect(await loadModelText("https://docs.example/models/acl.dbml")).toBe(
      "Table a { id integer }",
    );

    // Not fingerprinted, and a site may swap the file under a running page: a
    // cached copy is a stale copy with no way to notice.
    expect(calls).toEqual([
      ["https://docs.example/models/acl.dbml", { cache: "no-store" }],
    ]);
  });

  it("answers null for a model that is not there", async () => {
    global.fetch = asFetch(async () => ({ ok: false, text: async () => "" }));

    expect(await loadModelText("https://docs.example/nope.dbml")).toBeNull();
  });

  // The frame says "model not found" for both, because from the reader's chair
  // they are one thing: the page points at something the site does not serve.
  it("answers null when the request itself fails", async () => {
    global.fetch = asFetch(async () => {
      throw new TypeError("network error");
    });

    expect(await loadModelText("https://docs.example/acl.dbml")).toBeNull();
  });
});
