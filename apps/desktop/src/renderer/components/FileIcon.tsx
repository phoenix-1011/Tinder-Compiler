import iconTheme from "../../../resources/file-icons.json";

interface IconSpec {
  icon: string;
  color?: string;
}

interface IconTheme {
  specialFiles: Record<string, IconSpec>;
  extensions: Record<string, IconSpec>;
  specialFolders: Record<string, IconSpec>;
  defaults: { file: IconSpec; folder: IconSpec; folderOpened: IconSpec };
}

const theme = iconTheme as IconTheme;

export function fileIcon(name: string): IconSpec {
  const lower = name.toLowerCase();
  if (theme.specialFiles[lower]) return theme.specialFiles[lower]!;
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return theme.defaults.file;
  return theme.extensions[lower.slice(dot + 1)] ?? theme.defaults.file;
}

export function folderIcon(name: string, opened: boolean): IconSpec {
  return (
    theme.specialFolders[name.toLowerCase()] ??
    (opened ? theme.defaults.folderOpened : theme.defaults.folder)
  );
}
