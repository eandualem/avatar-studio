import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sameOrigin } from "@/lib/request-origin";
import {
  runtimeUrl,
  withBodyConfig,
  withTextConfig,
} from "@/lib/runtime-config";
export const maxDuration = 180;
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ operation: string }> },
) {
  const { operation } = await params;
  if (!["chat", "cancel", "body-chat", "body-cancel"].includes(operation))
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  if (!sameOrigin(request))
    return NextResponse.json({ detail: "Origin not allowed" }, { status: 403 });
  try {
    const body = z.record(z.string(), z.unknown()).parse(await request.json());
    const isBody = operation.startsWith("body-");
    const path = operation.endsWith("chat")
      ? "/api/chat"
      : `/api/chat/${z.string().uuid().parse(body.session_id)}/cancel`;
    const response = await fetch(runtimeUrl(isBody ? "body" : "text") + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        operation === "body-chat"
          ? withBodyConfig(body)
          : operation === "chat"
            ? withTextConfig(body)
            : body,
      ),
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
