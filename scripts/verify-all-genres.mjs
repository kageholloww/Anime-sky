import { discoverGenres, getRandomByGenre } from "../server/animeApi.ts";
const genres = await discoverGenres();
const results = [];
for (const genre of genres) {
  const item = await getRandomByGenre(genre);
  results.push({ genre, ok: Boolean(item) });
}
console.log(JSON.stringify({ count: results.length, failed: results.filter(result => !result.ok), allHandled: results.every(result => typeof result.ok === "boolean") }, null, 2));
