import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 180;
const id = "[a-zA-Z0-9_-]+";
function allowed(method: string, path: string) {
  if (method === "GET")
    return (
      path === "status" || new RegExp(`^calls/${id}(/events)?$`).test(path)
    );
  if (method === "PATCH") return new RegExp(`^calls/${id}/context$`).test(path);
  return (
    method === "POST" &&
    (path === "calls" ||
      new RegExp(
        `^calls/${id}/(close|cancel|delegations/${id}/tool-result)$`,
      ).test(path))
  );
}
async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const path = (await params).path.join("/");
  if (!allowed(request.method, path))
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin)
    return NextResponse.json({ detail: "Origin not allowed" }, { status: 403 });
  const streaming = path.endsWith("/events");
  const after = request.nextUrl.searchParams.get("after") || "0";
  if (streaming && !/^\d{1,15}$/.test(after))
    return NextResponse.json(
      { detail: "Invalid event cursor" },
      { status: 400 },
    );
  const base = (
    process.env.VOICE_RUNTIME_URL ||
    process.env.RUNTIME_URL ||
    "http://127.0.0.1:7100"
  ).replace(/\/$/, "");
  try {
    const response = await fetch(
      `${base}/api/voice/${path}${streaming ? `?after=${after}` : ""}`,
      {
        method: request.method,
        headers: { "Content-Type": "application/json" },
        body: request.method === "GET" ? undefined : await request.text(),
        signal: streaming
          ? request.signal
          : AbortSignal.timeout(path.endsWith("tool-result") ? 170000 : 45000),
        cache: "no-store",
      },
    );
    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("content-type") || "application/json",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return NextResponse.json(
      {
        detail:
          "The live voice runtime is unavailable. Check its connection and voice configuration.",
      },
      { status: 503 },
    );
  }
}
export { proxy as GET, proxy as POST, proxy as PATCH };
