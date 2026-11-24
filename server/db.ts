import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { animeFavorites, animeHistory, InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
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

// In-memory fallback store when MySQL is not connected
const inMemoryUsers = new Map<string, any>();
const inMemoryFavorites = new Map<string, any>();
const inMemoryHistory = new Map<string, any>();
let autoIncUserId = 1;
let autoIncFavId = 1;
let autoIncHistId = 1;

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    const existing = inMemoryUsers.get(user.openId);
    const now = new Date();
    const role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : (existing?.role ?? "user"));
    const updated = {
      id: existing?.id ?? autoIncUserId++,
      openId: user.openId,
      name: user.name ?? existing?.name ?? null,
      email: user.email ?? existing?.email ?? null,
      loginMethod: user.loginMethod ?? existing?.loginMethod ?? null,
      role,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastSignedIn: user.lastSignedIn ?? now,
    };
    inMemoryUsers.set(user.openId, updated);
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    return inMemoryUsers.get(openId);
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function listFavorites(userId: number) {
  const db = await getDb();
  if (!db) {
    return Array.from(inMemoryFavorites.values())
      .filter((fav: any) => fav.userId === userId)
      .sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db.select().from(animeFavorites).where(eq(animeFavorites.userId, userId)).orderBy(desc(animeFavorites.createdAt));
}

export async function saveFavorite(userId: number, contentId: string, title: string, poster?: string | null) {
  const db = await getDb();
  if (!db) {
    const key = `${userId}:${contentId}`;
    const existing = inMemoryFavorites.get(key);
    inMemoryFavorites.set(key, {
      id: existing?.id ?? autoIncFavId++,
      userId,
      contentId,
      title,
      poster: poster ?? null,
      createdAt: existing?.createdAt ?? new Date(),
    });
    return { success: true } as const;
  }
  await db.insert(animeFavorites).values({ userId, contentId, title, poster: poster ?? null }).onDuplicateKeyUpdate({ set: { title, poster: poster ?? null } });
  return { success: true } as const;
}

export async function removeFavorite(userId: number, contentId: string) {
  const db = await getDb();
  if (!db) {
    inMemoryFavorites.delete(`${userId}:${contentId}`);
    return { success: true } as const;
  }
  await db.delete(animeFavorites).where(and(eq(animeFavorites.userId, userId), eq(animeFavorites.contentId, contentId)));
  return { success: true } as const;
}

export async function listHistory(userId: number) {
  const db = await getDb();
  if (!db) {
    return Array.from(inMemoryHistory.values())
      .filter((hist: any) => hist.userId === userId)
      .sort((a: any, b: any) => b.watchedAt.getTime() - a.watchedAt.getTime())
      .slice(0, 30);
  }
  return db.select().from(animeHistory).where(eq(animeHistory.userId, userId)).orderBy(desc(animeHistory.watchedAt)).limit(30);
}

export async function saveHistory(userId: number, contentId: string, animeTitle: string, episodeId: string, episodeTitle: string) {
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
      watchedAt: new Date(),
    });
    return { success: true } as const;
  }
  await db.insert(animeHistory).values({ userId, contentId, animeTitle, episodeId, episodeTitle, watchedAt: new Date() }).onDuplicateKeyUpdate({ set: { contentId, animeTitle, episodeTitle, watchedAt: new Date() } });
  return { success: true } as const;
}

