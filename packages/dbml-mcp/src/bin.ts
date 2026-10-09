import { homedir } from "node:os";

import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { databaseCatalog } from "./catalog";
import { connectionsFromEnv } from "./connections";
import { rootFromArgs } from "./root";
import { createServer } from "./server";

import type { ConnectionSource } from "./connections";

// stdout is the protocol channel; anything for a person goes to stderr. A
// failure here (two variables naming one connection) is reported as one line,
// not as an uncaught error: Node would print the offending source line first,
// and in the bundle that line is the whole file.
function connectionsOrExit(): ConnectionSource {
  try {
    return connectionsFromEnv(process.env);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "invalid connections";
    process.stderr.write(`dbml-mcp: ${message}\n`);
    process.exit(1);
  }
}

const connections = connectionsOrExit();
const root = rootFromArgs(process.argv.slice(2), process.cwd(), homedir());

// serveStdio returns a handle at once (it does not return a promise).
serveStdio(
  () => createServer({ connections, root, catalog: databaseCatalog }),
  {
    onerror: (error) => {
      process.stderr.write(`dbml-mcp: ${error.message}\n`);
    },
  },
);
