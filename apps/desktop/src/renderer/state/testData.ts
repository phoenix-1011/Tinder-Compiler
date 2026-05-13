import type {
  ComputeResourceTemplate,
  CustomComputeResource,
  CustomNodeConfig,
  GuiProjectFile,
  PlatformResourceInstance,
  StandardComputeResource
} from "@tinder/nextstep";
import {
  DiskState,
  RESOURCE_INCLUDE_DIR,
  RESOURCE_PACKAGE_FILE,
  RESOURCE_SRC_DIR,
  ensureDir,
  join,
  writeResourcePackage
} from "./chainAssemblyStorage";

/**
 * Test-data installer for dev mode. Writes a curated set of profiles,
 * standard and custom compute resources (both v2 packages and a few
 * legacy single-file resources), source files with generated-region
 * markers, and a project-scope template into the current `.tinder/`
 * directory.
 *
 * The fixtures intentionally cover every interesting UI state surfaced
 * by the compute resource editor:
 *
 * - v2 packages and legacy v1 single-file resources side by side
 * - standard resource with multiple model_variants + multiple candidates
 *   per node_id, plus a draft and an empty-variant case
 * - custom resource with 3 nodes covering: handler_function set,
 *   default_parameters present, and an empty-description node that
 *   surfaces the "待分配" badge
 * - source files that already contain a valid `tinder:begin actions-
 *   registry` block (so generation runs the *update* path) and one
 *   without markers (insert path)
 * - external source-file references (so generation preview shows the
 *   per-file approval checkbox)
 * - multiple profiles: one fully active, one with the same standard
 *   resource referenced under a *different* variant, one minimal/empty
 * - custom_node_usages at both a builtin_core_chain anchor and the tail
 * - a project template under `.tinder/resource-templates/` exercising
 *   the source-priority rule
 */

const NOW = "2026-05-12T00:00:00.000Z";

// ─────────────────────────────────────────────────────────────────────────────
// Standard resources
// ─────────────────────────────────────────────────────────────────────────────

const RADAR_ALPHA: StandardComputeResource = {
  schema_version: 2,
  resource_kind: "standard",
  resource_instance_id: "radar-alpha",
  display_name: "雷达 Alpha",
  description: "覆盖实体维护与外观维护两个标准节点，含两组候选与两个变体。",
  tags: ["detector", "radar"],
  resource_category: "detector",
  status: "active",
  implementation: {
    kind: "python_script",
    source_files: [
      {
        file_id: "radar-alpha:1",
        path: "src/radar.py",
        storage: "managed",
        role: "primary",
        language: "python",
        // Status reflects the marker block embedded in the sample
        // source file below — keeps the editor showing "ok" on first
        // load without the user clicking generation.
        generated_region_status: "ok"
      },
      {
        file_id: "radar-alpha:2",
        path: "include/radar.h",
        storage: "managed",
        role: "header",
        language: "c"
      }
    ],
    runtime_artifact: {
      path: "src/radar.py",
      kind: "python_script",
      required_for_export: true
    },
    status: { interface_status: "ok" }
  },
  compute_nodes: [
    {
      node_id: "platform.entity.update",
      display_name: "实体维护",
      node_type: "pathway",
      candidate_id: "entity-update-c1",
      function_name: "update_entity_v1",
      base_function_name: "update_entity",
      inactive_suffix: "_inactive",
      status: "active"
    },
    {
      node_id: "platform.entity.update",
      display_name: "实体维护（高精度）",
      node_type: "pathway",
      candidate_id: "entity-update-c2",
      function_name: "update_entity_high_precision",
      base_function_name: "update_entity",
      inactive_suffix: "_inactive",
      status: "active"
    },
    {
      node_id: "platform.outlook.update",
      display_name: "外观维护",
      node_type: "pathway",
      candidate_id: "outlook-update-c1",
      function_name: "update_outlook",
      status: "active"
    }
  ],
  model_variants: [
    {
      variant_id: "default",
      display_name: "默认",
      effective_candidates: {
        "platform.entity.update": "entity-update-c1",
        "platform.outlook.update": "outlook-update-c1"
      }
    },
    {
      variant_id: "hi-precision",
      display_name: "高精度",
      model_binding_required: true,
      effective_candidates: {
        "platform.entity.update": "entity-update-c2",
        "platform.outlook.update": "outlook-update-c1"
      }
    }
  ],
  created_at: NOW,
  updated_at: NOW
};

