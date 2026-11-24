import { Link, useRoute } from "wouter";
import { ArrowRight, Calendar, ChevronLeft, Film, Heart, Loader2, Play, Star, Tag, Tv } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

export default function AnimeDetails() {
  const [, params] = useRoute("/anime/:id");
  const id = params?.id ?? "";
  const { user } = useAuth();
  const details = trpc.anime.details.useQuery({ id }, { enabled: Boolean(id) });
  const seasons = trpc.anime.seasons.useQuery({ id }, { enabled: Boolean(id) });
  const favorites = trpc.account.favorites.useQuery(undefined, { enabled: Boolean(user) });
  const addFavorite = trpc.account.addFavorite.useMutation({ onSuccess: () => favorites.refetch() });
  const removeFavorite = trpc.account.removeFavorite.useMutation({ onSuccess: () => favorites.refetch() });

  if (details.isLoading || seasons.isLoading) return <div className="page-shell center-state"><Loader2 className="spin" size={30} /><span>جاري فتح ملف الأنمي...</span></div>;
  if (details.error || seasons.error || !details.data) return <div className="page-shell center-state error-state"><span>تعذر تحميل تفاصيل هذا الأنمي.</span><Link href="/"><Button variant="outline">العودة للاستكشاف</Button></Link></div>;

  const anime = details.data;
  const seasonList = seasons.data ?? [];
  const isFavorite = Boolean(favorites.data?.some(item => item.contentId === anime.id));
  const toggleFavorite = () => {
    if (!user) return startLogin();
    if (isFavorite) removeFavorite.mutate({ contentId: anime.id });
    else addFavorite.mutate({ contentId: anime.id, title: anime.title, poster: anime.poster });
  };
  return (
    <div className="page-shell">
      <header className="subpage-bar"><Link href="/" className="back-link"><ArrowRight size={17} /> العودة</Link><span className="brand-mini">NEON<span>FLIX</span> / DOSSIER</span><span className="page-code">DOSSIER_ACTIVE</span></header>
      <main className="details-main">
        <section className="details-hero">
          <div className="details-poster">{anime.poster ? <img src={anime.poster} alt={anime.title} referrerPolicy="no-referrer" /> : <div className="poster-fallback"><Film size={34} /><span>NO COVER</span></div>}</div>
          <div className="details-copy">
            <span className="section-eyebrow">ANIME DOSSIER / ACCESS GRANTED</span>
            <h1>{anime.title}</h1>
            {anime.englishTitle ? <p className="details-english">{anime.englishTitle}</p> : null}
            <div className="details-tags"><span><Calendar size={14} /> {anime.year || "غير محدد"}</span><span><Star size={14} /> {anime.rating || "—"}</span><span><Tv size={14} /> {anime.episodes || "—"} حلقة</span></div>
            <p className="details-description">{anime.description || "لا يتوفر وصف لهذا العنوان حتى الآن."}</p>
            <div className="details-actions"><Button onClick={toggleFavorite} variant="outline" disabled={addFavorite.isPending || removeFavorite.isPending}><Heart size={16} fill={isFavorite ? "currentColor" : "none"} /> {isFavorite ? "في المفضلة" : "حفظ في المفضلة"}</Button></div>
            <div className="genre-row">{(anime.genres ?? []).map((genre, i) => { const label = typeof genre === "string" ? genre : String((genre as Record<string, unknown>)?.name ?? (genre as Record<string, unknown>)?.genre_name ?? JSON.stringify(genre)); return label ? <span key={label + i}><Tag size={12} /> {label}</span> : null; })}</div>
          </div>
        </section>
        <section className="episodes-section">
          <div className="section-header"><div><span className="section-eyebrow">WATCH INDEX / 01</span><h2>المواسم والحلقات</h2></div><span className="count-chip">{seasonList.length} مواسم</span></div>
          {!seasonList.length ? <div className="empty-state">لا توجد مواسم متاحة لهذا العنوان.</div> : <div className="season-stack">{seasonList.map(season => <article className="season-block" key={season.id}><div className="season-heading"><div><span>SEASON {String(season.number).padStart(2, "0")}</span><h3>{season.title}</h3></div><small>{season.episodes.length} حلقة</small></div><div className="episode-grid">{season.episodes.map((episode, index) => <Link className="episode-button" key={episode.id} href={`/watch/${episode.id}?title=${encodeURIComponent(episode.title)}&anime=${encodeURIComponent(anime.title)}&contentId=${encodeURIComponent(anime.id)}`}><span>{String(episode.number || index + 1).padStart(2, "0")}</span><div><b>{episode.title}</b>{episode.duration ? <small>{episode.duration}</small> : null}</div><Play size={15} /></Link>)}</div></article>)}</div>}
        </section>
        <Link href="/"><Button variant="outline" className="return-button"><ChevronLeft size={16} /> استكشاف عناوين أخرى</Button></Link>
      </main>
    </div>
  );
}
