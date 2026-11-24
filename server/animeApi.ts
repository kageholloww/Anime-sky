import axios from "axios";
import { FALLBACK_ANIMES } from "./animeCatalog";

type UnknownRecord = Record<string, unknown>;

export type AnimeCard = {
  id: string;
  title: string;
  englishTitle: string;
  poster: string | null;
  year: string;
  rating: string;
  episodes: string;
  airingDay: string;
  genres: string[];
};

export type AnimeDetails = AnimeCard & {
  description: string;
  duration: string;
  ageRating: string;
  language: string;
  totalSeasons: number;
};

export type Episode = {
  id: string;
  title: string;
  duration: string;
  number: number;
};

export type Season = {
  id: string;
  title: string;
  number: number;
  episodes: Episode[];
};

export type EpisodeSource = {
  id: string;
  title: string;
  quality: string;
  size: string;
  url: string;
  downloadable: boolean;
  watchable: boolean;
  embeddable: boolean;
  provider: string;
  logoText: string;
  kind: string;
  resolvedUrl?: string;
  direct?: boolean;
  embedUrl?: string;
  hint?: string;
};

const BASE_URL = process.env.ANIME_API_BASE_URL || "https://max-panel.monster/api";
const UNIQUE_KEY = process.env.ANIME_API_UNIQUE_KEY || "flix!123";

function requireConfig() {
  if (!BASE_URL || !UNIQUE_KEY) {
    throw new Error("ANIME_API_NOT_CONFIGURED");
  }
}

async function apiPost(endpoint: string, params: Record<string, string>) {
  requireConfig();
  const response = await axios.post(
    `${BASE_URL}/${endpoint}`,
    new URLSearchParams(params).toString(),
    {
      timeout: 15000,
      headers: {
        "User-Agent": "okhttp/4.9.2",
        "Accept-Encoding": "gzip",
        "Content-Type": "application/x-www-form-urlencoded",
        "unique-key": UNIQUE_KEY,
      },
    },
  );
  return response.data as UnknownRecord | UnknownRecord[];
}

function listFrom(data: unknown): UnknownRecord[] {
  if (Array.isArray(data)) return data.filter(Boolean) as UnknownRecord[];
  if (data && typeof data === "object" && Array.isArray((data as UnknownRecord).data)) {
    return ((data as UnknownRecord).data as unknown[]).filter(Boolean) as UnknownRecord[];
  }
  return [];
}

function text(value: unknown, fallback = "") {
  return value == null ? fallback : String(value);
}

const RANDOM_ANIME_POSTERS = [
  "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx16498-buvcRTBx4NSm.jpg", // Attack on Titan
  "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx113415-LHBAeoZDIsnF.jpg", // Jujutsu Kaisen
  "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx101922-WBsBl0ClmgYL.jpg", // Demon Slayer
  "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx11757-SxYDUzdr9rh2.jpg", // Solo Leveling / SAO
  "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx21-ELSYx3yMPcKM.jpg", // One Piece
  "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx21355-wRVUrGxpvIQQ.jpg", // Re:Zero
  "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx21202-mPOr80AEjUcZ.png", // KonoSuba
  "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx127230-DdP4vAdssLoz.png", // Chainsaw Man
  "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx1535-kUgkcrfOrkUM.jpg", // Death Note
  "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx11061-y5gsT1hoHuHw.png", // Hunter x Hunter
  "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx21087-B5DHjqZ3kW4b.jpg", // One Punch Man
  "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx5114-nSWCgQlmOMtj.jpg", // Fullmetal Alchemist
  "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx108465-1ANspF1EWyFx.jpg", // Mushoku Tensei
  "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/b19815-sEOQ9yQaPKlk.jpg", // No Game No Life
];

function getRandomFallbackPoster(key?: unknown): string {
  const str = String(key || Math.random());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % RANDOM_ANIME_POSTERS.length;
  return RANDOM_ANIME_POSTERS[index];
}

