-- examples/library.dbml as SQL Server DDL, for the live suites (docs/testing.md).
-- Generated with @dbml/core's exporter (`exporter.export(dbml, "mssql")`), then
-- three things were fixed by hand: the exporter writes `timestamp` for the two
-- reservation times, which in T-SQL is `rowversion` and takes no value (they are
-- `datetime2`); it quotes the columns of the one composite index with `"`, which
-- `sqlcmd` refuses (they are bracketed); and it reverses the last foreign key:
-- the one-to-one `reservation.fulfilled_by_loan_id - loan.id` makes the
-- reservation hold the key.
-- Run it inside a database named `library`; `GO` separates the batches.

CREATE TABLE [branch] (
  [id] integer PRIMARY KEY,
  [name] varchar(120) NOT NULL,
  [address] varchar(200) NOT NULL,
  [opened_on] date NOT NULL,
  [closed_on] date
)
GO

CREATE TABLE [member] (
  [id] integer PRIMARY KEY,
  [membership_no] varchar(16) UNIQUE NOT NULL,
  [display_name] varchar(120) NOT NULL,
  [email] varchar(200) UNIQUE,
  [home_branch_id] integer NOT NULL,
  [status] nvarchar(255) CHECK ([status] IN ('active', 'lapsed', 'suspended')) NOT NULL DEFAULT 'active',
  [joined_on] date NOT NULL
)
GO

CREATE TABLE [author] (
  [id] integer PRIMARY KEY,
  [name] varchar(160) NOT NULL,
  [born_in] integer,
  [died_in] integer
)
GO

CREATE TABLE [book] (
  [id] integer PRIMARY KEY,
  [isbn] varchar(17) UNIQUE,
  [title] varchar(300) NOT NULL,
  [author_id] integer NOT NULL,
  [published_in] integer,
  [language] varchar(8) NOT NULL DEFAULT 'en'
)
GO

CREATE TABLE [copy] (
  [id] integer PRIMARY KEY,
  [book_id] integer NOT NULL,
  [branch_id] integer NOT NULL,
  [shelf_code] varchar(24) NOT NULL,
  [condition] nvarchar(255) CHECK ([condition] IN ('new', 'good', 'worn', 'withdrawn')) NOT NULL DEFAULT 'good',
  [acquired_on] date NOT NULL
)
GO

CREATE TABLE [loan] (
  [id] integer PRIMARY KEY,
  [copy_id] integer NOT NULL,
  [member_id] integer NOT NULL,
  [taken_on] date NOT NULL,
  [due_on] date NOT NULL,
  [returned_on] date
)
GO

CREATE TABLE [reservation] (
  [id] integer PRIMARY KEY,
  [book_id] integer NOT NULL,
  [member_id] integer NOT NULL,
  [placed_at] datetime2 NOT NULL,
  [expires_at] datetime2 NOT NULL,
  [fulfilled_by_loan_id] integer
)
GO

CREATE UNIQUE INDEX [copy_index_0] ON [copy] ([branch_id], [shelf_code])
GO

EXEC sp_addextendedproperty
@name = N'Table_Description',
@value = 'A physical library building.',
@level0type = N'Schema', @level0name = 'dbo',
@level1type = N'Table',  @level1name = 'branch';
GO

EXEC sp_addextendedproperty
@name = N'Table_Description',
@value = 'Someone who may borrow. Email is optional: a card can be issued at a desk.',
@level0type = N'Schema', @level0name = 'dbo',
@level1type = N'Table',  @level1name = 'member';
GO

EXEC sp_addextendedproperty
@name = N'Table_Description',
@value = 'A work. What sits on a shelf is a copy of one.',
@level0type = N'Schema', @level0name = 'dbo',
@level1type = N'Table',  @level1name = 'book';
GO

EXEC sp_addextendedproperty
@name = N'Table_Description',
@value = 'One copy, out with one member, for a while.',
@level0type = N'Schema', @level0name = 'dbo',
@level1type = N'Table',  @level1name = 'loan';
GO

ALTER TABLE [member] ADD FOREIGN KEY ([home_branch_id]) REFERENCES [branch] ([id])
GO

ALTER TABLE [book] ADD FOREIGN KEY ([author_id]) REFERENCES [author] ([id])
GO

ALTER TABLE [copy] ADD FOREIGN KEY ([book_id]) REFERENCES [book] ([id])
GO

ALTER TABLE [copy] ADD FOREIGN KEY ([branch_id]) REFERENCES [branch] ([id])
GO

ALTER TABLE [loan] ADD FOREIGN KEY ([copy_id]) REFERENCES [copy] ([id])
GO

ALTER TABLE [loan] ADD FOREIGN KEY ([member_id]) REFERENCES [member] ([id])
GO

ALTER TABLE [reservation] ADD FOREIGN KEY ([book_id]) REFERENCES [book] ([id])
GO

ALTER TABLE [reservation] ADD FOREIGN KEY ([member_id]) REFERENCES [member] ([id])
GO

ALTER TABLE [reservation] ADD FOREIGN KEY ([fulfilled_by_loan_id]) REFERENCES [loan] ([id])
GO

