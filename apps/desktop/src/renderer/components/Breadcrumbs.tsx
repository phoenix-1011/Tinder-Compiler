import { useEffect, useMemo } from "react";

interface BreadcrumbsProps {
  workspacePath: string | null;
  filePath: string;
}

/**
 * Path breadcrumbs above the editor — folder1 › folder2 › file.ext.
 * Symbol breadcrumbs (LSP `documentSymbol`) are deferred to a future round.
 */
export function Breadcrumbs({ workspacePath, filePath }: BreadcrumbsProps) {
  const segments = useMemo(() => {
    if (!workspacePath || !filePath.startsWith(workspacePath)) {
      return splitPath(filePath);
    }
    const rel = filePath.slice(workspacePath.length).replace(/^[/\\]+/, "");
    return splitPath(rel);
  }, [workspacePath, filePath]);

  useEffect(() => {
    /* placeholder for future LSP symbol fetch */
  }, [filePath]);

  return (
    <div className="breadcrumbs" aria-label="路径">
      {segments.map((seg, idx) => (
        <span key={`${seg}-${idx}`} className="breadcrumbs-seg">
          {idx > 0 && (
            <span
              className="codicon codicon-chevron-right breadcrumbs-sep"
              aria-hidden="true"
            />
          )}
          <span
            className={`breadcrumbs-text${idx === segments.length - 1 ? " is-leaf" : ""}`}
          >
            {seg}
          </span>
        </span>
      ))}
    </div>
  );
}

function splitPath(p: string): string[] {
  return p.split(/[/\\]/).filter(Boolean);
}
