# App performance review: ranked investigation opportunities

Reviewed 2026-11-05 at `edab3236fb73ed209df51a7b3f0e915e20cca739` on `dev`. This is a targeted static review of session execution, terminal and desktop session interfaces, file search, editing, workspace settings, and export. It is not an exhaustive audit of every package. The source paths below were inspected in the working tree; unrelated pre-existing changes were preserved.

**Recommendation:** Start with large-edit scaling, session-history reconstruction, and terminal streaming. All three have clear code-level work that grows with input size on important workflows. Measure each before changing it. The ranking estimates investigation value from potential impact, frequency, and strength of source evidence; it is not a measurement of actual user impact or a list of confirmed slowdowns.

## Ranked findings

### 1. Large edits allocate a quadratic line-matching table

- **Where:** `packages/core/src/tool/plugin/edit.ts:119`, `:132`, `:169`, `:322`.
- **Evidence:** Every matched replacement passes through `withRegionEndings`, which builds a `Uint32Array` with `(before lines + 1) × (after lines + 1)` cells and fills it with nested loops. A 10,000-by-10,000-line replacement alone requires about 400 MB for the table, before accounting for other data. This is a calculation from the allocation, not a measured result.
- **Potential impact:** A large tool edit can consume substantial memory and block the process while matching line endings. Ordinary small edits may be unaffected.
- **Investigate:** Benchmark edits at increasing line counts, including unchanged and heavily changed regions and mixed line endings; measure elapsed time, peak memory, and responsiveness of concurrent sessions. If material, evaluate a bounded-memory alignment or a safe fast path while preserving exact mixed-ending behavior. Confirm existing input limits and correctness tests before choosing a fix.

### 2. Model steps reconstruct and hydrate the active history repeatedly

- **Where:** `packages/core/src/session/runner/llm.ts:218`, `packages/core/src/session/context.ts:167`, `packages/core/src/session/history.ts:183`, `:231`, `:275`.
- **Evidence:** Each continuation loads the model context. `messageEntries` reads rows from the selected compaction boundary onward, fetches assistant parts, hydrates media, and decodes the rows. For a summary with `keepID`, `withRecentText` also reads and decodes the retained pre-compaction range. The history read and instruction initialization are inside a database transaction.
- **Potential impact:** Long, tool-heavy sessions may spend increasing time and memory preparing each model call; large attachments and retained text could amplify this. This must be weighed against provider latency and the project's required fresh-history semantics.
- **Investigate:** Instrument database, hydration, decoding, retained-text reconstruction, transaction duration, and total pre-model time across short and long sessions. Include compaction, media, and different model boundaries. If dominant, look for safely reusable immutable work or narrower reads without changing replay, instruction, or compaction semantics.

### 3. Terminal streaming searches the projected history for every text or reasoning chunk

- **Where:** `packages/tui/src/routes/session/rows.ts:205`, `:278`, `:288`; `packages/tui/src/routes/session/grouping/session.ts:178`.
- **Evidence:** Each nonblank text or reasoning delta invokes `appendPart`; `hasPart` scans rows and traverses grouped references to decide whether the part already exists. The projection is incremental and history is loaded in pages, so cost depends on the rows actually retained, not necessarily the whole session.
- **Potential impact:** Long open histories and frequent small chunks may cause terminal input or streaming display lag.
- **Investigate:** Record CPU time and input latency for identical streams with progressively larger loaded histories and grouped tool output. If the scan dominates, evaluate an incrementally maintained part lookup, including rebuild, deletion, and session-switch correctness.

### 4. Repeated assistant updates reload and compare content parts

- **Where:** `packages/core/src/session/message-updater.ts:48`, `:298`, `:307`, `:347`, `:398`; `packages/core/src/session/projector.ts:273`, `:295`, `:312`, `:333`.
- **Evidence:** Several durable text-ending, reasoning-ending, and tool lifecycle events load and decode the assistant, then write it back. For messages already stored as separate part rows, `updateMessage` loads those parts again, and `writeParts` compares their serialized data. Rows that have no separate part rows follow the inline path. This finding concerns durable events, not every transient stream delta.
- **Potential impact:** Assistants with many tool parts or large outputs may accumulate repeated database and serialization work, delaying tool progress or other work sharing the database.
- **Investigate:** Count queries, serialized bytes, and update time per event as part count and tool output grow. Compare inline and separate-part storage. Consider targeted updates only if measurements justify them, while preserving durable replay and compatibility.

### 5. File picker fallback rescans and rebuilds a large index

