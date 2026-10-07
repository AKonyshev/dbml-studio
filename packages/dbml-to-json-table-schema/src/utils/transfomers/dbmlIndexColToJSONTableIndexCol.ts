import { type JSONTableIndexColumn } from "shared/types/tableSchema";

import type { IndexColumn } from "@dbml/core";

export const dbmlIndexColToJSONTableIndexCol = ({
  type,
  value,
}: IndexColumn): JSONTableIndexColumn => {
  return {
    type,
    value,
  };
};
