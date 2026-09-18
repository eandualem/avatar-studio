/** The shapes shared by the expression controller, the planner transport and the facts sent to Live. */
import type { Pending, ToolReceipt } from "@/types/conversation";
import type { bodyContext } from "./body-tools";

export type BodyRequest = {
  id: string;
  session_id: string;
  revision: number;
  host_context: ReturnType<typeof bodyContext>;
};
export interface BodyTransport {
  decide(request: BodyRequest, signal: AbortSignal): Promise<Pending | null>;
  receipt(
    request: BodyRequest,
    pending: Pending,
    receipt: ToolReceipt,
  ): Promise<void>;
  cancel(sessionId: string, requestId: string): Promise<void>;
}
export type BodyAction = {
  id: string;
  revision: number;
  utteranceId: string;
  intent: "explicit" | "incidental";
  label: string;
  status:
    | "requested"
    | "started"
    | "ongoing"
    | "completed"
    | "canceled"
    | "failed"
    | "held";
  utteranceAt: number;
  requestedAt: number;
  toolReturnedAt?: number;
  startedAt?: number;
  endedAt?: number;
  detail?: string;
};
export type BodyView = {
  active?: BodyAction;
  still: boolean;
  actions: BodyAction[];
  /** The expression loop's latest Jev round trip, when that loop is in use. */
  pulse?: Pulse;
  /** The last Jev round trips with what code did about each, newest last. */
  pulses?: Pulse[];
};
export type Pulse = {
  calls: number;
  /** Milliseconds since the call began, for reading a trace in order. */
  at: number;
  latencyMs: number;
  /** The latest line Jev saw and whether it was complete. */
  line: string;
  verdict: string;
  /** What code did with the answers: a gesture, a stop, a plan, or why nothing. */
  outcome: string;
  error?: string;
};

// One controller owns one Live call. Decisions are event-driven; the engine alone
