import { createEnumsSet } from "../createEnumsSet";

import type { Enum } from "@dbml/core";

import { dbmlTestCodeInJSONTableFormat } from "@/tests/data";

describe("create enums set", () => {
  test("create enums set", () => {
    expect(
      createEnumsSet(dbmlTestCodeInJSONTableFormat.enums as Enum[]),
    ).toEqual(new Set(["status"]));
  });
});
