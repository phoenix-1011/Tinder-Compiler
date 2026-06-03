// ─────────────────────────────────────────────────────────────────────────────
// Model Library — types, helpers, and validation
//
// The model library is a project-local SSOT for platform/equipment model
// identifiers, versions, parameter fields, configurations, and mounting
// relationships. It is intentionally separate from compute resources.
//
// Three-layer structure: category_code → model_id → version
// ─────────────────────────────────────────────────────────────────────────────

export type ModelObjectKind = "platform_model" | "equipment_model";

export interface ModelCategory {
  category_id: string;
  category_code: string;
  parent_category_id?: string;
  display_name: string;
  order?: number;
}

export interface ModelFamily {
  family_id: string;
  object_kind: ModelObjectKind;
  category_id: string;
  model_id: string;
  display_name: string;
  aliases?: string[];
  country?: string;
  image_ref?: string;
  status: "draft" | "active" | "deprecated";
}

export interface ModelVersion {
  model_id: string;
  version: string;
  object_key: string;
  family_id: string;
  display_name?: string;
  status: "draft" | "active" | "deprecated";
  parameter_fields: ModelParameterField[];
  configurations?: ModelConfiguration[];
}

export type ModelParameterValueType = "string" | "bool" | "int" | "double";

export interface ModelParameterField {
  field_key: string;
  display_name: string;
  value_type: ModelParameterValueType;
  required: boolean;
  value_range?: string;
  unit?: string;
  description?: string;
  default_value?: string;
}

export interface ModelConfiguration {
  config_id: string;
  display_name: string;
  description?: string;
  default_values: Record<string, string>;
}

export interface PlatformEquipmentMount {
  mount_id: string;
  platform_object_key: string;
  slot_id: string;
  display_name: string;
  required: boolean;
  cardinality: "single" | "multiple";
  allowed_equipment_object_keys: string[];
  default_equipment_object_key?: string;
}

