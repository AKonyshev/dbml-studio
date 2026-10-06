import { type CatalogFile } from "./catalogManifest";

/**
 * The catalogue as something to draw, built from the flat list the manifest
 * carries.
 *
 * Built here rather than shipped nested, so the manifest stays a list of paths:
 * nesting it would move this work into the shell script, where it could not be
 * tested the way these functions are.
 */
export interface CatalogFolderNode {
  kind: "folder";
  /** The segment itself: `eu` for `billing/eu`. */
  name: string;
  /** The whole path down to it, which is what the tree keys and toggles on. */
  path: string;
  children: CatalogNode[];
}

export interface CatalogFileNode {
  kind: "file";
  name: string;
  file: CatalogFile;
}

export type CatalogNode = CatalogFolderNode | CatalogFileNode;

/**
 * The last segment of a catalogue path. The separator is always `/`: these
 * paths come from a URL and from a manifest built on Linux, never from a
 * Windows filesystem.
 */
export const fileNameOf = (path: string): string => {
  const cut = path.lastIndexOf("/");

  return cut === -1 ? path : path.slice(cut + 1);
};

// Folders first, then files, each group alphabetical — the order every file
// browser has trained everyone to expect, and the reason the manifest's own
// order (plain alphabetical over whole paths) is not simply reused.
const sortNodes = (nodes: CatalogNode[]): CatalogNode[] =>
  [...nodes].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "folder" ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });

interface FolderBuilder {
  path: string;
  folders: Map<string, FolderBuilder>;
  files: CatalogFileNode[];
}

const emptyBuilder = (path: string): FolderBuilder => ({
  path,
  folders: new Map(),
  files: [],
});

// The builder's mutable maps as the immutable, ordered nodes a reader sees.
const toNodes = (builder: FolderBuilder): CatalogNode[] =>
  sortNodes([
    ...[...builder.folders.values()].map((child): CatalogFolderNode => ({
      kind: "folder",
      name: fileNameOf(child.path),
      path: child.path,
      children: toNodes(child),
    })),
    ...builder.files,
  ]);

export const buildTree = (files: CatalogFile[]): CatalogNode[] => {
  const root = emptyBuilder("");

  for (const file of files) {
    const segments = file.path.split("/");
    const name = segments.pop() ?? file.path;

    let folder = root;
    for (const segment of segments) {
      const path = folder.path === "" ? segment : `${folder.path}/${segment}`;
      const existing = folder.folders.get(segment);

      if (existing === undefined) {
        const created = emptyBuilder(path);
        folder.folders.set(segment, created);
        folder = created;
      } else {
        folder = existing;
      }
    }

    folder.files.push({ kind: "file", name, file });
  }

  return toNodes(root);
};

const matches = (node: CatalogFileNode, needle: string): boolean =>
  node.file.title.toLowerCase().includes(needle) ||
  node.file.path.toLowerCase().includes(needle);

/**
 * The tree with only what the reader is looking for left in it.
 *
 * A folder survives because something under it did, never on its own name:
 * matching a folder would show everything inside it, which is the opposite of
 * what someone narrowing a list of two hundred files is asking for.
 */
export const filterTree = (
  nodes: CatalogNode[],
  query: string,
): CatalogNode[] => {
  const needle = query.trim().toLowerCase();

  if (needle === "") {
    return nodes;
  }

  return nodes.flatMap((node): CatalogNode[] => {
    if (node.kind === "file") {
      return matches(node, needle) ? [node] : [];
    }

    const children = filterTree(node.children, needle);

    return children.length === 0 ? [] : [{ ...node, children }];
  });
};
