const path = require("path");
const fs = require("fs");
const express = require("express");
const axios = require("axios");
const qs = require("qs");
const https = require("https");

const CLUSTER_BASE = process.env.ANIME_CLUSTER_API_BASE || "https://p1.anifox.net/api";
const CLUSTER_HEADERS = {
  "User-Agent": "okhttp/4.9.2",
  "Accept-Encoding": "gzip",
  "Content-Type": "application/x-www-form-urlencoded",
  "unique-key": "flix!123",
  "x-app-signature": process.env.ANIME_CLUSTER_APP_SIGNATURE || "FA377DEA5DB7022B6D975C11521735A9AA8DF1E609C3A17A70FE51A5BB5DCF6F"
};
const CLUSTER_FALLBACK = [
  { id: "1", title: "هجوم العمالقة", englishTitle: "Attack on Titan", poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx16498-buvcRTBx4NSm.jpg", year: "2013", genres: ["أكشن","غموض","دراما","خيال","شونين"] },
  { id: "2", title: "جوجوتسو كايسن", englishTitle: "Jujutsu Kaisen", poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx113415-LHBAeoZDIsnF.jpg", year: "2020", genres: ["أكشن","خيال","خارق للطبيعة","شونين","شياطين"] },
  { id: "3", title: "قاتل الشياطين", englishTitle: "Demon Slayer", poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx101922-WBsBl0ClmgYL.jpg", year: "2019", genres: ["أكشن","مغامرات","خيال","شونين","شياطين"] },
  { id: "4", title: "سولو ليفلينج", englishTitle: "Solo Leveling", poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx11757-SxYDUzdr9rh2.jpg", year: "2024", genres: ["أكشن","مغامرات","خيال"] },
  { id: "5", title: "ون بيس", englishTitle: "One Piece", poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx21-ELSYx3yMPcKM.jpg", year: "1999", genres: ["أكشن","مغامرات","كوميديا","شونين"] },
  { id: "6", title: "كونوسوبا", englishTitle: "KonoSuba", poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx21202-mPOr80AEjUcZ.png", year: "2016", genres: ["كوميديا","إيسيكاي","مغامرات","خيال"] },
  { id: "7", title: "موشوكو تينسي", englishTitle: "Mushoku Tensei", poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx108465-1ANspF1EWyFx.jpg", year: "2021", genres: ["إيسيكاي","مغامرات","دراما","خيال"] },
  { id: "8", title: "لا لعبة لا حياة", englishTitle: "No Game No Life", poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/b19815-sEOQ9yQaPKlk.jpg", year: "2014", genres: ["إيسيكاي","كوميديا","مغامرات","خيال"] },
  { id: "9", title: "رجل المنشار", englishTitle: "Chainsaw Man", poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx127230-DdP4vAdssLoz.png", year: "2022", genres: ["أكشن","رعب","شونين","خارق للطبيعة"] },
  { id: "10", title: "ديث نوت", englishTitle: "Death Note", poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx1535-kUgkcrfOrkUM.jpg", year: "2006", genres: ["غموض","نفسي","خارق للطبيعة"] },
];
function clusterFallbackCard(item) {
  return { ...item, content_id: String(item.id || ""), content_title: item.title, genres: Array.isArray(item.genres) ? item.genres : [] };
}
function clusterFallbackSearch(query = "") {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return CLUSTER_FALLBACK.slice().map(clusterFallbackCard);
  const norm = value => String(value || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, "");
  const tokens = q.split(/\s+/).map(norm).filter(Boolean);
  return CLUSTER_FALLBACK.filter(item => { const hay = norm(`${item.title} ${item.englishTitle}`); return tokens.every(token => hay.includes(token)); }).map(clusterFallbackCard);
}
function clusterFallbackRandom(genres = []) {
  const labels = (Array.isArray(genres) ? genres : [genres]).map(String).filter(Boolean);
  const norm = value => String(value || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, "");
  const wanted = labels.map(norm).filter(Boolean);
  const pool = wanted.length ? CLUSTER_FALLBACK.filter(item => wanted.some(w => item.genres.some(g => norm(g).includes(w) || w.includes(norm(g))))) : CLUSTER_FALLBACK;
  const picked = (pool.length ? pool : CLUSTER_FALLBACK).slice().sort(() => Math.random() - .5)[0];
  return picked ? clusterFallbackCard(picked) : null;
}


// Local username/password authentication for standalone GoatBot hosting.
// Data is kept outside dist so rebuilding the frontend does not delete accounts.
const AUTH_DIR = path.join(__dirname, "data");
const AUTH_FILE = path.join(AUTH_DIR, "accounts.json");
const SESSION_COOKIE = "anime_session";
const SESSION_MAX_AGE = 1000 * 60 * 60 * 24 * 365;
const crypto = require("crypto");
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

function readAuthStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(AUTH_FILE, "utf8"));
    return { users: parsed.users || {}, sessions: parsed.sessions || {}, favorites: parsed.favorites || {}, history: parsed.history || {} };
  } catch (_) {
    return { users: {}, sessions: {}, favorites: {}, history: {} };
  }
}
function writeAuthStore(store) {
  const temp = `${AUTH_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2), { mode: 0o600 });
  fs.renameSync(temp, AUTH_FILE);
}
function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}
function validUsername(value) {
  return /^[a-zA-Z0-9_\u0600-\u06ff.-]{3,32}$/.test(String(value || "").trim());
}
function passwordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(String(password), salt, 64).toString("hex") };
}
function passwordMatches(password, user) {
  const actual = crypto.scryptSync(String(password), user.salt, 64);
  const expected = Buffer.from(user.hash, "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
}
function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").filter(Boolean).map(part => {
    const i = part.indexOf("=");
    return [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())];
  }));
}
function sessionUser(req) {
  const store = readAuthStore();
  const token = parseCookies(req)[SESSION_COOKIE];
  const session = token && store.sessions[token];
  if (!session || session.expiresAt < Date.now() || !store.users[session.username]) return null;
  const user = store.users[session.username];
  return { id: user.id, name: user.username, username: user.username, email: null };
}
function setSession(res, username) {
  const store = readAuthStore();
  const token = crypto.randomBytes(32).toString("hex");
  store.sessions[token] = { username, expiresAt: Date.now() + SESSION_MAX_AGE };
  writeAuthStore(store);
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${Math.floor(SESSION_MAX_AGE / 1000)}; Path=/; HttpOnly; SameSite=Lax`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`);
}
function accountProcedure(procedure, input, req) {
  const user = sessionUser(req);
  if (!user) return { error: "UNAUTHORIZED" };
  const store = readAuthStore();
  const uid = user.id;
  store.favorites[uid] ||= {};
  store.history[uid] ||= {};
  if (procedure === "account.favorites") return Object.values(store.favorites[uid]).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (procedure === "account.history") { const seen = new Set(); return Object.values(store.history[uid]).sort((a, b) => new Date(b.watchedAt) - new Date(a.watchedAt)).filter(item => { const key = String(item.contentId || item.episodeId || item.id); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 30); }
  if (procedure === "account.addFavorite") {
    const key = String(input.contentId || "");
    if (!key) return { error: "INVALID_INPUT" };
    const old = store.favorites[uid][key];
    store.favorites[uid][key] = { id: old?.id || crypto.randomUUID(), userId: uid, contentId: key, title: String(input.title || key), poster: input.poster || null, createdAt: old?.createdAt || new Date().toISOString() };
  } else if (procedure === "account.removeFavorite") {
    delete store.favorites[uid][String(input.contentId || "")];
  } else if (procedure === "account.saveHistory") {
    const animeTitle = String(input.animeTitle || "").trim();
    const key = animeTitle || String(input.contentId || input.episodeId || "");
    if (!key) return { error: "INVALID_INPUT" };
    const old = store.history[uid][key];
    store.history[uid][key] = { id: old?.id || crypto.randomUUID(), userId: uid, contentId: String(input.contentId || old?.contentId || ""), animeTitle, episodeId: String(input.episodeId || ""), episodeTitle: String(input.episodeTitle || ""), watchedAt: new Date().toISOString() };
  }
  writeAuthStore(store);
  return { success: true };
}

const DEFAULT_GENRES = [
  "إيتشي", "إيسيكاي", "كوميديا", "أكشن", "مغامرات", "رومانسي", "خيال", "دراما",
  "سحر", "غموض", "رعب", "خيال علمي", "خارق للطبيعة", "نفسي", "إثارة", "شونين",
  "شوجو", "سينين", "حريم", "رياضة", "مدرسي", "تاريخي", "شياطين", "قوى خارقة",
  "شريحة من الحياة", "آلات / ميكا", "فنون قتال", "جريمة", "موسيقى"
];

async function clusterApiPost(endpoint, params = {}) {
  const { data } = await axios.post(
    `${CLUSTER_BASE}/${endpoint}`,
    qs.stringify(params),
    { headers: CLUSTER_HEADERS, timeout: 15000 }
  );
  return data;
}

// Anime Witcher is deliberately isolated from Anime Cluster: its IDs, posters,
// episodes and servers are never mixed with Cluster records.
const WITCHER = {
  mainUrl: "https://animewitcher.com",
  projectId: "animewitcher-1c66d",
  // Two different Algolia app IDs are used by Anime Witcher. The public one
  // (QVHT7NPEJG) is what the official Android app talks to and gives us the
  // dedicated `recent` and `series_name_asc` indexes with full metadata. The
  // Firestore-backed one (D8LH9I7ZL7) is used by the web app and is what
  // we fall back to when the public app rate-limits us.
  algoliaAppId: process.env.ANIMEWITCHER_ALGOLIA_APP_ID || "QVHT7NPEJG",
  algoliaAppIdLegacy: process.env.ANIMEWITCHER_ALGOLIA_APP_ID_LEGACY || "D8LH9I7ZL7",
  algoliaApiKey: process.env.ANIMEWITCHER_ALGOLIA_API_KEY || "ce13098070fa521b536571bafbcfc083",
  algoliaApiKeyLegacy: process.env.ANIMEWITCHER_ALGOLIA_API_KEY_LEGACY || "b56c01ef52540ef334bcdbaa00ded9e4",
  firebaseApiKey: process.env.ANIMEWITCHER_FIREBASE_API_KEY || "AIzaSyAcbWRwfFNnCpoydDXlEALWnM_TYVcJOMU",
  // Index names exposed by the public Algolia app.
  indexRecent: "recent",
  indexSeries: "series_name_asc",
};
const WITCHER_PUBLIC_HEADERS = {
  "User-Agent": "Algolia for Android (3.27.0); Android (12)",
  "Connection": "Keep-Alive",
  "Accept-Encoding": "gzip",
  "X-Algolia-Application-Id": WITCHER.algoliaAppId,
  "X-Algolia-API-Key": WITCHER.algoliaApiKey,
  "Content-Type": "application/json",
};
function wfValue(field) { if (!field || typeof field !== "object") return null; return field.integerValue ?? field.doubleValue ?? field.stringValue ?? field.booleanValue ?? null; }
function wfString(field) { const v = wfValue(field); return v == null ? "" : String(v); }
function wfMap(field) { return field?.mapValue?.fields || {}; }
function wfDocUrl(pathname) { return `https://firestore.googleapis.com/v1/projects/${WITCHER.projectId}/databases/(default)/documents/${String(pathname).split("/").map(encodeURIComponent).join("/")}?key=${encodeURIComponent(WITCHER.firebaseApiKey)}`; }
async function witcherFetch(url, options = {}) { const response = await axios({ url, timeout: 20000, ...options, validateStatus: status => status >= 200 && status < 400 }); return response.data; }
async function witcherAlgolia(index, params) { return witcherFetch(`https://${WITCHER.algoliaAppId}-dsn.algolia.net/1/indexes/${encodeURIComponent(index)}/query`, { method: "POST", headers: { "X-Algolia-Application-Id": WITCHER.algoliaAppId, "X-Algolia-API-Key": WITCHER.algoliaApiKey, "Content-Type": "application/json" }, data: { params } }); }
function witcherEpisodes(doc) { const values = doc?.fields?.episodes?.arrayValue?.values || []; return values.map((item, index) => { const f = item?.mapValue?.fields || {}; const id = wfString(f.doc_id); if (!id) return null; const translated = wfMap(f.title_translated); return { id, title: wfString(translated.ar) || wfString(f.name) || `الحلقة ${id}`, number: Number(wfValue(f.number)) || index + 1, duration: "", imageUrl: wfString(f.thumb_uri) || null }; }).filter(Boolean).sort((a, b) => a.number - b.number); }
function witcherCard(hit) { const details = hit.details || {}; const rawRating = typeof hit.rating === "number" || typeof hit.rating === "string" ? hit.rating : (details.mal_mean ?? details.rating ?? ""); const numericRating = parseFloat(String(rawRating).replace(",", ".")); return { id: String(hit.objectID || hit.path || ""), title: String(hit.name || hit.english_title || "Anime Witcher"), englishTitle: String(hit.english_title || ""), poster: hit.poster_uri || hit.poster?.medium || null, year: String(details.year || ""), rating: Number.isFinite(numericRating) && numericRating > 0 ? numericRating.toFixed(1) : "", episodes: "", airingDay: String(details.state || ""), genres: Array.isArray(hit.tags) ? hit.tags.map(String) : [], description: String(hit.story || ""), source: "witcher" }; }
async function witcherRefreshKeys() { try { const settings = await witcherFetch(wfDocUrl("Settings/constants")); const root = settings?.fields || {}; const search = wfMap(root.search_settings); if (wfString(search.api_key)) WITCHER.algoliaApiKey = wfString(search.api_key); if (wfString(search.app_id_v3) || wfString(search.app_id)) WITCHER.algoliaAppId = wfString(search.app_id_v3) || wfString(search.app_id); } catch (_) {} }
// Robust numeric date sort — handles unix seconds, unix ms, and ISO strings.
function dateMs(value) {
  if (value == null) return 0;
  if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
  const str = String(value);
  const asNum = Number(str);
  if (!isNaN(asNum) && asNum > 0) return asNum < 1e12 ? asNum * 1000 : asNum;
  const t = Date.parse(str);
  return isNaN(t) ? 0 : t;
}
function pickDateMs(hit) {
  if (!hit) return 0;
  return Math.max(dateMs(hit.updated_at), dateMs(hit.airing_date), dateMs(hit.created_at));
}
function sortByDateDesc(a, b) { return pickDateMs(b) - pickDateMs(a); }

// Broader Arabic genre aliases so genre matching actually works for Anime
// Witcher which uses different tag spellings than the cluster API.
const WITCHER_GENRE_ALIASES = {
  "ايتشي": ["ايتشي", "ecchi"],
  "ايسيكاي": ["ايسيكاي", "isekai", "عالممختلف", "عالمالمختلف", "اعادهبعث", "اعادةبعث", "انتقالعالم"],
  "اكشن": ["اكشن", "action", "قتال"],
  "كوميديا": ["كوميديا", "كوميدي", "comedy", "فكاهي"],
  "خيال": ["خيال", "فانتازيا", "fantasy"],
  "رومانسي": ["رومانسي", "رومنسي", "romance", "حب"],
  "حريم": ["حريم", "harem"],
  "مغامرات": ["مغامرات", "adventure", "مغامرة"],
  "مدرسي": ["مدرسي", "مدرسة", "school", "اكاديمي"],
  "غموض": ["غموض", "mystery", "الغاز"],
  "رعب": ["رعب", "horror", "مرعب"],
  "خيالعلمي": ["خيالعلمي", "sci-fi", "scifi", "sciencefiction", "science fiction"],
  "نفسي": ["نفسي", "سيكولوجي", "psychological"],
  "اثارة": ["اثارة", "تشويق", "thriller"],
  "دراما": ["دراما", "drama"],
  "شونين": ["شونين", "shounen", "shonen"],
  "سينين": ["سينين", "seinen"],
  "شوجو": ["شوجو", "shoujo", "shojo"],
  "خارقللطبيعة": ["خارقللطبيعة", "supernatural"],
  "سحر": ["سحر", "magic"],
  "شياطين": ["شياطين", "شيطان", "demons", "demon"],
  "قوىخارقة": ["قوىخارقة", "superpower", "قوى"],
  "مصاصيدماء": ["مصاصيدماء", "vampires", "vampire"],
  "الات": ["الات", "ميكا", "mecha", "روبوتات", "الاتميكا"],
  "شريحةمنالحياة": ["شريحةمنالحياة", "sliceoflife"],
  "جريمة": ["جريمة", "crime"],
  "تاريخي": ["تاريخي", "historical"],
  "رياضة": ["رياضة", "رياضي", "sports"],
  "موسيقى": ["موسيقى", "music"],
  "العابمميتة": ["العابمميتة", "العاب", "survivalgame", "games"],
  "فنونقتال": ["فنونقتال", "martialarts"],
};
function witcherGenreAliases(label) {
  const norm = normalizeGenreText(label);
  if (!norm) return [];
  return WITCHER_GENRE_ALIASES[norm] || [norm];
}
function witcherMatchesGenres(anime, requestedLabels) {
  const tags = (anime.genres || []).map(normalizeGenreText);
  if (!tags.length) return false;
  return requestedLabels.every(label => {
    const aliases = witcherGenreAliases(label);
    const normalizedAliases = aliases.map(normalizeGenreText);
    return normalizedAliases.some(alias => tags.includes(alias));
  });
}
function witcherGenreMatchScore(anime, requestedLabels) {
  const tags = (anime.genres || []).map(normalizeGenreText);
  if (!tags.length || !requestedLabels.length) return 0;
  return requestedLabels.reduce((score, label) => {
    const aliases = witcherGenreAliases(label);
    return score + (aliases.some(alias => tags.some(tag => tag === alias || tag.includes(alias) || alias.includes(tag))) ? 1 : 0);
  }, 0);
}
function parseRating(rating) {
  if (rating == null) return 0;
  const num = parseFloat(String(rating).replace(",", "."));
  return isNaN(num) ? 0 : num;
}
function buildExcludeSet(excludeIds) {
  const set = new Set();
  if (Array.isArray(excludeIds)) excludeIds.forEach(id => id && set.add(String(id)));
  if (typeof excludeIds === "string") excludeIds.split(",").map(s => s.trim()).filter(Boolean).forEach(id => set.add(id));
  return set;
}

async function witcherSearch(keyword, page = 0, hitsPerPage = 24) {
  await witcherRefreshKeys();
  const params = new URLSearchParams({
    attributesToRetrieve: JSON.stringify(["objectID","name","poster_uri","type","details","tags","story","english_title","poster","rating","path","doc_ref","updated_at","airing_date","created_at","status","episodes_count","seasons_count"]),
    hitsPerPage: String(Math.min(50, Math.max(1, Number(hitsPerPage) || 24))), page: String(Math.max(0, Number(page) || 0)),
    query: String(keyword || "")
  });
  const json = await witcherAlgolia("series", params.toString());
  return (Array.isArray(json.hits) ? json.hits : []).filter(hit => hit && hit.name).sort(sortByDateDesc).map(hit => {
    const card = witcherCard(hit);
    card.episodes = String(hit.episodes_count || card.episodes || "");
    card.totalSeasons = String(hit.seasons_count || "");
    card.lastUpdated = pickDateMs(hit) || null;
    return card;
  });
}

// Backwards-compatible single-result variant for the React random button.
async function witcherRandom(selectedGenres = [], excludeIds = []) {
  const list = await witcherRecommend(selectedGenres, 1, excludeIds);
  return list && list.length ? list[0] : null;
}

// ─────────────────────────────────────────────────────────────────────
// Public Algolia resolvers. The two indexes `recent` and `series_name_asc`
// on app QVHT7NPEJG are what the official AnimeWitcher Android client uses
// and give us full metadata + actual recent episode timestamps. We use
// them in addition to the Firestore/legacy Algolia path so the home page
// is never empty.
// ─────────────────────────────────────────────────────────────────────

// POST a query to a public Algolia index.
async function witcherAlgoliaPost(indexName, paramsString) {
  const url = `https://${WITCHER.algoliaAppId}-dsn.algolia.net/1/indexes/${encodeURIComponent(indexName)}/query`;
  try {
    const { data } = await axios.post(url, { params: paramsString || "" }, { headers: WITCHER_PUBLIC_HEADERS, timeout: 15000 });
    return data || null;
  } catch (_) {
    return null;
  }
}

// GET the public browse endpoint for an Algolia index (no query needed).
async function witcherAlgoliaBrowse(indexName, paramsString) {
  const url = `https://${WITCHER.algoliaAppId}-dsn.algolia.net/1/indexes/${encodeURIComponent(indexName)}/browse${paramsString ? `?${paramsString}` : ""}`;
  try {
    const { data } = await axios.get(url, { headers: WITCHER_PUBLIC_HEADERS, timeout: 15000 });
    return data || null;
  } catch (_) {
    return null;
  }
}

// Fetch a single random page of recent episodes from the `recent` index.
// Returns an array of normalised episode cards sorted by Firestore timestamp
// descending.
async function witcherRecentFromPublicIndex(limit = 12, page = 0) {
  const params = new URLSearchParams({
    attributesToRetrieve: "name,date,doc_ref,episode_id,anime_id,episode_name,title,poster_uri,type,tags,thumb_uri,comments_closed",
    hitsPerPage: String(Math.min(60, Math.max(1, limit))),
    page: String(Math.max(0, page)),
    query: "",
  }).toString();
  const data = await witcherAlgoliaPost(WITCHER.indexRecent, params);
  if (!data || !Array.isArray(data.hits)) return [];
  // Normalise the Firestore-style timestamp field.
  return data.hits.map(h => ({
    animeId: h.anime_id || h.name,
    animeTitle: h.name || h.title,
    episodeId: h.episode_id || "",
    episodeTitle: h.episode_name || "",
    poster: h.poster_uri || null,
    thumb: h.thumb_uri || null,
    tags: Array.isArray(h.tags) ? h.tags : [],
    date: h.date && typeof h.date === "object" && h.date._seconds ? h.date._seconds * 1000 + Math.floor((h.date._nanoseconds || 0) / 1e6) : null,
  })).filter(it => it.animeId && it.episodeId);
}

// Fetch a single page of series from `series_name_asc` and return random
// items from it. `randomStart` lets us pick different pages on every call
// so the user always sees fresh picks (mirrors AnimeCluster behaviour).
async function witcherBrowseSeriesPage(page = 0, hitsPerPage = 100) {
  const params = new URLSearchParams({
    attributesToRetrieve: '["objectID","name","tags","poster_uri","order","path","type","poster","aniList_poster","details","dubbed"]',
    filters: "",
    page: String(Math.max(0, page)),
    hitsPerPage: String(Math.min(100, Math.max(1, hitsPerPage))),
  }).toString();
  const data = await witcherAlgoliaBrowse(WITCHER.indexSeries, params);
  if (!data || !Array.isArray(data.hits)) return null;
  return data;
}

// Fetch series filtered by tag(s) using OR (the closest behaviour to
// AnimeCluster's genre-aware random). We OR because Algolia's `tags:X AND
// tags:Y` requires both tags to be exactly the same array element which
// rarely matches reality — most anime keep tags as separate array entries.
async function witcherBrowseSeriesByTags(tags, page = 0, hitsPerPage = 100) {
  if (!Array.isArray(tags) || !tags.length) return witcherBrowseSeriesPage(page, hitsPerPage);
  const filterExpr = tags.map(t => `tags:"${String(t).replace(/"/g, '\\"')}"`).join(" OR ");
  const params = new URLSearchParams({
    attributesToRetrieve: '["objectID","name","tags","poster_uri","order","path","type","poster","aniList_poster","details","dubbed"]',
    filters: "(" + filterExpr + ")",
    page: String(Math.max(0, page)),
    hitsPerPage: String(Math.min(100, Math.max(1, hitsPerPage))),
  }).toString();
  const data = await witcherAlgoliaBrowse(WITCHER.indexSeries, params);
  if (!data || !Array.isArray(data.hits)) return null;
  return data;
}

// Convert a raw `series_name_asc` hit into the AnimeCard shape the React
// frontend already understands. Prefers the AniList poster when available
// (better quality), falls back to MyAnimeList, then to the poster_uri field.
function witcherCardFromPublicHit(hit) {
  const details = hit.details || {};
  const aniList = hit.aniList_poster || null;
  const mal = hit.poster || null;
  let poster = null;
  if (aniList) {
    poster = aniList.large || aniList.medium || null;
  }
  if (!poster && mal) {
    poster = mal.large || mal.medium || null;
  }
  if (!poster) {
    poster = hit.poster_uri || null;
  }
  const rating = details.mal_mean ? String(Number(details.mal_mean).toFixed(1)) : "";
  const year = details.year || "";
  return {
    id: String(hit.objectID || hit.path || ""),
    title: String(hit.name || details.english_title || "Anime Witcher"),
    englishTitle: String(details.english_title || ""),
    poster,
    year,
    rating,
    episodes: details.eps_num || "",
    airingDay: details.state || "",
    genres: Array.isArray(hit.tags) ? hit.tags.map(String) : [],
    description: "",
    path: hit.path || null,
    source: "witcher",
  };
}

// Truly-random recommendation — picks a random page from `series_name_asc`
// and returns random anime from it. Completely ignores selected genres and
// dates: every roll gives the user a uniform-random pick from the entire
// library (~6,900+ titles). This mirrors what the user expects from a
// "اقتراح عشوائي" button — no preference, no bias, pure randomness.
async function witcherRecommend(selectedGenres = [], limit = 5, excludeIds = []) {
  const labels = (Array.isArray(selectedGenres) ? selectedGenres : [selectedGenres]).map(s => String(s || '').trim()).filter(s => s && s !== 'all' && s !== 'كل التصنيفات' && s !== 'كلالتصنيفات');
  const excludeSet = buildExcludeSet(excludeIds), requested = labels.map(normalizeGenreText);
  let pool = [];
  if (requested.length) {
    // Query Algolia by the actual tag values first. Sampling the whole index
    // made rare genres (Ecchi/Demons) randomly disappear before filtering.
    const tagValues = [...new Set(requested.flatMap(label => witcherGenreAliases(label)).map(String).filter(Boolean))];
    for (let page = 0; page < 4; page++) {
      try { const data = await witcherBrowseSeriesByTags(tagValues, page, 100); if (data && Array.isArray(data.hits)) pool.push(...data.hits); } catch (_) {}
    }
  } else {
    for (let i = 0; i < 8; i++) { try { const data = await witcherBrowseSeriesPage(Math.floor(Math.random() * 69), 100); if (data && Array.isArray(data.hits)) pool.push(...data.hits); } catch (_) {} if (pool.length >= 500) break; }
  }
  if (!pool.length) { try { pool = await witcherSearch(''); } catch (_) { pool = []; } }
  if (requested.length) {
    // The Isekai tag is inconsistently indexed on Witcher's browse endpoint;
    // merge search hits as well so one browse record cannot monopolize output.
    const searchTerms = [...new Set(requested.flatMap(label => witcherGenreAliases(label)).filter(Boolean))];
    for (const term of searchTerms) { try { const rows = await witcherSearch(term, 0, 50); if (Array.isArray(rows)) pool.push(...rows); } catch (_) {} }
  }
  let cards = pool.map(raw => raw && raw.source === 'witcher' && raw.id ? raw : witcherCardFromPublicHit(raw)).filter(Boolean);
  let eligible = cards.filter(card => !excludeSet.has(String(card.id || '')));
  if (requested.length) eligible = eligible.filter(card => witcherMatchesGenres(card, requested));
  if (requested.length && !eligible.length) {
    // Some Witcher deployments expose tags to search but not to Algolia's
    // browse filter. Use the same tag aliases as search fallback, then apply
    // the strict local matcher so Fantasy cannot satisfy Science Fiction.
    const searchTerms = [...new Set(requested.flatMap(label => witcherGenreAliases(label)).filter(term => /[a-z]/i.test(term) || /[\u0600-\u06ff]/.test(term)))];
    for (const term of searchTerms) { try { const rows = await witcherSearch(term); if (Array.isArray(rows)) cards.push(...rows); } catch (_) {} }
    eligible = cards.filter(card => !excludeSet.has(String(card.id || '')) && witcherMatchesGenres(card, requested));
  }
  if (!eligible.length && requested.length) return null;
  for (let i = eligible.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [eligible[i], eligible[j]] = [eligible[j], eligible[i]]; }
  const picked = [], seen = new Set();
  for (const card of eligible) { const key = String(card.id || ''); if (!key || seen.has(key)) continue; seen.add(key); card.reason = requested.length ? 'تطابق التصنيف: ' + labels.join(' + ') : 'عشوائي بالكامل'; picked.push(card); if (picked.length >= limit) break; }
  return picked.length ? picked : null;
}

// Robust latest — uses the dedicated `recent` Algolia index (real
// episode timestamps from the official Android client) with multi-strategy
// fallback to the legacy search path and the local catalog.
async function witcherLatest(limit = 24) {
  let items = [];

  // 1) Best path: dedicated recent-episode index — gives actual newest
  //    episodes with proper Firestore timestamps and anime metadata.
  try {
    const recent = await witcherRecentFromPublicIndex(limit, 0);
    if (recent.length) {
      items = recent
        .sort((a, b) => Number(b.date || 0) - Number(a.date || 0))
        .slice(0, limit)
        .map(ep => ({
          id: ep.animeId,
          title: ep.animeTitle,
          poster: ep.thumb || ep.poster || null,
          year: "", rating: "", episodes: "", airingDay: "",
          genres: ep.tags,
          description: "",
          source: "witcher",
          episodeId: ep.episodeId,
          episodeTitle: ep.episodeTitle,
          lastUpdated: ep.date,
        }));
    }
  } catch (_) { items = []; }

  // 2) Fallback: legacy search path.
  if (!items.length) {
    try {
      await witcherRefreshKeys();
      const params = new URLSearchParams({
        attributesToRetrieve: JSON.stringify(["objectID","name","poster_uri","type","details","tags","story","english_title","poster","rating","path","doc_ref","updated_at","airing_date","created_at","status","episodes_count","seasons_count"]),
        hitsPerPage: String(Math.min(60, Math.max(1, limit))),
        page: "0",
        query: ""
      });
      const json = await witcherAlgolia("series", params.toString());
      items = (Array.isArray(json.hits) ? json.hits : []).filter(hit => hit && hit.name);
      items.sort(sortByDateDesc);
    } catch (_) { items = []; }
  }

  // 3) Last-ditch: derive a "latest" feed from the local fallback catalog.
  if (!items.length && Array.isArray(FALLBACK_ANIMES)) {
    items = FALLBACK_ANIMES.slice()
      .sort((a, b) => Number(b.year || 0) - Number(a.year || 0))
      .map(a => ({
        objectID: a.id, name: a.title, english_title: a.englishTitle,
        poster_uri: a.poster, details: { year: a.year },
        rating: a.rating, tags: a.genres || [], story: a.description,
        airing_date: a.year ? `${a.year}-12-31` : null,
        episodes_count: a.episodes, seasons_count: a.totalSeasons,
      }));
  }

  return items.slice(0, limit).map(hit => {
    // For items from the legacy / fallback path (no `id`/`title` yet),
    // route through witcherCard to normalise.
    if (!hit.id) {
      const card = witcherCard(hit);
      card.episodes = String(hit.episodes_count || card.episodes || "");
      card.totalSeasons = String(hit.seasons_count || "");
      card.lastUpdated = pickDateMs(hit) || null;
      return card;
    }
    // Items already normalised from the `recent` index.
    hit.episodes = hit.episodes || "";
    hit.totalSeasons = hit.totalSeasons || "";
    return hit;
  });
}

// Returns actual recent episodes across all anime (newest first).
async function witcherRecentEpisodes(limit = 12) {
  // Fast path: ask the `recent` index directly — it already gives us
  // every newest episode in one shot.
  try {
    const list = await witcherRecentFromPublicIndex(limit, 0);
    if (list.length) {
      return list
        .sort((a, b) => Number(b.date || 0) - Number(a.date || 0))
        .slice(0, limit)
        .map(ep => ({
          animeId: ep.animeId,
          animeTitle: ep.animeTitle,
          animeEnglishTitle: "",
          animePoster: ep.poster,
          animeYear: "",
          animeRating: "",
          episodeId: ep.episodeId,
          episodeNumber: Number(String(ep.episodeId).replace(/[^\d]/g, "")) || null,
          episodeTitle: ep.episodeTitle,
          episodeImage: ep.thumb,
          totalEpisodes: null,
          lastUpdated: ep.date,
        }));
    }
  } catch (_) {}

  // Fallback: walk the latest series and pull their last episode.
  const series = await witcherLatest(Math.max(20, limit * 2));
  const enriched = [];
  for (const s of series) {
    try {
      const detail = await witcherLoad(s.id);
      const eps = (detail.episodesList || []).slice();
      if (!eps.length) continue;
      const last = eps[eps.length - 1];
      enriched.push({
        animeId: s.id,
        animeTitle: s.title,
        animeEnglishTitle: s.englishTitle,
        animePoster: s.poster,
        animeYear: s.year,
        animeRating: s.rating,
        episodeId: last.id,
        episodeNumber: last.number,
        episodeTitle: last.title,
        episodeImage: last.imageUrl || null,
        totalEpisodes: eps.length,
        lastUpdated: s.lastUpdated || null,
      });
    } catch (_) {}
    if (enriched.length >= limit) break;
  }
  enriched.sort((a, b) => Number(b.episodeNumber || 0) - Number(a.episodeNumber || 0));
  return enriched.slice(0, limit);
}
async function witcherLoad(id) { const anime = (await witcherAlgolia("series", `filters=objectID:"${String(id).replaceAll('"', '\\"')}"`)).hits?.[0] || {}; const clean = String(anime.doc_ref || anime.path || id).replace(/^.*anime_list\//, "").replace(/^\/+/, ""); const doc = await witcherFetch(wfDocUrl(`anime_list/${clean}/episodes_summery/summery`)); const eps = witcherEpisodes(doc); const card = witcherCard({ ...anime, objectID: id }); return { ...card, episodes: String(eps.length), episodesList: eps, animePath: clean }; }
async function witcherResolveEpisode(title, number, id = "") {
  const wantedNumber = Number(number) || 1;
  const rawId = String(id || "").trim();
  // Watch links created while switching sources can carry the anime title
  // (or a duplicated query value) as contentId. It is not a Witcher objectID;
  // do not send it to Firestore as a document path. Search by title instead.
  const looksLikeTitle = /[\s?&=]/.test(rawId) || rawId === String(title || "").trim();
  let animeId = looksLikeTitle ? "" : rawId;
  let anime;
  if (animeId) { try { anime = await witcherLoad(animeId); } catch (_) {} }
  if (!anime || !anime.episodesList?.length) {
    const results = await witcherSearch(title || "");
    const normalized = String(title || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, "");
    const hit = results.find(x => String(x.title || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, "") === normalized) || results[0];
    if (!hit) return null;
    animeId = hit.id;
    anime = await witcherLoad(animeId);
  }
  const episode = anime.episodesList.find(x => Number(x.number) === wantedNumber) || anime.episodesList[0];
  return episode ? { animeId: anime.id, episodeId: episode.id, episode, anime } : null;
}
async function witcherSources(animePath, episodeId) {
  const basePath = `anime_list/${animePath}/episodes/${episodeId}`;
  let doc;
  try { doc = await witcherFetch(wfDocUrl(`${basePath}/servers2/all_servers`)); } catch (_) { doc = null; }
  let values = doc?.fields?.servers?.arrayValue?.values || [];
  if (!values.length) {
    try {
      doc = await witcherFetch(wfDocUrl(`${basePath}/servers`));
      values = (doc.documents || []).map(item => ({ mapValue: { fields: item.fields } }));
    } catch (_) {}
  }

  const prepared = [];
  for (let index = 0; index < values.length; index++) {
    const item = values[index];
    const f = item.mapValue?.fields || {};
    const name = wfString(f.name) || 'Witcher ' + (index + 1);
    const originalUrl = wfString(f.link);
    if (!originalUrl) continue;
    const source = {
      id: episodeId + '-' + index,
      title: name,
      quality: wfString(f.quality),
      size: '',
      url: originalUrl,
      provider: 'Witcher / ' + name,
      logoText: 'W',
      source: 'witcher',
      downloadable: false,
      watchable: true,
      embeddable: !/\.(mp4|webm|m3u8)(\?|$)/i.test(originalUrl),
      kind: 'stream',
      direct: /\.(mp4|webm|m3u8)(\?|$)/i.test(originalUrl),
    };
    // Resolve MediaFire (and the other supported providers) on the server,
    // using the same safe resolver as Cluster. Do not expose AnimeFox
    // authentication or spoofed forwarding headers to the browser.
    let resolved = await resolveSourceServer(source);
    // MediaFire may occasionally return a transient anti-bot page on the
    // first request. Retry the server-side resolution before exposing the
    // source; never give the player a raw MediaFire page when a direct URL
    // can be obtained.
    if (/mediafire\.com/i.test(originalUrl) && !resolved.direct) {
      await new Promise(r => setTimeout(r, 350));
      resolved = await resolveSourceServer({ ...source, url: originalUrl });
    }
    prepared.push(resolved);
  }

  return prepared.filter(Boolean).flatMap((source) => {
    const item = source;
    return [
      item,
      {
        ...item,
        id: item.id + '-download',
        title: item.title + ' · تحميل',
        downloadable: true,
        watchable: false,
        embeddable: false,
        kind: 'download',
      },
    ];
  }).filter(item => item.url);
}

// ─────────────────────────────────────────────────────────────────────
// Video source resolvers (server-side). Used to:
//   1. Surface MediaFire page links as one-click direct downloads.
//   2. Bypass PixelDrain's anti-embed by switching to cdn.pixeldrain.com.
//   3. Normalize StreamFiles / StreamTape links to their embed forms so
//      the in-site iframe player can render them.
// ─────────────────────────────────────────────────────────────────────
const MF_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

async function resolveMediafireServer(mfUrl) {
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
      if (m && m[1]) return { url: m[1], direct: true };
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

function resolveStreamFilesServer(url) {
  if (!url) return { url, embedUrl: url, direct: false };
  const m = url.match(/(?:streamwish|streamfiles)\.com\/(?:e|v|d)\/([a-zA-Z0-9]+)/i);
  if (!m) return { url, embedUrl: url, direct: false };
  return { url, embedUrl: `https://streamwish.com/e/${m[1]}`, direct: false };
}

function resolveStreamTapeServer(url) {
  if (!url) return { url, embedUrl: url, direct: false };
  const m = url.match(/streamtape\.com\/(?:e|v)\/([a-zA-Z0-9]+)/i);
  if (!m) return { url, embedUrl: url, direct: false };
  return { url: `https://streamtape.com/e/${m[1]}`, embedUrl: `https://streamtape.com/e/${m[1]}`, direct: false };
}

function resolvePixeldrainServer(url) {
  if (!url) return { url, embedUrl: url, direct: false };
  const m = url.match(/pixeldrain\.com\/u\/([a-zA-Z0-9]+)/i);
  if (!m) return { url, embedUrl: url, direct: false };
  return { url: `https://cdn.pixeldrain.com/${m[1]}.mp4`, embedUrl: `https://cdn.pixeldrain.com/${m[1]}.mp4`, direct: true };
}

async function resolveAnySourceServer(rawUrl) {
  if (!rawUrl) return { url: rawUrl, embedUrl: rawUrl, direct: false, provider: "رابط خارجي", kind: "external" };
  const value = String(rawUrl).toLowerCase();

  // MP4Upload direct video resolution
  if (value.includes("mp4upload.com")) {
    const direct = await resolveMp4UploadDirect(rawUrl);
    if (direct) {
      const proxy = `/api/video/proxy?url=${encodeURIComponent(direct)}`;
      return { url: proxy, embedUrl: proxy, direct: true, provider: "MP4Upload", kind: "native" };
    }
  }

  // Kawaii direct video resolution
  if (value.includes("kawaii-anime.com") || value.includes("/video/")) {
    const proxy = rawUrl.startsWith("/api/video/proxy") ? rawUrl : `/api/video/proxy?url=${encodeURIComponent(rawUrl)}`;
    return { url: proxy, embedUrl: proxy, direct: true, provider: "Kawaii Direct", kind: "native" };
  }

  // StreamTape / StreamFiles / StreamWish: never trust a .mp4 slug in the
  // URL — they always serve an HTML page, not a real file. Treat them as
  // embed-only regardless of the extension.
  if (value.includes("streamtape.com")) {
    const r = resolveStreamTapeServer(rawUrl);
    return { url: r.url, embedUrl: r.embedUrl, direct: false, provider: "StreamTape", kind: "embed" };
  }
  if (value.includes("streamwish.com") || value.includes("streamfiles.com")) {
    const r = resolveStreamFilesServer(rawUrl);
    return { url: r.url, embedUrl: r.embedUrl, direct: false, provider: "StreamFiles", kind: "embed" };
  }

  if (value.includes("ok.ru")) {
    const m = rawUrl.match(/ok\.ru\/(?:videoembed|video)\/([0-9]+)/i);
    const id = m ? m[1] : "";
    const embedUrl = id ? `https://ok.ru/videoembed/${id}` : rawUrl;
    return { url: embedUrl, embedUrl, direct: false, provider: "OK.ru", kind: "embed" };
  }

  if (value.includes("sendvid.com")) {
    const m = rawUrl.match(/sendvid\.com\/(?:embed\/)?([a-zA-Z0-9]+)/i);
    const id = m ? m[1] : "";
    const embedUrl = id ? `https://sendvid.com/embed/${id}` : rawUrl;
    return { url: embedUrl, embedUrl, direct: false, provider: "SendVid", kind: "embed" };
  }

  if (/\.(mp4|webm|m3u8|mkv)(\?|$)/i.test(rawUrl)) {
    return { url: rawUrl, embedUrl: rawUrl, direct: true, provider: "Direct", kind: "native" };
  }

  if (value.includes("mediafire.com")) {
    const r = await resolveMediafireServer(rawUrl);
    const proxy = r.direct ? `/api/video/proxy?url=${encodeURIComponent(r.url)}` : r.url;
    return { url: proxy, embedUrl: proxy, direct: !!r.direct, provider: "MediaFire", kind: r.direct ? "native" : "page" };
  }

  if (value.includes("pixeldrain.com")) {
    const r = resolvePixeldrainServer(rawUrl);
    const proxy = r.direct ? `/api/video/proxy?url=${encodeURIComponent(r.url)}` : r.url;
    return { url: proxy, embedUrl: proxy, direct: !!r.direct, provider: "PixelDrain", kind: "native" };
  }

  if (/drive\.google\.com/.test(value) || /mega\.(nz|io)/.test(value)) {
    let embedUrl = rawUrl;
    if (/mega\.(nz|io)/.test(value)) embedUrl = rawUrl.replace(/\/file\//i, "/embed/");
    else if (/drive\.google\.com/.test(value)) embedUrl = rawUrl.replace(/\/view.*$/i, "/preview");
    return { url: embedUrl, embedUrl, direct: false, provider: value.includes("mega") ? "Mega" : "Google Drive", kind: "embed" };
  }

  return { url: rawUrl, embedUrl: rawUrl, direct: false, provider: "رابط خارجي", kind: "external" };
}

async function resolveMp4UploadDirect(mp4Url) {
  if (!mp4Url) return null;
  const embedUrl = mp4Url.includes("/embed-") ? mp4Url : mp4Url.replace(/mp4upload\.com\/([a-zA-Z0-9]+)(?:\.html)?/i, "mp4upload.com/embed-$1.html");
  try {
    const { data: html } = await axios.get(embedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.mp4upload.com/",
      },
      timeout: 7000,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    });
    const match = String(html).match(/src:\s*["']([^"']+\.mp4[^"']*)["']/i);
    if (match && match[1]) {
      return match[1];
    }
  } catch (_) {}
  return null;
}

// Apply the resolver to a single source object without changing its id.
async function resolveSourceServer(source) {
  if (!source || !source.url) return source;
  const original = source.url;

  if (/mp4upload\.com/i.test(source.url)) {
    const direct = await resolveMp4UploadDirect(source.url);
    if (direct) {
      source.url = `/api/video/proxy?url=${encodeURIComponent(direct)}`;
      source.resolvedUrl = source.url;
      source.direct = true;
      source.watchable = true;
      source.embeddable = false;
      source.provider = "MP4Upload";
      source.logoText = "MP4";
      source.hint = "تشغيل مباشر فائق السرعة";
      return source;
    } else {
      source.embedUrl = source.url.includes("/embed-") ? source.url : source.url.replace(/mp4upload\.com\/([a-zA-Z0-9]+)(?:\.html)?/i, "mp4upload.com/embed-$1.html");
      source.url = source.embedUrl;
      source.direct = false;
      source.watchable = true;
      source.embeddable = true;
      source.provider = "MP4Upload";
      source.logoText = "MP4";
      return source;
    }
  }

  if (/mediafire\.com/i.test(source.url)) {
    const r = await resolveMediafireServer(source.url);
    if (r.direct) {
      const isVideo = /\.(mp4|webm|mkv|m3u8)(\?|$)/i.test(r.url);
      const finalUrl = isVideo ? `/api/video/proxy?url=${encodeURIComponent(r.url)}` : r.url;
      source.url = finalUrl;
      source.resolvedUrl = finalUrl;
      source.direct = true;
      source.watchable = isVideo || source.watchable !== false;
      source.embeddable = isVideo || source.embeddable !== false;
      source.hint = isVideo ? "تشغيل وتحميل مباشر" : "تحميل مباشر بنقرة واحدة";
      source.embedUrl = finalUrl;
      return source;
    }
  }

  if (/pixeldrain\.com\/u\//i.test(source.url)) {
    const r = resolvePixeldrainServer(source.url);
    const finalUrl = r.direct ? `/api/video/proxy?url=${encodeURIComponent(r.url)}` : r.url;
    source.url = finalUrl;
    source.embedUrl = finalUrl;
    source.resolvedUrl = finalUrl;
    source.direct = r.direct;
    source.watchable = true;
    source.embeddable = false;
    source.downloadable = true;
    source.hint = "تشغيل مباشر (تجاوز رفض الاتصال)";
    return source;
  }

  if (/voe\.sx/i.test(source.url)) {
    const embed = source.url.includes("/e/") ? source.url : source.url.replace(/voe\.sx\/([a-zA-Z0-9]+)/i, "voe.sx/e/$1");
    source.url = embed;
    source.embedUrl = embed;
    source.direct = false;
    source.watchable = true;
    source.embeddable = true;
    source.provider = "VOE";
    source.logoText = "VO";
    return source;
  }

  if (/dsvplay\.com|dood/i.test(source.url)) {
    const embed = source.url.replace(/\/d\//, "/e/");
    source.url = embed;
    source.embedUrl = embed;
    source.direct = false;
    source.watchable = true;
    source.embeddable = true;
    source.provider = "DoodStream";
    source.logoText = "DS";
    return source;
  }

  if (/streamfiles\.com|streamwish\.com/i.test(source.url)) {
    const r = resolveStreamFilesServer(source.url);
    if (r.embedUrl !== source.url) {
      source.embedUrl = r.embedUrl;
      source.resolvedUrl = r.embedUrl;
      source.url = r.url;
      source.direct = false;
      source.watchable = true;
      source.embeddable = true;
      source.hint = "مشاهدة داخلية عبر الإطار المضمّن";
      return source;
    }
  }

  // StreamTape URLs ALWAYS serve HTML pages — the .mp4 in the path is
  // cosmetic. Force embed mode.
  if (/streamtape\.com/i.test(source.url)) {
    const r = resolveStreamTapeServer(source.url);
    source.url = r.embedUrl;
    source.embedUrl = r.embedUrl;
    source.resolvedUrl = r.embedUrl;
    source.direct = false;
    source.watchable = true;
    source.embeddable = true;
    source.hint = "تشغيل داخلي (StreamTape)";
    return source;
  }

  if (/ok\.ru/i.test(source.url)) {
    const m = source.url.match(/ok\.ru\/(?:videoembed|video)\/([0-9]+)/i);
    const id = m ? m[1] : "";
    const embed = id ? `https://ok.ru/videoembed/${id}` : source.url;
    source.url = embed;
    source.embedUrl = embed;
    source.resolvedUrl = embed;
    source.direct = false;
    source.watchable = true;
    source.embeddable = true;
    source.provider = "OK.ru";
    source.logoText = "OK";
    source.hint = "تشغيل داخلي (OK.ru)";
    return source;
  }

  if (/sendvid\.com/i.test(source.url)) {
    const m = source.url.match(/sendvid\.com\/(?:embed\/)?([a-zA-Z0-9]+)/i);
    const id = m ? m[1] : "";
    const embed = id ? `https://sendvid.com/embed/${id}` : source.url;
    source.url = embed;
    source.embedUrl = embed;
    source.resolvedUrl = embed;
    source.direct = false;
    source.watchable = true;
    source.embeddable = true;
    source.provider = "SendVid";
    source.logoText = "SV";
    source.hint = "تشغيل داخلي (SendVid)";
    return source;
  }

  if (/mega\.(nz|io)/i.test(source.url)) {
    const embed = source.url.replace(/\/file\//i, "/embed/");
    source.url = embed;
    source.embedUrl = embed;
    source.resolvedUrl = embed;
    source.direct = false;
    source.watchable = true;
    source.embeddable = true;
    source.provider = "Mega";
    source.logoText = "MG";
    return source;
  }

  if (/drive\.google\.com/i.test(source.url)) {
    const embed = source.url.replace(/\/view.*$/i, "/preview");
    source.url = embed;
    source.embedUrl = embed;
    source.resolvedUrl = embed;
    source.direct = false;
    source.watchable = true;
    source.embeddable = true;
    source.provider = "Google Drive";
    source.logoText = "GD";
    return source;
  }

  source.embedUrl = source.embedUrl || source.url;
  return source;
}

async function resolveSourceList(sources) {
  if (!Array.isArray(sources)) return [];
  const out = await Promise.allSettled(sources.map(item => resolveSourceServer({ ...item })));
  const resolved = out.map((res, idx) => (res.status === "fulfilled" ? res.value : sources[idx]));
  return resolved.sort((a, b) => {
    const text = item => `${item?.provider || ""} ${item?.title || ""} ${item?.url || ""}`.toLowerCase();
    const st = item => /streamtape|\bst\b/.test(text(item)) && item?.watchable !== false && item?.kind !== "download";
    const quality = item => Number((text(item).match(/(2160|1440|1080|720|480|360)p?/) || [0, 0])[1]) || 0;
    return Number(st(b)) - Number(st(a)) || quality(b) - quality(a);
  });
}

function normalizeGenreText(value) {
  return String(value || "").toLowerCase().trim()
    .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
    .replace(/[\s\-_/]+/g, "");
}

async function getClusterRandom(selectedGenres = []) {
  const labels = Array.isArray(selectedGenres) ? selectedGenres : [selectedGenres];
  const wanted = labels.map(normalizeGenreText).filter(value => value && value !== "all" && value !== "كلالتصنيفات");
  const definitions = {
    "ايتشي": ["56", 300, 10], "ايسيكاي": ["32", 250, 9], "حريم": ["41", 200, 8], "الاتميكا": ["58", 150, 8],
    "العابمميتة": ["50", 100, 8], "موسيقى": ["53", 150, 8], "فنونقتال": ["54", 200, 8], "مصاصيدماء": ["59", 100, 8],
    "جريمة": ["52", 150, 7], "سحر": ["28", 350, 7], "شياطين": ["49", 250, 7], "قوىخارقة": ["51", 400, 6],
    "رعب": ["45", 200, 7], "نفسي": ["46", 250, 6], "رياضة": ["35", 250, 6], "تاريخي": ["48", 250, 6],
    "شوجو": ["37", 200, 6], "سينين": ["57", 300, 6], "مدرسي": ["24", 450, 5], "غموض": ["25", 450, 5],
    "اثارة": ["47", 500, 5], "خيالعلمي": ["36", 400, 5], "خارقللطبيعة": ["44", 600, 4], "شريحةمنالحياة": ["55", 400, 4],
    "رومانسي": ["33", 600, 4], "كوميديا": ["26", 800, 3], "شونين": ["38", 600, 3], "خيال": ["34", 900, 2],
    "مغامرات": ["31", 800, 2], "اكشن": ["29", 1200, 1], "دراما": ["30", 800, 1]
  };
  const defs = wanted.map(value => definitions[value]).filter(Boolean).sort((a, b) => b[2] - a[2]);
  const primary = defs[0] || ["0", 3200, 0];

  const fetchCandidates = async (direction, maxOffset, limit = 20) => {
    let lastError;
    for (let retry = 0; retry < 3; retry++) {
      try {
        const raw = await clusterApiPost("Content/searchContent", {
          start: String(Math.floor(Math.random() * Math.max(20, maxOffset))), limit: String(limit),
          order_by: "created_at", order_direction: direction, genre_id: primary[0]
        });
        const cards = apiList(raw).map(normalizeCard).filter(item => item.id);
        if (cards.length) return cards;
      } catch (error) { lastError = error; }
    }
    if (lastError) throw lastError;
    return [];
  };
  const inspect = async cards => (await Promise.allSettled(cards.map(async card => {
    const raw = await clusterApiPost("Content/getContentDetailsByID", { user_id: "B80E7D43", content_id: card.id, exclude_seasons: "1" });
    return raw?.data && !Array.isArray(raw.data) ? raw.data : raw;
  }))).filter(result => result.status === "fulfilled").map(result => result.value);
  const matches = details => {
    const values = Array.isArray(details?.genre_name) ? details.genre_name : String(details?.genre_name || "").split(/[,|،]/);
    const actual = values.map(normalizeGenreText);
    return wanted.every(w => actual.some(g => g === w || g.includes(w) || w.includes(g)));
  };

  try {
    if (!wanted.length) {
      const cards = await fetchCandidates(Math.random() > 0.5 ? "ASC" : "DESC", 3200, 12);
      if (!cards.length) return null;
      const card = cards[Math.floor(Math.random() * cards.length)];
      try {
        const details = await clusterApiPost("Content/getContentDetailsByID", { user_id: "B80E7D43", content_id: card.id, exclude_seasons: "1" });
        return normalizeCard(details?.data || details);
      } catch (_) {
        return card;
      }
    }
    let cards = [];
    let details = [];
    let perfect = [];
    for (let attempt = 0; attempt < 4 && !perfect.length; attempt++) {
      cards = await fetchCandidates(attempt % 2 ? "DESC" : "ASC", attempt ? Math.floor(primary[1] / 2) : primary[1], attempt ? 15 : 20);
      details = await inspect(cards);
      perfect = details.filter(matches);
    }
    if (perfect.length) return normalizeCard(perfect[Math.floor(Math.random() * perfect.length)]);
    // The search endpoint has already filtered a single genre. If details are
    // temporarily rate-limited, do not turn a valid filtered result into null.
    if (wanted.length === 1 && cards.length) return cards[Math.floor(Math.random() * cards.length)];
    // Never return a partial match: a title matching one selected genre is
    // misleading when the user selected a combination of genres.
    return null;
  } catch (_) { return null; }
}

function resolvePoster(item) {
  // سيرفر كلاستر يضع الرابط المباشر في poster_anilist_url أو verticle_poster.
  // لا نستخدم بوسترًا عشوائيًا حتى لا تظهر صورة لأنمي آخر.
  const candidates = [
    item.poster_anilist_url,
    item.verticle_poster,
    item.poster_tmdb_url,
    item.backdrop_tmdb_url,
    item.horizontal_poster,
    item.poster
  ];
  for (const c of candidates) {
    if (typeof c === "string") {
      const value = c.trim();
      if (/^https?:\/\//i.test(value)) return value;
      if (/^\/\//.test(value)) return `https:${value}`;
    }
  }
  if (item.verticle_poster && typeof item.verticle_poster === "string" && !item.verticle_poster.startsWith("http")) {
    return `https://max-panel.monster/storage/${item.verticle_poster}`;
  }
  if (item.horizontal_poster && typeof item.horizontal_poster === "string" && !item.horizontal_poster.startsWith("http")) {
    return `https://max-panel.monster/storage/${item.horizontal_poster}`;
  }
  return null;
}

function normalizeCard(item, idx = 0) {
  const cid = String(item.content_id || item.id || idx + 1);
  const title = String(item.content_title || item.title || "عنوان الأنمي");
  const poster = resolvePoster(item);

  let gList = [];
  if (Array.isArray(item.genre_name)) {
    gList = item.genre_name.map(String).filter(Boolean);
  } else if (typeof item.genre_name === "string" && item.genre_name.trim()) {
    gList = item.genre_name.split(/[,|،]/).map(s => s.trim()).filter(Boolean);
  }
  return {
    id: cid,
    content_id: cid,
    title: title,
    content_title: title,
    englishTitle: String(item.english_title || ""),
    poster: poster,
    poster_anilist_url: poster,
    verticle_poster: poster,
    year: String(item.release_year || ""),
    release_year: String(item.release_year || ""),
    rating: String(item.ratings || item.rating || ""),
    ratings: String(item.ratings || item.rating || ""),
    episodes: String(item.total_episodes || ""),
    total_episodes: String(item.total_episodes || ""),
    airingDay: String(item.airing_day || ""),
    airing_day: String(item.airing_day || ""),
    genres: gList,
    genre_name: gList,
    description: String(item.description || item.synopsis || ""),
    duration: String(item.duration || ""),
    ageRating: String(item.age_rating || ""),
    language: String(item.language_name || ""),
    totalSeasons: Number(item.total_seasons || 0)
  };
}

function apiList(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  const data = raw.data;
  if (Array.isArray(data)) return data;
  if (raw.genre && Array.isArray(raw.genre.content)) return raw.genre.content;
  if (data && typeof data === "object") {
    for (const key of ["items", "results", "content", "list"]) {
      if (Array.isArray(data[key])) return data[key];
    }
  }
  return [];
}

function parseTrpcInput(req) {
  try {
    const rawInput = req.query.input ?? req.body?.input ?? req.body ?? "{}";
    const parsed = typeof rawInput === "string" ? JSON.parse(rawInput) : rawInput;
    // tRPC يرسل الطلب المنفرد أحياناً بصيغة batch=1 مع المفتاح 0.
    return parsed.json || parsed["0"]?.json || parsed;
  } catch (_) {
    return {};
  }
}


// ─── Anime Kawaii: isolated third source ─────────────────────────
const KAWAII = {
  hosts: ["https://kawaiianime.cc/api", "https://www.kawaii-anime.com/api"],
  appApi: "https://app-api.kawaii-anime.com/api",
  appKey: process.env.KAWAII_APP_KEY || "b3acdcb2e7ef4f958ea238b31466b367",
  userAgent: "okhttp/4.12.0",
};
const KAWAII_LIST_QUERY = `query ($page:Int,$perPage:Int,$search:String,$genres:[String],$sort:[MediaSort]) { Page(page:$page,perPage:$perPage) { pageInfo { currentPage lastPage hasNextPage total } media(type:ANIME,search:$search,genre_in:$genres,sort:$sort,isAdult:false) { id idMal title { romaji english native } description coverImage { large extraLarge } genres tags { name } format status episodes duration season seasonYear averageScore popularity trending favourites startDate { year month day } endDate { year month day } studios(isMain:true) { edges { node { name } } } nextAiringEpisode { episode airingAt timeUntilAiring } } } }`;
const KAWAII_DETAIL_QUERY = `query ($id:Int) { Media(id:$id,type:ANIME) { id idMal title { romaji english native } description coverImage { large extraLarge } genres tags { name } format status episodes duration season seasonYear averageScore popularity trending favourites startDate { year month day } endDate { year month day } studios(isMain:true) { edges { node { name } } } nextAiringEpisode { episode airingAt timeUntilAiring } } }`;
async function kawaiiGraph(query, variables = {}, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    const base = KAWAII.hosts[i % KAWAII.hosts.length];
    try {
      const r = await axios.post(`${base}/anilist`, { query, variables }, { timeout: 18000, headers: { "User-Agent": KAWAII.userAgent, "Accept-Encoding": "gzip", "Content-Type": "application/json" } });
      if (r.data?.data) return r.data.data;
      last = new Error("KAWAII_INVALID_RESPONSE");
    } catch (e) { last = e; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw last || new Error("KAWAII_UNAVAILABLE");
}
const KAWAII_GENRE_AR = { Action:"أكشن", Adventure:"مغامرات", Comedy:"كوميديا", Drama:"دراما", Fantasy:"خيال", Isekai:"إيسيكاي", Romance:"رومانسي", Horror:"رعب", Mystery:"غموض", Psychological:"نفسي", "Sci-Fi":"خيال علمي", "Science Fiction":"خيال علمي", Sports:"رياضة", School:"مدرسي", Supernatural:"خارق للطبيعة", Ecchi:"إيتشي", Shounen:"شونين", Shoujo:"شوجو", Seinen:"سينين", Mecha:"ميكا", Music:"موسيقى", Magic:"سحر", SliceOfLife:"شريحة من الحياة", "Slice of Life":"شريحة من الحياة", Thriller:"إثارة", Historical:"تاريخي" };
const kawaiiTranslationCache = new Map();
async function kawaiiTranslate(value) {
  const raw = String(value || "").replace(/<[^>]+>/g, "").trim();
  if (!raw) return "";
  if (kawaiiTranslationCache.has(raw)) return kawaiiTranslationCache.get(raw);
  try {
    const r = await axios.get("https://translate.googleapis.com/translate_a/single", { params: { client: "gtx", sl: "auto", tl: "ar", dt: "t", q: raw.slice(0, 4500) }, timeout: 10000 });
    const translated = Array.isArray(r.data?.[0]) ? r.data[0].map(x => x?.[0] || "").join("").trim() : "";
    if (translated) { kawaiiTranslationCache.set(raw, translated); return translated; }
  } catch (_) {}
  return raw;
}
async function kawaiiDecorate(card) {
  if (!card) return card;
  const toArabic = function(value) { const raw = String(value || "").trim(); return KAWAII_GENRE_AR[raw] || KAWAII_GENRE_AR[raw.replace(/\s+/g, "")] || ""; };
  const genres = [...new Set([...(card.genres || []), ...(card.tags || [])].map(toArabic).filter(Boolean))];
  const description = card.description ? await kawaiiTranslate(card.description) : "";
  // Keep the source title exactly as supplied by Kawaii. Only the synopsis and
  // genre labels are translated; translating titles breaks cross-source lookup.
  return { ...card, originalTitle: card.title, title: card.title, content_title: card.title, name: card.title, genres, genre_name: genres, description };
}
function kawaiiTitle(item = {}) { const t = item.title || {}; return String(t.english || t.romaji || t.native || "بدون عنوان"); }
function kawaiiCard(item = {}) {
  const title = kawaiiTitle(item), poster = item.coverImage?.extraLarge || item.coverImage?.large || null;
  return { id: String(item.id || ""), content_id: String(item.id || ""), contentId: String(item.id || ""), title, content_title: title, name: title, englishTitle: String(item.title?.english || ""), poster, poster_anilist_url: poster, verticle_poster: poster, year: String(item.seasonYear || item.startDate?.year || ""), release_year: String(item.seasonYear || item.startDate?.year || ""), rating: item.averageScore ? String(Number(item.averageScore) / 10) : "", ratings: item.averageScore ? String(Number(item.averageScore) / 10) : "", episodes: String(item.episodes || item.nextAiringEpisode?.episode || ""), total_episodes: String(item.episodes || item.nextAiringEpisode?.episode || ""), airingDay: String(item.status || ""), genres: Array.isArray(item.genres) ? item.genres : [], genre_name: Array.isArray(item.genres) ? item.genres : [], tags: Array.isArray(item.tags) ? item.tags.map(tag => String(tag?.name || tag || "")) : [], description: String(item.description || "").replace(/<[^>]+>/g, "").trim(), duration: String(item.duration || ""), source: "kawaii" };
}
const KAWAII_GENRE_MAP = { "أكشن":"Action", "اكشن":"Action", "مغامرات":"Adventure", "كوميديا":"Comedy", "دراما":"Drama", "خيال":"Fantasy", "رومانسي":"Romance", "رعب":"Horror", "غموض":"Mystery", "نفسي":"Psychological", "خيال علمي":"Sci-Fi", "رياضة":"Sports", "مدرسي":"School", "خارق للطبيعة":"Supernatural", "إيسيكاي":"Isekai", "ايسيكاي":"Isekai", "إيتشي":"Ecchi", "ايتشي":"Ecchi", "شونين":"Shounen", "شوجو":"Shoujo", "سينين":"Seinen" };
async function kawaiiSearch(q = "", limit = 24, genres = [], page = 1) {
  const selectedGenres = (Array.isArray(genres) ? genres : String(genres || "").split(",")).map(String).map(x => x.trim()).filter(Boolean).map(x => KAWAII_GENRE_MAP[x] || x);
  const tagOnly = selectedGenres.some(x => x === "Isekai");
  const queryGenres = tagOnly ? selectedGenres.filter(x => x !== "Isekai") : selectedGenres;
  const d = await kawaiiGraph(KAWAII_LIST_QUERY, { page: Math.max(1, Number(page) || 1), perPage: Math.min(50, Math.max(1, Number(limit) || 24)), search: String(q || "").trim() || undefined, genres: queryGenres.length ? queryGenres : undefined, sort: q ? ["SEARCH_MATCH"] : ["TRENDING_DESC"] });
  let media = (d?.Page?.media || []).map(kawaiiCard).filter(x => x.id);
  if (tagOnly) media = media.filter(x => (x.tags || []).some(tag => normalizeGenreText(tag) === "isekai"));
  return Promise.all(media.map(kawaiiDecorate));
}
async function kawaiiRecommend(selectedGenres = [], limit = 5, excludeIds = []) {
  const labels = (Array.isArray(selectedGenres) ? selectedGenres : [selectedGenres]).map(String).map(x => x.trim()).filter(Boolean);
  const exclude = buildExcludeSet(excludeIds), pool = [];
  const pages = labels.length ? [1, 2, 3, 4] : [1, 2, 3, 4, 5];
  const needsTagFilter = labels.some(label => /^(إ|ا)?يسيكاي$/i.test(label.replace(/\s+/g, '')));
  for (const page of pages) { try { const rows = await kawaiiSearch('', 50, needsTagFilter ? [] : labels, page); if (Array.isArray(rows)) pool.push(...rows); } catch (_) {} }
  const wanted = labels.map(label => normalizeGenreText(label));
  const filtered = needsTagFilter ? pool.filter(item => {
    const values = [...(item.genres || []), ...(item.tags || [])].map(value => normalizeGenreText(value));
    return wanted.every(label => values.some(value => value === label || (label === 'ايسيكاي' && /isekai|عالممختلف/.test(value))));
  }) : pool;
  const unique = [], seen = new Set();
  for (const item of filtered.sort(() => Math.random() - 0.5)) { const id = String(item.id || ''); if (!id || seen.has(id) || exclude.has(id)) continue; seen.add(id); unique.push(item); if (unique.length >= limit) break; }
  return unique.length ? unique : null;
}

async function kawaiiDetails(id) {
  const d = await kawaiiGraph(KAWAII_DETAIL_QUERY, { id: Number(id) }, 4);
  return kawaiiDecorate(kawaiiCard(d?.Media || {}));
}
async function kawaiiSeasons(id) {
  const card = await kawaiiDetails(id);
  const total = Math.max(1, Number(card.episodes) || 1);
  return [{ id: `kawaii-${card.id}`, title: "الموسم 1", number: 1, episodes: Array.from({ length: total }, (_, i) => ({ id: `${card.id}-ep${i + 1}`, title: `الحلقة ${i + 1}`, duration: "", number: i + 1 })) }];
}
async function kawaiiSources(episodeId) {
  const m = String(episodeId || "").match(/^(\d+)-ep(\d+)$/);
  if (!m) return [];
  const animeId = Number(m[1]), ep = Number(m[2]);
  const r = await axios.get(`${KAWAII.hosts[0]}/watch`, { params: { anilistId: animeId, ep, category: "sub" }, headers: { "User-Agent": KAWAII.userAgent, "Accept-Encoding": "gzip", "x-app-key": KAWAII.appKey }, timeout: 18000 });
  const data = r.data || {}, sources = Array.isArray(data.sources) ? data.sources : [], subtitles = Array.isArray(data.subtitles) ? data.subtitles : [];
  const subtitleTracks = subtitles.map((sub, n) => ({ id: `kawaii-sub-${animeId}-${ep}-${n + 1}`, url: String(sub.url || sub.file || sub.src || ""), lang: String(sub.lang || sub.language || sub.label || "") })).filter(sub => /^https?:\/\//i.test(sub.url)).sort((a, b) => {
    const ar = value => /(^|[^a-z])(ar|ara|arabic|العربية|عربي)([^a-z]|$)/i.test(value);
    return Number(ar(b.lang)) - Number(ar(a.lang));
  });
  return sources.map((source, i) => {
    const rawUrl = String(source.url || "");
    const proxyUrl = `/api/video/proxy?url=${encodeURIComponent(rawUrl)}`;
    return {
      id: `kawaii-${animeId}-${ep}-${i + 1}`,
      title: "Kawaii",
      quality: String(source.quality || "1080p"),
      size: "",
      url: proxyUrl,
      rawUrl,
      resolvedUrl: proxyUrl,
      direct: true,
      downloadable: true,
      watchable: true,
      embeddable: true,
      provider: "Kawaii Direct",
      logoText: "KW",
      kind: "stream",
      subtitles: subtitleTracks,
      hint: subtitleTracks.length ? "الترجمة العربية افتراضية ويمكن تبديلها من زر الترجمة" : "تشغيل مباشر فائق السرعة داخل التطبيق"
    };
  }).filter(x => x.url);
}

// ─── Animefy: isolated fourth source ──────────────────────────────
const ANIMEIFY = {
  base: "https://animeify.net/animeify/apis_v4",
  token: "8cnY80AZSbUCmR26Vku1VUUY4",
  thumbBase: "https://animeify.net/animeify/files/thumbnails/",
  userAgent: "Dalvik/2.1.0 (Linux; U; Android 12; SM-A235F Build/acdb9eb.2)",
};

async function animeifyPost(endpoint, params = {}) {
  const body = new URLSearchParams({ ...params, Token: ANIMEIFY.token }).toString();
  const { data } = await axios.post(
    `${ANIMEIFY.base}/${endpoint}`,
    body,
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": ANIMEIFY.userAgent,
      },
      timeout: 15000,
    }
  );
  return data;
}

function animeifyCard(a = {}) {
  const animeId = String(a.AnimeId || a.anime_id || a.Id || "");
  const title = a.AR_Title?.trim() || a.Synonyms?.trim() || a.EN_Title?.trim() || "أنمي";
  const enTitle = a.EN_Title?.trim() || "";
  const thumb = a.Thumbnail || a.Photo || "";
  const poster = thumb ? (thumb.startsWith("http") ? thumb : `${ANIMEIFY.thumbBase}${thumb}`) : null;
  const rating = (a.Score && a.Score !== "0") ? String(a.Score) : "";
  const epCount = a.Episodes ? String(a.Episodes) : "";
  const rawGenres = typeof a.Genres === "string" ? a.Genres.split(",").map(s => s.trim()).filter(Boolean) : (Array.isArray(a.Genres) ? a.Genres : []);
  const year = (a.Premiered || "").match(/\d{4}/)?.[0] || "";
  const desc = String(a.Plot || a.Story || "").replace(/<[^>]+>/g, "").trim();

  return {
    id: animeId,
    content_id: animeId,
    contentId: animeId,
    title,
    content_title: title,
    name: title,
    englishTitle: enTitle,
    poster,
    poster_anilist_url: poster,
    verticle_poster: poster,
    year,
    release_year: year,
    rating,
    ratings: rating,
    episodes: epCount,
    total_episodes: epCount,
    airingDay: a.Status === "AIRING" ? "يعرض الآن" : (a.Status === "AIRED" ? "مكتمل" : (a.Status || "")),
    genres: rawGenres,
    genre_name: rawGenres,
    description: desc,
    source: "animeify",
  };
}

async function animeifyLatest(limit = 24) {
  try {
    const raw = await animeifyPost("episodes/load_latest_episodes.php", { UserId: "0", Language: "AR", From: "0" });
    const allItems = Array.isArray(raw) ? raw : [];
    const seen = new Set(), unique = [];
    for (const item of allItems) {
      const a = item.Anime || {};
      const id = a.AnimeId || a.anime_id || a.Id;
      if (id && !seen.has(id)) {
        seen.add(id);
        const card = animeifyCard(a);
        if (item.Episode?.Episode) {
          card.episodes = String(item.Episode.Episode);
          card.latestEpisode = String(item.Episode.Episode);
        }
        unique.push(card);
        if (unique.length >= limit) break;
      }
    }
    return unique;
  } catch (err) {
    console.error("[Animefy Latest Error]", err.message);
    return [];
  }
}

async function animeifySearch(query, limit = 24) {
  try {
    if (!query) return animeifyLatest(limit);
    const raw = await animeifyPost("anime/load_anime_list_v2.php", {
      UserId: "0",
      Language: "AR",
      FilterType: "SEARCH",
      FilterData: String(query).trim(),
      Type: "SERIES",
      From: "0",
    });
    const results = Array.isArray(raw) ? raw : [];
    return results.slice(0, limit).map(animeifyCard);
  } catch (err) {
    console.error("[Animefy Search Error]", err.message);
    return [];
  }
}

async function animeifyDetails(animeId) {
  try {
    const raw = await animeifyPost("anime/load_anime_details.php", {
      UserId: "0",
      Language: "AR",
      AnimeId: String(animeId),
      AnimeRelationId: "",
    });
    const a = raw && typeof raw === "object" ? raw : {};
    const card = animeifyCard({ AnimeId: animeId, ...a });
    if (a.Plot) card.description = String(a.Plot).replace(/<[^>]+>/g, "").trim();
    return card;
  } catch (err) {
    console.error("[Animefy Details Error]", err.message);
    return { id: animeId, title: "Animefy", source: "animeify" };
  }
}

async function animeifySeasons(animeId) {
  try {
    const raw = await animeifyPost("episodes/load_episodes.php", { AnimeID: String(animeId) });
    const list = Array.isArray(raw) ? raw : [];
    list.sort((a, b) => (Number(a.Episode) || 0) - (Number(b.Episode) || 0));
    const episodes = list.map((ep, idx) => ({
      id: `${animeId}-ep${ep.Episode || idx + 1}`,
      title: `الحلقة ${ep.Episode || idx + 1}`,
      duration: "",
      number: Number(ep.Episode) || idx + 1,
    }));
    return [{
      id: `animeify-${animeId}`,
      title: "الموسم 1",
      number: 1,
      episodes: episodes.length ? episodes : [{ id: `${animeId}-ep1`, title: "الحلقة 1", number: 1, duration: "" }],
    }];
  } catch (err) {
    console.error("[Animefy Seasons Error]", err.message);
    return [{ id: `animeify-${animeId}`, title: "الموسم 1", number: 1, episodes: [] }];
  }
}

async function animeifySources(episodeId) {
  const m = String(episodeId || "").match(/^(.*?)-ep(\d+)$/);
  if (!m) return [];
  const animeId = m[1];
  const epNumber = m[2];

  try {
    const data = await animeifyPost("anime/load_servers.php", {
      UserId: "0",
      AnimeId: animeId,
      Episode: String(epNumber),
      AnimeType: "SERIES",
    });
    const ep = data?.CurrentEpisode || {};
    const list = [];
    if (ep.FRFhdQ?.trim()) list.push({ title: "سيرفر FHD MediaFire", url: `https://www.mediafire.com/file/${ep.FRFhdQ.trim()}`, provider: "MediaFire", quality: "1080p", logoText: "MF" });
    if (ep.FRLink?.trim()) list.push({ title: "سيرفر HD MediaFire", url: `https://www.mediafire.com/file/${ep.FRLink.trim()}`, provider: "MediaFire", quality: "720p", logoText: "MF" });
    if (ep.FRLowQ?.trim()) list.push({ title: "سيرفر SD MediaFire", url: `https://www.mediafire.com/file/${ep.FRLowQ.trim()}`, provider: "MediaFire", quality: "480p", logoText: "MF" });
    if (ep.OKLink?.trim()) list.push({ title: "سيرفر OK.ru", url: `https://ok.ru/videoembed/${ep.OKLink.trim()}`, provider: "OK.ru", quality: "HD", logoText: "OK" });
    if (ep.SVLink?.trim() && ep.SVLink !== "1") list.push({ title: "سيرفر SendVid", url: `https://sendvid.com/embed/${ep.SVLink.trim()}`, provider: "SendVid", quality: "HD", logoText: "SV" });
    if (ep.SVLowQ?.trim()) list.push({ title: "سيرفر SendVid SD", url: `https://sendvid.com/embed/${ep.SVLowQ.trim()}`, provider: "SendVid", quality: "SD", logoText: "SV" });
    if (ep.MALink?.trim()) list.push({ title: "سيرفر Mega", url: `https://mega.nz/embed/${ep.MALink.trim()}`, provider: "Mega", quality: "HD", logoText: "MG" });
    if (ep.GDLink?.trim()) list.push({ title: "سيرفر Google Drive", url: `https://drive.google.com/file/d/${ep.GDLink.trim()}/preview`, provider: "Google Drive", quality: "HD", logoText: "GD" });
    if (ep.GDFhdQ?.trim()) list.push({ title: "سيرفر Google Drive FHD", url: `https://drive.google.com/file/d/${ep.GDFhdQ.trim()}/preview`, provider: "Google Drive", quality: "1080p", logoText: "GD" });
    if (ep.SFLink?.trim()) list.push({ title: "سيرفر SolidFiles", url: `http://www.solidfiles.com/v/${ep.SFLink.trim()}`, provider: "SolidFiles", quality: "SD", logoText: "SF" });
    if (ep.LBLink?.trim() && /^https?:\/\//i.test(ep.LBLink.trim())) list.push({ title: "سيرفر مباشر LB", url: ep.LBLink.trim(), provider: "Direct", quality: "HD", logoText: "LB" });
    if (ep.FHLink?.trim() && /^https?:\/\//i.test(ep.FHLink.trim())) list.push({ title: "سيرفر مباشر FH", url: ep.FHLink.trim(), provider: "Direct", quality: "HD", logoText: "FH" });
    if (ep.FDLink?.trim()) list.push({ title: "تحميل MediaFire FD", url: `https://www.mediafire.com/file/${ep.FDLink.trim()}`, provider: "MediaFire", quality: "HD", logoText: "MF" });

    const formatted = list.map((item, idx) => {
      const isMf = item.provider === "MediaFire";
      const isOk = item.provider === "OK.ru";
      const isSv = item.provider === "SendVid";
      return {
        id: `animeify-${animeId}-${epNumber}-${idx + 1}`,
        title: item.title,
        quality: item.quality || "1080p",
        size: "",
        url: item.url,
        downloadable: isMf,
        watchable: isMf || isOk || isSv || item.provider === "Direct",
        embeddable: isMf || isOk || isSv || item.provider === "Mega" || item.provider === "Google Drive" || item.provider === "Direct",
        provider: item.provider,
        logoText: item.logoText || "AF",
        kind: isMf ? "native" : (isOk || isSv ? "embed" : "stream"),
      };
    });

    return await resolveSourceList(formatted);
  } catch (err) {
    console.error("[Animefy Sources Error]", err.message);
    return [];
  }
}

module.exports = function (options) {
  const port = (typeof options === "number" ? options : (options && options.port)) || process.env.PORT || 3000;
  const app = express();
  app.disable("x-powered-by");
  const requestBuckets = new Map();
  const authBuckets = new Map();
  function clientIp(req) { return String(req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim(); }
  function limited(bucket, key, max, windowMs) { const now = Date.now(); const old = bucket.get(key); if (!old || now - old.started >= windowMs) { bucket.set(key, { started: now, count: 1 }); return false; } old.count += 1; return old.count > max; }

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // Same-origin API policy, basic anti-scraping throttling, and security headers.
  app.use((req, res, next) => {
    res.removeHeader("X-Powered-By");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    const origin = req.headers.origin;
    if (origin) { try { if (new URL(origin).host !== req.headers.host) return res.status(403).json({ error: "CROSS_ORIGIN_BLOCKED" }); res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); } catch (_) { return res.status(403).end(); } }
    if (req.path.startsWith("/api/") || req.path.startsWith("/x/")) {
      res.setHeader("Cache-Control", "no-store");
      if (limited(requestBuckets, clientIp(req), 180, 60_000)) return res.status(429).json({ error: "TOO_MANY_REQUESTS" });
    }
    if (req.path === "/api/auth/login" || req.path === "/api/auth/register") {
      if (limited(authBuckets, clientIp(req), 12, 15 * 60_000)) return res.status(429).json({ error: "AUTH_RATE_LIMIT" });
    }
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  });

  // Public-facing aliases: upstream provider names and internal route names do
  // not need to be exposed to the browser. The rewrite stays server-side.
  app.use((req, _res, next) => {
    const aliases = [["/x/gateway", "/api/trpc"], ["/x/content", "/api/anime"], ["/x/w", "/api/witcher"], ["/x/kawaii", "/api/kawaii"], ["/x/animeify", "/api/animeify"], ["/x/episode", "/api/episode"], ["/x/auth", "/api/auth"]];
    for (const [from, to] of aliases) {
      if (req.url === from || req.url.startsWith(`${from}/`) || req.url.startsWith(`${from}?`)) { req.url = to + req.url.slice(from.length); break; }
    }
    next();
  });

  app.post("/api/auth/register", (req, res) => {
    const username = String(req.body?.username || "").trim();
    const key = normalizeUsername(username);
    const password = String(req.body?.password || "");
    if (!validUsername(username)) return res.status(400).json({ error: "اسم المستخدم يجب أن يكون 3–32 حرفاً أو رقماً." });
    if (password.length < 6) return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل." });
    const store = readAuthStore();
    if (store.users[key]) return res.status(409).json({ error: "اسم المستخدم مستخدم بالفعل." });
    const credentials = passwordHash(password);
    store.users[key] = { id: crypto.randomUUID(), username, ...credentials, createdAt: new Date().toISOString() };
    writeAuthStore(store);
    setSession(res, key);
    res.json({ user: { id: store.users[key].id, name: username, username, email: null } });
  });

  app.post("/api/auth/login", (req, res) => {
    const key = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || "");
    const store = readAuthStore();
    const user = store.users[key];
    if (!user || !passwordMatches(password, user)) return res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة." });
    setSession(res, key);
    res.json({ user: { id: user.id, name: user.username, username: user.username, email: null } });
  });

  app.post("/api/auth/logout", (req, res) => {
    const token = parseCookies(req)[SESSION_COOKIE];
    const store = readAuthStore();
    if (token) delete store.sessions[token];
    writeAuthStore(store);
    clearSessionCookie(res);
    res.json({ success: true });
  });

  app.get("/api/auth/me", (req, res) => res.json({ user: sessionUser(req) }));

  async function getClusterLatest(start = 0, limit = 24) {
    // GetGenre18Content is a compact mobile-feed endpoint and currently
    // returns only five cards regardless of limit. Keep the old-sized rail
    // by using the same search endpoint on AnimeFox with genre 18.
    const raw = await clusterApiPost("Content/searchContent", {
      search_keyword: "",
      media_type: "",
      start: String(start),
      limit: String(limit),
      order_by: "created_at",
      order_direction: "DESC",
      language_id: "0",
      genre_id: "18"
    });
    const list = apiList(raw);
    return list.map(normalizeCard);
  }

  // ─── 1. تلبية tRPC للواجهة الحالية ───
  app.use("/api/trpc", async (req, res) => {
    const p = req.path.replace(/^\//, "");
    try {
      // tRPC يرسل الطلبات الأولية مجمعة مثل:
      // anime.latest,anime.random,anime.genres?batch=1&input={"0":...,"1":...}
      // يجب إعادة مصفوفة نتائج بنفس ترتيب العمليات، وليس نتيجة عملية واحدة.
      if (p.includes(",")) {
        const procedures = p.split(",");
        let batchInput = {};
        try {
          const rawBatchInput = req.query.input ?? req.body?.input ?? req.body ?? "{}";
          batchInput = typeof rawBatchInput === "string" ? JSON.parse(rawBatchInput) : rawBatchInput;
        } catch (_) {}
        const result = await Promise.all(procedures.map(async (procedure, index) => {
          const input = batchInput[String(index)]?.json || {};
          let value = null;
          if (procedure === "auth.me") {
            value = sessionUser(req);
          } else if (procedure === "auth.logout") {
            value = { success: true };
          } else if (procedure === "anime.latest") {
            const source = String(req.query.source || "").toLowerCase();
            value = source === "animeify" ? await animeifyLatest(input.limit || 24) : source === "kawaii" ? await kawaiiSearch("", input.limit || 24, [], 1) : source === "witcher" ? await witcherLatest(input.limit || 24) : await getClusterLatest(input.start || 0, input.limit || 24);
          } else if (procedure === "anime.random") {
            const source = String(req.query.source || "").toLowerCase();
            const genres = input.genres || input.genre || input.genreId || [];
            value = source === "animeify" ? ((await animeifyLatest(24)) || [])[0] || null : source === "witcher" ? await witcherRandom(genres, input.exclude || []) : source === "kawaii" ? ((await kawaiiRecommend(genres, 1, input.exclude || [])) || [])[0] || null : await getClusterRandom(genres);
          } else if (procedure === "anime.genres") {
            value = DEFAULT_GENRES;
          } else if (procedure === "anime.details") {
            const source = String(req.query.source || "").toLowerCase();
            const id = String(input.id || "");
            if (source === "animeify" || id.startsWith("x")) {
              value = await animeifyDetails(id);
            } else if (source === "kawaii") {
              value = await kawaiiDetails(id);
            } else if (source === "witcher") {
              value = await witcherLoad(id);
            } else {
              const raw = await clusterApiPost("Content/getContentDetailsByID", {
                user_id: "B80E7D43",
                content_id: id,
                exclude_seasons: "1",
              });
              const item = raw?.data && !Array.isArray(raw.data) ? raw.data : raw;
              value = normalizeCard(item || {});
            }
          } else if (procedure === "anime.seasons") {
            const source = String(req.query.source || "").toLowerCase();
            const id = String(input.id || "");
            if (source === "animeify" || id.startsWith("x")) {
              value = await animeifySeasons(id);
            } else if (source === "kawaii") {
              value = await kawaiiSeasons(id);
            } else if (source === "witcher") {
              value = await witcherSeasons(id);
            } else {
              const raw = await clusterApiPost("Content/getSeasonByContentID", {
                user_id: "B80E7D43",
                content_id: id,
                lazy: "1",
              });
              value = apiList(raw).map((season, seasonIndex) => ({
                id: String(season.season_id || seasonIndex + 1),
                title: String(season.season_title || `الموسم ${seasonIndex + 1}`),
                number: seasonIndex + 1,
                episodes: (Array.isArray(season.episodes) ? season.episodes : []).map((episode, episodeIndex) => ({
                  id: String(episode.episode_id || episodeIndex + 1),
                  title: String(episode.episode_title || `الحلقة ${episodeIndex + 1}`),
                  duration: String(episode.episode_duration || ""),
                  number: Number(episode.episode_number || episodeIndex + 1),
                })),
              }));
            }
          } else if (procedure === "anime.episodeSources") {
            const source = String(req.query.source || "").toLowerCase();
            const epId = String(input.episodeId || "");
            if (source === "animeify" || epId.startsWith("animeify-") || /-[a-zA-Z0-9]+-ep\d+/.test(epId)) {
              value = await animeifySources(epId);
            } else if (source === "kawaii" || /^\d+-ep\d+$/.test(epId)) {
              value = await kawaiiSources(epId);
            } else {
              const raw = await clusterApiPost("Content/getSourceByEpisodeID", {
                episode_id: epId,
              });
              const formatted = apiList(raw).map((source, sourceIndex) => {
                const url = String(source.source || source.source_url || source.url || "");
                const provider = /playmogo/i.test(url) ? "PlayMogo" :
                  /mediafire/i.test(url) ? "MediaFire" :
                  /mega\.(nz|io)/i.test(url) ? "Mega" :
                  /drive\.google/i.test(url) ? "Google Drive" :
                  /mp4upload/i.test(url) ? "MP4Upload" :
                  /uqload/i.test(url) ? "UQLoad" :
                  /streamtape/i.test(url) ? "StreamTape" :
                  /pixeldrain/i.test(url) ? "PixelDrain" :
                  /streamwish|streamfiles/i.test(url) ? "StreamFiles" :
                  /voe\.sx/i.test(url) ? "Voe" :
                  /doodstream|dsvplay/i.test(url) ? "DoodStream" :
                  /dailymotion/i.test(url) ? "DailyMotion" :
                  /youtu/i.test(url) ? "YouTube" : "AnimeCluster";
                const downloadable = source.downloadable === true || source.downloadable === 1 || source.downloadable === "1";
                const isNative = /\.(mp4|webm|m3u8)(\?|$)/i.test(url);
                const isStreamProvider = ["MP4Upload","UQLoad","Voe","DoodStream","StreamTape","StreamFiles"].includes(provider);
                const isDownloadProvider = ["MediaFire","Mega","Google Drive"].includes(provider);
                const logoMap = { "MediaFire":"MF","Mega":"MEGA","Google Drive":"DRIVE","MP4Upload":"MP4","UQLoad":"UQ","StreamTape":"ST","PixelDrain":"PD","StreamFiles":"SF","Voe":"VOE","DoodStream":"DOOD","DailyMotion":"DM","YouTube":"YT","PlayMogo":"PM" };
                return {
                  id: String(source.source_id || source.id || sourceIndex + 1),
                  title: String(source.source_title || source.title || `مصدر ${sourceIndex + 1}`),
                  quality: String(source.source_quality || source.quality || ""),
                  size: String(source.source_size || source.size || ""),
                  url,
                  downloadable: downloadable || isDownloadProvider,
                  watchable: isNative || isStreamProvider || provider === "PixelDrain" || provider === "DailyMotion" || provider === "YouTube",
                  embeddable: isNative || isStreamProvider || provider === "PixelDrain" || provider === "DailyMotion" || provider === "YouTube",
                  provider,
                  logoText: logoMap[provider] || "CL",
                  kind: isDownloadProvider ? "download" : "stream",
                };
              }).filter(source => source.url);
              value = await resolveSourceList(formatted);
            }
          } else if (procedure.startsWith("account.")) {
            value = accountProcedure(procedure, input, req);
          }
          return { result: { data: { json: value } } };
        }));
        return res.json(result);
      }

      if (p.includes("anime.genres")) {
        return res.json({ result: { data: { json: DEFAULT_GENRES } } });
      }

      if (p.includes("anime.latest")) {
        const source = String(req.query.source || "").toLowerCase();
        const items = source === "animeify" ? await animeifyLatest(24) : source === "kawaii" ? await kawaiiSearch("", 24, [], 1) : source === "witcher" ? await witcherLatest(24) : await getClusterLatest(0, 24);
        return res.json({ result: { data: { json: items } } });
      }

      if (p.includes("anime.random")) {
        const input = parseTrpcInput(req);
        const source = String(req.query.source || "").toLowerCase();
        const genres = input.genres || input.genre || input.genreId || [];
        const result = source === "animeify" ? ((await animeifyLatest(24)) || [])[0] || null : source === "witcher" ? await witcherRandom(genres, input.exclude || []) : source === "kawaii" ? await kawaiiRecommend(genres, 1, input.exclude || []) : await getClusterRandom(genres);
        return res.json({ result: { data: { json: Array.isArray(result) ? (result[0] || null) : result } } });
      }

      if (p.includes("auth.me")) {
        return res.json({ result: { data: { json: sessionUser(req) } } });
      }

      if (p.includes("auth.logout")) {
        const token = parseCookies(req)[SESSION_COOKIE];
        const store = readAuthStore();
        if (token) delete store.sessions[token];
        writeAuthStore(store);
        clearSessionCookie(res);
        return res.json({ result: { data: { json: { success: true } } } });
      }

      if (p.includes("account.")) {
        const procedure = p.split(",").find(name => name.startsWith("account.")) || p;
        const value = accountProcedure(procedure, parseTrpcInput(req), req);
        if (value?.error === "UNAUTHORIZED") return res.status(401).json({ error: { json: { message: "Please login", code: "UNAUTHORIZED" } } });
        return res.json({ result: { data: { json: value } } });
      }

      if (p.includes("anime.search")) {
        const input = parseTrpcInput(req);
        const kw = input.keyword || "";
        const start = Math.max(0, Number(input.start) || 0);
        const limit = Math.min(50, Math.max(1, Number(input.limit) || 24));
        const source = String(req.query.source || "").toLowerCase();
        if (source === "animeify") {
          const items = await animeifySearch(kw, limit);
          return res.json({ result: { data: { json: items } } });
        }
        if (source === "kawaii") {
          const items = await kawaiiSearch(kw, limit, [], Math.floor(start / limit) + 1);
          return res.json({ result: { data: { json: items } } });
        }
        if (source === "witcher") {
          const items = await witcherSearch(kw, Math.floor(start / limit), limit);
          return res.json({ result: { data: { json: items } } });
        }
        const raw = await clusterApiPost("Content/searchContent", {
          search_keyword: kw,
          content_type: "0",
          start: String(start),
          limit: String(limit),
          order_by: "created_at",
          order_direction: "DESC",
          language_id: "0",
          genre_id: "0"
        });
        const list = apiList(raw);
        return res.json({ result: { data: { json: list.map(normalizeCard) } } });
      }

      if (p.includes("anime.details")) {
        const id = String(parseTrpcInput(req).id || "");
        const source = String(req.query.source || "").toLowerCase();
        if (source === "animeify" || id.startsWith("x")) {
          return res.json({ result: { data: { json: await animeifyDetails(id) } } });
        }
        if (source === "kawaii") {
          return res.json({ result: { data: { json: await kawaiiDetails(id) } } });
        }
        if (source === "witcher") {
          return res.json({ result: { data: { json: await witcherLoad(id) } } });
        }
        const raw = await clusterApiPost("Content/getContentDetailsByID", {
          user_id: "B80E7D43",
          content_id: id,
          exclude_seasons: "1"
        });
        const item = raw?.data && !Array.isArray(raw.data) ? raw.data : raw;
        return res.json({ result: { data: { json: normalizeCard(item || {}) } } });
      }

      if (p.includes("anime.seasons")) {
        const id = String(parseTrpcInput(req).id || "");
        const source = String(req.query.source || "").toLowerCase();
        if (source === "animeify" || id.startsWith("x")) {
          return res.json({ result: { data: { json: await animeifySeasons(id) } } });
        }
        if (source === "kawaii") {
          return res.json({ result: { data: { json: await kawaiiSeasons(id) } } });
        }
        if (source === "witcher") {
          return res.json({ result: { data: { json: await witcherSeasons(id) } } });
        }
        const raw = await clusterApiPost("Content/getSeasonByContentID", {
          user_id: "B80E7D43",
          content_id: id,
          lazy: "1"
        });
        const seasons = apiList(raw);
        const formatted = seasons.map((s, idx) => ({
          id: String(s.season_id || idx + 1),
          title: String(s.season_title || `الموسم ${idx + 1}`),
          number: idx + 1,
          episodes: (s.episodes || []).map((ep, epIdx) => ({
            id: String(ep.episode_id || epIdx + 1),
            title: String(ep.episode_title || `الحلقة ${epIdx + 1}`),
            duration: String(ep.episode_duration || ""),
            number: epIdx + 1
          }))
        }));
        return res.json({ result: { data: { json: formatted } } });
      }

      if (p.includes("anime.episodeSources")) {
        const epId = String(parseTrpcInput(req).episodeId || "");
        const source = String(req.query.source || "").toLowerCase();
        if (source === "animeify" || epId.startsWith("animeify-") || /-[a-zA-Z0-9]+-ep\d+/.test(epId)) {
          return res.json({ result: { data: { json: await animeifySources(epId) } } });
        }
        if (source === "kawaii" || /^\d+-ep\d+$/.test(epId)) {
          return res.json({ result: { data: { json: await kawaiiSources(epId) } } });
        }
        const raw = await clusterApiPost("Content/getSourceByEpisodeID", {
          episode_id: epId
        });
        const sources = apiList(raw);
        const formatted = sources.map((s, idx) => {
          const url = s.source || "";
          const isMf = url.includes("mediafire");
          const isPd = /pixeldrain/i.test(url);
          const isSf = /streamfiles|streamwish/i.test(url);
          const isSt = /streamtape/i.test(url);
          const isNative = /\.(mp4|webm|m3u8)(\?|$)/i.test(url) || isMf;
          let provider = isMf ? "MediaFire" : isPd ? "PixelDrain" : isSf ? "StreamFiles" : isSt ? "StreamTape" : "AnimeCluster";
          const logoMap = { "MediaFire":"MF","PixelDrain":"PD","StreamFiles":"SF","StreamTape":"ST","AnimeCluster":"CL" };
          return {
            id: String(s.source_id || idx + 1),
            title: String(s.source_title || (isMf ? "MediaFire" : "سيرفر مشاهدة")),
            quality: String(s.source_quality || "1080p"),
            size: String(s.source_size || ""),
            url,
            downloadable: s.downloadable === "1" || s.downloadable === 1 || isMf,
            watchable: isNative || (!isMf && !url.includes("mega.nz")) || isPd || isSf || isSt,
            embeddable: isNative || (!isMf && !url.includes("mega.nz")) || isPd || isSf || isSt,
            provider,
            logoText: logoMap[provider] || "CL",
            kind: isMf ? "download" : "stream"
          };
        });
        const resolved = await resolveSourceList(formatted);
        return res.json({ result: { data: { json: resolved } } });
      }

      return res.json({ result: { data: { json: null } } });
    } catch(err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── 2. مسارات REST المباشرة ───
  app.get("/api/anime/latest", async (req, res) => {
    try {
      const items = await getClusterLatest(req.query.start || 0, req.query.limit || 24);
      res.json(items);
    } catch(e) {
      console.warn("[Cluster latest] upstream unavailable; using local fallback", e.message);
      res.json(CLUSTER_FALLBACK);
    }
  });

  app.get("/api/anime/search", async (req, res) => {
    try {
      const q = req.query.q || req.query.query || "";
      if (!q) return res.json([]);
      const start = Math.max(0, Number(req.query.start) || 0);
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 24));
      const raw = await clusterApiPost("Content/searchContent", {
        search_keyword: q,
        content_type: "0",
        start: String(start),
        limit: String(limit),
        order_by: "created_at",
        order_direction: "DESC",
        language_id: "0",
        genre_id: "0"
      });
      const list = apiList(raw);
      res.json(list.map(normalizeCard));
    } catch(e) {
      console.warn("[Cluster search] upstream unavailable; using local fallback", e.message);
      res.json(clusterFallbackSearch(req.query.q || req.query.query || ""));
    }
  });

  app.get("/api/anime/genres", (req, res) => {
    res.json(DEFAULT_GENRES);
  });

  app.get("/api/anime/random", async (req, res) => {
    try {
      const selected = req.query.genres || req.query.genre || req.query.genreId || [];
      const genres = Array.isArray(selected) ? selected : String(selected).split(",").filter(Boolean);
      res.json((await getClusterRandom(genres)) || clusterFallbackRandom(genres));
    } catch(e) {
      res.json(clusterFallbackRandom(req.query.genres || req.query.genre || req.query.genreId || []));
    }
  });

  app.get("/api/anime/resolve", async (req, res) => {
    try {
      const title = String(req.query.title || "").trim(); const id = String(req.query.id || "").trim();
      if (/^B[0-9A-F]{8}$/i.test(id)) return res.json({ id });
      const raw = await clusterApiPost("Content/searchContent", { search_keyword: title || id, content_type: "0", start: "0", limit: "24", order_by: "created_at", order_direction: "DESC", language_id: "0", genre_id: "0" });
      const items = apiList(raw).map(normalizeCard); const norm = value => String(value || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, ""); const wanted = norm(title);
      const found = items.find(item => norm(item.title) === wanted) || items.find(item => norm(item.title).includes(wanted) || wanted.includes(norm(item.title))) || items[0];
      if (!found?.id) return res.status(404).json({ error: "CONTENT_NOT_FOUND" }); res.json(found);
    } catch (e) { res.status(502).json({ error: e.message }); }
  });
  app.get("/api/anime/:id", async (req, res) => {
    try {
      const raw = await clusterApiPost("Content/getContentDetailsByID", {
        user_id: "B80E7D43",
        content_id: String(req.params.id),
        exclude_seasons: "1"
      });
      const item = raw?.data && !Array.isArray(raw.data) ? raw.data : raw;
      res.json(normalizeCard(item || {}));
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/anime/:id/seasons", async (req, res) => {
    try {
      const raw = await clusterApiPost("Content/getSeasonByContentID", {
        user_id: "B80E7D43",
        content_id: String(req.params.id),
        lazy: "1"
      });
      const seasons = apiList(raw);
      const formatted = seasons.map((s, idx) => ({
        id: String(s.season_id || idx + 1),
        title: String(s.season_title || `الموسم ${idx + 1}`),
        number: idx + 1,
        episodes: (s.episodes || []).map((ep, epIdx) => ({
          id: String(ep.episode_id || epIdx + 1),
          title: String(ep.episode_title || `الحلقة ${epIdx + 1}`),
          duration: String(ep.episode_duration || ""),
          number: epIdx + 1
        }))
      }));
      res.json(formatted);
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/episode/:id/sources", async (req, res) => {
    try {
      const raw = await clusterApiPost("Content/getSourceByEpisodeID", {
        episode_id: String(req.params.id)
      });
      const sources = apiList(raw);
      const formatted = sources.map((s, idx) => {
        const url = s.source || "";
        const isMf = url.includes("mediafire");
        const isPd = /pixeldrain/i.test(url);
        const isSf = /streamfiles|streamwish/i.test(url);
        const isSt = /streamtape/i.test(url);
        const isNative = /\.(mp4|webm|m3u8)(\?|$)/i.test(url) || isMf;
        let provider = isMf ? "MediaFire" : isPd ? "PixelDrain" : isSf ? "StreamFiles" : isSt ? "StreamTape" : "AnimeCluster";
        const logoMap = { "MediaFire":"MF","PixelDrain":"PD","StreamFiles":"SF","StreamTape":"ST","AnimeCluster":"CL" };
        return {
          id: String(s.source_id || idx + 1),
          title: String(s.source_title || (isMf ? "MediaFire" : "سيرفر مشاهدة")),
          quality: String(s.source_quality || "1080p"),
          size: String(s.source_size || ""),
          url,
          downloadable: s.downloadable === "1" || s.downloadable === 1 || isMf,
          watchable: isNative || (!isMf && !url.includes("mega.nz")) || isPd || isSf || isSt,
          embeddable: isNative || (!isMf && !url.includes("mega.nz")) || isPd || isSf || isSt,
          provider,
          logoText: logoMap[provider] || "CL",
          kind: isMf ? "download" : "stream"
        };
      });
      const resolved = await resolveSourceList(formatted);
      res.json(resolved);
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Generic single-URL resolver used by the in-site "paste any link" player.
  // Returns the best playable form for the given URL.
  app.get("/api/video/direct", async (req, res) => {
    try {
      const url = String(req.query.url || "").trim();
      if (!url) return res.status(400).json({ error: "MISSING_URL" });
      if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: "INVALID_URL" });
      const resolved = await resolveAnySourceServer(url);
      res.json({
        ok: true,
        url: resolved.url,
        embedUrl: resolved.embedUrl || resolved.url,
        direct: !!resolved.direct,
        provider: resolved.provider,
        kind: resolved.kind,
        hint: resolved.direct ? "تشغيل مباشر" : resolved.kind === "embed" ? "مشاهدة عبر الإطار المضمّن" : "قد يحتاج تحميل خارجي",
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // High-performance streaming proxy for direct video streams (MP4Upload, MediaFire, PixelDrain, etc.)
  // Handles range requests (206 Partial Content), iOS-compatible MIME types, and CORS bypass.
  app.get("/api/video/proxy", async (req, res) => {
    try {
      const url = String(req.query.url || "").trim();
      if (!url || !/^https?:\/\//i.test(url)) {
        return res.status(400).json({ error: "INVALID_URL" });
      }
      const range = req.headers.range;
      let referer = new URL(url).origin + "/";
      if (/mp4upload\.com/i.test(url)) {
        referer = "https://www.mp4upload.com/";
      } else if (/kawaii-anime\.com|video\.kawaii-anime\.com/i.test(url)) {
        referer = "https://kawaiianime.cc/";
      }

      const upstream = await axios.get(url, {
        responseType: "stream",
        timeout: 30000,
        headers: {
          "User-Agent": MF_UA,
          "Accept": "*/*",
          ...(range ? { Range: range } : {}),
          "Referer": referer,
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        validateStatus: status => status >= 200 && status < 400,
      });

      res.status(upstream.status);
      let ct = upstream.headers["content-type"];
      if (!ct || ct === "application/octet-stream" || ct === "binary/octet-stream" || ct.includes("text/plain")) {
        if (/\.mp4(\?|$)/i.test(url)) ct = "video/mp4";
        else if (/\.webm(\?|$)/i.test(url)) ct = "video/webm";
        else if (/\.m3u8(\?|$)/i.test(url)) ct = "application/vnd.apple.mpegurl";
        else if (/\.mkv(\?|$)/i.test(url)) ct = "video/mp4";
        else ct = "video/mp4";
      }
      res.setHeader("Content-Type", ct);

      const cl = upstream.headers["content-length"];
      if (cl) res.setHeader("Content-Length", cl);
      const cr = upstream.headers["content-range"];
      if (cr) res.setHeader("Content-Range", cr);
      const ar = upstream.headers["accept-ranges"] || "bytes";
      res.setHeader("Accept-Ranges", ar);

      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "Range, Authorization, Content-Type, Accept");
      res.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
      res.setHeader("Cache-Control", "public, max-age=3600");

      upstream.data.pipe(res);
      upstream.data.on("error", () => {
        try { res.end(); } catch (_) {}
      });
      req.on("close", () => {
        try { upstream.data.destroy(); } catch (_) {}
      });
    } catch (e) {
      res.status(502).json({ error: e.message || "PROXY_FAILED" });
    }
  });

  // Kawaii endpoints never fall back to Cluster/Witcher.
  app.get("/api/kawaii/latest", async (req, res) => { try { res.json(await kawaiiSearch("", req.query.limit || 24)); } catch (e) { res.status(502).json({ error: e.message }); } });
  app.get("/api/kawaii/random", async (req, res) => { try { const raw = req.query.genres || req.query.genre || req.query.genreId || ""; const genres = Array.isArray(raw) ? raw : String(raw).split(",").filter(Boolean); const list = await kawaiiSearch("", 40, genres, 1); res.json(list[Math.floor(Math.random() * list.length)] || null); } catch (e) { res.status(502).json({ error: e.message }); } });
  app.get("/api/kawaii/search", async (req, res) => { try { const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "24", 10))); const start = req.query.start != null ? Math.max(0, parseInt(req.query.start || "0", 10)) : Math.max(0, (parseInt(req.query.page || "1", 10) - 1) * limit); const raw = req.query.genres || req.query.genre || req.query.genreId || ""; const genres = Array.isArray(raw) ? raw : String(raw).split(",").filter(Boolean); const page = Math.floor(start / limit) + 1; res.json(await kawaiiSearch(req.query.q || req.query.query || "", limit, genres, page)); } catch (e) { res.status(502).json({ error: e.message }); } });
  app.get("/api/kawaii/:id/seasons", async (req, res) => { try { res.json(await kawaiiSeasons(req.params.id)); } catch (e) { res.status(502).json({ error: e.message }); } });
  app.get("/api/kawaii/episode/:id/sources", async (req, res) => { try { res.json(await kawaiiSources(req.params.id)); } catch (e) { res.status(502).json({ error: e.message }); } });
  app.get("/api/kawaii/:id", async (req, res) => { try { res.json(await kawaiiDetails(req.params.id)); } catch (e) { res.status(502).json({ error: e.message }); } });
  // Witcher endpoints never fall back to Cluster and carry source=witcher.
  app.get("/api/witcher/search", async (req, res) => { try { const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "24", 10))); const start = req.query.start != null ? Math.max(0, parseInt(req.query.start || "0", 10)) : Math.max(0, (parseInt(req.query.page || "1", 10) - 1) * limit); const page = Math.floor(start / limit); res.json(await witcherSearch(req.query.q || req.query.query || "", page, limit)); } catch (e) { res.status(502).json({ error: e.message }); } });
  app.get("/api/witcher/latest", async (req, res) => { try { const limit = Math.min(60, Math.max(1, parseInt(req.query.limit || "24", 10))); res.json(await witcherLatest(limit)); } catch (e) { res.status(502).json({ error: e.message }); } });
  app.get("/api/witcher/recent-episodes", async (req, res) => { try { const limit = Math.min(24, Math.max(1, parseInt(req.query.limit || "12", 10))); res.json(await witcherRecentEpisodes(limit)); } catch (e) { res.status(502).json({ error: e.message }); } });
  app.get("/api/witcher/random", async (req, res) => { try { const raw = req.query.genres || req.query.genre || req.query.genreId || []; const genres = Array.isArray(raw) ? raw : String(raw).split(",").filter(Boolean); const exclude = req.query.exclude ? String(req.query.exclude) : []; res.json(await witcherRandom(genres, exclude)); } catch (e) { res.status(502).json({ error: e.message }); } });
  app.get("/api/witcher/recommend", async (req, res) => { try { const raw = req.query.genres || req.query.genre || req.query.genreId || []; const genres = Array.isArray(raw) ? raw : String(raw).split(",").filter(Boolean); const exclude = req.query.exclude ? String(req.query.exclude) : ""; const limit = Math.min(20, Math.max(1, parseInt(req.query.limit || "5", 10))); res.json(await witcherRecommend(genres, limit, exclude)); } catch (e) { res.status(502).json({ error: e.message }); } });
  app.get("/api/witcher/resolve", async (req, res) => {
    try {
      const work = witcherResolveEpisode(req.query.title || req.query.anime || "", req.query.number || req.query.episode, req.query.id || "");
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("WITCHER_RESOLVE_TIMEOUT")), 18000));
      const found = await Promise.race([work, timeout]);
      if (!found) return res.status(404).json({ error: "EPISODE_NOT_FOUND" });
      res.json(found);
    } catch (e) {
      res.status(e?.message === "WITCHER_RESOLVE_TIMEOUT" ? 504 : 502).json({ error: e.message });
    }
  });
  app.get("/api/witcher/:id", async (req, res) => { try { res.json(await witcherLoad(req.params.id)); } catch (e) { res.status(502).json({ error: e.message }); } });
  app.get("/api/witcher/:id/seasons", async (req, res) => { try { const item = await witcherLoad(req.params.id); res.json([{ id: `witcher-${item.id}`, title: "الموسم 1", number: 1, episodes: item.episodesList || [] }]); } catch (e) { res.status(502).json({ error: e.message }); } });
  // witcherSources already resolves MediaFire/PixelDrain once. Do not pass
  // its cloned watch/download entries through the resolver a second time:
  // parallel MediaFire requests can yield one direct URL and one raw page.
  app.get("/api/witcher/:animeId/episode/:episodeId/sources", async (req, res) => { try { const item = await witcherLoad(req.params.animeId); const list = await witcherSources(item.animePath, req.params.episodeId); res.json(list); } catch (e) { res.status(502).json({ error: e.message }); } });

  // Animefy endpoints never fall back to other sources and carry source=animeify.
  app.get("/api/animeify/latest", async (req, res) => { try { res.json(await animeifyLatest(req.query.limit || 24)); } catch (e) { res.status(502).json({ error: e.message }); } });
  app.get("/api/animeify/search", async (req, res) => { try { res.json(await animeifySearch(req.query.q || req.query.query || "", req.query.limit || 24)); } catch (e) { res.status(502).json({ error: e.message }); } });
  app.get("/api/animeify/:id/seasons", async (req, res) => { try { res.json(await animeifySeasons(req.params.id)); } catch (e) { res.status(502).json({ error: e.message }); } });
  app.get("/api/animeify/episode/:id/sources", async (req, res) => { try { res.json(await animeifySources(req.params.id)); } catch (e) { res.status(502).json({ error: e.message }); } });
  app.get("/api/animeify/:id", async (req, res) => { try { res.json(await animeifyDetails(req.params.id)); } catch (e) { res.status(502).json({ error: e.message }); } });

  // ملفات dist الثابتة (تفضيل مجلد dist/public المبني حديثاً بواسطة Vite)
  const staticPath = fs.existsSync(path.join(__dirname, "dist", "public", "index.html"))
    ? path.join(__dirname, "dist", "public")
    : path.join(__dirname, "dist");
  app.use(express.static(staticPath, { index: false }));

  app.get("*", (req, res) => {
    const indexPath = path.join(staticPath, "index.html");
    if (fs.existsSync(indexPath)) {
      const localAuthBridge = `<script>(function(){
        function openAuth(){
          if(document.getElementById('local-auth-box'))return;
          var box=document.createElement('div');box.id='local-auth-box';box.dir='rtl';
          box.style='position:fixed;inset:0;z-index:99999;background:rgba(3,5,12,.92);display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;color:#fff';
          box.innerHTML='<form id="local-auth-form" style="width:min(360px,90vw);padding:28px;background:#101421;border:1px solid #21e6ff;display:flex;flex-direction:column;gap:12px"><h2 id="local-auth-title" style="margin:0">تسجيل الدخول</h2><input id="local-auth-user" required minlength="3" maxlength="32" placeholder="اسم المستخدم" style="height:42px;padding:0 10px;background:#080b12;color:white;border:1px solid #536078"><input id="local-auth-pass" required minlength="6" type="password" placeholder="كلمة المرور" style="height:42px;padding:0 10px;background:#080b12;color:white;border:1px solid #536078"><div id="local-auth-error" style="color:#ff9ddc;font-size:13px"></div><button style="height:42px;background:#ff2abf;color:white;border:0;font-weight:bold">متابعة</button><button type="button" id="local-auth-switch" style="height:36px;background:transparent;color:#21e6ff;border:0">ليس لديك حساب؟ إنشاء حساب</button><button type="button" id="local-auth-close" style="height:30px;background:transparent;color:#aaa;border:0">إلغاء</button></form>';
          document.body.appendChild(box);var mode='login';
          box.querySelector('#local-auth-switch').onclick=function(){mode=mode==='login'?'register':'login';box.querySelector('#local-auth-title').textContent=mode==='login'?'تسجيل الدخول':'إنشاء حساب';this.textContent=mode==='login'?'ليس لديك حساب؟ إنشاء حساب':'لديك حساب؟ تسجيل الدخول'};
          box.querySelector('#local-auth-close').onclick=function(){box.remove()};
          box.querySelector('form').onsubmit=async function(e){e.preventDefault();var err=box.querySelector('#local-auth-error');err.textContent='جاري التنفيذ...';var r=await fetch('/api/auth/'+mode,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({username:box.querySelector('#local-auth-user').value,password:box.querySelector('#local-auth-pass').value})});var d=await r.json().catch(function(){return{}});if(!r.ok){err.textContent=d.error||'تعذر تنفيذ العملية';return}location.reload()};
        }
        document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('button');if(b&&/تسجيل الدخول/.test(b.textContent)){e.preventDefault();e.stopImmediatePropagation();openAuth()}},true);
        function mountLogout(){if(document.getElementById('neon-logout'))return;var text=(document.body&&document.body.textContent)||'';var accountPage=/account|profile|user|حساب/.test(location.pathname+' '+text)&&(/المفضلة|سجل المشاهدة|تسجيل الخروج/.test(text));if(!accountPage)return;fetch('/api/auth/me',{credentials:'include'}).then(function(r){return r.json()}).then(function(d){if(!d||!d.user)return;var b=document.createElement('button');b.id='neon-logout';b.textContent='تسجيل الخروج';b.dir='rtl';b.style='display:block;width:min(420px,90%);margin:28px auto 8px;background:#101827;color:#ff91d7;border:1px solid #ff2abf;border-radius:4px;padding:10px 12px;font:13px Arial;cursor:pointer';b.onclick=function(){fetch('/api/auth/logout',{method:'POST',credentials:'include'}).then(function(){location.reload()})};(document.querySelector('main')||document.body).appendChild(b)}).catch(function(){})}mountLogout();setTimeout(mountLogout,1200);setTimeout(mountLogout,3000);
      })();</script><script>(function(){
        if(location.pathname.indexOf('/watch/')!==0)return;
        var activeVideo=null, activeKey='', timer=0;
        function key(video){return 'neonflix:watch-progress:'+location.pathname.split('/').pop()+':'+(video.currentSrc||video.src||'native');}
        function attach(video){
          if(activeVideo===video)return;
          activeVideo=video; activeKey=key(video);
          var saved=null; try{saved=JSON.parse(localStorage.getItem(activeKey)||'null')}catch(e){}
          var restore=function(){if(saved&&saved.time>3&&video.duration&&saved.time<video.duration-5){try{video.currentTime=saved.time}catch(e){}}};
          video.addEventListener('loadedmetadata',restore,{once:true});
          if(video.readyState>=1)restore();
          var save=function(){if(!activeKey||!isFinite(video.currentTime)||video.currentTime<1)return;try{localStorage.setItem(activeKey,JSON.stringify({time:video.currentTime,duration:video.duration||0,savedAt:Date.now()}))}catch(e){}};
          video.addEventListener('timeupdate',function(){clearTimeout(timer);timer=setTimeout(save,800)});
          video.addEventListener('pause',save); video.addEventListener('seeking',save);
          video.addEventListener('ended',function(){try{localStorage.removeItem(activeKey)}catch(e){}});
          window.addEventListener('pagehide',save); window.addEventListener('beforeunload',save);
        }
        function scan(){var v=document.querySelector('video');if(v)attach(v); document.querySelectorAll('iframe').forEach(function(frame){frame.setAttribute('allowfullscreen','true');frame.setAttribute('webkitallowfullscreen','true');frame.setAttribute('mozallowfullscreen','true');frame.setAttribute('allow','autoplay; fullscreen; picture-in-picture; encrypted-media')})}
        new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});
        setInterval(scan,1000); scan();
      })();</script>`;
      const html = fs.readFileSync(indexPath, "utf8");
      const aliasBridge = `<script>(function(){var f=window.fetch;window.fetch=function(r,o){var u=String(r&&r.url||r||'');var p=[['/api/anime','/x/content'],['/api/witcher','/x/w'],['/api/kawaii','/x/kawaii'],['/api/animeify','/x/animeify'],['/api/episode','/x/episode'],['/api/auth','/x/auth']];p.forEach(function(x){if(u.indexOf(x[0])===0)u=x[1]+u.slice(x[0].length)});var sm=localStorage.getItem('neonflix-source')||'cluster';if(u.indexOf('/api/trpc/anime.')===0){u+=(u.indexOf('?')>=0?'&':'?')+'source='+encodeURIComponent(sm)}if(u!==String(r&&r.url||r||''))r=u;return f.call(this,r,o)};})();</script>`;
      const sourceBridge = `<script>(function(){
        var clean=function(){
          var o1=document.getElementById('persistent-source-switcher');if(o1)o1.remove();
          var o2=document.getElementById('source-switcher');if(o2)o2.remove();
        };
        clean();
        var key='neonflix-source',mode=localStorage.getItem(key)||'cluster';
        var bar=document.createElement('div');
        bar.id='source-switcher';
        bar.dir='rtl';
        bar.style='position:fixed;top:max(46px,env(safe-area-inset-top,46px));left:6px;right:6px;z-index:99990;display:flex;gap:4px;padding:4px;background:rgba(8,12,24,0.95);border:1px solid rgba(0,229,255,0.4);border-radius:10px;backdrop-filter:blur(10px);box-shadow:0 4px 18px rgba(0,0,0,0.75);box-sizing:border-box';
        [['cluster','Anime Cluster'],['witcher','Anime Witcher'],['kawaii','Anime Kawaii'],['animeify','Animefy']].forEach(function(x){
          var b=document.createElement('button');
          b.textContent=x[1];
          var active=mode===x[0];
          b.style='flex:1 1 0;min-width:0;padding:6px 2px;border:1px solid '+(active?'#ff2abf':'rgba(255,255,255,0.12)')+';background:'+(active?'#ff2abf':'rgba(255,255,255,0.06)')+';color:#fff;font:700 11px system-ui,-apple-system,Arial;border-radius:7px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center';
          b.onclick=function(){localStorage.setItem(key,x[0]);location.reload()};
          bar.appendChild(b);
        });
        document.body.appendChild(bar);
      })();</script>`;
      const witcherEnhance = `<script>(function(){
        if(localStorage.getItem('neonflix-source')!=='witcher')return;
        var qs=new URLSearchParams(location.search), cid=qs.get('contentId')||'';
        function episodeId(){return location.pathname.split('/').pop()||''}
        function markCurrent(){if(location.pathname.indexOf('/watch/')===0&&cid){try{localStorage.setItem('neonflix:watched:'+cid+':'+episodeId(),'1')}catch(e){}}}
        function badges(){document.querySelectorAll('a[href^="/watch/"]').forEach(function(a){var m=a.href.match(/\/watch\/([^?]+)/);if(!m)return;var key='neonflix:watched:'+location.pathname.split('/').pop()+':'+decodeURIComponent(m[1]);if(localStorage.getItem(key)&&!a.querySelector('.witcher-watched')){var b=document.createElement('span');b.className='witcher-watched';b.textContent='✓ تمت المشاهدة';b.style='display:block;color:#57f5a6;font-size:10px;margin-top:3px';a.appendChild(b)}})}
        function player(){if(location.pathname.indexOf('/watch/')!==0)return;var box=document.querySelector('.player-frame');if(!box||box.querySelector('.witcher-native-player'))return;var q=new URLSearchParams(location.search),anime=q.get('anime')||'',title=q.get('title')||'',n=(title.match(/(\\d+)/)||[])[1]||'';fetch('/api/witcher/resolve?title='+encodeURIComponent(anime)+'&number='+encodeURIComponent(n)+'&id='+encodeURIComponent(cid)).then(function(r){return r.ok?r.json():null}).then(function(x){if(!x)return null;return fetch('/api/witcher/'+encodeURIComponent(x.animeId)+'/episode/'+encodeURIComponent(x.episodeId)+'/sources').then(function(r){return r.json()}).then(function(list){return {x:x,list:list}})}).then(function(data){if(!data)return;var s=(data.list||[]).find(function(x){return x.direct&&x.url});if(!s)return;var v=document.createElement('video');v.className='video-player witcher-native-player';v.controls=true;v.playsInline=true;v.setAttribute('webkit-playsinline','true');v.src='/api/video/proxy?url='+encodeURIComponent(s.url);v.style='display:block;width:100%;aspect-ratio:16/9;background:#000';var old=box.querySelector('iframe,.player-placeholder');if(old)old.replaceWith(v);else box.appendChild(v);var k='neonflix:witcher-progress:'+data.x.animeId+':'+data.x.episodeId;try{var p=JSON.parse(localStorage.getItem(k)||'null');v.addEventListener('loadedmetadata',function(){if(p&&p.time>3&&p.time<v.duration-5)v.currentTime=p.time});v.addEventListener('timeupdate',function(){if(v.currentTime>1)localStorage.setItem(k,JSON.stringify({time:v.currentTime}))});v.addEventListener('ended',function(){localStorage.removeItem(k)})}catch(e){}}).catch(function(){});}
        markCurrent();badges();player();new MutationObserver(function(){badges();player()}).observe(document.documentElement,{childList:true,subtree:true});
      })();</script>`;

      // ───────────────────────────────────────────────────────────────────
      // Witcher Home Enhance — adds:
      //   • A "Recently Added Episodes" rail in the home page above the
      //     curated feed (only when the user is in witcher mode).
      //   • A "Recently Suggested" history strip beside the random panel.
      //   • Passes the user's "shown suggestions" list as `exclude=` so
      //     /api/witcher/recommend never repeats the same anime twice.
      //   • Persists each picked suggestion into localStorage.
      // ───────────────────────────────────────────────────────────────────
      const kawaiiEnhance = `<script>(function(){
        if(localStorage.getItem('neonflix-source')!=='kawaii')return;
        var busy=false;
        function addTracks(video,list){
          var tracks=list||[], parent=video.parentElement, overlay=document.createElement('div'), settings=document.createElement('div');
          parent.style.position='relative'; overlay.className='neon-kawaii-caption'; overlay.style='position:absolute;left:4%;right:4%;bottom:9%;z-index:4;text-align:center;color:#fff;font-size:26px;font-weight:700;line-height:1.35;text-shadow:0 2px 4px #000,0 0 7px #000;pointer-events:none;direction:auto'; parent.appendChild(overlay);
          settings.dir='rtl'; settings.style='display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:7px;padding:7px 9px;background:rgba(7,10,18,.92);border:1px solid rgba(33,230,255,.3);color:#dce8f5;font:11px Arial';
          var label=document.createElement('span');label.textContent='الترجمة:';settings.appendChild(label);
          var langSelect=document.createElement('select');langSelect.title='اختيار لغة الترجمة';langSelect.style='background:#101827;color:#fff;border:1px solid #536078;padding:4px';
          var off=document.createElement('option');off.value='off';off.textContent='إيقاف';langSelect.appendChild(off);
          tracks.forEach(function(sub,i){var t=document.createElement('track'),lang=String(sub.lang||'').toLowerCase(),arabic=/(^|[^a-z])(ar|ara|arabic|العربية|عربي)([^a-z]|$)/i.test(lang);t.kind='subtitles';t.srclang=arabic?'ar':'en';t.label=arabic?'العربية':'English';t.default=false;t.src='/api/video/proxy?url='+encodeURIComponent(sub.url);video.appendChild(t);var opt=document.createElement('option');opt.value=String(i);opt.textContent=arabic?'العربية':'English';langSelect.appendChild(opt)});
          var sizeSelect=document.createElement('select');sizeSelect.title='حجم الخط';sizeSelect.style='background:#101827;color:#fff;border:1px solid #536078;padding:4px';[['18px','صغير'],['26px','متوسط'],['34px','كبير'],['44px','كبير جدًا']].forEach(function(x){var o=document.createElement('option');o.value=x[0];o.textContent='حجم '+x[1];if(x[0]==='26px')o.selected=true;sizeSelect.appendChild(o)});
          var colorSelect=document.createElement('select');colorSelect.title='لون الترجمة';colorSelect.style='background:#101827;color:#fff;border:1px solid #536078;padding:4px';[['#fff','أبيض'],['#ffe45c','أصفر'],['#69e7ff','سماوي'],['#ff91d7','وردي']].forEach(function(x){var o=document.createElement('option');o.value=x[0];o.textContent='لون '+x[1];colorSelect.appendChild(o)});
          var posSelect=document.createElement('input');posSelect.type='range';posSelect.min='5';posSelect.max='85';posSelect.value='9';posSelect.title='حرّك الترجمة عموديًا';posSelect.setAttribute('aria-label','موضع الترجمة');posSelect.style='width:110px;accent-color:#21e6ff';var posLabel=document.createElement('span');posLabel.textContent='موضع 9%';
          settings.appendChild(langSelect);settings.appendChild(sizeSelect);settings.appendChild(colorSelect);settings.appendChild(posLabel);settings.appendChild(posSelect);parent.appendChild(settings);
          var current=tracks.length?'0':'off';
          function render(){var idx=parseInt(current,10),track=video.textTracks&&video.textTracks[idx],cues=track&&track.activeCues;overlay.textContent='';if(current!=='off'&&cues&&cues.length){for(var i=0;i<cues.length;i++){var line=document.createElement('div');line.textContent=String(cues[i].text||'').replace(/<[^>]+>/g,'');overlay.appendChild(line)}}}
          function choose(value){current=value;for(var i=0;i<(video.textTracks||[]).length;i++)video.textTracks[i].mode='hidden';if(current!=='off'&&video.textTracks[Number(current)])video.textTracks[Number(current)].mode='hidden';render()}
          langSelect.value=current;langSelect.onchange=function(){choose(this.value)};sizeSelect.onchange=function(){overlay.style.fontSize=this.value};colorSelect.onchange=function(){overlay.style.color=this.value};posSelect.oninput=function(){overlay.style.bottom=this.value+'%';posLabel.textContent='موضع '+this.value+'%'};
          Array.prototype.forEach.call(video.textTracks||[],function(t){t.mode='hidden';t.addEventListener('cuechange',render)});video.addEventListener('timeupdate',render);video.addEventListener('loadedmetadata',render);choose(current);
        }
        function mount(){
          if(busy||location.pathname.indexOf('/watch/')!==0)return;
          var box=document.querySelector('.player-frame');if(!box||box.querySelector('[data-neon-kawaii-player]'))return;
          busy=true;var ep=decodeURIComponent(location.pathname.split('/').pop()||'');
          fetch('/x/kawaii/episode/'+encodeURIComponent(ep)+'/sources').then(function(r){return r.ok?r.json():[]}).then(function(list){
            var source=(list||[]).find(function(x){return x.provider==='Kawaii Direct'&&x.url});if(!source){busy=false;return;}
            var v=document.createElement('video');v.setAttribute('data-neon-kawaii-player','1');v.className='video-player';v.controls=true;v.playsInline=true;v.setAttribute('webkit-playsinline','true');v.preload='metadata';v.src='/api/video/proxy?url='+encodeURIComponent(source.url);v.style='display:block;width:100%;aspect-ratio:16/9;background:#000';addTracks(v,source.subtitles);
            var old=box.querySelector('iframe,.player-placeholder,video');if(old)old.replaceWith(v);else box.appendChild(v);busy=false;
          }).catch(function(){busy=false});
        }
        mount();new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});setInterval(mount,1200);
      })();</script>`;
      const witcherHomeEnhance = `<script>(function(){
        if (localStorage.getItem('neonflix-source') !== 'witcher') return;
        var SHOWN_KEY = 'neonflix:shown-suggestions';
        var getShown = function(){ try { return JSON.parse(localStorage.getItem(SHOWN_KEY) || '[]'); } catch(e){ return []; } };
        var setShown = function(arr){ try { localStorage.setItem(SHOWN_KEY, JSON.stringify(arr.slice(-30))); } catch(e){} } ;
        var rememberShown = function(id){ if (!id) return; var arr = getShown(); if (arr.indexOf(String(id)) < 0) arr.push(String(id)); setShown(arr); };

        function injectCSS(){
          if (document.getElementById('we-style')) return;
          var css = ''
            + '.we-rail{margin:32px auto 0;max-width:1180px;padding:0 20px}'
            + '.we-rail-inner{border:1px solid rgba(0,229,255,.22);background:linear-gradient(180deg,rgba(0,229,255,.05),transparent);padding:18px}'
            + '.we-rail-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;direction:rtl}'
            + '.we-rail-head h2{margin:0;font-size:18px;color:#f1f4fb}'
            + '.we-rail-head small{color:#78839a;font-size:11px}'
            + '.we-rail-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px}'
            + '.we-ep-card{display:flex;gap:10px;padding:8px;border:1px solid rgba(255,255,255,.07);background:rgba(5,8,15,.6);text-decoration:none;color:inherit;direction:rtl;transition:border-color .2s,background .2s}'
            + '.we-ep-card:hover{border-color:rgba(255,42,191,.55);background:rgba(255,42,191,.06)}'
            + '.we-ep-thumb{flex:0 0 64px;aspect-ratio:3/4;background:#0b0e17 center/cover no-repeat;border:1px solid rgba(0,229,255,.18)}'
            + '.we-ep-info{flex:1;min-width:0}'
            + '.we-ep-info b{display:block;font-size:12px;color:#f1f4fb;margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
            + '.we-ep-info span{display:block;font-size:10px;color:#73f7ff}'
            + '.we-ep-info em{display:block;font-size:10px;color:#57f5a6;margin-top:2px;font-style:normal}'
            + '.we-history{margin-top:14px;padding:10px 14px;border:1px dashed rgba(255,42,191,.35);background:rgba(255,42,191,.05);direction:rtl;font-size:11px;color:#ffe1f4}'
            + '.we-history b{color:#fff}'
            + '.we-history button{float:left;background:transparent;border:1px solid rgba(255,42,191,.45);color:#ff7ad6;padding:3px 9px;font-size:10px;cursor:pointer}'
            + '.we-spin{display:inline-block;width:14px;height:14px;border:2px solid rgba(0,229,255,.3);border-top-color:#21e6ff;border-radius:50%;animation:we-spin 0.9s linear infinite;vertical-align:middle}'
            + '@keyframes we-spin{to{transform:rotate(360deg)}}';
          var s = document.createElement('style');
          s.id = 'we-style';
          s.textContent = css;
          document.head.appendChild(s);
        }

        function buildRail(items){
          var grid = document.createElement('div');
          grid.className = 'we-rail-grid';
          items.forEach(function(it){
            var a = document.createElement('a');
            a.className = 'we-ep-card';
            var url = '/watch/' + encodeURIComponent(it.episodeId) +
              '?title=' + encodeURIComponent(it.episodeTitle || ('الحلقة ' + it.episodeNumber)) +
              '&anime=' + encodeURIComponent(it.animeTitle) +
              '&contentId=' + encodeURIComponent(it.animeId);
            a.href = url;
            var thumb = it.episodeImage || it.animePoster;
            var style = thumb ? 'background-image:url(' + String(thumb).replace(/"/g,'%22') + ')' : '';
            a.innerHTML = ''
              + '<div class="we-ep-thumb" style="' + style + '"></div>'
              + '<div class="we-ep-info">'
              +   '<b>' + (it.animeTitle || '—') + '</b>'
              +   '<span>الحلقة ' + (it.episodeNumber || '?') + ' · ' + (it.animeYear || '—') + '</span>'
              +   '<em>إجمالي ' + (it.totalEpisodes || '?') + ' حلقة</em>'
              + '</div>';
            grid.appendChild(a);
          });
          return grid;
        }

        function loadRecentEpisodes(){
          var wrap = document.getElementById('we-rail-wrap');
          if (!wrap) return;
          wrap.innerHTML = '<div class="we-rail-inner" style="text-align:center;color:#73f7ff"><span class="we-spin"></span> جاري جلب آخر الحلقات...</div>';
          fetch('/api/witcher/recent-episodes?limit=12').then(function(r){return r.ok?r.json():null}).then(function(list){
            if (!wrap) return;
            wrap.innerHTML = '';
            if (!Array.isArray(list) || !list.length){
              wrap.innerHTML = '<div class="we-rail-inner" style="text-align:center;color:#78839a;font-size:12px">لا توجد حلقات متاحة الآن في أنمي ويتشر.</div>';
              return;
            }
            var inner = document.createElement('div');
            inner.className = 'we-rail-inner';
            var head = document.createElement('div');
            head.className = 'we-rail-head';
            head.innerHTML = '<div><small style="color:#73f7ff;font-size:10px;letter-spacing:.08em">WITCHER · LIVE FEED</small><h2>آخر الحلقات المضافة</h2></div><button id="we-refresh" style="background:transparent;border:1px solid rgba(0,229,255,.45);color:#21e6ff;padding:6px 12px;font-size:10px;cursor:pointer">↻ تحديث</button>';
            inner.appendChild(head);
            inner.appendChild(buildRail(list));
            wrap.appendChild(inner);
            var btn = document.getElementById('we-refresh');
            if (btn) btn.onclick = function(){ loadRecentEpisodes(); };
          }).catch(function(){
            if (!wrap) return;
            wrap.innerHTML = '<div class="we-rail-inner" style="text-align:center;color:#ff8aa3;font-size:12px">تعذر جلب الحلقات. حاول مرة أخرى.</div>';
          });
        }

        function tryInjectRail(){
          if (location.pathname !== '/' && location.pathname !== '') return;
          if (document.getElementById('we-rail-wrap')) return;
          var anchor = document.querySelector('#explore');
          if (!anchor) return;
          injectCSS();
          var wrap = document.createElement('section');
          wrap.id = 'we-rail-wrap';
          wrap.className = 'we-rail';
          wrap.dir = 'rtl';
          anchor.parentNode.insertBefore(wrap, anchor);
          loadRecentEpisodes();
        }

        function tryInjectHistory(){
          var randomSection = document.getElementById('random');
          if (!randomSection || document.getElementById('we-history')) return;
          var shown = getShown();
          if (!shown.length) return;
          var box = document.createElement('div');
          box.id = 'we-history';
          box.className = 'we-history';
          box.innerHTML = '<b>سجل الاقتراحات:</b> ' + shown.length + ' أنمي شاهدته <button id="we-clear">مسح السجل</button>';
          randomSection.appendChild(box);
          var clr = document.getElementById('we-clear');
          if (clr) clr.onclick = function(){ setShown([]); box.remove(); };
        }

        function watchSuggested(){
          if (location.pathname !== '/' && location.pathname !== '') return;
          var observer = new MutationObserver(function(){
            var cards = document.querySelectorAll('.suggested-card-container a[href^="/anime/"]');
            cards.forEach(function(a){
              var m = (a.getAttribute('href') || '').match(/\/anime\/([^/?]+)/);
              if (m) rememberShown(decodeURIComponent(m[1]));
            });
            tryInjectRail();
            tryInjectHistory();
          });
          observer.observe(document.body, { childList: true, subtree: true });
          setTimeout(tryInjectRail, 250);
          setTimeout(tryInjectHistory, 500);
        }

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', watchSuggested);
        } else {
          watchSuggested();
        }
      })();</script>`;

            const episodeNavigation = `<script>(function(){
        if(location.pathname.indexOf('/watch/')!==0)return;
        var tries=0, attached=false;
        function go(ep, anime, cid){ if(!ep)return; var u='/watch/'+encodeURIComponent(ep.id)+'?title='+encodeURIComponent(ep.title||('الحلقة '+ep.number))+'&anime='+encodeURIComponent(anime||'')+'&contentId='+encodeURIComponent(cid||''); location.assign(u); }
        function boot(){
          var q=new URLSearchParams(location.search),anime=q.get('anime')||'',title=q.get('title')||'',cid=q.get('contentId')||'',eid=decodeURIComponent(location.pathname.split('/').pop()||''),mode=localStorage.getItem('neonflix-source')||'cluster';
          var num=((title.match(/[0-9]+/)||[])[0]||'');
          var endpoint=mode==='witcher'?'/api/witcher/resolve?title='+encodeURIComponent(anime)+'&number='+encodeURIComponent(num)+'&id='+encodeURIComponent(cid):'/api/anime/resolve?title='+encodeURIComponent(anime)+'&id='+encodeURIComponent(cid);
          fetch(endpoint).then(function(r){return r.ok?r.json():null}).then(function(x){
            if(!x)return null;
            var sid=mode==='witcher'?(x.animeId||x.id||anime):(x.id||cid),current=mode==='witcher'?(x.episodeId||eid):eid;
            return fetch((mode==='witcher'?'/api/witcher/':'/api/anime/')+encodeURIComponent(sid)+'/seasons').then(function(r){return r.ok?r.json():[]}).then(function(seasons){return {seasons:Array.isArray(seasons)?seasons:[],sid:sid,current:String(current)}});
          }).then(function(data){
            if(!data)return;
            var eps=[];(data.seasons||[]).forEach(function(season){(season.episodes||[]).forEach(function(ep){eps.push(ep)})});
            var i=eps.findIndex(function(ep){return String(ep.id)===data.current}); if(i<0)i=eps.findIndex(function(ep){return num&&String(ep.number)===num});
            var frame=document.querySelector('.player-frame');
            if(!frame||i<0){if(tries++<40)setTimeout(boot,300);return;}
            var old=document.querySelector('.episode-navigation');if(old)old.remove();
            var box=document.createElement('div');box.className='episode-navigation';box.dir='rtl';box.style='display:flex;gap:10px;margin:12px 0;padding:10px;border:1px solid rgba(0,229,255,.25);background:rgba(5,8,15,.85)';
            function add(label,ep){var b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=!ep;b.style='flex:1;padding:11px;border:1px solid '+(ep?'#21e6ff':'#435064')+';background:transparent;color:'+(ep?'#fff':'#687386')+';cursor:'+(ep?'pointer':'not-allowed');if(ep)b.onclick=function(){go(ep,anime,data.sid)};box.appendChild(b)}
            add('‹ الحلقة السابقة',eps[i-1]);add('الحلقة التالية ›',eps[i+1]);frame.parentNode.insertBefore(box,frame.nextSibling);attached=true;
          }).catch(function(){if(tries++<40)setTimeout(boot,300)});
        }
        function wireSelector(){
          var selects=document.querySelectorAll('.watch-selectors select'); if(!selects.length)return;
          var select=selects[selects.length-1]; if(select.dataset.neonEpisodeNav==='1')return; select.dataset.neonEpisodeNav='1';
          select.addEventListener('change',function(){var option=select.options[select.selectedIndex];var q=new URLSearchParams(location.search);go({id:select.value,title:option&&option.textContent||('الحلقة '+select.value),number:select.value},q.get('anime')||'',q.get('contentId')||'')});
        }
        boot();wireSelector();new MutationObserver(function(){wireSelector();if(!document.querySelector('.episode-navigation')&&!attached){tries=0;boot()}}).observe(document.documentElement,{childList:true,subtree:true});
      })();</script>`;
      const historyNavigation = `<script>(function(){
function input(){var q=new URLSearchParams(location.search),anime=q.get('anime')||'',title=q.get('title')||'الحلقة',cid=q.get('contentId')||'',eid=decodeURIComponent(location.pathname.split('/').pop()||'');return {contentId:cid,animeTitle:anime,episodeId:eid,episodeTitle:title}}
function save(){if(location.pathname.indexOf('/watch/')!==0)return;var p=input();if(!p.animeTitle||!p.episodeId)return;var body=encodeURIComponent(JSON.stringify({json:p}));fetch('/api/trpc/account.saveHistory?input='+body,{credentials:'include'}).catch(function(){})}
function links(){document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a.history-row');if(!a)return;var href=a.getAttribute('href')||'';if(href.indexOf('/watch/')<0)return;e.preventDefault();var anime=a.getAttribute('data-anime')||a.dataset.anime||'';if(!anime){var t=a.textContent||'';anime=t.trim()}var u=href;if(anime)u+=(u.indexOf('?')>=0?'&':'?')+'anime='+encodeURIComponent(anime);location.assign(u)},true)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){save();links()});else{save();links()}
})();</script>`;
      const sourceFallback = `<script>(function(){
        if(location.pathname.indexOf('/watch/')!==0)return;var q=new URLSearchParams(location.search),cid=q.get('contentId')||'',anime=q.get('anime')||'',title=q.get('title')||'',mode=localStorage.getItem('neonflix-source')||'cluster',target=mode==='witcher'?'kawaii':mode==='kawaii'?'witcher':'witcher',num=(title.match(/(\d+)/)||[])[1]||'',eid=decodeURIComponent(location.pathname.split('/').pop()||'');
        function notice(text,button){var old=document.querySelector('.source-fallback-notice');if(old)return;var n=document.createElement('div');n.className='source-fallback-notice';n.dir='rtl';n.style='position:fixed;inset:0;z-index:99998;background:rgba(3,5,12,.88);display:flex;align-items:center;justify-content:center;color:#fff;font:16px Arial;text-align:center';n.innerHTML='<div style="max-width:420px;padding:25px;border:1px solid #21e6ff;background:#101421"><div>'+text+'</div>'+(button?'<button style="margin-top:15px;padding:9px 18px;background:#ff2abf;color:white;border:0;cursor:pointer">العودة للمصدر الآخر</button>':'')+'</div>';document.body.appendChild(n);if(button)n.querySelector('button').onclick=function(){localStorage.setItem('neonflix-source',target);location.reload()}}
        function currentSources(){if(mode==='kawaii'){return fetch('/api/kawaii/episode/'+encodeURIComponent(eid)+'/sources').then(function(r){return r.ok?r.json():[]}).catch(function(){return []})}if(mode!=='witcher'){var u='/api/episode/'+encodeURIComponent(eid)+'/sources';return fetch(u).then(function(r){return r.ok?r.json():[]}).catch(function(){return []})}var n=(title.match(/(\d+)/)||[])[1]||'';return fetch('/api/witcher/resolve?title='+encodeURIComponent(anime)+'&number='+encodeURIComponent(n)+'&id='+encodeURIComponent(cid)).then(function(r){return r.ok?r.json():null}).then(function(x){if(!x)return [];return fetch('/api/witcher/'+encodeURIComponent(x.animeId)+'/episode/'+encodeURIComponent(x.episodeId)+'/sources').then(function(r){return r.ok?r.json():[]})}).catch(function(){return []})}function findOther(){var search=target==='witcher'?'/api/witcher/search?q=':target==='kawaii'?'/api/kawaii/search?q=':'/api/anime/search?q=';return fetch(search+encodeURIComponent(anime)).then(function(r){return r.json()}).then(function(items){var list=Array.isArray(items)?items:[];var norm=function(v){return String(v||'').toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g,' ').replace(/\s+/g,' ').trim()};var wanted=norm(anime);var item=list.slice().sort(function(a,b){var an=norm(a.title||a.content_title||a.name),bn=norm(b.title||b.content_title||b.name),as=an===wanted?100:(an.indexOf(wanted)>=0||wanted.indexOf(an)>=0?60:0),bs=bn===wanted?100:(bn.indexOf(wanted)>=0||wanted.indexOf(bn)>=0?60:0);return bs-as})[0];if(!item)return null;var sid=item.id;var seasons=target==='witcher'?'/api/witcher/'+encodeURIComponent(sid)+'/seasons':target==='kawaii'?'/api/kawaii/'+encodeURIComponent(sid)+'/seasons':'/api/anime/'+encodeURIComponent(sid)+'/seasons';return fetch(seasons).then(function(r){return r.json()}).then(function(ss){var eps=[];(ss||[]).forEach(function(s){eps=eps.concat(s.episodes||[])});var ep=eps.find(function(e){return num&&String(e.number)===String(num)})||eps[0];return ep?{id:sid,episode:ep}:null})})}
        currentSources().then(function(list){if(Array.isArray(list)&&list.some(function(s){return s.watchable!==false&&s.url}))return;var guard='neonflix-fallback:'+mode+':'+cid+':'+location.pathname.split('/').pop();if(sessionStorage.getItem(guard)){notice('لم يتم العثور على الحلقة في أي من المصدرين.',true);return}sessionStorage.setItem(guard,'1');notice('لم يتم العثور على الحلقة في '+(mode==='witcher'?'Anime Witcher':mode==='kawaii'?'Anime Kawaii':'Anime Cluster')+'، جاري البحث في المصدر الآخر...');return findOther().then(function(found){if(!found){notice('لم يتم العثور على الحلقة في أي من المصدرين.',true);return}localStorage.setItem('neonflix-source',target);var u='/watch/'+encodeURIComponent(found.episode.id)+'?title='+encodeURIComponent(found.episode.title||title)+'&anime='+encodeURIComponent(anime)+'&contentId='+encodeURIComponent(found.id);location.replace(u)}).catch(function(){notice('تعذر العثور على الحلقة في المصدر الآخر.',true)})});
      })();</script>`;
      const legacyContext = `<script>(function(){if(location.pathname.indexOf('/watch/')!==0)return;var q=new URLSearchParams(location.search);if(q.get('contentId')||!q.get('anime'))return;var mode=localStorage.getItem('neonflix-source')||'cluster',u=mode==='witcher'?'/x/w/search?q=':'/x/content/search?q=';fetch(u+encodeURIComponent(q.get('anime'))).then(function(r){return r.json()}).then(function(a){var x=(a||[])[0];if(!x||!x.id)return;q.set('contentId',x.id);history.replaceState(null,'',location.pathname+'?'+q.toString());location.reload()}).catch(function(){})})();</script>`;

      // ───────────────────────────────────────────────────────────────────
      // Custom-link bridge — adds an always-visible input bar above the
      // player that lets the user paste ANY video URL and play it on the
      // in-site player. Calls /api/video/direct to resolve MF / PD / SF /
      // ST / m3u8 / mp4. Works without rebuilding the React bundle.
      // ───────────────────────────────────────────────────────────────────
      // ───────────────────────────────────────────────────────────────────
      // Poster fit fix — the suggestion card poster was being letterboxed
      // because the default CSS uses `object-fit: contain` against a
      // box that's wider than the typical 3:4 poster. Override with a
      // proper aspect ratio + cover so the image fills cleanly without
      // distortion.
      // ───────────────────────────────────────────────────────────────────
      const posterFixBridge = `<script>(function(){
        if (document.getElementById('pf-style')) return;
        var css = ''
          + '.suggested-card-container .anime-card-poster{height:auto!important;aspect-ratio:3/4!important;background:#05060a!important}'
          + '.suggested-card-container .anime-card-poster img{width:100%!important;height:100%!important;object-fit:cover!important;background:#05060a!important}'
          + '.suggested-card-container .anime-card-poster .poster-scanline{position:absolute!important;inset:0!important;pointer-events:none!important}'
          + '.random-panel .anime-card{width:100%!important;max-width:240px!important}';
        var s = document.createElement('style');
        s.id = 'pf-style';
        s.textContent = css;
        document.head.appendChild(s);
      })();</script>`;

      const favoriteRepairBridge = `<script>(function(){
        if(location.pathname.indexOf('/anime/')!==0)return;
        function input(){var id=decodeURIComponent(location.pathname.split('/anime/')[1]||'');var h=document.querySelector('h1');var img=document.querySelector('.details-poster img');return {contentId:id,title:h&&h.textContent.trim()||id,poster:img&&img.src||null};}
        function wire(){document.querySelectorAll('button').forEach(function(btn){if(!/المفضلة/.test(btn.textContent||'')||btn.dataset.neonFavorite==='1')return;btn.dataset.neonFavorite='1';btn.addEventListener('click',function(e){e.preventDefault();e.stopImmediatePropagation();var remove=/في المفضلة|إزالة|حذف/.test(btn.textContent||'');var data=input();var proc=remove?'account.removeFavorite':'account.addFavorite';var payload=remove?{contentId:data.contentId}:data;fetch('/api/trpc/'+proc,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({json:payload})}).then(function(r){if(!r.ok)throw new Error(r.status===401?'يجب تسجيل الدخول أولاً':'تعذر حفظ المفضلة');return r.json()}).then(function(){btn.textContent=remove?'حفظ في المفضلة':'في المفضلة';btn.dataset.neonFavorite='1'}).catch(function(err){btn.title=err.message;btn.textContent=err.message})},true)});}
        wire();new MutationObserver(wire).observe(document.documentElement,{childList:true,subtree:true});
      })();</script>`;
      const watchReliabilityBridge = `<script>(function(){
        if (location.pathname.indexOf('/watch/') !== 0) return;
        var progressKey = 'neonflix:watch-progress:' + location.pathname + ':' + (new URLSearchParams(location.search).get('contentId') || 'unknown');
        function save(v){ if(!v || !isFinite(v.currentTime) || v.currentTime < 1) return; try{ localStorage.setItem(progressKey, JSON.stringify({time:v.currentTime,duration:isFinite(v.duration)?v.duration:0,savedAt:Date.now()})); }catch(e){} }
        function restore(v){ if(!v) return; try{ var x=JSON.parse(localStorage.getItem(progressKey)||'null'); if(x && isFinite(x.time) && x.time>=3 && (!isFinite(v.duration)||!v.duration||x.time<v.duration-5)){ var set=function(){try{v.currentTime=x.time;}catch(e){}}; if(v.readyState>=1)set(); else v.addEventListener('loadedmetadata',set,{once:true}); } }catch(e){} }
        function tryNextServer(){
          var rows = Array.from(document.querySelectorAll('.watch-sources-section .source-row'));
          var activeIdx = rows.findIndex(function(r){ return r.classList.contains('source-active'); });
          if (activeIdx >= 0 && activeIdx < rows.length - 1) {
            var nextBtn = rows[activeIdx + 1].querySelector('button.source-select');
            if (nextBtn) { nextBtn.click(); return true; }
          }
          return false;
        }
        function wire(){
          document.querySelectorAll('.player-frame video').forEach(function(v){
            if(v.dataset.neonProgress==='1') return;
            v.dataset.neonProgress='1';
            v.addEventListener('loadedmetadata',function(){restore(v)});
            v.addEventListener('timeupdate',function(){save(v)});
            v.addEventListener('pause',function(){save(v)});
            v.addEventListener('seeking',function(){save(v)});
            v.addEventListener('error',function(){ setTimeout(tryNextServer, 400); });
            restore(v);
          });
          document.querySelectorAll('.watch-sources-section .source-row').forEach(function(row){
            if(/streamtape|\bST\b/i.test(row.textContent||'')) row.dataset.neonSt='1';
          });
          var list=document.querySelector('.watch-sources-section .source-list');
          if(list && !list.dataset.neonSorted){
            list.dataset.neonSorted='1'; Array.from(list.children).sort(function(a,b){return (b.dataset.neonSt==='1')-(a.dataset.neonSt==='1');}).forEach(function(x){list.appendChild(x)});
          }
        }
        window.addEventListener('pagehide',function(){document.querySelectorAll('.player-frame video').forEach(save)});
        window.addEventListener('beforeunload',function(){document.querySelectorAll('.player-frame video').forEach(save)});
        document.addEventListener('visibilitychange',function(){if(document.hidden)document.querySelectorAll('.player-frame video').forEach(save)});
        var n=0; function tick(){wire();if(n++<80)setTimeout(tick,250)} tick();
        new MutationObserver(wire).observe(document.documentElement,{childList:true,subtree:true});
      })();</script>`;
      const customLinkBridge = `<script>(function(){
        if (location.pathname.indexOf('/watch/') !== 0) return;
        var css = ''
          + '.cl-bar{display:flex;align-items:center;gap:9px;padding:11px 14px;background:linear-gradient(90deg,rgba(255,42,191,.12),rgba(0,229,255,.08));border-block:1px solid rgba(0,229,255,.28);direction:rtl;flex-wrap:wrap;font:600 12px "IBM Plex Sans Arabic",Arial,sans-serif}'
          + '.cl-bar svg{color:#21e6ff;flex:0 0 auto}'
          + '.cl-bar-label{color:#ffe1f4;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}'
          + '.cl-input{flex:1 1 220px;min-width:200px;height:36px;padding:0 11px;background:rgba(5,8,15,.85);border:1px solid rgba(0,229,255,.35);color:#f3f6ff;font-family:monospace;font-size:12px}'
          + '.cl-input::placeholder{color:rgba(155,181,194,.65)}'
          + '.cl-input:focus{outline:none;border-color:#21e6ff;box-shadow:0 0 0 2px rgba(0,229,255,.18)}'
          + '.cl-btn{height:36px;padding:0 13px;background:#ff2abf;color:#fff;border:0;cursor:pointer;font-size:11px;font-weight:700;letter-spacing:.03em}'
          + '.cl-btn:hover{background:#ff5acf}'
          + '.cl-btn:disabled{opacity:.5;cursor:wait}'
          + '.cl-reset{background:transparent!important;color:#21e6ff!important;border:1px solid rgba(0,229,255,.35)!important}'
          + '.cl-error{padding:8px 14px;color:#ff8aa3;font-size:11px;background:rgba(255,42,191,.07);border-block-end:1px solid rgba(255,42,191,.18);direction:rtl}'
          + '.cl-meta{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:8px 14px;color:#b5e0ea;font-size:11px;background:rgba(0,229,255,.06);border-block-end:1px solid rgba(0,229,255,.18);direction:rtl}'
          + '.cl-meta b{color:#fff}'
          + '.cl-meta .dot{color:rgba(255,255,255,.35)}'
          + '.cl-meta a{display:inline-flex;align-items:center;gap:4px;color:#21e6ff;font-weight:600;text-decoration:none;margin-inline-start:auto}'
          + '.cl-meta a:hover{color:#fff;text-decoration:underline}'
          + '.cl-badge{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;background:rgba(255,42,191,.22);border:1px solid rgba(255,42,191,.5);color:#ffe1f4;font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}'
          + '@media (max-width:720px){.cl-bar{gap:6px;padding:9px}.cl-bar-label{width:100%;font-size:10px}.cl-input{flex-basis:100%}}';
        if (!document.getElementById('cl-style')) {
          var s = document.createElement('style');
          s.id = 'cl-style';
          s.textContent = css;
          document.head.appendChild(s);
        }

        function esc(s){var str=String(s==null?'':s);return str.replace(/[&<>]/g,function(c){return c==='&'?'&amp;':c==='<'?'&lt;':'&gt;'}).replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
        function findFrame(){return document.querySelector('.player-frame')}
        function progressKey(){var q=new URLSearchParams(location.search),a=(q.get('anime')||'').toLowerCase().replace(/\s+/g,' ').trim(),t=q.get('title')||'',n=(t.match(/(\d+)/)||[])[1]||'0';return 'neonflix:watch-progress:shared:'+a+':'+n}
        function savePlayerProgress(player){if(!player||!Number.isFinite(player.currentTime)||player.currentTime<1)return;try{localStorage.setItem(progressKey(),JSON.stringify({time:player.currentTime,duration:Number(player.duration)||0,savedAt:Date.now()}))}catch(e){}}
        function restorePlayerProgress(player){if(!player)return;try{var x=JSON.parse(localStorage.getItem(progressKey())||'null');if(!x||!Number.isFinite(x.time)||x.time<3)return;var apply=function(){var d=Number(player.duration)||0;if(!d||x.time<d-5)player.currentTime=x.time};if(player.readyState>=1)apply();else player.addEventListener('loadedmetadata',apply,{once:true})}catch(e){}}
        function findTopline(frame){return frame && frame.querySelector('.player-topline')}

        function clearCustom(frame){
          var custom = frame.querySelector('.cl-custom-player');
          if (custom) custom.remove();
          frame.querySelectorAll('.cl-original-player').forEach(function(el){
            el.classList.remove('cl-original-player');
            el.style.display = '';
          });
          var ph = frame.querySelector('.player-placeholder');
          if (ph) ph.style.display = '';
          var meta = frame.querySelector('.cl-meta'); if (meta){meta.style.display='none';meta.innerHTML='';}
          var err = frame.querySelector('.cl-error'); if (err){err.style.display='none';err.textContent='';}
          var rb = frame.querySelector('.cl-reset'); if (rb) rb.remove();
        }

        function showError(frame, msg){
          var err = frame.querySelector('.cl-error');
          if (!err) return;
          err.textContent = msg;
          err.style.display = 'block';
        }

        function renderPlayer(frame, d){
          var reactVideo = frame.querySelector('video.video-player');
          var reactIframe = frame.querySelector('iframe.embed-player');
          var placeholder = frame.querySelector('.player-placeholder');
          if (reactVideo && !reactVideo.classList.contains('cl-original-player')){
            reactVideo.classList.add('cl-original-player');
            reactVideo.style.display = 'none';
          }
          if (reactIframe && !reactIframe.classList.contains('cl-original-player')){
            reactIframe.classList.add('cl-original-player');
            reactIframe.style.display = 'none';
          }
          if (placeholder) placeholder.style.display = 'none';
          var prev = frame.querySelector('.cl-custom-player');
          if (prev) prev.remove();

          var player;
          if (d.direct){
            player = document.createElement('video');
            player.className = 'video-player cl-custom-player';
            player.controls = true;
            player.playsInline = true;
            player.setAttribute('webkit-playsinline','true');
            player.src = d.url;
            player.style.cssText = 'display:block;width:100%;max-height:650px;aspect-ratio:16/9;background:#020305';
            player.addEventListener('loadedmetadata', function(){restorePlayerProgress(player)});
            player.addEventListener('timeupdate', function(){savePlayerProgress(player)});
            player.addEventListener('pause', function(){savePlayerProgress(player)});
            player.addEventListener('ended', function(){try{localStorage.removeItem(progressKey())}catch(e){}});
            window.addEventListener('pagehide', function(){savePlayerProgress(player)}, {once:false});
            document.addEventListener('visibilitychange', function(){if(document.visibilityState==='hidden')savePlayerProgress(player)}, {once:false});
            player.onerror = function(){ showError(frame, 'تعذر تشغيل الرابط المباشر. جرّب مصدرًا آخر.'); };
          } else if (d.embedUrl){
            player = document.createElement('iframe');
            player.className = 'embed-player cl-custom-player';
            player.src = d.embedUrl;
            player.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
            player.style.cssText = 'display:block;width:100%;min-height:520px;border:0;background:#05070d';
          } else {
            showError(frame, 'لا توجد صيغة قابلة للتشغيل لهذا الرابط.');
            return;
          }

          var meta = frame.querySelector('.cl-meta');
          if (meta && meta.nextSibling) frame.insertBefore(player, meta.nextSibling);
          else frame.appendChild(player);
        }

        function showMeta(frame, d){
          var meta = frame.querySelector('.cl-meta');
          if (!meta) return;
          meta.innerHTML = '';
          meta.style.display = 'flex';
          var prov = document.createElement('span');
          prov.innerHTML = 'المزود: <b>' + esc(d.provider) + '</b>';
          meta.appendChild(prov);
          var dot1 = document.createElement('span'); dot1.className = 'dot'; dot1.textContent = '•';
          meta.appendChild(dot1);
          var kind = document.createElement('span');
          kind.textContent = d.direct ? 'تشغيل مباشر' : 'إطار مضمّن';
          meta.appendChild(kind);
          if (d.hint){
            var dot2 = document.createElement('span'); dot2.className = 'dot'; dot2.textContent = '•';
            meta.appendChild(dot2);
            var hint = document.createElement('span'); hint.textContent = d.hint;
            meta.appendChild(hint);
          }
          if (!d.direct && d.embedUrl){
            var a1 = document.createElement('a');
            a1.href = d.embedUrl; a1.target = '_blank'; a1.rel = 'noreferrer';
            a1.textContent = 'فتح في تبويب جديد ›';
            meta.appendChild(a1);
          }
          if (d.direct){
            var a2 = document.createElement('a');
            a2.href = d.url; a2.target = '_blank'; a2.rel = 'noreferrer';
            a2.textContent = '⬇ تحميل مباشر';
            a2.download = '';
            meta.appendChild(a2);
          }
          if (!frame.querySelector('.cl-reset')){
            var rb = document.createElement('button');
            rb.type = 'button';
            rb.className = 'cl-btn cl-reset';
            rb.textContent = '✕ إلغاء';
            rb.style.marginInlineStart = '8px';
            rb.onclick = function(){
              var inp = frame.querySelector('.cl-input');
              if (inp) inp.value = '';
              clearCustom(frame);
            };
            var bar = frame.querySelector('.cl-bar');
            if (bar) bar.appendChild(rb);
          }
        }

        function inject(){
          var frame = findFrame();
          if (!frame) return;
          if (frame.querySelector('.cl-bar')) return;

          var bar = document.createElement('div');
          bar.className = 'cl-bar';
          bar.dir = 'rtl';
          bar.innerHTML = ''
            + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h0"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/></svg>'
            + '<span class="cl-bar-label">خدعة الرابط المخصّص</span>'
            + '<input type="text" class="cl-input" placeholder="الصق أي رابط (mp4, m3u8, MediaFire, PixelDrain, StreamTape, StreamFiles…)" spellcheck="false" />'
            + '<button type="button" class="cl-btn cl-play">▶ تشغيل</button>';

          var errorBox = document.createElement('div');
          errorBox.className = 'cl-error';
          errorBox.style.display = 'none';

          var metaBox = document.createElement('div');
          metaBox.className = 'cl-meta';
          metaBox.style.display = 'none';

          var topline = findTopline(frame);
          if (topline){
            var ref = topline.nextSibling;
            frame.insertBefore(bar, ref);
            frame.insertBefore(errorBox, bar.nextSibling);
            frame.insertBefore(metaBox, errorBox.nextSibling);
          } else {
            frame.insertBefore(bar, frame.firstChild);
            frame.insertBefore(errorBox, bar.nextSibling);
            frame.insertBefore(metaBox, errorBox.nextSibling);
          }

          var input = bar.querySelector('.cl-input');
          var playBtn = bar.querySelector('.cl-play');

          async function play(){
            var raw = (input.value || '').trim();
            if (!raw){ showError(frame, 'ألصق رابطًا صالحًا أولاً.'); return; }
            if (!/^https?:/i.test(raw) || !/^https?:\\/\\//i.test(raw)){ showError(frame, 'الرابط يجب أن يبدأ بـ http:// أو https://'); return; }
            playBtn.disabled = true;
            playBtn.textContent = '⏳ جاري التحليل…';
            errorBox.style.display = 'none';
            try {
              var r = await fetch('/api/video/direct?url=' + encodeURIComponent(raw));
              var d = await r.json().catch(function(){ return null; });
              if (!r.ok || !d || !d.ok){ throw new Error((d && d.error) || ('HTTP ' + r.status)); }
              showMeta(frame, d);
              renderPlayer(frame, d);
            } catch (e){
              showError(frame, e && e.message ? e.message : 'تعذر معالجة الرابط.');
            } finally {
              playBtn.disabled = false;
              playBtn.textContent = '▶ تشغيل';
            }
          }

          playBtn.onclick = play;
          input.addEventListener('keydown', function(e){ if (e.key === 'Enter') play(); });
        }

        // Inject whenever the player-frame appears or its children change.
        var tries = 0;
        function tick(){
          inject();
          tries++;
          if (tries < 60) setTimeout(tick, 250);
        }
        tick();
        new MutationObserver(inject).observe(document.documentElement, { childList: true, subtree: true });
      })();</script>`;

      res.type("html").send(html.replace("</body>", `${localAuthBridge}${aliasBridge}${sourceBridge}${witcherEnhance}${kawaiiEnhance}${witcherHomeEnhance}${episodeNavigation}${historyNavigation}${sourceFallback}${legacyContext}${posterFixBridge}${favoriteRepairBridge}${watchReliabilityBridge}${customLinkBridge}</body>`));
    } else {
      res.status(404).send("مجلد dist غير موجود");
    }
  });

  app.listen(port, "0.0.0.0", () => {
    console.log(`[DASHBOARD] ⚡ تم تشغيل المنصة بنجاح على المنفذ: ${port}`);
    console.log(`[DASHBOARD] 🌐 افتح الموقع في المتصفح عبر: http://localhost:${port}`);
  });
  if (port !== 24702) {
    try {
      app.listen(24702, "0.0.0.0", () => {
        console.log(`[DASHBOARD] ⚡ يعمل أيضاً على: http://localhost:24702`);
      }).on("error", () => {});
    } catch (_) {}
  }
};

if (typeof require !== "undefined" && require.main === module) {
  module.exports();
}

