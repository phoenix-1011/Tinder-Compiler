# Resource Branch Count Overview

## Purpose

This task package records the product requirements for **branch-level
counting** on profile resource slots. It exists so the model, export,
and UIUX implications can be aligned before any implementation begins.

## Problem Statement

The current profile model allows a resource slot to reference exactly
one branch of a compute-resource instance. The implicit quantity is
always 1.

In real-world military simulation scenarios, a single platform often
carries **multiple identical units** of the same compute resource — for
example, 4 identical radars, 8 identical missiles, or 2 identical
jammers. A user should not need to create 4 separate compute-resource
families for "4 radars of the same type"; instead the profile slot
should express *how many* of that branch are equipped.

Additionally, a single compute-resource instance may have **multiple
branches activated simultaneously** within one profile slot. For
example, a radar family might have both a "search mode" branch and a
"track mode" branch active at the same time, each with its own count.

The counting unit is the **branch**, not the resource instance — because
the branch is what gets bound to chain execution and exported to runtime.

## Scope

Requirements only. No code changes, no schema migration, no UI
implementation in this package.

## Relationship To Existing Packages

- **`profile-resource-branch-uiux`** — defines the branch model and
  profile slot semantics. This package extends the slot model with a
  `count` field per branch binding.
- **`profile-canvas-freeform-uiux`** — defines canvas display. This
  package adds requirements for how count is visualized on coverage
  cards and in the inspector.
- **`compute-resource-editor-uiux`** — untouched. The count is a
  profile-level concept, not a resource-family concept.

## Key Decisions To Freeze

| ID | Topic | Status |
| --- | --- | --- |
| BC1 | Count lives on branch binding, not resource slot | Proposed |
| BC2 | Default count is 1 (backward-compatible) | Proposed |
| BC3 | Count appears in runtime export JSON | Proposed |
| BC4 | Multiple branches per instance can be active | Proposed |
| BC5 | Canvas coverage card shows count badge | Proposed |
| BC6 | Non-canvas editor shows count control | Proposed |
