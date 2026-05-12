# 03 Implementation Notes

## Current Repo Touchpoints

Likely touchpoints:

- `packages/nextstep/src/types.ts`
- `packages/nextstep/src/model.ts`
- `apps/desktop/src/renderer/components/ChainAssemblyView.tsx`
- `apps/desktop/src/renderer/state/ChainAssemblyContext.tsx`
- future `ComputeResourceEditor` components

## Implementation Strategy

- Keep the new editor independent from runtime export at first.
- Add pure helpers for implementation file refs and build config normalization.
- Normalize only the new `implementation` object; do not introduce legacy `location` or top-level `impl_kind` compatibility paths.
- Add build/check execution through existing desktop main/preload APIs only after schema is stable.
- Reuse marker safety decisions from the chain assembly package.
- Treat profile usage as a derived read model from `.tinder/profiles/**/*.json`.

## Build MVP

Python:

- syntax check
- import/load check if safe
- `customizeFunction` presence/signature check

C++:

- execute configured command
- capture stdout/stderr
- record exit code
- verify configured output path exists

## Risks

- Overfitting to one native build system.
- Storing build details in profiles by accident.
- Letting file associations become draggable resource refs.
- Treating generated code conflicts as warnings when they should block build/export.
- Accidentally writing old implementation fields alongside `implementation`.