const RADAR_BRAVO: StandardComputeResource = {
  schema_version: 2,
  resource_kind: "standard",
  resource_instance_id: "radar-bravo",
  display_name: "雷达 Bravo（草稿）",
  description: "草稿状态资源，用于演示活跃/导出时被阻塞。",
  tags: ["detector"],
  resource_category: "detector",
  template_origin: {
    template_id: "builtin.detector",
    template_version: "1.0.0"
  },
  status: "draft",
  implementation: {
    kind: "python_script",
    source_files: [],
    runtime_artifact: {
      path: "",
      kind: "python_script",
      required_for_export: true
    },
    status: { interface_status: "pending" }
  },
  compute_nodes: [
    {
      node_id: "device.judge.effect.process",
      display_name: "设备裁决",
      node_type: "pathway",
      candidate_id: "judge-effect-c1",
      status: "draft"
    }
  ],
  model_variants: [
    {
      variant_id: "default",
      display_name: "默认",
      effective_candidates: {}
    }
  ],
  created_at: NOW,
  updated_at: NOW
};

const WEATHER_SERVICE: StandardComputeResource = {
  schema_version: 2,
  resource_kind: "standard",
  resource_instance_id: "weather-service",
  display_name: "气象服务",
  description: "环境域服务，无 model_variants，演示「活跃但缺变体」的边缘情况。",
  tags: ["environment", "weather"],
  resource_category: "environment",
  status: "active",
  implementation: {
    kind: "python_script",
    source_files: [
      {
        file_id: "weather:1",
        // Intentionally external — exercises the per-generation approval
        // checkbox in the generation preview modal.
        path: "/tmp/weather-service-external.py",
        storage: "external",
        role: "primary",
        language: "python"
      }
    ],
    runtime_artifact: {
      path: "/tmp/weather-service-external.py",
      kind: "python_script",
      required_for_export: true
    },
    status: { interface_status: "unknown" }
  },
  compute_nodes: [
    {
      node_id: "platform.environment.update",
      display_name: "环境维护",
      node_type: "pathway"
    }
  ],
  model_variants: [],
  created_at: NOW,
  updated_at: NOW
};

const LEGACY_PLATFORM: PlatformResourceInstance = {
  resource_instance_id: "legacy-platform",
  display_name: "遗留平台服务（v1）",
  description: "单文件 v1 形态资源，演示读取时迁移。",
  location: "scripts/legacy_platform.py",
  impl_kind: "python_script",
  compute_nodes: [
    {
      node_id: "platform.entity.update",
      display_name: "实体维护（legacy）",
      node_type: "pathway"
    }
  ]
};

// ─────────────────────────────────────────────────────────────────────────────
// Custom resources
// ─────────────────────────────────────────────────────────────────────────────

