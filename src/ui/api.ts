import type { ErrorResponse, LookupResponse } from "./types";

export async function lookupNotionPage(url: string): Promise<LookupResponse> {
  const response = await fetch("/api/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });

  const payload = (await response.json().catch(() => null)) as ErrorResponse | LookupResponse | null;

  if (!response.ok) {
    const message =
      payload && "error" in payload ? payload.error.message : "Lookup failed. Check the page and try again.";
    throw new Error(message);
  }

  if (!payload || !("collaborators" in payload)) {
    throw new Error("Lookup returned an unexpected response.");
  }

  return payload;
}
