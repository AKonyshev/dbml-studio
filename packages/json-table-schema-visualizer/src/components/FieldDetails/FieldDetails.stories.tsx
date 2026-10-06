import FieldDetails from "./FieldDetails";

import type { Meta, StoryObj } from "@storybook/react-vite";

import { exampleData } from "@/fake/fakeJsonTables";
import MainProviders from "@/providers/MainProviders";

const meta: Meta = {
  component: FieldDetails,
  title: "components/FieldDetails",
};

export default meta;

type Story = StoryObj<typeof FieldDetails>;

export const FieldDetailsStory: Story = {
  render: (props) => (
    <MainProviders
      refs={exampleData.refs}
      tables={exampleData.tables}
      enums={exampleData.enums}
    >
      <FieldDetails {...props} />
    </MainProviders>
  ),
  args: {
    enumName: "status",
    note: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua",
  },
  parameters: {
    withKonvaWrapper: true,
  },
};
