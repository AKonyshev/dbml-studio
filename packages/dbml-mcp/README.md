# dbml-mcp

An [MCP](https://modelcontextprotocol.io) server from [DBML Studio](https://github.com/AKonyshev/dbml-studio).
It lets an AI agent read the structure of a PostgreSQL, MySQL (MariaDB) or SQL
Server database as DBML, compare a DBML file with a live database, validate
DBML and convert between DBML and SQL. It speaks MCP over stdio and needs Node 20 or later; the package
is a single bundled file with no dependencies to install.

## Tools

| Tool                    | What it does                                                                                                                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_connections`      | The database connections the server knows: each one's `name` and its `database` (`postgres`, `mysql`, `mssql`, or `unknown` for a value that is no supported connection string).                                                              |
| `list_databases`        | The databases on the server a connection points at.                                                                                                                                                                                           |
| `list_schemas`          | The schemas in a database, system schemas left out.                                                                                                                                                                                           |
| `import_schema`         | Reads the structure (not the data) of schemas in a database and returns it as DBML, or writes it to a file.                                                                                                                                   |
| `compare_with_database` | Compares a DBML model with one schema of a database: tables, columns, enums, references and indexes on either side only, or different. Without `schema` it compares `public` (PostgreSQL), the database itself (MySQL) or `dbo` (SQL Server). |
| `validate_dbml`         | Checks DBML with the DBML compiler and reports errors with line and column. Invalid DBML is a normal answer (`valid: false`), not a failure.                                                                                                  |
| `dbml_to_sql`           | DBML to `CREATE` statements: `postgres`, `mysql`, `mssql` or `oracle`.                                                                                                                                                                        |
| `sql_to_dbml`           | `CREATE` statements to DBML: `postgres`, `mysql`, `mssql`, `oracle` or `snowflake`.                                                                                                                                                           |

`validate_dbml`, `dbml_to_sql`, `sql_to_dbml` and `compare_with_database` take
the DBML or SQL either as `text` or as a `path` to a file in the working
folder, never both. `import_schema`, `dbml_to_sql` and `sql_to_dbml` can write
their result to `outputPath` instead of returning it, which is what to use for
a large database. The result comes back as structured content (`sql` for
`dbml_to_sql`, `dbml` for `sql_to_dbml` and `import_schema`, `report` for
`compare_with_database`, next to the diff fields), omitted when written to
`outputPath`; the text content repeats it. Everything that reads a database takes a `connection`: a name
from `list_connections`, or a connection string (see [Connections](#connections)).

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
        "DBML_CONNECTION_LOCAL": "${DBML_LOCAL_URL}"
      }
    }
  }
}
```

`.mcp.json` is usually committed, so it names an environment variable rather
than holding the connection string: Claude Code expands `${DBML_LOCAL_URL}`
from the environment it was started in, where you set it to
a connection string such as `postgresql://…`. A server added at user scope (`claude mcp add --scope user`)
keeps its config out of the project, and can hold the string itself.

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

A connection string is one of:

| Database          | Forms                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------ |
| PostgreSQL        | `postgres://user:password@host:5432/library` or `postgresql://…`                           |
| MySQL and MariaDB | `mysql://user:password@host:3306/library` or `mariadb://…`                                 |
| SQL Server        | `sqlserver://user:password@host:1433/library` or `mssql://…`, or an ADO string (see below) |

SQL Server also takes the ADO form, `Server=host;Database=library;User Id=sa;Password=…`
(`Data Source=` and `Address=` work for `Server=`; a named instance is
`Server=host\SQLEXPRESS`). A value with `;`, `=` or `}` in it is quoted in `{…}`
or `"…"` as ADO does; in a URL, percent-encode it. A server with a
self-signed certificate (a container, a development machine) needs
`trustServerCertificate=true` in the URL, or `TrustServerCertificate=true` in
the ADO string; `encrypt=false` turns TLS off for a server that has none.

```json
"env": {
  "DBML_CONNECTION_SHOP": "mysql://reader@localhost:3306/shop",
  "DBML_CONNECTION_ERP": "sqlserver://reader:secret@localhost:1433/erp?trustServerCertificate=true",
  "DBML_CONNECTION_LEDGER": "Server=localhost;Database=ledger;User Id=reader;Password=secret;TrustServerCertificate=true"
}
```

A MySQL URL may name no database (`mysql://user@host`): `list_databases`
works, `list_schemas` answers an empty list, and `import_schema` and
`compare_with_database` need a `database`. A tool also accepts a raw
connection string of any of these forms as the `connection`. That works, but the URL, password included, is then part of the
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

| Code                        | Meaning                                                                                                                                                                                                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONNECTION_NOT_FOUND`      | No connection has that name, and the value is not a connection string of a supported database. The message lists the known names.                                                                                                                                                |
| `INVALID_CONNECTION_STRING` | The connection string, or the database name given with it, is not usable. A configured value no supported database accepts is reported this way when a tool uses it, and listed as `unknown` by `list_connections`.                                                              |
| `AUTH_FAILED`               | The database refused the user or the password. SQL Server answers a database the login cannot open the same way, so that is reported as `AUTH_FAILED` too.                                                                                                                       |
| `UNREACHABLE`               | The server could not be reached. For SQL Server this is also what a self-signed certificate looks like without `trustServerCertificate=true`.                                                                                                                                    |
| `DATABASE_NOT_FOUND`        | The server has no such database.                                                                                                                                                                                                                                                 |
| `ACCESS_DENIED`             | The user may not read what the call needs.                                                                                                                                                                                                                                       |
| `SCHEMA_NOT_FOUND`          | The named schema has no tables or enums, or does not exist; the message lists those that do.                                                                                                                                                                                     |
| `NO_ROOT`                   | A `path` or `outputPath` was given, but the server has no usable working folder. Pass `text`.                                                                                                                                                                                    |
| `PATH_OUTSIDE_ROOT`         | The path leaves the working folder.                                                                                                                                                                                                                                              |
| `FILE_NOT_FOUND`            | The file does not exist or cannot be read.                                                                                                                                                                                                                                       |
| `FILE_EXISTS`               | The `outputPath` exists; pass `overwrite: true` to replace it.                                                                                                                                                                                                                   |
| `WRITE_FAILED`              | The `outputPath` could not be written: it is a folder, permission is denied, the file system is read-only, or the disk is full.                                                                                                                                                  |
| `INVALID_INPUT`             | Both `text` and `path` were given, or neither.                                                                                                                                                                                                                                   |
| `DBML_PARSE_ERROR`          | The DBML does not parse. Not raised by `validate_dbml`, which reports it as `valid: false`.                                                                                                                                                                                      |
| `SQL_PARSE_ERROR`           | The SQL does not parse in the dialect asked for.                                                                                                                                                                                                                                 |
| `UNKNOWN`                   | Any unexpected failure: in the database, writing a file for a reason not listed above, or a bug in the server. The answer never has details, on purpose. A failure inside the server also writes the error's name and code, never its message, to stderr, which the client logs. |

## Known limitations

- `compare_with_database` ignores type parameters: `varchar(120)` and
  `varchar(200)` compare equal, as do `numeric(10,2)` and `numeric(12,4)`.
  Type names are compared after synonyms are folded (`int4` is `integer`).
- Comparison works within one database kind. A model written in PostgreSQL
  types, compared with a SQL Server database, reports type differences; in
  T-SQL, `timestamp` is rowversion, not a date-time.
- MySQL:
  - Enums compare by their values, because MySQL enums have no names.
  - A non-unique index exactly on a foreign key's columns, when the file does
    not declare it, is not reported: MySQL creates one itself.
  - A foreign key into another database is shown as if it pointed into this
    one.
- SQL Server:
  - `CHECK … IN` enums compare by their set of values.
  - The connector reads a composite `UNIQUE` as one unique per column, so a
    composite unique in the file shows as only in the file.
  - A database the login cannot open is reported as `AUTH_FAILED`, because SQL
    Server answers it as a failed login.
  - A server with a self-signed certificate needs `trustServerCertificate=true`
    in the URL (or `TrustServerCertificate=true` in the ADO string), or it is
    reported as `UNREACHABLE`.
- Snowflake, BigQuery and Oracle databases cannot be connected to.
  `sql_to_dbml` still reads Snowflake and Oracle SQL, and `dbml_to_sql` writes
  Oracle.
- `dbml_to_sql` comes from `@dbml/core` and keeps its behaviour:
  - For a one-to-one reference (`-`) it emits the foreign key in the opposite
    direction: `Ref: b.a_id - a.id` makes `a.id` reference `b.a_id`. Postgres
    rejects that unless `b.a_id` has a unique constraint. Write the reference
    as `>` or `<` to get the foreign key on the intended side.
  - It keeps type names as written in the DBML and does not translate them
    to the target dialect: a column typed `int4` stays `int4` in MySQL
    output.

## License

MIT.
