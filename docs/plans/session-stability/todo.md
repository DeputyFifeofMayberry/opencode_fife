# Session stability tasks

- [x] Reproduce the shared gate blockage across sessions with a blocked pre-execution hook.
- [x] Remove shell authorization waits from the gate without weakening verification ordering.
- [x] Verify inaccessible document paths do not crash either document-link path or the terminal renderer.
- [x] Run focused core and TUI tests and package typechecks; review the diff.
- [x] Add and run a service-isolated HTTP end-to-end regression test.
- [x] Commit task files and integrate into dev (merge 8cbe6e64).
- [x] Install the local build (dev-20261106.134756) at the user's request.

The terminal crash fix was independently committed on dev as 1a8f5b4029.
Coverage now includes cross-session runner coordination, a real shell tool with
a real permission request, and a service-isolated HTTP end-to-end test that
fails on the pre-fix source. The installed build was not exercised interactively.
