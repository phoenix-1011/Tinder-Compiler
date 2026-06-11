import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  parseAiProposalPayload,
  type AiCodexTaskEvent,
  type AiMessage,
  type AiMode,
  type AiModelPreset,
  type AiPatchProposal,
  type AiPatchProposalTarget,
  type AiPatchSnapshot,
  type AiProposalPayload,
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
  type AiResolvedWritableTarget
} from "../state/aiContext";

const ALL_AI_MODES: AiMode[] = ["chat", "auto", "plan", "debug"];
const MAX_HISTORY_TURNS = 12;
const MAX_HISTORY_TURN_CHARS = 4000;
const MAX_HISTORY_TOTAL_CHARS = 16000;
const MAX_ATTACHMENTS = 6;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const OPEN_FOLDER_OPTION = "__open_folder__";
const PROPOSAL_STATUS_LABEL: Record<AiPatchProposal["status"], string> = {
  draft: "草稿",
  applied: "已应用",
  discarded: "已放弃",
  conflict: "冲突"
};
// Mode codes stay as API/UI values; only the dropdown display is localized.
const MODE_LABEL: Record<string, string> = {
  chat: "对话",
  plan: "计划",
  auto: "自动",
  debug: "调试"
};

interface ChatTurn {
  id: string;
  role: "user" | "assistant" | "command" | "stderr" | "error" | "system";
  text: string;
  /** Data-URL images attached to a user turn, shown inline in the transcript. */
  images?: string[];
}

/**
 * One conversation tab. Each session owns its transcript, proposal, and
 * rollback snapshot so switching tabs never loses in-flight work. Mode and
 * model preset stay panel-global (chosen in the composer). `useWorktree` is
 * declarative for now - the real git worktree backend is the deferred P8
 * slice; it only records intent and is shown in the UI.
 */
interface AiChatSession {
  id: string;
  turns: ChatTurn[];
  proposal: AiPatchProposal | null;
  snapshot: AiPatchSnapshot | null;
  useWorktree: boolean;
}

function makeSession(): AiChatSession {
  return {
    id: makeAiId("session"),
    turns: [],
    proposal: null,
    snapshot: null,
    useWorktree: false
  };
}

