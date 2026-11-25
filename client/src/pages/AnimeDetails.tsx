import { useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowRight, Calendar, Film, Heart, Loader2, Play, Star, Tv } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLocalFavorites, toggleLocalFavorite } from "@/lib/appSettings";
import { trpc } from "@/lib/trpc";

export default function AnimeDetails() {
  const [, params] = useRoute("/anime/:id");
  const id = decodeURIComponent(params?.id ?? "");
  const { user } = useAuth();
  const [posterFailed, setPosterFailed] = useState(false);
  const [localFavorites, setLocalFavorites] = useState(() => getLocalFavorites());

  const details = trpc.anime.details.useQuery({ id }, { enabled: Boolean(id) });
  const seasons = trpc.anime.seasons.useQuery({ id }, { enabled: Boolean(id) });
  const favorites = trpc.account.favorites.useQuery(undefined, { enabled: Boolean(user) });
  const addFavorite = trpc.account.addFavorite.useMutation({ onSuccess: () => favorites.refetch() });
  const removeFavorite = trpc.account.removeFavorite.useMutation({ onSuccess: () => favorites.refetch() });

  if (details.isLoading || seasons.isLoading) {
    return (
      <div className="min-h-screen bg-[#060814] text-white flex flex-col items-center justify-center gap-3" dir="rtl">
        <Loader2 className="animate-spin text-purple-400" size={32} />
        <span className="text-sm text-gray-300">جاري فتح ملف الأنمي...</span>
      </div>
    );
  }

  if (details.error || seasons.error || !details.data) {
    return (
      <div className="min-h-screen bg-[#060814] text-white flex flex-col items-center justify-center gap-4 p-6 text-center" dir="rtl">
        <span className="text-sm text-rose-300">تعذر تحميل تفاصيل هذا الأنمي.</span>
        <Link href="/">
          <Button variant="outline">العودة للاستكشاف</Button>
        </Link>
      </div>
    );
  }

  const anime = details.data;
  const seasonList = seasons.data ?? [];
  const isFavorite = user
    ? Boolean(favorites.data?.some((item) => item.contentId === anime.id))
    : localFavorites.some((item) => item.contentId === anime.id);

  const toggleFavorite = () => {
    if (user) {
      if (isFavorite) removeFavorite.mutate({ contentId: anime.id });
      else addFavorite.mutate({ contentId: anime.id, title: anime.title, poster: anime.poster });
    } else {
      const res = toggleLocalFavorite({ contentId: anime.id, title: anime.title, poster: anime.poster });
      setLocalFavorites(res.list);
    }
  };

  return (
    <div className="min-h-screen bg-[#060814] text-white flex flex-col antialiased pb-safe" dir="rtl">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-[#060814]/92 backdrop-blur-xl border-b border-white/5 px-4 pt-safe pb-3 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-200 hover:text-white bg-white/5 px-3 py-1.5 rounded-xl border border-white/10"
        >
          <ArrowRight size={17} />
          <span>العودة</span>
        </Link>
        <span className="text-xs font-bold text-purple-300 truncate max-w-[55%]">{anime.title}</span>
        <button
          type="button"
          onClick={toggleFavorite}
          disabled={addFavorite.isPending || removeFavorite.isPending}
          className={`p-2 rounded-xl border transition-colors ${
            isFavorite
              ? "bg-rose-500/20 border-rose-500/40 text-rose-400"
              : "bg-white/5 border-white/10 text-gray-300 hover:text-white"
          }`}
          aria-label="المفضلة"
        >
          <Heart size={18} fill={isFavorite ? "currentColor" : "none"} />
        </button>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-5 space-y-6">
        {/* Hero Details Card */}
        <section className="flex flex-col sm:flex-row gap-5 items-center sm:items-start bg-[#0d1022] border border-white/8 rounded-2xl p-4 sm:p-6">
          <div className="w-[150px] sm:w-[190px] aspect-[2/3] rounded-2xl overflow-hidden bg-[#141932] border border-white/10 shrink-0 shadow-xl">
            {anime.poster && !posterFailed ? (
              <img
                src={anime.poster}
                alt={anime.title}
                referrerPolicy="no-referrer"
                onError={() => setPosterFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 gap-2">
                <Film size={28} />
                <span className="text-[11px]">بدون غلاف</span>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 text-center sm:text-right space-y-3">
            <div>
              <h1 className="text-xl sm:text-3xl font-black text-white leading-snug">{anime.title}</h1>
              {anime.englishTitle && anime.englishTitle !== anime.title ? (
                <p className="text-xs sm:text-sm text-purple-300 mt-1" dir="ltr">
                  {anime.englishTitle}
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-center sm:justify-start flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1 bg-white/5 border border-white/10 px-2.5 py-1 rounded-xl text-gray-200">
                <Calendar size={13} className="text-purple-400" />
                {anime.year || "غير محدد"}
              </span>
              <span className="inline-flex items-center gap-1 bg-white/5 border border-white/10 px-2.5 py-1 rounded-xl text-amber-300 font-bold">
                <Star size={13} className="fill-amber-400 text-amber-400" />
                {anime.rating || "—"}
              </span>
              <span className="inline-flex items-center gap-1 bg-white/5 border border-white/10 px-2.5 py-1 rounded-xl text-gray-200">
                <Tv size={13} className="text-cyan-400" />
                {anime.episodes || "—"} حلقة
              </span>
            </div>

            {(anime.genres ?? []).length > 0 ? (
              <div className="flex items-center justify-center sm:justify-start flex-wrap gap-1.5">
                {(anime.genres ?? []).map((genre, i) => {
                  const label =
                    typeof genre === "string"
                      ? genre
                      : String((genre as Record<string, unknown>)?.name ?? (genre as Record<string, unknown>)?.genre_name ?? "");
                  return label ? (
                    <span
                      key={label + i}
                      className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-purple-600/15 border border-purple-500/30 text-purple-200"
                    >
                      {label}
                    </span>
                  ) : null;
                })}
              </div>
            ) : null}

            <p className="text-xs sm:text-sm text-gray-300 leading-relaxed max-h-36 overflow-y-auto">
              {anime.description || "لا يتوفر وصف لهذا العنوان حتى الآن."}
            </p>

            <div className="pt-1 flex items-center justify-center sm:justify-start gap-2.5 flex-wrap">
              {seasonList[0]?.episodes?.[0] ? (
                <Link
                  href={`/watch/${encodeURIComponent(seasonList[0].episodes[0].id)}?title=${encodeURIComponent(
                    seasonList[0].episodes[0].title
                  )}&anime=${encodeURIComponent(anime.title)}&contentId=${encodeURIComponent(anime.id)}`}
                  className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-purple-600/30 transition-colors"
                >
                  <Play size={14} fill="currentColor" />
                  <span>مشاهدة الحلقة الأولى</span>
                </Link>
              ) : null}

              <Button
                onClick={toggleFavorite}
                variant="outline"
                disabled={addFavorite.isPending || removeFavorite.isPending}
                className="rounded-xl border-white/15 bg-white/5 hover:bg-white/10 text-xs"
              >
                <Heart size={14} className={isFavorite ? "text-rose-400" : ""} fill={isFavorite ? "currentColor" : "none"} />
                <span>{isFavorite ? "في المفضلة" : "حفظ في المفضلة"}</span>
              </Button>
            </div>
          </div>
        </section>

        {/* Seasons & Episodes */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-bold text-white">المواسم والحلقات</h2>
            <span className="text-xs font-semibold text-purple-300 bg-purple-500/15 px-2.5 py-1 rounded-full border border-purple-500/25">
              {seasonList.length} مواسم
            </span>
          </div>

          {!seasonList.length ? (
            <div className="p-8 rounded-2xl bg-[#0d1022] border border-white/10 text-center text-sm text-gray-400">
              لا توجد مواسم متاحة لهذا العنوان حالياً.
            </div>
          ) : (
            <div className="space-y-4">
              {seasonList.map((season) => (
                <article key={season.id} className="bg-[#0d1022] border border-white/8 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                    <h3 className="text-sm sm:text-base font-bold text-white">{season.title}</h3>
                    <small className="text-xs text-gray-400">{season.episodes.length} حلقة</small>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                    {season.episodes.map((episode, index) => (
                      <Link
                        key={episode.id}
                        href={`/watch/${encodeURIComponent(episode.id)}?title=${encodeURIComponent(
                          episode.title
                        )}&anime=${encodeURIComponent(anime.title)}&contentId=${encodeURIComponent(anime.id)}`}
                        className="flex items-center justify-between gap-2 p-3 rounded-xl bg-[#131730] hover:bg-purple-600/20 border border-white/8 hover:border-purple-500/50 transition-all group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-7 h-7 rounded-lg bg-purple-600/20 text-purple-300 text-xs font-bold flex items-center justify-center shrink-0">
                            {episode.number || index + 1}
                          </span>
                          <div className="min-w-0">
                            <b className="block text-xs font-bold text-white truncate group-hover:text-purple-300">
                              {episode.title}
                            </b>
                            {episode.duration ? (
                              <small className="text-[10px] text-gray-400">{episode.duration}</small>
                            ) : null}
                          </div>
                        </div>
                        <Play size={14} className="text-purple-400 shrink-0" />
                      </Link>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
