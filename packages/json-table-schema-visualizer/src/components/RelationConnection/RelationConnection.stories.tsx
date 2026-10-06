import Table from "../Table";

import RelationConnection from "./RelationConnection";

import type { Meta, StoryObj } from "@storybook/react-vite";

import { exampleData } from "@/fake/fakeJsonTables";
import MainProviders from "@/providers/MainProviders";
import TablesPositionsProvider from "@/providers/TablesPositionsProvider";

const meta: Meta = {
  component: RelationConnection,
  title: "components/RelationConnection",
};

export default meta;

type Story = StoryObj<typeof RelationConnection>;

const exampleColumns = exampleData.tables.reduce(
  (total, table) => total + table.fields.length,
  0,
);

export const RelationConnectionStory: Story = {
  render: (props) => (
    <TablesPositionsProvider
      tables={exampleData.tables}
      refs={exampleData.refs}
    >
      <MainProviders
        refs={exampleData.refs}
        enums={exampleData.enums}
        tables={exampleData.tables}
      >
        <RelationConnection {...props} />

        {/* The example schema is small, so its rows are drawn at any zoom —
            which is what the story wants to show. */}
        <Table {...exampleData.tables[0]} schemaColumns={exampleColumns} />

        <Table {...exampleData.tables[1]} schemaColumns={exampleColumns} />

        <Table {...exampleData.tables[2]} schemaColumns={exampleColumns} />
      </MainProviders>
    </TablesPositionsProvider>
  ),
  args: {
    source: exampleData.refs[0].endpoints[0],
    target: exampleData.refs[0].endpoints[1],
  },
  parameters: {
    withKonvaWrapper: true,
  },
};
