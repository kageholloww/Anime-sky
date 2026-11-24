import axios from "axios";
const base = process.env.ANIME_API_BASE_URL;
const key = process.env.ANIME_API_UNIQUE_KEY;
const started = Date.now();
try {
  const response = await axios.post(`${base}/Content/getSourceByEpisodeID`, new URLSearchParams({ episode_id: "83591" }), { timeout: 16000, headers: { "User-Agent": "okhttp/4.9.2", "Content-Type": "application/x-www-form-urlencoded", "unique-key": key } });
  const data = response.data;
  const items = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
  console.log(JSON.stringify({ elapsedMs: Date.now() - started, status: response.status, rootKeys: data && typeof data === "object" ? Object.keys(data) : [], itemCount: items.length, itemKeys: items[0] ? Object.keys(items[0]) : [] }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ elapsedMs: Date.now() - started, message: error instanceof Error ? error.message : String(error), code: error?.code ?? null, status: error?.response?.status ?? null }, null, 2));
}
