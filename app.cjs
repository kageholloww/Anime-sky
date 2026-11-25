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
const witcherCache = {
  keysAt: 0,
  latest: null,
  latestAt: 0,
  popular: null,
  popularAt: 0,
};

async function witcherRefreshKeys() {
  if (Date.now() - witcherCache.keysAt < 5 * 60_000) return;
  try {
    const settings = await witcherFetch(wfDocUrl("Settings/constants"));
    const root = settings?.fields || {};
    const search = wfMap(root.search_settings);
    if (wfString(search.api_key)) WITCHER.algoliaApiKey = wfString(search.api_key);
    if (wfString(search.app_id_v3) || wfString(search.app_id)) WITCHER.algoliaAppId = wfString(search.app_id_v3) || wfString(search.app_id);
    witcherCache.keysAt = Date.now();
  } catch (_) {}
}
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
  if (witcherCache.latest && Date.now() - witcherCache.latestAt < 60_000) {
    return witcherCache.latest.slice(0, limit);
  }
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

  const normalized = items.slice(0, limit).map(hit => {
    if (!hit.id) {
      const card = witcherCard(hit);
      card.episodes = String(hit.episodes_count || card.episodes || "");
      card.totalSeasons = String(hit.seasons_count || "");
      card.lastUpdated = pickDateMs(hit) || null;
      return card;
    }
    hit.episodes = hit.episodes || "";
    hit.totalSeasons = hit.totalSeasons || "";
    return hit;
  });
  if (normalized.length) {
    witcherCache.latest = normalized;
    witcherCache.latestAt = Date.now();
  }
  return normalized;
}

