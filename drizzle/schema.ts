import { int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
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
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const animeFavorites = mysqlTable("anime_favorites", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  contentId: varchar("contentId", { length: 128 }).notNull(),
  title: text("title").notNull(),
  poster: text("poster"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  userContent: uniqueIndex("favorites_user_content_idx").on(table.userId, table.contentId),
}));

export const animeHistory = mysqlTable("anime_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  contentId: varchar("contentId", { length: 128 }).notNull(),
  animeTitle: text("animeTitle").notNull(),
  episodeId: varchar("episodeId", { length: 128 }).notNull(),
  episodeTitle: text("episodeTitle").notNull(),
  watchedAt: timestamp("watchedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  userEpisode: uniqueIndex("history_user_episode_idx").on(table.userId, table.episodeId),
}));

export type AnimeFavorite = typeof animeFavorites.$inferSelect;
export type AnimeHistory = typeof animeHistory.$inferSelect;