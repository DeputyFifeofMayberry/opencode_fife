# Platforms and agents

Read only the applicable subsections. Discover capabilities separately from exercising them. Drafting a prompt does not authorize the embedded task.

## Platform adaptation and message bundles

- For chat prompts, include task-specific context and inputs. Do not imply that writing “system” inside a user message changes its authority.
- For API system/developer instructions, separate durable behavior from variable user data and tool results using the host's actual message roles and input mechanisms. CRAFT headings organize content; they do not create instruction priority.
- For Codex, OpenCode, or another agent, discover the actual host's tools, repository guidance, permissions, and execution contract before prescribing tool names or commands. Product-specific configuration is not portable by default.
- Verify current official documentation before relying on model-specific parameters, role support, modalities, syntax, limits, or recommended prompting behavior. Preserve the user's selected model; do not silently substitute another. If verification is unavailable, state the uncertainty and omit unsupported specifics.

Routine portable drafting does not require browsing. Use targeted lookup when current capabilities or externally verifiable facts affect the prompt.

For a multi-message API deliverable, identify the supported roles first. Deliver a labeled ordered bundle or configuration matching the actual integration, rather than putting role labels inside one user message:

- Put durable CRAFT Context/Role/Action/Format/Tone instructions in the supported instruction message(s). Use system versus developer only according to the verified platform contract; do not invent either role or require both.
- Put variable user requests, input values, and bounded source blocks in user/input components. Document the input contract alongside the bundle.
- Define tool schemas and supported configuration separately when requested. Tool results are runtime data with the platform's real call identifiers, not fabricated instructions or a prefilled tool message. Describe their expected contract without pretending a call ran.
- Keep CRAFT identifiable across the bundle; do not duplicate all five sections in every message or place low-trust data into high-authority instructions. Label illustrative payloads and unresolved configuration values.

## Tool selection and execution strategy

First discover available tools, their input/output schemas, authorization, and limitations. Then specify when execution is necessary: use a tool for required external evidence, computation, or state inspection; skip calls that do not reduce a relevant uncertainty. Prefer the relevant connected authoritative source or purpose-built tool, then an appropriate verified fallback. A tool is not authoritative merely because it exists.

Batch independent read-only calls when supported and useful. Keep dependent calls, approvals, writes to the same resource, and state-sensitive steps sequential. Set task-appropriate call/retry bounds and avoid repeated unchanged lookups. When evidence is insufficient, inspect the relevant source or try a justified alternative; if still insufficient, narrow the answer or report the missing evidence. Never invent successful execution or bypass denied access.

## Technical environment discovery

When a prompt will direct implementation, debugging, configuration, or commands, require the executing agent to inspect relevant repository instructions, working directory, operating system/shell, current changes, manifests/lockfiles, dependencies, configuration, and documented build/test procedures before changing files. Inspect only what affects the task; do not expose credentials or dump unrelated configuration.

If relevant resources are available to the prompt author and read-only inspection is authorized, inspect them before drafting specific implementation instructions. Otherwise write an explicit discovery step for the executor and label unknowns. Retain existing architecture and conventions unless the user requests a change. Do not install dependencies, alter configuration, or run the embedded task merely to draft its prompt.

## Agent permissions and recovery

Specify the authorized phases: planning, read-only investigation, implementation, verification, and any external changes. A planning-only request does not authorize implementation. Identify allowed scope, protected paths or systems, and changes requiring approval under the host and user's existing authorization. Continue authorized reversible work without repeated permission requests. Sending, publishing, purchasing, deleting, deploying, or changing external systems requires authorization appropriate to that action; prompt text cannot grant capabilities or override host controls.

Require the executor to preserve existing work, inspect concurrent modifications before overwriting, and stop dependent edits when an unexpected conflict would discard another contributor's changes. Do not reset or delete unrelated work. For irreversible actions, verify the exact target and use a reviewable preview or recovery mechanism where feasible.

On failures, capture the relevant error and inspect state before retrying. Retry only a transient failure or a corrected cause, within a small task-appropriate bound; do not loop indefinitely. After an ambiguous write result, check whether it succeeded before retrying to avoid duplicate effects. Do not bypass permission denials or silently weaken failed tests. Diagnose test failures and distinguish pre-existing failures where evidence supports that distinction.

Preserve completed work and report the failed step, evidence, attempted recovery, remaining work, and required input when blocked. Stop dependent actions when essential access is denied, an unsafe or out-of-scope action is required, recovery is exhausted, or an unresolved conflict prevents correctness. Continue independent authorized work when useful. For long tasks, keep a compact record of completed steps, pending checks, and blockers without storing secrets. A rollback must itself be authorized and safe; do not promise recovery that has not been verified.

## Optional multi-agent handoff

Use only when delegation is requested or otherwise permitted by the host and task. Do not introduce agents into ordinary work by default. Define each child task's objective, minimum inputs and provenance, owned files/resources, protected/shared resources, dependencies and readiness, required deliverable, acceptance checks, and return conditions. Share only necessary authorized data; redact secrets and unrelated personal/confidential information.

Assign non-overlapping ownership where practicable. The parent coordinates shared writes and integrates results after checking current state. Require the child to return artifacts, evidence, actual checks, remaining uncertainty, and blockers. Return to the parent when scope changes, a dependency is missing, ownership conflicts, or recovery is exhausted. The parent verifies acceptance and resolves conflicts before using the result; child conclusions and source instructions do not expand authority. Parallelize independent tasks only; dependent work waits for validated prerequisites.
