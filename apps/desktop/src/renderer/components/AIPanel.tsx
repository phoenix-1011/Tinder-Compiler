import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  parseAiProposalPayload,
  type AiCodexTaskEvent,
  type AiExecutionTarget,
  type AiMessage,
  type AiMode,
  type AiModelPreset,
  type AiPatchProposal,
  type AiPatchProposalTarget,
  type AiPatchSnapshot,
  type AiProposalPayload,
  type AiSessionDescriptor,
  type CodexStatus,
  type UserAiSettings
} from "@tinder/ai";
import { useUI } from "../state/UIContext";
import { useWorkspace } from "../state/WorkspaceContext";
import { useProject } from "../state/ProjectContext";
import { useOptionalCa } from "../state/ChainAssemblyContext";
import { hashText } from "../state/interfaceGeneration";
import {
  AI_SETTINGS_CHANGED_EVENT,
  buildActiveDocumentSection,
  buildCanvasSelectionSection,
  buildChainProfileSection,
  buildProjectSection,
  buildWritableTargetContentSections,
  buildWritableTargetsSection,
  joinContextSections,
  resolveContextProfile,
  resolveWritableTargets,
  samePath,
  type AiContextSection,
  type AiContextSectionId,
  type AiResolvedWritableTarget
} from "../state/aiContext";

const ALL_AI_MODES: AiMode[] = ["chat", "auto", "plan", "debug"];
const EXECUTION_TARGETS: AiExecutionTarget[] = ["readonly", "worktree", "root-main"];
const MAX_HISTORY_TURNS = 12;
const MAX_HISTORY_TURN_CHARS = 4000;
const MAX_HISTORY_TOTAL_CHARS = 16000;

interface ChatTurn {
  id: string;
  role: "user" | "assistant" | "command" | "stderr" | "error" | "system";
  text: string;
}

interface WorkPackageSummary {
  rootLabel: string;
  rootPath?: string;
  subjectLabel: string;
  subjectUri?: string;
  included: string[];
}

