export interface AiProvider {
  readonly id: string;
  readonly displayName: string;
  /** True when this provider is reachable in the current network/runtime. */
  isAvailable(): Promise<boolean>;
  complete(input: AiCompletionInput): Promise<AiCompletionResult>;
  stream?(input: AiCompletionInput, onDelta: (delta: string) => void): Promise<AiCompletionResult>;
}

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiCompletionInput {
  /** Conversation messages — preferred form. */
  messages?: AiMessage[];
  /** Single-shot prompt — used when messages is omitted. */
  prompt?: string;
  /** Optional surrounding source context (file content, selection, etc.). */
  context?: string;
  /** Provider-specific overrides */
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AiCompletionResult {
  text: string;
  /** Optional usage metadata if the provider reports it. */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
}

export interface AiProviderRegistry {
  register(provider: AiProvider): void;
  get(id: string): AiProvider | undefined;
  list(): AiProvider[];
}

export class InMemoryProviderRegistry implements AiProviderRegistry {
  private readonly providers = new Map<string, AiProvider>();

  register(provider: AiProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): AiProvider | undefined {
    return this.providers.get(id);
  }

  list(): AiProvider[] {
    return [...this.providers.values()];
  }
}
