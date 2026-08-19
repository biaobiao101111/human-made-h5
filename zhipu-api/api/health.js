import { resolveModelProvider, sendJson } from "../lib/human-made.js";

export default function handler(request, response) {
  const provider = resolveModelProvider();
  return sendJson(
    response,
    {
      ok: true,
      service: "human-made-ai",
      configured: Boolean(provider),
      provider: provider?.id ?? null,
      model: provider?.model ?? null,
    },
    200,
    request.headers.origin ?? "",
  );
}
