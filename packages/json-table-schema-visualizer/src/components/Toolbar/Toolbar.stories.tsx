import { type Meta, type StoryObj } from "@storybook/react-vite";

import Toolbar from "./Toolbar";

import TablesPositionsProvider from "@/providers/TablesPositionsProvider";

const meta: Meta<typeof Toolbar> = {
  component: Toolbar,
  title: "components/Toolbar",
};

export default meta;

type Story = StoryObj<typeof Toolbar>;

const noop = (): void => undefined;

export const ToolbarStory: Story = {
  args: {
    onFitToView: noop,
    onDownloadPng: noop,
    onDownloadSvg: noop,
    onDownloadAdoc: noop,
    onDownloadMarkdown: noop,
    onShowLegend: noop,
  },
  render: (props) => <Toolbar {...props} />,
  decorators: [
    (Story) => (
      <div className="py-32">
        <TablesPositionsProvider tables={[]} refs={[]}>
          <Story />
        </TablesPositionsProvider>
      </div>
    ),
  ],
};
