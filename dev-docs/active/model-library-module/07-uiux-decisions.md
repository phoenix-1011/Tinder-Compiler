# UIUX Decisions

This document records the agreed model-library navigation and primary work
surface for the MVP.

## Navigation

The model library is a first-level module in the left vertical app rail. It is
at the same hierarchy level as compute chain assembly.

```text
Left vertical rail
  Configuration profiles
  Compute instances
  Compute chain assembly
  Model library
```

Clicking the model-library rail item opens the model-library workspace. The
workspace module sidebar title is `模型库`.

## Module Sidebar

The model-library sidebar header contains a lightweight tab switch next to the
title:

```text
模型库 [全部折叠]        [平台] [设备]
```

The selected tab controls the category tree shown in the sidebar body.

Platform tab:

```text
3010 航天平台
30111 飞机
  3011101 预警机
  3011104 战斗机
30121 舰船
30131 潜器
3014 地面平台
302 弹药实体平台
303 对抗实体平台
304 设施实体平台
```

Equipment tab:

```text
201 侦测感知
  20101 雷达
  20102 声纳
```

Rules:

- `平台` and `设备` are tabs in the module sidebar header, not two simultaneous
  top-level trees.
- `航空平台 -> 飞机`, `水面平台 -> 舰船`, and `水下平台 -> 潜器` are flattened in
  the sidebar because those top-level platform groups currently have a single
  container child. The underlying taxonomy parent links remain unchanged.
- The sidebar body shows only the category tree for the active tab.
- In the platform tab, `3010`, `30111`, `30121`, `30131`, `3014`, `302`,
  `303`, and `304` are shown as first-level roots. `301`, `3011`, `3012`,
  and `3013` are kept as taxonomy/numbering concepts, not sidebar root nodes.
- Sidebar tree nodes represent `category_code` values only.
- Sidebar tree nodes filter the main workspace; they are not concrete model
  versions and cannot be selected as profile export targets.
- Switching tabs clears the current category/model/version selection so platform
  and equipment state cannot mix.
- The sidebar title row provides an icon-only `全部折叠` action that collapses
  every category node in the active tree.

## Main Workspace

Selecting a category node opens a list-first management view for concrete model
objects under that category.

Suggested main workspace shape:

```text
Header
  selected category name and code
  create model action
  search

Concrete model list
  display name | model_id | versions | references

Detail area
  model info
  versions
  parameter fields
  configurations
  mounting relationships
  references
```

`mounting relationships` is shown for platform versions only. Equipment versions
do not own mounting relationships.

## Workspace Tabs

The app uses two global workspace tab rows. The first row remains for existing
workspace objects such as configuration profiles and compute instances. The
second row is reserved for model-library objects and stays visible across
modules once at least one model-library tab is open. It disappears only after
all model-library tabs are closed.

Entering the model-library module renders the module page directly and does not
create a dedicated `模型库` workspace tab in either row.

Only these model-library objects can open dedicated second-row tabs:

- leaf categories
- concrete model families
- concrete model versions

Non-leaf categories never open workspace tabs. They only navigate, expand or
collapse, and filter the current model-library workspace.

Open rules:

- Single-click any category: select/filter in the current model-library page.
- Double-click a leaf category: open or activate a category tab.
- Double-click a non-leaf category: do not open a tab.
- Double-click a concrete model row: open or activate a concrete model tab.
- Double-click a version row: open or activate a version tab.
- Opening an already-open model-library object activates the existing tab
  instead of creating a duplicate.

## Interaction Rules

- Creating a model from a selected category pre-fills `category_code`.
- The create-model action is shown only when the selected category is a leaf
  category.
- `model_id` is edited as a concrete model id, not as a category code.
- Version rows display the derived `object_key`.
- Model-library lifecycle status is not shown in the MVP UI. Completeness and
  usability are expressed through validation and reference checks instead.
- Profile associated-model selection uses concrete versioned model objects from
  the main workspace data, not sidebar categories.
- The MVP stays list/table-first and does not implement the external card
  gallery.
