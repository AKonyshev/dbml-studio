# dbml-mcp

An [MCP](https://modelcontextprotocol.io) server from [DBML Studio](https://github.com/AKonyshev/dbml-studio).
It lets an AI agent read the structure of a PostgreSQL database as DBML,
compare a DBML file with a live database, validate DBML and convert between
DBML and SQL. It speaks MCP over stdio and needs Node 20 or later; the package
is a single bundled file with no dependencies to install.

## Tools

| Tool                    | What it does                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_connections`      | The names of the database connections the server knows.                                                                                      |
| `list_databases`        | The databases on the server a connection points at.                                                                                          |
| `list_schemas`          | The schemas in a database, system schemas left out.                                                                                          |
| `import_schema`         | Reads the structure (not the data) of schemas in a database and returns it as DBML, or writes it to a file.                                  |
| `compare_with_database` | Compares a DBML model with one schema of a database: tables, columns, enums, references and indexes on either side only, or different.       |
| `validate_dbml`         | Checks DBML with the DBML compiler and reports errors with line and column. Invalid DBML is a normal answer (`valid: false`), not a failure. |
| `dbml_to_sql`           | DBML to `CREATE` statements: `postgres`, `mysql`, `mssql` or `oracle`.                                                                       |
| `sql_to_dbml`           | `CREATE` statements to DBML: `postgres`, `mysql`, `mssql`, `oracle` or `snowflake`.                                                          |

`validate_dbml`, `dbml_to_sql`, `sql_to_dbml` and `compare_with_database` take
the DBML or SQL either as `text` or as a `path` to a file in the working
folder, never both. `import_schema`, `dbml_to_sql` and `sql_to_dbml` can write
their result to `outputPath` instead of returning it, which is what to use for
a large database. Everything that reads a database takes a `connection`: a name
from `list_connections`, or a `postgres://` URL.

## Set up

### Claude Code

In `.mcp.json` at the project root:

```json
{
  "mcpServers": {
    "dbml": {
      "command": "npx",
      "args": ["-y", "dbml-mcp"],
      "env": {
        "DBML_CONNECTION_LOCAL": "postgresql://postgres:secret@localhost:5432/app"
      }
    }
  }
}
```

### Cursor

The same shape, in `.cursor/mcp.json` (or `~/.cursor/mcp.json` for every
project), with the project named as the working folder. Cursor expands
`${workspaceFolder}` in `args` to the folder it has open:

```json
"args": ["-y", "dbml-mcp", "--root", "${workspaceFolder}"]
```

### VS Code

Nothing to write: the DBML Studio extension does all of this. See [AI agents
(MCP)](https://github.com/AKonyshev/dbml-studio/tree/main/packages/dbml-vs-code-extension#ai-agents-mcp) in its README.

## Connections

Each `DBML_CONNECTION_<NAME>` variable is one connection. Its name is the part
after the prefix, lower-cased: `DBML_CONNECTION_LOCAL` is `local`, and
`DBML_CONNECTION_STAGING_EU` is `staging_eu`. Names are matched
case-insensitively, so an agent that writes `Local` still gets `local`. Two
variables that give the same name, ignoring case (`DBML_CONNECTION_LOCAL` and
`dbml_connection_local`), stop the server at start with a message naming both.

A name that cannot be part of a variable name, such as `library prod`, `прод`
or `图书馆`, goes in `DBML_CONNECTION_NAMES` (optional): a JSON object from a
variable's suffix to the connection's name.

```json
"env": {
  "DBML_CONNECTION_C1": "postgresql://reader@localhost:5432/library",
  "DBML_CONNECTION_NAMES": "{\"C1\": \"library prod\"}"
}
```

The suffix is matched exactly as written, and the name is then matched
case-insensitively like any other. `DBML_CONNECTION_NAMES` is not a connection
itself. A value that is not a JSON object of non-empty strings stops the server
at start with a message naming the variable. The VS Code extension hands its
saved connections over this way.

A tool also accepts a raw `postgres://` or `postgresql://` URL as the
`connection`. That works, but the URL, password included, is then part of the
conversation with the model. Prefer a name: the connection string stays in the
server's environment and the agent only ever sees the name.

The server starts with no connections at all. All eight tools are listed,
`list_connections` answers an empty list, and a tool given a name answers
`CONNECTION_NOT_FOUND` with a hint on how to configure one. `validate_dbml`,
`dbml_to_sql` and `sql_to_dbml` never need a connection.

## The working folder

Files are read and written only inside the working folder. It is chosen, never
guessed:

- `--root <dir>` names it;
- without `--root`, it is the folder the client started the server in, unless
  that is the filesystem root or your home folder. A client with no project
  open starts servers there, and neither is a folder anybody chose to hand to
  an agent, so the server then has no working folder;
- `--no-root` says there is none, whatever else is given.

```json
"args": ["-y", "dbml-mcp", "--root", "/path/to/project"]
```

Without a working folder, a `path` or an `outputPath` is refused with
`NO_ROOT`; DBML and SQL passed as `text`, and results returned as text, still
work. To work in your home folder all the same, name it with `--root`.

A `path` that leaves the folder, by `../`, by an absolute path or through a
symlink, is refused. Writing to an `outputPath` whose folders do not exist yet
creates them, inside the working folder.

## What it never does

- It does not read rows. Only the structure of a database is read: tables,
  columns, enums, references and indexes.
- It does not run DDL. `dbml_to_sql` produces text; nothing is executed.
- It does not write outside the working folder.
- It does not overwrite a file unless the call passes `overwrite: true`.
- It never puts a connection string, or the text of a driver's error, in an
  answer.

## Errors

A failed call answers `<CODE>: <message>`. The codes:

| Code                        | Meaning                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `CONNECTION_NOT_FOUND`      | No connection has that name, and the value is not a `postgres://` URL. The message lists the known names.  |
| `INVALID_CONNECTION_STRING` | The connection string, or the database name given with it, is not usable.                                  |
| `AUTH_FAILED`               | The database refused the user or the password.                                                             |
| `UNREACHABLE`               | The server could not be reached.                                                                           |
| `DATABASE_NOT_FOUND`        | The server has no such database.                                                                           |
| `ACCESS_DENIED`             | The user may not read what the call needs.                                                                 |
| `SCHEMA_NOT_FOUND`          | A named schema is not in the database. The message lists the schemas that exist.                           |
| `NO_ROOT`                   | A `path` or `outputPath` was given, but the server has no usable working folder. Pass `text`.              |
| `PATH_OUTSIDE_ROOT`         | The path leaves the working folder.                                                                        |
| `FILE_NOT_FOUND`            | The file does not exist or cannot be read.                                                                 |
| `FILE_EXISTS`               | The `outputPath` exists; pass `overwrite: true` to replace it.                                             |
| `INVALID_INPUT`             | Both `text` and `path` were given, or neither.                                                             |
| `DBML_PARSE_ERROR`          | The DBML does not parse. Not raised by `validate_dbml`, which reports it as `valid: false`.                |
| `SQL_PARSE_ERROR`           | The SQL does not parse in the dialect asked for.                                                           |
| `UNKNOWN`                   | The database call failed for a reason the server does not name; the message carries no detail, on purpose. |

## License

MIT.