function poster(item: UnknownRecord): string | null {
  const toHttp = (v: unknown): string | null => {
    if (!v) return null;
    const str = String(v).trim();
    if (!str) return null;
    if (str.startsWith("http://") || str.startsWith("https://")) return str;
    if (str.startsWith("//")) return `https:${str}`;
    return null;
  };

  // 1. Anilist official poster
  const anilist = toHttp(item.poster_anilist_url);
  if (anilist) return anilist;

  // 2. TMDB official poster
  const tmdbPoster = toHttp(item.poster_tmdb_url);
  if (tmdbPoster) return tmdbPoster;

  // 3. TMDB backdrop
  const tmdbBackdrop = toHttp(item.backdrop_tmdb_url);
  if (tmdbBackdrop) return tmdbBackdrop;

  // 4. Vertical poster (either full URL or max-panel storage)
  if (item.verticle_poster) {
    const vert = String(item.verticle_poster).trim();
    if (vert.startsWith("http://") || vert.startsWith("https://")) return vert;
    if (vert) return `https://max-panel.monster/storage/${vert}`;
  }

  // 5. Horizontal poster (either full URL or max-panel storage)
  if (item.horizontal_poster) {
    const horiz = String(item.horizontal_poster).trim();
    if (horiz.startsWith("http://") || horiz.startsWith("https://")) return horiz;
    if (horiz) return `https://max-panel.monster/storage/${horiz}`;
  }

  // لا نعرض صورة لأنمي آخر إذا لم يعُد المصدر صورة لهذا العنصر.
  return null;
}

function genres(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map(item => {
        if (item && typeof item === "object") {
          // API sometimes returns genre objects like {id, name} or {genre_id, genre_name}
          const obj = item as Record<string, unknown>;
          return String(obj.name || obj.genre_name || obj.title || obj.label || "").trim();
        }
        return String(item ?? "").trim();
      })
      .filter(Boolean)
      .slice(0, 5);
  }
  if (value && typeof value === "object") {
    // Plain object with numeric keys or named keys
    const obj = value as Record<string, unknown>;
    const str = String(obj.name || obj.genre_name || obj.title || "").trim();
    if (str) return [str];
    // Try extracting values if it's a map-like object
    return Object.values(obj).map(v => String(v).trim()).filter(Boolean).slice(0, 5);
  }
  return text(value).split(/[،,|]/).map(s => s.trim()).filter(Boolean).slice(0, 5);
}

export function normalizeCard(item: UnknownRecord): AnimeCard {
  return {
    id: text(item.content_id || item.id),
    title: text(item.content_title || item.title, "بدون عنوان"),
    englishTitle: text(item.english_title),
    poster: poster(item),
    year: text(item.release_year),
    rating: text(item.ratings || item.rating),
    episodes: text(item.total_episodes),
    airingDay: text(item.airing_day),
    genres: genres(item.genre_name),
  };
}

function normalizeEpisode(item: UnknownRecord, index: number): Episode {
  return {
    id: text(item.episode_id || item.id),
    title: text(item.episode_title || item.title, `الحلقة ${index + 1}`),
    duration: text(item.episode_duration || item.duration),
    number: Number(item.episode_number || item.number || index + 1),
  };
}

function normalizeSeason(item: UnknownRecord, index: number): Season {
  const rawEpisodes = Array.isArray(item.episodes) ? item.episodes : [];
  return {
    id: text(item.season_id || item.id || index + 1),
    title: text(item.season_title || item.title, `الموسم ${index + 1}`),
    number: Number(item.season_number || item.number || index + 1),
    episodes: rawEpisodes.map((episode, episodeIndex) => normalizeEpisode(episode as UnknownRecord, episodeIndex)),
  };
}

export function normalizeSources(data: unknown): EpisodeSource[] {
  return listFrom(data).map((item, index) => {
    const url = text(item.source || item.source_url || item.url);
    const meta = sourceMeta(url, item.downloadable === true || item.downloadable === 1 || item.downloadable === "1");
    return {
      id: text(item.source_id || item.id || index + 1),
      title: text(item.source_title || item.title, `مصدر ${index + 1}`),
      quality: text(item.source_quality || item.quality),
      size: text(item.source_size || item.size),
      url,
      provider: meta.provider,
      logoText: meta.logoText,
      kind: meta.kind,
      watchable: meta.watchable,
      embeddable: meta.embeddable,
      downloadable: meta.downloadable,
    };
  }).filter(source => source.url);
}

