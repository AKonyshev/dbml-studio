import { PersistableStore } from "./PersitableStore";

import { AppLocalStorage } from "@/storages/local";
import { TableDetailLevel } from "@/types/tableDetailLevel";

class DetailLevelStore extends PersistableStore<TableDetailLevel> {
  private detailLevel: TableDetailLevel = TableDetailLevel.FullDetails;
  private currentStoreKey = "none";

  constructor() {
    super("detailLevel", new AppLocalStorage());
  }

  public getCurrentDetailLevel(): TableDetailLevel {
    return this.detailLevel;
  }

  public saveCurrentState(): void {
    if (this.detailLevel === null) {
      this.persist(this.currentStoreKey, TableDetailLevel.FullDetails);
    } else {
      this.persist(this.currentStoreKey, this.detailLevel);
    }
  }

  /**
   * `fallback` applies only when this document has nothing stored — a reader who
   * has chosen a level for it keeps that choice, however large the schema is.
   */
  public switchTo(
    newStoreKey: string,
    fallback: TableDetailLevel = TableDetailLevel.FullDetails,
  ): void {
    this.currentStoreKey = newStoreKey;
    const recoveredStore = this.retrieve(this.currentStoreKey);
    if (recoveredStore === null) {
      this.detailLevel = fallback;
    }
    // `retrieve` is typed `object`, but what `persist` stored is the level
    // itself, a string.
    for (const val of Object.values(TableDetailLevel)) {
      if (val === (recoveredStore as unknown)) {
        this.detailLevel = val;
      }
    }
  }

  public set(newState: TableDetailLevel): void {
    this.detailLevel = newState;
  }
}

export const detailLevelStore = new DetailLevelStore();
