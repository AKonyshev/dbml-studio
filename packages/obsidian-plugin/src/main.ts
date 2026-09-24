import { Plugin } from "obsidian";

import { withTheme } from "./frameSrc";
import { frameUrl } from "./frameUrl";

const PROBE_HEIGHT = "500";

export default class DbmlStudioPlugin extends Plugin {
  onload(): void {
    this.registerMarkdownCodeBlockProcessor("dbml", (_source, element) => {
      const frame = element.createEl("iframe");

      // Before `src`: the frame may speak the moment it loads. A probe only —
      // one listener per render, released when the plugin is.
      this.registerDomEvent(window, "message", (event: MessageEvent) => {
        if (event.source === frame.contentWindow) {
          console.log("dbml-studio probe: the frame said", event.data);
        }
      });

      frame.src = withTheme(frameUrl(this, "frame/embed.html"), "light");
      frame.width = "100%";
      frame.height = PROBE_HEIGHT;
      frame.style.border = "0";
    });
  }
}
