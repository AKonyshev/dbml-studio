/**
 * The diagram frame `main.js` carries, put in by `scripts/build-plugin.mjs`
 * with esbuild's `define`: the text is replaced at build time, so neither name
 * exists at run time as a variable. In tests `jest.config.js` gives them as
 * globals.
 */

/** `frame/BUILD` exactly as `scripts/vendor-frame.mjs` wrote it. */
declare const DBML_FRAME_BUILD: string;

/** `frame/embed.html`, gzipped, as base64. */
declare const DBML_FRAME_GZIP: string;