const providerMap = [
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
  { match: ["sendvid"], name: "SendVid", logo: "SV" },
];

function providerFor(url: string) {
  const value = url.toLowerCase();
  return providerMap.find(provider => provider.match.some(part => value.includes(part))) ?? { name: "رابط خارجي", logo: "LINK" };
}

function sourceMeta(url: string, downloadable: boolean) {
  const value = url.toLowerCase();
  const provider = providerFor(url);
  const nativeVideo = /\.(mp4|webm|m3u8)(\?|$)/i.test(url);
  const pdIdMatch = /pixeldrain\.com\/u\/([a-zA-Z0-9]+)/i.test(url);
  const sfIdMatch = /(streamwish|streamfiles)\.com\/(?:e|v|d)\/([a-zA-Z0-9]+)/i.test(url);
  const stIdMatch = /streamtape\.com\/(?:e|v)\/([a-zA-Z0-9]+)/i.test(url);
  const mfPageMatch = /mediafire\.com\/file\/([a-zA-Z0-9]+)/i.test(url);
  const directDownload = /download\d+\.mediafire\.com/i.test(url);

  const isStreamProvider =
    provider.name === "MP4Upload" ||
    provider.name === "UQLoad" ||
    provider.name === "Voe" ||
    provider.name === "DoodStream" ||
    provider.name === "StreamTape" ||
    provider.name === "StreamFiles" ||
    provider.name === "FileMoon";

  const embeddable =
    nativeVideo ||
    isStreamProvider ||
    provider.name === "PixelDrain" ||
    provider.name === "DailyMotion" ||
    provider.name === "YouTube" ||
    provider.name === "OK.ru" ||
    provider.name === "SendVid";

  const watchable = embeddable;

  return {
    provider: provider.name,
    logoText: provider.logo,
    kind: provider.name,
    watchable,
    embeddable,
    downloadable: downloadable || provider.name === "MediaFire" || provider.name === "Mega" || provider.name === "Google Drive" || directDownload || mfPageMatch,
  };
}

export function classifySource(url: string) {
  return providerFor(url).name;
}

function isConfigured(): boolean {
  return true;
}

const MF_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

/**
 * Resolves a MediaFire page URL to the direct CDN download URL.
 * Returns `{ url, direct }`. When `direct` is true the URL points to
 * `download*.mediafire.com` and can be opened/streamed directly.
 */
export async function resolveMediafire(mfUrl: string): Promise<{ url: string; direct: boolean }> {
  if (!mfUrl) return { url: mfUrl, direct: false };
  if (/download\d+\.mediafire\.com/.test(mfUrl)) return { url: mfUrl, direct: true };
  try {
    const { data: html } = await axios.get(mfUrl, {
      headers: {
        "User-Agent": MF_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ar,en;q=0.9",
        "Referer": "https://www.mediafire.com/",
        "Upgrade-Insecure-Requests": "1",
      },
      timeout: 8000,
      maxRedirects: 5,
    });

    const patterns = [
      /href="(https:\/\/download\d+\.mediafire\.com\/[^"]+)"\s+id="downloadButton"/i,
      /id="downloadButton"[^>]*href="(https:\/\/download\d+\.mediafire\.com\/[^"]+)"/i,
      /"(https:\/\/download\d+\.mediafire\.com\/[^"?\s]+)"/i,
      /window\.location\.href\s*=\s*['"]?(https:\/\/download\d+\.mediafire\.com\/[^'">\s]+)/i,
      /aria-label="Download file"[^>]*href="([^"]+)"/i,
    ];
    for (const pat of patterns) {
      const m = String(html).match(pat);
      if (m?.[1]) return { url: m[1], direct: true };
    }

    const keyMatch = mfUrl.match(/\/file\/([a-z0-9]+)/i);
    if (keyMatch) {
      try {
        const apiRes = await axios.get(
          `https://www.mediafire.com/api/1.5/file/get_links.php?quick_key=${keyMatch[1]}&response_format=json`,
          { headers: { "User-Agent": MF_UA }, timeout: 5000 }
        );
        const dl = apiRes.data?.response?.links?.[0]?.normal_download;
        if (dl) return { url: dl, direct: true };
      } catch (_) {}
    }
  } catch (_) {}
  return { url: mfUrl, direct: false };
}

