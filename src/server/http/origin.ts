export class OriginMismatchError extends Error {
  constructor() {
    super("ORIGIN_MISMATCH");
    this.name = "OriginMismatchError";
  }
}

function configuredOrigin(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OriginMismatchError();
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new OriginMismatchError();
  }
  return url;
}

function authorityOrigin(host: string, protocol: string): string {
  if (host.length === 0 || /[,\s/@\\?#]/.test(host)) {
    throw new OriginMismatchError();
  }
  let url: URL;
  try {
    url = new URL(`${protocol}//${host}`);
  } catch {
    throw new OriginMismatchError();
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new OriginMismatchError();
  }
  return url.origin;
}

function forwardedParameters(value: string): Map<string, string> {
  if (value.includes(",")) throw new OriginMismatchError();
  const parameters = new Map<string, string>();
  for (const part of value.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) throw new OriginMismatchError();
    const key = part.slice(0, separator).trim().toLowerCase();
    let parameter = part.slice(separator + 1).trim();
    if (parameter.startsWith('"') && parameter.endsWith('"')) {
      parameter = parameter.slice(1, -1);
    } else if (parameter.includes('"')) {
      throw new OriginMismatchError();
    }
    if (!/^[a-z][a-z0-9_-]*$/.test(key) || !parameter || /["\\\s]/.test(parameter) || parameters.has(key)) {
      throw new OriginMismatchError();
    }
    parameters.set(key, parameter);
  }
  return parameters;
}

/** APP_URL pins the public authority; the Node adapter's URL may use an internal listener. */
export function assertSameOrigin(request: Request, appUrl: string): void {
  try {
    const expected = configuredOrigin(appUrl);
    const originHeader = request.headers.get("origin");
    if (!originHeader || originHeader.trim() === "null") {
      throw new OriginMismatchError();
    }
    const origin = new URL(originHeader);
    if (
      origin.origin !== expected.origin ||
      originHeader !== origin.origin ||
      origin.username !== "" ||
      origin.password !== "" ||
      origin.pathname !== "/" ||
      origin.search !== "" ||
      origin.hash !== ""
    ) {
      throw new OriginMismatchError();
    }

    const host = request.headers.get("host");
    if (!host || authorityOrigin(host, expected.protocol) !== expected.origin) {
      throw new OriginMismatchError();
    }

    const forwardedHost = request.headers.get("x-forwarded-host");
    if (
      forwardedHost !== null &&
      authorityOrigin(forwardedHost, expected.protocol) !== expected.origin
    ) {
      throw new OriginMismatchError();
    }
    const forwardedProto = request.headers.get("x-forwarded-proto");
    if (
      forwardedProto !== null &&
      (!/^(http|https)$/.test(forwardedProto) ||
        authorityOrigin(expected.host, `${forwardedProto.trim().toLowerCase()}:`) !==
          expected.origin)
    ) {
      throw new OriginMismatchError();
    }

    const forwarded = request.headers.get("forwarded");
    if (forwarded !== null) {
      const parameters = forwardedParameters(forwarded);
      const proto = parameters.get("proto");
      const forwardedAuthority = parameters.get("host");
      if (
        (proto && proto.toLowerCase() !== expected.protocol.slice(0, -1)) ||
        (forwardedAuthority &&
          authorityOrigin(forwardedAuthority, expected.protocol) !== expected.origin)
      ) {
        throw new OriginMismatchError();
      }
    }
  } catch {
    throw new OriginMismatchError();
  }
}
