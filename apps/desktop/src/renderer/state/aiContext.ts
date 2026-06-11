import type { GuiProjectFile } from "@tinder/nextstep";
import type { ProjectConfig } from "./ProjectContext";
import type { ChainAssemblyValue } from "./ChainAssemblyContext";
import type { ProfileEntry } from "./chainAssemblyStorage";
import { readPersistedCanvasSelection, type CanvasSelection } from "./canvasState";

/**
 * Window event dispatched after AI settings change so open panels reload.
 * Shared here because both the settings UI (dispatch) and the AI panel
 * (listen) must agree on the name.
 */
export const AI_SETTINGS_CHANGED_EVENT = "tinder-ai-settings-changed";

/**
 * One toggleable block of request context shown as a chip in the AI panel.
 * `text` is what actually travels to the provider; chips only control
 * inclusion, never mutate the underlying state.
 */
export interface AiContextSection {
  id: AiContextSectionId;
  label: string;
  detail?: string;
  text: string;
}

export type AiContextSectionId =
  | "project"
  | "chain-profile"
  | "canvas-selection"
  | "active-document"
  | "writable-targets";

const MAX_PROFILE_CHARS = 6000;
const MAX_DOCUMENT_CHARS = 8000;

function clip(text: string, maxChars: number): string {
  return text.length > maxChars
    ? `${text.slice(0, maxChars)}\n\n[Content clipped at ${maxChars} characters]`
    : text;
}

export function buildProjectSection(
  folder: { name: string; path: string } | null,
  config: ProjectConfig
): AiContextSection | null {
  if (!folder) return null;
  const lines = [
    `Project root: ${folder.path}`,
    `Project name: ${config.name ?? folder.name}`
  ];
  if (config.buildSystem) lines.push(`Build system: ${config.buildSystem}`);
  return {
    id: "project",
    label: "Project",
    detail: folder.path,
    text: lines.join("\n")
  };
}

export function resolveContextProfile(
  ca: ChainAssemblyValue | null,
  preferredProfileId: string | null
): ProfileEntry | null {
  const profiles = ca?.disk?.profiles ?? [];
  if (!profiles.length) return null;
  return (
    profiles.find((entry) => entry.id === preferredProfileId) ??
    profiles.find((entry) => entry.id === ca?.activeProfileId) ??
    null
  );
}

/**
 * Serialize the chain-composition slices of a profile JSON that describe
 * structure (execution order, resource participation, custom-node placement)
 * while leaving out bulky per-resource configuration payloads.
 */
export function buildChainProfileSection(profile: ProfileEntry | null): AiContextSection | null {
  if (!profile) return null;
  const project: GuiProjectFile = profile.project;
  const summary = {
    profile_name: project.project_name,
    version: project.version,
    ordered_execution_list: project.ordered_execution_list,
    resources: project.resources,
    custom_node_usages: project.custom_node_usages
  };
  const text = [
    `Profile file: ${profile.id}`,
    "Profile structure (JSON):",
    clip(JSON.stringify(summary, null, 2), MAX_PROFILE_CHARS)
  ].join("\n");
  return {
    id: "chain-profile",
    label: "Chain profile",
    detail: profile.name,
    text
  };
}

function describeSelection(selection: CanvasSelection, profile: ProfileEntry | null): string {
  if (selection.kind === "slot") {
    return `Selected chain node slot: ${selection.chainNodeId}`;
  }
  if (selection.kind === "coverage") {
    return [
      `Selected resource coverage on chain node: ${selection.chainNodeId}`,
      `Resource instance: ${selection.resourceInstanceId}`,
      `Variant: ${selection.variantId}`
    ].join("\n");
  }
  const usage = profile?.project.custom_node_usages?.[selection.usageArrayIndex];
  const usageDetail = usage
    ? `\nCustom node usage: ${JSON.stringify(usage)}`
    : "";
  return `Selected custom node (usage index ${selection.usageArrayIndex})${usageDetail}`;
}

/**
 * Read the persisted canvas selection for the profile open in canvas mode.
 * The canvas persists selection with a short debounce, so a just-made
 * selection can lag by ~250 ms — acceptable for prompt context.
 */
export async function buildCanvasSelectionSection(
  ca: ChainAssemblyValue | null,
  canvasProfileId: string | null
): Promise<AiContextSection | null> {
  const tinderDir = ca?.disk?.paths.tinderDir ?? null;
  const selection = await readPersistedCanvasSelection(tinderDir, canvasProfileId);
  if (!selection) return null;
  const profile = resolveContextProfile(ca, canvasProfileId);
  return {
    id: "canvas-selection",
    label: "Canvas selection",
    detail: selection.kind,
    text: describeSelection(selection, profile)
  };
}

