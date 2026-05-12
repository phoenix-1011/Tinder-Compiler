# 05 Pitfalls

- Do not make resource editing profile-local by accident.
- Do not duplicate build config into every profile that uses a resource.
- Do not treat source files as draggable profile resources.
- Do not auto-modify user code outside generated regions.
- Do not assume all C++ resources use the same build system.
- Do not require compilation for Python resources.
- Do not hide stale or missing build outputs when runtime export depends on them.
- Do not let usage views mutate profiles implicitly.
- Do not keep old `location` / top-level `impl_kind` implementation semantics in the target schema.
