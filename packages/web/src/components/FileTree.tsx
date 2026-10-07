import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { t } from "json-table-schema-visualizer/src/i18n/t";

import { type CatalogFile } from "../catalog/catalogManifest";
import {
  buildTree,
  filterTree,
  type CatalogNode,
} from "../catalog/catalogTree";
import { DBML_EXTENSION } from "../document/dbmlFilename";
import {
  documentKeyOf,
  sameDocument,
  type DocumentId,
  type LocalFile,
} from "../session/session";

import FileRow, { ICON_BUTTON_CLASS, ROW_CLASS } from "./FileRow";

import type { JSX } from "react";

export interface FileTreeProps {
  /** What the image was built with. Empty when it was built with nothing. */
  catalogFiles: CatalogFile[];
  localFiles: LocalFile[];
  selected: DocumentId | null;
  /** Paths of project files the reader has their own version of. */
  editedPaths: string[];
  failedPath: string | null;
  onSelect: (id: DocumentId) => void;
  onAddFile: (file: File) => void;
  onDownload: (id: DocumentId) => void;
  onRevert: (path: string) => void;
  onRemove: (id: number) => void;
}

const HEADING_CLASS =
  "flex items-center justify-between gap-1 px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-content-muted/80";

/**
 * The only way into a document, which is why it is always on screen — including
 * on a deployment whose image carries no schemas at all, where it holds nothing
 * but the reader's own files and the invitation to add one.
 *
 * Two sections, and they are not the same kind of thing. "Project" is what the
 * image was built with: the same for everyone who opens this deployment, read
 * only, and back after every restart. "My files" live in this browser and
 * nowhere else. Merging them into one list would be tidier and would quietly
 * lie about which of a reader's schemas survive a cleared cache.
 */