/**
 * Resolves a PixelDrain share link (`/u/<id>`) to a direct file URL.
 * PixelDrain refuses iframe embedding from external origins, so we have
 * to surface the raw `cdn.pixeldrain.com` URL for the <video> tag, or
 * wrap it with our own `/api/video/proxy` when CORS still blocks it.
 */
export async function resolvePixeldrain(url: string): Promise<{ url: string; embedUrl: string; direct: boolean }> {
  if (!url) return { url, embedUrl: url, direct: false };
  const m = url.match(/pixeldrain\.com\/u\/([a-zA-Z0-9]+)/i);
  if (!m) return { url, embedUrl: url, direct: false };
  const id = m[1];
  // The CDN serves the raw file. If the path is /api/file/<id>, browser can play directly.
  return {
    url: `https://cdn.pixeldrain.com/${id}.mp4`,
    embedUrl: `https://cdn.pixeldrain.com/${id}.mp4`,
    direct: true,
  };
}

/**
 * Resolves StreamFiles / StreamWish pages to their embed URL so we can
 * iframe them. Both domains rotate between `/e/`, `/v/`, `/d/`, etc.
 */
export function resolveStreamFiles(url: string): { url: string; embedUrl: string; direct: boolean } {
  if (!url) return { url, embedUrl: url, direct: false };
  const m = url.match(/(?:streamwish|streamfiles)\.com\/(?:e|v|d)\/([a-zA-Z0-9]+)/i);
  if (!m) return { url, embedUrl: url, direct: false };
  const id = m[1];
  return {
    url,
    embedUrl: `https://streamwish.com/e/${id}`,
    direct: false,
  };
}

/**
 * Resolves StreamTape URLs to embed-friendly form and tries to extract
 * the direct video URL (StreamTape embeds an `?v=` token that can be
 * swapped for a direct CDN link when scraped server-side).
 */
export async function resolveStreamTape(url: string): Promise<{ url: string; embedUrl: string; direct: boolean }> {
  if (!url) return { url, embedUrl: url, direct: false };
  // Normalize to /e/<id> embed form
  let normalized = url;
  const eMatch = url.match(/streamtape\.com\/(?:e|v)\/([a-zA-Z0-9]+)/i);
  if (!eMatch) return { url, embedUrl: url, direct: false };
  const id = eMatch[1];
  normalized = `https://streamtape.com/e/${id}`;
  return { url: normalized, embedUrl: normalized, direct: false };
}

/**
 * Generic resolver dispatcher used by the `/api/video/direct` endpoint.
 * Accepts any URL and returns the best playable form.
 */
export async function resolveAnySource(rawUrl: string): Promise<{ url: string; embedUrl?: string; direct: boolean; provider: string; kind: string }> {
  if (!rawUrl) return { url: rawUrl, direct: false, provider: "رابط خارجي", kind: "external" };

  const value = rawUrl.toLowerCase();

  // StreamTape / StreamFiles / StreamWish: never trust a .mp4 slug in the
  // URL — they always serve an HTML page, not a real file. Treat them as
  // embed-only regardless of the extension.
  if (value.includes("streamtape.com")) {
    const st = await resolveStreamTape(rawUrl);
    return { url: st.url, embedUrl: st.embedUrl, direct: false, provider: "StreamTape", kind: "embed" };
  }
  if (value.includes("streamwish.com") || value.includes("streamfiles.com")) {
    const sf = resolveStreamFiles(rawUrl);
    return { url: sf.url, embedUrl: sf.embedUrl, direct: false, provider: "StreamFiles", kind: "embed" };
  }

  // Already a native video file
  if (/\.(mp4|webm|m3u8|mkv)(\?|$)/i.test(rawUrl)) {
    return { url: rawUrl, direct: true, provider: "Direct", kind: "native" };
  }

  // MediaFire (page -> direct CDN)
  if (value.includes("mediafire.com")) {
    const mf = await resolveMediafire(rawUrl);
    return { url: mf.url, direct: mf.direct, provider: "MediaFire", kind: mf.direct ? "native" : "page" };
  }

  // PixelDrain
  if (value.includes("pixeldrain.com")) {
    const pd = await resolvePixeldrain(rawUrl);
    return { url: pd.url, embedUrl: pd.embedUrl, direct: pd.direct, provider: "PixelDrain", kind: "native" };
  }

  return { url: rawUrl, direct: false, provider: classifySource(rawUrl), kind: "external" };
}

