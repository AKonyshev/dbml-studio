import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { postgresCatalog } from "./catalog";
import { connectionsFromEnv } from "./connections";
import { createServer } from "./server";

// --root <dir> names the working folder; otherwise it is where the client
// started the process.
function rootFromArgs(argv: string[]): string {
  const at = argv.indexOf("--root");
  const value = at >= 0 ? argv[at + 1] : undefined;
  return value ?? process.cwd();
}

const connections = connectionsFromEnv(process.env);
const root = rootFromArgs(process.argv.slice(2));

// stdout is the protocol channel; anything for a person goes to stderr.
// serveStdio returns a handle at once (it does not return a promise).
serveStdio(
  () => createServer({ connections, root, catalog: postgresCatalog }),
  {
    onerror: (error) => {
      process.stderr.write(`dbml-mcp: ${error.message}\n`);
    },
  },
);
