-- examples/library.dbml as MySQL DDL, for the live suites (docs/testing.md).
-- Generated with @dbml/core's exporter (`exporter.export(dbml, "mysql")`); the
-- last foreign key was reversed by the exporter and is written by hand: the
-- one-to-one `reservation.fulfilled_by_loan_id - loan.id` makes the reservation
-- hold the key.

CREATE TABLE `branch` (
  `id` integer PRIMARY KEY,
  `name` varchar(120) NOT NULL,
  `address` varchar(200) NOT NULL,
  `opened_on` date NOT NULL,
  `closed_on` date
);

CREATE TABLE `member` (
  `id` integer PRIMARY KEY,
  `membership_no` varchar(16) UNIQUE NOT NULL,
  `display_name` varchar(120) NOT NULL,
  `email` varchar(200) UNIQUE,
  `home_branch_id` integer NOT NULL,
  `status` ENUM ('active', 'lapsed', 'suspended') NOT NULL DEFAULT 'active',
  `joined_on` date NOT NULL
);

CREATE TABLE `author` (
  `id` integer PRIMARY KEY,
  `name` varchar(160) NOT NULL,
  `born_in` integer,
  `died_in` integer
);

CREATE TABLE `book` (
  `id` integer PRIMARY KEY,
  `isbn` varchar(17) UNIQUE,
  `title` varchar(300) NOT NULL,
  `author_id` integer NOT NULL,
  `published_in` integer,
  `language` varchar(8) NOT NULL DEFAULT 'en'
);

CREATE TABLE `copy` (
  `id` integer PRIMARY KEY,
  `book_id` integer NOT NULL,
  `branch_id` integer NOT NULL,
  `shelf_code` varchar(24) NOT NULL,
  `condition` ENUM ('new', 'good', 'worn', 'withdrawn') NOT NULL DEFAULT 'good',
  `acquired_on` date NOT NULL
);

CREATE TABLE `loan` (
  `id` integer PRIMARY KEY,
  `copy_id` integer NOT NULL,
  `member_id` integer NOT NULL,
  `taken_on` date NOT NULL,
  `due_on` date NOT NULL,
  `returned_on` date
);

CREATE TABLE `reservation` (
  `id` integer PRIMARY KEY,
  `book_id` integer NOT NULL,
  `member_id` integer NOT NULL,
  `placed_at` timestamp NOT NULL,
  `expires_at` timestamp NOT NULL,
  `fulfilled_by_loan_id` integer
);

CREATE UNIQUE INDEX `copy_index_0` ON `copy` (`branch_id`, `shelf_code`);

ALTER TABLE `branch` COMMENT = 'A physical library building.';

ALTER TABLE `member` COMMENT = 'Someone who may borrow. Email is optional: a card can be issued at a desk.';

ALTER TABLE `book` COMMENT = 'A work. What sits on a shelf is a copy of one.';

ALTER TABLE `loan` COMMENT = 'One copy, out with one member, for a while.';

ALTER TABLE `member` ADD FOREIGN KEY (`home_branch_id`) REFERENCES `branch` (`id`);

ALTER TABLE `book` ADD FOREIGN KEY (`author_id`) REFERENCES `author` (`id`);

ALTER TABLE `copy` ADD FOREIGN KEY (`book_id`) REFERENCES `book` (`id`);

ALTER TABLE `copy` ADD FOREIGN KEY (`branch_id`) REFERENCES `branch` (`id`);

ALTER TABLE `loan` ADD FOREIGN KEY (`copy_id`) REFERENCES `copy` (`id`);

ALTER TABLE `loan` ADD FOREIGN KEY (`member_id`) REFERENCES `member` (`id`);

ALTER TABLE `reservation` ADD FOREIGN KEY (`book_id`) REFERENCES `book` (`id`);

ALTER TABLE `reservation` ADD FOREIGN KEY (`member_id`) REFERENCES `member` (`id`);

ALTER TABLE `reservation` ADD FOREIGN KEY (`fulfilled_by_loan_id`) REFERENCES `loan` (`id`);

