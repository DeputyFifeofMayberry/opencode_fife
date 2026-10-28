/// <reference types="bun" />
// Starlight's package.json exports do not expose its virtual-module declarations, and its entry
// file only pulls in virtual.d.ts, not the component declarations PageFrame.astro imports, so
// reference the declaration file directly.
/// <reference path="../node_modules/@astrojs/starlight/virtual-internal.d.ts" />
