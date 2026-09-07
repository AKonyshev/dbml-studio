import { type ReactNode } from "react";

import { BADGE, FONT_SIZES } from "@/constants/sizing";
import { t } from "@/i18n/t";
import { type MessageKey } from "@/i18n/messages";
import { MANDATORY_MARK, type FieldBadge } from "@/utils/fieldMarks";

/**
 * A pill, in the shape the canvas draws one.
 *
 * The size and the corner come from the same constants the canvas draws with,
 * through `style` rather than Tailwind classes: a class list can only hold
 * literals, and `text-[10px] rounded-[3px]` was those two numbers written out a
 * second time, free to drift from the badges it is supposed to explain.
 */
const Badge = ({ name }: { name: FieldBadge }) => (
  <span
    className="bg-accent/15 px-1 py-0.5 font-bold text-accent"
    style={{ fontSize: FONT_SIZES.badge, borderRadius: BADGE.radius }}
  >
    {name}
  </span>
);

/** A column line as it appears in a table, for the row to point at. */
const Line = ({ type, mark }: { type: string; mark?: boolean }) => (
  <span className="font-mono text-content-muted">
    {type}
    {mark === true ? ` ${MANDATORY_MARK}` : ""}
  </span>
);

/** The two-dot glyph in a table's header, in the proportions it is drawn in. */
const RelationsGlyph = () => (
  <svg width="22" height="10" viewBox="0 0 22 10" aria-hidden="true">
    <line
      x1="6"
      y1="5"
      x2="16"
      y2="5"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <circle cx="6" cy="5" r="2.5" fill="currentColor" />
    <circle cx="16" cy="5" r="2.5" fill="currentColor" />
  </svg>
);

/** The disc that sits on a relation and faces its target. */
const RelationEndGlyph = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <circle cx="9" cy="9" r="8" fill="currentColor" />
    <path d="M6.5 5 L13 9 L6.5 13 Z" fill="var(--surface-raised)" />
  </svg>
);

/** The rectangle a drag draws over the canvas in select mode. */
const MarqueeGlyph = () => (
  <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true">
    <rect
      x="1"
      y="1"
      width="20"
      height="14"
      rx="2"
      fill="currentColor"
      fillOpacity="0.15"
      stroke="currentColor"
      strokeWidth="1"
      strokeDasharray="3 2"
    />
  </svg>
);

/** The pointer gesture that changes one table's detail level. */
const DoubleClickGlyph = () => (
  <span className="font-mono text-content-muted">
    {t("gesture.doubleClick")}
  </span>
);

interface NotationRow {
  id: string;
  labelKey: MessageKey;
  sample: ReactNode;
}

/**
 * What the marks on the diagram mean.
 *
 * Here rather than in a registry beside `SHORTCUTS`: that one exists because
 * the key handler and the legend have to agree on what fires, and nothing but
 * this list reads these rows. A sample is markup besides, which a constants
 * module could not hold.
 *
 * `*` for a mandatory column and no mark for an optional one is Barker's
 * notation less its `o`; the key badges are the set Mermaid's ER diagrams use.
 * See `fieldMarks`.
 */
const NOTATION: NotationRow[] = [
  { id: "pk", labelKey: "notation.primaryKey", sample: <Badge name="PK" /> },
  { id: "fk", labelKey: "notation.foreignKey", sample: <Badge name="FK" /> },
  { id: "uk", labelKey: "notation.uniqueKey", sample: <Badge name="UK" /> },
  {
    id: "mandatory",
    labelKey: "notation.mandatory",
    sample: <Line type="uuid" mark />,
  },
  {
    id: "nullable",
    labelKey: "notation.nullable",
    sample: <Line type="uuid" />,
  },
  {
    id: "tableDetailLevel",
    labelKey: "notation.tableDetailLevel",
    sample: <DoubleClickGlyph />,
  },
  {
    id: "tableColor",
    labelKey: "notation.tableColor",
    sample: (
      <>
        <span className="h-2.5 w-4 rounded-sm bg-[#3B82F6]" />
        <span className="h-2.5 w-4 rounded-sm bg-[#F59E0B]" />
      </>
    ),
  },
  {
    id: "toggleRelations",
    labelKey: "notation.toggleRelations",
    sample: (
      <span className="text-content-muted">
        <RelationsGlyph />
      </span>
    ),
  },
  {
    id: "relationEnd",
    labelKey: "notation.relationEnd",
    sample: (
      <span className="text-accent">
        <RelationEndGlyph />
      </span>
    ),
  },
  {
    id: "marquee",
    labelKey: "notation.marquee",
    sample: (
      <span className="text-accent">
        <MarqueeGlyph />
      </span>
    ),
  },
];

const Notation = () => (
  <ul className="flex flex-col gap-2">
    {NOTATION.map((row) => (
      <li
        key={row.id}
        className="flex items-center justify-between gap-6 text-xs text-content"
      >
        <span>{t(row.labelKey)}</span>
        <span className="flex shrink-0 items-center gap-1">{row.sample}</span>
      </li>
    ))}
  </ul>
);

export default Notation;
