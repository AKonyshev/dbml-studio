import { type JSONTableRef } from "shared/types/tableSchema";

import { computeNameWithSchemaName } from "../computeNameWithSchemaName";

import type { Endpoint } from "@dbml/core";

export const dbmlRefEndpointToJSONTableRefEndpoint = ({
  tableName,
  fieldNames,
  relation,
  schemaName,
}: Endpoint): JSONTableRef["endpoints"][number] => {
  return {
    relation,
    tableName: computeNameWithSchemaName(tableName, schemaName),
    fieldNames,
  };
};
