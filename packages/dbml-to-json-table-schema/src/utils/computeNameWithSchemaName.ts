import { DEFAULT_SCHEMA_NAME } from "../constants/schema";

import type { Enum, Table } from "@dbml/core";

export const computeNameWithSchemaName = (
  objectName: string,
  schemaName?: string,
): string => {
  if (
    schemaName !== undefined &&
    schemaName !== null &&
    schemaName !== DEFAULT_SCHEMA_NAME
  ) {
    return `${schemaName}.${objectName}`;
  }

  return objectName;
};

export const getTableFullName = (table: Table): string => {
  // unfortunately the Table type from dbml package not define the schemaName property
  // while it exists
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- schemaName is there at run time, only the type omits it
  return computeNameWithSchemaName(table.name, (table as any).schemaName);
};

export const getEnumFullName = (_enum: Enum): string => {
  // unfortunately the Enum type from dbml package not define the schemaName property
  // while it exists
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- schemaName is there at run time, only the type omits it
  return computeNameWithSchemaName(_enum.name, (_enum as any).schemaName);
};