export async function listLatest(start = 0, limit = 12, genreId = "18") {
  if (isConfigured()) {
    try {
      const data = await apiPost("Content/searchContent", {
        start: String(start),
        limit: String(limit),
        order_by: "created_at",
        order_direction: "DESC",
        genre_id: genreId,
      });
      const items = listFrom(data).map(normalizeCard).filter(item => item.id);
      if (items.length > 0) return items;
    } catch (error) {
      console.warn("[Anime API] listLatest error, using fallback catalog:", error);
    }
  }
  return FALLBACK_ANIMES.slice(start, start + limit).map(item => ({
    id: item.id,
    title: item.title,
    englishTitle: item.englishTitle,
    poster: item.poster,
    year: item.year,
    rating: item.rating,
    episodes: item.episodes,
    airingDay: item.airingDay,
    genres: item.genres,
  }));
}

export async function searchContentInternal(params: Record<string, string>): Promise<AnimeCard[]> {
  const data = await apiPost("Content/searchContent", {
    content_type: "0",
    language_id: "0",
    genre_id: "0",
    order_by: "created_at",
    order_direction: "DESC",
    ...params,
  });
  return listFrom(data).map(normalizeCard).filter(item => item.id);
}

export async function searchAnime(keyword: string, start = 0, limit = 24) {
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
        genre_id: "0",
      });
      const items = listFrom(data).map(normalizeCard).filter(item => item.id);
      if (items.length > 0) return items;
    } catch (error) {
      console.warn("[Anime API] searchAnime error, using fallback catalog:", error);
    }
  }
  const q = keyword.trim().toLowerCase();
  return FALLBACK_ANIMES.filter(item =>
    !q ||
    item.title.toLowerCase().includes(q) ||
    item.englishTitle.toLowerCase().includes(q) ||
    item.genres.some(g => g.toLowerCase().includes(q))
  ).slice(start, start + limit).map(item => ({
    id: item.id,
    title: item.title,
    englishTitle: item.englishTitle,
    poster: item.poster,
    year: item.year,
    rating: item.rating,
    episodes: item.episodes,
    airingDay: item.airingDay,
    genres: item.genres,
  }));
}

export async function getDetails(id: string): Promise<AnimeDetails> {
  if (isConfigured()) {
    try {
      const data = await apiPost("Content/getContentDetailsByID", {
        user_id: "B80E7D43",
        content_id: id,
        exclude_seasons: "1",
      });
      const item = listFrom(data)[0] || (data as UnknownRecord).data || data;
      const card = normalizeCard(item as UnknownRecord);
      if (card.id) {
        return {
          ...card,
          description: text((item as UnknownRecord).description || (item as UnknownRecord).synopsis),
          duration: text((item as UnknownRecord).duration),
          ageRating: text((item as UnknownRecord).age_rating),
          language: text((item as UnknownRecord).language_name),
          totalSeasons: Number((item as UnknownRecord).total_seasons || 0),
        };
      }
    } catch (error) {
      console.warn("[Anime API] getDetails error, using fallback catalog:", error);
    }
  }
  const found = FALLBACK_ANIMES.find(item => item.id === id) ?? FALLBACK_ANIMES[0];
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
    totalSeasons: found.totalSeasons,
  };
}

export async function getSeasons(id: string): Promise<Season[]> {
  if (isConfigured()) {
    try {
      const data = await apiPost("Content/getSeasonByContentID", {
        user_id: "B80E7D43",
        content_id: id,
        lazy: "1",
      });
      const seasons = listFrom(data).map(normalizeSeason);
      if (seasons.length > 0) return seasons;
    } catch (error) {
      console.warn("[Anime API] getSeasons error, using fallback catalog:", error);
    }
  }
  const found = FALLBACK_ANIMES.find(item => item.id === id) ?? FALLBACK_ANIMES[0];
  return found.seasonsList;
}

