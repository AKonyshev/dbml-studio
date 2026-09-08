import { Parser, type CompilerDiagnostic } from "@dbml/core";
import { DiagnosticError } from "shared/types/diagnostic";

import { applyMetaInfoToSchema, extractMetaInfo } from "./utils/metainfo";
import { dbmlSchemaToJSONTableSchema } from "./utils/transfomers/dbmlSchemaToJSONTableSchema";
import { validateSchema } from "./validators";

import type { JSONTableSchema } from "shared/types/tableSchema";

/**
 * The one way this product reads DBML.
 *
 * In its own module so that anything else in this package which has to agree
 * with the diagram about what parses — the editing gate above all — can call
 * it without importing the package root it is itself exported from. A second
 * entry point that re-implemented these lines drifted from this one within a
 * day; see the "same door" section of AGENTS.md.
 */
export const parseDBMLToJSON = (dbmlCode: string): JSONTableSchema => {
  try {
    const rawParsedSchema = Parser.parseDBMLToJSON(dbmlCode);
    validateSchema(rawParsedSchema);
    const schema = dbmlSchemaToJSONTableSchema(rawParsedSchema);
    const metaInfo = extractMetaInfo(dbmlCode);
    if (metaInfo != null) {
      applyMetaInfoToSchema(schema, metaInfo);
    }
    return schema;
  } catch (error) {
    if ("location" in (error as any) && "message" in (error as any)) {
      const _error = error as CompilerDiagnostic;

      const locationEnd = _error.location.end;
      const locationStart = _error.location.start;

      if (locationEnd === undefined || locationStart === undefined) {
        throw error;
      }

      throw new DiagnosticError(
        {
          end: {
            column: locationEnd.column - 1,
            line: locationEnd.line - 1,
          },
          start: {
            column: locationStart.column - 1,
            line: locationStart.line - 1,
          },
        },
        _error.message,
      );
    }
    throw error;
  }
};