export function buildActiveDocumentSection(
  doc: { name: string; uri: string; language: string; content: string } | null
): AiContextSection | null {
  if (!doc) return null;
  return {
    id: "active-document",
    label: doc.name,
    detail: doc.uri,
    text: [
      `Active document: ${doc.name}`,
      `URI: ${doc.uri}`,
      `Language: ${doc.language}`,
      "",
      clip(doc.content, MAX_DOCUMENT_CHARS)
    ].join("\n")
  };
}

export interface AiWritableTarget {
  uri: string;
  label: string;
  language?: string;
}

/**
 * A writable target with its current content resolved, ready to be shown to
 * the model in full. The auto-mode contract requires complete replacement
 * files, so a target is only writable when its entire content fits the
 * context budget — never let the model rewrite a file it cannot see.
 */
export interface AiResolvedWritableTarget extends AiWritableTarget {
  storage: "editor" | "disk";
  content: string;
  eol: "lf" | "crlf";
}

/** Per-target content budget for writable targets (chars). */
export const MAX_WRITABLE_TARGET_CHARS = 24000;

export function detectEol(content: string): "lf" | "crlf" {
  return content.includes("\r\n") ? "crlf" : "lf";
}

function normalizePathKey(path: string): string {
  return path.replace(/\//g, "\\").toLowerCase();
}

export function samePath(a: string, b: string): boolean {
  return normalizePathKey(a) === normalizePathKey(b);
}

/**
 * Resolve the writable target set for an auto-mode request: the active file
 * document plus the current chain profile JSON. A profile that is also open
 * as a document stays an "editor" target so apply cannot clobber unsaved
 * editor changes; an unopened profile becomes a "disk" target read from and
 * written back to `.tinder/profiles/`.
 */
export async function resolveWritableTargets(options: {
  activeDocument: {
    uri: string;
    name: string;
    language: string;
    content: string;
    kind: string;
    eol: "lf" | "crlf";
  } | null;
  contextProfile: ProfileEntry | null;
}): Promise<{ targets: AiResolvedWritableTarget[]; skipped: string[] }> {
  const targets: AiResolvedWritableTarget[] = [];
  const skipped: string[] = [];
  const { activeDocument, contextProfile } = options;
  if (activeDocument && activeDocument.kind === "file") {
    if (activeDocument.content.length <= MAX_WRITABLE_TARGET_CHARS) {
      targets.push({
        uri: activeDocument.uri,
        label: activeDocument.name,
        language: activeDocument.language,
        storage: "editor",
        content: activeDocument.content,
        eol: activeDocument.eol
      });
    } else {
      skipped.push(`${activeDocument.name} (exceeds ${MAX_WRITABLE_TARGET_CHARS} chars)`);
    }
  }
  // Dedup against the open document itself, not against surviving targets:
  // an oversized open profile is skipped above, but it must NOT fall through
  // to the disk branch - writing under a dirty editor buffer would let a
  // later Ctrl+S silently overwrite the applied change.
  const profileOpenInEditor = Boolean(
    activeDocument && contextProfile && samePath(activeDocument.uri, contextProfile.id)
  );
  if (contextProfile && !profileOpenInEditor) {
    const raw = await window.tinder.tryReadText(contextProfile.id);
    if (raw == null) {
      skipped.push(`${contextProfile.name} (profile file unreadable)`);
    } else if (raw.length > MAX_WRITABLE_TARGET_CHARS) {
      skipped.push(`${contextProfile.name} (exceeds ${MAX_WRITABLE_TARGET_CHARS} chars)`);
    } else {
      targets.push({
        uri: contextProfile.id,
        label: `${contextProfile.name} (chain profile)`,
        language: "json",
        storage: "disk",
        content: raw,
        eol: detectEol(raw)
      });
    }
  }
  return { targets, skipped };
}

export function buildWritableTargetsSection(targets: AiWritableTarget[]): AiContextSection {
  const lines = targets.length
    ? targets.map(
        (target) =>
          `- uri: ${target.uri}\n  label: ${target.label}${
            target.language ? `\n  language: ${target.language}` : ""
          }`
      )
    : ["(none)"];
  return {
    id: "writable-targets",
    label: "Writable targets",
    text: [
      "Patch proposals may only modify the documents listed below. Use the exact uri values.",
      ...lines
    ].join("\n")
  };
}

/**
 * One full-content section per writable target. Unlike the read-only context
 * sections these are never clipped — the size gate happens at resolution.
 */
export function buildWritableTargetContentSections(
  targets: AiResolvedWritableTarget[]
): AiContextSection[] {
  return targets.map((target) => ({
    id: "writable-targets" as const,
    label: `Writable target: ${target.label}`,
    detail: target.uri,
    text: [
      `URI: ${target.uri}`,
      target.language ? `Language: ${target.language}` : null,
      "Current complete content:",
      "",
      target.content
    ]
      .filter((line): line is string => line != null)
      .join("\n")
  }));
}

export function joinContextSections(sections: Array<AiContextSection | null>): string {
  return sections
    .filter((section): section is AiContextSection => Boolean(section))
    .map((section) => `## ${section.label}\n${section.text}`)
    .join("\n\n");
}
