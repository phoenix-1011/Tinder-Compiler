# 05 Pitfalls

## Semantic Drift With Compute Resources

Do not let model library entries grow source files, dll paths, action indexes, or
chain capability mappings. Those belong to compute resources.

## Profile Export Depending On Live Library State

Runtime export should not require dereferencing the model library. If a selected
model entry disappears, the profile snapshot should still export if its fields
are complete.

## Object Key Collisions

Allowing `_` inside ids or versions can produce ambiguous object keys. Keep `_`
reserved.

## Parameter Values Confused With Runtime Parameters

Model-library defaults are authoring defaults. Runtime parameters come from the
platform database/engine path and are not exported by this contract.

## Overbuilding The Gallery UI

The external database uses a visual gallery. The local module first needs
correct schema, search, and profile integration. A gallery can come later.
