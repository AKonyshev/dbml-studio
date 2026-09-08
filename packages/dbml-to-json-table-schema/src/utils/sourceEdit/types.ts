/** A half-open range of characters in the document, by offset. */
export interface SourceRange {
  start: number;
  end: number;
}

export interface FieldLocation {
  name: string;
  range: SourceRange;
  /** Leading whitespace of the field's first line, reused for inserted lines. */
  indent: string;
  isMultiline: boolean;
}

export interface TableLocation {
  /** Schema-qualified, exactly as the diagram names the table. */
  fullName: string;
  /** The identifier as written in the header, without schema or alias. */
  declaredName: string;
  schemaName: string | null;
  alias: string | null;
  nameRange: SourceRange;
  fields: FieldLocation[];
  /** Where this table's name appears inside standalone refs that use it. */
  refNameRanges: SourceRange[];
  /** Where this table's name appears inside the metainfo block. */
  metaInfoNameRanges: SourceRange[];
}

export interface SourceIndex {
  tables: TableLocation[];
}

/** One replacement to make in the document. */
export interface TextEdit {
  start: number;
  end: number;
  text: string;
}

/** The shape `@dbml/core` gives every element it parses. */
export interface ParserToken {
  start: { offset: number; line: number; column: number };
  end: { offset: number; line: number; column: number };
}
