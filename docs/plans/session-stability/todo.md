# Session stability tasks

- [x] Reproduce the shared gate blockage across sessions with a blocked pre-execution hook.
- [x] Remove shell authorization waits from the gate without weakening verification ordering.
- [x] Verify inaccessible document paths do not crash either document-link path or the terminal renderer.
- [ ] Run focused checks and isolated end-to-end verification; review the diff.
- [ ] Commit task files and integrate only when dev is idle and clean.

The terminal crash fix was independently committed on dev as 1a8f5b4029. The
isolated tests cover cross-session runner coordination and a real shell tool
with a real permission request separately; a running-service end-to-end
reproduction remains outstanding.
