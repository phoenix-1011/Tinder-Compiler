# AI Integration Overview

## Status

- State: in progress
- Created: 2026-06-08
- Last updated: 2026-06-10
- Next step: manual UI smoke for Phases 6.2/6.3 (model-driven `auto`
  proposals, context chips, chain-profile disk targets), then decide the next
  slice: more `.tinder` business objects as targets, deeper profile schema
  validation, or Codex worktree write mode (P8/P9).

## Summary

This task package defines the first AI integration slice for `Tinder-Compiler`.

The target user experience is a Cursor-like AI selector in the existing desktop
AI panel:

```text
[ Auto v ] [ GPT-5.5 High v ]
```

The first selector chooses the work mode. The second selector chooses a model
preset. A preset is not just a raw model name; it captures the backend, provider,
model id, reasoning template label, provider-specific reasoning mapping, and
supported modes needed to run the request.

The integration supports two backend families:

- custom API providers, with multiple OpenAI-compatible endpoint presets
- Codex CLI presets, invoked through local `codex exec` tasks

## Goal

Make AI usable from the desktop shell without coupling the renderer to a single
vendor or to a future harness/orchestrator layer.

The MVP should let users:

- configure multiple custom API providers
- configure multiple model presets under those providers
- enter API keys from the Add Model flow and from a dedicated management screen
- choose a model preset from the AI panel
- add a model preset from the model-preset picker
- see the preset's reasoning template label in the model label, such as `High`
  or `Medium`
- run chat-style requests against a custom API provider
- detect Codex CLI state and launch login
- run read-only Codex CLI tasks with visible work-package context
- keep secrets out of project files

## Non-goals

- Do not implement an AI harness.
- Do not implement a multi-step orchestration layer.
- Do not implement a planner/executor loop outside Codex CLI.
- Do not silently apply file edits without an explicit permission/confirmation
  boundary.
- Do not implement multi-agent coordination.
- Do not bind this slice to external public network access.
- Do not store API keys in `.tinder/project.json` or renderer `localStorage`.
- Do not change model-library, compute-resource, profile, or runtime export
  contracts.

## Key Context

Existing repo anchors:

- `packages/ai` already defines provider abstractions.
- `apps/desktop` already exposes filesystem, run, terminal, search, project,
  and LSP APIs through Electron preload.
- `AIPanel` already exists as a window-level right panel placeholder.
- `.tinder/project.json` already has `aiProviderId` as a project-level override.
- The product architecture prefers local or intranet model endpoints and should
  not require public network access at runtime.

## Acceptance Criteria

- The task package is complete and self-contained.
- The roadmap separates custom API providers from Codex CLI execution.
- The roadmap records the Cursor-like model-preset UX decision.
- The roadmap records that reasoning is the only normal user-facing model
  parameter.
- The roadmap keeps harness and orchestration out of scope.
- The architecture identifies storage boundaries for provider config, model
  presets, project defaults, and secrets.
- The verification doc defines future typecheck, API smoke, Codex CLI smoke, and
  manual UI checks.

## Mapping

- Slug: `ai-integration`
- Repository: `D:\Tinder\Tinder-Compiler`
- Task ID: TBD
- Governance mapping: TBD