const FileTree = ({
  catalogFiles,
  localFiles,
  selected,
  editedPaths,
  failedPath,
  onSelect,
  onAddFile,
  onDownload,
  onRevert,
  onRemove,
}: FileTreeProps): JSX.Element => {
  const [query, setQuery] = useState("");
  // Collapsed folders rather than expanded ones, so a catalogue opens showing
  // everything: someone who has just deployed this has no idea what is in it.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const tree = useMemo(() => buildTree(catalogFiles), [catalogFiles]);
  const shownTree = useMemo(() => filterTree(tree, query), [tree, query]);

  const needle = query.trim().toLowerCase();
  const shownLocal = useMemo(
    () =>
      needle === ""
        ? localFiles
        : localFiles.filter((file) => file.name.toLowerCase().includes(needle)),
    [localFiles, needle],
  );

  const toggleFolder = (path: string): void => {
    setCollapsed((current) => {
      const next = new Set(current);

      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }

      return next;
    });
  };

  const renderNodes = (nodes: CatalogNode[], depth: number): JSX.Element => (
    <ul className="list-none">
      {nodes.map((node) => {
        if (node.kind === "folder") {
          const open = !collapsed.has(node.path);

          return (
            <li key={`folder:${node.path}`}>
              <div className="px-2">
                <button
                  type="button"
                  aria-expanded={open}
                  style={{ paddingLeft: `${depth * 14 + 8}px` }}
                  className={`${ROW_CLASS} text-content-muted hover:bg-accent/10`}
                  onClick={() => {
                    toggleFolder(node.path);
                  }}
                >
                  <span className="shrink-0 text-content-muted/70">
                    {open ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </span>
                  <span className="shrink-0 text-content-muted/70">
                    {open ? (
                      <FolderOpen className="h-4 w-4" />
                    ) : (
                      <Folder className="h-4 w-4" />
                    )}
                  </span>
                  <span className="truncate">{node.name}</span>
                </button>
              </div>
              {open && renderNodes(node.children, depth + 1)}
            </li>
          );
        }

        const id: DocumentId = { kind: "catalog", path: node.file.path };
        const edited = editedPaths.includes(node.file.path);

        return (
          <li key={documentKeyOf(id)}>
            <FileRow
              label={node.file.title}
              hint={node.file.path}
              icon={<FileText />}
              depth={depth + 1}
              selected={sameDocument(selected, id)}
              edited={edited}
              failed={node.file.path === failedPath}
              actions={[
                {
                  label: t("action.downloadFile"),
                  run: () => {
                    onDownload(id);
                  },
                },
                ...(edited
                  ? [
                      {
                        label: t("files.revert"),
                        run: () => {
                          onRevert(node.file.path);
                        },
                      },
                    ]
                  : []),
              ]}
              onOpen={() => {
                onSelect(id);
              }}
            />
          </li>
        );
      })}
    </ul>
  );

  if (hidden) {
    return (
      <div className="flex h-full w-10 shrink-0 justify-center border-r border-subtle bg-surface-raised py-2">
        <button
          type="button"
          title={t("files.show")}
          aria-label={t("files.show")}
          className={`h-8 ${ICON_BUTTON_CLASS}`}
          onClick={() => {
            setHidden(false);
          }}
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r border-subtle bg-surface-raised">
      <div className="flex shrink-0 items-center gap-1 border-b border-subtle px-3 py-2">
        <input
          type="search"
          value={query}
          placeholder={t("files.filter")}
          aria-label={t("files.filter")}
          className="min-w-0 flex-1 rounded-lg border border-subtle bg-surface px-3 py-1.5 text-sm text-content placeholder:text-content-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
        <button
          type="button"
          title={t("files.hide")}
          aria-label={t("files.hide")}
          className={`shrink-0 ${ICON_BUTTON_CLASS}`}
          onClick={() => {
            setHidden(true);
          }}
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* `min-h-0` so the tree scrolls inside the column rather than pushing the
          filter off the top. */}
      <div className="min-h-0 flex-1 overflow-auto pb-2">
        {needle !== "" && shownTree.length === 0 && shownLocal.length === 0 && (
          // Otherwise a filter that matches nothing looks exactly like a
          // deployment that has nothing — two very different things to be
          // looking at.
          <p className="px-4 py-2 text-xs text-content-muted">
            {t("files.noMatches")}
          </p>
        )}
        {catalogFiles.length > 0 && (
          <>
            <div className={HEADING_CLASS}>{t("files.project")}</div>
            {renderNodes(shownTree, 0)}
          </>
        )}

        <div className={HEADING_CLASS}>
          <span>{t("files.mine")}</span>
          <button
            type="button"
            title={t("files.add")}
            aria-label={t("files.add")}
            className={ICON_BUTTON_CLASS}
            onClick={() => {
              inputRef.current?.click();
            }}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          // A filter, not a gate — every desktop picker lets the reader switch
          // to "all files". It exists so the common case shows the right files
          // first.
          accept={DBML_EXTENSION}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file !== undefined) {
              onAddFile(file);
            }

            // Cleared so that choosing the same file twice fires `change`
            // again: opening a file, editing it, and opening it once more to
            // discard the edits does nothing otherwise.
            event.target.value = "";
          }}
        />

        {localFiles.length === 0 ? (
          <p className="px-4 py-1 text-xs leading-relaxed text-content-muted">
            {t("files.empty")}
          </p>
        ) : (
          <ul className="list-none">
            {shownLocal.map((file) => {
              const id: DocumentId = { kind: "local", id: file.id };

              return (
                <li key={documentKeyOf(id)}>
                  <FileRow
                    label={file.name}
                    icon={<FileText />}
                    depth={0}
                    selected={sameDocument(selected, id)}
                    // A local file is its own text: there is no other version
                    // of it to differ from.
                    edited={false}
                    failed={false}
                    actions={[
                      {
                        label: t("action.downloadFile"),
                        run: () => {
                          onDownload(id);
                        },
                      },
                      {
                        label: t("files.remove"),
                        run: () => {
                          onRemove(file.id);
                        },
                      },
                    ]}
                    onOpen={() => {
                      onSelect(id);
                    }}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default FileTree;