function sessionTitle(session: AiChatSession, index: number): string {
  const firstUser = session.turns.find((turn) => turn.role === "user")?.text.trim();
  if (firstUser) {
    const oneLine = firstUser.replace(/\s+/g, " ");
    return oneLine.length > 24 ? `${oneLine.slice(0, 24)}…` : oneLine;
  }
  return `新对话 ${index + 1}`;
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
  const { openSettings } = useUI();
  const { activeUri, documents, folder, updateContent, appMode, canvasProfileId, openFolder, openFolderByPath } =
    useWorkspace();
  const { config: projectConfig } = useProject();
  const ca = useOptionalCa();
  const [settings, setSettings] = useState<UserAiSettings | null>(null);
  const [codex, setCodex] = useState<CodexStatus | null>(null);
  const [mode, setMode] = useState<AiMode>("chat");
  const [presetId, setPresetId] = useState<string>("");
  const [sessions, setSessions] = useState<AiChatSession[]>(() => [makeSession()]);
  const [activeSessionId, setActiveSessionId] = useState<string>(() => sessions[0].id);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  // Which session owns the single in-flight request, so the Stop button only
  // shows on that tab (busy is otherwise panel-global).
  const [runningSessionId, setRunningSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentFolders, setRecentFolders] = useState<{ name: string; path: string }[]>([]);
  // Image attachments for the next request (data URLs). Panel-level, cleared
  // when a request starts. Sent to the model as vision content parts.
  const [attachments, setAttachments] = useState<{ id: string; name: string; dataUrl: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? sessions[0],
    [sessions, activeSessionId]
  );
  const turns = activeSession?.turns ?? [];
  const proposal = activeSession?.proposal ?? null;
  const snapshot = activeSession?.snapshot ?? null;

  // Session-targeted mutators. Streaming callbacks capture the session id at
  // request start, so a mid-stream tab switch never misroutes deltas.
  const updateTurns = useCallback(
    (sessionId: string, updater: (prev: ChatTurn[]) => ChatTurn[]) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, turns: updater(s.turns) } : s))
      );
    },
    []
  );
  const patchSession = useCallback(
    (sessionId: string, patch: (s: AiChatSession) => Partial<AiChatSession>) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, ...patch(s) } : s))
      );
    },
    []
  );
  // Active-session shims keep the synchronous handlers (apply/discard/rollback)
  // unchanged; streaming handlers shadow these with id-bound locals.
  const setTurns = (updater: (prev: ChatTurn[]) => ChatTurn[]) => updateTurns(activeSessionId, updater);
  const setProposal = (value: AiPatchProposal | null) =>
    patchSession(activeSessionId, () => ({ proposal: value }));
  const setSnapshot = (value: AiPatchSnapshot | null) =>
    patchSession(activeSessionId, () => ({ snapshot: value }));
  const requestIdRef = useRef<string | null>(null);
  const runningKindRef = useRef<"chat" | "codex" | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  // Synchronous re-entrancy guard: `busy` state lags awaits inside the run
  // handlers (context collection does IPC), so a double Ctrl+Enter could
  // otherwise start two concurrent requests.
  const busyRef = useRef(false);
  // Streaming deltas are buffered and flushed once per animation frame so a
  // long transcript is not cloned and re-rendered per token.
  const streamBufRef = useRef<{ sessionId: string; turnId: string; text: string } | null>(null);
  const streamRafRef = useRef<number | null>(null);
  // Mirror the current selection into refs so reloadSettings can preserve it
  // without re-creating its callback (and re-running the mount effect) on
  // every user selection change.
  const presetIdRef = useRef(presetId);
  presetIdRef.current = presetId;
  const modeRef = useRef(mode);
  modeRef.current = mode;

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

  // Stick-to-bottom transcript scrolling: follow streaming output unless the
  // user has scrolled up to read something.
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const handleTranscriptScroll = () => {
    const el = transcriptRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };
  useEffect(() => {
    const el = transcriptRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [turns, proposal]);

  // Recent folders for the new-session path picker. Selecting one opens it as
  // the workspace (the AI session root always follows the open workspace).
  useEffect(() => {
    let cancelled = false;
    const recent = window.tinder?.recent;
    if (!recent) return;
    void recent.list().then((list) => {
      if (!cancelled) setRecentFolders(list.map((item) => ({ name: item.name, path: item.path })));
    });
    return () => {
      cancelled = true;
    };
  }, [folder?.path]);

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
  // Project / chain-profile / canvas-selection / active-document context is
  // always collected automatically (the per-chip toggles were removed); the
  // composer attachment row is now reserved for image resources.
  const collectContext = async (
    writable?: AiResolvedWritableTarget[]
  ): Promise<string | undefined> => {
    const sections: Array<AiContextSection | null> = [];
    const coveredByWritable = (uri: string | undefined) =>
      Boolean(uri && writable?.some((target) => samePath(target.uri, uri)));
    sections.push(buildProjectSection(folder, projectConfig));
    // The structural profile summary is redundant when the profile travels as
    // a full-content writable target.
    if (!coveredByWritable(contextProfile?.id)) {
      sections.push(buildChainProfileSection(contextProfile));
    }
    if (appMode === "canvas") {
      try {
        sections.push(await buildCanvasSelectionSection(ca, canvasProfileId));
      } catch {
        // Selection context is best-effort; a failed read should not block the request.
      }
    }
    if (!coveredByWritable(activeDocument?.uri)) {
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
  const sessionStarted = turns.length > 0;

  // Create a fresh conversation tab and focus it.
  const newSession = () => {
    const next = makeSession();
    setSessions((prev) => [...prev, next]);
    setActiveSessionId(next.id);
    setError(null);
  };

  const closeSession = (id: string) => {
    const remaining = sessionsRef.current.filter((s) => s.id !== id);
    if (!remaining.length) {
      // Closing the only tab: replace with a fresh one and focus it. Creating
      // the session outside the state updater keeps the new id in sync with
      // activeSessionId (a fresh id minted inside the updater would not be
      // visible to setActiveSessionId).
      const fresh = makeSession();
      setSessions([fresh]);
      setActiveSessionId(fresh.id);
      return;
    }
    setSessions(remaining);
    setActiveSessionId((current) => (current === id ? remaining[0].id : current));
  };

  const readImageFile = (file: File) =>
    new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });

  const addImageFiles = async (files: Iterable<File>) => {
    const next: { id: string; name: string; dataUrl: string }[] = [];
    let rejected = false;
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > MAX_ATTACHMENT_BYTES) {
        rejected = true;
        continue;
      }
      const dataUrl = await readImageFile(file);
      if (dataUrl) next.push({ id: makeAiId("img"), name: file.name || "image", dataUrl });
    }
    if (rejected) {
      setError(`图片需小于 ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB，已跳过过大的文件。`);
    }
    if (next.length) {
      setAttachments((prev) => {
        const merged = [...prev, ...next];
        if (merged.length > MAX_ATTACHMENTS) {
          setError(`最多附加 ${MAX_ATTACHMENTS} 张图片，多余的已忽略。`);
        }
        return merged.slice(0, MAX_ATTACHMENTS);
      });
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const selectFolder = (value: string) => {
    if (value === OPEN_FOLDER_OPTION) {
      void openFolder();
      return;
    }
    if (value && value !== folder?.path) void openFolderByPath(value);
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
      openSettings("ai");
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

  const appendCodexEvent = (sessionId: string, event: AiCodexTaskEvent) => {
    if (event.kind === "complete" && event.exitCode === 0) {
      updateTurns(sessionId, (prev) => [
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
    updateTurns(sessionId, (prev) => [...prev, { id: makeTurnId(), role, text }]);
  };

  const proposalFromPayload = (
    payload: AiProposalPayload,
    sessionId: string,
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
        sessionId,
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
    sessionId: string,
    resolved: AiResolvedWritableTarget[]
  ) => {
    const result = parseAiProposalPayload(
      raw,
      resolved.map((target) => target.uri)
    );
    if (!result.ok) {
      updateTurns(sessionId, (prev) => [
        ...prev,
        {
          id: makeTurnId(),
          role: "error",
          text: `无法将回复转换为补丁提案：${result.error}`
        }
      ]);
      return;
    }
    const { payload } = result;
    const readable = [payload.title, payload.summary].filter(Boolean).join("\n\n");
    updateTurns(sessionId, (prev) =>
      prev.map((turn) =>
        turn.id === assistantId && readable ? { ...turn, text: readable } : turn
      )
    );
    const { proposal: nextProposal, error: proposalError } = proposalFromPayload(
      payload,
      sessionId,
      resolved
    );
    if (proposalError) {
      updateTurns(sessionId, (prev) => [
        ...prev,
        {
          id: makeTurnId(),
          role: "error",
          text: `无法将回复转换为补丁提案：${proposalError}`
        }
      ]);
      return;
    }
    if (!nextProposal) {
      updateTurns(sessionId, (prev) => [
        ...prev,
        {
          id: makeTurnId(),
          role: "system",
          text: "模型未返回可应用的目标，未创建补丁提案。"
        }
      ]);
      return;
    }
    // An applied proposal's snapshot is the only rollback handle for content
    // already written - keep it when replacing the proposal.
    patchSession(sessionId, (s) => ({
      proposal: nextProposal,
      snapshot: s.proposal?.status === "applied" ? s.snapshot : null,
      turns: [
        ...s.turns,
        {
          id: makeTurnId(),
          role: "system" as const,
          text: `已生成补丁提案：${nextProposal.targets
            .map((target) => `${target.label}${target.storage === "disk" ? "（磁盘）" : ""}`)
            .join("、")}。请在下方审阅并应用。`
        }
      ]
    }));
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
      setError(`无法应用：提案生成后目标内容已改变（${conflicts.join("、")}）。`);
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
      setError(`应用中途失败：${(err as Error).message}。请手动检查目标文件。`);
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
        text: `已应用提案。可使用快照回滚。`
      }
    ]);
  };

  const discardProposal = () => {
    if (!proposal) return;
    setProposal({ ...proposal, status: "discarded" });
    setTurns((prev) => [
      ...prev,
      { id: makeTurnId(), role: "system", text: `已放弃补丁提案。` }
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
      setError("无法自动回滚：应用后目标内容已改变。");
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
      setError(`回滚中途失败：${(err as Error).message}。请手动检查目标文件。`);
      if (ownsProposal && proposal) setProposal({ ...proposal, status: "conflict" });
      if (diskChanged) void ca?.reload();
      return;
    }
    if (diskChanged) void ca?.reload();
    setTurns((prev) => [
      ...prev,
      { id: makeTurnId(), role: "system", text: `已回滚到应用前的内容。` }
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
    updateTurns(pending.sessionId, (prev) =>
      prev.map((turn) =>
        turn.id === pending.turnId ? { ...turn, text: turn.text + pending.text } : turn
      )
    );
  };

  const queueStreamDelta = (sessionId: string, turnId: string, text: string) => {
    const buffered = streamBufRef.current;
    if (buffered && buffered.turnId === turnId) buffered.text += text;
    else {
      flushStreamBuffer();
      streamBufRef.current = { sessionId, turnId, text };
    }
    if (streamRafRef.current == null) {
      streamRafRef.current = requestAnimationFrame(() => {
        streamRafRef.current = null;
        const pending = streamBufRef.current;
        if (!pending?.text) return;
        streamBufRef.current = { sessionId: pending.sessionId, turnId: pending.turnId, text: "" };
        updateTurns(pending.sessionId, (prev) =>
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
    setRunningSessionId(activeSessionId);
    const sid = activeSessionId;
    const taskId = makeAiId("codex");
    const imageUrls = attachments.map((item) => item.dataUrl);
    updateTurns(sid, (prev) => [
      ...prev,
      { id: makeTurnId(), role: "user", text, images: imageUrls.length ? imageUrls : undefined },
      {
        id: makeTurnId(),
        role: "system",
        text: `正在启动 Codex 只读任务。\n根目录：${workPackage.rootPath ?? workPackage.rootLabel}\n对象：${workPackage.subjectLabel}`
      }
    ]);
    setPrompt("");
    setAttachments([]);
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
      setRunningSessionId(null);
    };
    offEvent = window.tinder.ai.onCodexTaskEvent(taskId, (event) => {
      appendCodexEvent(sid, event);
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
        cwd: workPackage.rootPath,
        images: imageUrls.length ? imageUrls : undefined
      });
    } catch (err) {
      cleanupRef.current?.();
      cleanupRef.current = null;
      requestIdRef.current = null;
      runningKindRef.current = null;
      busyRef.current = false;
      setBusy(false);
      setError((err as Error).message ?? String(err));
      updateTurns(sid, (prev) => [
        ...prev,
        { id: makeTurnId(), role: "error", text: (err as Error).message ?? String(err) }
      ]);
      setRunningSessionId(null);
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
    setRunningSessionId(activeSessionId);
    const sid = activeSessionId;
    const assistantId = makeTurnId();
    const imageUrls = attachments.map((item) => item.dataUrl);
    let accumulated = "";
    // Capture history BEFORE pushing the new turns, and record the user turn +
    // clear the composer up front, so a throw in collectContext still leaves a
    // recorded turn and an empty composer (no stuck attachments, no lost turn).
    const messages = historyMessages();
    updateTurns(sid, (prev) => [
      ...prev,
      {
        id: makeTurnId(),
        role: "user",
        text: opts.text,
        images: imageUrls.length ? imageUrls : undefined
      },
      { id: assistantId, role: "assistant", text: "" }
    ]);
    setPrompt("");
    setAttachments([]);
    try {
      const context = await collectContext(opts.writable);
      cleanupRef.current?.();
      cleanupRef.current = null;
      const requestId = makeAiId("chat");
      requestIdRef.current = requestId;
      runningKindRef.current = "chat";
      const offDelta = window.tinder.ai.onChatDelta(requestId, (delta) => {
        accumulated += delta.text;
        queueStreamDelta(sid, assistantId, delta.text);
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
        setRunningSessionId(null);
      };
      offEnd = window.tinder.ai.onChatEnd(requestId, (end) => {
        if (end.reason === "cancelled") {
          flushStreamBuffer();
          updateTurns(sid, (prev) =>
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
        updateTurns(sid, (prev) =>
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
        messages,
        images: imageUrls.length ? imageUrls : undefined
      });
    } catch (err) {
      cleanupRef.current?.();
      cleanupRef.current = null;
      requestIdRef.current = null;
      runningKindRef.current = null;
      busyRef.current = false;
      setBusy(false);
      setRunningSessionId(null);
      const message = (err as Error).message ?? String(err);
      setError(message);
      updateTurns(sid, (prev) =>
        prev.map((turn) =>
          turn.id === assistantId ? { ...turn, role: "error", text: message } : turn
        )
      );
    }
  };

  const runAutoProposal = async (text: string) => {
    if (!selectedPreset || busyRef.current) return;
    const sid = activeSessionId;
    if (selectedPreset.backend !== "api") {
      updateTurns(sid, (prev) => [
        ...prev,
        {
          id: makeTurnId(),
          role: "system",
          text: "Codex 预设的写入式 auto 模式尚未实现，请选择自定义 API 预设来生成补丁提案。"
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
      updateTurns(sid, (prev) => [
        ...prev,
        {
          id: makeTurnId(),
          role: "system",
          text: `已从可写目标中排除：${skipped.join("；")}。`
        }
      ]);
    }
    if (!targets.length) {
      release();
      setError(
        "运行 auto 模式前请先打开一个文件或加载链路 profile —— 它们是补丁提案的可写目标。"
      );
      return;
    }
    await startApiStream({
      requestMode: "auto",
      text,
      writable: targets,
      acquired: true,
      // A partial payload is unusable JSON; keeping it would pollute both the
      // transcript and the replayed history.
      discardPartialOnCancel: true,
      onDone: (raw, assistantId) => finalizeAutoProposal(raw, assistantId, sid, targets)
    });
  };

  const runChat = async () => {
    // AI is temporarily disabled in canvas mode: canvas edits and AI-applied
    // profile writes are not coordinated yet. The panel renders a notice, but
    // guard here too in case of stale UI.
    if (appMode === "canvas") return;
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
          text: `该预设暂不支持 ${MODE_LABEL[mode] ?? mode} 模式。`
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

  // Show a login prompt only when a Codex preset is selected and it is not
  // usable yet (not signed in / not installed / errored). A validated or
  // credentials-found state is treated as ready.
  const codexNeedsLogin =
    selectedPreset?.backend === "codex" &&
    codex != null &&
    codex.status !== "signed-in" &&
    codex.status !== "credentials-found";

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
      {appMode === "canvas" ? (
        <div className="ai-panel-body">
          <div className="ai-empty ai-disabled">
            <span className="codicon codicon-circle-slash" aria-hidden="true" />
            <p className="ai-empty-title">画布模式下暂不可用</p>
            <p className="ai-empty-hint">
              画布编辑与 AI 写入链路尚未协调。切回 profile 视图即可使用 AI 面板。
            </p>
          </div>
        </div>
      ) : (
        <div className="ai-panel-body">
          <div className="ai-tabbar" role="tablist">
            <div className="ai-tabs">
              {sessions.map((session, index) => (
                <div
                  key={session.id}
                  className={`ai-tab${session.id === activeSessionId ? " is-active" : ""}`}
                  role="tab"
                  aria-selected={session.id === activeSessionId}
                  tabIndex={0}
                  title={sessionTitle(session, index)}
                  onClick={() => setActiveSessionId(session.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setActiveSessionId(session.id);
                    }
                  }}
                >
                  <span className="ai-tab-label">{sessionTitle(session, index)}</span>
                  {sessions.length > 1 && (
                    <button
                      type="button"
                      className="ai-tab-close"
                      title="关闭会话"
                      aria-label="关闭会话"
                      onClick={(event) => {
                        event.stopPropagation();
                        closeSession(session.id);
                      }}
                    >
                      <span className="codicon codicon-close" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              className="ai-tab-new"
              type="button"
              onClick={newSession}
              title="新建会话"
              aria-label="新建会话"
            >
              <span className="codicon codicon-add" aria-hidden="true" />
            </button>
          </div>
          <div className="ai-transcript" ref={transcriptRef} onScroll={handleTranscriptScroll}>
            {codexNeedsLogin ? (
              <div className="ai-empty">
                <span className="codicon codicon-key" aria-hidden="true" />
                <p className="ai-empty-title">Codex 未登录</p>
                <p className="ai-empty-hint">
                  需要先登录 Codex 才能运行任务{codex?.message ? `（${codex.message}）` : ""}。
                </p>
                <button className="primary-button" type="button" onClick={() => openSettings("ai")}>
                  前往登录
                </button>
              </div>
            ) : turns.length === 0 ? (
              <div className="ai-empty">
                {selectedPreset ? (
                  <p className="ai-empty-title">向当前工作区提问</p>
                ) : (
                  <>
                    <span className="codicon codicon-sparkle" aria-hidden="true" />
                    <p className="ai-empty-title">未配置模型</p>
                    <p className="ai-empty-hint">
                      添加一个自定义 API 模型或 Codex 预设后即可使用 AI 面板。
                    </p>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => openSettings("ai")}
                    >
                      添加模型
                    </button>
                  </>
                )}
              </div>
            ) : (
              turns.map((turn) => (
                <div key={turn.id} className={`ai-turn is-${turn.role}`}>
                  {turn.role !== "user" && turn.role !== "assistant" && (
                    <div className="ai-turn-role">{turn.role}</div>
                  )}
                  {turn.images?.length ? (
                    <div className="ai-turn-images">
                      {turn.images.map((src, index) => (
                        <img key={index} src={src} alt={`attachment ${index + 1}`} />
                      ))}
                    </div>
                  ) : null}
                  {turn.text ? (
                    <div className="ai-turn-text">{turn.text}</div>
                  ) : turn.role === "assistant" && busy ? (
                    <div className="ai-typing" aria-label="Generating">
                      <i />
                      <i />
                      <i />
                    </div>
                  ) : turn.images?.length ? null : (
                    <div className="ai-turn-text" />
                  )}
                </div>
              ))
            )}

            {proposal && proposal.status !== "discarded" && (
              <div className={`ai-card ai-proposal is-${proposal.status}`}>
                <div className="ai-card-title">补丁提案</div>
                <div className="ai-card-main">{proposal.title}</div>
                <div className="ai-card-meta">
                  {PROPOSAL_STATUS_LABEL[proposal.status]} · {proposal.targets.length} 个文件
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
                    应用
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={proposal.status !== "draft"}
                    onClick={discardProposal}
                  >
                    放弃
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={!snapshot}
                    onClick={() => void rollbackSnapshot()}
                  >
                    回滚
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="ai-composer-area">
            {error && <p className="ai-error">{error}</p>}
            {!sessionStarted && (
              <div className="ai-config-row">
                <div className="ai-pill ai-config-folder-pill">
                  <span className="codicon codicon-folder" aria-hidden="true" />
                  <select
                    className="ai-pill-select"
                    value={folder?.path ?? ""}
                    onChange={(event) => selectFolder(event.target.value)}
                    title={folder?.path ?? "工作区文件夹"}
                  >
                    {!folder && (
                      <option value="" disabled>
                        未打开文件夹
                      </option>
                    )}
                    {folder && <option value={folder.path}>{folder.name}</option>}
                    {recentFolders
                      .filter((item) => item.path !== folder?.path)
                      .map((item) => (
                        <option key={item.path} value={item.path}>
                          {item.name}
                        </option>
                      ))}
                    <option value={OPEN_FOLDER_OPTION}>打开文件夹…</option>
                  </select>
                </div>
                <label
                  className={`ai-pill ai-worktree-pill${
                    activeSession?.useWorktree ? " is-on" : ""
                  }`}
                  title="勾选后新建 worktree 写入，否则在当前目录写入"
                >
                  <input
                    type="checkbox"
                    checked={activeSession?.useWorktree ?? false}
                    onChange={(event) =>
                      patchSession(activeSessionId, () => ({ useWorktree: event.target.checked }))
                    }
                  />
                  <span className="codicon codicon-git-merge" aria-hidden="true" />
                  worktree
                </label>
              </div>
            )}
            {attachments.length > 0 && (
              <div className="ai-attachments">
                {attachments.map((item) => (
                  <div className="ai-attachment" key={item.id} title={item.name}>
                    <img src={item.dataUrl} alt={item.name} />
                    <button
                      type="button"
                      className="ai-attachment-remove"
                      title="移除图片"
                      aria-label="移除图片"
                      onClick={() => removeAttachment(item.id)}
                    >
                      <span className="codicon codicon-close" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => {
                if (event.target.files) void addImageFiles(Array.from(event.target.files));
                event.target.value = "";
              }}
            />
            <div className="ai-composer">
              <textarea
                className="ai-prompt"
                placeholder="向当前工作区提问…（Enter 发送，Shift+Enter 换行）"
                rows={3}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onPaste={(event) => {
                  const files = Array.from(event.clipboardData.files).filter((file) =>
                    file.type.startsWith("image/")
                  );
                  if (files.length) {
                    event.preventDefault();
                    void addImageFiles(files);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  // Plain Enter sends; Shift+Enter inserts a newline. Never
                  // send mid-IME-composition (Chinese input confirms with Enter).
                  if (event.nativeEvent.isComposing) return;
                  if (event.shiftKey) return;
                  event.preventDefault();
                  void runChat();
                }}
              />
              <div className="ai-composer-footer">
                <select
                  className="ai-select ai-mode-select"
                  value={mode}
                  onChange={(event) => setMode(event.target.value as AiMode)}
                  title="模式"
                >
                  {availableModes.map((item) => (
                    <option key={item} value={item}>
                      {MODE_LABEL[item] ?? item}
                    </option>
                  ))}
                </select>
                <select
                  className="ai-select ai-model-select"
                  value={presetId}
                  onChange={(event) => choosePreset(event.target.value)}
                  title="模型预设"
                >
                  {presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                  <option value="__add__">添加模型…</option>
                </select>
                <span className="ai-composer-spacer" />
                <button
                  type="button"
                  className="ai-attach-btn"
                  title="添加图片"
                  aria-label="添加图片"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <span className="codicon codicon-add" aria-hidden="true" />
                </button>
                {busy && runningSessionId === activeSessionId ? (
                  <button
                    type="button"
                    className="ai-send-btn is-stop"
                    onClick={() => void cancelChat()}
                    title="停止"
                    aria-label="停止生成"
                  >
                    <span className="codicon codicon-debug-stop" aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ai-send-btn"
                    disabled={busy || !prompt.trim() || !selectedPreset}
                    onClick={() => void runChat()}
                    title={busy ? "另一个会话正在生成…" : "发送（Enter）"}
                    aria-label="发送"
                  >
                    <span className="ai-send-glyph" aria-hidden="true">↵</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
