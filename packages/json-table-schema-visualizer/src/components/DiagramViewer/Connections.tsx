import { useEffect, useState } from "react";
import { type JSONTableRef } from "shared/types/tableSchema";

import RelationConnection from "../RelationConnection/RelationConnection";

import {
  RELATIONS_TOGGLE_EVENT,
  tableRelationsVisibilityStore,
} from "@/stores/tableRelationsVisibilityStore";
import eventEmitter from "@/events-emitter";

interface RelationsConnectionsProps {
  refs: JSONTableRef[];
  documentKey?: string;
}

const RelationsConnections = ({
  refs,
  documentKey,
}: RelationsConnectionsProps) => {
  const [hiddenTables, setHiddenTables] = useState<Set<string>>(new Set());
  const [, setForceUpdate] = useState(0);

  useEffect(() => {
    if (documentKey != null && documentKey !== "") {
      tableRelationsVisibilityStore.switchTo(documentKey);
    }
    updateHiddenTables();
  }, [documentKey, refs]);

  useEffect(() => {
    const handleRelationsToggle = () => {
      updateHiddenTables();
      setForceUpdate((n) => n + 1);
    };
    eventEmitter.on(RELATIONS_TOGGLE_EVENT, handleRelationsToggle);
    return () => {
      eventEmitter.off(RELATIONS_TOGGLE_EVENT, handleRelationsToggle);
    };
  }, [refs, documentKey]);

  const updateHiddenTables = () => {
    const hidden = new Set<string>();
    refs.forEach((ref) => {
      if (
        tableRelationsVisibilityStore.areTableRelationsHidden(
          ref.endpoints[0].tableName,
        )
      ) {
        hidden.add(ref.endpoints[0].tableName);
      }
      if (
        tableRelationsVisibilityStore.areTableRelationsHidden(
          ref.endpoints[1].tableName,
        )
      ) {
        hidden.add(ref.endpoints[1].tableName);
      }
    });
    setHiddenTables(hidden);
  };

  return refs.map((ref) => {
    const source = ref.endpoints[0];
    const target = ref.endpoints[1];

    if (
      hiddenTables.has(source.tableName) ||
      hiddenTables.has(target.tableName)
    ) {
      return null;
    }

    const key = `${source.tableName}-${source.fieldNames[0]}-${target.tableName}-${target.fieldNames[0]}`;

    return <RelationConnection key={key} source={source} target={target} />;
  });
};

export default RelationsConnections;
