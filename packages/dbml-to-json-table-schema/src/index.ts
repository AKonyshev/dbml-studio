import { Parser, type CompilerDiagnostic } from "@dbml/core";
import { DiagnosticError } from "shared/types/diagnostic";

import { applyMetaInfoToSchema, extractMetaInfo } from "./utils/metainfo";
import { dbmlSchemaToJSONTableSchema } from "./utils/transfomers/dbmlSchemaToJSONTableSchema";
import { validateSchema } from "./validators";

import type { JSONTableSchema } from "shared/types/tableSchema";

export { upsertMetaInfoInDbml } from "./utils/metainfo";
// The delimiters are part of the format, not an implementation detail: the web
// editor's grammar highlights the block and has to agree with the writer about
// where it begins and ends.
export { METAINFO_END, METAINFO_START } from "./utils/metainfo";
export type { TableCoordEntry } from "./utils/metainfo";

// Editing the source from a diagram: the caller supplies the document text and
// an intent, and gets back the ranges to change, already proved to parse.
export { planEdit, readFieldText } from "./utils/sourceEdit";
export type { EditPlan, TextEdit } from "./utils/sourceEdit";

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
