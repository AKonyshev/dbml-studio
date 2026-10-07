import { getEnumFullName } from "./computeNameWithSchemaName";

import type { Enum } from "@dbml/core";

export const createEnumsSet = (enums: Enum[]): Set<string> => {
  const map = new Set<string>();

  enums.forEach((enumObj) => {
    map.add(getEnumFullName(enumObj));
  });

  return map;
};