export async function getEpisodeSources(episodeId: string): Promise<EpisodeSource[]> {
  let sources: EpisodeSource[] = [];
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

  // Optimize embed URLs & resolve direct downloads in parallel
  const resolved = await Promise.allSettled(
    sources.map(async source => {
      let url = source.url;
      let embedUrl: string | undefined;
      let direct: boolean | undefined;
      let hint: string | undefined;

      // MP4Upload embed normalization
      if (url.includes("mp4upload.com") && !url.includes("/embed-")) {
        url = url.replace(/mp4upload\.com\/([a-zA-Z0-9]+)(?:\.html)?/, "mp4upload.com/embed-$1.html");
      }

      // MediaFire (page -> direct CDN). When resolved, the URL becomes a
      // direct file which can be downloaded with a single click. If the
      // direct file is a video container, the in-site player can also
      // stream it directly.
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
            hint: isVideo ? "تشغيل وتحميل مباشر" : "تحميل مباشر بنقرة واحدة",
          };
        }
      }

      // PixelDrain: convert /u/<id> share links to cdn.pixeldrain.com
      // direct file URLs so the browser can play them natively.
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
          hint: "تشغيل مباشر (تجاوز رفض الاتصال)",
        };
      }

      // StreamFiles / StreamWish: switch to embed form for the iframe.
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
            hint: "مشاهدة داخلية عبر الإطار المضمّن",
          };
        }
      }

      // StreamTape: embed-only by default but we normalize to /e/<id>.
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
            hint: "تشغيل داخلي (StreamTape)",
          };
        }
      }

      return {
        ...source,
        url,
        embedUrl: embedUrl ?? url,
        direct,
        hint,
      };
    })
  );

  return resolved.map((item, index) => (item.status === "fulfilled" ? item.value : sources[index]));
}

export interface GenreDefinition {
  id: string;
  name: string;
  aliases: string[];
  maxOffset: number;
  specificity: number;
}

