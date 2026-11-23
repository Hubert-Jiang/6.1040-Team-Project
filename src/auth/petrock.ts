export interface PetrockConfig {
  authority: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface PetrockUserInfo {
  externalId: string;
  email: string;
  name?: string;
  affiliation?: string;
}

export interface PetrockClient {
  exchangeCode(code: string): Promise<PetrockUserInfo>;
}

const DEFAULT_TIMEOUT_MS = 10_000;

async function readOAuthErrorDetail(response: Response): Promise<string> {
  try {
    const text = (await response.text()).trim();
    if (!text) return "";
    try {
      const parsed = JSON.parse(text) as { error?: string; error_description?: string; error_message?: string };
      const detail = [parsed.error, parsed.error_description ?? parsed.error_message].filter(Boolean).join(": ");
      return detail ? ` (${detail.slice(0, 200)})` : "";
    } catch {
      return ` (${text.slice(0, 200)})`;
    }
  } catch {
    return "";
  }
}

/** Reads Petrock OIDC configuration from environment variables. */
export function readPetrockConfig(env: Record<string, string | undefined> = process.env): PetrockConfig {
  const authority = (env.PETROCK_AUTHORITY?.trim() || "https://petrock.mit.edu").replace(/\/+$/, "");
  const clientId = env.PETROCK_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.PETROCK_CLIENT_SECRET?.trim() ?? "";
  const redirectUri = env.PETROCK_REDIRECT_URI?.trim() || "http://127.0.0.1:8080/auth/petrock/callback";
  return { authority, clientId, clientSecret, redirectUri };
}

/** Builds the MIT Touchstone authorization redirect URL on Petrock. */
export function buildPetrockAuthorizationUrl(state: string, config: PetrockConfig = readPetrockConfig()): string {
  const url = new URL(`${config.authority}/touchstone/oidc/authorization`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  return url.toString();
}

/** Exchanges an OIDC authorization code at Petrock `/oidc/token` and fetches `/oidc/userinfo`. */
export async function exchangePetrockCode(
  code: string,
  {
    config = readPetrockConfig(),
    fetch = globalThis.fetch,
  }: { config?: PetrockConfig; fetch?: typeof globalThis.fetch } = {},
): Promise<PetrockUserInfo> {
  if (!code.trim() || !config.clientId || !config.clientSecret) {
    throw new Error("Missing OIDC authorization code or Petrock client credentials.");
  }

  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
  });

  const tokenResponse = await fetch(`${config.authority}/oidc/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });
  if (!tokenResponse.ok) {
    const detail = await readOAuthErrorDetail(tokenResponse);
    throw new Error(`Petrock token endpoint returned status ${tokenResponse.status}${detail}`);
  }

  const tokenJson = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenJson.access_token) {
    throw new Error("Petrock token response did not include access_token.");
  }

  const userInfoResponse = await fetch(`${config.authority}/oidc/userinfo`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });
  if (!userInfoResponse.ok) {
    const detail = await readOAuthErrorDetail(userInfoResponse);
    throw new Error(`Petrock userinfo endpoint returned status ${userInfoResponse.status}${detail}`);
  }

  const info = (await userInfoResponse.json()) as {
    sub?: string;
    email?: string;
    name?: string;
    given_name?: string;
    family_name?: string;
    affiliation?: string;
  };
  const email = info.email?.trim() ?? "";
  const externalId = info.sub?.trim() || email;
  if (!externalId || !email) {
    throw new Error("Petrock userinfo response did not include sub and email.");
  }

  const fallbackName = [info.given_name?.trim(), info.family_name?.trim()].filter(Boolean).join(" ");
  const name = info.name?.trim() || fallbackName || undefined;
  const affiliation = info.affiliation?.trim() || undefined;
  return { externalId, email, name, affiliation };
}

/** Default production Petrock OIDC client backed by environment variables and global fetch. */
export const defaultPetrockClient: PetrockClient = {
  exchangeCode: (code: string) => exchangePetrockCode(code),
};
