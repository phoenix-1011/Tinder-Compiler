import { useEffect } from "react";
import type { OpenDocument } from "../state/WorkspaceContext";
import { useModelLibrary } from "../state/ModelLibraryContext";
import { useWorkspace } from "../state/WorkspaceContext";
import { ModelLibraryWorkspace } from "./ModelLibraryWorkspace";

export function ModelLibraryPage({ tab }: { tab?: OpenDocument }) {
  const {
    familyForId,
    versionForKey,
    categoryForId,
    setFilterKind,
    setSelectedCategoryId,
    setSelectedFamilyId,
    setSelectedVersionKey
  } = useModelLibrary();
  const { closeModelLibraryTab } = useWorkspace();

  useEffect(() => {
    if (!tab || tab.kind !== "model-library") return;
    if (tab.modelLibraryDocumentKind === "category") {
      if (
        tab.modelLibraryCategoryId &&
        !categoryForId(tab.modelLibraryCategoryId)
      ) {
        closeModelLibraryTab(tab.uri);
        return;
      }
      setFilterKind(tab.modelLibraryObjectKind ?? "platform_model");
      setSelectedCategoryId(tab.modelLibraryCategoryId ?? null);
      setSelectedFamilyId(null);
      setSelectedVersionKey(null);
      return;
    }
    if (tab.modelLibraryDocumentKind === "family" && tab.modelLibraryFamilyId) {
      const family = familyForId(tab.modelLibraryFamilyId);
      if (!family) {
        closeModelLibraryTab(tab.uri);
        return;
      }
      setFilterKind(family.object_kind);
      setSelectedCategoryId(family.category_id);
      setSelectedFamilyId(family.family_id);
      setSelectedVersionKey(null);
      return;
    }
    if (tab.modelLibraryDocumentKind === "version" && tab.modelLibraryVersionKey) {
      const version = versionForKey(tab.modelLibraryVersionKey);
      if (!version) {
        closeModelLibraryTab(tab.uri);
        return;
      }
      const family = familyForId(version.family_id);
      if (!family) {
        closeModelLibraryTab(tab.uri);
        return;
      }
      setFilterKind(family.object_kind);
      setSelectedCategoryId(family.category_id);
      setSelectedFamilyId(family.family_id);
      setSelectedVersionKey(version.object_key);
    }
  }, [
    tab,
    familyForId,
    versionForKey,
    categoryForId,
    closeModelLibraryTab,
    setFilterKind,
    setSelectedCategoryId,
    setSelectedFamilyId,
    setSelectedVersionKey
  ]);

  return (
    <div className="ml-page">
      <ModelLibraryWorkspace />
    </div>
  );
}
