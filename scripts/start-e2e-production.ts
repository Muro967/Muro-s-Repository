import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:https";
import { request as forward } from "node:http";
import { createRequire } from "node:module";
import { join } from "node:path";

// Exercise the actual `next start` server behind local TLS, as in deployment.
// Never disable the application's production HTTPS/Secure-cookie guard.
if (process.env.E2E_RUN !== "1" || process.env.APP_URL !== "https://127.0.0.1:3109" ||
    process.env.SESSION_COOKIE_SECURE !== "true" || process.env.PGLITE_DATA_DIR !== ".data/e2e/database") {
  throw new Error("Refusing to start outside the isolated production E2E environment");
}
const tlsDirectory = join(process.cwd(), ".data", "e2e", "tls");
await mkdir(tlsDirectory, { mode: 0o700 });
const key = join(tlsDirectory, "key.pem");
const cert = join(tlsDirectory, "cert.pem");
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=127.0.0.1"], { stdio: "ignore" });
const require = createRequire(import.meta.url);
const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3110"], { stdio: "inherit" });
const server = createServer({ key: await readFile(key), cert: await readFile(cert) }, (request, response) => {
  const upstream = forward({ hostname: "127.0.0.1", port: 3110, path: request.url, method: request.method,
    headers: { ...request.headers, "x-forwarded-host": "127.0.0.1:3109", "x-forwarded-proto": "https" } }, (result) => {
    response.writeHead(result.statusCode ?? 502, result.headers);
    result.pipe(response);
  });
  upstream.on("error", () => { if (!response.headersSent) response.writeHead(502); response.end(); });
  request.on("aborted", () => upstream.destroy());
  request.pipe(upstream);
});
function stop() { server.close(); server.closeAllConnections(); child.kill("SIGTERM"); }
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
server.once("error", () => { child.kill("SIGTERM"); process.exitCode = 1; });
child.once("error", () => { server.close(); process.exitCode = 1; });
child.once("exit", (code, signal) => { server.close(); server.closeAllConnections(); if (code && !signal) process.exitCode = code; });
server.listen(3109, "127.0.0.1");