async function witcherPopular(limit = 24) {
  if (witcherCache.popular && Date.now() - witcherCache.popularAt < 120_000) {
    return witcherCache.popular.slice(0, limit);
  }
  try {
    const items = await witcherSearch("", 0, Math.max(24, limit));
    const sorted = items.slice().sort((a, b) => parseRating(b.rating) - parseRating(a.rating));
    if (sorted.length) {
      witcherCache.popular = sorted;
      witcherCache.popularAt = Date.now();
      return sorted.slice(0, limit);
    }
  } catch (_) {}
  return witcherLatest(limit);
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
async function witcherSeasons(id) {
  const item = await witcherLoad(id);
  return [{ id: `witcher-${item.id || id}`, title: "الموسم 1", number: 1, episodes: item.episodesList || [] }];
}
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
const KAWAII_LIST_QUERY = `query ($page:Int,$perPage:Int,$search:String,$genres:[String],$tags:[String],$sort:[MediaSort]) { Page(page:$page,perPage:$perPage) { pageInfo { currentPage lastPage hasNextPage total } media(type:ANIME,search:$search,genre_in:$genres,tag_in:$tags,sort:$sort,isAdult:false) { id idMal title { romaji english native } description coverImage { large extraLarge } genres tags { name } format status episodes duration season seasonYear averageScore popularity trending favourites startDate { year month day } endDate { year month day } studios(isMain:true) { edges { node { name } } } nextAiringEpisode { episode airingAt timeUntilAiring } } } }`;
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
const KAWAII_GENRE_MAP = {
  "أكشن":"Action", "اكشن":"Action",
  "مغامرات":"Adventure", "مغامرة":"Adventure",
  "كوميديا":"Comedy", "كوميدي":"Comedy",
  "دراما":"Drama",
  "خيال":"Fantasy",
  "رومانسي":"Romance", "رومنسي":"Romance",
  "رعب":"Horror",
  "غموض":"Mystery",
  "نفسي":"Psychological",
  "خيال علمي":"Sci-Fi",
  "رياضة":"Sports",
  "خارق للطبيعة":"Supernatural",
  "إيتشي":"Ecchi", "ايتشي":"Ecchi",
  "آلات / ميكا":"Mecha", "ميكا":"Mecha",
  "موسيقى":"Music",
  "شريحة من الحياة":"Slice of Life",
  "إثارة":"Thriller", "اثارة":"Thriller",
  "سحر":"Mahou Shoujo",
  "إيسيكاي":"TAG:Isekai", "ايسيكاي":"TAG:Isekai",
  "شونين":"TAG:Shounen",
  "شوجو":"TAG:Shoujo",
  "سينين":"TAG:Seinen",
  "مدرسي":"TAG:School",
  "شياطين":"TAG:Demons",
  "تاريخي":"TAG:Historical",
  "فنون قتال":"TAG:Martial Arts",
  "قوى خارقة":"TAG:Super Power",
  "حريم":"TAG:Harem",
  "مصاصي دماء":"TAG:Vampire",
  "جريمة":"TAG:Crime",
  "ألعاب مميتة":"TAG:Survival",
};
async function kawaiiSearch(q = "", limit = 24, genres = [], page = 1, customSort = null) {
  const mapped = (Array.isArray(genres) ? genres : String(genres || "").split(","))
    .map(String)
    .map(x => x.trim())
    .filter(Boolean)
    .map(x => KAWAII_GENRE_MAP[x] || x);
  const queryTags = mapped.filter(x => x.startsWith("TAG:")).map(x => x.slice(4));
  const queryGenres = mapped.filter(x => !x.startsWith("TAG:"));
  const sort = customSort || (q ? ["SEARCH_MATCH"] : (queryGenres.length || queryTags.length ? ["POPULARITY_DESC"] : ["TRENDING_DESC"]));
  const d = await kawaiiGraph(KAWAII_LIST_QUERY, {
    page: Math.max(1, Number(page) || 1),
    perPage: Math.min(50, Math.max(1, Number(limit) || 24)),
    search: String(q || "").trim() || undefined,
    genres: queryGenres.length ? queryGenres : undefined,
    tags: queryTags.length ? queryTags : undefined,
    sort,
  });
  const media = (d?.Page?.media || []).map(kawaiiCard).filter(x => x.id);
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

const animeifyCardCache = new Map();

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

  const card = {
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
  if (animeId && (a.AR_Title || a.EN_Title || a.Thumbnail)) {
    animeifyCardCache.set(animeId, card);
  }
  return card;
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

async function animeifyPopular(limit = 24) {
  try {
    const raw = await animeifyPost("anime/load_anime_list_v2.php", {
      UserId: "0",
      Language: "AR",
      FilterType: "",
      FilterData: "",
      Type: "SERIES",
      From: "0",
    });
    const results = Array.isArray(raw) ? raw : [];
    const sorted = results.slice().sort((a, b) => (parseFloat(b.Score || "0") || 0) - (parseFloat(a.Score || "0") || 0));
    return sorted.slice(0, limit).map(animeifyCard);
  } catch (err) {
    console.error("[Animefy Popular Error]", err.message);
    return animeifyLatest(limit);
  }
}

const ANIMEIFY_GENRE_RAW = {
  "أكشن": "Action",
  "مغامرات": "Adventure",
  "مغامرة": "Adventure",
  "كوميديا": "Comedy",
  "كوميدي": "Comedy",
  "دراما": "Drama",
  "خيال": "Fantasy",
  "رومانسي": "Romance",
  "رومنسي": "Romance",
  "غموض": "Mystery",
  "رعب": "Horror",
  "نفسي": "Psychological",
  "سيكولوجي": "Psychological",
  "إثارة": "Thriller",
  "شونين": "Shounen",
  "شوجو": "Shoujo",
  "سينين": "Seinen",
  "حريم": "Harem",
  "إيتشي": "Ecchi",
  "إيسيكاي": "Isekai",
  "سحر": "Magic",
  "شياطين": "Demons",
  "قوى خارقة": "Super Power",
  "خارق للطبيعة": "Supernatural",
  "خيال علمي": "Sci-Fi",
  "شريحة من الحياة": "Slice of Life",
  "مدرسي": "School",
  "رياضة": "Sports",
  "تاريخي": "Historical",
  "فنون قتال": "Martial Arts",
  "موسيقى": "Music",
  "آلات / ميكا": "Mecha",
  "آلات": "Mecha",
  "ميكا": "Mecha",
  "جريمة": "Crime",
  "مصاصي دماء": "Vampire",
  "ألعاب مميتة": "Survival",
};
const ANIMEIFY_GENRE_MAP = Object.fromEntries(
  Object.entries(ANIMEIFY_GENRE_RAW).map(([k, v]) => [normalizeGenreText(k), v])
);

async function animeifyByGenre(genre, limit = 30) {
  const norm = normalizeGenreText(genre);
  const enGenre = ANIMEIFY_GENRE_MAP[norm] || genre;
  try {
    const raw = await animeifyPost("anime/load_anime_list_v2.php", {
      UserId: "0",
      Language: "AR",
      FilterType: "GENRE",
      FilterData: enGenre,
      Type: "SERIES",
      From: "0",
    });
    const results = Array.isArray(raw) ? raw : [];
    if (results.length) {
      return results.slice(0, limit).map(animeifyCard);
    }
  } catch (err) {
    console.error("[Animefy Genre Error]", err.message);
  }
  // Fallback for tags like Isekai not directly returned under FilterType=GENRE
  try {
    const pool = [];
    for (let from = 0; from <= 40; from += 20) {
      const raw = await animeifyPost("anime/load_anime_list_v2.php", {
        UserId: "0",
        Language: "AR",
        FilterType: "",
        FilterData: "",
        Type: "SERIES",
        From: String(from),
      });
      if (Array.isArray(raw)) pool.push(...raw);
    }
    const target = normalizeGenreText(enGenre);
    const matched = pool.filter(item => {
      const gStr = normalizeGenreText(item.Genres || "");
      const plotStr = normalizeGenreText(item.Plot || "");
      return gStr.includes(target) || gStr.includes(norm) || (norm === "ايسيكاي" && /isekai|عالممختلف|عالماخر/.test(gStr + plotStr));
    });
    return matched.slice(0, limit).map(animeifyCard);
  } catch (_) {
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
    let cached = animeifyCardCache.get(String(animeId));
    if (!cached) {
      try {
        await animeifyLatest(30);
        cached = animeifyCardCache.get(String(animeId));
      } catch (_) {}
    }
    const card = cached ? { ...cached } : animeifyCard({ AnimeId: animeId, ...a });
    if (a.Plot) card.description = String(a.Plot).replace(/<[^>]+>/g, "").trim();
    return card;
  } catch (err) {
    console.error("[Animefy Details Error]", err.message);
    return animeifyCardCache.get(String(animeId)) || { id: animeId, title: "Animefy", source: "animeify" };
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

// ─── Nova Sources: AnimeCloud & FaselHD (unified with Anime Sky format) ───
const NOVA_BACKEND_BASE = process.env.NOVA_BACKEND_URL || "http://145.241.158.129:3112";
const NOVA_TMDB_KEY = process.env.TMDB_API_KEY || "41aabdf0ff57d0da39d248d16a1b211f";
const NOVA_TMDB_BASE = "https://api.themoviedb.org/3";
const NOVA_TMDB_IMG = "https://image.tmdb.org/t/p/w500";
const novaTmdbCache = new Map();

const TMDB_GENRE_AR = {
  10759: "أكشن",
  28: "أكشن",
  12: "مغامرات",
  16: "أنمي",
  35: "كوميديا",
  80: "جريمة",
  99: "وثائقي",
  18: "دراما",
  10751: "عائلي",
  14: "خيال",
  36: "تاريخي",
  27: "رعب",
  10402: "موسيقى",
  9648: "غموض",
  10749: "رومانسي",
  878: "خيال علمي",
  10765: "خيال",
  53: "إثارة",
  10752: "حرب",
  10768: "تاريخي",
};

const TMDB_AR_TO_TV_GENRE = {
  "اكشن": "10759",
  "مغامرات": "10759",
  "مغامرة": "10759",
  "كوميديا": "35",
  "كوميدي": "35",
  "دراما": "18",
  "خيال": "10765",
  "ايسيكاي": "10765",
  "سحر": "10765",
  "خارقللطبيعة": "10765",
  "خيالعلمي": "10765",
  "غموض": "9648",
  "رعب": "9648",
  "اثارة": "9648",
  "نفسي": "18",
  "رومانسي": "18",
  "رومنسي": "18",
  "شونين": "10759",
  "سينين": "18",
  "شوجو": "18",
  "مدرسي": "35",
  "شياطين": "10765",
  "قوىخارقة": "10759",
  "شريحةمنالحياة": "35",
  "جريمة": "80",
  "تاريخي": "10768",
  "موسيقى": "35",
  "حريم": "35",
  "ايتشي": "35",
  "الاتميكا": "10765",
  "فنونقتال": "10759",
  "رياضة": "35",
};

const TMDB_AR_TO_MOVIE_GENRE = {
  "اكشن": "28",
  "مغامرات": "12",
  "مغامرة": "12",
  "كوميديا": "35",
  "كوميدي": "35",
  "دراما": "18",
  "خيال": "14",
  "ايسيكاي": "14",
  "سحر": "14",
  "خارقللطبيعة": "14",
  "خيالعلمي": "878",
  "غموض": "9648",
  "رعب": "27",
  "اثارة": "53",
  "نفسي": "53",
  "رومانسي": "10749",
  "رومنسي": "10749",
  "جريمة": "80",
  "تاريخي": "36",
  "موسيقى": "10402",
  "شونين": "28",
  "سينين": "18",
  "شوجو": "10749",
};

function hasArabicText(value) {
  return /[\u0600-\u06FF]/.test(String(value || ""));
}

async function novaTmdbGet(endpoint, params = {}) {
  const query = new URLSearchParams({ api_key: NOVA_TMDB_KEY, ...params }).toString();
  const url = `${NOVA_TMDB_BASE}/${endpoint}?${query}`;
  const cached = novaTmdbCache.get(url);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.data;
  const { data } = await axios.get(url, { timeout: 12000 });
  if (novaTmdbCache.size > 300) {
    const firstKey = novaTmdbCache.keys().next().value;
    if (firstKey) novaTmdbCache.delete(firstKey);
  }
  novaTmdbCache.set(url, { data, at: Date.now() });
  return data;
}

function novaPrefixFor(sourceName) {
  return sourceName === "faselhd" ? "fh" : "ac";
}

function novaParseId(rawId, fallbackSource = "animecloud") {
  const raw = String(rawId || "").trim();
  const full = raw.match(/^(ac|fh)-(tv|movie)-(\d+)(?:-s(\d+)-e(\d+))?$/i);
  if (full) {
    return {
      source: full[1].toLowerCase() === "fh" ? "faselhd" : "animecloud",
      mediaType: full[2].toLowerCase(),
      tmdbId: full[3],
      season: Number(full[4] || 1),
      episode: Number(full[5] || 1),
    };
  }
  const numOnly = raw.match(/^(\d+)$/);
  if (numOnly) {
    return {
      source: fallbackSource,
      mediaType: "tv",
      tmdbId: numOnly[1],
      season: 1,
      episode: 1,
    };
  }
  return null;
}

function novaFormatBytes(size) {
  const num = Number(size);
  if (!Number.isFinite(num) || num <= 0) return String(size || "");
  if (num >= 1024 ** 3) return `${(num / 1024 ** 3).toFixed(2)} GB`;
  if (num >= 1024 ** 2) return `${Math.round(num / 1024 ** 2)} MB`;
  return `${Math.round(num / 1024)} KB`;
}

function novaCard(item = {}, mediaType = "tv", sourceName = "animecloud", enItem = null) {
  const prefix = novaPrefixFor(sourceName);
  const tmdbId = String(item.id || enItem?.id || "");
  const cardId = `${prefix}-${mediaType}-${tmdbId}`;
  const arTitle = String(item.title || item.name || "").trim();
  const enTitle = String(enItem?.title || enItem?.name || item.original_title || item.original_name || "").trim();
  const title = (hasArabicText(arTitle) ? arTitle : (enTitle || arTitle)) || "بدون عنوان";
  const posterPath = item.poster_path || enItem?.poster_path || item.backdrop_path || enItem?.backdrop_path;
  const poster = posterPath ? `${NOVA_TMDB_IMG}${posterPath}` : null;
  const releaseDate = String(item.release_date || item.first_air_date || enItem?.release_date || enItem?.first_air_date || "");
  const year = releaseDate.length >= 4 ? releaseDate.slice(0, 4) : "";
  const vote = Number(item.vote_average ?? enItem?.vote_average ?? 0);
  const rating = vote > 0 ? vote.toFixed(1) : "";

  const genreObjs = Array.isArray(item.genres) ? item.genres : [];
  const genreIds = Array.isArray(item.genre_ids) ? item.genre_ids : [];
  const mappedGenres = [
    ...new Set([
      ...genreObjs.map(g => TMDB_GENRE_AR[g.id] || g.name).filter(Boolean),
      ...genreIds.map(id => TMDB_GENRE_AR[id]).filter(Boolean),
    ]),
  ].filter(g => g !== "أنمي" || genreIds.length <= 1).slice(0, 5);

  const epCount = mediaType === "movie" ? "1" : String(item.number_of_episodes || "");
  const statusMap = {
    "Returning Series": "يعرض الآن",
    "In Production": "قيد الإنتاج",
    "Ended": "مكتمل",
    "Canceled": "متوقف",
    "Released": "فيلم",
  };
  const airingDay = mediaType === "movie" ? "فيلم" : (statusMap[item.status] || "");
  const runtime = item.runtime || (Array.isArray(item.episode_run_time) ? item.episode_run_time[0] : 0);

  return {
    id: cardId,
    content_id: cardId,
    contentId: cardId,
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
    airingDay,
    airing_day: airingDay,
    genres: mappedGenres,
    genre_name: mappedGenres,
    description: String(item.overview || enItem?.overview || "").trim(),
    duration: runtime ? `${runtime} د` : "",
    ageRating: item.adult ? "18+" : "",
    language: mediaType === "movie" ? "مترجم" : "اليابانية",
    totalSeasons: mediaType === "movie" ? 1 : Number(item.number_of_seasons || 0),
    source: sourceName,
  };
}

async function novaFetchTmdbList(endpoint, params = {}, mediaType = "tv", sourceName = "animecloud", limit = 24, start = 0) {
  const safeLimit = Math.min(80, Math.max(1, Number(limit) || 24));
  const safeStart = Math.max(0, Number(start) || 0);
  const startPage = Math.floor(safeStart / 20) + 1;
  const pagesNeeded = Math.min(4, Math.max(1, Math.ceil((safeLimit + 8) / 20)));
  const pageNums = Array.from({ length: pagesNeeded }, (_, i) => startPage + i);

  const pageResults = await Promise.all(pageNums.map(async (p) => {
    const [arRes, enRes] = await Promise.all([
      novaTmdbGet(endpoint, { ...params, page: String(p), language: "ar-SA" }).catch(() => ({ results: [] })),
      novaTmdbGet(endpoint, { ...params, page: String(p), language: "en-US" }).catch(() => ({ results: [] })),
    ]);
    const enById = new Map((enRes?.results || []).map(x => [String(x.id), x]));
    const items = (arRes?.results?.length ? arRes.results : (enRes?.results || []))
      .filter(x => x && x.id && !x.adult && (x.poster_path || x.backdrop_path));
    return items.map(x => {
      const type = x.media_type === "movie" || x.media_type === "tv" ? x.media_type : mediaType;
      return novaCard(x, type, sourceName, enById.get(String(x.id)));
    });
  }));

  const seen = new Set();
  const deduped = [];
  for (const list of pageResults) {
    for (const card of list) {
      if (!card?.id || seen.has(card.id)) continue;
      seen.add(card.id);
      deduped.push(card);
    }
  }
  const offsetInPage = safeStart % 20;
  return deduped.slice(offsetInPage, offsetInPage + safeLimit);
}

async function animecloudLatest(limit = 48, start = 0) {
  const today = new Date().toISOString().slice(0, 10);
  return novaFetchTmdbList("discover/tv", {
    with_genres: "16",
    with_original_language: "ja",
    sort_by: "popularity.desc",
    "first_air_date.lte": today,
    "vote_count.gte": "10",
  }, "tv", "animecloud", limit, start);
}

async function animecloudPopular(limit = 36, start = 0) {
  return novaFetchTmdbList("discover/tv", {
    with_genres: "16",
    with_original_language: "ja",
    sort_by: "vote_count.desc",
    "vote_count.gte": "150",
  }, "tv", "animecloud", limit, start);
}

async function animecloudSearch(query = "", limit = 24, start = 0) {
  const q = String(query || "").trim();
  if (!q) return animecloudLatest(limit, start);
  const page = Math.floor(Math.max(0, Number(start) || 0) / 20) + 1;
  const [arTv, enTv] = await Promise.all([
    novaTmdbGet("search/tv", { query: q, language: "ar-SA", page: String(page), include_adult: "false" }).catch(() => ({ results: [] })),
    novaTmdbGet("search/tv", { query: q, language: "en-US", page: String(page), include_adult: "false" }).catch(() => ({ results: [] })),
  ]);
  const enById = new Map((enTv?.results || []).map(x => [String(x.id), x]));
  const raw = arTv?.results?.length ? arTv.results : (enTv?.results || []);
  const animeOnly = raw.filter(x => (x.genre_ids || []).includes(16) || (x.origin_country || []).includes("JP"));
  const chosen = (animeOnly.length ? animeOnly : raw).filter(x => x && x.id && !x.adult);
  return chosen.slice(0, limit).map(x => novaCard(x, "tv", "animecloud", enById.get(String(x.id))));
}

async function animecloudByGenre(genre = "", limit = 30, start = 0) {
  const norm = normalizeGenreText(genre);
  const mappedId = TMDB_AR_TO_TV_GENRE[norm];
  const withGenres = mappedId && mappedId !== "16" ? `16,${mappedId}` : "16";
  return novaFetchTmdbList("discover/tv", {
    with_genres: withGenres,
    with_original_language: "ja",
    sort_by: "popularity.desc",
    "vote_count.gte": "20",
  }, "tv", "animecloud", limit, start);
}

async function animecloudRandom(genres = []) {
  const firstGenre = Array.isArray(genres) ? genres[0] : genres;
  const start = Math.floor(Math.random() * 4) * 20;
  const norm = normalizeGenreText(firstGenre || "");
  const mappedId = TMDB_AR_TO_TV_GENRE[norm];
  const withGenres = mappedId && mappedId !== "16" ? `16,${mappedId}` : "16";
  const list = await novaFetchTmdbList("discover/tv", {
    with_genres: withGenres,
    with_original_language: "ja",
    sort_by: "vote_count.desc",
    "vote_count.gte": "50",
  }, "tv", "animecloud", 20, start);
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

async function faselhdLatest(limit = 48, start = 0) {
  const today = new Date().toISOString().slice(0, 10);
  const animeCount = Math.ceil(limit * 0.65);
  const movieCount = Math.max(0, limit - animeCount);
  const [anime, movies] = await Promise.all([
    novaFetchTmdbList("discover/tv", {
      with_genres: "16",
      with_original_language: "ja",
      sort_by: "popularity.desc",
      "first_air_date.lte": today,
      "vote_count.gte": "15",
    }, "tv", "faselhd", animeCount, start),
    movieCount > 0 ? novaFetchTmdbList("discover/movie", {
      sort_by: "popularity.desc",
      "primary_release_date.lte": today,
      "vote_count.gte": "300",
    }, "movie", "faselhd", movieCount, start) : Promise.resolve([]),
  ]);
  const merged = [];
  const maxLen = Math.max(anime.length, movies.length);
  for (let i = 0; i < maxLen; i++) {
    if (anime[i]) merged.push(anime[i]);
    if (movies[i]) merged.push(movies[i]);
  }
  return merged.slice(0, limit);
}

async function faselhdPopular(limit = 36, start = 0) {
  const animeCount = Math.ceil(limit * 0.7);
  const movieCount = Math.max(0, limit - animeCount);
  const [anime, movies] = await Promise.all([
    novaFetchTmdbList("discover/tv", {
      with_genres: "16",
      with_original_language: "ja",
      sort_by: "vote_count.desc",
      "vote_count.gte": "200",
    }, "tv", "faselhd", animeCount, start),
    movieCount > 0 ? novaFetchTmdbList("discover/movie", {
      sort_by: "vote_count.desc",
      "vote_count.gte": "1000",
    }, "movie", "faselhd", movieCount, start) : Promise.resolve([]),
  ]);
  const merged = [];
  const maxLen = Math.max(anime.length, movies.length);
  for (let i = 0; i < maxLen; i++) {
    if (anime[i]) merged.push(anime[i]);
    if (movies[i]) merged.push(movies[i]);
  }
  return merged.slice(0, limit);
}

async function faselhdSearch(query = "", limit = 24, start = 0) {
  const q = String(query || "").trim();
  if (!q) return faselhdLatest(limit, start);
  const page = Math.floor(Math.max(0, Number(start) || 0) / 20) + 1;
  const [arRes, enRes] = await Promise.all([
    novaTmdbGet("search/multi", { query: q, language: "ar-SA", page: String(page), include_adult: "false" }).catch(() => ({ results: [] })),
    novaTmdbGet("search/multi", { query: q, language: "en-US", page: String(page), include_adult: "false" }).catch(() => ({ results: [] })),
  ]);
  const enById = new Map((enRes?.results || []).map(x => [`${x.media_type}:${x.id}`, x]));
  const raw = (arRes?.results?.length ? arRes.results : (enRes?.results || []))
    .filter(x => x && x.id && !x.adult && (x.media_type === "movie" || x.media_type === "tv"));
  return raw.slice(0, limit).map(x => novaCard(x, x.media_type, "faselhd", enById.get(`${x.media_type}:${x.id}`)));
}

async function faselhdByGenre(genre = "", limit = 30, start = 0) {
  const norm = normalizeGenreText(genre);
  const movieG = TMDB_AR_TO_MOVIE_GENRE[norm] || "";
  const tvG = TMDB_AR_TO_TV_GENRE[norm] || "";
  const withTvGenres = tvG && tvG !== "16" ? `16,${tvG}` : "16";
  const animeCount = Math.ceil(limit * 0.7);
  const movieCount = Math.max(0, limit - animeCount);
  const [anime, movies] = await Promise.all([
    novaFetchTmdbList("discover/tv", {
      with_genres: withTvGenres,
      with_original_language: "ja",
      sort_by: "popularity.desc",
      "vote_count.gte": "20",
    }, "tv", "faselhd", animeCount, start),
    movieCount > 0 ? novaFetchTmdbList("discover/movie", {
      ...(movieG ? { with_genres: movieG } : {}),
      sort_by: "popularity.desc",
      "vote_count.gte": "150",
    }, "movie", "faselhd", movieCount, start) : Promise.resolve([]),
  ]);
  const merged = [];
  const maxLen = Math.max(anime.length, movies.length);
  for (let i = 0; i < maxLen; i++) {
    if (anime[i]) merged.push(anime[i]);
    if (movies[i]) merged.push(movies[i]);
  }
  return merged.slice(0, limit);
}

async function faselhdRandom(genres = []) {
  const firstGenre = Array.isArray(genres) ? genres[0] : genres;
  const norm = normalizeGenreText(firstGenre || "");
  const tvG = TMDB_AR_TO_TV_GENRE[norm] || "";
  const withGenres = tvG && tvG !== "16" ? `16,${tvG}` : "16";
  const start = Math.floor(Math.random() * 4) * 20;
  const list = await novaFetchTmdbList("discover/tv", {
    with_genres: withGenres,
    with_original_language: "ja",
    sort_by: "vote_count.desc",
    "vote_count.gte": "80",
  }, "tv", "faselhd", 20, start);
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

async function novaDetails(rawId, fallbackSource = "animecloud") {
  const parsed = novaParseId(rawId, fallbackSource);
  if (!parsed) throw new Error("INVALID_NOVA_ID");
  const { source, mediaType, tmdbId } = parsed;
  const [arData, enData] = await Promise.all([
    novaTmdbGet(`${mediaType}/${tmdbId}`, { language: "ar-SA" }).catch(() => ({})),
    novaTmdbGet(`${mediaType}/${tmdbId}`, { language: "en-US" }).catch(() => ({})),
  ]);
  const base = arData?.id ? arData : enData;
  return novaCard(base || { id: tmdbId }, mediaType, source, enData);
}

async function novaSeasons(rawId, fallbackSource = "animecloud") {
  const parsed = novaParseId(rawId, fallbackSource);
  if (!parsed) return [];
  const { source, mediaType, tmdbId } = parsed;
  const prefix = novaPrefixFor(source);
  const cardId = `${prefix}-${mediaType}-${tmdbId}`;

  if (mediaType === "movie") {
    const details = await novaTmdbGet(`movie/${tmdbId}`, { language: "ar-SA" }).catch(() => ({}));
    const dur = details?.runtime ? `${details.runtime} د` : "";
    return [{
      id: `${cardId}-s1`,
      title: "الفيلم",
      number: 1,
      episodes: [{ id: `${cardId}-s1-e1`, title: "مشاهدة الفيلم", duration: dur, number: 1 }],
    }];
  }

  const tvMeta = await novaTmdbGet(`tv/${tmdbId}`, { language: "ar-SA" }).catch(() => ({}));
  const rawSeasons = (Array.isArray(tvMeta?.seasons) ? tvMeta.seasons : []).filter(s => Number(s.season_number) > 0);
  if (!rawSeasons.length) {
    return [{
      id: `${cardId}-s1`,
      title: "الموسم 1",
      number: 1,
      episodes: [{ id: `${cardId}-s1-e1`, title: "الحلقة 1", duration: "", number: 1 }],
    }];
  }

  // Fetch detailed Arabic episode lists for up to 15 seasons in a single append_to_response request
  const appendSeasons = rawSeasons.slice(0, 15).map(s => `season/${s.season_number}`).join(",");
  const seasonDetails = await novaTmdbGet(`tv/${tmdbId}`, {
    language: "ar-SA",
    append_to_response: appendSeasons,
  }).catch(() => ({}));

  return rawSeasons.map((s) => {
    const sNum = Number(s.season_number);
    const detailed = seasonDetails?.[`season/${sNum}`];
    const detailedEps = Array.isArray(detailed?.episodes) ? detailed.episodes : [];
    const episodes = detailedEps.length
      ? detailedEps.map((ep, idx) => {
          const epNum = Number(ep.episode_number || idx + 1);
          const epName = String(ep.name || "").trim();
          const label = epName && !/^Episode\s+\d+$/i.test(epName) ? `الحلقة ${epNum}: ${epName}` : `الحلقة ${epNum}`;
          return {
            id: `${cardId}-s${sNum}-e${epNum}`,
            title: label,
            duration: ep.runtime ? `${ep.runtime} د` : "",
            number: epNum,
          };
        })
      : Array.from({ length: Math.max(1, Number(s.episode_count) || 1) }, (_, idx) => {
          const epNum = idx + 1;
          return {
            id: `${cardId}-s${sNum}-e${epNum}`,
            title: `الحلقة ${epNum}`,
            duration: "",
            number: epNum,
          };
        });

    return {
      id: `${cardId}-s${sNum}`,
      title: String(s.name || `الموسم ${sNum}`),
      number: sNum,
      episodes,
    };
  });
}

async function animecloudSources(episodeId, contentId = "") {
  const parsed = novaParseId(episodeId, "animecloud") || novaParseId(contentId, "animecloud");
  if (!parsed) return [];
  const { tmdbId, mediaType, season, episode } = parsed;
  try {
    const url = `${NOVA_BACKEND_BASE}/animecloud/streams?tmdbId=${encodeURIComponent(tmdbId)}&mediaType=${encodeURIComponent(mediaType)}&season=${season}&episode=${episode}`;
    const { data } = await axios.get(url, { timeout: 18000 });
    const list = Array.isArray(data?.streams) ? data.streams : (Array.isArray(data?.result) ? data.result : []);
    return list.map((s, idx) => {
      const rawUrl = String(s?.url || "").trim();
      if (!rawUrl) return null;
      const proxyUrl = `/api/video/proxy?url=${encodeURIComponent(rawUrl)}`;
      const quality = String(s.quality || "1080p");
      return {
        id: `animecloud-${tmdbId}-s${season}-e${episode}-${idx + 1}`,
        title: `أنمي كلاود - ${s.title || s.name || "سيرفر رئيسي"}`,
        quality,
        size: novaFormatBytes(s.size),
        url: proxyUrl,
        rawUrl,
        resolvedUrl: proxyUrl,
        direct: true,
        downloadable: true,
        watchable: true,
        embeddable: true,
        provider: "AnimeCloud",
        logoText: "AC",
        kind: "stream",
        hint: "تشغيل مباشر فائق السرعة (أنمي كلاود)",
      };
    }).filter(Boolean);
  } catch (err) {
    console.error("[AnimeCloud Sources Error]", err.message);
    return [];
  }
}

async function isStreamUrlHealthy(rawUrl, extraHeaders = {}) {
  if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) return false;
  try {
    const r = await axios.get(rawUrl, {
      timeout: 4500,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Range": "bytes=0-511",
        "Referer": "https://www.faselhd.cc/",
        ...extraHeaders,
      },
      responseType: "arraybuffer",
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      validateStatus: () => true,
    });
    if (r.status < 200 || r.status >= 400) return false;
    const ct = String(r.headers["content-type"] || "").toLowerCase();
    if (ct.includes("application/json")) return false;
    return true;
  } catch (_) {
    return false;
  }
}

async function crossSourceAnimeFallbacks(tmdbId, mediaType, season, episode) {
  const titleNorm = value => String(value || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, "");
  let enTitle = "";
  let arTitle = "";
  try {
    const meta = await novaDetails(`fh-${mediaType}-${tmdbId}`, "faselhd");
    enTitle = meta?.englishTitle || meta?.title || "";
    arTitle = meta?.title || "";
  } catch (_) {}

  const queryTitles = [...new Set([
    season > 1 && enTitle ? `${enTitle} Season ${season}` : "",
    enTitle,
    arTitle,
  ].filter(Boolean))];

  const tasks = [
    // 1. AnimeCloud (same TMDB ID + season + episode)
    animecloudSources(`ac-${mediaType}-${tmdbId}-s${season}-e${episode}`, `ac-${mediaType}-${tmdbId}`).catch(() => []),
  ];

  if (queryTitles.length) {
    // 2. Kawaii (AniList GraphQL -> direct MP4 + Arabic VTT subtitles)
    tasks.push((async () => {
      for (const qTitle of queryTitles) {
        try {
          const hits = await kawaiiSearch(qTitle, 5, [], 1);
          const wanted = titleNorm(qTitle);
          const pick = hits.find(h => titleNorm(h.englishTitle || h.title) === wanted) || hits[0];
          if (pick?.id) {
            const list = await kawaiiSources(`${pick.id}-ep${episode}`);
            if (list.length) return list;
          }
        } catch (_) {}
      }
      return [];
    })());

    // 3. Anime Witcher (Firestore + MediaFire/PixelDrain/StreamTape)
    tasks.push((async () => {
      for (const qTitle of queryTitles) {
        try {
          const resolved = await witcherResolveEpisode(qTitle, episode);
          if (resolved?.anime?.animePath && resolved?.episodeId) {
            const list = await witcherSources(resolved.anime.animePath, resolved.episodeId);
            const playable = list.filter(x => x.watchable !== false && x.kind !== "download");
            if (playable.length) return playable;
          }
        } catch (_) {}
      }
      return [];
    })());

    // 4. Animefy (MediaFire / OK.ru / SendVid)
    tasks.push((async () => {
      for (const qTitle of queryTitles) {
        try {
          const hits = await animeifySearch(qTitle, 5);
          const wanted = titleNorm(qTitle);
          const pick = hits.find(h => titleNorm(h.englishTitle || h.title) === wanted) || hits[0];
          if (pick?.id) {
            const list = await animeifySources(`${pick.id}-ep${episode}`);
            const playable = list.filter(x => x.watchable !== false);
            if (playable.length) return playable;
          }
        } catch (_) {}
      }
      return [];
    })());
  }

  const settled = await Promise.allSettled(tasks);
  const merged = [];
  const seenUrls = new Set();
  for (const res of settled) {
    if (res.status !== "fulfilled" || !Array.isArray(res.value)) continue;
    for (const src of res.value) {
      const key = String(src?.rawUrl || src?.url || "");
      if (!key || seenUrls.has(key)) continue;
      seenUrls.add(key);
      merged.push(src);
    }
  }
  return merged;
}

async function faselhdSources(episodeId, contentId = "") {
  const parsed = novaParseId(episodeId, "faselhd") || novaParseId(contentId, "faselhd");
  if (!parsed) return [];
  const { tmdbId, mediaType, season, episode } = parsed;
  const healthyFasel = [];
  try {
    const typePath = mediaType === "movie" ? "movie" : "series";
    const idStr = mediaType === "movie" ? tmdbId : `${tmdbId}:${season}:${episode}`;
    const url = `${NOVA_BACKEND_BASE}/resolve/${typePath}/${idStr}`;
    const { data } = await axios.get(url, { timeout: 14000 });
    const list = Array.isArray(data?.streams) ? data.streams : [];
    const checked = await Promise.all(list.map(async (s, idx) => {
      const rawUrl = String(s?.url || "").trim();
      if (!rawUrl) return null;
      const ok = await isStreamUrlHealthy(rawUrl, s.headers || {});
      if (!ok) return null;
      const proxyUrl = `/api/video/proxy?url=${encodeURIComponent(rawUrl)}`;
      const quality = String(s.quality || "1080p");
      return {
        id: `faselhd-${tmdbId}-s${season}-e${episode}-${idx + 1}`,
        title: `فاصل HD - ${s.title || quality}`,
        quality,
        size: novaFormatBytes(s.size),
        url: proxyUrl,
        rawUrl,
        resolvedUrl: proxyUrl,
        direct: true,
        downloadable: !rawUrl.includes(".m3u8"),
        watchable: true,
        embeddable: true,
        provider: "FaselHD",
        logoText: "FH",
        kind: "stream",
        hint: "تشغيل مباشر بترجمة عربية (فاصل HD)",
      };
    }));
    healthyFasel.push(...checked.filter(Boolean));
  } catch (err) {
    console.error("[FaselHD Sources Error]", err.message);
  }

  if (healthyFasel.length > 0) {
    return healthyFasel;
  }

  // Fallback to verified working Arabic-subbed anime mirrors so episodes always play smoothly
  return await crossSourceAnimeFallbacks(tmdbId, mediaType, season, episode);
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
    if (origin) {
      try {
        const originUrl = new URL(origin);
        const isCapacitor = origin.startsWith("capacitor://") || origin.startsWith("ionic://") || originUrl.hostname === "localhost";
        if (originUrl.host !== req.headers.host && !isCapacitor) {
          return res.status(403).json({ error: "CROSS_ORIGIN_BLOCKED" });
        }
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-anime-source, Range");
        res.setHeader("Vary", "Origin");
      } catch (_) {
        return res.status(403).end();
      }
    }
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
    const aliases = [["/x/gateway", "/api/trpc"], ["/x/content", "/api/anime"], ["/x/w", "/api/witcher"], ["/x/kawaii", "/api/kawaii"], ["/x/animeify", "/api/animeify"], ["/x/animecloud", "/api/animecloud"], ["/x/faselhd", "/api/faselhd"], ["/x/episode", "/api/episode"], ["/x/auth", "/api/auth"]];
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

  async function getClusterPopular(start = 0, limit = 24) {
    const raw = await clusterApiPost("Content/searchContent", {
      search_keyword: "",
      media_type: "",
      start: String(start),
      limit: String(limit),
      order_by: "ratings",
      order_direction: "DESC",
      language_id: "0",
      genre_id: "0"
    });
    const list = apiList(raw);
    return list.map(normalizeCard);
  }

  const CLUSTER_GENRE_IDS = Object.fromEntries(
    Object.entries({
      "إيتشي": "56", "إيسيكاي": "32", "حريم": "41", "آلات / ميكا": "58", "آلات": "58", "ميكا": "58",
      "ألعاب مميتة": "50", "موسيقى": "53", "فنون قتال": "54", "مصاصي دماء": "59",
      "جريمة": "52", "سحر": "28", "شياطين": "49", "قوى خارقة": "51",
      "رعب": "45", "نفسي": "46", "رياضة": "35", "تاريخي": "48",
      "شوجو": "37", "سينين": "57", "مدرسي": "24", "غموض": "25",
      "إثارة": "47", "خيال علمي": "36", "خارق للطبيعة": "44", "شريحة من الحياة": "55",
      "رومانسي": "33", "رومنسي": "33", "كوميديا": "26", "كوميدي": "26", "شونين": "38", "خيال": "34",
      "مغامرات": "31", "مغامرة": "31", "أكشن": "29", "دراما": "30"
    }).map(([k, v]) => [normalizeGenreText(k), v])
  );

  async function getClusterByGenre(genre, start = 0, limit = 30) {
    const norm = normalizeGenreText(genre);
    const genreId = CLUSTER_GENRE_IDS[norm] || (/^\d+$/.test(String(genre).trim()) ? String(genre).trim() : "0");
    const raw = await clusterApiPost("Content/searchContent", {
      search_keyword: genreId === "0" ? String(genre || "") : "",
      content_type: "0",
      start: String(start),
      limit: String(limit),
      order_by: "created_at",
      order_direction: "DESC",
      language_id: "0",
      genre_id: genreId,
    });
    const list = apiList(raw);
    return list.map(normalizeCard);
  }

  async function witcherByGenre(genre, page = 0, limit = 30) {
    await witcherRefreshKeys();
    const norm = normalizeGenreText(genre);
    const aliases = [...new Set([genre, ...witcherGenreAliases(genre), ANIMEIFY_GENRE_MAP[norm]].filter(Boolean))];
    const filterExpr = aliases.map(t => `tags:"${String(t).replace(/"/g, '\\"')}"`).join(" OR ");
    try {
      const params = new URLSearchParams({
        attributesToRetrieve: JSON.stringify(["objectID","name","poster_uri","type","details","tags","story","english_title","poster","rating","path","doc_ref","updated_at","airing_date","created_at","status","episodes_count","seasons_count"]),
        filters: `(${filterExpr})`,
        hitsPerPage: String(Math.min(50, Math.max(1, Number(limit) || 30))),
        page: String(Math.max(0, Number(page) || 0)),
        query: "",
      });
      const json = await witcherAlgolia("series", params.toString());
      const hits = (Array.isArray(json.hits) ? json.hits : []).filter(h => h && h.name);
      if (hits.length) {
        return hits.map(hit => {
          const card = witcherCard(hit);
          card.episodes = String(hit.episodes_count || card.episodes || "");
          card.totalSeasons = String(hit.seasons_count || "");
          return card;
        });
      }
    } catch (_) {}
    // Fallback to text search across series index
    for (const term of aliases.slice(0, 3)) {
      try {
        const res = await witcherSearch(term, page, limit);
        if (res.length) return res;
      } catch (_) {}
    }
    return [];
  }

  async function handleByGenreBySource(source, input = {}) {
    const genre = String(input.genre || "").trim();
    const limit = Math.min(80, Math.max(1, Number(input.limit) || 30));
    const start = Math.max(0, Number(input.start) || 0);
    if (!genre) return [];
    if (source === "animecloud") return await animecloudByGenre(genre, limit, start);
    if (source === "faselhd") return await faselhdByGenre(genre, limit, start);
    if (source === "animeify") return await animeifyByGenre(genre, limit);
    if (source === "kawaii") return await kawaiiSearch("", limit, [genre], Math.floor(start / limit) + 1);
    if (source === "witcher") return await witcherByGenre(genre, Math.floor(start / limit), limit);
    return await getClusterByGenre(genre, start, limit);
  }

  function resolveTrpcSource(req) {
    return String(req.query.source || req.headers["x-anime-source"] || "").toLowerCase();
  }

  async function handleLatestBySource(source, input = {}) {
    const limit = Math.min(80, Math.max(1, Number(input.limit) || 24));
    const start = Math.max(0, Number(input.start) || 0);
    const isPopular = String(input.genreId || "") === "1";
    if (source === "animecloud") {
      return isPopular ? await animecloudPopular(limit, start) : await animecloudLatest(limit, start);
    }
    if (source === "faselhd") {
      return isPopular ? await faselhdPopular(limit, start) : await faselhdLatest(limit, start);
    }
    if (source === "animeify") {
      return isPopular ? await animeifyPopular(limit) : await animeifyLatest(limit);
    }
    if (source === "kawaii") {
      return isPopular
        ? await kawaiiSearch("", limit, [], 1, ["POPULARITY_DESC"])
        : await kawaiiSearch("", limit, [], 1);
    }
    if (source === "witcher") {
      return isPopular ? await witcherPopular(limit) : await witcherLatest(limit);
    }
    return isPopular ? await getClusterPopular(start, limit) : await getClusterLatest(start, limit);
  }

  async function handleEpisodeSourcesBySource(source, input = {}) {
    const epId = String(input.episodeId || "");
    const cid = String(input.contentId || "");
    if (source === "animecloud" || epId.startsWith("ac-") || cid.startsWith("ac-")) {
      return await animecloudSources(epId, cid);
    }
    if (source === "faselhd" || epId.startsWith("fh-") || cid.startsWith("fh-")) {
      return await faselhdSources(epId, cid);
    }
    if (source === "animeify" || epId.startsWith("animeify-") || /-[a-zA-Z0-9]+-ep\d+/.test(epId)) {
      return await animeifySources(epId);
    }
    if (source === "kawaii" || /^\d+-ep\d+$/.test(epId)) {
      return await kawaiiSources(epId);
    }
    if (source === "witcher") {
      if (cid) {
        try {
          const item = await witcherLoad(cid);
          if (item?.animePath) return await witcherSources(item.animePath, epId);
        } catch (_) {}
      }
      return [];
    }
    const raw = await clusterApiPost("Content/getSourceByEpisodeID", {
      episode_id: epId,
    });
    const formatted = apiList(raw).map((src, sourceIndex) => {
      const url = String(src.source || src.source_url || src.url || "");
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
      const downloadable = src.downloadable === true || src.downloadable === 1 || src.downloadable === "1";
      const isNative = /\.(mp4|webm|m3u8)(\?|$)/i.test(url);
      const isStreamProvider = ["MP4Upload","UQLoad","Voe","DoodStream","StreamTape","StreamFiles"].includes(provider);
      const isDownloadProvider = ["MediaFire","Mega","Google Drive"].includes(provider);
      const logoMap = { "MediaFire":"MF","Mega":"MEGA","Google Drive":"DRIVE","MP4Upload":"MP4","UQLoad":"UQ","StreamTape":"ST","PixelDrain":"PD","StreamFiles":"SF","Voe":"VOE","DoodStream":"DOOD","DailyMotion":"DM","YouTube":"YT","PlayMogo":"PM" };
      return {
        id: String(src.source_id || src.id || sourceIndex + 1),
        title: String(src.source_title || src.title || `مصدر ${sourceIndex + 1}`),
        quality: String(src.source_quality || src.quality || ""),
        size: String(src.source_size || src.size || ""),
        url,
        downloadable: downloadable || isDownloadProvider,
        watchable: isNative || isStreamProvider || provider === "PixelDrain" || provider === "DailyMotion" || provider === "YouTube",
        embeddable: isNative || isStreamProvider || provider === "PixelDrain" || provider === "DailyMotion" || provider === "YouTube",
        provider,
        logoText: logoMap[provider] || "CL",
        kind: isDownloadProvider ? "download" : "stream",
      };
    }).filter(src => src.url);
    return await resolveSourceList(formatted);
  }

  // ─── 1. تلبية tRPC للواجهة الحالية ───
  app.use("/api/trpc", async (req, res) => {
    const p = req.path.replace(/^\//, "");
    const source = resolveTrpcSource(req);
    try {
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
            value = await handleLatestBySource(source, input);
          } else if (procedure === "anime.random") {
            const genres = input.genres || input.genre || input.genreId || [];
            value = source === "animecloud" ? await animecloudRandom(genres) : source === "faselhd" ? await faselhdRandom(genres) : source === "animeify" ? ((await animeifyLatest(24)) || [])[0] || null : source === "witcher" ? await witcherRandom(genres, input.exclude || []) : source === "kawaii" ? ((await kawaiiRecommend(genres, 1, input.exclude || [])) || [])[0] || null : await getClusterRandom(genres);
          } else if (procedure === "anime.genres") {
            value = DEFAULT_GENRES;
          } else if (procedure === "anime.byGenre") {
            value = await handleByGenreBySource(source, input);
          } else if (procedure === "anime.details") {
            const id = String(input.id || "");
            if (source === "animecloud" || id.startsWith("ac-")) {
              value = await novaDetails(id, "animecloud");
            } else if (source === "faselhd" || id.startsWith("fh-")) {
              value = await novaDetails(id, "faselhd");
            } else if (source === "animeify" || id.startsWith("x")) {
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
            const id = String(input.id || "");
            if (source === "animecloud" || id.startsWith("ac-")) {
              value = await novaSeasons(id, "animecloud");
            } else if (source === "faselhd" || id.startsWith("fh-")) {
              value = await novaSeasons(id, "faselhd");
            } else if (source === "animeify" || id.startsWith("x")) {
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
          } else if (procedure === "anime.search") {
            const kw = input.keyword || "";
            const start = Math.max(0, Number(input.start) || 0);
            const limit = Math.min(50, Math.max(1, Number(input.limit) || 24));
            if (source === "animecloud") {
              value = await animecloudSearch(kw, limit, start);
            } else if (source === "faselhd") {
              value = await faselhdSearch(kw, limit, start);
            } else if (source === "animeify") {
              value = await animeifySearch(kw, limit);
            } else if (source === "kawaii") {
              value = await kawaiiSearch(kw, limit, [], Math.floor(start / limit) + 1);
            } else if (source === "witcher") {
              value = await witcherSearch(kw, Math.floor(start / limit), limit);
            } else {
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
              value = apiList(raw).map(normalizeCard);
            }
          } else if (procedure === "anime.episodeSources") {
            value = await handleEpisodeSourcesBySource(source, input);
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

      if (p.includes("anime.byGenre")) {
        const input = parseTrpcInput(req);
        const items = await handleByGenreBySource(source, input);
        return res.json({ result: { data: { json: items } } });
      }

      if (p.includes("anime.latest")) {
        const input = parseTrpcInput(req);
        const items = await handleLatestBySource(source, input);
        return res.json({ result: { data: { json: items } } });
      }

      if (p.includes("anime.random")) {
        const input = parseTrpcInput(req);
        const genres = input.genres || input.genre || input.genreId || [];
        const result = source === "animecloud" ? await animecloudRandom(genres) : source === "faselhd" ? await faselhdRandom(genres) : source === "animeify" ? ((await animeifyLatest(24)) || [])[0] || null : source === "witcher" ? await witcherRandom(genres, input.exclude || []) : source === "kawaii" ? await kawaiiRecommend(genres, 1, input.exclude || []) : await getClusterRandom(genres);
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
        if (source === "animecloud") {
          const items = await animecloudSearch(kw, limit, start);
          return res.json({ result: { data: { json: items } } });
        }
        if (source === "faselhd") {
          const items = await faselhdSearch(kw, limit, start);
          return res.json({ result: { data: { json: items } } });
        }
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
        if (source === "animecloud" || id.startsWith("ac-")) {
          return res.json({ result: { data: { json: await novaDetails(id, "animecloud") } } });
        }
        if (source === "faselhd" || id.startsWith("fh-")) {
          return res.json({ result: { data: { json: await novaDetails(id, "faselhd") } } });
        }
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
        if (source === "animecloud" || id.startsWith("ac-")) {
          return res.json({ result: { data: { json: await novaSeasons(id, "animecloud") } } });
        }
        if (source === "faselhd" || id.startsWith("fh-")) {
          return res.json({ result: { data: { json: await novaSeasons(id, "faselhd") } } });
        }
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
        const input = parseTrpcInput(req);
        const resolved = await handleEpisodeSourcesBySource(source, input);
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
      let userAgent = MF_UA;
      if (/mp4upload\.com/i.test(url)) {
        referer = "https://www.mp4upload.com/";
      } else if (/kawaii-anime\.com|video\.kawaii-anime\.com/i.test(url)) {
        referer = "https://kawaiianime.cc/";
      } else if (/faselhd/i.test(url) || /\/stream\?url=/i.test(url)) {
        referer = "https://www.faselhd.cc/";
        userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
      }

      const isM3u8 = /\.m3u8(?:$|[?&%])/i.test(url) || decodeURIComponent(url).includes(".m3u8");
      const upstream = await axios.get(url, {
        responseType: isM3u8 ? "text" : "stream",
        timeout: 30000,
        headers: {
          "User-Agent": userAgent,
          "Accept": "*/*",
          ...(range && !isM3u8 ? { Range: range } : {}),
          "Referer": referer,
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        validateStatus: status => status >= 200 && status < 400,
      });

      res.status(upstream.status);
      let ct = upstream.headers["content-type"];
      if (isM3u8 || (ct && /mpegurl/i.test(ct))) {
        const bodyText = typeof upstream.data === "string" ? upstream.data : String(upstream.data || "");
        const baseObj = new URL(url);
        const rewritten = bodyText.split(/\r?\n/).map((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) {
            return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
              const abs = new URL(uri, baseObj).toString();
              return `URI="/api/video/proxy?url=${encodeURIComponent(abs)}"`;
            });
          }
          const abs = new URL(trimmed, baseObj).toString();
          return `/api/video/proxy?url=${encodeURIComponent(abs)}`;
        }).join("\n");
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "no-store");
        return res.send(rewritten);
      }

      if (!ct || ct === "application/octet-stream" || ct === "binary/octet-stream" || ct.includes("text/plain")) {
        if (/\.mp4(\?|$)/i.test(url) || /\/animecloud\/mp4/i.test(url)) ct = "video/mp4";
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

  // AnimeCloud endpoints (Nova source, unified Anime Sky format)
  app.get("/api/animecloud/latest", async (req, res) => { try { res.json(await animecloudLatest(Number(req.query.limit) || 24, Number(req.query.start) || 0)); } catch (e) { res.status(502).json({ error: e.message }); } });
  app.get("/api/animecloud/search", async (req, res) => { try { res.json(await animecloudSearch(req.query.q || req.query.query || "", Number(req.query.limit) || 24, Number(req.query.start) || 0)); } catch (e) { res.status(502).json({ error: e.message }); } });
  app.get("/api/animecloud/random", async (req, res) => { try { const raw = req.query.genres || req.query.genre || ""; const genres = Array.isArray(raw) ? raw : String(raw).split(",").filter(Boolean); res.json(await animecloudRandom(genres)); } catch (e) { res.status(502).json({ error: e.message }); } });
  app.get("/api/animecloud/:id/seasons", async (req, res) => { try { res.json(await novaSeasons(req.params.id, "animecloud")); } catch (e) { res.status(502).json({ error: e.message }); } });
  app.get("/api/animecloud/episode/:id/sources", async (req, res) => { try { res.json(await animecloudSources(req.params.id)); } catch (e) { res.status(502).json({ error: e.message }); } });
  app.get("/api/animecloud/:id", async (req, res) => { try { res.json(await novaDetails(req.params.id, "animecloud")); } catch (e) { res.status(502).json({ error: e.message }); } });

  // FaselHD endpoints (Nova source, unified Anime Sky format)
  app.get("/api/faselhd/latest", async (req, res) => { try { res.json(await faselhdLatest(Number(req.query.limit) || 24, Number(req.query.start) || 0)); } catch (e) { res.status(502).json({ error: e.message }); } });
  app.get("/api/faselhd/search", async (req, res) => { try { res.json(await faselhdSearch(req.query.q || req.query.query || "", Number(req.query.limit) || 24, Number(req.query.start) || 0)); } catch (e) { res.status(502).json({ error: e.message }); } });
  app.get("/api/faselhd/random", async (req, res) => { try { const raw = req.query.genres || req.query.genre || ""; const genres = Array.isArray(raw) ? raw : String(raw).split(",").filter(Boolean); res.json(await faselhdRandom(genres)); } catch (e) { res.status(502).json({ error: e.message }); } });
  app.get("/api/faselhd/:id/seasons", async (req, res) => { try { res.json(await novaSeasons(req.params.id, "faselhd")); } catch (e) { res.status(502).json({ error: e.message }); } });
  app.get("/api/faselhd/episode/:id/sources", async (req, res) => { try { res.json(await faselhdSources(req.params.id)); } catch (e) { res.status(502).json({ error: e.message }); } });
  app.get("/api/faselhd/:id", async (req, res) => { try { res.json(await novaDetails(req.params.id, "faselhd")); } catch (e) { res.status(502).json({ error: e.message }); } });

  // ملفات dist الثابتة (تفضيل مجلد dist/public المبني حديثاً بواسطة Vite)
  const staticPath = fs.existsSync(path.join(__dirname, "dist", "public", "index.html"))
    ? path.join(__dirname, "dist", "public")
    : path.join(__dirname, "dist");
  app.use(express.static(staticPath, { index: false }));

  app.get("*", (req, res) => {
    const indexPath = path.join(staticPath, "index.html");
    if (fs.existsSync(indexPath)) {
      const html = fs.readFileSync(indexPath, "utf8");
      const aliasBridge = `<script>(function(){var o1=document.getElementById('persistent-source-switcher');if(o1)o1.remove();var o2=document.getElementById('source-switcher');if(o2)o2.remove();var f=window.fetch;window.fetch=function(r,o){var u=String(r&&r.url||r||'');var p=[['/api/anime','/x/content'],['/api/witcher','/x/w'],['/api/kawaii','/x/kawaii'],['/api/animeify','/x/animeify'],['/api/animecloud','/x/animecloud'],['/api/faselhd','/x/faselhd'],['/api/episode','/x/episode'],['/api/auth','/x/auth']];p.forEach(function(x){if(u.indexOf(x[0])===0)u=x[1]+u.slice(x[0].length)});var sm=localStorage.getItem('neonflix-source')||'cluster';if(u.indexOf('/api/trpc/anime.')===0&&u.indexOf('source=')<0){u+=(u.indexOf('?')>=0?'&':'?')+'source='+encodeURIComponent(sm)}if(u!==String(r&&r.url||r||''))r=u;return f.call(this,r,o)};})();</script>`;
      res.type("html").send(html.replace("</body>", `${aliasBridge}</body>`));
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

