// Isolated browser verification fixture. Never use this to serve the real app.
import { createServer } from "node:http";
import { appendFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const calls = new Map();
const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/mobile") {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(
      '<!doctype html><html><body style="margin:0;background:#e6e1da;padding:24px"><p>Mobile layout test — 390 × 844</p><iframe title="Mobile Avatar Studio" src="http://127.0.0.1:7141" style="width:390px;height:844px;border:0"></iframe></body></html>',
    );
    return;
  }
  if (request.method !== "POST") {
    response.writeHead(404);
    response.end();
    return;
  }
  response.setHeader("Content-Type", "application/json");
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (request.url?.endsWith("/cancel")) {
    response.end(JSON.stringify({ cancelled: true }));
    return;
  }
  const body = JSON.parse(Buffer.concat(chunks).toString());
  if (body.tool_call_id) {
    await appendFile(
      ".tmp/browser-tool-receipts.jsonl",
      JSON.stringify(body.tool_result) + "\n",
    );
    response.end(
      JSON.stringify({
        content:
          "Test fixture: the browser returned the actual completed pose.",
        message_id: calls.get(body.tool_call_id),
      }),
    );
    return;
  }
  const call = randomUUID(),
    message = randomUUID();
  calls.set(call, message);
  const slow = body.content.includes("slow");
  response.end(
    JSON.stringify({
      content: "Test fixture: composing a hand, finger and head target.",
      message_id: message,
      pending_tool_call: {
        tool_name: "move_avatar",
        call_id: call,
        arguments: {
          waypoints: [
            {
              time: slow ? 15 : 2,
              left: {
                position: [0.29, 0.83, 0.09],
                direction: [0, 1, 0],
                curls: [0, 0, 0.8, 0.8, 0.8],
              },
              right: {
                position: [-0.24, 0.55, 0.16],
                curls: [0.3, 0.3, 0.3, 0.3, 0.3],
              },
              head: { yaw: -0.2, nod: 0.08 },
            },
          ],
        },
      },
    }),
  );
});
server.listen(7111, "127.0.0.1", () =>
  console.log("Isolated motion fixture on http://127.0.0.1:7111"),
);
