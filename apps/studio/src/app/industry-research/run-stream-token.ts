export async function fetchRunStreamToken() {
  const response = await fetch("/api/industry-research/run/stream", {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`run token ${response.status}`);
  }

  const payload = (await response.json()) as { token?: string };

  if (!payload.token) {
    throw new Error("run token missing");
  }

  return payload.token;
}
