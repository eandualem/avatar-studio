// Next.js can expose an internal origin in request.url in production.
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const url = new URL(request.url);
  const protocol =
    request.headers.get("x-forwarded-proto") || url.protocol.slice(0, -1);
  const host = request.headers.get("host") || url.host;
  return (
    ["http", "https"].includes(protocol) && origin === `${protocol}://${host}`
  );
}
