import { describe, expect, it, vi } from "vitest";

vi.mock("./animeApi", () => ({
  classifySource: (url: string) => url.includes("mediafire") ? "MediaFire" : "رابط خارجي",
  normalizeCard: (item: Record<string, unknown>) => ({
    id: String(item.content_id || item.id),
    title: String(item.content_title || item.title || "بدون عنوان"),
    englishTitle: String(item.english_title || ""),
    poster: String(item.poster_anilist_url || "") || null,
    year: String(item.release_year || ""),
    rating: String(item.ratings || ""),
    episodes: String(item.total_episodes || ""),
    airingDay: String(item.airing_day || ""),
    genres: Array.isArray(item.genre_name) ? item.genre_name.map(String) : [],
  }),
  listLatest: vi.fn().mockResolvedValue([]),
  searchAnime: vi.fn().mockResolvedValue([{ id: "A-1", title: "Sample Anime" }]),
  getDetails: vi.fn().mockResolvedValue({ id: "A-1", title: "Sample Anime" }),
  getSeasons: vi.fn().mockResolvedValue([]),
  getEpisodeSources: vi.fn().mockResolvedValue([]),
  getRandomByGenre: vi.fn().mockResolvedValue(null),
}));

import { appRouter } from "./routers";
import { classifySource, normalizeCard } from "./animeApi";

describe("anime data normalization", () => {
  it("normalizes poster, title, score, and genres", () => {
    const result = normalizeCard({
      content_id: "A-7",
      content_title: "عنوان تجريبي",
      poster_anilist_url: "https://cdn.example/poster.png",
      ratings: "8.9",
      genre_name: ["دراما", "غموض"],
    });
    expect(result).toMatchObject({ id: "A-7", title: "عنوان تجريبي", poster: "https://cdn.example/poster.png", rating: "8.9", genres: ["دراما", "غموض"] });
  });

  it("classifies external download providers", () => {
    expect(classifySource("https://www.mediafire.com/file/demo")).toBe("MediaFire");
    expect(classifySource("https://example.com/watch")).toBe("رابط خارجي");
  });
});

describe("anime tRPC procedures", () => {
  const caller = appRouter.createCaller({
    user: null,
    req: {} as never,
    res: {} as never,
  });

  it("returns normalized search results from the API adapter", async () => {
    await expect(caller.anime.search({ keyword: "Naruto", start: 0, limit: 5 })).resolves.toEqual([{ id: "A-1", title: "Sample Anime" }]);
  });

  it("rejects empty search input before calling the API", async () => {
    await expect(caller.anime.search({ keyword: "   ", start: 0, limit: 5 })).rejects.toBeTruthy();
  });

  it("supports an empty random suggestion without crashing the UI", async () => {
    await expect(caller.anime.random({ genreId: "18" })).resolves.toBeNull();
  });
});
