import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import type {
  ModelCategory,
  ModelFamily,
  ModelVersion,
  ModelObjectKind,
  ModelParameterField,
  ModelConfiguration,
  PlatformEquipmentMount,
  ModelLibraryIndex
} from "@tinder/nextstep";
import {
  defaultModelCategories,
  emptyModelLibraryIndex,
  modelObjectKey,
  createModelFamily,
  createModelVersion,
  isValidModelId,
  isValidVersion,
  categoryDescendantIds,
  isPlatformCategoryCode,
  isEquipmentCategoryCode
} from "@tinder/nextstep";
import { useOptionalCa } from "./ChainAssemblyContext";
import { join } from "./chainAssemblyStorage";

const MODEL_LIBRARY_STORAGE_DIR = "model-library";
const MODEL_LIBRARY_STORAGE_FILE = "index.json";
const MODEL_LIBRARY_WRITE_DELAY_MS = 300;

function normalizeModelLibraryIndex(value: unknown): ModelLibraryIndex {
  if (!value || typeof value !== "object") return emptyModelLibraryIndex();
  const raw = value as Partial<ModelLibraryIndex>;
  const categories = new Map(defaultModelCategories().map((category) => [
    category.category_id,
    category
  ]));
  if (Array.isArray(raw.categories)) {
    for (const category of raw.categories) {
      categories.set(category.category_id, category);
    }
  }
  return {
    categories: Array.from(categories.values()),
    families: Array.isArray(raw.families) ? raw.families : [],
    versions: Array.isArray(raw.versions) ? raw.versions : [],
    mounts: Array.isArray(raw.mounts) ? raw.mounts : []
  };
}

interface ModelLibraryState {
  index: ModelLibraryIndex;
  selectedCategoryId: string | null;
  selectedFamilyId: string | null;
  selectedVersionKey: string | null;
  filterKind: ModelObjectKind | null;
  searchQuery: string;
  expandedCategoryIds: Set<string>;
}

interface ModelLibraryActions {
  setFilterKind(kind: ModelObjectKind | null): void;
  setSelectedCategoryId(id: string | null): void;
  setSelectedFamilyId(id: string | null): void;
  setSelectedVersionKey(key: string | null): void;
  setSearchQuery(query: string): void;
  collapseAllCategories(): void;
  toggleCategoryExpanded(categoryId: string): void;

  addFamily(objectKind: ModelObjectKind, categoryId: string, displayName: string, modelId: string): ModelFamily | null;
  updateFamily(familyId: string, patch: Partial<Pick<ModelFamily, "display_name" | "aliases" | "country" | "status">>): void;
  deleteFamily(familyId: string): boolean;

  addVersion(familyId: string, modelId: string, version: string): ModelVersion | null;
  updateVersion(objectKey: string, patch: Partial<Pick<ModelVersion, "display_name" | "status">>): void;
  deleteVersion(objectKey: string): boolean;

  addParameterField(objectKey: string, field: ModelParameterField): void;
  updateParameterField(objectKey: string, fieldKey: string, patch: Partial<ModelParameterField>): void;
  removeParameterField(objectKey: string, fieldKey: string): void;

  addConfiguration(objectKey: string, config: ModelConfiguration): void;
  removeConfiguration(objectKey: string, configId: string): void;

  addMount(mount: PlatformEquipmentMount): void;
  updateMount(mountId: string, patch: Partial<PlatformEquipmentMount>): void;
  removeMount(mountId: string): void;

  filteredFamilies(): ModelFamily[];
  familyVersions(familyId: string): ModelVersion[];
  versionMounts(objectKey: string): PlatformEquipmentMount[];
  familyForId(familyId: string): ModelFamily | undefined;
  versionForKey(objectKey: string): ModelVersion | undefined;
  categoryForId(categoryId: string): ModelCategory | undefined;
  versionReferenceCount(objectKey: string): number;
}

type ModelLibraryContextValue = ModelLibraryState & ModelLibraryActions;

const ModelLibraryContext = createContext<ModelLibraryContextValue | null>(null);

