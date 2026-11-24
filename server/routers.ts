import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { discoverGenres, getDetails, getEpisodeSources, getRandomByGenre, getSeasons, listLatest, searchAnime } from "./animeApi";
import { listFavorites, listHistory, removeFavorite, saveFavorite, saveHistory } from "./db";

const apiError = (error: unknown) => new Error(error instanceof Error ? error.message : "ANIME_API_ERROR");

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  account: router({
    favorites: protectedProcedure.query(({ ctx }) => listFavorites(ctx.user.id)),
    addFavorite: protectedProcedure
      .input(z.object({ contentId: z.string().min(1), title: z.string().min(1), poster: z.string().nullable().optional() }))
      .mutation(({ ctx, input }) => saveFavorite(ctx.user.id, input.contentId, input.title, input.poster)),
    removeFavorite: protectedProcedure
      .input(z.object({ contentId: z.string().min(1) }))
      .mutation(({ ctx, input }) => removeFavorite(ctx.user.id, input.contentId)),
    history: protectedProcedure.query(({ ctx }) => listHistory(ctx.user.id)),
    saveHistory: protectedProcedure
      .input(z.object({ contentId: z.string().min(1), animeTitle: z.string().min(1), episodeId: z.string().min(1), episodeTitle: z.string().min(1) }))
      .mutation(({ ctx, input }) => saveHistory(ctx.user.id, input.contentId, input.animeTitle, input.episodeId, input.episodeTitle)),
  }),
  anime: router({
    latest: publicProcedure
      .input(z.object({ genreId: z.string().default("18"), start: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(30).default(12) }).optional())
      .query(async ({ input }) => {
        try { return await listLatest(input?.start ?? 0, input?.limit ?? 12, input?.genreId ?? "18"); }
        catch (error) { throw apiError(error); }
      }),
    search: publicProcedure
      .input(z.object({ keyword: z.string().trim().min(1), start: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(30).default(24) }))
      .query(async ({ input }) => {
        try { return await searchAnime(input.keyword, input.start, input.limit); }
        catch (error) { throw apiError(error); }
      }),
    details: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ input }) => {
        try { return await getDetails(input.id); }
        catch (error) { throw apiError(error); }
      }),
    seasons: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ input }) => {
        try { return await getSeasons(input.id); }
        catch (error) { throw apiError(error); }
      }),
    episodeSources: publicProcedure
      .input(z.object({ episodeId: z.string().min(1) }))
      .query(async ({ input }) => {
        try { return await getEpisodeSources(input.episodeId); }
        catch (error) { throw apiError(error); }
      }),
    genres: publicProcedure.query(async () => {
      try { return await discoverGenres(); }
      catch (error) { throw apiError(error); }
    }),
    random: publicProcedure
      .input(z.object({ genres: z.array(z.string()).max(20).optional(), genre: z.string().optional(), genreId: z.string().optional() }).optional())
      .query(async ({ input }) => {
        try {
          const selected = input?.genres?.length ? input.genres : (input?.genre ?? input?.genreId ?? "all");
          return await getRandomByGenre(selected);
        }
        catch (error) { throw apiError(error); }
      }),
  }),
});

export type AppRouter = typeof appRouter;