const AUDIT_TOOLKIT: CustomComputeResource = {
  schema_version: 2,
  resource_kind: "custom",
  resource_instance_id: "audit-toolkit",
  display_name: "审计工具集",
  description: "演示自定义资源多节点：含 handler_function、默认参数、待分配描述等多种状态。",
  tags: ["service", "audit"],
  resource_category: "service",
  status: "active",
  implementation: {
    kind: "python_script",
    source_files: [
      {
        file_id: "audit:1",
        path: "src/handlers.py",
        storage: "managed",
        role: "primary",
        language: "python",
        generated_region_status: "ok"
      }
    ],
    runtime_artifact: {
      path: "src/handlers.py",
      kind: "python_script",
      required_for_export: true
    },
    status: { interface_status: "ok" }
  },
  custom_nodes: [
    {
      node_id: "log-snapshot",
      display_name: "记录快照",
      description: "在档案链路指定位置写入一份运行时快照到日志。",
      action_index: 10,
      handler_function: "handle_log_snapshot",
      default_parameters: { level: "INFO", include_metrics: "true" },
      status: "active"
    },
    {
      node_id: "metric-emit",
      display_name: "指标发射",
      description: "向 metric pipeline 发送计数器。",
      action_index: 11,
      handler_function: "handle_metric_emit",
      status: "active"
    },
    {
      // Empty description — surfaces "待分配" badge in the capability tab.
      node_id: "todo-node",
      display_name: "待补充节点",
      description: "",
      status: "draft"
    }
  ],
  created_at: NOW,
  updated_at: NOW
};

const TELEMETRY_EMITTER: CustomComputeResource = {
  schema_version: 2,
  resource_kind: "custom",
  resource_instance_id: "telemetry-emitter",
  display_name: "遥测发射器",
  description: "单节点自定义资源，演示草稿状态下的链路插入。",
  tags: ["service"],
  resource_category: "service",
  status: "draft",
  implementation: {
    kind: "python_script",
    source_files: [],
    runtime_artifact: {
      path: "",
      kind: "python_script",
      required_for_export: true
    },
    status: { interface_status: "pending" }
  },
  custom_nodes: [
    {
      node_id: "telemetry-emit",
      display_name: "遥测发射",
      description: "向 telemetry sink 推送当前帧数据。",
      action_index: 20,
      handler_function: "handle_telemetry_emit",
      status: "draft"
    }
  ],
  created_at: NOW,
  updated_at: NOW
};

const LEGACY_ANOMALY: CustomNodeConfig = {
  custom_node_id: "legacy-anomaly",
  resource_instance_id: "legacy-anomaly",
  node_id: "legacy-anomaly",
  display_name: "遗留异常上报（v1）",
  description: "单文件 v1 自定义节点，演示读取时迁移与列表共存。",
  module_id: "legacy-anomaly",
  impl_kind: "python_script",
  location: "scripts/legacy_anomaly.py",
  action_index: 30,
  default_parameters: { window: "30s" },
  enabled: true
};

// ─────────────────────────────────────────────────────────────────────────────
// Sample source files
// ─────────────────────────────────────────────────────────────────────────────

const RADAR_PY_SOURCE = `"""雷达 Alpha 资源主入口（测试数据）。"""

def update_entity_v1(parameters):
    """实体维护 · 默认候选。"""
    return parameters


def update_entity_high_precision(parameters):
    """实体维护 · 高精度候选。"""
    return parameters


def update_outlook(parameters):
    """外观维护。"""
    return parameters


# tinder:begin actions-registry
# 自动生成 — 请勿手工编辑此区域之间的内容
# 资源 radar-alpha (雷达 Alpha)
ACTION_INDEX_REGISTRY = {}
# tinder:end actions-registry
`;

const RADAR_H_SOURCE = `// 雷达 Alpha 头文件（测试数据）。
// 在 generation preview 中只走标记健康检测；不会被 3f Python 生成器写入。

#ifndef RADAR_ALPHA_H
#define RADAR_ALPHA_H

void update_entity(void* parameters);

#endif
`;

const HANDLERS_PY_SOURCE = `"""审计工具集 — 自定义节点处理函数（测试数据）。

包含一个已有 handler（演示生成器跳过重复 stub）和一个生成区块（演示更新路径）。
"""


def handle_log_snapshot(parameters):
    """已有的实现 — 生成器应保留 body 与注释不动。"""
    return {"ok": True, "level": parameters.get("level", "INFO")}


# tinder:begin actions-registry
# 自动生成 — 请勿手工编辑此区域之间的内容
# 资源 audit-toolkit (审计工具集)
ACTION_INDEX_REGISTRY = {
    10: "log-snapshot",  # -> handle_log_snapshot
}
# tinder:end actions-registry
`;