export function ModelLibraryProvider({ children }: { children: ReactNode }) {
  const ca = useOptionalCa();
  const [index, setIndex] = useState<ModelLibraryIndex>(() => emptyModelLibraryIndex());
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);
  const [selectedVersionKey, setSelectedVersionKey] = useState<string | null>(null);
  const [filterKind, setFilterKind] = useState<ModelObjectKind | null>("platform_model");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(() => new Set());
  const storagePathRef = useRef<string | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const tinderDir = ca?.disk?.paths.tinderDir ?? null;
    storagePathRef.current = null;
    hasLoadedRef.current = false;

    if (!tinderDir) {
      setIndex(emptyModelLibraryIndex());
      hasLoadedRef.current = true;
      return;
    }

    void (async () => {
      const storageDir = await join(tinderDir, MODEL_LIBRARY_STORAGE_DIR);
      const storagePath = await join(storageDir, MODEL_LIBRARY_STORAGE_FILE);
      if (cancelled) return;
      storagePathRef.current = storagePath;
      try {
        const text = await window.tinder.readText(storagePath);
        if (cancelled) return;
        setIndex(text ? normalizeModelLibraryIndex(JSON.parse(text)) : emptyModelLibraryIndex());
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load model library index", err);
        setIndex(emptyModelLibraryIndex());
      } finally {
        if (!cancelled) hasLoadedRef.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ca?.disk?.paths.tinderDir]);

  useEffect(() => {
    const storagePath = storagePathRef.current;
    if (!storagePath || !hasLoadedRef.current) return;
    const timer = window.setTimeout(() => {
      void window.tinder
        .writeText(storagePath, JSON.stringify(index, null, 2))
        .catch((err) => {
          console.error("Failed to save model library index", err);
        });
    }, MODEL_LIBRARY_WRITE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [index]);

  const collapseAllCategories = useCallback(() => {
    setExpandedCategoryIds(new Set());
  }, []);

  const toggleCategoryExpanded = useCallback((categoryId: string) => {
    setExpandedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }, []);

  const addFamily = useCallback(
    (objectKind: ModelObjectKind, categoryId: string, displayName: string, modelId: string): ModelFamily | null => {
      const normalizedModelId = modelId.trim();
      if (!isValidModelId(normalizedModelId)) return null;
      const category = index.categories.find((c) => c.category_id === categoryId);
      if (!category || !normalizedModelId.startsWith(category.category_code)) return null;
      if (normalizedModelId === category.category_code) return null;
      if (objectKind === "platform_model" && !isPlatformCategoryCode(category.category_code)) return null;
      if (objectKind === "equipment_model" && !isEquipmentCategoryCode(category.category_code)) return null;
      if (index.families.some((f) => f.model_id === normalizedModelId)) return null;
      const family = createModelFamily(objectKind, categoryId, displayName, normalizedModelId);
      setIndex((prev) => ({ ...prev, families: [...prev.families, family] }));
      return family;
    },
    [index.categories, index.families]
  );

  const updateFamily = useCallback(
    (familyId: string, patch: Partial<Pick<ModelFamily, "display_name" | "aliases" | "country" | "status">>) => {
      setIndex((prev) => ({
        ...prev,
        families: prev.families.map((f) =>
          f.family_id === familyId ? { ...f, ...patch } : f
        )
      }));
    },
    []
  );

  const deleteFamily = useCallback(
    (familyId: string): boolean => {
      const family = index.families.find((f) => f.family_id === familyId);
      if (!family) return false;
      const hasVersions = index.versions.some((v) => v.family_id === familyId);
      if (hasVersions) return false;
      setIndex((prev) => {
        return {
          ...prev,
          families: prev.families.filter((f) => f.family_id !== familyId)
        };
      });
      setSelectedFamilyId((current) => (current === familyId ? null : current));
      setSelectedVersionKey(null);
      return true;
    },
    [index.families, index.versions]
  );

  const addVersion = useCallback(
    (familyId: string, modelId: string, version: string): ModelVersion | null => {
      const normalizedModelId = modelId.trim();
      const normalizedVersion = version.trim();
      if (!isValidModelId(normalizedModelId) || !isValidVersion(normalizedVersion)) return null;
      const key = modelObjectKey(normalizedModelId, normalizedVersion);
      const family = index.families.find((f) => f.family_id === familyId);
      if (!family || family.model_id !== normalizedModelId) return null;
      if (index.versions.some((v) => v.object_key === key)) return null;
      const result = createModelVersion(familyId, normalizedModelId, normalizedVersion);
      setIndex((prev) => {
        if (prev.versions.some((v) => v.object_key === key)) return prev;
        return { ...prev, versions: [...prev.versions, result] };
      });
      return result;
    },
    [index.families, index.versions]
  );

  const updateVersion = useCallback(
    (objectKey: string, patch: Partial<Pick<ModelVersion, "display_name" | "status">>) => {
      setIndex((prev) => ({
        ...prev,
        versions: prev.versions.map((v) =>
          v.object_key === objectKey ? { ...v, ...patch } : v
        )
      }));
    },
    []
  );

  const deleteVersion = useCallback(
    (objectKey: string): boolean => {
      const version = index.versions.find((v) => v.object_key === objectKey);
      if (!version) return false;
      const hasReferences = index.mounts.some(
        (mount) =>
          mount.platform_object_key === objectKey ||
          mount.allowed_equipment_object_keys.includes(objectKey) ||
          mount.default_equipment_object_key === objectKey
      );
      if (hasReferences) return false;
      setIndex((prev) => ({
        ...prev,
        versions: prev.versions.filter((v) => v.object_key !== objectKey)
      }));
      setSelectedVersionKey((current) => (current === objectKey ? null : current));
      return true;
    },
    [index.mounts, index.versions]
  );

  const addParameterField = useCallback(
    (objectKey: string, field: ModelParameterField) => {
      setIndex((prev) => ({
        ...prev,
        versions: prev.versions.map((v) =>
          v.object_key === objectKey
            ? { ...v, parameter_fields: [...v.parameter_fields, field] }
            : v
        )
      }));
    },
    []
  );

  const updateParameterField = useCallback(
    (objectKey: string, fieldKey: string, patch: Partial<ModelParameterField>) => {
      setIndex((prev) => ({
        ...prev,
        versions: prev.versions.map((v) =>
          v.object_key === objectKey
            ? {
                ...v,
                parameter_fields: v.parameter_fields.map((f) =>
                  f.field_key === fieldKey ? { ...f, ...patch } : f
                )
              }
            : v
        )
      }));
    },
    []
  );

  const removeParameterField = useCallback(
    (objectKey: string, fieldKey: string) => {
      setIndex((prev) => ({
        ...prev,
        versions: prev.versions.map((v) =>
          v.object_key === objectKey
            ? { ...v, parameter_fields: v.parameter_fields.filter((f) => f.field_key !== fieldKey) }
            : v
        )
      }));
    },
    []
  );

  const addConfiguration = useCallback(
    (objectKey: string, config: ModelConfiguration) => {
      setIndex((prev) => ({
        ...prev,
        versions: prev.versions.map((v) =>
          v.object_key === objectKey
            ? { ...v, configurations: [...(v.configurations ?? []), config] }
            : v
        )
      }));
    },
    []
  );

  const removeConfiguration = useCallback(
    (objectKey: string, configId: string) => {
      setIndex((prev) => ({
        ...prev,
        versions: prev.versions.map((v) =>
          v.object_key === objectKey
            ? { ...v, configurations: (v.configurations ?? []).filter((c) => c.config_id !== configId) }
            : v
        )
      }));
    },
    []
  );

  const addMount = useCallback(
    (mount: PlatformEquipmentMount) => {
      setIndex((prev) => ({ ...prev, mounts: [...prev.mounts, mount] }));
    },
    []
  );

  const updateMount = useCallback(
    (mountId: string, patch: Partial<PlatformEquipmentMount>) => {
      setIndex((prev) => ({
        ...prev,
        mounts: prev.mounts.map((m) =>
          m.mount_id === mountId ? { ...m, ...patch } : m
        )
      }));
    },
    []
  );

  const removeMount = useCallback(
    (mountId: string) => {
      setIndex((prev) => ({
        ...prev,
        mounts: prev.mounts.filter((m) => m.mount_id !== mountId)
      }));
    },
    []
  );

  const filteredFamilies = useCallback(() => {
    let result = index.families;
    if (filterKind) {
      result = result.filter((f) => f.object_kind === filterKind);
    }
    if (selectedCategoryId) {
      const descendants = categoryDescendantIds(index.categories, selectedCategoryId);
      result = result.filter((f) => descendants.has(f.category_id));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (f) =>
          f.display_name.toLowerCase().includes(q) ||
          f.family_id.toLowerCase().includes(q) ||
          (f.aliases ?? []).some((a) => a.toLowerCase().includes(q))
      );
    }
    return result;
  }, [index.families, index.categories, filterKind, selectedCategoryId, searchQuery]);

  const familyVersions = useCallback(
    (familyId: string) => index.versions.filter((v) => v.family_id === familyId),
    [index.versions]
  );

  const versionMounts = useCallback(
    (objectKey: string) => index.mounts.filter((m) => m.platform_object_key === objectKey),
    [index.mounts]
  );

  const familyForId = useCallback(
    (familyId: string) => index.families.find((f) => f.family_id === familyId),
    [index.families]
  );

  const versionForKey = useCallback(
    (objectKey: string) => index.versions.find((v) => v.object_key === objectKey),
    [index.versions]
  );

  const categoryForId = useCallback(
    (categoryId: string) => index.categories.find((c) => c.category_id === categoryId),
    [index.categories]
  );

  const versionReferenceCount = useCallback(
    (objectKey: string) =>
      index.mounts.reduce((count, mount) => {
        let next = count;
        if (mount.platform_object_key === objectKey) next += 1;
        next += mount.allowed_equipment_object_keys.filter((key) => key === objectKey).length;
        if (mount.default_equipment_object_key === objectKey) next += 1;
        return next;
      }, 0),
    [index.mounts]
  );

  const value = useMemo<ModelLibraryContextValue>(
    () => ({
      index,
      selectedCategoryId,
      selectedFamilyId,
      selectedVersionKey,
      filterKind,
      searchQuery,
      expandedCategoryIds,
      setFilterKind,
      setSelectedCategoryId,
      setSelectedFamilyId,
      setSelectedVersionKey,
      setSearchQuery,
      collapseAllCategories,
      toggleCategoryExpanded,
      addFamily,
      updateFamily,
      deleteFamily,
      addVersion,
      updateVersion,
      deleteVersion,
      addParameterField,
      updateParameterField,
      removeParameterField,
      addConfiguration,
      removeConfiguration,
      addMount,
      updateMount,
      removeMount,
      filteredFamilies,
      familyVersions,
      versionMounts,
      familyForId,
      versionForKey,
      categoryForId,
      versionReferenceCount
    }),
    [
      index,
      selectedCategoryId,
      selectedFamilyId,
      selectedVersionKey,
      filterKind,
      searchQuery,
      expandedCategoryIds,
      collapseAllCategories,
      toggleCategoryExpanded,
      addFamily,
      updateFamily,
      deleteFamily,
      addVersion,
      updateVersion,
      deleteVersion,
      addParameterField,
      updateParameterField,
      removeParameterField,
      addConfiguration,
      removeConfiguration,
      addMount,
      updateMount,
      removeMount,
      filteredFamilies,
      familyVersions,
      versionMounts,
      familyForId,
      versionForKey,
      categoryForId,
      versionReferenceCount
    ]
  );

  return (
    <ModelLibraryContext.Provider value={value}>
      {children}
    </ModelLibraryContext.Provider>
  );
}

export function useModelLibrary(): ModelLibraryContextValue {
  const ctx = useContext(ModelLibraryContext);
  if (!ctx) throw new Error("useModelLibrary must be used within ModelLibraryProvider");
  return ctx;
}
