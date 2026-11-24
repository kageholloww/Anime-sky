// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// server/db.ts
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var animeFavorites = mysqlTable("anime_favorites", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  contentId: varchar("contentId", { length: 128 }).notNull(),
  title: text("title").notNull(),
  poster: text("poster"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
}, (table) => ({
  userContent: uniqueIndex("favorites_user_content_idx").on(table.userId, table.contentId)
}));
var animeHistory = mysqlTable("anime_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  contentId: varchar("contentId", { length: 128 }).notNull(),
  animeTitle: text("animeTitle").notNull(),
  episodeId: varchar("episodeId", { length: 128 }).notNull(),
  episodeTitle: text("episodeTitle").notNull(),
  watchedAt: timestamp("watchedAt").defaultNow().onUpdateNow().notNull()
}, (table) => ({
  userEpisode: uniqueIndex("history_user_episode_idx").on(table.userId, table.episodeId)
}));

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/db.ts
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
var inMemoryUsers = /* @__PURE__ */ new Map();
var inMemoryFavorites = /* @__PURE__ */ new Map();
var inMemoryHistory = /* @__PURE__ */ new Map();
var autoIncUserId = 1;
var autoIncFavId = 1;
var autoIncHistId = 1;
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    const existing = inMemoryUsers.get(user.openId);
    const now = /* @__PURE__ */ new Date();
    const role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : existing?.role ?? "user");
    const updated = {
      id: existing?.id ?? autoIncUserId++,
      openId: user.openId,
      name: user.name ?? existing?.name ?? null,
      email: user.email ?? existing?.email ?? null,
      loginMethod: user.loginMethod ?? existing?.loginMethod ?? null,
      role,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastSignedIn: user.lastSignedIn ?? now
    };
    inMemoryUsers.set(user.openId, updated);
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    return inMemoryUsers.get(openId);
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function listFavorites(userId) {
  const db = await getDb();
  if (!db) {
    return Array.from(inMemoryFavorites.values()).filter((fav) => fav.userId === userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db.select().from(animeFavorites).where(eq(animeFavorites.userId, userId)).orderBy(desc(animeFavorites.createdAt));
}
async function saveFavorite(userId, contentId, title, poster2) {
  const db = await getDb();
  if (!db) {
    const key = `${userId}:${contentId}`;
    const existing = inMemoryFavorites.get(key);
    inMemoryFavorites.set(key, {
      id: existing?.id ?? autoIncFavId++,
      userId,
      contentId,
      title,
      poster: poster2 ?? null,
      createdAt: existing?.createdAt ?? /* @__PURE__ */ new Date()
    });
    return { success: true };
  }
  await db.insert(animeFavorites).values({ userId, contentId, title, poster: poster2 ?? null }).onDuplicateKeyUpdate({ set: { title, poster: poster2 ?? null } });
  return { success: true };
}
async function removeFavorite(userId, contentId) {
  const db = await getDb();
  if (!db) {
    inMemoryFavorites.delete(`${userId}:${contentId}`);
    return { success: true };
  }
  await db.delete(animeFavorites).where(and(eq(animeFavorites.userId, userId), eq(animeFavorites.contentId, contentId)));
  return { success: true };
}
async function listHistory(userId) {
  const db = await getDb();
  if (!db) {
    return Array.from(inMemoryHistory.values()).filter((hist) => hist.userId === userId).sort((a, b) => b.watchedAt.getTime() - a.watchedAt.getTime()).slice(0, 30);
  }
  return db.select().from(animeHistory).where(eq(animeHistory.userId, userId)).orderBy(desc(animeHistory.watchedAt)).limit(30);
}
async function saveHistory(userId, contentId, animeTitle, episodeId, episodeTitle) {
  const db = await getDb();
  if (!db) {
    const key = `${userId}:${episodeId}`;
    const existing = inMemoryHistory.get(key);
    inMemoryHistory.set(key, {
      id: existing?.id ?? autoIncHistId++,
      userId,
      contentId,
      animeTitle,
      episodeId,
      episodeTitle,
      watchedAt: /* @__PURE__ */ new Date()
    });
    return { success: true };
  }
  await db.insert(animeHistory).values({ userId, contentId, animeTitle, episodeId, episodeTitle, watchedAt: /* @__PURE__ */ new Date() }).onDuplicateKeyUpdate({ set: { contentId, animeTitle, episodeTitle, watchedAt: /* @__PURE__ */ new Date() } });
  return { success: true };
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    if (ENV.oAuthServerUrl) {
      console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    if (!ENV.oAuthServerUrl) {
      throw new Error(
        "[OAuth] OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    if (!ENV.oAuthServerUrl) {
      throw new Error(
        "[OAuth] OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/storageProxy.ts
function registerStorageProxy(app) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/routers.ts
import { z as z2 } from "zod";

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/animeApi.ts
import axios2 from "axios";

// server/animeCatalog.ts
var FALLBACK_ANIMES = [
  {
    id: "1",
    title: "\u0647\u062C\u0648\u0645 \u0627\u0644\u0639\u0645\u0627\u0644\u0642\u0629",
    englishTitle: "Attack on Titan",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx16498-buvcRTBx4NSm.jpg",
    year: "2013",
    rating: "9.0",
    episodes: "87",
    airingDay: "\u0645\u0643\u062A\u0645\u0644",
    genres: ["\u0623\u0643\u0634\u0646", "\u063A\u0645\u0648\u0636", "\u062F\u0631\u0627\u0645\u0627", "\u062E\u064A\u0627\u0644", "\u0634\u0648\u0646\u064A\u0646"],
    description: "\u0628\u0639\u062F \u0642\u0631\u0646 \u0645\u0646 \u0627\u0644\u0633\u0644\u0627\u0645 \u0648\u0627\u0644\u0639\u064A\u0634 \u062E\u0644\u0641 \u0623\u0633\u0648\u0627\u0631 \u0639\u0645\u0644\u0627\u0642\u0629 \u062A\u062D\u0645\u064A\u0647\u0645 \u0645\u0646 \u0627\u0644\u0639\u0645\u0627\u0644\u0642\u0629\u060C \u064A\u0634\u0647\u062F \u0633\u0643\u0627\u0646 \u062C\u0632\u064A\u0631\u0629 \u0628\u0627\u0631\u0627\u062F\u0627\u064A\u0633 \u0633\u0642\u0648\u0637 \u0627\u0644\u0633\u0648\u0631 \u0627\u0644\u062E\u0627\u0631\u062C\u064A \u0639\u0644\u0649 \u064A\u062F \u0627\u0644\u0639\u0645\u0644\u0627\u0642 \u0627\u0644\u0647\u0627\u0626\u0644\u060C \u0644\u064A\u0628\u062F\u0623 \u0625\u064A\u0631\u064A\u0646 \u064A\u064A\u063A\u0631 \u0631\u062D\u0644\u062A\u0647 \u0644\u0644\u0627\u0646\u062A\u0642\u0627\u0645.",
    duration: "24 \u062F\u0642\u064A\u0642\u0629",
    ageRating: "17+",
    language: "\u064A\u0627\u0628\u0627\u0646\u064A (\u0645\u062A\u0631\u062C\u0645)",
    totalSeasons: 4,
    seasonsList: [
      {
        id: "s1",
        title: "\u0627\u0644\u0645\u0648\u0633\u0645 \u0627\u0644\u0623\u0648\u0644",
        number: 1,
        episodes: [
          { id: "ep1-1", title: "\u0627\u0644\u062D\u0644\u0642\u0629 1 - \u0625\u0644\u064A\u0643 \u0628\u0639\u062F 2000 \u0639\u0627\u0645", number: 1, duration: "24 \u062F\u0642\u064A\u0642\u0629" },
          { id: "ep1-2", title: "\u0627\u0644\u062D\u0644\u0642\u0629 2 - \u0630\u0644\u0643 \u0627\u0644\u064A\u0648\u0645", number: 2, duration: "24 \u062F\u0642\u064A\u0642\u0629" },
          { id: "ep1-3", title: "\u0627\u0644\u062D\u0644\u0642\u0629 3 - \u0628\u0635\u064A\u0635 \u062E\u0627\u0641\u062A \u0648\u0633\u0637 \u0627\u0644\u064A\u0623\u0633", number: 3, duration: "24 \u062F\u0642\u064A\u0642\u0629" }
        ]
      },
      {
        id: "s2",
        title: "\u0627\u0644\u0645\u0648\u0633\u0645 \u0627\u0644\u062B\u0627\u0646\u064A",
        number: 2,
        episodes: [
          { id: "ep2-1", title: "\u0627\u0644\u062D\u0644\u0642\u0629 1 - \u0639\u0645\u0644\u0627\u0642 \u0627\u0644\u0648\u062D\u0634", number: 1, duration: "24 \u062F\u0642\u064A\u0642\u0629" },
          { id: "ep2-2", title: "\u0627\u0644\u062D\u0644\u0642\u0629 2 - \u0644\u0642\u062F \u0639\u062F\u062A", number: 2, duration: "24 \u062F\u0642\u064A\u0642\u0629" }
        ]
      }
    ],
    sourcesMap: {
      "ep1-1": [
        {
          id: "src-1",
          title: "\u0633\u064A\u0631\u0641\u0631 MP4Upload \u0633\u0631\u064A\u0639 (1080p)",
          quality: "1080p FHD",
          size: "450 MB",
          url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          downloadable: false,
          watchable: true,
          embeddable: true,
          provider: "MP4Upload",
          logoText: "MP4",
          kind: "MP4Upload"
        },
        {
          id: "src-2",
          title: "\u0633\u064A\u0631\u0641\u0631 UQLoad \u0628\u062F\u064A\u0644 (720p)",
          quality: "720p HD",
          size: "280 MB",
          url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
          downloadable: false,
          watchable: true,
          embeddable: true,
          provider: "UQLoad",
          logoText: "UQ",
          kind: "UQLoad"
        },
        {
          id: "src-3",
          title: "\u062A\u062D\u0645\u064A\u0644 \u0639\u0628\u0631 MediaFire",
          quality: "1080p Original",
          size: "650 MB",
          url: "https://www.mediafire.com",
          downloadable: true,
          watchable: false,
          embeddable: false,
          provider: "MediaFire",
          logoText: "MF",
          kind: "MediaFire"
        }
      ]
    }
  },
  {
    id: "2",
    title: "\u062C\u0648\u062C\u0648\u062A\u0633\u0648 \u0643\u0627\u064A\u0633\u0646",
    englishTitle: "Jujutsu Kaisen",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx113415-LHBAeoZDIsnF.jpg",
    year: "2020",
    rating: "8.8",
    episodes: "47",
    airingDay: "\u0645\u0643\u062A\u0645\u0644",
    genres: ["\u0623\u0643\u0634\u0646", "\u062E\u064A\u0627\u0644", "\u062E\u0627\u0631\u0642 \u0644\u0644\u0637\u0628\u064A\u0639\u0629", "\u0634\u0648\u0646\u064A\u0646", "\u0634\u064A\u0627\u0637\u064A\u0646"],
    description: "\u064A\u0646\u0636\u0645 \u064A\u0648\u062C\u064A \u0625\u064A\u062A\u0627\u062F\u0648\u0631\u064A\u060C \u0648\u0647\u0648 \u0637\u0627\u0644\u0628 \u062B\u0627\u0646\u0648\u064A \u064A\u062A\u0645\u062A\u0639 \u0628\u0644\u064A\u0627\u0642\u0629 \u0628\u062F\u0646\u064A\u0629 \u0627\u0633\u062A\u062B\u0646\u0627\u0626\u064A\u0629\u060C \u0625\u0644\u0649 \u0646\u0627\u062F\u064A \u0627\u0644\u062E\u0648\u0627\u0631\u0642 \u0641\u064A \u0627\u0644\u0645\u062F\u0631\u0633\u0629\u060C \u0648\u062A\u062A\u063A\u064A\u0631 \u062D\u064A\u0627\u062A\u0647 \u0628\u0639\u062F \u0627\u0628\u062A\u0644\u0627\u0639 \u0625\u0635\u0628\u0639 \u0645\u0644\u0639\u0648\u0646 \u064A\u062D\u0645\u0644 \u0631\u0648\u062D \u0631\u064A\u0648\u0645\u0646 \u0633\u0648\u0643\u0648\u0646\u0627.",
    duration: "24 \u062F\u0642\u064A\u0642\u0629",
    ageRating: "16+",
    language: "\u064A\u0627\u0628\u0627\u0646\u064A (\u0645\u062A\u0631\u062C\u0645)",
    totalSeasons: 2,
    seasonsList: [
      {
        id: "s1",
        title: "\u0627\u0644\u0645\u0648\u0633\u0645 \u0627\u0644\u0623\u0648\u0644",
        number: 1,
        episodes: [
          { id: "ep2-1-1", title: "\u0627\u0644\u062D\u0644\u0642\u0629 1 - \u0631\u064A\u0648\u0645\u0646 \u0633\u0648\u0643\u0648\u0646\u0627", number: 1, duration: "24 \u062F\u0642\u064A\u0642\u0629" },
          { id: "ep2-1-2", title: "\u0627\u0644\u062D\u0644\u0642\u0629 2 - \u0644\u0623\u062C\u0644 \u0646\u0641\u0633\u064A", number: 2, duration: "24 \u062F\u0642\u064A\u0642\u0629" }
        ]
      }
    ],
    sourcesMap: {
      "ep2-1-1": [
        {
          id: "src-j1",
          title: "\u0633\u064A\u0631\u0641\u0631 StreamTape \u0645\u0628\u0627\u0634\u0631 (1080p)",
          quality: "1080p FHD",
          size: "420 MB",
          url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
          downloadable: false,
          watchable: true,
          embeddable: true,
          provider: "StreamTape",
          logoText: "ST",
          kind: "StreamTape"
        }
      ]
    }
  },
  {
    id: "3",
    title: "\u0642\u0627\u062A\u0644 \u0627\u0644\u0634\u064A\u0627\u0637\u064A\u0646",
    englishTitle: "Demon Slayer: Kimetsu no Yaiba",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx101922-WBsBl0ClmgYL.jpg",
    year: "2019",
    rating: "8.7",
    episodes: "55",
    airingDay: "\u0645\u0643\u062A\u0645\u0644",
    genres: ["\u0623\u0643\u0634\u0646", "\u0645\u063A\u0627\u0645\u0631\u0627\u062A", "\u0634\u064A\u0627\u0637\u064A\u0646", "\u062E\u0627\u0631\u0642 \u0644\u0644\u0637\u0628\u064A\u0639\u0629", "\u062A\u0627\u0631\u064A\u062E\u064A", "\u0634\u0648\u0646\u064A\u0646"],
    description: "\u062A\u0627\u0646\u062C\u064A\u0631\u0648 \u0643\u0627\u0645\u0627\u062F\u0648\u060C \u0641\u062A\u0649 \u0637\u064A\u0628 \u0627\u0644\u0642\u0644\u0628 \u064A\u0628\u064A\u0639 \u0627\u0644\u0641\u062D\u0645 \u0644\u0625\u0639\u0627\u0644\u0629 \u0639\u0627\u0626\u0644\u062A\u0647\u060C \u064A\u062C\u062F \u0630\u0627\u062A \u064A\u0648\u0645 \u0639\u0627\u0626\u0644\u062A\u0647 \u0645\u0630\u0628\u0648\u062D\u0629 \u0639\u0644\u0649 \u064A\u062F \u0634\u064A\u0637\u0627\u0646\u060C \u0648\u062A\u062A\u062D\u0648\u0644 \u0623\u062E\u062A\u0647 \u0646\u064A\u0632\u0648\u0643\u0648 \u0625\u0644\u0649 \u0634\u064A\u0637\u0627\u0646\u0629\u060C \u0641\u064A\u0646\u0637\u0644\u0642 \u0641\u064A \u0631\u062D\u0644\u0629 \u0644\u0625\u0646\u0642\u0627\u0630\u0647\u0627 \u0648\u0627\u0644\u0627\u0646\u062A\u0642\u0627\u0645.",
    duration: "24 \u062F\u0642\u064A\u0642\u0629",
    ageRating: "17+",
    language: "\u064A\u0627\u0628\u0627\u0646\u064A (\u0645\u062A\u0631\u062C\u0645)",
    totalSeasons: 4,
    seasonsList: [
      {
        id: "s1",
        title: "\u0627\u0644\u0645\u0648\u0633\u0645 \u0627\u0644\u0623\u0648\u0644",
        number: 1,
        episodes: [
          { id: "ep3-1", title: "\u0627\u0644\u062D\u0644\u0642\u0629 1 - \u0627\u0644\u0642\u0633\u0648\u0629", number: 1, duration: "24 \u062F\u0642\u064A\u0642\u0629" }
        ]
      }
    ],
    sourcesMap: {
      "ep3-1": [
        {
          id: "src-ds1",
          title: "\u0633\u064A\u0631\u0641\u0631 VidBom \u0633\u0631\u064A\u0639 (1080p)",
          quality: "1080p FHD",
          size: "440 MB",
          url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
          downloadable: false,
          watchable: true,
          embeddable: true,
          provider: "VidBom",
          logoText: "VB",
          kind: "VidBom"
        }
      ]
    }
  },
  {
    id: "4",
    title: "\u0633\u0648\u0644\u0648 \u0644\u064A\u0641\u0644\u064A\u0646\u062C",
    englishTitle: "Solo Leveling",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx11757-SxYDUzdr9rh2.jpg",
    year: "2024",
    rating: "8.5",
    episodes: "12",
    airingDay: "\u0645\u0643\u062A\u0645\u0644",
    genres: ["\u0623\u0643\u0634\u0646", "\u0645\u063A\u0627\u0645\u0631\u0627\u062A", "\u062E\u064A\u0627\u0644", "\u0642\u0648\u0649 \u062E\u0627\u0631\u0642\u0629"],
    description: "\u0633\u0648\u0646\u063A \u062C\u064A\u0646 \u0648\u0648\u060C \u0623\u0636\u0639\u0641 \u0635\u064A\u0627\u062F \u0641\u064A \u0627\u0644\u0628\u0634\u0631\u064A\u0629 \u0645\u0646 \u0627\u0644\u0631\u062A\u0628\u0629 E\u060C \u064A\u0639\u062B\u0631 \u0639\u0644\u0649 \u0645\u0647\u0645\u0629 \u0633\u0631\u064A\u0629 \u063A\u064A\u0631 \u0645\u0633\u0628\u0648\u0642\u0629 \u062A\u0645\u0646\u062D\u0647 \u0627\u0644\u0642\u062F\u0631\u0629 \u0627\u0644\u0641\u0631\u064A\u062F\u0629 \u0639\u0644\u0649 \u0631\u0641\u0639 \u0645\u0633\u062A\u0648\u0627\u0647 \u0628\u0644\u0627 \u062D\u062F\u0648\u062F \u0645\u062A\u062C\u0627\u0648\u0632\u0627\u064B \u0643\u0644 \u0627\u0644\u062D\u062F\u0648\u062F \u0627\u0644\u0628\u0634\u0631\u064A\u0629.",
    duration: "24 \u062F\u0642\u064A\u0642\u0629",
    ageRating: "16+",
    language: "\u064A\u0627\u0628\u0627\u0646\u064A (\u0645\u062A\u0631\u062C\u0645)",
    totalSeasons: 1,
    seasonsList: [
      {
        id: "s1",
        title: "\u0627\u0644\u0645\u0648\u0633\u0645 \u0627\u0644\u0623\u0648\u0644",
        number: 1,
        episodes: [
          { id: "ep4-1", title: "\u0627\u0644\u062D\u0644\u0642\u0629 1 - \u0623\u0646\u0627 \u0645\u0639\u062A\u0627\u062F \u0639\u0644\u0649 \u0630\u0644\u0643", number: 1, duration: "24 \u062F\u0642\u064A\u0642\u0629" }
        ]
      }
    ],
    sourcesMap: {
      "ep4-1": [
        {
          id: "src-sl1",
          title: "\u0633\u064A\u0631\u0641\u0631 DoodStream \u0641\u0627\u0626\u0642 \u0627\u0644\u0633\u0631\u0639\u0629",
          quality: "1080p FHD",
          size: "410 MB",
          url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
          downloadable: false,
          watchable: true,
          embeddable: true,
          provider: "DoodStream",
          logoText: "DS",
          kind: "DoodStream"
        }
      ]
    }
  },
  {
    id: "5",
    title: "\u0648\u0646 \u0628\u064A\u0633",
    englishTitle: "One Piece",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx21-ELSYx3yMPcKM.jpg",
    year: "1999",
    rating: "8.9",
    episodes: "1100+",
    airingDay: "\u0627\u0644\u0623\u062D\u062F",
    genres: ["\u0623\u0643\u0634\u0646", "\u0645\u063A\u0627\u0645\u0631\u0627\u062A", "\u0643\u0648\u0645\u064A\u062F\u064A\u0627", "\u062E\u064A\u0627\u0644", "\u0634\u0648\u0646\u064A\u0646", "\u0642\u0648\u0649 \u062E\u0627\u0631\u0642\u0629"],
    description: "\u0645\u0648\u0646\u0643\u064A \u062F\u064A \u0644\u0648\u0641\u064A\u060C \u0634\u0627\u0628 \u064A\u0645\u062A\u0644\u0643 \u062C\u0633\u062F\u0627\u064B \u0645\u0637\u0627\u0637\u064A\u0627\u064B \u0628\u0639\u062F \u062A\u0646\u0627\u0648\u0644\u0647 \u0641\u0627\u0643\u0647\u0629 \u0634\u064A\u0637\u0627\u0646\u064A\u0629\u060C \u064A\u0628\u062D\u0631 \u0628\u0627\u062D\u062B\u0627\u064B \u0639\u0646 \u0643\u0646\u0632 \u0627\u0644\u0648\u0646 \u0628\u064A\u0633 \u0644\u064A\u0635\u0628\u062D \u0645\u0644\u0643 \u0627\u0644\u0642\u0631\u0627\u0635\u0646\u0629 \u0631\u0641\u0642\u0629 \u0637\u0627\u0642\u0645\u0647 \u0627\u0644\u0641\u0631\u064A\u062F \u0642\u0628\u0639\u0629 \u0627\u0644\u0642\u0634.",
    duration: "24 \u062F\u0642\u064A\u0642\u0629",
    ageRating: "13+",
    language: "\u064A\u0627\u0628\u0627\u0646\u064A (\u0645\u062A\u0631\u062C\u0645)",
    totalSeasons: 20,
    seasonsList: [
      {
        id: "s1",
        title: "\u0622\u0631\u0643 \u0625\u064A\u0633\u062A \u0628\u0644\u0648",
        number: 1,
        episodes: [
          { id: "ep5-1", title: "\u0627\u0644\u062D\u0644\u0642\u0629 1 - \u0623\u0646\u0627 \u0644\u0648\u0641\u064A! \u0627\u0644\u0631\u062C\u0644 \u0627\u0644\u0630\u064A \u0633\u064A\u0635\u0628\u062D \u0645\u0644\u0643 \u0627\u0644\u0642\u0631\u0627\u0635\u0646\u0629!", number: 1, duration: "24 \u062F\u0642\u064A\u0642\u0629" }
        ]
      }
    ],
    sourcesMap: {
      "ep5-1": [
        {
          id: "src-op1",
          title: "\u0633\u064A\u0631\u0641\u0631 MP4Upload \u0633\u0631\u064A\u0639 (1080p)",
          quality: "1080p FHD",
          size: "380 MB",
          url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4",
          downloadable: false,
          watchable: true,
          embeddable: true,
          provider: "MP4Upload",
          logoText: "MP4",
          kind: "MP4Upload"
        }
      ]
    }
  },
  {
    id: "6",
    title: "\u0643\u0648\u0646\u0648\u0633\u0648\u0628\u0627: \u0628\u0631\u0643\u0629 \u0627\u0644\u0625\u0644\u0647 \u0639\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u0639\u0627\u0644\u0645 \u0627\u0644\u0631\u0627\u0626\u0639!",
    englishTitle: "KonoSuba: God's Blessing on this Wonderful World!",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx21202-mPOr80AEjUcZ.png",
    year: "2016",
    rating: "8.6",
    episodes: "30",
    airingDay: "\u0645\u0643\u062A\u0645\u0644",
    genres: ["\u0643\u0648\u0645\u064A\u062F\u064A\u0627", "\u0645\u063A\u0627\u0645\u0631\u0627\u062A", "\u0625\u064A\u0633\u064A\u0643\u0627\u064A", "\u0633\u062D\u0631", "\u0625\u064A\u062A\u0634\u064A", "\u062E\u064A\u0627\u0644", "\u062D\u0631\u064A\u0645"],
    description: "\u0628\u0639\u062F \u0645\u0648\u062A\u0647 \u0627\u0644\u0633\u0627\u062E\u0631 \u0641\u064A \u062D\u0627\u062F\u062B \u063A\u0631\u064A\u0628\u060C \u064A\u064F\u0645\u0646\u062D \u0643\u0627\u0632\u0648\u0645\u0627 \u0633\u0627\u062A\u0648 \u0641\u0631\u0635\u0629 \u0644\u0628\u0639\u062B \u062C\u062F\u064A\u062F \u0641\u064A \u0639\u0627\u0644\u0645 \u0645\u0648\u0627\u0632\u064D \u0645\u0644\u064A\u0621 \u0628\u0627\u0644\u0633\u062D\u0631 \u0648\u0627\u0644\u0645\u063A\u0627\u0645\u0631\u0627\u062A \u0628\u0631\u0641\u0642\u0629 \u0627\u0644\u0625\u0644\u0647\u0629 \u0639\u062F\u064A\u0645\u0629 \u0627\u0644\u0641\u0627\u0626\u062F\u0629 \u0623\u0643\u0648\u0627 \u0648\u0645\u062C\u0645\u0648\u0639\u0629 \u063A\u0631\u064A\u0628\u0629 \u0627\u0644\u0623\u0637\u0648\u0627\u0631.",
    duration: "24 \u062F\u0642\u064A\u0642\u0629",
    ageRating: "16+",
    language: "\u064A\u0627\u0628\u0627\u0646\u064A (\u0645\u062A\u0631\u062C\u0645)",
    totalSeasons: 3,
    seasonsList: [
      {
        id: "s1",
        title: "\u0627\u0644\u0645\u0648\u0633\u0645 \u0627\u0644\u0623\u0648\u0644",
        number: 1,
        episodes: [
          { id: "ep-k1", title: "\u0627\u0644\u062D\u0644\u0642\u0629 1 - \u0627\u0644\u0625\u0644\u0647\u0629 \u0627\u0644\u0645\u0632\u0639\u062C\u0629 \u0641\u064A \u0627\u0644\u0639\u0627\u0644\u0645 \u0627\u0644\u0645\u0648\u0627\u0632\u064A", number: 1, duration: "24 \u062F\u0642\u064A\u0642\u0629" }
        ]
      }
    ],
    sourcesMap: {
      "ep-k1": [
        {
          id: "src-k1",
          title: "\u0633\u064A\u0631\u0641\u0631 MP4Upload \u0633\u0631\u064A\u0639 (1080p)",
          quality: "1080p FHD",
          size: "410 MB",
          url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          downloadable: false,
          watchable: true,
          embeddable: true,
          provider: "MP4Upload",
          logoText: "MP4",
          kind: "MP4Upload"
        }
      ]
    }
  },
  {
    id: "7",
    title: "\u0645\u0648\u0634\u0648\u0643\u0648 \u062A\u064A\u0646\u0633\u064A: \u062A\u062C\u0633\u062F \u0627\u0644\u0639\u0627\u0637\u0644",
    englishTitle: "Mushoku Tensei: Jobless Reincarnation",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx108465-1ANspF1EWyFx.jpg",
    year: "2021",
    rating: "8.7",
    episodes: "48",
    airingDay: "\u0645\u0643\u062A\u0645\u0644",
    genres: ["\u062F\u0631\u0627\u0645\u0627", "\u0645\u063A\u0627\u0645\u0631\u0627\u062A", "\u0625\u064A\u0633\u064A\u0643\u0627\u064A", "\u062E\u064A\u0627\u0644", "\u0625\u064A\u062A\u0634\u064A", "\u0633\u062D\u0631", "\u0633\u064A\u0646\u064A\u0646"],
    description: "\u0639\u0627\u0637\u0644 \u0639\u0646 \u0627\u0644\u0639\u0645\u0644 \u0641\u064A \u0627\u0644\u0631\u0627\u0628\u0639\u0629 \u0648\u0627\u0644\u062B\u0644\u0627\u062B\u064A\u0646 \u064A\u064F\u0628\u0639\u062B \u0645\u0646 \u062C\u062F\u064A\u062F \u0641\u064A \u0639\u0627\u0644\u0645 \u0633\u062D\u0631\u064A \u0643\u0631\u0636\u064A\u0639 \u064A\u064F\u062F\u0639\u0649 \u0631\u0648\u062F\u064A\u0648\u0633 \u063A\u0631\u064A\u063A\u0627\u062A\u060C \u0648\u064A\u0642\u0631\u0631 \u0639\u064A\u0634 \u062D\u064A\u0627\u062A\u0647 \u0627\u0644\u062C\u062F\u064A\u062F\u0629 \u0628\u0623\u0642\u0635\u0649 \u0645\u0627 \u064A\u0633\u062A\u0637\u064A\u0639 \u062F\u0648\u0646 \u0646\u062F\u0645.",
    duration: "24 \u062F\u0642\u064A\u0642\u0629",
    ageRating: "17+",
    language: "\u064A\u0627\u0628\u0627\u0646\u064A (\u0645\u062A\u0631\u062C\u0645)",
    totalSeasons: 2,
    seasonsList: [
      {
        id: "s1",
        title: "\u0627\u0644\u0645\u0648\u0633\u0645 \u0627\u0644\u0623\u0648\u0644",
        number: 1,
        episodes: [
          { id: "ep-m1", title: "\u0627\u0644\u062D\u0644\u0642\u0629 1 - \u062A\u062C\u0633\u062F \u0627\u0644\u0639\u0627\u0637\u0644", number: 1, duration: "24 \u062F\u0642\u064A\u0642\u0629" }
        ]
      }
    ],
    sourcesMap: {
      "ep-m1": [
        {
          id: "src-m1",
          title: "\u0633\u064A\u0631\u0641\u0631 UQLoad \u0639\u0627\u0644\u064A \u0627\u0644\u062C\u0648\u062F\u0629",
          quality: "1080p FHD",
          size: "430 MB",
          url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
          downloadable: false,
          watchable: true,
          embeddable: true,
          provider: "UQLoad",
          logoText: "UQ",
          kind: "UQLoad"
        }
      ]
    }
  },
  {
    id: "8",
    title: "\u0644\u0627 \u0644\u0639\u0628\u0629 \u0644\u0627 \u062D\u064A\u0627\u0629",
    englishTitle: "No Game No Life",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/b19815-sEOQ9yQaPKlk.jpg",
    year: "2014",
    rating: "8.5",
    episodes: "12",
    airingDay: "\u0645\u0643\u062A\u0645\u0644",
    genres: ["\u0643\u0648\u0645\u064A\u062F\u064A\u0627", "\u0625\u064A\u0633\u064A\u0643\u0627\u064A", "\u0625\u064A\u062A\u0634\u064A", "\u062E\u064A\u0627\u0644", "\u0623\u0644\u0639\u0627\u0628 \u0645\u0645\u064A\u062A\u0629", "\u062E\u0627\u0631\u0642 \u0644\u0644\u0637\u0628\u064A\u0639\u0629"],
    description: "\u0627\u0644\u0623\u062E\u0648\u0627\u0646 \u0633\u0648\u0631\u0627 \u0648\u0634\u064A\u0631\u0648\u060C \u0627\u0644\u0639\u0628\u0642\u0631\u064A\u0627\u0646 \u0641\u064A \u0623\u0644\u0639\u0627\u0628 \u0627\u0644\u0641\u064A\u062F\u064A\u0648 \u0627\u0644\u0645\u0634\u0647\u0648\u0631\u0627\u0646 \u0628\u0627\u0633\u0645 '\u0627\u0644\u0641\u0631\u0627\u063A'\u060C \u064A\u0646\u062A\u0642\u0644\u0627\u0646 \u0625\u0644\u0649 \u0639\u0627\u0644\u0645 \u064A\u062D\u0638\u0631 \u0627\u0644\u062D\u0631\u0648\u0628 \u0648\u064A\u064F\u062D\u0633\u0645 \u0641\u064A\u0647 \u0643\u0644 \u0646\u0632\u0627\u0639 \u0645\u0646 \u062E\u0644\u0627\u0644 \u0623\u0644\u0639\u0627\u0628 \u0627\u0644\u0630\u0643\u0627\u0621 \u0648\u0627\u0644\u0645\u0631\u0627\u0647\u0646\u0627\u062A.",
    duration: "24 \u062F\u0642\u064A\u0642\u0629",
    ageRating: "16+",
    language: "\u064A\u0627\u0628\u0627\u0646\u064A (\u0645\u062A\u0631\u062C\u0645)",
    totalSeasons: 1,
    seasonsList: [
      {
        id: "s1",
        title: "\u0627\u0644\u0645\u0648\u0633\u0645 \u0627\u0644\u0623\u0648\u0644",
        number: 1,
        episodes: [
          { id: "ep-ng1", title: "\u0627\u0644\u062D\u0644\u0642\u0629 1 - \u0627\u0644\u0628\u062F\u0627\u064A\u0629", number: 1, duration: "24 \u062F\u0642\u064A\u0642\u0629" }
        ]
      }
    ],
    sourcesMap: {
      "ep-ng1": [
        {
          id: "src-ng1",
          title: "\u0633\u064A\u0631\u0641\u0631 VidBom (1080p)",
          quality: "1080p FHD",
          size: "400 MB",
          url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
          downloadable: false,
          watchable: true,
          embeddable: true,
          provider: "VidBom",
          logoText: "VB",
          kind: "VidBom"
        }
      ]
    }
  },
  {
    id: "9",
    title: "\u0647\u0627\u064A\u0633\u0643\u0648\u0644 \u062F\u064A \u062F\u064A",
    englishTitle: "High School DxD",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/nx11617-nmxMU9Zh3H5R.jpg",
    year: "2012",
    rating: "8.1",
    episodes: "48",
    airingDay: "\u0645\u0643\u062A\u0645\u0644",
    genres: ["\u0623\u0643\u0634\u0646", "\u0643\u0648\u0645\u064A\u062F\u064A\u0627", "\u0625\u064A\u062A\u0634\u064A", "\u062D\u0631\u064A\u0645", "\u0634\u064A\u0627\u0637\u064A\u0646", "\u062E\u0627\u0631\u0642 \u0644\u0644\u0637\u0628\u064A\u0639\u0629", "\u0645\u062F\u0631\u0633\u064A"],
    description: "\u0625\u064A\u0633\u064A \u0647\u064A\u0648\u062F\u0648 \u0637\u0627\u0644\u0628 \u062B\u0627\u0646\u0648\u064A \u0645\u0646\u062D\u0631\u0641 \u064A\u064F\u0642\u062A\u0644 \u0641\u064A \u0623\u0648\u0644 \u0645\u0648\u0639\u062F \u063A\u0631\u0627\u0645\u064A \u0644\u0647\u060C \u0644\u0643\u0646 \u062A\u064F\u062D\u064A\u064A\u0647 \u0627\u0644\u0634\u064A\u0637\u0627\u0646\u0629 \u0627\u0644\u062C\u0645\u064A\u0644\u0629 \u0631\u064A\u0627\u0633 \u063A\u0631\u064A\u0645\u0648\u0631\u064A \u0643\u062E\u0627\u062F\u0645 \u0644\u0647\u0627 \u0644\u064A\u0646\u062E\u0631\u0637 \u0641\u064A \u0635\u0631\u0627\u0639\u0627\u062A \u0628\u064A\u0646 \u0627\u0644\u0634\u064A\u0627\u0637\u064A\u0646 \u0648\u0627\u0644\u0645\u0644\u0627\u0626\u0643\u0629.",
    duration: "24 \u062F\u0642\u064A\u0642\u0629",
    ageRating: "18+",
    language: "\u064A\u0627\u0628\u0627\u0646\u064A (\u0645\u062A\u0631\u062C\u0645)",
    totalSeasons: 4,
    seasonsList: [
      {
        id: "s1",
        title: "\u0627\u0644\u0645\u0648\u0633\u0645 \u0627\u0644\u0623\u0648\u0644",
        number: 1,
        episodes: [
          { id: "ep-dxd1", title: "\u0627\u0644\u062D\u0644\u0642\u0629 1 - \u062D\u0635\u0644\u062A \u0639\u0644\u0649 \u0635\u062F\u064A\u0642\u0629!", number: 1, duration: "24 \u062F\u0642\u064A\u0642\u0629" }
        ]
      }
    ],
    sourcesMap: {
      "ep-dxd1": [
        {
          id: "src-dxd1",
          title: "\u0633\u064A\u0631\u0641\u0631 MP4Upload \u0633\u0631\u064A\u0639 (1080p)",
          quality: "1080p FHD",
          size: "420 MB",
          url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
          downloadable: false,
          watchable: true,
          embeddable: true,
          provider: "MP4Upload",
          logoText: "MP4",
          kind: "MP4Upload"
        }
      ]
    }
  },
  {
    id: "10",
    title: "\u0631\u062C\u0644 \u0627\u0644\u0645\u0646\u0634\u0627\u0631",
    englishTitle: "Chainsaw Man",
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx127230-DdP4vAdssLoz.png",
    year: "2022",
    rating: "8.5",
    episodes: "12",
    airingDay: "\u0645\u0643\u062A\u0645\u0644",
    genres: ["\u0623\u0643\u0634\u0646", "\u062E\u064A\u0627\u0644", "\u0631\u0639\u0628", "\u062E\u0627\u0631\u0642 \u0644\u0644\u0637\u0628\u064A\u0639\u0629", "\u0634\u064A\u0627\u0637\u064A\u0646", "\u062F\u0645\u0648\u064A"],
    description: "\u062F\u064A\u0646\u062C\u064A \u0641\u062A\u0649 \u064A\u0639\u064A\u0634 \u0641\u064A \u0641\u0642\u0631 \u0645\u062F\u0642\u0639 \u0648\u064A\u0633\u062F\u062F \u062F\u064A\u0648\u0646 \u0648\u0627\u0644\u062F\u0647 \u0627\u0644\u0631\u0627\u062D\u0644 \u0628\u0645\u0633\u0627\u0639\u062F\u0629 \u0634\u064A\u0637\u0627\u0646 \u0627\u0644\u0645\u0646\u0634\u0627\u0631 \u0628\u0648\u062A\u0634\u064A\u062A\u0627\u060C \u0642\u0628\u0644 \u0623\u0646 \u064A\u0648\u0644\u062F \u0645\u0646 \u062C\u062F\u064A\u062F \u0643\u0647\u062C\u064A\u0646 \u0634\u064A\u0637\u0627\u0646 \u0627\u0644\u0645\u0646\u0634\u0627\u0631.",
    duration: "24 \u062F\u0642\u064A\u0642\u0629",
    ageRating: "18+",
    language: "\u064A\u0627\u0628\u0627\u0646\u064A (\u0645\u062A\u0631\u062C\u0645)",
    totalSeasons: 1,
    seasonsList: [
      {
        id: "s1",
        title: "\u0627\u0644\u0645\u0648\u0633\u0645 \u0627\u0644\u0623\u0648\u0644",
        number: 1,
        episodes: [
          { id: "ep10-1", title: "\u0627\u0644\u062D\u0644\u0642\u0629 1 - \u0627\u0644\u0643\u0644\u0628 \u0648\u0627\u0644\u0645\u0646\u0634\u0627\u0631", number: 1, duration: "24 \u062F\u0642\u064A\u0642\u0629" }
        ]
      }
    ],
    sourcesMap: {
      "ep10-1": [
        {
          id: "src-csm1",
          title: "\u0633\u064A\u0631\u0641\u0631 Voe 1080p",
          quality: "1080p FHD",
          size: "460 MB",
          url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackSeeTheWorld.mp4",
          downloadable: false,
          watchable: true,
          embeddable: true,
          provider: "Voe",
          logoText: "VOE",
          kind: "Voe"
        }
      ]
    }
  }
];

// server/animeApi.ts
var BASE_URL = process.env.ANIME_API_BASE_URL || "https://max-panel.monster/api";
var UNIQUE_KEY = process.env.ANIME_API_UNIQUE_KEY || "flix!123";
function requireConfig() {
  if (!BASE_URL || !UNIQUE_KEY) {
    throw new Error("ANIME_API_NOT_CONFIGURED");
  }
}
async function apiPost(endpoint, params) {
  requireConfig();
  const response = await axios2.post(
    `${BASE_URL}/${endpoint}`,
    new URLSearchParams(params).toString(),
    {
      timeout: 15e3,
      headers: {
        "User-Agent": "okhttp/4.9.2",
        "Accept-Encoding": "gzip",
        "Content-Type": "application/x-www-form-urlencoded",
        "unique-key": UNIQUE_KEY
      }
    }
  );
  return response.data;
}
function listFrom(data) {
  if (Array.isArray(data)) return data.filter(Boolean);
  if (data && typeof data === "object" && Array.isArray(data.data)) {
    return data.data.filter(Boolean);
  }
  return [];
}
function text2(value, fallback = "") {
  return value == null ? fallback : String(value);
}
function poster(item) {
  const toHttp = (v) => {
    if (!v) return null;
    const str = String(v).trim();
    if (!str) return null;
    if (str.startsWith("http://") || str.startsWith("https://")) return str;
    if (str.startsWith("//")) return `https:${str}`;
    return null;
  };
  const anilist = toHttp(item.poster_anilist_url);
  if (anilist) return anilist;
  const tmdbPoster = toHttp(item.poster_tmdb_url);
  if (tmdbPoster) return tmdbPoster;
  const tmdbBackdrop = toHttp(item.backdrop_tmdb_url);
  if (tmdbBackdrop) return tmdbBackdrop;
  if (item.verticle_poster) {
    const vert = String(item.verticle_poster).trim();
    if (vert.startsWith("http://") || vert.startsWith("https://")) return vert;
    if (vert) return `https://max-panel.monster/storage/${vert}`;
  }
  if (item.horizontal_poster) {
    const horiz = String(item.horizontal_poster).trim();
    if (horiz.startsWith("http://") || horiz.startsWith("https://")) return horiz;
    if (horiz) return `https://max-panel.monster/storage/${horiz}`;
  }
  return null;
}
function genres(value) {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === "object") {
        const obj = item;
        return String(obj.name || obj.genre_name || obj.title || obj.label || "").trim();
      }
      return String(item ?? "").trim();
    }).filter(Boolean).slice(0, 5);
  }
  if (value && typeof value === "object") {
    const obj = value;
    const str = String(obj.name || obj.genre_name || obj.title || "").trim();
    if (str) return [str];
    return Object.values(obj).map((v) => String(v).trim()).filter(Boolean).slice(0, 5);
  }
  return text2(value).split(/[،,|]/).map((s) => s.trim()).filter(Boolean).slice(0, 5);
}
function normalizeCard(item) {
  return {
    id: text2(item.content_id || item.id),
    title: text2(item.content_title || item.title, "\u0628\u062F\u0648\u0646 \u0639\u0646\u0648\u0627\u0646"),
    englishTitle: text2(item.english_title),
    poster: poster(item),
    year: text2(item.release_year),
    rating: text2(item.ratings || item.rating),
    episodes: text2(item.total_episodes),
    airingDay: text2(item.airing_day),
    genres: genres(item.genre_name)
  };
}
function normalizeEpisode(item, index) {
  return {
    id: text2(item.episode_id || item.id),
    title: text2(item.episode_title || item.title, `\u0627\u0644\u062D\u0644\u0642\u0629 ${index + 1}`),
    duration: text2(item.episode_duration || item.duration),
    number: Number(item.episode_number || item.number || index + 1)
  };
}
function normalizeSeason(item, index) {
  const rawEpisodes = Array.isArray(item.episodes) ? item.episodes : [];
  return {
    id: text2(item.season_id || item.id || index + 1),
    title: text2(item.season_title || item.title, `\u0627\u0644\u0645\u0648\u0633\u0645 ${index + 1}`),
    number: Number(item.season_number || item.number || index + 1),
    episodes: rawEpisodes.map((episode, episodeIndex) => normalizeEpisode(episode, episodeIndex))
  };
}
function normalizeSources(data) {
  return listFrom(data).map((item, index) => {
    const url = text2(item.source || item.source_url || item.url);
    const meta = sourceMeta(url, item.downloadable === true || item.downloadable === 1 || item.downloadable === "1");
    return {
      id: text2(item.source_id || item.id || index + 1),
      title: text2(item.source_title || item.title, `\u0645\u0635\u062F\u0631 ${index + 1}`),
      quality: text2(item.source_quality || item.quality),
      size: text2(item.source_size || item.size),
      url,
      provider: meta.provider,
      logoText: meta.logoText,
      kind: meta.kind,
      watchable: meta.watchable,
      embeddable: meta.embeddable,
      downloadable: meta.downloadable
    };
  }).filter((source) => source.url);
}
var providerMap = [
  { match: ["mediafire"], name: "MediaFire", logo: "MF" },
  { match: ["mega.nz", "mega.io"], name: "Mega", logo: "MEGA" },
  { match: ["drive.google"], name: "Google Drive", logo: "DRIVE" },
  { match: ["mp4upload"], name: "MP4Upload", logo: "MP4" },
  { match: ["uqload"], name: "UQLoad", logo: "UQ" },
  { match: ["streamtape"], name: "StreamTape", logo: "ST" },
  { match: ["pixeldrain", "pixeldrain.com"], name: "PixelDrain", logo: "PD" },
  { match: ["streamwish", "streamfiles"], name: "StreamFiles", logo: "SF" },
  { match: ["filemoon", "moonplayer"], name: "FileMoon", logo: "FM" },
  { match: ["dailymotion"], name: "DailyMotion", logo: "DM" },
  { match: ["youtube", "youtu.be"], name: "YouTube", logo: "YT" },
  { match: ["voe.sx"], name: "Voe", logo: "VOE" },
  { match: ["dsvplay", "doodstream"], name: "DoodStream", logo: "DOOD" },
  { match: ["ok.ru"], name: "OK.ru", logo: "OK" },
  { match: ["sendvid"], name: "SendVid", logo: "SV" }
];
function providerFor(url) {
  const value = url.toLowerCase();
  return providerMap.find((provider) => provider.match.some((part) => value.includes(part))) ?? { name: "\u0631\u0627\u0628\u0637 \u062E\u0627\u0631\u062C\u064A", logo: "LINK" };
}
function sourceMeta(url, downloadable) {
  const value = url.toLowerCase();
  const provider = providerFor(url);
  const nativeVideo = /\.(mp4|webm|m3u8)(\?|$)/i.test(url);
  const pdIdMatch = /pixeldrain\.com\/u\/([a-zA-Z0-9]+)/i.test(url);
  const sfIdMatch = /(streamwish|streamfiles)\.com\/(?:e|v|d)\/([a-zA-Z0-9]+)/i.test(url);
  const stIdMatch = /streamtape\.com\/(?:e|v)\/([a-zA-Z0-9]+)/i.test(url);
  const mfPageMatch = /mediafire\.com\/file\/([a-zA-Z0-9]+)/i.test(url);
  const directDownload = /download\d+\.mediafire\.com/i.test(url);
  const isStreamProvider = provider.name === "MP4Upload" || provider.name === "UQLoad" || provider.name === "Voe" || provider.name === "DoodStream" || provider.name === "StreamTape" || provider.name === "StreamFiles" || provider.name === "FileMoon";
  const embeddable = nativeVideo || isStreamProvider || provider.name === "PixelDrain" || provider.name === "DailyMotion" || provider.name === "YouTube" || provider.name === "OK.ru" || provider.name === "SendVid";
  const watchable = embeddable;
  return {
    provider: provider.name,
    logoText: provider.logo,
    kind: provider.name,
    watchable,
    embeddable,
    downloadable: downloadable || provider.name === "MediaFire" || provider.name === "Mega" || provider.name === "Google Drive" || directDownload || mfPageMatch
  };
}
function isConfigured() {
  return true;
}
var MF_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
async function resolveMediafire(mfUrl) {
  if (!mfUrl) return { url: mfUrl, direct: false };
  if (/download\d+\.mediafire\.com/.test(mfUrl)) return { url: mfUrl, direct: true };
  try {
    const { data: html } = await axios2.get(mfUrl, {
      headers: {
        "User-Agent": MF_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ar,en;q=0.9",
        "Referer": "https://www.mediafire.com/",
        "Upgrade-Insecure-Requests": "1"
      },
      timeout: 8e3,
      maxRedirects: 5
    });
    const patterns = [
      /href="(https:\/\/download\d+\.mediafire\.com\/[^"]+)"\s+id="downloadButton"/i,
      /id="downloadButton"[^>]*href="(https:\/\/download\d+\.mediafire\.com\/[^"]+)"/i,
      /"(https:\/\/download\d+\.mediafire\.com\/[^"?\s]+)"/i,
      /window\.location\.href\s*=\s*['"]?(https:\/\/download\d+\.mediafire\.com\/[^'">\s]+)/i,
      /aria-label="Download file"[^>]*href="([^"]+)"/i
    ];
    for (const pat of patterns) {
      const m = String(html).match(pat);
      if (m?.[1]) return { url: m[1], direct: true };
    }
    const keyMatch = mfUrl.match(/\/file\/([a-z0-9]+)/i);
    if (keyMatch) {
      try {
        const apiRes = await axios2.get(
          `https://www.mediafire.com/api/1.5/file/get_links.php?quick_key=${keyMatch[1]}&response_format=json`,
          { headers: { "User-Agent": MF_UA }, timeout: 5e3 }
        );
        const dl = apiRes.data?.response?.links?.[0]?.normal_download;
        if (dl) return { url: dl, direct: true };
      } catch (_) {
      }
    }
  } catch (_) {
  }
  return { url: mfUrl, direct: false };
}
async function resolvePixeldrain(url) {
  if (!url) return { url, embedUrl: url, direct: false };
  const m = url.match(/pixeldrain\.com\/u\/([a-zA-Z0-9]+)/i);
  if (!m) return { url, embedUrl: url, direct: false };
  const id = m[1];
  return {
    url: `https://cdn.pixeldrain.com/${id}.mp4`,
    embedUrl: `https://cdn.pixeldrain.com/${id}.mp4`,
    direct: true
  };
}
function resolveStreamFiles(url) {
  if (!url) return { url, embedUrl: url, direct: false };
  const m = url.match(/(?:streamwish|streamfiles)\.com\/(?:e|v|d)\/([a-zA-Z0-9]+)/i);
  if (!m) return { url, embedUrl: url, direct: false };
  const id = m[1];
  return {
    url,
    embedUrl: `https://streamwish.com/e/${id}`,
    direct: false
  };
}
async function resolveStreamTape(url) {
  if (!url) return { url, embedUrl: url, direct: false };
  let normalized = url;
  const eMatch = url.match(/streamtape\.com\/(?:e|v)\/([a-zA-Z0-9]+)/i);
  if (!eMatch) return { url, embedUrl: url, direct: false };
  const id = eMatch[1];
  normalized = `https://streamtape.com/e/${id}`;
  return { url: normalized, embedUrl: normalized, direct: false };
}
async function listLatest(start = 0, limit = 12, genreId = "18") {
  if (isConfigured()) {
    try {
      const data = await apiPost("Content/searchContent", {
        start: String(start),
        limit: String(limit),
        order_by: "created_at",
        order_direction: "DESC",
        genre_id: genreId
      });
      const items = listFrom(data).map(normalizeCard).filter((item) => item.id);
      if (items.length > 0) return items;
    } catch (error) {
      console.warn("[Anime API] listLatest error, using fallback catalog:", error);
    }
  }
  return FALLBACK_ANIMES.slice(start, start + limit).map((item) => ({
    id: item.id,
    title: item.title,
    englishTitle: item.englishTitle,
    poster: item.poster,
    year: item.year,
    rating: item.rating,
    episodes: item.episodes,
    airingDay: item.airingDay,
    genres: item.genres
  }));
}
async function searchContentInternal(params) {
  const data = await apiPost("Content/searchContent", {
    content_type: "0",
    language_id: "0",
    genre_id: "0",
    order_by: "created_at",
    order_direction: "DESC",
    ...params
  });
  return listFrom(data).map(normalizeCard).filter((item) => item.id);
}
async function searchAnime(keyword, start = 0, limit = 24) {
  if (isConfigured()) {
    try {
      const data = await apiPost("Content/searchContent", {
        search_keyword: keyword,
        content_type: "0",
        start: String(start),
        limit: String(limit),
        order_by: "created_at",
        order_direction: "DESC",
        language_id: "0",
        genre_id: "0"
      });
      const items = listFrom(data).map(normalizeCard).filter((item) => item.id);
      if (items.length > 0) return items;
    } catch (error) {
      console.warn("[Anime API] searchAnime error, using fallback catalog:", error);
    }
  }
  const q = keyword.trim().toLowerCase();
  return FALLBACK_ANIMES.filter(
    (item) => !q || item.title.toLowerCase().includes(q) || item.englishTitle.toLowerCase().includes(q) || item.genres.some((g) => g.toLowerCase().includes(q))
  ).slice(start, start + limit).map((item) => ({
    id: item.id,
    title: item.title,
    englishTitle: item.englishTitle,
    poster: item.poster,
    year: item.year,
    rating: item.rating,
    episodes: item.episodes,
    airingDay: item.airingDay,
    genres: item.genres
  }));
}
async function getDetails(id) {
  if (isConfigured()) {
    try {
      const data = await apiPost("Content/getContentDetailsByID", {
        user_id: "B80E7D43",
        content_id: id,
        exclude_seasons: "1"
      });
      const item = listFrom(data)[0] || data.data || data;
      const card = normalizeCard(item);
      if (card.id) {
        return {
          ...card,
          description: text2(item.description || item.synopsis),
          duration: text2(item.duration),
          ageRating: text2(item.age_rating),
          language: text2(item.language_name),
          totalSeasons: Number(item.total_seasons || 0)
        };
      }
    } catch (error) {
      console.warn("[Anime API] getDetails error, using fallback catalog:", error);
    }
  }
  const found = FALLBACK_ANIMES.find((item) => item.id === id) ?? FALLBACK_ANIMES[0];
  return {
    id: found.id,
    title: found.title,
    englishTitle: found.englishTitle,
    poster: found.poster,
    year: found.year,
    rating: found.rating,
    episodes: found.episodes,
    airingDay: found.airingDay,
    genres: found.genres,
    description: found.description,
    duration: found.duration,
    ageRating: found.ageRating,
    language: found.language,
    totalSeasons: found.totalSeasons
  };
}
async function getSeasons(id) {
  if (isConfigured()) {
    try {
      const data = await apiPost("Content/getSeasonByContentID", {
        user_id: "B80E7D43",
        content_id: id,
        lazy: "1"
      });
      const seasons = listFrom(data).map(normalizeSeason);
      if (seasons.length > 0) return seasons;
    } catch (error) {
      console.warn("[Anime API] getSeasons error, using fallback catalog:", error);
    }
  }
  const found = FALLBACK_ANIMES.find((item) => item.id === id) ?? FALLBACK_ANIMES[0];
  return found.seasonsList;
}
async function getEpisodeSources(episodeId) {
  let sources = [];
  if (isConfigured()) {
    try {
      const data = await apiPost("Content/getSourceByEpisodeID", { episode_id: episodeId });
      sources = normalizeSources(data);
    } catch (error) {
      console.warn("[Anime API] getEpisodeSources error, using fallback catalog:", error);
    }
  }
  if (sources.length === 0) {
    for (const anime of FALLBACK_ANIMES) {
      if (anime.sourcesMap[episodeId]) {
        sources = anime.sourcesMap[episodeId];
        break;
      }
    }
    if (sources.length === 0) {
      sources = FALLBACK_ANIMES[0].sourcesMap["ep1-1"] ?? [];
    }
  }
  const resolved = await Promise.allSettled(
    sources.map(async (source) => {
      let url = source.url;
      let embedUrl;
      let direct;
      let hint;
      if (url.includes("mp4upload.com") && !url.includes("/embed-")) {
        url = url.replace(/mp4upload\.com\/([a-zA-Z0-9]+)(?:\.html)?/, "mp4upload.com/embed-$1.html");
      }
      if (url.includes("mediafire.com")) {
        const mf = await resolveMediafire(url);
        if (mf.direct) {
          const isVideo = /\.(mp4|webm|mkv|m3u8)(\?|$)/i.test(mf.url);
          return {
            ...source,
            url: mf.url,
            resolvedUrl: mf.url,
            direct: true,
            watchable: isVideo || source.watchable,
            embeddable: isVideo || source.embeddable,
            hint: isVideo ? "\u062A\u0634\u063A\u064A\u0644 \u0648\u062A\u062D\u0645\u064A\u0644 \u0645\u0628\u0627\u0634\u0631" : "\u062A\u062D\u0645\u064A\u0644 \u0645\u0628\u0627\u0634\u0631 \u0628\u0646\u0642\u0631\u0629 \u0648\u0627\u062D\u062F\u0629"
          };
        }
      }
      if (/pixeldrain\.com\/u\//i.test(url)) {
        const pd = await resolvePixeldrain(url);
        return {
          ...source,
          url: pd.url,
          embedUrl: pd.embedUrl,
          resolvedUrl: pd.url,
          direct: pd.direct,
          watchable: true,
          embeddable: false,
          downloadable: true,
          hint: "\u062A\u0634\u063A\u064A\u0644 \u0645\u0628\u0627\u0634\u0631 (\u062A\u062C\u0627\u0648\u0632 \u0631\u0641\u0636 \u0627\u0644\u0627\u062A\u0635\u0627\u0644)"
        };
      }
      if (/streamfiles\.com|streamwish\.com/i.test(url)) {
        const sf = resolveStreamFiles(url);
        if (sf.embedUrl !== url) {
          return {
            ...source,
            url: sf.url,
            embedUrl: sf.embedUrl,
            resolvedUrl: sf.embedUrl,
            direct: false,
            watchable: true,
            embeddable: true,
            hint: "\u0645\u0634\u0627\u0647\u062F\u0629 \u062F\u0627\u062E\u0644\u064A\u0629 \u0639\u0628\u0631 \u0627\u0644\u0625\u0637\u0627\u0631 \u0627\u0644\u0645\u0636\u0645\u0651\u0646"
          };
        }
      }
      if (/streamtape\.com/i.test(url)) {
        const st = await resolveStreamTape(url);
        if (st.embedUrl !== url) {
          return {
            ...source,
            url: st.embedUrl,
            embedUrl: st.embedUrl,
            resolvedUrl: st.embedUrl,
            direct: false,
            watchable: true,
            embeddable: true,
            hint: "\u062A\u0634\u063A\u064A\u0644 \u062F\u0627\u062E\u0644\u064A (StreamTape)"
          };
        }
      }
      return {
        ...source,
        url,
        embedUrl: embedUrl ?? url,
        direct,
        hint
      };
    })
  );
  return resolved.map((item, index) => item.status === "fulfilled" ? item.value : sources[index]);
}
var KNOWN_GENRES = [
  { id: "56", name: "\u0625\u064A\u062A\u0634\u064A", aliases: ["\u0627\u064A\u062A\u0634\u064A", "\u0625\u064A\u062A\u0634\u064A", "\u0627\u064A\u0634\u064A", "ecchi", "hentai"], maxOffset: 300, specificity: 10 },
  { id: "32", name: "\u0625\u064A\u0633\u064A\u0643\u0627\u064A", aliases: ["\u0627\u064A\u0633\u064A\u0643\u0627\u064A", "\u0625\u064A\u0633\u064A\u0643\u0627\u064A", "isekai"], maxOffset: 250, specificity: 9 },
  { id: "41", name: "\u062D\u0631\u064A\u0645", aliases: ["\u062D\u0631\u064A\u0645", "harem"], maxOffset: 200, specificity: 8 },
  { id: "58", name: "\u0622\u0644\u0627\u062A / \u0645\u064A\u0643\u0627", aliases: ["\u0622\u0644\u0627\u062A", "\u0645\u064A\u0643\u0627", "mecha"], maxOffset: 150, specificity: 8 },
  { id: "50", name: "\u0623\u0644\u0639\u0627\u0628 \u0645\u0645\u064A\u062A\u0629", aliases: ["\u0623\u0644\u0639\u0627\u0628 \u0645\u0645\u064A\u062A\u0629", "\u0627\u0644\u0639\u0627\u0628 \u0645\u0645\u064A\u062A\u0629", "survival"], maxOffset: 100, specificity: 8 },
  { id: "53", name: "\u0645\u0648\u0633\u064A\u0642\u0649", aliases: ["\u0645\u0648\u0633\u064A\u0642\u0649", "music"], maxOffset: 150, specificity: 8 },
  { id: "54", name: "\u0641\u0646\u0648\u0646 \u0642\u062A\u0627\u0644", aliases: ["\u0641\u0646\u0648\u0646 \u0642\u062A\u0627\u0644", "martial arts"], maxOffset: 200, specificity: 8 },
  { id: "59", name: "\u0645\u0635\u0627\u0635\u064A \u062F\u0645\u0627\u0621", aliases: ["\u0645\u0635\u0627\u0635\u064A \u062F\u0645\u0627\u0621", "vampires"], maxOffset: 100, specificity: 8 },
  { id: "52", name: "\u062C\u0631\u064A\u0645\u0629", aliases: ["\u062C\u0631\u064A\u0645\u0629", "crime"], maxOffset: 150, specificity: 7 },
  { id: "28", name: "\u0633\u062D\u0631", aliases: ["\u0633\u062D\u0631", "magic"], maxOffset: 350, specificity: 7 },
  { id: "49", name: "\u0634\u064A\u0627\u0637\u064A\u0646", aliases: ["\u0634\u064A\u0627\u0637\u064A\u0646", "\u0634\u064A\u0637\u0627\u0646", "demons"], maxOffset: 250, specificity: 7 },
  { id: "51", name: "\u0642\u0648\u0649 \u062E\u0627\u0631\u0642\u0629", aliases: ["\u0642\u0648\u0649 \u062E\u0627\u0631\u0642\u0629", "superpower", "super power"], maxOffset: 400, specificity: 6 },
  { id: "45", name: "\u0631\u0639\u0628", aliases: ["\u0631\u0639\u0628", "horror"], maxOffset: 200, specificity: 7 },
  { id: "46", name: "\u0646\u0641\u0633\u064A", aliases: ["\u0646\u0641\u0633\u064A", "\u0633\u064A\u0643\u0648\u0644\u0648\u062C\u064A", "psychological"], maxOffset: 250, specificity: 6 },
  { id: "35", name: "\u0631\u064A\u0627\u0636\u0629", aliases: ["\u0631\u064A\u0627\u0636\u0629", "\u0631\u064A\u0627\u0636\u064A", "sports"], maxOffset: 250, specificity: 6 },
  { id: "48", name: "\u062A\u0627\u0631\u064A\u062E\u064A", aliases: ["\u062A\u0627\u0631\u064A\u062E\u064A", "historical"], maxOffset: 250, specificity: 6 },
  { id: "37", name: "\u0634\u0648\u062C\u0648", aliases: ["\u0634\u0648\u062C\u0648", "shoujo", "shojo"], maxOffset: 200, specificity: 6 },
  { id: "57", name: "\u0633\u064A\u0646\u064A\u0646", aliases: ["\u0633\u064A\u0646\u064A\u0646", "seinen"], maxOffset: 300, specificity: 6 },
  { id: "24", name: "\u0645\u062F\u0631\u0633\u064A", aliases: ["\u0645\u062F\u0631\u0633\u064A", "school"], maxOffset: 450, specificity: 5 },
  { id: "25", name: "\u063A\u0645\u0648\u0636", aliases: ["\u063A\u0645\u0648\u0636", "mystery"], maxOffset: 450, specificity: 5 },
  { id: "47", name: "\u0625\u062B\u0627\u0631\u0629", aliases: ["\u0625\u062B\u0627\u0631\u0629", "\u0627\u062B\u0627\u0631\u0629", "\u062A\u0634\u0648\u064A\u0642", "thriller", "suspense"], maxOffset: 500, specificity: 5 },
  { id: "36", name: "\u062E\u064A\u0627\u0644 \u0639\u0644\u0645\u064A", aliases: ["\u062E\u064A\u0627\u0644 \u0639\u0644\u0645\u064A", "sci-fi", "scifi"], maxOffset: 400, specificity: 5 },
  { id: "44", name: "\u062E\u0627\u0631\u0642 \u0644\u0644\u0637\u0628\u064A\u0639\u0629", aliases: ["\u062E\u0627\u0631\u0642 \u0644\u0644\u0637\u0628\u064A\u0639\u0629", "\u062E\u0627\u0631\u0642", "supernatural"], maxOffset: 600, specificity: 4 },
  { id: "55", name: "\u0634\u0631\u064A\u062D\u0629 \u0645\u0646 \u0627\u0644\u062D\u064A\u0627\u0629", aliases: ["\u0634\u0631\u064A\u062D\u0629 \u0645\u0646 \u0627\u0644\u062D\u064A\u0627\u0629", "slice of life"], maxOffset: 400, specificity: 4 },
  { id: "33", name: "\u0631\u0648\u0645\u0627\u0646\u0633\u064A", aliases: ["\u0631\u0648\u0645\u0627\u0646\u0633\u064A", "\u0631\u0648\u0645\u0646\u0633\u064A", "\u0631\u0648\u0645\u0627\u0646\u0633\u064A\u0629", "romance"], maxOffset: 600, specificity: 4 },
  { id: "26", name: "\u0643\u0648\u0645\u064A\u062F\u064A\u0627", aliases: ["\u0643\u0648\u0645\u064A\u062F\u064A", "\u0643\u0648\u0645\u064A\u062F\u064A\u0627", "comedy"], maxOffset: 800, specificity: 3 },
  { id: "38", name: "\u0634\u0648\u0646\u064A\u0646", aliases: ["\u0634\u0648\u0646\u064A\u0646", "shounen", "shonen"], maxOffset: 600, specificity: 3 },
  { id: "34", name: "\u062E\u064A\u0627\u0644", aliases: ["\u062E\u064A\u0627\u0644", "\u0641\u0646\u062A\u0627\u0632\u064A\u0627", "fantasy"], maxOffset: 900, specificity: 2 },
  { id: "31", name: "\u0645\u063A\u0627\u0645\u0631\u0627\u062A", aliases: ["\u0645\u063A\u0627\u0645\u0631\u0627\u062A", "\u0645\u063A\u0627\u0645\u0631\u0629", "adventure"], maxOffset: 800, specificity: 2 },
  { id: "29", name: "\u0623\u0643\u0634\u0646", aliases: ["\u0623\u0643\u0634\u0646", "\u0627\u0643\u0634\u0646", "action"], maxOffset: 1200, specificity: 1 },
  { id: "30", name: "\u062F\u0631\u0627\u0645\u0627", aliases: ["\u062F\u0631\u0627\u0645\u0627", "drama"], maxOffset: 800, specificity: 1 }
];
function normalizeGenreText(s) {
  return s.toLowerCase().trim().replace(/[أإآ]/g, "\u0627").replace(/ة/g, "\u0647").replace(/ى/g, "\u064A").replace(/[\s\-_/]+/g, "");
}
function findKnownGenre(labelOrId) {
  const norm = normalizeGenreText(labelOrId);
  return KNOWN_GENRES.find(
    (g) => g.id === labelOrId || normalizeGenreText(g.name) === norm || g.aliases.some((a) => normalizeGenreText(a) === norm)
  );
}
function doesAnimeHaveGenre(animeGenres, requestedGenre) {
  const def = findKnownGenre(requestedGenre);
  const targets = def ? [def.name, ...def.aliases] : [requestedGenre];
  const normTargets = targets.map(normalizeGenreText);
  const normAnimeGenres = (animeGenres || []).map(normalizeGenreText);
  return normTargets.some(
    (target) => normAnimeGenres.some((g) => g.includes(target) || target.includes(g))
  );
}
var genreDetailsCache = /* @__PURE__ */ new Map();
async function inspectDetailsInBatches(cards, batchSize = 6) {
  const details = [];
  for (let index = 0; index < cards.length; index += batchSize) {
    const batch = cards.slice(index, index + batchSize);
    const results = await Promise.all(batch.map((card) => getDetails(card.id).catch(() => null)));
    results.forEach((detail) => {
      if (detail) {
        genreDetailsCache.set(detail.id, detail);
        details.push(detail);
      }
    });
  }
  return details;
}
async function discoverGenres() {
  return KNOWN_GENRES.map((g) => g.name);
}
async function getRandomByGenre(input = "all") {
  const rawList = Array.isArray(input) ? input : [input];
  const selectedGenres = rawList.map((s) => (s || "").trim()).filter((s) => Boolean(s) && s !== "all" && s !== "\u0643\u0644 \u0627\u0644\u062A\u0635\u0646\u064A\u0641\u0627\u062A");
  const matchesAllSelected = (item) => {
    if (!selectedGenres.length) return true;
    return selectedGenres.every((genre) => doesAnimeHaveGenre(item.genres, genre));
  };
  const countMatches = (item) => {
    return selectedGenres.reduce((acc, genre) => doesAnimeHaveGenre(item.genres, genre) ? acc + 1 : acc, 0);
  };
  if (isConfigured()) {
    try {
      if (selectedGenres.length === 0) {
        const orderDirection = Math.random() > 0.5 ? "ASC" : "DESC";
        const randomStart = Math.floor(Math.random() * 3200);
        try {
          const randomBatch = await searchContentInternal({
            start: String(randomStart),
            limit: "12",
            order_by: "created_at",
            order_direction: orderDirection,
            genre_id: "0"
          });
          if (randomBatch.length > 0) {
            const pickedCard = randomBatch[Math.floor(Math.random() * randomBatch.length)];
            const details = await getDetails(pickedCard.id);
            if (details) {
              genreDetailsCache.set(details.id, details);
              return details;
            }
          }
        } catch (e) {
          console.warn("[Anime API] Random all-time search failed:", e);
        }
      }
      if (selectedGenres.length > 0) {
        const cachedCandidates = Array.from(genreDetailsCache.values()).filter(matchesAllSelected);
        if (cachedCandidates.length >= 3 && Math.random() < 0.4) {
          return cachedCandidates[Math.floor(Math.random() * cachedCandidates.length)];
        }
        const defs = selectedGenres.map(findKnownGenre).filter((d) => Boolean(d)).sort((a, b) => b.specificity - a.specificity);
        const primaryDef = defs[0] || {
          id: "0",
          name: selectedGenres[0],
          aliases: [],
          maxOffset: 400,
          specificity: 5
        };
        const orderDirection = Math.random() > 0.4 ? "ASC" : "DESC";
        const offsetLimit = Math.max(20, primaryDef.maxOffset);
        const randomStart = Math.floor(Math.random() * offsetLimit);
        const batchCards = await searchContentInternal({
          start: String(randomStart),
          limit: "20",
          order_by: "created_at",
          order_direction: orderDirection,
          genre_id: primaryDef.id
        });
        if (batchCards.length > 0) {
          const inspected = await inspectDetailsInBatches(batchCards);
          const perfectMatches = inspected.filter(matchesAllSelected);
          if (perfectMatches.length > 0) {
            return perfectMatches[Math.floor(Math.random() * perfectMatches.length)];
          }
          const allCachedMatches = Array.from(genreDetailsCache.values()).filter(matchesAllSelected);
          if (allCachedMatches.length > 0) {
            return allCachedMatches[Math.floor(Math.random() * allCachedMatches.length)];
          }
          const altDirection = orderDirection === "ASC" ? "DESC" : "ASC";
          const altCards = await searchContentInternal({
            start: String(Math.floor(Math.random() * (offsetLimit / 2))),
            limit: "15",
            order_by: "created_at",
            order_direction: altDirection,
            genre_id: primaryDef.id
          });
          if (altCards.length > 0) {
            const altInspected = await inspectDetailsInBatches(altCards);
            const altMatches = altInspected.filter(matchesAllSelected);
            if (altMatches.length > 0) {
              return altMatches[Math.floor(Math.random() * altMatches.length)];
            }
          }
          const ranked = inspected.sort((a, b) => countMatches(b) - countMatches(a));
          if (ranked[0] && countMatches(ranked[0]) > 0) {
            return ranked[0];
          }
        }
      }
    } catch (error) {
      console.warn("[Anime API] getRandomByGenre error, using fallback catalog:", error);
    }
  }
  const catalogDetails = FALLBACK_ANIMES.map((a) => ({
    id: a.id,
    title: a.title,
    englishTitle: a.englishTitle,
    poster: a.poster,
    year: a.year,
    rating: a.rating,
    episodes: a.episodes,
    airingDay: a.airingDay,
    genres: a.genres,
    description: a.description,
    duration: a.duration,
    ageRating: a.ageRating,
    language: a.language,
    totalSeasons: a.totalSeasons
  }));
  if (!selectedGenres.length) {
    return catalogDetails[Math.floor(Math.random() * catalogDetails.length)] ?? null;
  }
  const perfectFallback = catalogDetails.filter(matchesAllSelected);
  if (perfectFallback.length > 0) {
    return perfectFallback[Math.floor(Math.random() * perfectFallback.length)];
  }
  const sortedFallback = catalogDetails.sort((a, b) => countMatches(b) - countMatches(a));
  return sortedFallback[0] ?? null;
}

