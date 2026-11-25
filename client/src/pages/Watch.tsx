import { useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  FolderDown,
  Link2,
  Loader2,
  Play,
  Radio,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { Link, useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import type { EpisodeSource } from "../../../server/animeApi";

function isNativeVideoUrl(url: string) {
  if (!url) return false;
  return (
    /\.(mp4|webm|m3u8|mkv)(\?|$)/i.test(url) ||
    url.includes("/api/video/proxy") ||
    url.includes("/animecloud/mp4") ||
    url.includes("kawaii-anime.com") ||
    url.includes("/video/") ||
    url.includes("mp4upload") ||
    url.includes("pixeldrain")
  );
}

function providerClass(provider: string) {
  return provider.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function SourceLogo({ source }: { source: EpisodeSource }) {
  return <span className={`provider-logo provider-${providerClass(source.provider)}`}>{source.logoText}</span>;
}

export default function Watch() {
  const [, params] = useRoute("/watch/:episodeId");
  const [, setLocation] = useLocation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [selectedEpisodeId, setSelectedEpisodeId] = useState("");
  const [playError, setPlayError] = useState(false);
  const [directUrl, setDirectUrl] = useState<string | null>(null);
  const [showCustomBar, setShowCustomBar] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [customPlayer, setCustomPlayer] = useState<{ url: string; embedUrl?: string; direct?: boolean } | null>(null);
  const [customLoading, setCustomLoading] = useState(false);
  const [customError, setCustomError] = useState("");
  const savedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const customVideoRef = useRef<HTMLVideoElement | null>(null);
  const { user } = useAuth();

  const episodeId = decodeURIComponent(params?.episodeId ?? "");
  const query = new URLSearchParams(window.location.search);
  const title = query.get("title") || "الحلقة";
  const anime = query.get("anime") || "Anime Sky";
  const contentId = query.get("contentId") || "unknown";

  const seasons = trpc.anime.seasons.useQuery({ id: contentId }, { enabled: contentId !== "unknown" });
  const activeEpisodeId = selectedEpisodeId || episodeId;

  const selectedSeason = useMemo(() => {
    if (selectedSeasonId) {
      return seasons.data?.find((s) => s.id === selectedSeasonId) ?? seasons.data?.[0];
    }
    return (
      seasons.data?.find((s) => s.episodes.some((ep) => String(ep.id) === String(activeEpisodeId))) ??
      seasons.data?.[0]
    );
  }, [seasons.data, selectedSeasonId, activeEpisodeId]);

  const allEpisodes = useMemo(
    () => (seasons.data ?? []).flatMap((s) => s.episodes),
    [seasons.data]
  );

  const currentEpIndex = useMemo(
    () => allEpisodes.findIndex((ep) => String(ep.id) === String(activeEpisodeId)),
    [allEpisodes, activeEpisodeId]
  );

  const prevEpisode = currentEpIndex > 0 ? allEpisodes[currentEpIndex - 1] : null;
  const nextEpisode = currentEpIndex >= 0 && currentEpIndex < allEpisodes.length - 1 ? allEpisodes[currentEpIndex + 1] : null;

  const activeEpisode = selectedSeason?.episodes.find((episode) => String(episode.id) === String(activeEpisodeId));
  const activeTitle = activeEpisode?.title || title;

  const sources = trpc.anime.episodeSources.useQuery(
    { episodeId: activeEpisodeId, contentId: contentId !== "unknown" ? contentId : undefined },
    { enabled: Boolean(activeEpisodeId) }
  );

  const saveHistory = trpc.account.saveHistory.useMutation();

  const watchSources = useMemo(() => {
    const list = (sources.data ?? []).filter(
      (source) =>
        (source.watchable || source.embeddable || source.direct || source.provider.includes("Direct")) &&
        (!["MediaFire"].includes(source.provider) || (source.direct && isNativeVideoUrl(source.url)))
    );
    return [...list].sort((a, b) => {
      const rank = (source: EpisodeSource) => (source.provider.toLowerCase().includes("streamtape") ? 0 : 1);
      return rank(a) - rank(b);
    });
  }, [sources.data]);

  const downloadSources = useMemo(
    () =>
      (sources.data ?? []).filter(
        (source) => source.downloadable || ["MediaFire", "Mega", "Google Drive"].includes(source.provider)
      ),
    [sources.data]
  );

  const selected = useMemo(
    () => watchSources.find((source) => source.id === selectedId) ?? watchSources[0],
    [watchSources, selectedId]
  );

  useEffect(() => {
    let cancelled = false;
    setDirectUrl(null);
    if (!selected || !selected.provider.includes("Direct")) return;
    fetch(`/api/video/direct?url=${encodeURIComponent(selected.url)}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("direct link unavailable"))))
      .then((data) => {
        if (!cancelled && data?.url) setDirectUrl(data.url);
      })
      .catch(() => {
        if (!cancelled) setPlayError(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.id, selected?.url, selected?.provider]);

  const playableUrl = useMemo(() => {
    if (directUrl) return directUrl;
    if (!selected) return "";
    const raw = selected.url || "";
    if (raw.startsWith("/api/video/proxy")) return raw;
    if (
      isNativeVideoUrl(raw) ||
      selected.direct ||
      selected.provider.includes("Kawaii") ||
      selected.provider.includes("Direct")
    ) {
      return `/api/video/proxy?url=${encodeURIComponent(raw)}`;
    }
    return raw;
  }, [directUrl, selected]);

  const isHlsUrl = (url: string) => {
    if (!url) return false;
    try {
      const decoded = decodeURIComponent(url);
      return /\.m3u8(?:$|[?&])/i.test(url) || /\.m3u8(?:$|[?&])/i.test(decoded);
    } catch {
      return /\.m3u8/i.test(url);
    }
  };

  const isNativeVideo = Boolean(
    playableUrl &&
      (playableUrl.includes("/api/video/proxy") ||
        isNativeVideoUrl(playableUrl) ||
        (selected && (selected.direct || selected.provider.includes("Kawaii") || selected.provider.includes("Direct"))))
  );

  const isPlayableHls = isNativeVideo && isHlsUrl(playableUrl);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isNativeVideo || !playableUrl || playError) return;
    if (!isHlsUrl(playableUrl)) return;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      if (video.src !== playableUrl) video.src = playableUrl;
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hls.loadSource(playableUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          hls.destroy();
          handlePlayerError();
        }
      });
      return () => {
        hls.destroy();
      };
    }
  }, [playableUrl, isNativeVideo, playError, activeEpisodeId, selected?.id]);

  const progressKey = activeEpisodeId
    ? `neonflix:watch-progress:shared:${anime.toLowerCase().replace(/\s+/g, " ").trim()}:${
        (activeTitle || title).match(/(\d+)/)?.[1] || "0"
      }`
    : "";

  const handlePlayerError = () => {
    if (!watchSources || watchSources.length <= 1) {
      setPlayError(true);
      return;
    }
    const currentIdx = watchSources.findIndex((s) => s.id === (selectedId || watchSources[0]?.id));
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
      localStorage.setItem(
        progressKey,
        JSON.stringify({ time: video.currentTime, duration: video.duration || 0, savedAt: Date.now() })
      );
    } catch {
      // storage may be disabled
    }
  };

  const restoreVideoProgress = (video: HTMLVideoElement | null = videoRef.current) => {
    if (!progressKey || !video) return;
    try {
      const saved = JSON.parse(localStorage.getItem(progressKey) || "null");
      if (!saved || !Number.isFinite(saved.time) || saved.time < 3) return;
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      if (!duration || saved.time < duration - 5) video.currentTime = saved.time;
    } catch {
      // ignore malformed local progress
    }
  };

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
    if (!/^https?:\/\//i.test(raw)) {
      setCustomError("الرابط يجب أن يبدأ بـ http:// أو https://");
      return;
    }
    setCustomLoading(true);
    try {
      const response = await fetch(`/api/video/direct?url=${encodeURIComponent(raw)}`);
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.url) throw new Error(data?.error || "تعذر معالجة الرابط");
      setCustomPlayer({ url: data.url, embedUrl: data.embedUrl, direct: Boolean(data.direct) });
    } catch (error) {
      setCustomError(error instanceof Error ? error.message : "تعذر معالجة الرابط");
    } finally {
      setCustomLoading(false);
    }
  };

  const navigateEpisode = (epId: string, epTitle: string) => {
    setSelectedEpisodeId(epId);
    setSelectedId(null);
    setCustomPlayer(null);
    setPlayError(false);
    savedRef.current = false;
    setLocation(
      `/watch/${encodeURIComponent(epId)}?title=${encodeURIComponent(epTitle)}&anime=${encodeURIComponent(
        anime
      )}&contentId=${encodeURIComponent(contentId)}`
    );
  };

  const selectSeason = (seasonId: string) => {
    setSelectedSeasonId(seasonId);
    const season = seasons.data?.find((item) => item.id === seasonId);
    const firstEpisode = season?.episodes[0];
    if (firstEpisode) {
      navigateEpisode(firstEpisode.id, firstEpisode.title);
    }
  };

  const selectWatchSource = (sourceId: string) => {
    setSelectedId(sourceId);
    setCustomPlayer(null);
    setPlayError(false);
  };

  if (sources.isLoading) {
    return (
      <div className="min-h-screen bg-[#060814] text-white flex flex-col items-center justify-center gap-3" dir="rtl">
        <Loader2 className="animate-spin text-purple-400" size={32} />
        <span className="text-sm text-gray-300">جاري تجهيز سيرفرات المشاهدة...</span>
      </div>
    );
  }

  if (sources.error) {
    return (
      <div className="min-h-screen bg-[#060814] text-white flex flex-col items-center justify-center gap-3 p-6 text-center" dir="rtl">
        <ShieldAlert size={34} className="text-rose-400" />
        <span className="text-sm font-bold">تعذر جلب مصادر هذه الحلقة.</span>
        <small className="text-xs text-gray-400">قد تكون الروابط غير مضافة أو المصدر الخارجي غير متاح حالياً.</small>
        <Link href={contentId !== "unknown" ? `/anime/${encodeURIComponent(contentId)}` : "/"}>
          <Button variant="outline">العودة</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#060814] text-white flex flex-col antialiased pb-safe" dir="rtl">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-[#060814]/92 backdrop-blur-xl border-b border-white/5 px-4 pt-safe pb-3 flex items-center justify-between">
        <Link
          href={contentId !== "unknown" ? `/anime/${encodeURIComponent(contentId)}` : "/"}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-200 hover:text-white bg-white/5 px-3 py-1.5 rounded-xl border border-white/10"
        >
          <ArrowRight size={17} />
          <span>العودة</span>
        </Link>
        <div className="text-center min-w-0 max-w-[55%]">
          <span className="block text-xs font-bold text-white truncate">{anime}</span>
          <span className="block text-[10px] text-purple-300 truncate">{activeTitle}</span>
        </div>
        <button
          type="button"
          onClick={() => setShowCustomBar((v) => !v)}
          className={`p-2 rounded-xl border transition-colors ${
            showCustomBar
              ? "bg-purple-600/20 border-purple-500/40 text-purple-300"
              : "bg-white/5 border-white/10 text-gray-300 hover:text-white"
          }`}
          title="تشغيل رابط مخصص"
          aria-label="تشغيل رابط مخصص"
        >
          <Wrench size={17} />
        </button>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-4 space-y-4">
        {/* Optional Custom URL Panel */}
        {showCustomBar && (
          <section className="flex gap-2 items-center flex-wrap p-3 rounded-2xl bg-[#0e1124] border border-purple-500/30">
            <Link2 size={15} className="text-purple-400" />
            <input
              value={customInput}
              onChange={(event) => setCustomInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void playCustomUrl();
              }}
              placeholder="الصق رابط MP4 أو MediaFire أو PixelDrain أو StreamTape"
              className="flex-1 min-w-[200px] h-9 px-3 rounded-xl bg-[#060814] border border-white/10 text-xs text-white focus:outline-none focus:border-purple-500"
            />
            <Button size="sm" onClick={() => void playCustomUrl()} disabled={customLoading} className="rounded-xl">
              {customLoading ? "جاري التحليل..." : "تشغيل"}
            </Button>
            {customError ? <small className="w-full text-xs text-rose-400">{customError}</small> : null}
          </section>
        )}

        {/* Video Player Container */}
        <section className="rounded-2xl overflow-hidden bg-[#080a14] border border-white/10 shadow-2xl">
          <div className="flex items-center justify-between px-3.5 py-2 bg-[#0c1020] border-b border-white/5 text-[11px] text-gray-400">
            <span className="inline-flex items-center gap-1.5 text-purple-300 font-semibold">
              <Radio size={13} />
              {selected?.provider || "المشغل الداخلي"}
            </span>
            <span>{selected?.quality || "HD"}</span>
          </div>

          {customPlayer ? (
            customPlayer.direct || isNativeVideoUrl(customPlayer.url) ? (
              <video
                key={`custom:${customPlayer.url}`}
                ref={customVideoRef}
                className="w-full aspect-video bg-black"
                controls
                playsInline
                src={customPlayer.url}
                onLoadedMetadata={() => restoreVideoProgress(customVideoRef.current)}
                onTimeUpdate={saveVideoProgress}
                onPause={saveVideoProgress}
              />
            ) : (
              <iframe
                className="w-full aspect-video min-h-[260px] bg-black border-0"
                src={customPlayer.embedUrl || customPlayer.url}
                title="Custom video"
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                allowFullScreen
              />
            )
          ) : selected ? (
            isNativeVideo && !playError ? (
              <video
                key={`${activeEpisodeId}:${selected.id}`}
                ref={videoRef}
                className="w-full aspect-video bg-black"
                controls
                playsInline
                preload="metadata"
                src={isPlayableHls ? undefined : playableUrl}
                onError={isPlayableHls ? undefined : handlePlayerError}
                onLoadedMetadata={() => {
                  setPlayError(false);
                  restoreVideoProgress();
                }}
                onTimeUpdate={saveVideoProgress}
                onPause={saveVideoProgress}
                onEnded={() => {
                  try {
                    localStorage.removeItem(progressKey);
                  } catch {
                    // ignore
                  }
                }}
              >
                {((selected as unknown as { subtitles?: { id?: string; url: string; lang: string }[] }).subtitles ?? []).map(
                  (sub, idx) => {
                    const isArabic = /(ar|ara|arabic|عربي|العربية)/i.test(sub.lang);
                    const subProxy = sub.url.startsWith("/api/video/proxy")
                      ? sub.url
                      : `/api/video/proxy?url=${encodeURIComponent(sub.url)}`;
                    return (
                      <track
                        key={sub.id || idx}
                        kind="subtitles"
                        src={subProxy}
                        srcLang={isArabic ? "ar" : "en"}
                        label={sub.lang || (isArabic ? "العربية" : "English")}
                        default={isArabic || idx === 0}
                      />
                    );
                  }
                )}
              </video>
            ) : !playError ? (
              <iframe
                key={`embed:${activeEpisodeId}:${selected.id}`}
                className="w-full aspect-video min-h-[260px] bg-black border-0"
                src={selected.embedUrl || selected.url}
                title={`${anime} - ${activeTitle}`}
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                allowFullScreen
                onError={handlePlayerError}
              />
            ) : (
              <div className="aspect-video flex flex-col items-center justify-center gap-3 p-6 text-center bg-[#090c18]">
                <Play size={36} className="text-purple-400" />
                <h2 className="text-sm font-bold text-white">تعذر تشغيل هذا السيرفر تلقائياً</h2>
                <p className="text-xs text-gray-400">جرب الانتقال للسيرفر التالي أو اختر سيرفراً آخر أدناه.</p>
                <Button size="sm" onClick={handlePlayerError} className="rounded-xl">
                  <Play size={14} /> الانتقال للسيرفر التالي
                </Button>
              </div>
            )
          ) : (
            <div className="aspect-video flex flex-col items-center justify-center gap-2 p-6 text-center bg-[#090c18]">
              <Play size={36} className="text-purple-400" />
              <h2 className="text-sm font-bold text-white">
                {watchSources.length ? "اختر سيرفراً للمشاهدة" : "لا يوجد سيرفر مشاهدة مباشر"}
              </h2>
              <p className="text-xs text-gray-400">انقر على أي سيرفر بالأسفل لبدء التشغيل.</p>
            </div>
          )}
        </section>

        {/* Prev / Next Episode Controls + Season/Episode Picker */}
        {seasons.data?.length ? (
          <section className="bg-[#0d1022] border border-white/8 rounded-2xl p-3 space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!prevEpisode}
                onClick={() => prevEpisode && navigateEpisode(prevEpisode.id, prevEpisode.title)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-white/5 border border-white/10 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-35 hover:bg-white/10 transition-colors"
              >
                <ChevronRight size={15} />
                <span>الحلقة السابقة</span>
              </button>
              <button
                type="button"
                disabled={!nextEpisode}
                onClick={() => nextEpisode && navigateEpisode(nextEpisode.id, nextEpisode.title)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-purple-600/25 border border-purple-500/40 text-xs font-bold text-purple-200 flex items-center justify-center gap-1.5 disabled:opacity-35 hover:bg-purple-600/35 transition-colors"
              >
                <span>الحلقة التالية</span>
                <ChevronLeft size={15} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={selectedSeason?.id ?? ""}
                onChange={(event) => selectSeason(event.target.value)}
                className="h-10 px-3 rounded-xl bg-[#060814] border border-white/10 text-xs text-white"
              >
                {seasons.data.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.title}
                  </option>
                ))}
              </select>
              <select
                value={activeEpisodeId}
                onChange={(event) => {
                  const ep = (selectedSeason?.episodes ?? []).find((x) => String(x.id) === event.target.value);
                  navigateEpisode(event.target.value, ep?.title || "الحلقة");
                }}
                className="h-10 px-3 rounded-xl bg-[#060814] border border-white/10 text-xs text-white"
              >
                {(selectedSeason?.episodes ?? []).map((episode) => (
                  <option key={episode.id} value={episode.id}>
                    {episode.title}
                  </option>
                ))}
              </select>
            </div>
          </section>
        ) : null}

        {/* Watch Servers */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold text-white">سيرفرات المشاهدة</h2>
            <span className="text-[11px] font-semibold text-purple-300 bg-purple-500/15 px-2.5 py-0.5 rounded-full">
              {watchSources.length} سيرفر
            </span>
          </div>

          {!watchSources.length ? (
            <div className="p-5 rounded-2xl bg-[#0d1022] border border-white/8 text-center text-xs text-gray-400">
              لا توجد سيرفرات مشاهدة مباشرة لهذه الحلقة. استخدم روابط التحميل أدناه.
            </div>
          ) : (
            <div className="space-y-2">
              {watchSources.map((source, index) => {
                const isSelected = selected?.id === source.id;
                return (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => selectWatchSource(source.id)}
                    className={`w-full flex items-center justify-between gap-3 p-3 rounded-2xl border transition-all text-right ${
                      isSelected
                        ? "bg-purple-600/20 border-purple-500 shadow-lg shadow-purple-600/15"
                        : "bg-[#0d1022] border-white/8 hover:border-white/25"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <SourceLogo source={source} />
                      <div className="min-w-0">
                        <b className="block text-xs sm:text-sm font-bold text-white truncate">
                          {source.provider || `سيرفر ${index + 1}`}
                        </b>
                        <small className="text-[11px] text-gray-400">
                          {source.quality ? `${source.quality} · ` : ""}
                          {source.hint || "تشغيل داخل التطبيق"}
                        </small>
                      </div>
                    </div>
                    <span
                      className={`text-[11px] font-bold px-3 py-1.5 rounded-xl shrink-0 ${
                        isSelected ? "bg-purple-600 text-white" : "bg-white/5 text-gray-300"
                      }`}
                    >
                      {isSelected ? "يعمل الآن" : "تشغيل"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Download Servers */}
        {downloadSources.length > 0 && (
          <section className="space-y-2.5 pt-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm sm:text-base font-bold text-white">روابط التحميل</h2>
              <span className="text-[11px] font-semibold text-gray-300 bg-white/5 px-2.5 py-0.5 rounded-full">
                {downloadSources.length} روابط
              </span>
            </div>
            <div className="space-y-2">
              {downloadSources.map((source) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-[#0d1022] border border-white/8"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <SourceLogo source={source} />
                    <div className="min-w-0">
                      <b className="block text-xs font-bold text-white truncate">{source.provider}</b>
                      <small className="text-[11px] text-gray-400">
                        {source.quality ? `${source.quality} · ` : ""}
                        {source.size || (source.direct ? "تحميل مباشر" : "صفحة تحميل خارجية")}
                      </small>
                    </div>
                  </div>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline" className="rounded-xl text-xs">
                      <FolderDown size={14} />
                      <span>فتح</span>
                    </Button>
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