- **Where:** `packages/core/src/filesystem/search.ts:24`, `:31`, `:64`, `:71`, `:89`.
- **Evidence:** The ripgrep-backed implementation builds maps of files and directories, preparing path strings for fuzzy matching. After a 10-second interval, a subsequent search can start another scan; version-controlled locations outside the home directory use a very high scan limit. Each search also creates arrays of the indexed values. The separate FFF implementation has different behavior, so verify which backend is active.
- **Potential impact:** Large repositories can see slow first search and repeated disk, CPU, and memory pressure during use. Refresh is coalesced and later searches can use the previous index while it runs.
- **Investigate:** Measure cold and warm search latency, refresh time, memory, file count, and disk activity on representative Windows repositories for both backends. If fallback costs matter, assess incremental refresh or reuse of search inputs, with explicit freshness and ignore-rule checks.

### 6. Workspace settings fetch every session for every workspace

- **Where:** `packages/app/src/settings/workspaces/workspaces.tsx:124`, `:143`, `:149`, `:217`; `packages/app/src/session/list.ts:3`; `packages/app/src/workspaces/paths.ts:48`.
- **Evidence:** The settings query fetches all pages for each workspace directory, concurrently across directories, and refetches on mount. The helper reads pages sequentially and concatenates results. The settings view then computes membership for each workspace from the merged inventory. A separate fetch is used when acting on a workspace.
- **Potential impact:** Settings may load slowly or produce a burst of requests and memory use for users with many workspaces and sessions. Small inventories may be fine.
- **Investigate:** Measure requests, response bytes, time to useful display, and CPU with growing workspace/session counts. Determine which operations need a complete inventory. If costly, consider fetching detail on demand or a purpose-built count/summary while retaining correct deletion checks and freshness.

### 7. Session list filtering and ordering may sort large result sets

- **Where:** `packages/core/src/session/store.ts:145`, `:155`, `:175`; `packages/core/src/session/sql.ts:78`; callers include `packages/app/src/home/start/command-palette.tsx:40`.
- **Evidence:** Session lists filter by combinations of directory, project, parent and archive status, order by update time and ID, and optionally use a leading-wildcard title search. The listed session indexes cover project, workspace and parent individually; inspect the actual database schema and query plan before concluding an index is missing or unused. A page limit bounds returned rows, not necessarily rows examined or sorted.
- **Potential impact:** Session navigation or search may slow as the database grows, even when the UI asks for only 50 results.
- **Investigate:** Capture SQLite `EXPLAIN QUERY PLAN` and timings for actual home, directory, parent, archive, and title-search requests at representative sizes. Assess read gains against added write cost before proposing a composite index or a different search approach. Preserve paging order and search behavior.

### 8. Forking copies session history and performs work per message

- **Where:** `packages/core/src/session/projector.ts:190`, `:195`, `:211`, `:225`, `:247`.
- **Evidence:** A fork reads settled parent messages in batches of 500, copies them into the child, handles retained-summary references, and records blob references per copied message. Media handling can add work. Batching limits each read; total work still grows with copied history.
- **Potential impact:** Forking a long session can take longer and increase database size; concurrent database work may also wait depending on transaction behavior.
- **Investigate:** Measure fork latency, transaction/lock duration, database growth, and media cost for representative histories. Profile per-message reference work before considering batching or structural sharing. Preserve independent child history, replay, and media lifetime.

### 9. Session export holds the full conversation and serialized copy in memory

- **Where:** `packages/app/src/session/commands/export.ts:11`, `:21`, `:35`, `:51`, `:65`.
- **Evidence:** Export fetches all message pages with media references disabled, accumulates them, flattens them, and serializes the entire object. The browser path then creates a Blob; the save-file path also creates the complete JSON string. Paging limits each request but not total in-memory data.
- **Potential impact:** Large transcripts, especially those with attachments, may make export slow or temporarily consume substantial memory. Export is less frequent than normal conversation.
- **Investigate:** Measure peak memory, UI responsiveness, and completion time for large text and media exports in browser and desktop. If material, explore streaming or incremental serialization only where the platform permits it, preserving the existing export format and complete content.

## Measurement and scope

- These findings establish code paths and scaling hypotheses. No runtime benchmark, profiling, query plan, user telemetry, or live provider measurement was performed, so none is a confirmed production bottleneck or a quantified speedup.
- Existing protections matter: session message pagination, desktop timeline virtualization, incremental terminal rows, bounded fork batches, and coalesced file-index refreshes already reduce work in several paths. The desktop also has existing performance fixtures under `packages/app/e2e/performance/`, including timeline, navigation, and startup benchmarks; reuse them where applicable.
- For each investigation, use representative Windows hardware and data, record the same baseline and post-change workload multiple times, compare elapsed time and memory or interaction latency, and check correctness. Do not optimize solely because a pattern appears in source. Rank can change after measurement.
- This review did not run the application, change product code, or verify every package. It does not establish that paths outside the reviewed areas are free of performance issues.
