function normalizeSeparators(value: string): string {
  return value.replace(/\\/g, "/");
}

export function basename(value: string, suffix = ""): string {
  const normalized = normalizeSeparators(value);
  const trimmed =
    normalized.length > 1 && normalized.endsWith("/")
      ? normalized.replace(/\/+$/, "")
      : normalized;
  const idx = trimmed.lastIndexOf("/");
  const name = idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
  return suffix && name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}

export default { basename };