// ─────────────────────────────────────────────────────────────────────────────
// Profiles
// ─────────────────────────────────────────────────────────────────────────────

const PROFILE_PRODUCTION: GuiProjectFile = {
  version: 2,
  project_name: "production",
  builtin_node_configs: [],
  ordered_execution_list: [],
  custom_nodes: [],
  platform_resources: [],
  platform_templates: [],
  resources: [
    {
      kind: "standard",
      resource_instance_id: "radar-alpha",
      variant_id: "default",
      enabled: true,
      folder: "雷达"
    },
    {
      kind: "standard",
      resource_instance_id: "weather-service",
      variant_id: "default",
      enabled: true
    },
    {
      kind: "standard",
      resource_instance_id: "legacy-platform",
      variant_id: "default",
      enabled: false,
      folder: "归档"
    },
    {
      kind: "custom",
      resource_instance_id: "audit-toolkit",
      enabled: true
    }
  ],
  custom_node_usages: [
    {
      resource_instance_id: "audit-toolkit",
      node_id: "log-snapshot",
      enabled: true,
      insert_before: {
        kind: "builtin_core_chain",
        chain_id: "platform.entity.update"
      },
      order: 0
    },
    {
      resource_instance_id: "audit-toolkit",
      node_id: "metric-emit",
      enabled: true,
      // null anchor — appended at the tail of the chain.
      insert_before: null,
      order: 0
    }
  ]
};

const PROFILE_EXPERIMENTAL: GuiProjectFile = {
  version: 2,
  project_name: "experimental",
  builtin_node_configs: [],
  ordered_execution_list: [],
  custom_nodes: [],
  platform_resources: [],
  platform_templates: [],
  resources: [
    // Same standard resource as production but under the high-precision
    // variant — exercises the variant-resolved candidate path.
    {
      kind: "standard",
      resource_instance_id: "radar-alpha",
      variant_id: "hi-precision",
      enabled: true,
      folder: "雷达"
    },
    {
      kind: "standard",
      resource_instance_id: "radar-bravo",
      variant_id: "default",
      enabled: true
    },
    {
      kind: "custom",
      resource_instance_id: "audit-toolkit",
      enabled: false
    },
    {
      kind: "custom",
      resource_instance_id: "telemetry-emitter",
      enabled: true
    },
    {
      kind: "custom",
      resource_instance_id: "legacy-anomaly",
      enabled: true
    }
  ],
  custom_node_usages: [
    {
      resource_instance_id: "telemetry-emitter",
      node_id: "telemetry-emit",
      enabled: true,
      insert_before: null,
      order: 0
    }
  ]
};

const PROFILE_MINIMAL: GuiProjectFile = {
  version: 2,
  project_name: "minimal",
  builtin_node_configs: [],
  ordered_execution_list: [],
  custom_nodes: [],
  platform_resources: [],
  platform_templates: [],
  resources: [],
  custom_node_usages: []
};

// ─────────────────────────────────────────────────────────────────────────────
// Project template
// ─────────────────────────────────────────────────────────────────────────────

const PROJECT_TEMPLATE: ComputeResourceTemplate = {
  template_id: "project.custom.actions-set",
  template_version: "1.0.0",
  display_name: "自定义动作集（项目）",
  source: "project",
  resource_kind: "custom",
  category: "service",
  default_description: "项目级模板：预填三个常用动作的占位。",
  default_tags: ["service", "audit"],
  default_implementation_kind: "python_script",
  suggested_custom_actions: [
    {
      display_name: "记录快照",
      description: "写入一份运行时快照到日志。",
      default_parameters: { level: "INFO" }
    },
    {
      display_name: "指标发射",
      description: "向 metric pipeline 发送计数器。"
    },
    {
      display_name: "异常上报",
      description: "异常事件汇报。"
    }
  ]
};

