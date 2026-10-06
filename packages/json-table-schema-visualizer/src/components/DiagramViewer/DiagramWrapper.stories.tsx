import { Text } from "react-konva";

import DiagramWrapper from "./DiagramWrapper";

import type { Meta, StoryObj } from "@storybook/react-vite";

import TablesPositionsProvider from "@/providers/TablesPositionsProvider";

const meta: Meta<typeof DiagramWrapper> = {
  component: DiagramWrapper,
  title: "components/DiagramWrapper",
};

export default meta;

type Story = StoryObj<typeof DiagramWrapper>;

export const DiagramWrapperWrapper: Story = {
  render: (props) => <DiagramWrapper {...props} />,
  args: {
    tablesMeta: [],
    refs: [],
    connections: (
      <Text text="Incididunt ad veniam do est nisi eu incididunt eiusmod nulla veniam cillum reprehenderit cupidatat." />
    ),
    tables: null,
  },
  decorators: [
    (Story) => (
      <TablesPositionsProvider tables={[]} refs={[]}>
        <Story />
      </TablesPositionsProvider>
    ),
  ],
};
