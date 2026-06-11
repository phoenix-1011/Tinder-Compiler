# Phase 6 Patch Preview Decisions

## Status

- State: implementation started
- Started: 2026-06-09
- Scope: Phase 6.1 implements the proposal, preview, session-memory snapshot,
  active-document apply, and rollback foundation. Full `auto`
  harness/orchestration and Codex root/main execution remain separate follow-up
  slices.

## Goal

Define the first safe write-capable AI path before implementing `auto` or
`debug` mutation behavior.

Phase 6 must preserve the current boundary:

- no silent file writes
- no hidden command execution
- no harness or custom tool registry
- no planner/executor layer outside Codex CLI

## Decision Points

| ID | Topic | Options | Default recommendation | Status |
| --- | --- | --- | --- | --- |
| P1 | First writable target | active document, current business object files, whole project | active document only for the first write slice | accepted |
| P2 | Patch format | unified diff, structured edit objects, editor-local suggestions | structured edit objects with optional rendered diff | accepted |
| P3 | Patch source | free-form model text, fenced patch block, strict JSON schema | strict JSON schema for applyable edits | accepted |
| P4 | Preview surface | AI panel inline, editor diff view, dedicated review pane | AI panel inline proposal block first | accepted |
| P5 | Apply boundary | apply all, per-file apply, per-hunk apply | per-proposal apply with per-file grouping; per-hunk later | accepted |
| P6 | Codex provider parity | separate task backend, provider family with same preset flow | Codex is a provider family and should use the same preset -> proposal -> preview -> apply flow | accepted |
| P7 | Snapshot boundary | no snapshot, editor undo only, app-managed snapshot, git/worktree snapshot | session-memory app snapshot for applyable files; git/worktree remains an enhancement | accepted |
| P8 | Codex write target | current root/main, mapped work package root, temporary worktree | worktree by default; allow explicit root/main direct mode when starting a session | accepted |
| P9 | Codex permissions | per command/write approval, per task approval, preset-level approval | per task approval plus visible event log for MVP | pending |
| P10 | `auto` behavior | proposal-only, Codex delegated task, full harness/orchestration | full harness and orchestration mode; root/main execution is allowed after explicit session selection | accepted |
| P11 | `debug` behavior | diagnosis only, log insertion loop, full test/fix loop | deferred follow-up mode; not part of Phase 6 first implementation | accepted |
| P12 | `.tinder` object mapping | active document only, current business object files, whole project `.tinder/` | `.tinder/` directory objects are writable targets for write-capable sessions | accepted |
| P13 | Audit/rollback | rely on git, app-managed snapshot, manual undo only | require snapshot metadata for applied patch proposals | pending |

## Proposed First Write Slice

The smallest implementation slice after decisions are accepted is Phase 6.1:

1. The selected provider returns a structured patch proposal for the active
   document only. This applies to custom API providers and Codex providers.
2. The app renders a preview and requires explicit apply.
3. The apply path writes only the active document content through existing
   editor/workspace APIs.
4. The app records an app-managed snapshot before apply.
5. No command execution is allowed.
6. Codex follows the same provider/preset/proposal flow as custom API models;
   command-running Codex workflows remain blocked until their permission and
   snapshot boundaries are accepted.

Phase 6.1 implementation status:

- shared AI session, execution-target, patch proposal, and snapshot types added
- AI panel session header added with provider, root, branch, execution target,
  and new-session control
- local active-document patch proposal scaffold added for `auto`
- inline proposal preview added
- explicit apply/discard actions added
- session-memory snapshot and rollback added
- rollback refuses to overwrite files changed after apply

Phase 6.2 implementation status (2026-06-10):

- the local proposal scaffold was replaced by a model-driven flow: API `auto`
  requests carry a strict-JSON system instruction (P3), the streamed response
  is parsed/validated (`parseAiProposalPayload` in `@tinder/ai`), and target
  uris are checked against a writable-target allowlist before a draft
  proposal enters the Phase 6.1 preview/apply/snapshot pipeline
- writable targets remain the active `file`-kind document only (P1); the
  allowlist plumbing already supports multiple targets for the next slice
- business-object context chips added (project, chain profile structure,
  persisted canvas selection, active document); chips toggle inclusion per
  request and feed both API chats and Codex tasks
- API requests now include prior user/assistant turns as `messages` history
- Codex `auto` shows an explicit follow-up-slice message instead of the stub

Phase 6.3 implementation status (2026-06-10) — business-object writable
targets:

- the writable target set widened from "active document only" (P1 first
  slice) to "active file document + current chain profile JSON"; the profile
  is the first `.tinder/` business object reachable by write-capable AI (P12)
- targets carry a `storage` discriminator: "editor" targets apply through the
  open document (`updateContent`, user saves), "disk" targets are written
  directly and trigger a ChainAssembly disk reload; a profile that is open as
  a document stays an editor target so unsaved edits cannot be clobbered
- writable targets always travel with their complete current content; a
  target whose content exceeds the per-target budget (24k chars) is excluded
  from the writable set and the exclusion is reported in the transcript —
  the model is never asked to rewrite a file it cannot fully see
- proposed content for `.json` targets must parse as JSON or the proposal is
  rejected before preview
- apply/rollback conflict checks read the target's current content from its
  storage (open document or disk) and compare hashes; disk apply/rollback
  failures keep the snapshot and flag the proposal as conflicted instead of
  reporting success