// server/routers.ts
var apiError = (error) => new Error(error instanceof Error ? error.message : "ANIME_API_ERROR");
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  account: router({
    favorites: protectedProcedure.query(({ ctx }) => listFavorites(ctx.user.id)),
    addFavorite: protectedProcedure.input(z2.object({ contentId: z2.string().min(1), title: z2.string().min(1), poster: z2.string().nullable().optional() })).mutation(({ ctx, input }) => saveFavorite(ctx.user.id, input.contentId, input.title, input.poster)),
    removeFavorite: protectedProcedure.input(z2.object({ contentId: z2.string().min(1) })).mutation(({ ctx, input }) => removeFavorite(ctx.user.id, input.contentId)),
    history: protectedProcedure.query(({ ctx }) => listHistory(ctx.user.id)),
    saveHistory: protectedProcedure.input(z2.object({ contentId: z2.string().min(1), animeTitle: z2.string().min(1), episodeId: z2.string().min(1), episodeTitle: z2.string().min(1) })).mutation(({ ctx, input }) => saveHistory(ctx.user.id, input.contentId, input.animeTitle, input.episodeId, input.episodeTitle))
  }),
  anime: router({
    latest: publicProcedure.input(z2.object({ genreId: z2.string().default("18"), start: z2.number().int().min(0).default(0), limit: z2.number().int().min(1).max(30).default(12) }).optional()).query(async ({ input }) => {
      try {
        return await listLatest(input?.start ?? 0, input?.limit ?? 12, input?.genreId ?? "18");
      } catch (error) {
        throw apiError(error);
      }
    }),
    search: publicProcedure.input(z2.object({ keyword: z2.string().trim().min(1), start: z2.number().int().min(0).default(0), limit: z2.number().int().min(1).max(30).default(24) })).query(async ({ input }) => {
      try {
        return await searchAnime(input.keyword, input.start, input.limit);
      } catch (error) {
        throw apiError(error);
      }
    }),
    details: publicProcedure.input(z2.object({ id: z2.string().min(1) })).query(async ({ input }) => {
      try {
        return await getDetails(input.id);
      } catch (error) {
        throw apiError(error);
      }
    }),
    seasons: publicProcedure.input(z2.object({ id: z2.string().min(1) })).query(async ({ input }) => {
      try {
        return await getSeasons(input.id);
      } catch (error) {
        throw apiError(error);
      }
    }),
    episodeSources: publicProcedure.input(z2.object({ episodeId: z2.string().min(1) })).query(async ({ input }) => {
      try {
        return await getEpisodeSources(input.episodeId);
      } catch (error) {
        throw apiError(error);
      }
    }),
    genres: publicProcedure.query(async () => {
      try {
        return await discoverGenres();
      } catch (error) {
        throw apiError(error);
      }
    }),
    random: publicProcedure.input(z2.object({ genres: z2.array(z2.string()).max(20).optional(), genre: z2.string().optional(), genreId: z2.string().optional() }).optional()).query(async ({ input }) => {
      try {
        const selected = input?.genres?.length ? input.genres : input?.genre ?? input?.genreId ?? "all";
        return await getRandomByGenre(selected);
      } catch (error) {
        throw apiError(error);
      }
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/vite.ts
import express from "express";
import fs2 from "fs";
import { nanoid } from "nanoid";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
var PROJECT_ROOT = import.meta.dirname;
var LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
var MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024;
var TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6);
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}
function trimLogFile(logPath, maxSize) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }
    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines = [];
    let keptBytes = 0;
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}
`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }
    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
  }
}
function writeToLogFile(source, entries) {
  if (entries.length === 0) return;
  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);
  const lines = entries.map((entry) => {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });
  fs.appendFileSync(logPath, `${lines.join("\n")}
`, "utf-8");
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}
function vitePluginManusDebugCollector() {
  return {
    name: "manus-debug-collector",
    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true
            },
            injectTo: "head"
          }
        ]
      };
    },
    configureServer(server) {
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }
        const handlePayload = (payload) => {
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };
        const reqBody = req.body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    }
  };
}
var plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    host: "0.0.0.0",
    port: 3e3,
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path2.resolve(import.meta.dirname, "../..", "dist", "public") : path2.resolve(import.meta.dirname, "public");
  if (!fs2.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
process.env.NODE_ENV = process.env.NODE_ENV || "development";
async function startServer() {
  const app = express2();
  const server = createServer(app);
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const PORT = 3e3;
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}/`);
  });
}
startServer().catch(console.error);
