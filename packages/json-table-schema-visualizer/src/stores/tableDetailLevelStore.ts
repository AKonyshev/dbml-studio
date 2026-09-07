import { detailLevelStore } from "./detailLevelStore";
import { PersistableStore } from "./PersitableStore";

import { TableDetailLevel } from "@/types/tableDetailLevel";
import { levelAfter } from "@/utils/levelAfter";

type Listener = () => void;

const isDetailLevel = (value: unknown): value is TableDetailLevel =>
  typeof value === "string" &&
  (Object.values(TableDetailLevel) as string[]).includes(value);

/**
 * The tables a reader has set apart from the diagram's own detail level.
 *
 * An absent entry is not a third state: it means the table follows the global
 * level, which is why clearing an override deletes the entry rather than
 * writing a value standing for "as everything else".
 *
 * Announced through its own listeners rather than the shared `eventEmitter`,
 * for the reason `selectionStore` gives: a table subscribes to its own slice
 * and re-renders only when its own answer changes.
 */
class TableDetailLevelStore extends PersistableStore<
  Record<string, TableDetailLevel>
> {
  private readonly overridesByKey = new Map<
    string,
    Map<string, TableDetailLevel>
  >();

  private activeKey: string | null = null;
  private version = 0;
  private readonly listeners = new Set<Listener>();

  constructor() {
    super("tableDetailLevel");
  }

  public readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * A number that changes whenever anything here does.
   *
   * For readers measuring many tables at once, which have no single slice to
   * compare: `useSyncExternalStore` compares snapshots by identity, and a map
   * rebuilt on every call would be an infinite render.
   */
  public readonly getVersion = (): number => this.version;

  public readonly levelFor = (tableName: string): TableDetailLevel | null =>
    this.current().get(tableName) ?? null;

  public switchTo(storeKey: string): void {
    this.activeKey = storeKey;

    const saved = this.retrieve(storeKey) as Record<string, unknown> | null;
    const recovered = new Map<string, TableDetailLevel>();
    if (saved != null) {
      for (const [tableName, level] of Object.entries(saved)) {
        // Storage is not typed and an old build may have written a level this
        // one has never heard of. An entry that is not a level is dropped
        // rather than drawn.
        if (isDetailLevel(level)) {
          recovered.set(tableName, level);
        }
      }
    }

    this.overridesByKey.set(storeKey, recovered);
    this.announce();
  }

  /** The next level after the one this table is currently drawn at. */
  public cycle(tableName: string): void {
    if (tableName === "") {
      return;
    }

    const from =
      this.levelFor(tableName) ?? detailLevelStore.getCurrentDetailLevel();

    this.current().set(tableName, levelAfter(from));
    this.persistCurrent();
    this.announce();
  }

  /**
   * Back to one level for the whole diagram, and whether that changed anything.
   *
   * The caller uses the answer to decide about announcing, the way
   * `showAllTableRelations` does: a reset over a diagram with nothing set apart
   * should not make every table resync.
   */
  public resetAll(): boolean {
    const overrides = this.current();
    if (overrides.size === 0) {
      return false;
    }

    overrides.clear();
    // Removed rather than written as an empty record: nothing set apart is the
    // same state as a document never opened, and it should leave storage
    // looking that way too.
    this.clear(this.activeKey ?? "default");
    this.announce();
    return true;
  }

  public hasOverrides(): boolean {
    return this.current().size > 0;
  }

  private current(): Map<string, TableDetailLevel> {
    const key = this.activeKey ?? "default";
    let overrides = this.overridesByKey.get(key);
    if (overrides == null) {
      overrides = new Map<string, TableDetailLevel>();
      this.overridesByKey.set(key, overrides);
    }

    return overrides;
  }

  private persistCurrent(): void {
    this.persist(
      this.activeKey ?? "default",
      Object.fromEntries(this.current()),
    );
  }

  private announce(): void {
    this.version += 1;
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const tableDetailLevelStore = new TableDetailLevelStore();
