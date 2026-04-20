import { describe, expect, it } from "vitest";
import worker from "../src/index";

const appEnv: Env = {
  ALLOWED_ORIGINS: "https://app.example.com",
  REQUIRE_APP_REFERER: "true"
};

describe("worker request security", () => {
  it("rejects localhost origins against production worker URLs by default", async () => {
    const response = await worker.fetch(
      new Request("https://api.example.com/api/lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Origin": "http://localhost:3000"
        },
        body: JSON.stringify({
          url: "https://www.notion.so/workspace/Page-Title-04f306fbf59a413fae15f42e2a1ab029"
        })
      }),
      appEnv,
      testContext()
    );

    expect(response.status).toBe(403);
  });

  it("keeps localhost origins available for local worker URLs", async () => {
    const response = await worker.fetch(
      new Request("http://localhost:8787/api/lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Origin": "http://localhost:3000"
        },
        body: JSON.stringify({ url: "https://example.com/not-notion" })
      }),
      appEnv,
      testContext()
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "invalid_url",
        message: "That doesn't look like a Notion link."
      }
    });
  });

  it("rejects oversized JSON bodies before parsing", async () => {
    const response = await worker.fetch(
      new Request("https://api.example.com/api/lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Origin": "https://app.example.com"
        },
        body: JSON.stringify({ url: "https://www.notion.so/" + "a".repeat(4096) })
      }),
      appEnv,
      testContext()
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: {
        code: "payload_too_large",
        message: "Lookup requests must be smaller than 4 KB."
      }
    });
  });
});

function testContext(): ExecutionContext {
  return {
    waitUntil: () => undefined,
    passThroughOnException: () => undefined
  } as unknown as ExecutionContext;
}