function makeTurnId(): string {
  return `turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function makeAiId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function previewDiff(beforeContent: string, afterContent: string): string {
  if (beforeContent === afterContent) return "No content changes.";
  const beforeLines = beforeContent.split(/\r?\n/);
  const afterLines = afterContent.split(/\r?\n/);
  const maxLines = 28;
  const output = [`- ${beforeLines.length} lines before`, `+ ${afterLines.length} lines after`];
  // findIndex only covers beforeLines; -1 means one side is a prefix of the
  // other (pure append or truncation), so the first difference sits at the
  // shorter side's length.
  const sharedPrefix = beforeLines.findIndex((line, index) => line !== afterLines[index]);
  const firstDiff = sharedPrefix < 0 ? Math.min(beforeLines.length, afterLines.length) : sharedPrefix;
  const start = Math.max(firstDiff - 2, 0);
  const end = Math.min(Math.max(beforeLines.length, afterLines.length), start + maxLines);
  for (let index = start; index < end; index += 1) {
    const before = beforeLines[index];
    const after = afterLines[index];
    if (before === after && before != null) output.push(`  ${before}`);
    else {
      if (before != null) output.push(`- ${before}`);
      if (after != null) output.push(`+ ${after}`);
    }
  }
  if (end < Math.max(beforeLines.length, afterLines.length)) output.push("...");
  return output.join("\n");
}

function summarizeWorkPackage(
  folder: { name: string; path: string } | null,
  doc: { name: string; uri: string; kind?: string; language: string; content: string } | null
): WorkPackageSummary {
  return {
    rootLabel: folder?.name ?? "User home",
    rootPath: folder?.path,
    subjectLabel: doc ? `${doc.name}${doc.kind ? ` (${doc.kind})` : ""}` : "No active document",
    subjectUri: doc?.uri,
    included: [
      folder ? "workspace root" : "home directory fallback",
      doc ? `active document content, clipped to ${Math.min(doc.content.length, 8000)} chars` : "no document context"
    ]
  };
}

export function AIPanel() {
  const { toggleAiPanel, openSettings } = useUI();
  const { activeUri, documents, folder, updateContent, appMode, canvasProfileId } = useWorkspace();
  const { config: projectConfig } = useProject();
  const ca = useOptionalCa();
  const [settings, setSettings] = useState<UserAiSettings | null>(null);
  const [codex, setCodex] = useState<CodexStatus | null>(null);
  const [mode, setMode] = useState<AiMode>("chat");
  const [presetId, setPresetId] = useState<string>("");
  const [executionTarget, setExecutionTarget] = useState<AiExecutionTarget>("readonly");
  const [session, setSession] = useState<AiSessionDescriptor | null>(null);
  const [proposal, setProposal] = useState<AiPatchProposal | null>(null);
  const [snapshot, setSnapshot] = useState<AiPatchSnapshot | null>(null);
  const [prompt, setPrompt] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const runningKindRef = useRef<"chat" | "codex" | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  // Synchronous re-entrancy guard: `busy` state lags awaits inside the run
  // handlers (context collection does IPC), so a double Ctrl+Enter could
  // otherwise start two concurrent requests.
  const busyRef = useRef(false);
  // Streaming deltas are buffered and flushed once per animation frame so a
  // long transcript is not cloned and re-rendered per token.
  const streamBufRef = useRef<{ turnId: string; text: string } | null>(null);
  const streamRafRef = useRef<number | null>(null);
  // Mirror the current selection into refs so reloadSettings can preserve it
  // without re-creating its callback (and re-running the mount effect) on
  // every user selection change.
  const presetIdRef = useRef(presetId);
  presetIdRef.current = presetId;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const proposalRef = useRef(proposal);
  proposalRef.current = proposal;

  const reloadSettings = useCallback(
    async (cancelled: () => boolean) => {
      try {
        const nextSettings = await window.tinder.ai.readSettings();
        if (cancelled()) return;
        setSettings(nextSettings);
        // Keep the user's in-panel preset/mode when they survive the settings
        // change; only fall back to project/user defaults otherwise. Codex
        // status probing is handled by the backend effect below so it never
        // blocks the settings display.
        const currentPresetId = presetIdRef.current;
        const keepCurrent =
          Boolean(currentPresetId) &&
          nextSettings.modelPresets.some((preset) => preset.id === currentPresetId);
        const projectPreset =
          projectConfig.aiModelPresetId &&
          nextSettings.modelPresets.some((preset) => preset.id === projectConfig.aiModelPresetId)
            ? projectConfig.aiModelPresetId
            : undefined;
        const nextPresetId = keepCurrent
          ? currentPresetId
          : projectPreset ??
            nextSettings.defaultModelPresetId ??
            nextSettings.modelPresets[0]?.id ??
            "";
        setPresetId(nextPresetId);
        const preset = nextSettings.modelPresets.find((item) => item.id === nextPresetId);
        const modes = preset?.supportedModes?.length ? preset.supportedModes : ALL_AI_MODES;
        const nextMode =
          keepCurrent && modes.includes(modeRef.current)
            ? modeRef.current
            : projectConfig.aiMode && modes.includes(projectConfig.aiMode)
              ? projectConfig.aiMode
              : nextSettings.defaultMode && modes.includes(nextSettings.defaultMode)
                ? nextSettings.defaultMode
                : preset?.defaultMode && modes.includes(preset.defaultMode)
                  ? preset.defaultMode
                  : modes[0] ?? "chat";
        setMode(nextMode);
      } catch (err) {
        if (!cancelled()) setError((err as Error).message ?? String(err));
      }
    },
    [projectConfig.aiMode, projectConfig.aiModelPresetId]
  );

  useEffect(() => {
    let cancelled = false;
    void reloadSettings(() => cancelled);
    const onSettingsChanged = () => {
      void reloadSettings(() => cancelled);
    };
    window.addEventListener(AI_SETTINGS_CHANGED_EVENT, onSettingsChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(AI_SETTINGS_CHANGED_EVENT, onSettingsChanged);
    };
  }, [reloadSettings]);

  useEffect(() => {
    return () => {
      const requestId = requestIdRef.current;
      const runningKind = runningKindRef.current;
      cleanupRef.current?.();
      if (streamRafRef.current != null) {
        cancelAnimationFrame(streamRafRef.current);
        streamRafRef.current = null;
      }
      if (requestId && runningKind === "chat") {
        void window.tinder.ai.cancelChat(requestId);
      }
      if (requestId && runningKind === "codex") {
        void window.tinder.ai.cancelCodexTask(requestId);
      }
    };
  }, []);

  const presets = settings?.modelPresets ?? [];
  const selectedPreset = useMemo<AiModelPreset | null>(
    () => presets.find((preset) => preset.id === presetId) ?? null,
    [presetId, presets]
  );
  const selectedCodexConfig = useMemo(
    () =>
      selectedPreset?.backend === "codex"
        ? settings?.codexConfigs.find((config) => config.id === selectedPreset.codexConfigId) ?? null
        : null,
    [selectedPreset, settings]
  );
  const availableModes = useMemo<AiMode[]>(
    () =>
      selectedPreset?.supportedModes?.length
        ? selectedPreset.supportedModes
        : ALL_AI_MODES,
    [selectedPreset]
  );
  const activeDocument = useMemo(
    () => documents.find((doc) => doc.uri === activeUri) ?? null,
    [activeUri, documents]
  );
  const workPackage = useMemo(
    () => summarizeWorkPackage(folder, activeDocument),
    [activeDocument, folder]
  );
  const contextProfile = useMemo(
    () => resolveContextProfile(ca, canvasProfileId),
    [ca, canvasProfileId]
  );
  const [contextOff, setContextOff] = useState<Set<AiContextSectionId>>(new Set());
  const toggleContextSection = (id: AiContextSectionId) => {
    setContextOff((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const contextChips = useMemo(
    () =>
      [
        folder
          ? { id: "project" as const, label: "Project", icon: "codicon-project", detail: folder.path }
          : null,
        contextProfile
          ? {
              id: "chain-profile" as const,
              label: `Profile: ${contextProfile.name}`,
              icon: "codicon-list-tree",
              detail: contextProfile.id
            }
          : null,
        appMode === "canvas" && canvasProfileId
          ? {
              id: "canvas-selection" as const,
              label: "Canvas selection",
              icon: "codicon-inspect",
              detail: "Current canvas selection"
            }
          : null,
        activeDocument
          ? {
              id: "active-document" as const,
              label: activeDocument.name,
              icon: "codicon-file",
              detail: activeDocument.uri
            }
          : null
      ].filter((chip): chip is NonNullable<typeof chip> => Boolean(chip)),
    [activeDocument, appMode, canvasProfileId, contextProfile, folder]
  );
  const collectContext = async (
    writable?: AiResolvedWritableTarget[]
  ): Promise<string | undefined> => {
    const enabled = (id: AiContextSectionId) => !contextOff.has(id);
    const sections: Array<AiContextSection | null> = [];
    const coveredByWritable = (uri: string | undefined) =>
      Boolean(uri && writable?.some((target) => samePath(target.uri, uri)));
    if (enabled("project")) sections.push(buildProjectSection(folder, projectConfig));
    // The structural profile summary is redundant when the profile travels as
    // a full-content writable target.
    if (enabled("chain-profile") && !coveredByWritable(contextProfile?.id)) {
      sections.push(buildChainProfileSection(contextProfile));
    }
    if (enabled("canvas-selection") && appMode === "canvas") {
      try {
        sections.push(await buildCanvasSelectionSection(ca, canvasProfileId));
      } catch {
        // Selection context is best-effort; a failed read should not block the request.
      }
    }
    if (enabled("active-document") && !coveredByWritable(activeDocument?.uri)) {
      sections.push(buildActiveDocumentSection(activeDocument));
    }
    if (writable) {
      // Writable targets always travel with their complete current content -
      // the instruction demands complete replacement files, which is
      // unsatisfiable blind - so chip toggles cannot exclude them.
      sections.push(...buildWritableTargetContentSections(writable));
      sections.push(buildWritableTargetsSection(writable));
    }
    const text = joinContextSections(sections);
    return text || undefined;
  };
  const historyMessages = (): AiMessage[] => {
    // A single failed auto proposal can leave a full-file JSON blob in the
    // transcript; budget by characters as well as turn count so replayed
    // history cannot blow up the provider context window.
    const recent = turns
      .filter(
        (turn) =>
          (turn.role === "user" || turn.role === "assistant") &&
          turn.text.trim() !== "" &&
          turn.text !== "[Cancelled]"
      )
      .slice(-MAX_HISTORY_TURNS)
      .map<AiMessage>((turn) => ({
        role: turn.role as "user" | "assistant",
        content:
          turn.text.length > MAX_HISTORY_TURN_CHARS
            ? `${turn.text.slice(0, MAX_HISTORY_TURN_CHARS)}\n[Turn clipped]`
            : turn.text
      }));
    const messages: AiMessage[] = [];
    let total = 0;
    for (let index = recent.length - 1; index >= 0; index -= 1) {
      total += recent[index].content.length;
      if (total > MAX_HISTORY_TOTAL_CHARS) break;
      messages.unshift(recent[index]);
    }
    return messages;
  };
  const canRunApiChat =
    selectedPreset?.backend === "api" && (mode === "chat" || mode === "plan");
  const canRunCodex = selectedPreset?.backend === "codex";
  const providerLabel = selectedPreset
    ? selectedPreset.backend === "codex"
      ? "Codex"
      : settings?.providers.find((provider) => provider.id === selectedPreset.providerId)?.label ??
        "Custom API"
    : "Local";
  const branchLabel = "main";

  const makeSessionDescriptor = (id: string): AiSessionDescriptor => ({
    id,
    mode,
    presetId: selectedPreset?.id,
    backend: selectedPreset?.backend,
    providerLabel,
    rootLabel: folder?.name ?? "User home",
    rootPath: folder?.path,
    branchLabel,
    executionTarget,
    writableScope: executionTarget === "readonly" ? undefined : ".tinder/",
    createdAt: new Date().toISOString()
  });

  const startSession = () => {
    const nextSession = makeSessionDescriptor(makeAiId("session"));
    setSession(nextSession);
    // An applied proposal's snapshot is the only rollback handle for content
    // already written into documents - keep it reachable across sessions and
    // reset only draft/terminal proposals.
    if (proposal?.status !== "applied") {
      setProposal(null);
      setSnapshot(null);
    }
    setTurns((prev) => [
      ...prev,
      {
        id: makeTurnId(),
        role: "system",
        text: `Session ${nextSession.id} started.\nTarget: ${nextSession.executionTarget}\nScope: ${nextSession.writableScope ?? "readonly"}`
      }
    ]);
  };

  useEffect(() => {
    if (!availableModes.includes(mode)) {
      setMode(availableModes[0] ?? "chat");
    }
  }, [availableModes, mode]);

  useEffect(() => {
    if (selectedPreset?.backend !== "codex") return;
    let cancelled = false;
    void window.tinder.ai
      .codexStatus(selectedCodexConfig?.command ?? "codex")
      .then((nextCodex) => {
        if (!cancelled) setCodex(nextCodex);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message ?? String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCodexConfig?.command, selectedPreset?.backend]);

  const choosePreset = (value: string) => {
    if (value === "__add__") {
      openSettings();
      return;
    }
    setPresetId(value);
    const preset = presets.find((p) => p.id === value);
    if (preset) {
      const nextModes = preset.supportedModes?.length ? preset.supportedModes : ALL_AI_MODES;
      setMode(
        preset.defaultMode && nextModes.includes(preset.defaultMode)
          ? preset.defaultMode
          : nextModes[0] ?? "chat"
      );
    }
  };

  const appendCodexEvent = (event: AiCodexTaskEvent) => {
    if (event.kind === "complete" && event.exitCode === 0) {
      setTurns((prev) => [
        ...prev,
        { id: makeTurnId(), role: "system", text: event.text ?? "Codex task completed." }
      ]);
      return;
    }
    const role: ChatTurn["role"] =
      event.kind === "command"
        ? "command"
        : event.kind === "stderr"
          ? "stderr"
          : event.kind === "error"
            ? "error"
            : event.kind === "complete"
              ? "system"
              : "assistant";
    const text = event.command || event.text || JSON.stringify(event.raw ?? event);
    if (!text) return;
    setTurns((prev) => [...prev, { id: makeTurnId(), role, text }]);
  };

  const ensureSession = (): AiSessionDescriptor => {
    if (session) return session;
    const next = makeSessionDescriptor(makeAiId("session"));
    setSession(next);
    return next;
  };

  const proposalFromPayload = (
    payload: AiProposalPayload,
    currentSession: AiSessionDescriptor,
    resolved: AiResolvedWritableTarget[]
  ): { proposal: AiPatchProposal | null; error?: string } => {
    if (!selectedPreset || !payload.targets.length) return { proposal: null };
    const targets: AiPatchProposalTarget[] = [];
    for (const target of payload.targets) {
      const resolvedTarget = resolved.find((item) => item.uri === target.uri);
      if (!resolvedTarget) {
        return { proposal: null, error: `"${target.uri}" is not in the writable target set.` };
      }
      // Normalize both directions: models echo files with either ending
      // regardless of the source, and a single stray \r\n must not flip an
      // LF document (or vice versa) into a whole-file EOL change.
      const afterContent =
        resolvedTarget.eol === "crlf"
          ? target.afterContent.replace(/\r?\n/g, "\r\n")
          : target.afterContent.replace(/\r\n/g, "\n");
      if (resolvedTarget.language === "json") {
        // Business-object files must stay machine-readable; reject payloads
        // that would corrupt them before the user can even see a preview.
        try {
          JSON.parse(afterContent);
        } catch (err) {
          return {
            proposal: null,
            error: `Proposed content for ${resolvedTarget.label} is not valid JSON: ${(err as Error).message}`
          };
        }
      }
      targets.push({
        uri: resolvedTarget.uri,
        label: resolvedTarget.label,
        language: resolvedTarget.language,
        storage: resolvedTarget.storage,
        // The content the model saw, not the live document - if the user
        // edited during streaming, apply must surface a conflict.
        beforeContent: resolvedTarget.content,
        afterContent
      });
    }
    return {
      proposal: {
        id: makeAiId("proposal"),
        sessionId: currentSession.id,
        mode,
        presetId: selectedPreset.id,
        title: payload.title,
        summary: payload.summary ?? payload.title,
        createdAt: new Date().toISOString(),
        targets,
        status: "draft"
      }
    };
  };

  const finalizeAutoProposal = (
    raw: string,
    assistantId: string,
    currentSession: AiSessionDescriptor,
    resolved: AiResolvedWritableTarget[]
  ) => {
    const result = parseAiProposalPayload(
      raw,
      resolved.map((target) => target.uri)
    );
    if (!result.ok) {
      setTurns((prev) => [
        ...prev,
        {
          id: makeTurnId(),
          role: "error",
          text: `Could not turn the response into a patch proposal: ${result.error}`
        }
      ]);
      return;
    }
    const { payload } = result;
    const readable = [payload.title, payload.summary].filter(Boolean).join("\n\n");
    setTurns((prev) =>
      prev.map((turn) =>
        turn.id === assistantId && readable ? { ...turn, text: readable } : turn
      )
    );
    const { proposal: nextProposal, error: proposalError } = proposalFromPayload(
      payload,
      currentSession,
      resolved
    );
    if (proposalError) {
      setTurns((prev) => [
        ...prev,
        {
          id: makeTurnId(),
          role: "error",
          text: `Could not turn the response into a patch proposal: ${proposalError}`
        }
      ]);
      return;
    }
    if (!nextProposal) {
      setTurns((prev) => [
        ...prev,
        {
          id: makeTurnId(),
          role: "system",
          text: "The model returned no applyable targets, so no patch proposal was created."
        }
      ]);
      return;
    }
    setProposal(nextProposal);
    // Same invariant as startSession: an applied proposal's snapshot is the
    // only rollback handle for content already written - keep it.
    if (proposalRef.current?.status !== "applied") setSnapshot(null);
    setTurns((prev) => [
      ...prev,
      {
        id: makeTurnId(),
        role: "system",
        text: `Patch proposal ready for ${nextProposal.targets
          .map((target) => `${target.label}${target.storage === "disk" ? " [disk]" : ""}`)
          .join(", ")}. Review and apply it below.`
      }
    ]);
  };

  /**
   * Current content of a target wherever it lives: the open document for
   * editor targets, the file on disk for disk targets (null when unreadable).
   */
  const currentTargetContent = async (target: {
    uri: string;
    storage?: "editor" | "disk";
  }): Promise<string | null> => {
    if (target.storage === "disk") {
      return window.tinder.tryReadText(target.uri);
    }
    return documents.find((doc) => doc.uri === target.uri)?.content ?? null;
  };

  const applyProposal = async () => {
    if (!proposal || !selectedPreset) return;
    const conflicts: string[] = [];
    for (const target of proposal.targets) {
      const current = await currentTargetContent(target);
      // Exact comparison - both strings are in hand, so a hash collision must
      // never be able to wave a destructive write through.
      if (current !== target.beforeContent) {
        conflicts.push(target.label);
      }
    }
    if (conflicts.length) {
      setProposal({ ...proposal, status: "conflict" });
      setError(`Cannot apply: content changed after proposal creation (${conflicts.join(", ")}).`);
      return;
    }
    const nextSnapshot: AiPatchSnapshot = {
      snapshotId: makeAiId("snapshot"),
      proposalId: proposal.id,
      createdAt: new Date().toISOString(),
      mode: proposal.mode,
      presetId: selectedPreset.id,
      targets: proposal.targets.map((target) => ({
        uri: target.uri,
        storage: target.storage,
        beforeContent: target.beforeContent,
        beforeHash: hashText(target.beforeContent),
        appliedContent: target.afterContent,
        appliedHash: hashText(target.afterContent)
      }))
    };
    let diskChanged = false;
    try {
      for (const target of proposal.targets) {
        if (target.storage === "disk") {
          await window.tinder.writeText(target.uri, target.afterContent);
          diskChanged = true;
        } else {
          updateContent(target.uri, target.afterContent);
        }
      }
    } catch (err) {
      // Partial apply: keep the snapshot so already-written targets stay
      // recoverable, and surface the failure instead of reporting success.
      setSnapshot(nextSnapshot);
      setProposal({ ...proposal, status: "conflict" });
      setError(`Apply failed midway: ${(err as Error).message}. Review the targets manually.`);
      if (diskChanged) void ca?.reload();
      return;
    }
    if (diskChanged) void ca?.reload();
    setSnapshot(nextSnapshot);
    setProposal({ ...proposal, status: "applied" });
    setError(null);
    setTurns((prev) => [
      ...prev,
      {
        id: makeTurnId(),
        role: "system",
        text: `Applied proposal ${proposal.id}. Snapshot ${nextSnapshot.snapshotId} is available for rollback.`
      }
    ]);
  };

  const discardProposal = () => {
    if (!proposal) return;
    setProposal({ ...proposal, status: "discarded" });
    setTurns((prev) => [
      ...prev,
      { id: makeTurnId(), role: "system", text: `Discarded proposal ${proposal.id}.` }
    ]);
  };

  const rollbackSnapshot = async () => {
    if (!snapshot) return;
    const conflicts: string[] = [];
    for (const target of snapshot.targets) {
      const current = await currentTargetContent(target);
      if (current !== target.appliedContent) {
        conflicts.push(target.uri);
      }
    }
    // Only mutate the proposal the snapshot belongs to - a newer draft in the
    // card must not be flipped by rolling back an older applied change.
    const ownsProposal = proposal?.id === snapshot.proposalId;
    if (conflicts.length) {
      setError("Cannot rollback automatically: target content changed after apply.");
      if (ownsProposal && proposal) setProposal({ ...proposal, status: "conflict" });
      return;
    }
    let diskChanged = false;
    try {
      for (const target of snapshot.targets) {
        if (target.storage === "disk") {
          await window.tinder.writeText(target.uri, target.beforeContent);
          diskChanged = true;
        } else {
          updateContent(target.uri, target.beforeContent);
        }
      }
    } catch (err) {
      setError(`Rollback failed midway: ${(err as Error).message}. Review the targets manually.`);
      if (ownsProposal && proposal) setProposal({ ...proposal, status: "conflict" });
      if (diskChanged) void ca?.reload();
      return;
    }
    if (diskChanged) void ca?.reload();
    setTurns((prev) => [
      ...prev,
      { id: makeTurnId(), role: "system", text: `Rolled back snapshot ${snapshot.snapshotId}.` }
    ]);
    setSnapshot(null);
    if (ownsProposal && proposal) setProposal({ ...proposal, status: "discarded" });
    setError(null);
  };

  const flushStreamBuffer = () => {
    if (streamRafRef.current != null) {
      cancelAnimationFrame(streamRafRef.current);
      streamRafRef.current = null;
    }
    const pending = streamBufRef.current;
    streamBufRef.current = null;
    if (!pending?.text) return;
    setTurns((prev) =>
      prev.map((turn) =>
        turn.id === pending.turnId ? { ...turn, text: turn.text + pending.text } : turn
      )
    );
  };

  const queueStreamDelta = (turnId: string, text: string) => {
    const buffered = streamBufRef.current;
    if (buffered && buffered.turnId === turnId) buffered.text += text;
    else {
      flushStreamBuffer();
      streamBufRef.current = { turnId, text };
    }
    if (streamRafRef.current == null) {
      streamRafRef.current = requestAnimationFrame(() => {
        streamRafRef.current = null;
        const pending = streamBufRef.current;
        if (!pending?.text) return;
        streamBufRef.current = { turnId: pending.turnId, text: "" };
        setTurns((prev) =>
          prev.map((turn) =>
            turn.id === pending.turnId ? { ...turn, text: turn.text + pending.text } : turn
          )
        );
      });
    }
  };

  const runCodexTask = async (text: string) => {
    if (!selectedPreset || busyRef.current) return;
    busyRef.current = true;
    const taskId = makeAiId("codex");
    setTurns((prev) => [
      ...prev,
      { id: makeTurnId(), role: "user", text },
      {
        id: makeTurnId(),
        role: "system",
        text: `Starting Codex read-only task.\nRoot: ${workPackage.rootPath ?? workPackage.rootLabel}\nSubject: ${workPackage.subjectLabel}`
      }
    ]);
    setPrompt("");
    setBusy(true);
    const codexContext = await collectContext();
    cleanupRef.current?.();
    cleanupRef.current = null;
    requestIdRef.current = taskId;
    runningKindRef.current = "codex";
    let offEvent: () => void = () => {};
    const finish = () => {
      offEvent();
      cleanupRef.current = null;
      requestIdRef.current = null;
      runningKindRef.current = null;
      busyRef.current = false;
      setBusy(false);
    };
    offEvent = window.tinder.ai.onCodexTaskEvent(taskId, (event) => {
      appendCodexEvent(event);
      if (event.exitCode !== undefined) {
        finish();
      }
    });
    cleanupRef.current = finish;
    try {
      await window.tinder.ai.startCodexTask({
        taskId,
        presetId: selectedPreset.id,
        mode,
        prompt: text,
        context: codexContext,
        cwd: workPackage.rootPath
      });
    } catch (err) {
      cleanupRef.current?.();
      cleanupRef.current = null;
      requestIdRef.current = null;
      runningKindRef.current = null;
      busyRef.current = false;
      setBusy(false);
      setError((err as Error).message ?? String(err));
      setTurns((prev) => [
        ...prev,
        { id: makeTurnId(), role: "error", text: (err as Error).message ?? String(err) }
      ]);
    }
  };

  /**
   * Shared streaming scaffold for API-backed requests. Owns the busy guard,
   * listener wiring/teardown, rAF-batched transcript updates, cancellation
   * display, and error display. `auto` layers proposal parsing on top via
   * `onDone` and discards partial payload text on cancel.
   */
  const startApiStream = async (opts: {
    requestMode: AiMode;
    text: string;
    writable?: AiResolvedWritableTarget[];
    discardPartialOnCancel?: boolean;
    /** Caller already holds the busy guard (e.g. auto mode acquires it before resolving targets). */
    acquired?: boolean;
    onDone?: (fullText: string, assistantId: string) => void;
  }) => {
    if (!selectedPreset) return;
    if (!opts.acquired) {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
    }
    const assistantId = makeTurnId();
    let accumulated = "";
    try {
      const context = await collectContext(opts.writable);
      const messages = historyMessages();
      setTurns((prev) => [
        ...prev,
        { id: makeTurnId(), role: "user", text: opts.text },
        { id: assistantId, role: "assistant", text: "" }
      ]);
      setPrompt("");
      cleanupRef.current?.();
      cleanupRef.current = null;
      const requestId = makeAiId("chat");
      requestIdRef.current = requestId;
      runningKindRef.current = "chat";
      const offDelta = window.tinder.ai.onChatDelta(requestId, (delta) => {
        accumulated += delta.text;
        queueStreamDelta(assistantId, delta.text);
      });
      let offEnd: () => void = () => {};
      let offError: () => void = () => {};
      const finish = () => {
        flushStreamBuffer();
        offDelta();
        offEnd();
        offError();
        cleanupRef.current = null;
        requestIdRef.current = null;
        runningKindRef.current = null;
        busyRef.current = false;
        setBusy(false);
      };
      offEnd = window.tinder.ai.onChatEnd(requestId, (end) => {
        if (end.reason === "cancelled") {
          flushStreamBuffer();
          setTurns((prev) =>
            prev.map((turn) =>
              turn.id === assistantId && (opts.discardPartialOnCancel || !turn.text)
                ? { ...turn, text: "[Cancelled]" }
                : turn
            )
          );
          finish();
          return;
        }
        finish();
        opts.onDone?.(accumulated, assistantId);
      });
      offError = window.tinder.ai.onChatError(requestId, (err) => {
        flushStreamBuffer();
        setTurns((prev) =>
          prev.map((turn) =>
            turn.id === assistantId
              ? {
                  ...turn,
                  role: "error",
                  text: err.status ? `${err.status}: ${err.message}` : err.message
                }
              : turn
          )
        );
        finish();
      });
      cleanupRef.current = finish;
      await window.tinder.ai.startChat({
        requestId,
        presetId: selectedPreset.id,
        mode: opts.requestMode,
        prompt: opts.text,
        context,
        messages
      });
    } catch (err) {
      cleanupRef.current?.();
      cleanupRef.current = null;
      requestIdRef.current = null;
      runningKindRef.current = null;
      busyRef.current = false;
      setBusy(false);
      const message = (err as Error).message ?? String(err);
      setError(message);
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === assistantId ? { ...turn, role: "error", text: message } : turn
        )
      );
    }
  };

  const runAutoProposal = async (text: string) => {
    if (!selectedPreset || busyRef.current) return;
    if (selectedPreset.backend !== "api") {
      setTurns((prev) => [
        ...prev,
        {
          id: makeTurnId(),
          role: "system",
          text: "Write-capable auto mode for Codex presets is a follow-up slice. Select a custom API preset to generate patch proposals."
        }
      ]);
      return;
    }
    // Acquire the busy guard before the async target resolution so a double
    // Ctrl+Enter cannot start two auto requests or duplicate session/notes.
    busyRef.current = true;
    setBusy(true);
    const release = () => {
      busyRef.current = false;
      setBusy(false);
    };
    let resolved: Awaited<ReturnType<typeof resolveWritableTargets>>;
    try {
      resolved = await resolveWritableTargets({ activeDocument, contextProfile });
    } catch (err) {
      release();
      setError((err as Error).message ?? String(err));
      return;
    }
    const { targets, skipped } = resolved;
    if (skipped.length) {
      setTurns((prev) => [
        ...prev,
        {
          id: makeTurnId(),
          role: "system",
          text: `Excluded from writable targets: ${skipped.join("; ")}.`
        }
      ]);
    }
    if (!targets.length) {
      release();
      setError(
        "Open a file document or load a chain profile before running auto mode - they are the writable targets for the patch proposal."
      );
      return;
    }
    const currentSession = ensureSession();
    await startApiStream({
      requestMode: "auto",
      text,
      writable: targets,
      acquired: true,
      // A partial payload is unusable JSON; keeping it would pollute both the
      // transcript and the replayed history.
      discardPartialOnCancel: true,
      onDone: (raw, assistantId) => finalizeAutoProposal(raw, assistantId, currentSession, targets)
    });
  };

  const runChat = async () => {
    const text = prompt.trim();
    if (!text || !selectedPreset || busyRef.current) return;
    setError(null);
    if (mode === "auto") {
      await runAutoProposal(text);
      return;
    }
    if (canRunCodex) {
      await runCodexTask(text);
      return;
    }
    if (!canRunApiChat) {
      setTurns((prev) => [
        ...prev,
        {
          id: makeTurnId(),
          role: "system",
          text: `${mode} mode is not wired for this preset yet.`
        }
      ]);
      return;
    }
    await startApiStream({ requestMode: mode, text });
  };

  const cancelChat = async () => {
    if (!requestIdRef.current) return;
    if (runningKindRef.current === "codex") {
      await window.tinder.ai.cancelCodexTask(requestIdRef.current);
    } else {
      await window.tinder.ai.cancelChat(requestIdRef.current);
    }
  };

  const visibleSession: AiSessionDescriptor = session ?? makeSessionDescriptor("draft");

  // Hashing and diffing proposal targets is O(content length); pin it to the
  // proposal identity so streaming re-renders don't recompute it per frame.
  const proposalTargetViews = useMemo(
    () =>
      (proposal?.targets ?? []).map((target) => ({
        uri: target.uri,
        label: target.label,
        storage: target.storage ?? "editor",
        beforeHash: hashText(target.beforeContent),
        afterHash: hashText(target.afterContent),
        diff: previewDiff(target.beforeContent, target.afterContent)
      })),
    [proposal]
  );

  return (
    <aside className="ai-panel" aria-label="AI panel">
      <header className="ai-panel-header">
        <span className="ai-panel-title">
          <span className="codicon codicon-sparkle" aria-hidden="true" />
          AI
        </span>
        <button
          type="button"
          className="ai-panel-close"
          onClick={toggleAiPanel}
          title="Close AI panel"
          aria-label="Close AI panel"
        >
          <span className="codicon codicon-close" aria-hidden="true" />
        </button>
      </header>

      <div className="ai-panel-body">
        <div className="ai-session-bar">
          <span className="ai-session-pill">
            <span className="codicon codicon-device-desktop" aria-hidden="true" />
            {visibleSession.providerLabel}
          </span>
          <span className="ai-session-pill" title={visibleSession.rootPath}>
            <span className="codicon codicon-folder" aria-hidden="true" />
            {visibleSession.rootLabel}
          </span>
          <span className="ai-session-pill">
            <span className="codicon codicon-git-branch" aria-hidden="true" />
            {visibleSession.branchLabel}
          </span>
          <select
            className="ai-select ai-session-target"
            value={executionTarget}
            onChange={(event) => setExecutionTarget(event.target.value as AiExecutionTarget)}
          >
            {EXECUTION_TARGETS.map((target) => (
              <option key={target} value={target}>
                {target === "root-main" ? "root/main" : target}
              </option>
            ))}
          </select>
          <button className="secondary-button ai-session-new" type="button" onClick={startSession}>
            <span className="codicon codicon-add" aria-hidden="true" />
          </button>
        </div>
        {executionTarget === "root-main" && (
          <div className="ai-session-warning">
            root/main writes require explicit review and snapshot rollback boundaries.
          </div>
        )}

        <div className="ai-toolbar">
          <select
            className="ai-select ai-mode-select"
            value={mode}
            onChange={(event) => setMode(event.target.value as AiMode)}
          >
            {availableModes.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            className="ai-select ai-model-select"
            value={presetId}
            onChange={(event) => choosePreset(event.target.value)}
          >
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
            <option value="__add__">Add Model...</option>
          </select>
        </div>

        {error && <p className="ai-error">{error}</p>}

        <div className="ai-card">
          <div className="ai-card-title">Selected preset</div>
          {selectedPreset ? (
            <>
              <div className="ai-card-main">{selectedPreset.label}</div>
              <div className="ai-card-meta">
                {selectedPreset.backend}
                {selectedPreset.reasoning?.displayName || selectedPreset.reasoning?.label
                  ? ` / ${selectedPreset.reasoning.displayName ?? selectedPreset.reasoning.label}`
                  : ""}
              </div>
            </>
          ) : (
            <>
              <div className="ai-card-main">No model configured</div>
              <button className="primary-button" type="button" onClick={openSettings}>
                Add Model
              </button>
            </>
          )}
        </div>

        {selectedPreset?.backend === "codex" && (
          <div className="ai-card">
            <div className="ai-card-title">Codex</div>
            <div className="ai-card-main">{codex?.status ?? "unknown"}</div>
            {codex?.message && <div className="ai-card-meta">{codex.message}</div>}
            {selectedCodexConfig?.command && (
              <div className="ai-card-meta">{selectedCodexConfig.command}</div>
            )}
          </div>
        )}

        {selectedPreset?.backend === "codex" && (
          <div className="ai-card ai-work-package">
            <div className="ai-card-title">Work package</div>
            <div className="ai-card-main">{workPackage.subjectLabel}</div>
            <div className="ai-card-meta">{workPackage.rootPath ?? workPackage.rootLabel}</div>
            {workPackage.subjectUri && <div className="ai-card-meta">{workPackage.subjectUri}</div>}
            <div className="ai-work-package-list">
              {workPackage.included.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
        )}

        {contextChips.length > 0 && (
          <div className="ai-context-chips">
            {contextChips.map((chip) => {
              const off = contextOff.has(chip.id);
              return (
                <button
                  key={chip.id}
                  type="button"
                  className={`ai-context-chip${off ? " is-off" : ""}`}
                  title={`${chip.detail ?? chip.label}${off ? " (excluded from context)" : ""}`}
                  aria-pressed={!off}
                  onClick={() => toggleContextSection(chip.id)}
                >
                  <span className={`codicon ${chip.icon}`} aria-hidden="true" />
                  {chip.label}
                </button>
              );
            })}
          </div>
        )}

        {proposal && proposal.status !== "discarded" && (
          <div className={`ai-card ai-proposal is-${proposal.status}`}>
            <div className="ai-card-title">Patch proposal</div>
            <div className="ai-card-main">{proposal.title}</div>
            <div className="ai-card-meta">
              {proposal.status} / {proposal.targets.length} file
              {proposal.targets.length === 1 ? "" : "s"}
            </div>
            {proposalTargetViews.map((target) => (
              <div className="ai-proposal-file" key={target.uri}>
                <div className="ai-proposal-file-head">
                  <span title={target.uri}>
                    {target.label}
                    {target.storage === "disk" ? " · disk" : ""}
                  </span>
                  <span>
                    {target.beforeHash} {"->"} {target.afterHash}
                  </span>
                </div>
                <pre className="ai-proposal-diff">{target.diff}</pre>
              </div>
            ))}
            <div className="ai-actions">
              <button
                className="primary-button"
                type="button"
                disabled={proposal.status !== "draft"}
                onClick={() => void applyProposal()}
              >
                Apply
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={proposal.status !== "draft"}
                onClick={discardProposal}
              >
                Discard
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={!snapshot}
                onClick={() => void rollbackSnapshot()}
              >
                Rollback
              </button>
            </div>
          </div>
        )}

        <div className="ai-transcript">
          {turns.length === 0 ? (
            <p className="sidebar-hint">
              Configure a custom API model, then ask a chat or plan question - or run auto mode
              on an open file to get an applyable patch proposal.
            </p>
          ) : (
            turns.map((turn) => (
              <div key={turn.id} className={`ai-turn is-${turn.role}`}>
                <div className="ai-turn-role">{turn.role}</div>
                <div className="ai-turn-text">{turn.text || (busy ? "..." : "")}</div>
              </div>
            ))
          )}
        </div>

        <textarea
          className="ai-prompt"
          placeholder="Ask about the current workspace..."
          rows={5}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void runChat();
            }
          }}
        />
        <div className="ai-actions">
          <button
            className="primary-button"
            type="button"
            disabled={busy || !prompt.trim() || !selectedPreset}
            onClick={() => void runChat()}
          >
            Run
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={!busy}
            onClick={() => void cancelChat()}
          >
            Cancel
          </button>
        </div>
      </div>
    </aside>
  );
}
