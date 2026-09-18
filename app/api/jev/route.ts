import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sameOrigin } from "@/lib/request-origin";
import { APP_PROFILE, runtimeUrl } from "@/lib/runtime-config";
import { jevRequestSchema } from "@/types/jev";

/**
 * The browser sends a state and typed questions; this forwards them, with the
 * app's profile, to the runtime's decision capability (POST /api/decisions)
 * and returns its answers and errors unchanged. The runtime holds the
 * TypeSafe key; Jev is not a chat model, so it is a capability, not a provider.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return NextResponse.json({ detail: "Origin not allowed" }, { status: 403 });
  try {
    const body = jevRequestSchema.parse(await request.json());
    const response = await fetch(`${runtimeUrl("text")}/api/decisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, profile: APP_PROFILE }),
      signal: AbortSignal.timeout(10000),
    });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return NextResponse.json({ detail: "Invalid request" }, { status: 400 });
    return NextResponse.json(
      { detail: "The assistant runtime did not answer the decision in time." },
      { status: 503 },
    );
  }
}