export const KNOWN_GENRES: GenreDefinition[] = [
  { id: "56", name: "إيتشي", aliases: ["ايتشي", "إيتشي", "ايشي", "ecchi", "hentai"], maxOffset: 300, specificity: 10 },
  { id: "32", name: "إيسيكاي", aliases: ["ايسيكاي", "إيسيكاي", "isekai"], maxOffset: 250, specificity: 9 },
  { id: "41", name: "حريم", aliases: ["حريم", "harem"], maxOffset: 200, specificity: 8 },
  { id: "58", name: "آلات / ميكا", aliases: ["آلات", "ميكا", "mecha"], maxOffset: 150, specificity: 8 },
  { id: "50", name: "ألعاب مميتة", aliases: ["ألعاب مميتة", "العاب مميتة", "survival"], maxOffset: 100, specificity: 8 },
  { id: "53", name: "موسيقى", aliases: ["موسيقى", "music"], maxOffset: 150, specificity: 8 },
  { id: "54", name: "فنون قتال", aliases: ["فنون قتال", "martial arts"], maxOffset: 200, specificity: 8 },
  { id: "59", name: "مصاصي دماء", aliases: ["مصاصي دماء", "vampires"], maxOffset: 100, specificity: 8 },
  { id: "52", name: "جريمة", aliases: ["جريمة", "crime"], maxOffset: 150, specificity: 7 },
  { id: "28", name: "سحر", aliases: ["سحر", "magic"], maxOffset: 350, specificity: 7 },
  { id: "49", name: "شياطين", aliases: ["شياطين", "شيطان", "demons"], maxOffset: 250, specificity: 7 },
  { id: "51", name: "قوى خارقة", aliases: ["قوى خارقة", "superpower", "super power"], maxOffset: 400, specificity: 6 },
  { id: "45", name: "رعب", aliases: ["رعب", "horror"], maxOffset: 200, specificity: 7 },
  { id: "46", name: "نفسي", aliases: ["نفسي", "سيكولوجي", "psychological"], maxOffset: 250, specificity: 6 },
  { id: "35", name: "رياضة", aliases: ["رياضة", "رياضي", "sports"], maxOffset: 250, specificity: 6 },
  { id: "48", name: "تاريخي", aliases: ["تاريخي", "historical"], maxOffset: 250, specificity: 6 },
  { id: "37", name: "شوجو", aliases: ["شوجو", "shoujo", "shojo"], maxOffset: 200, specificity: 6 },
  { id: "57", name: "سينين", aliases: ["سينين", "seinen"], maxOffset: 300, specificity: 6 },
  { id: "24", name: "مدرسي", aliases: ["مدرسي", "school"], maxOffset: 450, specificity: 5 },
  { id: "25", name: "غموض", aliases: ["غموض", "mystery"], maxOffset: 450, specificity: 5 },
  { id: "47", name: "إثارة", aliases: ["إثارة", "اثارة", "تشويق", "thriller", "suspense"], maxOffset: 500, specificity: 5 },
  { id: "36", name: "خيال علمي", aliases: ["خيال علمي", "sci-fi", "scifi"], maxOffset: 400, specificity: 5 },
  { id: "44", name: "خارق للطبيعة", aliases: ["خارق للطبيعة", "خارق", "supernatural"], maxOffset: 600, specificity: 4 },
  { id: "55", name: "شريحة من الحياة", aliases: ["شريحة من الحياة", "slice of life"], maxOffset: 400, specificity: 4 },
  { id: "33", name: "رومانسي", aliases: ["رومانسي", "رومنسي", "رومانسية", "romance"], maxOffset: 600, specificity: 4 },
  { id: "26", name: "كوميديا", aliases: ["كوميدي", "كوميديا", "comedy"], maxOffset: 800, specificity: 3 },
  { id: "38", name: "شونين", aliases: ["شونين", "shounen", "shonen"], maxOffset: 600, specificity: 3 },
  { id: "34", name: "خيال", aliases: ["خيال", "فنتازيا", "fantasy"], maxOffset: 900, specificity: 2 },
  { id: "31", name: "مغامرات", aliases: ["مغامرات", "مغامرة", "adventure"], maxOffset: 800, specificity: 2 },
  { id: "29", name: "أكشن", aliases: ["أكشن", "اكشن", "action"], maxOffset: 1200, specificity: 1 },
  { id: "30", name: "دراما", aliases: ["دراما", "drama"], maxOffset: 800, specificity: 1 },
];

function normalizeGenreText(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\s\-_/]+/g, "");
}

function findKnownGenre(labelOrId: string): GenreDefinition | undefined {
  const norm = normalizeGenreText(labelOrId);
  return KNOWN_GENRES.find(
    g => g.id === labelOrId || normalizeGenreText(g.name) === norm || g.aliases.some(a => normalizeGenreText(a) === norm)
  );
}

function doesAnimeHaveGenre(animeGenres: string[], requestedGenre: string): boolean {
  const def = findKnownGenre(requestedGenre);
  const targets = def ? [def.name, ...def.aliases] : [requestedGenre];
  const normTargets = targets.map(normalizeGenreText);
  const normAnimeGenres = (animeGenres || []).map(normalizeGenreText);

  return normTargets.some(target =>
    normAnimeGenres.some(g => g.includes(target) || target.includes(g))
  );
}

const genreDetailsCache = new Map<string, AnimeDetails>();

async function inspectDetailsInBatches(cards: AnimeCard[], batchSize = 6): Promise<AnimeDetails[]> {
  const details: AnimeDetails[] = [];
  for (let index = 0; index < cards.length; index += batchSize) {
    const batch = cards.slice(index, index + batchSize);
    const results = await Promise.all(batch.map(card => getDetails(card.id).catch(() => null)));
    results.forEach(detail => {
      if (detail) {
        genreDetailsCache.set(detail.id, detail);
        details.push(detail);
      }
    });
  }
  return details;
}

export async function discoverGenres(): Promise<string[]> {
  return KNOWN_GENRES.map(g => g.name);
}

