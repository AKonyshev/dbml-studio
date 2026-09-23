import { t } from "json-table-schema-visualizer/src/i18n/t";

/**
 * Everything that can go wrong between a page's `dbml::` block and a drawn
 * diagram.
 *
 * One type for the whole frame rather than one per module: the reader sees a
 * single message wherever the trouble started, and the author reading it is
 * looking at their own macro either way.
 */
export type EmbedError =
  | { kind: "srcMissing" }
  | { kind: "srcInvalid"; value: string }
  | { kind: "modelOffOrigin"; value: string }
  | { kind: "sourceConflict" }
  | { kind: "notFound"; src: string }
  | { kind: "tableMissing"; name: string }
  | { kind: "tableAmbiguous"; name: string }
  | { kind: "noTablesLeft" };

/**
 * What the reader is shown when the frame cannot draw.
 *
 * The offending name is appended rather than interpolated: `t` takes a key and
 * nothing else, and the author scanning a page full of frames needs to see
 * which one of their names is the wrong one.
 */
export const embedErrorText = (error: EmbedError): string => {
  switch (error.kind) {
    case "srcMissing":
      return t("embed.srcMissing");
    case "srcInvalid":
      return `${t("embed.srcInvalid")}: ${error.value}`;
    case "modelOffOrigin":
      return `${t("embed.modelOffOrigin")}: ${error.value}`;
    case "sourceConflict":
      return t("embed.sourceConflict");
    case "notFound":
      return `${t("embed.notFound")}: ${error.src}`;
    case "tableMissing":
      return `${t("embed.tableMissing")}: ${error.name}`;
    case "tableAmbiguous":
      return `${t("embed.tableAmbiguous")}: ${error.name}`;
    case "noTablesLeft":
      return t("embed.noTablesLeft");
  }
};
