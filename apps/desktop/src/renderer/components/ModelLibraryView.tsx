import { useCallback } from "react";
import type { ModelCategory, ModelObjectKind } from "@tinder/nextstep";
import { childCategories, isEquipmentCategoryCode } from "@tinder/nextstep";
import { useModelLibrary } from "../state/ModelLibraryContext";
import { useWorkspace } from "../state/WorkspaceContext";

const PLATFORM_TREE_ROOT_IDS = new Set([
  "3010",
  "30111",
  "30121",
  "30131",
  "3014",
  "302",
  "303",
  "304"
]);

function CategoryNode({
  category,
  allCategories,
  selectedId,
  onSelect,
  depth,
  expandedCategoryIds,
  toggleCategoryExpanded,
  onOpenCategory
}: {
  category: ModelCategory;
  allCategories: ModelCategory[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  depth: number;
  expandedCategoryIds: Set<string>;
  toggleCategoryExpanded: (categoryId: string) => void;
  onOpenCategory: (category: ModelCategory) => void;
}) {
  const children = childCategories(allCategories, category.category_id);
  const hasChildren = children.length > 0;
  const isSelected = selectedId === category.category_id;
  const expanded = expandedCategoryIds.has(category.category_id);

  return (
    <>
      <div
        className={`ml-tree-row${depth === 0 ? " is-root" : ""}${isSelected ? " is-active" : ""}`}
        style={{ paddingLeft: depth * 12 + 8 }}
        onClick={(event) => {
          if (event.detail > 1) return;
          onSelect(category.category_id);
          if (hasChildren) toggleCategoryExpanded(category.category_id);
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          if (!hasChildren) onOpenCategory(category);
        }}
      >
        {hasChildren ? (
          <span
            className={`codicon codicon-chevron-${expanded ? "down" : "right"} ml-tree-chevron`}
            aria-hidden="true"
          />
        ) : (
          <span className="ml-tree-chevron" />
        )}
        <span className="ml-tree-code">{category.category_code}</span>
        <span className="ml-tree-name">{category.display_name}</span>
      </div>
      {expanded &&
        children.map((child) => (
          <CategoryNode
            key={child.category_id}
            category={child}
            allCategories={allCategories}
            selectedId={selectedId}
            onSelect={onSelect}
            depth={depth + 1}
            expandedCategoryIds={expandedCategoryIds}
            toggleCategoryExpanded={toggleCategoryExpanded}
            onOpenCategory={onOpenCategory}
          />
        ))}
    </>
  );
}

function CategoryTree({
  kind,
  categories,
  selectedId,
  onSelect,
  expandedCategoryIds,
  toggleCategoryExpanded,
  onOpenCategory
}: {
  kind: ModelObjectKind;
  categories: ModelCategory[];
  selectedId: string | null;
  onSelect: (id: string, kind: ModelObjectKind) => void;
  expandedCategoryIds: Set<string>;
  toggleCategoryExpanded: (categoryId: string) => void;
  onOpenCategory: (category: ModelCategory) => void;
}) {
  const roots =
    kind === "platform_model"
      ? categories
          .filter((c) => PLATFORM_TREE_ROOT_IDS.has(c.category_id))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      : categories
          .filter((c) => !c.parent_category_id && isEquipmentCategoryCode(c.category_code))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return (
    <div className="ml-tree-section-body">
      {roots.map((root) => (
        <CategoryNode
          key={root.category_id}
          category={root}
          allCategories={categories}
          selectedId={selectedId}
          onSelect={(id) => onSelect(id, kind)}
          depth={0}
          expandedCategoryIds={expandedCategoryIds}
          toggleCategoryExpanded={toggleCategoryExpanded}
          onOpenCategory={onOpenCategory}
        />
      ))}
    </div>
  );
}

export function ModelLibraryHeaderTabs() {
  const {
    filterKind,
    setFilterKind,
    setSelectedCategoryId,
    setSelectedFamilyId,
    setSelectedVersionKey,
    collapseAllCategories
  } = useModelLibrary();
  const activeKind = filterKind ?? "platform_model";

  const selectKind = useCallback(
    (kind: ModelObjectKind) => {
      if (activeKind === kind) return;
      setFilterKind(kind);
      setSelectedCategoryId(null);
      setSelectedFamilyId(null);
      setSelectedVersionKey(null);
    },
    [
      activeKind,
      setFilterKind,
      setSelectedCategoryId,
      setSelectedFamilyId,
      setSelectedVersionKey
    ]
  );

  return (
    <div className="ml-sidebar-header-tools">
      <button
        type="button"
        className="ml-sidebar-icon-btn"
        title="全部折叠"
        aria-label="全部折叠"
        onClick={collapseAllCategories}
      >
        <span className="codicon codicon-collapse-all" aria-hidden="true" />
      </button>
      <div className="ml-sidebar-tabs" role="tablist" aria-label="模型库类型">
        <button
          type="button"
          role="tab"
          aria-selected={activeKind === "platform_model"}
          className={`ml-sidebar-tab${activeKind === "platform_model" ? " is-active" : ""}`}
          onClick={() => selectKind("platform_model")}
        >
          平台
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeKind === "equipment_model"}
          className={`ml-sidebar-tab${activeKind === "equipment_model" ? " is-active" : ""}`}
          onClick={() => selectKind("equipment_model")}
        >
          设备
        </button>
      </div>
    </div>
  );
}

export function ModelLibrarySidebar() {
  const {
    index,
    filterKind,
    expandedCategoryIds,
    selectedCategoryId,
    setSelectedCategoryId,
    setFilterKind,
    setSelectedFamilyId,
    setSelectedVersionKey,
    toggleCategoryExpanded
  } = useModelLibrary();
  const { openModelLibraryCategory } = useWorkspace();
  const activeKind = filterKind ?? "platform_model";

  const handleCategorySelect = useCallback(
    (id: string, kind: ModelObjectKind) => {
      if (selectedCategoryId === id) {
        setSelectedCategoryId(null);
      } else {
        setSelectedCategoryId(id);
      }
      setFilterKind(kind);
      setSelectedFamilyId(null);
      setSelectedVersionKey(null);
    },
    [
      selectedCategoryId,
      setSelectedCategoryId,
      setFilterKind,
      setSelectedFamilyId,
      setSelectedVersionKey
    ]
  );

  return (
    <div className="ml-sidebar">
      <CategoryTree
        kind={activeKind}
        categories={index.categories}
        selectedId={selectedCategoryId}
        onSelect={handleCategorySelect}
        expandedCategoryIds={expandedCategoryIds}
        toggleCategoryExpanded={toggleCategoryExpanded}
        onOpenCategory={(category) =>
          openModelLibraryCategory({
            objectKind: activeKind,
            categoryId: category.category_id,
            displayName: category.display_name
          })
        }
      />
    </div>
  );
}
