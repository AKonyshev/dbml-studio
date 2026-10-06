import path from "node:path";

import { createExtension } from "./extension";

/** The Antora extension: `antora.extensions: [{ require: antora-dbml, models: … }]`. */
export const register = createExtension(path.join(__dirname, "..", "vendor"));
