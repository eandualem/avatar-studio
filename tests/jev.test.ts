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

it("the route forwards state and questions with the profile to the runtime's decisions and passes its answer through", async () => {
  const fetch = vi.fn(async () =>
    Response.json({ answers: { start: { type: "noul", noul: 0.9 } } }),
  );
  vi.stubGlobal("fetch", fetch);
  const response = await POST(request({ state: { a: 1 }, questions }));
  expect(response.status).toBe(200);
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("http://127.0.0.1:7100/api/decisions");
  expect(JSON.parse(init.body as string)).toEqual({ state: { a: 1 }, questions, profile: "avatar_studio" });
  expect((await POST(request({ state: "x", questions: {} }))).status).toBe(400);
  expect((await POST(request({ state: "x", questions }, "http://evil.test"))).status).toBe(403);
  fetch.mockResolvedValueOnce(
    Response.json({ detail: "Decisions need TYPESAFE_API_KEY on the runtime; no fallback is used" }, { status: 503 }),
  );
  const refused = await POST(request({ state: "x", questions }));
  expect(refused.status).toBe(503);
  expect(await refused.json()).toMatchObject({ detail: expect.stringContaining("TYPESAFE_API_KEY on the runtime") });
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
      timing: { total_ms: 356, provider_ms: 349 },
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
