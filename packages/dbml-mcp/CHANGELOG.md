# Changelog

The dbml-mcp package's history. Its version is its own; the format is
[Keep a Changelog](http://keepachangelog.com/).

## [Unreleased]

### Added

- MySQL / MariaDB and SQL Server, next to PostgreSQL: `mysql://`, `mariadb://`, `sqlserver://`, `mssql://` and SQL Server connection strings (`Server=…;Database=…;User Id=…;Password=…`), in `DBML_CONNECTION_<NAME>` or as `connection`.
- `compare_with_database` picks the database's own default schema when `schema` is left out.

### Changed

- `list_connections` returns `{ name, database }` per connection instead of a bare name, so an agent knows which SQL dialect each one speaks.
- `compare_with_database` compares by the rules of the database it reads, and the structured `unique` flag on database-only indexes is now accurate (it was always `false`).
- `import_schema` writes a database's default schema without a prefix: `public` for PostgreSQL, the database for MySQL, `dbo` for SQL Server.

## [0.1.0] - 2026-10-08

First release: `list_connections`, `list_databases`, `list_schemas`,
`import_schema`, `compare_with_database`, `validate_dbml`, `dbml_to_sql`,
`sql_to_dbml`, over stdio.
