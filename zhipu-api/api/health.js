import { sendJson } from "../lib/human-made.js";

export default function handler(request, response) {
  return sendJson(
    response,
    { ok: true, service: "human-made-zhipu", configured: Boolean(process.env.ZHIPU_API_KEY) },
    200,
    request.headers.origin ?? "",
  );
}
