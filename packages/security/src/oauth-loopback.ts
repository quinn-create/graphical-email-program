import http from "node:http";
import { randomBytes, createHash } from "node:crypto";

export interface OAuthLoopbackResult {
  code: string;
  state: string;
  redirectUri: string;
  pkceVerifier: string;
}

export interface OAuthLoopbackOptions {
  authorizeUrl: string;
  clientId: string;
  scopes: string[];
  openExternal: (url: string) => Promise<void>;
  extraAuthParams?: Record<string, string>;
  timeoutMs?: number;
  preferredPort?: number;
  successHtml?: string;
  usePkce?: boolean;
}

function base64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/**
 * Installed-app OAuth via loopback redirect (RFC 8252).
 * Opens the system browser via injected openExternal; never automates login.
 */
export async function runOAuthLoopback(
  opts: OAuthLoopbackOptions,
): Promise<OAuthLoopbackResult> {
  const state = randomBytes(16).toString("hex");
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
  const usePkce = opts.usePkce !== false;
  const pkce = createPkcePair();

  const server = http.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.preferredPort ?? 0, "127.0.0.1", () => resolve());
  });

  const addr = server.address();
  if (!addr || typeof addr === "string") {
    server.close();
    throw new Error("Failed to bind OAuth loopback server");
  }
  const redirectUri = `http://127.0.0.1:${addr.port}/oauth/callback`;

  const resultPromise = new Promise<OAuthLoopbackResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(new Error("OAuth timed out — complete sign-in in the browser and try again"));
    }, timeoutMs);

    server.on("request", (req, res) => {
      try {
        const url = new URL(req.url ?? "/", `http://127.0.0.1:${addr.port}`);
        if (url.pathname !== "/oauth/callback") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const error = url.searchParams.get("error");
        const code = url.searchParams.get("code");
        const returnedState = url.searchParams.get("state");
        const ok = Boolean(code) && returnedState === state && !error;
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          opts.successHtml ??
            `<!doctype html><html><body style="font-family:system-ui;padding:2rem">
              <h1>${ok ? "Connected" : "Authorization failed"}</h1>
              <p>${ok ? "You can close this window and return to MatterMail Review." : error || "State mismatch or missing code."}</p>
            </body></html>`,
        );
        clearTimeout(timer);
        server.close();
        if (ok && code) {
          resolve({ code, state, redirectUri, pkceVerifier: pkce.verifier });
        } else {
          reject(new Error(error || "OAuth authorization failed"));
        }
      } catch (err) {
        clearTimeout(timer);
        server.close();
        reject(err);
      }
    });
  });

  const auth = new URL(opts.authorizeUrl);
  auth.searchParams.set("client_id", opts.clientId);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", opts.scopes.join(" "));
  auth.searchParams.set("state", state);
  if (usePkce) {
    auth.searchParams.set("code_challenge", pkce.challenge);
    auth.searchParams.set("code_challenge_method", "S256");
  }
  for (const [k, v] of Object.entries(opts.extraAuthParams ?? {})) {
    auth.searchParams.set(k, v);
  }

  await opts.openExternal(auth.toString());
  return resultPromise;
}

export async function exchangeAuthorizationCode(opts: {
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  code: string;
  redirectUri: string;
  codeVerifier?: string;
  extraParams?: Record<string, string>;
}): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: opts.clientId,
    code: opts.code,
    redirect_uri: opts.redirectUri,
    ...(opts.clientSecret ? { client_secret: opts.clientSecret } : {}),
    ...(opts.codeVerifier ? { code_verifier: opts.codeVerifier } : {}),
    ...(opts.extraParams ?? {}),
  });

  const res = await fetch(opts.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  };
}

export async function refreshAccessToken(opts: {
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  refreshToken: string;
}): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: opts.clientId,
    refresh_token: opts.refreshToken,
    ...(opts.clientSecret ? { client_secret: opts.clientSecret } : {}),
  });
  const res = await fetch(opts.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
}
