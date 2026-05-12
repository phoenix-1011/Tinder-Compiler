import type { ComputeResourceTemplate } from "@tinder/nextstep";

/**
 * Built-in compute resource templates shipped with the application. The
 * resource creation dialog merges these with project-scope templates from
 * `.tinder/resource-templates/`; project templates win on `template_id`
 * collision so a project can override a built-in with the same identity.
 *
 * Templates only carry suggestions (category, default description, tags,
 * standard node ids to suggest, default custom actions, etc.). They never
 * carry concrete implementation file paths or runtime artifact references —
 * those live exclusively on the saved resource and are excluded from the
 * "save as template" flow.
 */
export const BUILT_IN_RESOURCE_TEMPLATES: ComputeResourceTemplate[] = [
  // ─── Blank starters ────────────────────────────────────────────────────
  {
    template_id: "builtin.blank.standard",
    template_version: "1.0.0",
    display_name: "空白（标准）",
    source: "built_in",
    resource_kind: "standard",
    category: "blank",
    default_description: "",
    default_tags: [],
    default_implementation_kind: "python_script",
    suggested_standard_node_ids: [],
    suggested_variant: {
      variant_name: "默认",
      model_binding_required: false
    }
  },
  {
    template_id: "builtin.blank.custom",
    template_version: "1.0.0",
    display_name: "空白（自定义）",
    source: "built_in",
    resource_kind: "custom",
    category: "blank",
    default_description: "",
    default_tags: [],
    default_implementation_kind: "python_script",
    suggested_custom_actions: []
  },

  // ─── Standard domain templates ─────────────────────────────────────────
  {
    template_id: "builtin.detector",
    template_version: "1.0.0",
    display_name: "探测设备",
    source: "built_in",
    resource_kind: "standard",
    category: "detector",
    default_description: "覆盖探测域标准链节点的设备资源。",
    default_tags: ["detector"],
    default_implementation_kind: "cpp_library",
    suggested_standard_node_ids: [],
    suggested_variant: {
      variant_name: "默认",
      model_binding_required: true
    }
  },
  {
    template_id: "builtin.strike",
    template_version: "1.0.0",
    display_name: "打击设备",
    source: "built_in",
    resource_kind: "standard",
    category: "strike",
    default_description: "覆盖打击域标准链节点的设备资源。",
    default_tags: ["strike"],
    default_implementation_kind: "cpp_library",
    suggested_standard_node_ids: [],
    suggested_variant: {
      variant_name: "默认",
      model_binding_required: true
    }
  },
  {
    template_id: "builtin.platform-service",
    template_version: "1.0.0",
    display_name: "平台服务",
    source: "built_in",
    resource_kind: "standard",
    category: "platform",
    default_description: "平台域服务，例如调度、查询、协调。",
    default_tags: ["platform"],
    default_implementation_kind: "python_script",
    suggested_standard_node_ids: [],
    suggested_variant: {
      variant_name: "默认",
      model_binding_required: false
    }
  },
  {
    template_id: "builtin.environment-service",
    template_version: "1.0.0",
    display_name: "环境服务",
    source: "built_in",
    resource_kind: "standard",
    category: "environment",
    default_description: "环境域服务，例如气象、地形、电磁环境。",
    default_tags: ["environment"],
    default_implementation_kind: "python_script",
    suggested_standard_node_ids: [],
    suggested_variant: {
      variant_name: "默认",
      model_binding_required: false
    }
  },
  {
    template_id: "builtin.signal-service",
    template_version: "1.0.0",
    display_name: "信号服务",
    source: "built_in",
    resource_kind: "standard",
    category: "signal",
    default_description: "信号域服务，例如信号合成、干扰、解算。",
    default_tags: ["signal"],
    default_implementation_kind: "cpp_library",
    suggested_standard_node_ids: [],
    suggested_variant: {
      variant_name: "默认",
      model_binding_required: false
    }
  },

  // ─── Custom domain templates ───────────────────────────────────────────
  {
    template_id: "builtin.custom.service",
    template_version: "1.0.0",
    display_name: "通用自定义服务",
    source: "built_in",
    resource_kind: "custom",
    category: "service",
    default_description: "可插入到任意档案链路的可重用自定义动作集合。",
    default_tags: ["service"],
    default_implementation_kind: "python_script",
    suggested_custom_actions: []
  }
];
