# Architecture

## Product Shape

Tinder Compiler is planned as a standalone Windows desktop application based on the VS Code editor stack direction, not as a VS Code extension.

The first implementation layer should stay lightweight:

- Electron owns the desktop lifecycle, native menus, process model, and packaging.
- React owns the renderer UI.
- Monaco Editor owns text editing.
- Workspace services own file tree, project metadata, commands, and configuration.
- Compiler bridge owns tool invocation for xmake, Python, Go, and C++ workflows.
- AI package owns model/provider integration without coupling UI to a specific vendor.

## Package Boundaries

- `apps/desktop`: application composition and Electron entry points.
- `packages/editor`: editor API, language registration, formatting hooks, diagnostics hooks.
- `packages/project`: workspace model, file tree, project settings, config schema.
- `packages/compiler-bridge`: process execution, task definitions, build/run output parsing.
- `packages/ai`: provider abstraction, prompt/session contracts, local or intranet endpoint adapters.

## Offline Assumptions

The runtime application should not require public network access. External binaries such as xmake, Python, Go, C++ toolchains, formatters, and local model runtimes should be detected from the local machine or configured through project settings.

