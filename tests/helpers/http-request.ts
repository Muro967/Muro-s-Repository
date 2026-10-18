export function jsonRequest(path: string, body?: unknown): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      origin: "http://localhost:3000",
      host: "localhost:3000",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
