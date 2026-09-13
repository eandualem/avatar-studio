import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
export const maxDuration = 180;
const url = (voice: boolean) =>
  (
    (voice ? process.env.VOICE_RUNTIME_URL : undefined) ||
    process.env.RUNTIME_URL ||
    "http://127.0.0.1:7100"
  ).replace(/\/$/, "");
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ operation: string }> },
) {
  const { operation } = await params;
  if (!["chat", "cancel", "voice-chat", "voice-cancel"].includes(operation))
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin)
    return NextResponse.json({ detail: "Origin not allowed" }, { status: 403 });
  try {
    const body = await request.json();
    const path = operation.endsWith("chat")
      ? "/api/chat"
      : `/api/chat/${z.string().uuid().parse(body.session_id)}/cancel`;
    const response = await fetch(url(operation.startsWith("voice-")) + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: operation.endsWith("chat") ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(170000),
    });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return NextResponse.json({ detail: "Invalid request" }, { status: 400 });
    return NextResponse.json(
      {
        detail:
          "The assistant runtime is unavailable. Start the local runtime and try again.",
      },
      { status: 503 },
    );
  }
}