export interface ModelLibraryRef {
  object_kind: ModelObjectKind;
  family_id: string;
  model_id: string;
  version: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage file shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface ModelLibraryCategoriesFile {
  schema_version: 1;
  categories: ModelCategory[];
}

export interface ModelLibraryFamilyFile {
  schema_version: 1;
  family: ModelFamily;
  versions: ModelVersion[];
}

export interface ModelLibraryPlatformVersionFile {
  schema_version: 1;
  version: ModelVersion;
  mounts: PlatformEquipmentMount[];
}

export interface ModelLibraryEquipmentVersionFile {
  schema_version: 1;
  version: ModelVersion;
}

// ─────────────────────────────────────────────────────────────────────────────
// Index — in-memory projection of the full model library
// ─────────────────────────────────────────────────────────────────────────────

export interface ModelLibraryIndex {
  categories: ModelCategory[];
  families: ModelFamily[];
  versions: ModelVersion[];
  mounts: PlatformEquipmentMount[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Default categories — canonical platform and equipment taxonomies
// ─────────────────────────────────────────────────────────────────────────────

const PLATFORM_CATEGORIES: ModelCategory[] = [
  { category_id: "3010", category_code: "3010", display_name: "航天平台", order: 1 },
  { category_id: "30101", category_code: "30101", parent_category_id: "3010", display_name: "卫星", order: 1 },
  { category_id: "3010101", category_code: "3010101", parent_category_id: "30101", display_name: "侦察卫星", order: 1 },
  { category_id: "3010102", category_code: "3010102", parent_category_id: "30101", display_name: "通信卫星", order: 2 },
  { category_id: "3010103", category_code: "3010103", parent_category_id: "30101", display_name: "导航卫星", order: 3 },
  { category_id: "3010104", category_code: "3010104", parent_category_id: "30101", display_name: "气象卫星", order: 4 },
  { category_id: "30102", category_code: "30102", parent_category_id: "3010", display_name: "航天器", order: 2 },
  { category_id: "3010201", category_code: "3010201", parent_category_id: "30102", display_name: "航天飞机", order: 1 },
  { category_id: "3010202", category_code: "3010202", parent_category_id: "30102", display_name: "临空飞机", order: 2 },
  { category_id: "30103", category_code: "30103", parent_category_id: "3010", display_name: "浮空器", order: 3 },
  { category_id: "3010301", category_code: "3010301", parent_category_id: "30103", display_name: "飞艇", order: 1 },
  { category_id: "3010302", category_code: "3010302", parent_category_id: "30103", display_name: "气球", order: 2 },
  { category_id: "3011", category_code: "3011", display_name: "航空平台", order: 2 },
  { category_id: "30111", category_code: "30111", parent_category_id: "3011", display_name: "飞机", order: 1 },
  { category_id: "3011101", category_code: "3011101", parent_category_id: "30111", display_name: "预警机", order: 1 },
  { category_id: "3011102", category_code: "3011102", parent_category_id: "30111", display_name: "电子战飞机", order: 2 },
  { category_id: "3011103", category_code: "3011103", parent_category_id: "30111", display_name: "轰炸机", order: 3 },
  { category_id: "3011104", category_code: "3011104", parent_category_id: "30111", display_name: "战斗机", order: 4 },
  { category_id: "3011105", category_code: "3011105", parent_category_id: "30111", display_name: "反潜机", order: 5 },
  { category_id: "3011106", category_code: "3011106", parent_category_id: "30111", display_name: "运输机", order: 6 },
  { category_id: "3011107", category_code: "3011107", parent_category_id: "30111", display_name: "预警直升机", order: 7 },
  { category_id: "3011108", category_code: "3011108", parent_category_id: "30111", display_name: "武装直升机", order: 8 },
  { category_id: "3011109", category_code: "3011109", parent_category_id: "30111", display_name: "反潜直升机", order: 9 },
  { category_id: "3011110", category_code: "3011110", parent_category_id: "30111", display_name: "运输直升机", order: 10 },
  { category_id: "3011111", category_code: "3011111", parent_category_id: "30111", display_name: "无人机", order: 11 },
  { category_id: "3011112", category_code: "3011112", parent_category_id: "30111", display_name: "无人直升机", order: 12 },
  { category_id: "3012", category_code: "3012", display_name: "水面平台", order: 3 },
  { category_id: "30121", category_code: "30121", parent_category_id: "3012", display_name: "舰船", order: 1 },
  { category_id: "3012101", category_code: "3012101", parent_category_id: "30121", display_name: "航空母舰", order: 1 },
  { category_id: "3012102", category_code: "3012102", parent_category_id: "30121", display_name: "两栖舰船", order: 2 },
  { category_id: "3012103", category_code: "3012103", parent_category_id: "30121", display_name: "驱护舰", order: 3 },
  { category_id: "3012104", category_code: "3012104", parent_category_id: "30121", display_name: "导弹艇", order: 4 },
  { category_id: "3012105", category_code: "3012105", parent_category_id: "30121", display_name: "登陆艇", order: 5 },
  { category_id: "3012106", category_code: "3012106", parent_category_id: "30121", display_name: "扫雷艇", order: 6 },
  { category_id: "3012107", category_code: "3012107", parent_category_id: "30121", display_name: "军辅船", order: 7 },
  { category_id: "3012108", category_code: "3012108", parent_category_id: "30121", display_name: "无人船", order: 8 },
  { category_id: "3013", category_code: "3013", display_name: "水下平台", order: 4 },
  { category_id: "30131", category_code: "30131", parent_category_id: "3013", display_name: "潜器", order: 1 },
  { category_id: "3013101", category_code: "3013101", parent_category_id: "30131", display_name: "核潜艇", order: 1 },
  { category_id: "3013102", category_code: "3013102", parent_category_id: "30131", display_name: "常规潜艇", order: 2 },
  { category_id: "3013103", category_code: "3013103", parent_category_id: "30131", display_name: "无人潜器", order: 3 },
  { category_id: "3014", category_code: "3014", display_name: "地面平台", order: 5 },
  { category_id: "30141", category_code: "30141", parent_category_id: "3014", display_name: "车辆", order: 1 },
  { category_id: "3014101", category_code: "3014101", parent_category_id: "30141", display_name: "坦克", order: 1 },
  { category_id: "3014102", category_code: "3014102", parent_category_id: "30141", display_name: "装甲车", order: 2 },
  { category_id: "3014103", category_code: "3014103", parent_category_id: "30141", display_name: "两栖车", order: 3 },
  { category_id: "3014104", category_code: "3014104", parent_category_id: "30141", display_name: "火箭炮车", order: 4 },
  { category_id: "3014105", category_code: "3014105", parent_category_id: "30141", display_name: "导弹车", order: 5 },
  { category_id: "3014106", category_code: "3014106", parent_category_id: "30141", display_name: "雷达车", order: 6 },
  { category_id: "3014107", category_code: "3014107", parent_category_id: "30141", display_name: "通信车", order: 7 },
  { category_id: "3014108", category_code: "3014108", parent_category_id: "30141", display_name: "无人车", order: 8 },
  { category_id: "3014109", category_code: "3014109", parent_category_id: "30141", display_name: "指挥车", order: 9 },
  { category_id: "30142", category_code: "30142", parent_category_id: "3014", display_name: "单兵", order: 2 },
  { category_id: "3014201", category_code: "3014201", parent_category_id: "30142", display_name: "蛙人", order: 1 },
  { category_id: "30143", category_code: "30143", parent_category_id: "3014", display_name: "阵地", order: 3 },
  { category_id: "3014301", category_code: "3014301", parent_category_id: "30143", display_name: "雷达站", order: 1 },
  { category_id: "3014302", category_code: "3014302", parent_category_id: "30143", display_name: "水声站", order: 2 },
  { category_id: "3014303", category_code: "3014303", parent_category_id: "30143", display_name: "指挥所", order: 3 },
  { category_id: "3014304", category_code: "3014304", parent_category_id: "30143", display_name: "战斗阵地", order: 4 },
  { category_id: "3014305", category_code: "3014305", parent_category_id: "30143", display_name: "机场", order: 5 },
  { category_id: "3014306", category_code: "3014306", parent_category_id: "30143", display_name: "港口", order: 6 },
  { category_id: "302", category_code: "302", display_name: "弹药实体平台", order: 6 },
  { category_id: "30201", category_code: "30201", parent_category_id: "302", display_name: "导弹", order: 1 },
  { category_id: "3020101", category_code: "3020101", parent_category_id: "30201", display_name: "防空导弹", order: 1 },
  { category_id: "3020102", category_code: "3020102", parent_category_id: "30201", display_name: "空空导弹", order: 2 },
  { category_id: "3020103", category_code: "3020103", parent_category_id: "30201", display_name: "面面导弹", order: 3 },
  { category_id: "3020104", category_code: "3020104", parent_category_id: "30201", display_name: "空面导弹", order: 4 },
  { category_id: "3020105", category_code: "3020105", parent_category_id: "30201", display_name: "反装甲导弹", order: 5 },
  { category_id: "3020106", category_code: "3020106", parent_category_id: "30201", display_name: "巡飞导弹", order: 6 },
  { category_id: "3020107", category_code: "3020107", parent_category_id: "30201", display_name: "弹道导弹", order: 7 },
  { category_id: "3020108", category_code: "3020108", parent_category_id: "30201", display_name: "反辐射导弹", order: 8 },
  { category_id: "30202", category_code: "30202", parent_category_id: "302", display_name: "鱼雷", order: 2 },
  { category_id: "3020201", category_code: "3020201", parent_category_id: "30202", display_name: "航空鱼雷", order: 1 },
  { category_id: "3020202", category_code: "3020202", parent_category_id: "30202", display_name: "管射鱼雷", order: 2 },
  { category_id: "3020203", category_code: "3020203", parent_category_id: "30202", display_name: "助飞鱼雷", order: 3 },
  { category_id: "30203", category_code: "30203", parent_category_id: "302", display_name: "水雷", order: 3 },
  { category_id: "3020301", category_code: "3020301", parent_category_id: "30203", display_name: "锚雷", order: 1 },
  { category_id: "3020302", category_code: "3020302", parent_category_id: "30203", display_name: "沉底雷", order: 2 },
  { category_id: "3020303", category_code: "3020303", parent_category_id: "30203", display_name: "漂雷", order: 3 },
  { category_id: "30205", category_code: "30205", parent_category_id: "302", display_name: "非制导炸弹", order: 5 },
  { category_id: "3020501", category_code: "3020501", parent_category_id: "30205", display_name: "炸弹", order: 1 },
  { category_id: "3020502", category_code: "3020502", parent_category_id: "30205", display_name: "火箭弹", order: 2 },
  { category_id: "303", category_code: "303", display_name: "对抗实体平台", order: 7 },
  { category_id: "30301", category_code: "30301", parent_category_id: "303", display_name: "干扰弹", order: 1 },
  { category_id: "3030101", category_code: "3030101", parent_category_id: "30301", display_name: "电磁诱骗", order: 1 },
  { category_id: "3030102", category_code: "3030102", parent_category_id: "30301", display_name: "声音诱骗", order: 2 },
  { category_id: "3030103", category_code: "3030103", parent_category_id: "30301", display_name: "光学诱骗", order: 3 },
  { category_id: "30302", category_code: "30302", parent_category_id: "303", display_name: "遮蔽物", order: 2 },
  { category_id: "3030201", category_code: "3030201", parent_category_id: "30302", display_name: "电磁遮蔽", order: 1 },
  { category_id: "3030202", category_code: "3030202", parent_category_id: "30302", display_name: "光学遮蔽", order: 2 },
  { category_id: "304", category_code: "304", display_name: "设施实体平台", order: 8 },
  { category_id: "30401", category_code: "30401", parent_category_id: "304", display_name: "障碍", order: 1 },
  { category_id: "30402", category_code: "30402", parent_category_id: "304", display_name: "浮桥", order: 2 },
];

const EQUIPMENT_CATEGORIES: ModelCategory[] = [
  { category_id: "201", category_code: "201", display_name: "侦测感知", order: 1 },
  { category_id: "20101", category_code: "20101", parent_category_id: "201", display_name: "雷达", order: 1 },
  { category_id: "20102", category_code: "20102", parent_category_id: "201", display_name: "声纳", order: 2 },
  { category_id: "20103", category_code: "20103", parent_category_id: "201", display_name: "信号侦察", order: 3 },
  { category_id: "20104", category_code: "20104", parent_category_id: "201", display_name: "光电", order: 4 },
  { category_id: "20105", category_code: "20105", parent_category_id: "201", display_name: "红外", order: 5 },
  { category_id: "20106", category_code: "20106", parent_category_id: "201", display_name: "磁探", order: 6 },
  { category_id: "202", category_code: "202", display_name: "电子对抗", order: 2 },
  { category_id: "20201", category_code: "20201", parent_category_id: "202", display_name: "有源电子干扰", order: 1 },
  { category_id: "20202", category_code: "20202", parent_category_id: "202", display_name: "无源电子干扰发射器", order: 2 },
  { category_id: "203", category_code: "203", display_name: "武器系统", order: 3 },
  { category_id: "20301", category_code: "20301", parent_category_id: "203", display_name: "导弹发射系统", order: 1 },
  { category_id: "20302", category_code: "20302", parent_category_id: "203", display_name: "火炮系统", order: 2 },
  { category_id: "20303", category_code: "20303", parent_category_id: "203", display_name: "定向能", order: 3 },
  { category_id: "20304", category_code: "20304", parent_category_id: "203", display_name: "布放设备", order: 4 },
  { category_id: "204", category_code: "204", display_name: "通信设备", order: 4 },
  { category_id: "20401", category_code: "20401", parent_category_id: "204", display_name: "作战数据链", order: 1 },
  { category_id: "20402", category_code: "20402", parent_category_id: "204", display_name: "无线电链路", order: 2 },
  { category_id: "20403", category_code: "20403", parent_category_id: "204", display_name: "卫星通信", order: 3 },
  { category_id: "20405", category_code: "20405", parent_category_id: "204", display_name: "浮标数据链", order: 5 },
  { category_id: "205", category_code: "205", display_name: "平台机动", order: 5 },
  { category_id: "20501", category_code: "20501", parent_category_id: "205", display_name: "旋转翼机动设备", order: 1 },
  { category_id: "20502", category_code: "20502", parent_category_id: "205", display_name: "固定翼机动设备", order: 2 },
  { category_id: "20503", category_code: "20503", parent_category_id: "205", display_name: "地面平台机动设备", order: 3 },
  { category_id: "20504", category_code: "20504", parent_category_id: "205", display_name: "水面机动设备", order: 4 },
  { category_id: "20505", category_code: "20505", parent_category_id: "205", display_name: "两栖机动设备", order: 5 },
  { category_id: "20506", category_code: "20506", parent_category_id: "205", display_name: "水下机动设备", order: 6 },
  { category_id: "20507", category_code: "20507", parent_category_id: "205", display_name: "常规导弹机动设备", order: 7 },
  { category_id: "20508", category_code: "20508", parent_category_id: "205", display_name: "巡航导弹机动设备", order: 8 },
  { category_id: "20509", category_code: "20509", parent_category_id: "205", display_name: "画像导弹机动设备", order: 9 },
  { category_id: "20510", category_code: "20510", parent_category_id: "205", display_name: "空间平台机动设备", order: 10 },
  { category_id: "206", category_code: "206", display_name: "指挥控制", order: 6 },
  { category_id: "20601", category_code: "20601", parent_category_id: "206", display_name: "指控设备", order: 1 },
  { category_id: "20602", category_code: "20602", parent_category_id: "206", display_name: "出动回收系统", order: 2 },
  { category_id: "207", category_code: "207", display_name: "数据处理设备", order: 7 },
  { category_id: "20701", category_code: "20701", parent_category_id: "207", display_name: "平台数据处理组件", order: 1 },
  { category_id: "20702", category_code: "20702", parent_category_id: "207", display_name: "联合信息处理组件", order: 2 },
  { category_id: "208", category_code: "208", display_name: "综合保障", order: 8 },
  { category_id: "20801", category_code: "20801", parent_category_id: "208", display_name: "后勤保障", order: 1 },
  { category_id: "20802", category_code: "20802", parent_category_id: "208", display_name: "维修防护", order: 2 },
  { category_id: "20803", category_code: "20803", parent_category_id: "208", display_name: "工程装备", order: 3 },
  { category_id: "209", category_code: "209", display_name: "其他 / 自定义设备", order: 9 },
];

export function defaultModelCategories(): ModelCategory[] {
  return [...PLATFORM_CATEGORIES, ...EQUIPMENT_CATEGORIES];
}

export function platformCategories(): ModelCategory[] {
  return PLATFORM_CATEGORIES;
}

export function equipmentCategories(): ModelCategory[] {
  return EQUIPMENT_CATEGORIES;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers and validation
// ─────────────────────────────────────────────────────────────────────────────

const VERSION_RE = /^\d+\.\d+\.\d+$/;
const UNDERSCORE_RE = /_/;

export function isValidVersion(version: string): boolean {
  return VERSION_RE.test(version.trim());
}

export function isValidModelId(modelId: string): boolean {
  const id = modelId.trim();
  return id.length > 0 && !UNDERSCORE_RE.test(id);
}

export function modelObjectKey(modelId: string, version: string): string {
  const id = modelId.trim();
  const v = version.trim();
  return id && v ? `${id}_${v}` : "";
}

export function isPlatformCategoryCode(code: string): boolean {
  return code.startsWith("301") || code.startsWith("302") || code.startsWith("303") || code.startsWith("304");
}

export function isEquipmentCategoryCode(code: string): boolean {
  return code.startsWith("20");
}

export function buildCategoryTree(categories: ModelCategory[]): ModelCategory[] {
  return categories
    .filter((c) => !c.parent_category_id)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function childCategories(categories: ModelCategory[], parentId: string): ModelCategory[] {
  return categories
    .filter((c) => c.parent_category_id === parentId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function categoryAncestorIds(categories: ModelCategory[], categoryId: string): string[] {
  const byId = new Map(categories.map((c) => [c.category_id, c]));
  const result: string[] = [];
  let cur = byId.get(categoryId);
  while (cur) {
    result.unshift(cur.category_id);
    cur = cur.parent_category_id ? byId.get(cur.parent_category_id) : undefined;
  }
  return result;
}

export function categoryDescendantIds(categories: ModelCategory[], parentId: string): Set<string> {
  const result = new Set<string>([parentId]);
  const childMap = new Map<string, string[]>();
  for (const c of categories) {
    if (c.parent_category_id) {
      const list = childMap.get(c.parent_category_id) ?? [];
      list.push(c.category_id);
      childMap.set(c.parent_category_id, list);
    }
  }
  const stack = [parentId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const childId of childMap.get(id) ?? []) {
      if (!result.has(childId)) {
        result.add(childId);
        stack.push(childId);
      }
    }
  }
  return result;
}

export function emptyModelLibraryIndex(): ModelLibraryIndex {
  return { categories: defaultModelCategories(), families: [], versions: [], mounts: [] };
}

export type ModelLibraryValidationIssue = {
  target_type: "family" | "version" | "mount" | "category";
  target_id: string;
  message: string;
};

export function validateModelLibrary(index: ModelLibraryIndex): ModelLibraryValidationIssue[] {
  const issues: ModelLibraryValidationIssue[] = [];
  const categoryIds = new Set<string>();
  const categoryCodes = new Set<string>();
  const categoryById = new Map(index.categories.map((c) => [c.category_id, c]));
  const familyIds = new Set<string>();
  const familyModelIds = new Set<string>();
  const familyById = new Map(index.families.map((f) => [f.family_id, f]));
  const versionKeys = new Set<string>();
  const versionByObjectKey = new Map<string, ModelVersion>();
  const mountIds = new Set<string>();

  for (const c of index.categories) {
    if (categoryIds.has(c.category_id)) {
      issues.push({ target_type: "category", target_id: c.category_id, message: "category_id 重复" });
    }
    categoryIds.add(c.category_id);
    if (categoryCodes.has(c.category_code)) {
      issues.push({ target_type: "category", target_id: c.category_code, message: "category_code 重复" });
    }
    categoryCodes.add(c.category_code);
    if (c.parent_category_id && !categoryById.has(c.parent_category_id)) {
      issues.push({ target_type: "category", target_id: c.category_id, message: "父级分类不存在" });
    }
  }

  for (const f of index.families) {
    if (familyIds.has(f.family_id)) {
      issues.push({ target_type: "family", target_id: f.family_id, message: "family_id 重复" });
    }
    familyIds.add(f.family_id);
    const category = categoryById.get(f.category_id);
    if (!category) {
      issues.push({ target_type: "family", target_id: f.family_id, message: "分类不存在" });
    }
    if (!isValidModelId(f.model_id)) {
      issues.push({ target_type: "family", target_id: f.family_id, message: "model_id 不能为空且不得包含下划线" });
    }
    if (category && f.model_id === category.category_code) {
      issues.push({ target_type: "family", target_id: f.family_id, message: "model_id 必须是具体型号编号，不能等于分类码" });
    }
    if (category && !f.model_id.startsWith(category.category_code)) {
      issues.push({ target_type: "family", target_id: f.family_id, message: "model_id 应使用所属 category_code 作为前缀" });
    }
    if (category && f.object_kind === "platform_model" && !isPlatformCategoryCode(category.category_code)) {
      issues.push({ target_type: "family", target_id: f.family_id, message: "平台型号绑定到了设备分类" });
    }
    if (category && f.object_kind === "equipment_model" && !isEquipmentCategoryCode(category.category_code)) {
      issues.push({ target_type: "family", target_id: f.family_id, message: "设备型号绑定到了平台分类" });
    }
    if (familyModelIds.has(f.model_id)) {
      issues.push({ target_type: "family", target_id: f.model_id, message: "model_id 重复" });
    }
    familyModelIds.add(f.model_id);
  }

  for (const v of index.versions) {
    const family = familyById.get(v.family_id);
    if (!family) {
      issues.push({ target_type: "version", target_id: v.object_key || v.model_id, message: "版本所属型号不存在" });
    }
    if (family && v.model_id !== family.model_id) {
      issues.push({ target_type: "version", target_id: v.object_key || v.model_id, message: "版本 model_id 必须与所属型号一致" });
    }
    if (!isValidModelId(v.model_id)) {
      issues.push({ target_type: "version", target_id: v.model_id, message: "model_id 不得包含下划线" });
    }
    if (!isValidVersion(v.version)) {
      issues.push({ target_type: "version", target_id: v.model_id, message: "version 格式必须为 x.x.x" });
    }
    const key = `${v.model_id}_${v.version}`;
    if (versionKeys.has(key)) {
      issues.push({ target_type: "version", target_id: key, message: "model_id + version 重复" });
    }
    versionKeys.add(key);

    const expected = modelObjectKey(v.model_id, v.version);
    if (v.object_key && v.object_key !== expected) {
      issues.push({ target_type: "version", target_id: key, message: "object_key 与 model_id + version 不一致" });
    }
    if (v.object_key) {
      versionByObjectKey.set(v.object_key, v);
    }
    const fieldKeys = new Set<string>();
    for (const field of v.parameter_fields) {
      if (!field.field_key.trim()) {
        issues.push({ target_type: "version", target_id: v.object_key, message: "参数字段 field_key 不能为空" });
      }
      if (fieldKeys.has(field.field_key)) {
        issues.push({ target_type: "version", target_id: v.object_key, message: `参数字段重复: ${field.field_key}` });
      }
      fieldKeys.add(field.field_key);
      if (!["string", "bool", "int", "double"].includes(field.value_type)) {
        issues.push({ target_type: "version", target_id: v.object_key, message: "参数字段 value_type 必须是 string/bool/int/double" });
      }
    }
  }

  for (const mount of index.mounts) {
    if (mountIds.has(mount.mount_id)) {
      issues.push({ target_type: "mount", target_id: mount.mount_id, message: "mount_id 重复" });
    }
    mountIds.add(mount.mount_id);
    const platformVersion = versionByObjectKey.get(mount.platform_object_key);
    const platformFamily = platformVersion ? familyById.get(platformVersion.family_id) : undefined;
    if (!platformVersion) {
      issues.push({ target_type: "mount", target_id: mount.mount_id, message: "平台版本不存在" });
    } else if (platformFamily?.object_kind !== "platform_model") {
      issues.push({ target_type: "mount", target_id: mount.mount_id, message: "platform_object_key 必须指向平台版本" });
    }
    const allowed = new Set(mount.allowed_equipment_object_keys);
    for (const objectKey of mount.allowed_equipment_object_keys) {
      const equipmentVersion = versionByObjectKey.get(objectKey);
      const equipmentFamily = equipmentVersion ? familyById.get(equipmentVersion.family_id) : undefined;
      if (!equipmentVersion) {
        issues.push({ target_type: "mount", target_id: mount.mount_id, message: `允许设备不存在: ${objectKey}` });
      } else if (equipmentFamily?.object_kind !== "equipment_model") {
        issues.push({ target_type: "mount", target_id: mount.mount_id, message: `允许设备必须指向设备版本: ${objectKey}` });
      }
    }
    if (mount.default_equipment_object_key) {
      if (!allowed.has(mount.default_equipment_object_key)) {
        issues.push({ target_type: "mount", target_id: mount.mount_id, message: "默认设备必须在允许设备列表中" });
      }
      if (!versionByObjectKey.has(mount.default_equipment_object_key)) {
        issues.push({ target_type: "mount", target_id: mount.mount_id, message: "默认设备版本不存在" });
      }
    }
  }

  return issues;
}

export function createModelVersion(
  familyId: string,
  modelId: string,
  version: string,
): ModelVersion {
  const normalizedModelId = modelId.trim();
  const normalizedVersion = version.trim();
  return {
    model_id: normalizedModelId,
    version: normalizedVersion,
    object_key: modelObjectKey(normalizedModelId, normalizedVersion),
    family_id: familyId,
    status: "draft",
    parameter_fields: [],
  };
}

export function createModelFamily(
  objectKind: ModelObjectKind,
  categoryId: string,
  displayName: string,
  modelId: string,
): ModelFamily {
  const normalizedModelId = modelId.trim();
  const familyId = `${normalizedModelId}-${Date.now().toString(36)}`;
  return {
    family_id: familyId,
    object_kind: objectKind,
    category_id: categoryId,
    model_id: normalizedModelId,
    display_name: displayName.trim(),
    status: "draft",
  };
}