export async function getRandomByGenre(input: string | string[] = "all"): Promise<AnimeDetails | null> {
  const rawList = Array.isArray(input) ? input : [input];
  const selectedGenres = rawList
    .map(s => (s || "").trim())
    .filter(s => Boolean(s) && s !== "all" && s !== "كل التصنيفات");

  // Helper to test if an anime matches all selected genres
  const matchesAllSelected = (item: AnimeDetails): boolean => {
    if (!selectedGenres.length) return true;
    return selectedGenres.every(genre => doesAnimeHaveGenre(item.genres, genre));
  };

  const countMatches = (item: AnimeDetails): number => {
    return selectedGenres.reduce((acc, genre) => (doesAnimeHaveGenre(item.genres, genre) ? acc + 1 : acc), 0);
  };

  if (isConfigured()) {
    try {
      // CASE 1: No genre selected -> True random across all eras (1980 to 2026)
      if (selectedGenres.length === 0) {
        const orderDirection = Math.random() > 0.5 ? "ASC" : "DESC";
        const randomStart = Math.floor(Math.random() * 3200);

        try {
          const randomBatch = await searchContentInternal({
            start: String(randomStart),
            limit: "12",
            order_by: "created_at",
            order_direction: orderDirection,
            genre_id: "0",
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

      // CASE 2: One or more genres selected -> Multi-genre combination across all eras
      if (selectedGenres.length > 0) {
        // First check in-memory cache: if we have matching anime, 40% chance pick directly for speed
        const cachedCandidates = Array.from(genreDetailsCache.values()).filter(matchesAllSelected);
        if (cachedCandidates.length >= 3 && Math.random() < 0.4) {
          return cachedCandidates[Math.floor(Math.random() * cachedCandidates.length)];
        }

        // Identify definitions and sort by specificity (rarest genre first)
        const defs = selectedGenres
          .map(findKnownGenre)
          .filter((d): d is GenreDefinition => Boolean(d))
          .sort((a, b) => b.specificity - a.specificity);

        const primaryDef = defs[0] || {
          id: "0",
          name: selectedGenres[0],
          aliases: [],
          maxOffset: 400,
          specificity: 5,
        };

        // Multi-era sampling: randomly pick older or newer releases across the genre's history
        const orderDirection = Math.random() > 0.4 ? "ASC" : "DESC";
        const offsetLimit = Math.max(20, primaryDef.maxOffset);
        const randomStart = Math.floor(Math.random() * offsetLimit);

        const batchCards = await searchContentInternal({
          start: String(randomStart),
          limit: "20",
          order_by: "created_at",
          order_direction: orderDirection,
          genre_id: primaryDef.id,
        });

        if (batchCards.length > 0) {
          const inspected = await inspectDetailsInBatches(batchCards);
          const perfectMatches = inspected.filter(matchesAllSelected);
          if (perfectMatches.length > 0) {
            return perfectMatches[Math.floor(Math.random() * perfectMatches.length)];
          }

          // If no perfect match in this batch, check the entire cache
          const allCachedMatches = Array.from(genreDetailsCache.values()).filter(matchesAllSelected);
          if (allCachedMatches.length > 0) {
            return allCachedMatches[Math.floor(Math.random() * allCachedMatches.length)];
          }

          // Try a second sweep from opposite time direction
          const altDirection = orderDirection === "ASC" ? "DESC" : "ASC";
          const altCards = await searchContentInternal({
            start: String(Math.floor(Math.random() * (offsetLimit / 2))),
            limit: "15",
            order_by: "created_at",
            order_direction: altDirection,
            genre_id: primaryDef.id,
          });

          if (altCards.length > 0) {
            const altInspected = await inspectDetailsInBatches(altCards);
            const altMatches = altInspected.filter(matchesAllSelected);
            if (altMatches.length > 0) {
              return altMatches[Math.floor(Math.random() * altMatches.length)];
            }
          }

          // Partial match fallback: return candidate with the highest matching score
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

  // FALLBACK CATALOG (Guaranteed reliable offline / error resilience)
  const catalogDetails: AnimeDetails[] = FALLBACK_ANIMES.map(a => ({
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
    totalSeasons: a.totalSeasons,
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
