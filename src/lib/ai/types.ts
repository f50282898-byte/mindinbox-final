/**
 * Shared AI types.
 *
 * The provider adapters all normalise onto these, so the chain, the SSE layer
 * and the route never learn a provider's wire format.
 */

/** Roles use OpenAI spelling. Gemini maps `assistant` to `model` internally. */
export type MessageRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

/**
 * One event of the unified stream.
 *
 * Every provider's chunk stream is translated into exactly this shape before it
 * reaches the client, so the browser has one parser rather than five.
 */
export type StreamEvent =
  /** A chunk of assistant text. `delta` may be empty for keep-alive frames. */
  | { type: "delta"; delta: string }
  /** The provider answered and the stream is closing normally. */
  | { type: "done"; usage: Usage }
  /** Remaining allowance, sent once when the response starts. */
  | { type: "quota"; remaining: number }
  /** Terminal failure. No further events follow. */
  | { type: "error"; code: StreamErrorCode; message: string };

export type StreamErrorCode =
  | "provider_unavailable"
  | "timeout_first_token"
  | "output_truncated"
  | "upstream_error"
  | "cancelled";

export interface Usage {
  /** Input tokens, when the provider reports them. */
  promptTokens: number | null;
  /** Output tokens, when the provider reports them. */
  completionTokens: number | null;
}

/** What a provider adapter must expose. */
export interface ProviderAdapter {
  readonly id: string;
  readonly label: string;
  /** True when an API key for this provider is present. */
  configured(): boolean;

  /**
   * Opens a streaming completion.
   *
   * Must resolve as soon as the response *headers* arrive and hand back a
   * readable stream, so the chain can apply its time-to-first-token budget
   * against the provider rather than against the whole response.
   */
  stream(args: ProviderCall): Promise<ProviderStream>;
}

export interface ProviderCall {
  messages: ChatMessage[];
  model: string;
  maxOutputTokens: number;
  temperature: number;
  /** Aborts the upstream request. Fires when the client disconnects. */
  signal: AbortSignal;
}

export interface ProviderStream {
  /** Async iterator of text deltas, already normalised. */
  chunks: AsyncIterable<string>;
  /** Resolves after the stream ends. Null when the provider did not report it. */
  usage: () => Promise<Usage | null>;
}

/** Why an attempt was abandoned. */
export type AttemptFailure =
  | "not_configured"
  | "circuit_open"
  | "timeout_first_token"
  | "upstream_status"
  | "network"
  | "empty_first_chunk"
  | "cancelled"
  | "aborted_before_stream";

/** Role a request plays. Each role has its own chain and its own models. */
export type AiRole = "chat" | "analysis" | "admin";
