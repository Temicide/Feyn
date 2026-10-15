import express from "express";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import type { Me, SignInOptions } from "../shared/contracts.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const sessionSchema = z.object({
  sub: z.string(),
  email: z.string(),
  name: z.string(),
  exp: z.number(),
});
export type Session = z.infer<typeof sessionSchema>;
const pendingSchema = z.object({
  state: z.string(),
  verifier: z.string(),
  exp: z.number(),
});

export type AuthConfig = {
  secret: string;
  origin: URL | null;
  google: { clientId: string; clientSecret: string } | null;
  teachers: Set<string>;
  devLogin: boolean;
};
export function authConfig(env: NodeJS.ProcessEnv): AuthConfig {
  if (env.VERCEL)
    for (const key of ["SESSION_SECRET", "APP_ORIGIN"])
      if (!env[key])
        throw new Error(
          `${key} is not configured on the server. Set it in the Vercel project environment.`,
        );
  const origin = env.APP_ORIGIN ? new URL(env.APP_ORIGIN) : null;
  return {
    secret: env.SESSION_SECRET || randomBytes(32).toString("hex"),
    origin,
    google:
      origin && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          }
        : null,
    teachers: new Set(
      (env.TEACHER_EMAILS ?? "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
    devLogin: env.DEV_LOGIN === "1" && !env.VERCEL,
  };
}

function mac(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}
function seal<T extends { exp: number }>(value: T, secret: string): string {
  const body = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${body}.${mac(body, secret)}`;
}
function unseal<T extends { exp: number }>(
  token: string | undefined,
  secret: string,
  schema: z.ZodType<T>,
): T | null {
  const [body, signature, extra] = token?.split(".") ?? [];
  if (!body || !signature || extra !== undefined) return null;
  const expected = Buffer.from(mac(body, secret)),
    given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return null;
  try {
    const value = schema.parse(
      JSON.parse(Buffer.from(body, "base64url").toString("utf8")),
    );
    return value.exp > Date.now() / 1000 ? value : null;
  } catch {
    return null;
  }
}
function cookie(req: express.Request, name: string): string | undefined {
  for (const part of req.get("cookie")?.split(";") ?? []) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return undefined;
}

const googleKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
const sessionDays = 7;

export function auth(
  config: AuthConfig,
  onSignIn: (session: Session) => Promise<unknown>,
  isTeacher: (email: string) => Promise<boolean>,
) {
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.origin?.protocol === "https:",
    path: "/",
  };
  const redirectUri = config.origin
    ? new URL("/api/auth/callback", config.origin).href
    : "";
  async function start(
    res: express.Response,
    identity: { sub: string; email: string; name: string },
  ): Promise<void> {
    const session: Session = {
      ...identity,
      exp: Math.floor(Date.now() / 1000) + sessionDays * 86400,
    };
    await onSignIn(session);
    res.cookie("feyn_session", seal(session, config.secret), {
      ...cookieOptions,
      maxAge: sessionDays * 86400 * 1000,
    });
  }
  function session(req: express.Request): Session | null {
    return unseal(cookie(req, "feyn_session"), config.secret, sessionSchema);
  }
  function caller(req: express.Request): Session {
    const found = session(req);
    if (!found) throw new HttpError(401, "Sign in to continue.");
    return found;
  }
  async function teacher(req: express.Request): Promise<Session> {
    const found = caller(req);
    if (!(await isTeacher(found.email)))
      throw new HttpError(403, "Only teachers can open the teacher’s desk.");
    return found;
  }

  const router = express.Router();
  router.get("/me", async (req, res) => {
    const found = session(req);
    if (!found) {
      const options: SignInOptions = {
        error: "Sign in to continue.",
        google: Boolean(config.google),
        devLogin: config.devLogin,
      };
      res.status(401).json(options);
      return;
    }
    const me: Me = {
      learnerId: found.sub,
      name: found.name,
      email: found.email,
      role: (await isTeacher(found.email)) ? "teacher" : "student",
    };
    res.json(me);
  });
  router.get("/auth/google", (_req, res) => {
    if (!config.google) throw new HttpError(404, "Google sign-in is off.");
    const state = randomBytes(24).toString("base64url"),
      verifier = randomBytes(32).toString("base64url");
    res.cookie(
      "feyn_oauth",
      seal(
        { state, verifier, exp: Math.floor(Date.now() / 1000) + 600 },
        config.secret,
      ),
      { ...cookieOptions, path: "/api/auth", maxAge: 600 * 1000 },
    );
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: config.google.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    res.redirect(url.href);
  });
  router.get("/auth/callback", async (req, res) => {
    res.clearCookie("feyn_oauth", { ...cookieOptions, path: "/api/auth" });
    try {
      if (!config.google) throw new Error("Google sign-in is off.");
      const query = z
        .object({ code: z.string(), state: z.string() })
        .parse(req.query);
      const pending = unseal(
        cookie(req, "feyn_oauth"),
        config.secret,
        pendingSchema,
      );
      if (!pending || pending.state !== query.state)
        throw new Error("Sign-in state did not match.");
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams({
          code: query.code,
          client_id: config.google.clientId,
          client_secret: config.google.clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
          code_verifier: pending.verifier,
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok)
        throw new Error(`Google token endpoint returned ${response.status}.`);
      const { id_token } = z
        .object({ id_token: z.string() })
        .parse(await response.json());
      const { payload } = await jwtVerify(id_token, googleKeys, {
        issuer: ["https://accounts.google.com", "accounts.google.com"],
        audience: config.google.clientId,
      });
      const claims = z
        .object({
          sub: z.string(),
          email: z.string().email(),
          email_verified: z.literal(true),
          name: z.string().optional(),
        })
        .parse(payload);
      await start(res, {
        sub: `google:${claims.sub}`,
        email: claims.email,
        name: claims.name ?? claims.email,
      });
      res.redirect("/");
    } catch (error) {
      console.error(
        "Google sign-in failed:",
        error instanceof Error ? error.message : error,
      );
      res.redirect("/?signin=failed");
    }
  });
  router.get("/auth/dev", async (req, res) => {
    if (!config.devLogin) throw new HttpError(404, "Not found.");
    const input = z
      .object({ email: z.string().email(), name: z.string().trim().optional() })
      .parse(req.query);
    await start(res, {
      sub: `dev:${input.email.toLowerCase()}`,
      email: input.email,
      name: input.name || input.email.split("@")[0] || input.email,
    });
    res.redirect("/");
  });
  router.post("/auth/logout", (_req, res) => {
    res.clearCookie("feyn_session", cookieOptions).json({});
  });
  return { router, caller, teacher };
}
