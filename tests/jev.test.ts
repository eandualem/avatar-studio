import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/jev/route";
import { choice, jevOracle, noul, score } from "@/lib/jev";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const request = (body: unknown, origin = "http://127.0.0.1:7140") =>
  new NextRequest("http://127.0.0.1:7140/api/jev", {
    method: "POST",
    headers: { origin, host: "127.0.0.1:7140" },
    body: JSON.stringify(body),
  });
const questions = {
  start: noul("Start?"),
  gesture: choice("Which?", { wave: "wave", clap: null }),
  energy: score("How much?", ["still", "lively"]),
};

it("the route keeps the key server-side, forwards state and questions, and refuses without a key", async () => {
  expect((await POST(request({ state: "hi", questions }))).status).toBe(503);
  vi.stubEnv("TYPESAFE_API_KEY", "secret");
  const fetch = vi.fn(async () =>
    Response.json({ answers: { start: { type: "noul", noul: 0.9 } } }),
  );
  vi.stubGlobal("fetch", fetch);
  const response = await POST(request({ state: { a: 1 }, questions }));
  expect(response.status).toBe(200);
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://api.typesafe.ai/v1/systemone");
  expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
  expect(JSON.parse(init.body as string)).toEqual({ model: "jev-latest", state: { a: 1 }, questions });
  expect((await POST(request({ state: "x", questions: {} }))).status).toBe(400);
  expect((await POST(request({ state: "x", questions }, "http://evil.test"))).status).toBe(403);
  fetch.mockRejectedValueOnce(new Error("timeout"));
  expect((await POST(request({ state: "x", questions }))).status).toBe(503);
});

it("the client validates answers and surfaces the route's detail on failure", async () => {
  const fetch = vi.fn(async () =>
    Response.json({
      model: "jev-latest",
      answers: {
        start: { type: "noul", noul: 0.2 },
        gesture: { type: "choice", choice: "wave", confidence: 0.8, probabilities: { wave: 0.8, clap: 0.2 } },
        energy: { type: "score", score: 0.7, confidence: 0.5, probabilities: { "0": 0.3, "1": 0.7 }, legend: { "0": "still", "1": "lively" } },
      },
      usage: { input_tokens: 300, output_tokens: 0 },
    }),
  );
  vi.stubGlobal("fetch", fetch);
  const answers = await jevOracle.ask("hello", questions, new AbortController().signal);
  expect(answers.gesture).toMatchObject({ choice: "wave" });
  expect((fetch.mock.calls as unknown as [string][])[0][0]).toBe("/api/jev");
  fetch.mockResolvedValueOnce(Response.json({ detail: "Jev needs TYPESAFE_API_KEY" }, { status: 503 }));
  await expect(jevOracle.ask("hello", questions, new AbortController().signal)).rejects.toThrow("TYPESAFE_API_KEY");
  fetch.mockResolvedValueOnce(Response.json({ answers: { start: { type: "noul", noul: 7 } } }));
  await expect(jevOracle.ask("hello", questions, new AbortController().signal)).rejects.toThrow();
});
