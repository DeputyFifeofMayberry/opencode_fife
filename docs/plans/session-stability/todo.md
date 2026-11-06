# Session stability tasks

- [x] Reproduce the shared gate blockage across sessions with a blocked pre-execution hook.
- [x] Remove shell authorization waits from the gate without weakening verification ordering.
- [x] Verify inaccessible document paths do not crash either document-link path or the terminal renderer.
- [x] Run focused core and TUI tests and package typechecks; review the diff.
- [ ] Run the service-isolated end-to-end reproduction after an explicit local update request.
- [x] Commit task files and integrate into dev (merge 8cbe6e64).

The terminal crash fix was independently committed on dev as 1a8f5b4029. The
isolated tests cover cross-session runner coordination and a real shell tool
with a real permission request separately; a running-service end-to-end
reproduction remains outstanding.
