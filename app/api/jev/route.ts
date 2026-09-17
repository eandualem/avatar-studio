import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sameOrigin } from "@/lib/request-origin";
import { jevRequestSchema } from "@/types/jev";

/**
 * The one place the TypeSafe key is used. The browser sends a state and typed
 * questions; this forwards them to Jev and returns its answers unchanged.
 * Jev is not a chat model, so it does not go through assistant-runtime.
 */
export const dynamic = "force-dynamic";
const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const DEFAULT_JEV_MODEL = "jev-latest";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return NextResponse.json({ detail: "Origin not allowed" }, { status: 403 });
  const key = process.env.TYPESAFE_API_KEY;
  if (!key)
    return NextResponse.json(
      {
        detail:
          "Jev needs TYPESAFE_API_KEY in .env.local. Charlie's expression loop is off until it is set.",
      },
      { status: 503 },
    );
  try {
    const body = jevRequestSchema.parse(await request.json());
    const response = await fetch(process.env.JEV_URL || JEV_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.JEV_MODEL || DEFAULT_JEV_MODEL,
        ...body,
      }),
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
      { detail: "Jev did not answer in time." },
      { status: 503 },
    );
  }
}