This keeps Phase 6 focused on patch preview mechanics before adding broader
automation.

## Codex Provider Strategy To Discuss

Codex is treated as a provider family for user-facing selection and write
preview flow. It should not feel like a separate UI mode from custom API
providers.

Shared flow:

- choose mode
- choose model preset
- generate proposal
- render preview
- capture snapshot
- apply only after explicit confirmation

Codex write mode should not reuse the Phase 5 runner unchanged when it needs to
run commands or change files.

Accepted execution target policy:

- Codex write sessions show the active provider workspace target in the session
  header.
- The session header must show at least:
  - provider/backend, for example `Codex`
  - project/root label
  - git branch, for example `main`
  - execution target, for example `worktree` or `root/main`
- New Codex sessions include an execution target selector.
- `worktree` is the default and recommended write target when the current root
  is a git repository.
- `root/main` direct mode is allowed only after an explicit user choice for that
  session.
- Direct root/main mode still uses the same proposal, preview, snapshot, apply,
  and rollback boundary when changes are brought into the app's tracked
  documents.
- The UI must make direct root/main mode visually distinct from worktree mode.

Recommended new-session control shape:

```text
[ Local ] [ Project Name ] [ main ] [ worktree v ] [ New Session ]
```

Execution target options:

```text
worktree
root/main
readonly
```

Worktree requirements:

- choose a real execution root from the mapped work package
- create or select a temporary worktree when the root is a git repository
- keep Codex stdout/stderr/task events visible
- surface changed files as a reviewable diff before merge/apply
- require explicit user confirmation before copying worktree changes back
- define cleanup behavior for abandoned worktrees

Direct root/main requirements:

- require explicit session-level confirmation before launch
- show that Codex may directly modify files in the current root
- capture launch-time file hashes for the mapped target set
- stream command, stderr, changed-file, and completion events visibly
- after Codex finishes, collect changed files from the root and convert them
  into the same patch proposal/review surface
- before accepting/applying or marking changes as accepted, create session
  memory snapshots for affected app documents
- if files changed after launch or after proposal generation, enter conflict
  state instead of silently accepting changes
- never hide direct root/main writes behind the same visual treatment as
  worktree writes

## Snapshot Strategy To Discuss

Snapshots are required before any applyable AI change.

Accepted first slice:

- store snapshots in session memory only
- create one snapshot per applied proposal
- snapshot every target URI before apply
- record both the pre-apply content and the immediate post-apply content/hash
- allow automatic rollback only if the current content still matches the
  post-apply hash
- if the user has edited the target after apply, reject automatic rollback and
  show a conflict message instead of overwriting current content

Snapshot shape:

```ts
interface AiPatchSnapshot {
  snapshotId: string;
  proposalId: string;
  createdAt: string;
  mode: AiMode;
  presetId: string;
  targets: Array<{
    uri: string;
    beforeContent: string;
    beforeHash: string;
    appliedContent: string;
    appliedHash: string;
  }>;
}
```

Remaining design requirements:

- record the patch proposal id, provider preset id, mode, timestamp, and target
  URIs
- keep raw API keys and provider secrets out of snapshot metadata
- decide whether later phases need persistent snapshots under userData
- decide whether later phases should add three-way merge rollback

## Permission Boundary To Discuss

`auto` is the full write-capable mode. It is expected to include harness and
orchestration, and it can run against root/main when the user explicitly starts
that kind of session.

`debug` is a later mode and is not part of the Phase 6 first implementation.

Write-capable modes can become active only after the UI has an explicit
permission boundary.

Minimum boundary:

- show requested mode, backend, model preset, execution root, and included
  context before launch
- show whether the task can write files or run commands
- require confirmation before write-capable launch
- show generated patch/diff before applying changes
- keep cancellation visible and reliable

## Auto Mode Positioning

Accepted product definition:

- `auto` means full automation, including harness and orchestration.
- `auto` may run commands and write files when the session target allows it.
- `auto` may use `root/main` direct execution after explicit session selection.
- `auto` must still expose provider, preset, root, branch, execution target,
  and permission state before launch.
- `auto` result review still routes through the same changed-file/proposal,
  snapshot, and conflict boundary.
- `auto` can modify objects under the project `.tinder/` directory when the
  session target allows writes.

Implementation note:

- The current AI integration task package originally deferred harness and
  orchestration. Phase 6 can define the `auto` contract now, but the actual
  harness/orchestration implementation should be split into a dedicated
  accepted implementation slice.

## Debug Mode Positioning

Accepted product definition:

- `debug` is a later mode.
- Phase 6 should not implement the log/test/fix loop.
- `debug` remains selectable only when a later backend contract supports it.

## Writable Object Scope

Accepted scope:

- Write-capable sessions may modify objects under the project `.tinder/`
  directory.
- The `.tinder/` directory is the writable business-object boundary for the
  first automation contract.
- Files outside `.tinder/` are not included in the default writable target set
  unless a later decision explicitly expands the scope.

Required safeguards:

- show `.tinder/` as the writable scope before launching a write-capable
  session
- snapshot every `.tinder/` file that will be changed before applying accepted
  changes
- reject automatic apply/rollback when target file hashes have changed
- keep raw provider secrets out of `.tinder/` snapshots and metadata

## Deferred Until After Phase 6 Decisions

- background autonomous tasks
- multi-agent dispatch
- custom tool harness
- hidden command approval queues
- cross-project write scopes
