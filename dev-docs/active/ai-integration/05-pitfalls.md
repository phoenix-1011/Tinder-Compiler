# 05 Pitfalls

## Treating Codex As A Chat Provider

Codex CLI should not be forced into the same code path as a simple completion
provider. It emits task events, may run commands, and may produce file changes.

Use a task runner abstraction for Codex.

## Leaking Secrets To Project Files

Project config must store only ids and default choices. API keys must not be
stored in `.tinder/project.json`, generated docs, logs, or renderer
`localStorage`.

UI key entry does not change that boundary. The key may be submitted to the main
process for storage, but renderer readback should expose only metadata such as
whether a secret exists.

## Overexposing Parameters

The main model picker should not expose every provider parameter. Reasoning is
the only normal user-facing parameter and should be part of the preset label.

Advanced parameters belong in add/edit model dialogs.

## Treating Reasoning As A Universal Enum

`High`, `Medium`, and similar labels are preset template labels. Different
models may express the same label as a request body field, a Codex config flag,
a provider-specific option, or a different concrete model id. Keep that mapping
inside the preset instead of assuming one global backend field.

## Coupling UI To Provider Protocols

The renderer should not parse provider SSE formats or Codex JSONL directly.
Normalize those streams in the main process or `@tinder/ai`, then send stable
AI events to the renderer.

## Accidental Harness Scope

Do not implement:

- tool registry
- planner/executor loop
- multi-agent orchestration
- auto-retry execution policy
- background work scheduler
- automatic write application

Those are separate product decisions.

## Direct Workspace Writes Too Early

Write-capable Codex or API patch flows should not land before diff preview and
confirmation behavior are designed. `auto` and `debug` modes may be
write-capable by product definition, but implementation must still pass through
a visible permission/confirmation boundary. Prefer a later worktree-backed
preset for Codex writes.

## LocalStorage Overuse

Renderer `localStorage` is acceptable for simple visual/editor preferences but
is not the right storage layer for AI provider settings with secrets,
availability state, or system-level command paths.

## Blocking App Startup

AI provider discovery and Codex detection should not block desktop startup. Load
settings quickly, then test availability lazily.
