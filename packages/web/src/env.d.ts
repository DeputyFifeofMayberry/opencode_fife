/// <reference types="bun" />
// Starlight's package.json exports do not expose its virtual-module declarations, and its entry
// file only pulls in virtual.d.ts, not the component declarations PageFrame.astro imports, so
// reference the declaration file directly. The path pins @astrojs/starlight's internal layout
// (verified at 0.34.3); an upgrade that moves the file fails typecheck loudly here instead of
// silently dropping the virtual component declarations.
/// <reference path="../node_modules/@astrojs/starlight/virtual-internal.d.ts" />