// ─────────────────────────────────────────────────────────────────────────────
// Installer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Write the test data into the given data root. The caller is expected
 * to have confirmed that overwriting existing files is acceptable —
 * this helper does NOT prompt.
 *
 * Existing files at the same paths are silently overwritten via
 * `writeText`; resource package directories are recreated via
 * `writeResourcePackage`. Files left over from previous (unrelated)
 * runs are not removed.
 */
export async function installTestData(
  paths: DiskState["paths"]
): Promise<void> {
  // ── Standard resources ────────────────────────────────────────────────
  await writeResourcePackage(paths, RADAR_ALPHA, { ensureSubdirs: false });
  const radarPkgDir = await join(paths.standardDir, RADAR_ALPHA.resource_instance_id);
  await ensureDir(await join(radarPkgDir, RESOURCE_SRC_DIR));
  await ensureDir(await join(radarPkgDir, RESOURCE_INCLUDE_DIR));
  await window.tinder.writeText(
    await join(radarPkgDir, RESOURCE_SRC_DIR, "radar.py"),
    RADAR_PY_SOURCE
  );
  await window.tinder.writeText(
    await join(radarPkgDir, RESOURCE_INCLUDE_DIR, "radar.h"),
    RADAR_H_SOURCE
  );

  await writeResourcePackage(paths, RADAR_BRAVO);
  await writeResourcePackage(paths, WEATHER_SERVICE);

  // Legacy v1 single-file standard resource — placed flat under
  // resources/standard/, identical to what existed before v2.
  await window.tinder.writeText(
    await join(paths.standardDir, `${LEGACY_PLATFORM.resource_instance_id}.json`),
    JSON.stringify(LEGACY_PLATFORM, null, 2)
  );

  // ── Custom resources ──────────────────────────────────────────────────
  await writeResourcePackage(paths, AUDIT_TOOLKIT, { ensureSubdirs: false });
  const auditPkgDir = await join(paths.customDir, AUDIT_TOOLKIT.resource_instance_id);
  await ensureDir(await join(auditPkgDir, RESOURCE_SRC_DIR));
  await window.tinder.writeText(
    await join(auditPkgDir, RESOURCE_SRC_DIR, "handlers.py"),
    HANDLERS_PY_SOURCE
  );

  await writeResourcePackage(paths, TELEMETRY_EMITTER);

  await window.tinder.writeText(
    await join(paths.customDir, `${LEGACY_ANOMALY.custom_node_id}.json`),
    JSON.stringify(LEGACY_ANOMALY, null, 2)
  );

  // ── Profiles ──────────────────────────────────────────────────────────
  await window.tinder.writeText(
    await join(paths.profilesDir, "production.json"),
    JSON.stringify(PROFILE_PRODUCTION, null, 2)
  );
  await window.tinder.writeText(
    await join(paths.profilesDir, "experimental.json"),
    JSON.stringify(PROFILE_EXPERIMENTAL, null, 2)
  );
  await window.tinder.writeText(
    await join(paths.profilesDir, "minimal.json"),
    JSON.stringify(PROFILE_MINIMAL, null, 2)
  );

  // ── Project template ──────────────────────────────────────────────────
  await ensureDir(paths.templatesDir);
  await window.tinder.writeText(
    await join(paths.templatesDir, "custom-actions-set.json"),
    JSON.stringify(PROJECT_TEMPLATE, null, 2)
  );

  // ── Resource.json filename constant referenced for documentation
  //    (no runtime use here; keeps the import from being treelink-pruned
  //    if a future contributor needs a stable file id to assert against).
  void RESOURCE_PACKAGE_FILE;
}

/** Total number of files / directories the installer writes. */
export const TEST_DATA_FILE_COUNT = 14;
