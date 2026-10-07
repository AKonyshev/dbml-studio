# dbml-frame

The DBML Studio diagram frame and the protocol a host speaks with it, for hosts
that embed the frame outside the DBML Studio repository. Today that is the
Obsidian plugin, `AKonyshev/obsidian-dbml-studio`.

## Layout

- `frame/embed.html` and `frame/assets/…`: the embed page and the chunks it
  loads. Serve the folder as a whole and point an iframe at `embed.html`.
- `frame/manifest.json`: the Vite manifest entries of the embed graph. Its file
  paths are relative to `dist` in `packages/web`; resolve them against `frame/`.
- `BUILD`: the `git describe --match "v*"` of the build the frame came from.
- `protocol/frameHost.js` and `protocol/frameHost.d.ts`: the messages the frame
  and its host exchange, compiled from `packages/web/src/embed/frameHost.ts`
  (CommonJS, with declarations).

## The protocol

```ts
import { FRAME_PROTOCOL, type HostMessage } from "dbml-frame/protocol";
```

`dbml-frame/protocol` also exports `FrameMessage`, `helloMessage`,
`expandMessage`, `parseHostMessage`, `isFromHost` and `postToHost`.

## Version

The version is DBML Studio's. The package is built and released together with
the extension; see `docs/releasing.md` ("dbml-frame") in the repository.

## Building

Build the site first, then the package:

```sh
yarn build:web
yarn workspace dbml-frame build
```

`frame/`, `protocol/`, `BUILD` and `LICENSE` are build output and not committed.
