import { type RawDatabase } from "@dbml/core";

import { validateRefs } from "./validateRefs";

export const validateSchema = (schema: RawDatabase): void => {
  validateRefs(schema.refs, schema.tables);
};
