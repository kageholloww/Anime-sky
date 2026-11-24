import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, FolderDown, Link2, Loader2, Play, Radio, ShieldAlert, Terminal } from "lucide-react";
import { Link, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import type { EpisodeSource } from "../../../server/animeApi";

function isNativeVideoUrl(url: string) {
  if (!url) return false;
  return /\.(mp4|webm|m3u8|mkv)(\?|$)/i.test(url) || url.includes("/api/video/proxy");
}

function providerClass(provider: string) {
  return provider.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function SourceLogo({ source }: { source: EpisodeSource }) {
  return <span className={`provider-logo provider-${providerClass(source.provider)}`}>{source.logoText}</span>;
}

export default function Watch() {
  const [, params] = useRoute("/watch/:episodeId");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [selectedEpisodeId, setSelectedEpisodeId] = useState("");
  const [playError, setPlayError] = useState(false);
  const [directUrl, setDirectUrl] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState("");
  const [customPlayer, setCustomPlayer] = useState<{ url: string; embedUrl?: string; direct?: boolean } | null>(null);
  const [customLoading, setCustomLoading] = useState(false);
  const [customError, setCustomError] = useState("");
  const savedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const customVideoRef = useRef<HTMLVideoElement | null>(null);
  const { user } = useAuth();
  const episodeId = params?.episodeId ?? "";
  const query = new URLSearchParams(window.location.search);
  const title = query.get("title") || "الحلقة";
  const anime = query.get("anime") || "Anime Watch";
  const contentId = query.get("contentId") || "unknown";
  const seasons = trpc.anime.seasons.useQuery({ id: contentId }, { enabled: contentId !== "unknown" });
  const activeEpisodeId = selectedEpisodeId || episodeId;
  const selectedSeason = seasons.data?.find(season => season.id === selectedSeasonId) ?? seasons.data?.[0];
  const activeEpisode = selectedSeason?.episodes.find(episode => episode.id === activeEpisodeId);
  const activeTitle = activeEpisode?.title || title;
  const sources = trpc.anime.episodeSources.useQuery({ episodeId: activeEpisodeId }, { enabled: Boolean(activeEpisodeId) });
  const saveHistory = trpc.account.saveHistory.useMutation();
  const watchSources = useMemo(() => {
    const list = (sources.data ?? []).filter(source =>
      (source.watchable || source.provider.includes("Direct")) &&
      (source.provider.includes("Direct") || !["MediaFire", "Mega", "Google Drive"].includes(source.provider) ||
        (source.direct && isNativeVideoUrl(source.url)))
    );
    // Keep StreamTape first when Witcher provides it, without removing any other server.
    return [...list].sort((a, b) => {
      const rank = (source: EpisodeSource) => source.provider.toLowerCase().includes("streamtape") ? 0 : 1;
      return rank(a) - rank(b);
    });
  }, [sources.data]);
  const downloadSources = useMemo(
    () => (sources.data ?? []).filter(source => source.downloadable || ["MediaFire", "Mega", "Google Drive"].includes(source.provider)),
    [sources.data]
  );
  const selected = useMemo(() => watchSources.find(source => source.id === selectedId) ?? watchSources[0], [watchSources, selectedId]);

  useEffect(() => {
    let cancelled = false;
    setDirectUrl(null);
    if (!selected || !selected.provider.includes("Direct")) return;
    fetch(`/api/video/direct?url=${encodeURIComponent(selected.url)}`)
      .then(response => response.ok ? response.json() : Promise.reject(new Error("direct link unavailable")))
      .then(data => { if (!cancelled && data?.url) setDirectUrl(data.url); })
      .catch(() => { if (!cancelled) setPlayError(false); });
    return () => { cancelled = true; };
  }, [selected?.id, selected?.url, selected?.provider]);

  const playableUrl = directUrl || (selected && (selected.direct || isNativeVideoUrl(selected.url)) ? selected.url : "");
  // Do not include the selected server in this key: changing ST/another server must not lose progress.
  const progressKey = activeEpisodeId ? `neonflix:watch-progress:shared:${anime.toLowerCase().replace(/\s+/g, " ").trim()}:${((activeTitle || title).match(/(\d+)/)?.[1] || "0")}` : "";

  const handlePlayerError = () => {
    if (!watchSources || watchSources.length <= 1) {
      setPlayError(true);
      return;
    }
    const currentIdx = watchSources.findIndex(s => s.id === (selectedId || watchSources[0]?.id));
    if (currentIdx >= 0 && currentIdx < watchSources.length - 1) {
      setSelectedId(watchSources[currentIdx + 1].id);
      setPlayError(false);
    } else {
      setPlayError(true);
    }
  };

  const saveVideoProgress = () => {
    const video = videoRef.current || customVideoRef.current;
    if (!progressKey || !video || !Number.isFinite(video.currentTime) || video.currentTime < 1) return;
    try {
      localStorage.setItem(progressKey, JSON.stringify({ time: video.currentTime, duration: video.duration || 0, savedAt: Date.now() }));
    } catch (_) { /* storage may be disabled */ }
  };
  const restoreVideoProgress = (video: HTMLVideoElement | null = videoRef.current) => {
    if (!progressKey || !video) return;
    try {
      const saved = JSON.parse(localStorage.getItem(progressKey) || "null");
      if (!saved || !Number.isFinite(saved.time) || saved.time < 3) return;
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      if (!duration || saved.time < duration - 5) video.currentTime = saved.time;
    } catch (_) { /* ignore malformed local progress */ }
  };

  // React unmounts the video before a native pause event is guaranteed; save on hide/page navigation too.
  useEffect(() => {
    const save = () => saveVideoProgress();
    window.addEventListener("pagehide", save);
    window.addEventListener("beforeunload", save);
    document.addEventListener("visibilitychange", save);
    return () => {
      save();
      window.removeEventListener("pagehide", save);
      window.removeEventListener("beforeunload", save);
      document.removeEventListener("visibilitychange", save);
    };
  }, [progressKey, customPlayer]);

  useEffect(() => {
    if (user && contentId !== "unknown" && activeEpisodeId && sources.data && !savedRef.current) {
      savedRef.current = true;
      saveHistory.mutate({ contentId, animeTitle: anime, episodeId: activeEpisodeId, episodeTitle: activeTitle });
    }
  }, [user, contentId, activeEpisodeId, anime, activeTitle, sources.data, saveHistory]);

  const playCustomUrl = async () => {
    const raw = customInput.trim();
    setCustomError("");
    setCustomPlayer(null);
    if (!/^https?:\/\//i.test(raw)) { setCustomError("الرابط يجب أن يبدأ بـ http:// أو https://"); return; }
    setCustomLoading(true);
    try {
      const response = await fetch(`/api/video/direct?url=${encodeURIComponent(raw)}`);
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.url) throw new Error(data?.error || "تعذر معالجة الرابط");
      setCustomPlayer({ url: data.url, embedUrl: data.embedUrl, direct: Boolean(data.direct) });
    } catch (error) {
      setCustomError(error instanceof Error ? error.message : "تعذر معالجة الرابط");
    } finally { setCustomLoading(false); }
  };

  const selectSeason = (seasonId: string) => {
    setSelectedSeasonId(seasonId);
    const season = seasons.data?.find(item => item.id === seasonId);
    const firstEpisode = season?.episodes[0];
    if (firstEpisode) {
      setSelectedEpisodeId(firstEpisode.id);
      setSelectedId(null);
      setCustomPlayer(null);
      setPlayError(false);
      savedRef.current = false;
    }
  };

  const selectWatchSource = (sourceId: string) => { setSelectedId(sourceId); setCustomPlayer(null); setPlayError(false); };

  if (sources.isLoading) return <div className="page-shell center-state"><Loader2 className="spin" size={30} /><span>جاري البحث عن مصادر التشغيل...</span></div>;
  if (sources.error) return <div className="page-shell center-state error-state"><ShieldAlert size={30} /><span>تعذر جلب مصادر هذه الحلقة.</span><small>قد تكون الروابط غير مضافة أو المصدر الخارجي غير متاح.</small><Link href="/"><Button variant="outline">العودة</Button></Link></div>;

  return (
    <div className="page-shell">
      <header className="subpage-bar"><Link href="/" className="back-link">← العودة</Link><span className="brand-mini">NEON<span>FLIX</span> / PLAYER</span><span className="page-code">STREAM_NODE</span></header>
      <main className="watch-main">
        <div className="watch-breadcrumb"><span>{anime}</span><b>/</b><strong>{activeTitle}</strong></div>
        {seasons.data?.length ? <section className="watch-selectors"><label>الموسم<select value={selectedSeason?.id ?? ""} onChange={event => selectSeason(event.target.value)}>{seasons.data.map(season => <option key={season.id} value={season.id}>{season.title}</option>)}</select></label><label>الحلقة<select value={activeEpisodeId} onChange={event => { setSelectedEpisodeId(event.target.value); setSelectedId(null); setCustomPlayer(null); setPlayError(false); savedRef.current = false; }}>{(selectedSeason?.episodes ?? []).map(episode => <option key={episode.id} value={episode.id}>{episode.title}</option>)}</select></label></section> : null}

        <section className="custom-url-panel" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "10px 12px", marginBottom: 12, direction: "rtl" }}>
          <Link2 size={16} /><strong style={{ fontSize: 12 }}>رابط تشغيل مخصص</strong>
          <input value={customInput} onChange={event => setCustomInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void playCustomUrl(); }} placeholder="الصق رابط MP4 أو MediaFire أو PixelDrain أو StreamTape" style={{ flex: "1 1 260px", minWidth: 200, height: 34, padding: "0 9px" }} />
          <Button size="sm" onClick={() => void playCustomUrl()} disabled={customLoading}>{customLoading ? "جاري التحليل..." : "تشغيل الرابط"}</Button>
          {customError ? <small style={{ width: "100%", color: "#ff8aa3" }}>{customError}</small> : null}
        </section>

        <section className="player-frame">
          <div className="player-topline"><span><Radio size={13} /> WATCH NODE ACTIVE</span><span>EPISODE READY</span></div>
          {customPlayer ? (
            customPlayer.direct || isNativeVideoUrl(customPlayer.url) ? (
              <video key={`custom:${customPlayer.url}`} ref={customVideoRef} className="video-player" controls playsInline src={customPlayer.url} onLoadedMetadata={() => restoreVideoProgress(customVideoRef.current)} onTimeUpdate={saveVideoProgress} onPause={saveVideoProgress} />
            ) : (
              <iframe className="embed-player" src={customPlayer.embedUrl || customPlayer.url} title="Custom video" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen />
            )
          ) : selected && playableUrl && !playError ? (
            <video
              key={`${activeEpisodeId}:${selected.id}`}
              ref={videoRef}
              className="video-player"
              controls
              playsInline
              src={playableUrl}
              onError={handlePlayerError}
              onLoadedMetadata={() => { setPlayError(false); restoreVideoProgress(); }}
              onTimeUpdate={saveVideoProgress}
              onPause={saveVideoProgress}
              onEnded={() => { try { localStorage.removeItem(progressKey); } catch (_) {} }}
            >
              <track kind="captions" />
            </video>
          ) : selected?.embeddable && !playError ? (
            <iframe
              className="embed-player"
              src={selected.embedUrl || selected.url}
              title={`${anime} - ${activeTitle}`}
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
              allowFullScreen
              onError={handlePlayerError}
            />
          ) : (
            <div className="player-placeholder">
              <Play size={42} />
              <h2>{playError ? "جاري تجربة سيرفر بديل تلقائياً..." : watchSources.length ? "اختر مصدر مشاهدة" : "لا يوجد سيرفر مشاهدة مباشر"}</h2>
              <p>{playError ? "يمكنك أيضاً اختيار سيرفر آخر يدوياً من القائمة بالأسفل." : "سيرفرات المشاهدة متاحة بالأسفل."}</p>
              {selected ? <a href={selected.url} target="_blank" rel="noreferrer"><Button><ExternalLink size={16} /> فتح المصدر خارجيًا</Button></a> : null}
            </div>
          )}
          <div className="player-footer"><span><span className="pulse-dot" /> READY</span><small>المصادر المحمية أو التي تمنع التضمين تفتح في موقعها الرسمي.</small></div>
        </section>

        <section className="sources-section watch-sources-section"><div className="section-header"><div><span className="section-eyebrow">WATCH SERVERS / 01</span><h2>سيرفرات المشاهدة</h2></div><span className="count-chip">{watchSources.length} سيرفر</span></div>{!watchSources.length ? <div className="empty-state"><Link2 size={28} /><span>لا توجد سيرفرات مشاهدة مباشرة لهذه الحلقة.</span><small>استخدم سيرفرات التحميل الخارجية أدناه.</small></div> : <div className="source-list">{watchSources.map((source, index) => <div key={source.id} className={`source-row ${selected?.id === source.id ? "source-active" : ""}`}><button onClick={() => selectWatchSource(source.id)} className="source-select"><SourceLogo source={source} /><span className="source-number">{String(index + 1).padStart(2, "0")}</span><div><b>{source.provider}</b><small>{source.quality ? `${source.quality} · ` : ""}{source.size || "مشاهدة مباشرة"}</small></div></button><div className="source-actions"><Button size="sm" variant="outline" onClick={() => selectWatchSource(source.id)}><Play size={14} /> تشغيل هنا</Button><a href={source.url} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost"><ExternalLink size={14} /> خارجي</Button></a></div></div>)}</div>}</section>
        <section className="sources-section download-sources-section"><div className="section-header"><div><span className="section-eyebrow">DOWNLOAD SERVERS / 02</span><h2>سيرفرات التحميل</h2></div><span className="count-chip">{downloadSources.length} روابط</span></div>{!downloadSources.length ? <div className="empty-state"><FolderDown size={28} /><span>لا توجد روابط تحميل متاحة حاليًا.</span></div> : <div className="source-list">{downloadSources.map((source, index) => <div key={source.id} className="source-row download-source-row"><div className="source-select"><SourceLogo source={source} /><span className="source-number">{String(index + 1).padStart(2, "0")}</span><div><b>{source.provider} {source.direct ? <span className="text-xs text-amber-400 font-normal">⚡ مباشر</span> : null}</b><small>{source.quality ? `${source.quality} · ` : ""}{source.size || (source.direct ? "تحميل مباشر فائق السرعة" : "صفحة تحميل خارجية")}</small></div></div><div className="source-actions"><a href={source.url} target="_blank" rel="noreferrer"><Button size="sm" variant={source.direct ? "default" : "ghost"}><FolderDown size={14} /> {source.direct ? "تحميل مباشر" : "فتح صفحة التحميل"}</Button></a></div></div>)}</div>}</section>
        <div className="watch-note"><Terminal size={15} /><span>المنصة لا تنزّل الملفات مباشرة؛ زر التحميل يفتح صفحة المزود الخارجية يدويًا. بعض سيرفرات المشاهدة قد تمنع التضمين لأسباب تقنية.</span></div>
      </main>
    </div>
  );
}
