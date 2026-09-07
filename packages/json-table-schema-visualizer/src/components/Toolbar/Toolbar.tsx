import PropTypes from "prop-types";
import { type ReactNode } from "react";
import { KeyboardIcon } from "lucide-react";

import AutoArrangeTableButton from "./AutoArrage/AutoArrangeTables";
import InteractionModeToggle from "./InteractionModeToggle/InteractionModeToggle";
import RelationStyleToggle from "./RelationStyleToggle/RelationStyleToggle";
import ThemeToggler from "./ThemeToggler/ThemeToggler";
import DetailLevelToggle from "./DetailLevelToggle/DetailLevelToggle";
import FitToViewButton from "./FitToView/FitToView";
import ExportMenu from "./Export/ExportMenu";
import ShortTableNameSetting from "./ShortTableNameSetting/ShortTableNameSetting";
import EnableAlwaysHover from "./EnableAlwaysHover/EnableAlwaysHover";
import AnimateRelations from "./AnimateRelations/AnimateRelations";
import ResetDetailLevels from "./ResetDetailLevels/ResetDetailLevels";
import ShowAllRelations from "./ShowAllRelations/ShowAllRelations";
import ToolbarButton from "./Button";

import { shortcutKeyFor } from "@/constants/shortcuts";
import { t } from "@/i18n/t";

const Toolbar = ({
  onFitToView,
  onDownloadPng,
  onDownloadSvg,
  onDownloadAdoc,
  onDownloadMarkdown,
  onShowLegend,
  hostActions = null,
}: {
  onFitToView: () => void;
  onDownloadPng: () => void;
  onDownloadSvg: () => void;
  onDownloadAdoc: () => void;
  onDownloadMarkdown: () => void;
  onShowLegend: () => void;
  /**
   * Buttons only one host has. The site puts "download this schema" and "write
   * the layout into the text" here; the extension needs neither, because the
   * schema is a file it already has open and it writes positions back itself.
   *
   * A slot rather than a flag, and beside the export menu rather than anywhere
   * else: what a host adds here is another way of getting the diagram out, and
   * that is the group it belongs to.
   */
  hostActions?: ReactNode;
}) => {
  return (
    // Centred explicitly. It used to be centred by the flex container above it —
    // an absolutely positioned child of a flex parent is placed at the static
    // position `items-center` gives it — which meant the toolbar's alignment
    // depended on a rule about a parent it does not name. Wrapping the diagram
    // in a plain block was enough to stretch it edge to edge.
    //
    // `max-w-full` rather than a viewport width, so a narrow pane clips the
    // toolbar's own box rather than letting it run past the diagram.
    <div className="absolute bottom-14 left-1/2 flex w-max max-w-full -translate-x-1/2 flex-wrap items-center gap-1 rounded-2xl border border-subtle bg-surface-raised/95 px-4 py-1.5 text-sm shadow-xl shadow-black/10 backdrop-blur [&_svg]:h-5 [&_svg]:w-5">
      <AutoArrangeTableButton />
      {/* Beside auto-arrange because both are about where the tables are rather
          than what they look like. */}
      <InteractionModeToggle />
      {/* Beside auto-arrange because it shapes the arrangement, not only the
          look: right angles need corridors and curves do not. */}
      <RelationStyleToggle />
      <DetailLevelToggle />
      {/* Next to the level it undoes, and after it for the reason
          `ShowAllRelations` sits after the settings it undoes. */}
      <ResetDetailLevels />
      <FitToViewButton onClick={onFitToView} />
      <hr className="mx-1.5 my-1 h-6 w-px bg-subtle" />
      <ExportMenu
        onDownloadPng={onDownloadPng}
        onDownloadSvg={onDownloadSvg}
        onDownloadAdoc={onDownloadAdoc}
        onDownloadMarkdown={onDownloadMarkdown}
      />
      {/* Both rules belong to the slot, so a host that adds nothing — or one
          whose action comes and goes, as the frame's does — is not left with
          two dividers against each other. */}
      {hostActions !== null && (
        <>
          <hr className="mx-1.5 my-1 h-6 w-px bg-subtle" />
          {hostActions}
        </>
      )}
      <hr className="mx-1.5 my-1 h-6 w-px bg-subtle" />
      <ShortTableNameSetting />
      <EnableAlwaysHover />
      <AnimateRelations />
      {/* Beside the other relation settings, and last of them because it is
          the one that undoes something rather than sets it. */}
      <ShowAllRelations />
      <hr className="mx-1.5 my-1 h-6 w-px bg-subtle" />
      <ToolbarButton
        label={t("legend.title")}
        shortcutKey={shortcutKeyFor("legend")}
        onClick={onShowLegend}
      >
        <KeyboardIcon />
      </ToolbarButton>
      <ThemeToggler />
    </div>
  );
};

Toolbar.propTypes = {
  onFitToView: PropTypes.func.isRequired,
};

export default Toolbar;
