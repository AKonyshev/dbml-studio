import { DocumentWriteQueue } from "extension-shared/extension/views/editQueue";

const later = async (ms: number): Promise<void> =>
  await new Promise((resolve) => setTimeout(resolve, ms));

describe("DocumentWriteQueue", () => {
  test("runs tasks for one document one after another", async () => {
    const queue = new DocumentWriteQueue();
    const order: string[] = [];

    const first = queue.run("file:///a.dbml", async () => {
      order.push("first:start");
      await later(20);
      order.push("first:end");
    });
    const second = queue.run("file:///a.dbml", async () => {
      order.push("second:start");
      order.push("second:end");
    });

    await Promise.all([first, second]);

    expect(order).toEqual([
      "first:start",
      "first:end",
      "second:start",
      "second:end",
    ]);
  });

  test("keeps different documents independent", async () => {
    const queue = new DocumentWriteQueue();
    const order: string[] = [];

    const slow = queue.run("file:///a.dbml", async () => {
      await later(20);
      order.push("a");
    });
    const quick = queue.run("file:///b.dbml", async () => {
      order.push("b");
    });

    await Promise.all([slow, quick]);

    expect(order).toEqual(["b", "a"]);
  });

  test("lets a later task run after an earlier one throws", async () => {
    const queue = new DocumentWriteQueue();

    await expect(
      queue.run("file:///a.dbml", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    await expect(queue.run("file:///a.dbml", async () => "fine")).resolves.toBe(
      "fine",
    );
  });
});
