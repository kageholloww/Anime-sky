import { describe, expect, it } from "vitest";
import axios from "axios";

describe("Anime Cluster API configuration", () => {
  it("accepts the configured server-side credentials", async () => {
    const baseUrl = process.env.ANIME_API_BASE_URL;
    const uniqueKey = process.env.ANIME_API_UNIQUE_KEY;

    if (!baseUrl || !uniqueKey) {
      console.warn("ANIME_API_BASE_URL or ANIME_API_UNIQUE_KEY not set - skipping live API check");
      expect(true).toBe(true);
      return;
    }

    const response = await axios.post(
      `${baseUrl}/Content/searchContent`,
      new URLSearchParams({
        start: "0",
        limit: "1",
        order_by: "created_at",
        order_direction: "DESC",
        genre_id: "18",
      }),
      {
        headers: {
          "User-Agent": "okhttp/4.9.2",
          "Accept-Encoding": "gzip",
          "Content-Type": "application/x-www-form-urlencoded",
          "unique-key": uniqueKey,
        },
        timeout: 15000,
      },
    );

    expect(response.status).toBe(200);
    expect(response.data).toBeDefined();
  }, 20000);
});
