import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  Bookmark,
  ChevronLeft,
  Compass,
  Film,
  Flame,
  Ghost,
  Heart,
  Home as HomeIcon,
  Layers,
  Loader2,
  Menu,
  MoreVertical,
  Play,
  Search,
  Server,
  Settings,
  Shuffle,
  Smile,
  Sparkles,
  Star,
  Swords,
  User,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsModal } from "@/components/SettingsModal";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  ANIME_SOURCES,
  type AnimeSourceId,
  getLocalFavorites,
  getStoredLayout,
  getStoredSource,
  type RowLayoutMode,
  setStoredLayout,
  setStoredSource,
  toggleLocalFavorite,
} from "@/lib/appSettings";
import { trpc } from "@/lib/trpc";
import type { AnimeCard as AnimeCardType } from "../../../server/animeApi";

// Verified reliable fallback slides (AniList CDN) so Hero never shows broken image icons
const FALLBACK_SLIDES = [
  {
    id: "solo-leveling",
    animeId: "",
    title: "Solo Leveling",
    episode: "الأكثر متابعة",
    tag: "أكشن · خيال · مغامرات",
    image: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/151807-37qyf35v8d6E.jpg",
    searchQuery: "Solo Leveling",
  },
  {
    id: "jujutsu-kaisen",
    animeId: "",
    title: "Jujutsu Kaisen",
    episode: "الأعلى تقييماً",
    tag: "خارق للطبيعة · أكشن",
    image: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/113415-jQBSkxWAAk83.jpg",
    searchQuery: "Jujutsu Kaisen",
  },
  {
    id: "demon-slayer",
    animeId: "",
    title: "Kimetsu no Yaiba",
    episode: "أنمي مميز",
    tag: "أكشن · شياطين · تاريخي",
    image: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/101922-YfZhKBUDDS6L.jpg",
    searchQuery: "Kimetsu no Yaiba",
  },
  {
    id: "one-piece",
    animeId: "",
    title: "One Piece",
    episode: "مستمر أسبوعياً",
    tag: "مغامرات · كوميديا · شونين",
    image: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/21-wf37VakJmZqs.jpg",
    searchQuery: "One Piece",
  },
  {
    id: "attack-on-titan",
    animeId: "",
    title: "Attack on Titan",
    episode: "مكتمل",
    tag: "شونين · دراما · غموض",
    image: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/16498-8jpFCOcDmneX.jpg",
    searchQuery: "Attack on Titan",
  },
];

// Clean genre cards matching the mobile screenshot style (gradients + crisp watermark icons)
const POPULAR_GENRES = [
  { id: "action", name: "أكشن", gradient: "from-[#e63946] to-[#b7094c]", Icon: Swords },
  { id: "adventure", name: "مغامرة", gradient: "from-[#f77f00] to-[#d62828]", Icon: Compass },
  { id: "comedy", name: "كوميديا", gradient: "from-[#00b4d8] to-[#0077b6]", Icon: Smile },
  { id: "isekai", name: "إيسيكاي", gradient: "from-[#7209b7] to-[#480ca8]", Icon: Wand2 },
  { id: "fantasy", name: "خيال", gradient: "from-[#06d6a0] to-[#118ab2]", Icon: Sparkles },
  { id: "romance", name: "رومانسي", gradient: "from-[#ff007f] to-[#aa0055]", Icon: Heart },
  { id: "horror", name: "غموض", gradient: "from-[#4361ee] to-[#3a0ca3]", Icon: Ghost },
  { id: "shounen", name: "شونين", gradient: "from-[#fb5607] to-[#ff006e]", Icon: Flame },
];

const ALL_GENRES = [
  "أكشن", "مغامرات", "كوميديا", "إيسيكاي", "خيال", "خارق للطبيعة",
  "شونين", "سينين", "شوجو", "دراما", "غموض", "رعب", "نفسي",
  "إثارة", "رومانسي", "مدرسي", "سحر", "شياطين", "قوى خارقة",
  "شريحة من الحياة", "رياضة", "تاريخي", "فنون قتال", "موسيقى", "آلات / ميكا",
];

function AnimePosterCard({
  anime,
  layout = "scroll",
  onClickMore,
}: {
  anime: AnimeCardType;
  layout?: RowLayoutMode;
  onClickMore?: (anime: AnimeCardType) => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const ratingNum = parseFloat(anime.rating || "0");
  const displayRating = ratingNum > 0 ? ratingNum.toFixed(1) : "";
  const epNum = anime.episodes || "";

  const widthClass =
    layout === "scroll"
      ? "w-[114px] sm:w-[138px] shrink-0 snap-start"
      : "w-full";

  const isCompact = layout === "grid6";

  return (
    <div className={`${widthClass} group select-none flex flex-col`}>
      <Link href={`/anime/${encodeURIComponent(anime.id)}`} className="block relative">
        <div
          className={`aspect-[2/3] w-full ${
            isCompact ? "rounded-lg" : "rounded-2xl"
          } overflow-hidden relative shadow-lg bg-[#101426] border border-white/8 group-hover:border-purple-500/50 transition-all duration-300`}
        >
          {/* Status badge */}
          {anime.airingDay && !isCompact ? (
            <div className="absolute top-2 right-2 z-10">
              <span className="bg-[#22c55e]/90 backdrop-blur-sm text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-sm">
                {anime.airingDay}
              </span>
            </div>
          ) : null}

          {/* Poster image with safe fallback */}
          {anime.poster && !imgFailed ? (
            <img
              src={anime.poster}
              alt={anime.title}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 bg-gradient-to-br from-[#141932] to-[#0a0d1a] p-2 text-center gap-1.5">
              <Film size={isCompact ? 16 : 24} className="text-purple-400/60" />
              {!isCompact ? (
                <span className="text-[10px] text-gray-400 line-clamp-2 font-medium">{anime.title}</span>
              ) : null}
            </div>
          )}

          {/* Bottom gradient overlay */}
          <div className="absolute bottom-0 inset-x-0 px-2 py-1.5 bg-gradient-to-t from-black/95 via-black/55 to-transparent flex items-center justify-between text-white">
            <span className={`${isCompact ? "text-[8px]" : "text-[10px]"} font-bold text-gray-100 truncate`}>
              {epNum ? (isCompact ? `ح ${epNum}` : `الحلقة ${epNum}`) : anime.year || "أنمي"}
            </span>
            {!isCompact ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onClickMore?.(anime);
                }}
                className="p-0.5 text-gray-300 hover:text-white rounded-full transition-colors"
                aria-label="خيارات"
              >
                <MoreVertical size={13} />
              </button>
            ) : null}
          </div>
        </div>
      </Link>

      {/* Clean title & rating below card */}
      <Link href={`/anime/${encodeURIComponent(anime.id)}`} className={`block ${isCompact ? "pt-1 text-center" : "pt-2"}`}>
        <h3
          className={`${
            isCompact ? "text-[9px]" : "text-xs sm:text-[13px]"
          } font-bold text-white truncate group-hover:text-purple-400 transition-colors`}
          title={anime.title}
        >
          {anime.title}
        </h3>
        <div
          className={`flex items-center ${isCompact ? "justify-center" : "justify-between"} gap-1 mt-0.5 text-[10px] text-gray-400`}
        >
          {displayRating ? (
            <span className="inline-flex items-center gap-0.5 text-amber-400 font-semibold">
              <Star size={10} className="fill-amber-400 text-amber-400" />
              <span>{displayRating}</span>
            </span>
          ) : (
            <span className="text-[10px] text-gray-500">{anime.year || "أنمي"}</span>
          )}
          {!isCompact && anime.year && displayRating ? (
            <span className="text-[10px] text-gray-500">{anime.year}</span>
          ) : null}
        </div>
      </Link>
    </div>
  );
}

function ShelfSkeleton() {
  return (
    <div className="flex gap-3 px-4 overflow-x-hidden">
      {[1, 2, 3, 4].map((n) => (
        <div key={n} className="w-[114px] sm:w-[138px] shrink-0">
          <div className="aspect-[2/3] w-full rounded-2xl bg-[#111528] animate-pulse border border-white/5" />
          <div className="h-3 bg-white/10 rounded-full mt-2 w-4/5 animate-pulse" />
          <div className="h-2.5 bg-white/5 rounded-full mt-1.5 w-1/2 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const [currentSlide, setCurrentSlide] = useState(0);
  const [heroImgFailed, setHeroImgFailed] = useState<Record<string, boolean>>({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewAllSection, setViewAllSection] = useState<{ title: string; genreId?: string; items: AnimeCardType[] } | null>(null);
  const [viewAllLoadingMore, setViewAllLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"home" | "favorites" | "genres">("home");
  const [selectedGenreName, setSelectedGenreName] = useState<string | null>(null);
  const [genreLimit, setGenreLimit] = useState(30);
  const [quickActionAnime, setQuickActionAnime] = useState<AnimeCardType | null>(null);
  const [rowLayout, setRowLayout] = useState<RowLayoutMode>(() => getStoredLayout());
  const [activeSource, setActiveSource] = useState<AnimeSourceId>(() => getStoredSource());
  const [localFavorites, setLocalFavorites] = useState(() => getLocalFavorites());

  const changeSource = async (src: AnimeSourceId) => {
    setStoredSource(src);
    setActiveSource(src);
    setSelectedGenreName(null);
    setHeroImgFailed({});
    setCurrentSlide(0);
    await utils.anime.invalidate();
  };

  const handleSetRowLayout = (layout: RowLayoutMode) => {
    setRowLayout(layout);
    setStoredLayout(layout);
  };

  // Queries
  const latest = trpc.anime.latest.useQuery({ limit: 48 });
  const popular = trpc.anime.latest.useQuery({ genreId: "1", limit: 36 });
  const byGenre = trpc.anime.byGenre.useQuery(
    { genre: selectedGenreName ?? "", start: 0, limit: genreLimit },
    { enabled: Boolean(selectedGenreName) }
  );
  const searchResults = trpc.anime.search.useQuery(
    { keyword: searchQuery.trim(), limit: 24 },
    { enabled: searchQuery.trim().length > 1 }
  );
  const randomQuery = trpc.anime.random.useQuery(
    { genres: selectedGenreName ? [selectedGenreName] : [] },
    { enabled: false }
  );
  const favorites = trpc.account.favorites.useQuery(undefined, { enabled: Boolean(user) });
  const addFavorite = trpc.account.addFavorite.useMutation({ onSuccess: () => favorites.refetch() });
  const removeFavorite = trpc.account.removeFavorite.useMutation({ onSuccess: () => favorites.refetch() });

  // Build Hero Carousel slides using live source anime first, fallback to verified banners
  const featuredSlides = useMemo(() => {
    const liveWithPosters = (latest.data ?? []).filter((a) => a.poster).slice(0, 5);
    if (liveWithPosters.length >= 3) {
      return liveWithPosters.map((item) => ({
        id: item.id,
        animeId: item.id,
        title: item.title,
        episode: item.episodes ? `الحلقة ${item.episodes}` : item.year ? `إصدار ${item.year}` : "يعرض الآن",
        tag: item.genres?.slice(0, 2).join(" · ") || (item.rating ? `تقييم ${item.rating}` : "مختارات المصدر"),
        image: item.poster || "",
        searchQuery: item.title,
      }));
    }
    return FALLBACK_SLIDES;
  }, [latest.data]);

  // Auto-rotate Hero Carousel
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % Math.max(1, featuredSlides.length));
    }, 4500);
    return () => clearInterval(timer);
  }, [featuredSlides.length]);

  const safeSlideIndex = currentSlide % Math.max(1, featuredSlides.length);
  const currentSlideData = featuredSlides[safeSlideIndex] ?? FALLBACK_SLIDES[0];

  const displayLatest = useMemo(() => {
    if (selectedGenreName) return byGenre.data ?? [];
    return latest.data ?? [];
  }, [latest.data, byGenre.data, selectedGenreName]);

  const latestShelf = useMemo(() => displayLatest.slice(0, 20), [displayLatest]);
  const ongoingShelf = useMemo(() => displayLatest.slice(20, 48), [displayLatest]);
  const popularShelf = useMemo(() => (popular.data ?? []).slice(0, 24), [popular.data]);

  const mergedFavorites = useMemo(() => {
    if (user && favorites.data) return favorites.data;
    return localFavorites;
  }, [user, favorites.data, localFavorites]);

  const handleSelectGenre = (genreName: string) => {
    if (selectedGenreName === genreName) {
      setSelectedGenreName(null);
      setGenreLimit(30);
    } else {
      setSelectedGenreName(genreName);
      setGenreLimit(30);
      setTimeout(() => {
        document.getElementById("releases-section")?.scrollIntoView({ behavior: "smooth" });
      }, 60);
    }
  };

  const handleQuickFavorite = (anime: AnimeCardType) => {
    if (user) {
      const isFav = favorites.data?.some((f) => f.contentId === anime.id);
      if (isFav) removeFavorite.mutate({ contentId: anime.id });
      else addFavorite.mutate({ contentId: anime.id, title: anime.title, poster: anime.poster });
    } else {
      const res = toggleLocalFavorite({ contentId: anime.id, title: anime.title, poster: anime.poster });
      setLocalFavorites(res.list);
    }
    setQuickActionAnime(null);
  };

  const handlePickRandom = async () => {
    const res = await randomQuery.refetch();
    if (res.data?.id) {
      setLocation(`/anime/${encodeURIComponent(res.data.id)}`);
    }
  };

  const activeSourceInfo = ANIME_SOURCES.find((s) => s.id === activeSource) ?? ANIME_SOURCES[0];

  const renderShelf = (items: AnimeCardType[], keyPrefix: string) => {
    if (rowLayout === "grid3") {
      return (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 px-4">
          {items.map((anime) => (
            <AnimePosterCard
              key={`${keyPrefix}-${anime.id}`}
              anime={anime}
              layout="grid3"
              onClickMore={(a) => setQuickActionAnime(a)}
            />
          ))}
        </div>
      );
    }
    if (rowLayout === "grid6") {
      return (
        <div className="grid grid-cols-6 gap-1.5 px-2 sm:gap-2.5 sm:px-4">
          {items.map((anime) => (
            <AnimePosterCard
              key={`${keyPrefix}-${anime.id}`}
              anime={anime}
              layout="grid6"
              onClickMore={(a) => setQuickActionAnime(a)}
            />
          ))}
        </div>
      );
    }
    return (
      <div className="flex gap-3 px-4 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory">
        {items.map((anime) => (
          <AnimePosterCard
            key={`${keyPrefix}-${anime.id}`}
            anime={anime}
            layout="scroll"
            onClickMore={(a) => setQuickActionAnime(a)}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#060814] text-white flex flex-col antialiased selection:bg-purple-600 selection:text-white" dir="rtl">
      {/* ─────────────────────────────────────────────────────────────
          CLEAN TOP APP BAR (Safe-area aware, zero overlapping bars)
          ───────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-[#060814]/92 backdrop-blur-xl border-b border-white/5 px-4 pt-safe pb-3 flex items-center justify-between">
        {/* Right: Hamburger Menu */}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="p-2 -mr-2 text-gray-200 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          aria-label="القائمة"
        >
          <Menu size={22} />
        </button>

        {/* Center: Clean App Title */}
        <h1 className="text-base sm:text-lg font-bold text-white tracking-wide">
          تصفح الأنمي
        </h1>

        {/* Left: Settings Gear + Search */}
        <div className="flex items-center gap-1 -ml-2">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
            aria-label="الإعدادات وتبديل المصادر"
            title="الإعدادات وتبديل المصادر"
          >
            <Settings size={20} />
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="p-2 text-gray-200 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
            aria-label="بحث"
          >
            <Search size={21} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 pb-24 max-w-4xl mx-auto w-full">
        {/* Compact In-App Horizontal Source Switcher (All 6 sources, 1-tap switch, zero overlap) */}
        <div className="px-4 pt-2.5 pb-0.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {ANIME_SOURCES.map((src) => {
            const isSelected = activeSource === src.id;
            return (
              <button
                key={src.id}
                type="button"
                onClick={() => {
                  if (!isSelected) void changeSource(src.id);
                }}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap shrink-0 transition-all border ${
                  isSelected
                    ? "bg-purple-600 text-white border-purple-400 shadow-md shadow-purple-600/30"
                    : "bg-[#0e1122] text-gray-300 border-white/10 hover:border-white/25 hover:text-white"
                }`}
              >
                {src.label}
              </button>
            );
          })}
        </div>

        {/* ─────────────────────────────────────────────────────────────
            FEATURED HERO CAROUSEL
            ───────────────────────────────────────────────────────────── */}
        <section className="px-4 pt-3 pb-1">
          <div className="relative w-full h-[196px] sm:h-[260px] rounded-2xl overflow-hidden shadow-2xl border border-white/10 group bg-gradient-to-br from-[#131836] via-[#0e1124] to-[#080a16]">
            {currentSlideData.image && !heroImgFailed[currentSlideData.id] ? (
              <img
                src={currentSlideData.image}
                alt=""
                referrerPolicy="no-referrer"
                onError={() =>
                  setHeroImgFailed((prev) => ({ ...prev, [currentSlideData.id]: true }))
                }
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/35 via-[#0f1328] to-pink-900/25">
                <Sparkles size={44} className="text-purple-400/30" />
              </div>
            )}

            {/* Smooth Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#060814] via-black/45 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-l from-black/50 via-transparent to-transparent" />

            {/* Slide Content */}
            <div className="absolute bottom-0 inset-x-0 p-4 sm:p-6 flex flex-col justify-end text-white pointer-events-none">
              <span className="text-[11px] text-purple-200 font-semibold mb-1 flex items-center gap-1.5 drop-shadow">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                {currentSlideData.tag}
              </span>
              <h2 className="text-lg sm:text-2xl font-black text-white drop-shadow-md mb-0.5 line-clamp-1">
                {currentSlideData.title}
              </h2>
              <p className="text-xs text-gray-300 font-medium drop-shadow">
                {currentSlideData.episode}
              </p>
            </div>

            {/* Click Action */}
            <button
              type="button"
              onClick={() => {
                if (currentSlideData.animeId) {
                  setLocation(`/anime/${encodeURIComponent(currentSlideData.animeId)}`);
                } else {
                  setSearchQuery(currentSlideData.searchQuery);
                  setSearchOpen(true);
                }
              }}
              className="absolute inset-0 w-full h-full cursor-pointer z-10"
              aria-label={`شاهد ${currentSlideData.title}`}
            />
          </div>

          {/* Pagination Dots */}
          <div className="flex items-center justify-center gap-1.5 py-3">
            {featuredSlides.map((slide, idx) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => setCurrentSlide(idx)}
                className={`transition-all duration-300 ${
                  safeSlideIndex === idx
                    ? "w-6 h-1.5 rounded-full bg-[#e60049] shadow-sm shadow-rose-500/50"
                    : "w-1.5 h-1.5 rounded-full bg-white/25 hover:bg-white/40"
                }`}
                aria-label={`شريحة ${idx + 1}`}
              />
            ))}
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────
            SECTION 1: الإصدارات الحديثة أو نتائج التصنيف المختار
            ───────────────────────────────────────────────────────────── */}
        <section id="releases-section" className="pt-1 pb-5">
          <div className="px-4 mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white truncate">
                {selectedGenreName ? `تصنيف: ${selectedGenreName}` : "الإصدارات الحديثة"}
              </h2>
              {selectedGenreName ? (
                <button
                  type="button"
                  onClick={() => setSelectedGenreName(null)}
                  className="text-[11px] text-purple-300 bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0"
                >
                  <span>مسح</span>
                  <X size={11} />
                </button>
              ) : null}
            </div>
            {displayLatest.length > 0 ? (
              <button
                type="button"
                onClick={() =>
                  setViewAllSection({
                    title: selectedGenreName ? `تصنيف: ${selectedGenreName}` : "الإصدارات الحديثة",
                    genreId: selectedGenreName ? undefined : "18",
                    items: displayLatest,
                  })
                }
                className="text-xs font-semibold text-gray-400 hover:text-white flex items-center gap-0.5 transition-colors shrink-0"
              >
                <span>عرض الكل</span>
                <ChevronLeft size={14} />
              </button>
            ) : null}
          </div>

          {(selectedGenreName ? byGenre.isLoading : latest.isLoading) ? (
            <ShelfSkeleton />
          ) : (selectedGenreName ? byGenre.error : latest.error) ? (
            <div className="mx-4 p-5 rounded-2xl bg-[#0e1122] border border-white/10 text-center space-y-2">
              <p className="text-xs text-gray-300">تعذر جلب القائمة من {activeSourceInfo.label}</p>
              <div className="flex items-center justify-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => (selectedGenreName ? byGenre.refetch() : latest.refetch())}
                >
                  إعادة المحاولة
                </Button>
                <Button size="sm" onClick={() => setSettingsOpen(true)}>
                  تبديل المصدر
                </Button>
              </div>
            </div>
          ) : selectedGenreName ? (
            displayLatest.length ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 px-4">
                  {displayLatest.map((anime) => (
                    <AnimePosterCard
                      key={`genre-${anime.id}`}
                      anime={anime}
                      layout="grid3"
                      onClickMore={(a) => setQuickActionAnime(a)}
                    />
                  ))}
                </div>
                {displayLatest.length >= genreLimit && genreLimit < 80 ? (
                  <div className="px-4 flex justify-center">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setGenreLimit((prev) => Math.min(80, prev + 30))}
                      disabled={byGenre.isFetching}
                      className="rounded-xl text-xs"
                    >
                      {byGenre.isFetching ? "جاري التحميل..." : "تحميل المزيد"}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mx-4 p-6 rounded-2xl bg-[#0e1122] border border-white/5 text-center space-y-2">
                <p className="text-xs text-gray-400">
                  لا توجد نتائج مطابقة لتصنيف "{selectedGenreName}" في {activeSourceInfo.label}.
                </p>
                <div className="flex items-center justify-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSelectedGenreName(null)}>
                    العودة للكل
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setSearchQuery(selectedGenreName);
                      setSearchOpen(true);
                    }}
                  >
                    بحث شامل
                  </Button>
                </div>
              </div>
            )
          ) : latestShelf.length ? (
            renderShelf(latestShelf, "latest")
          ) : (
            <div className="mx-4 p-6 rounded-2xl bg-[#0e1122] border border-white/5 text-center space-y-2">
              <p className="text-xs text-gray-400">لا توجد عناصر حالياً في هذا المصدر.</p>
            </div>
          )}
        </section>

        {/* ─────────────────────────────────────────────────────────────
            SECTION 2: الأنواع الشائعة
            ───────────────────────────────────────────────────────────── */}
        <section className="pt-1 pb-6">
          <div className="px-4 mb-3 flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-bold text-white">الأنواع الشائعة</h2>
            <button
              type="button"
              onClick={() => setActiveTab("genres")}
              className="text-xs font-semibold text-gray-400 hover:text-white flex items-center gap-0.5 transition-colors"
            >
              <span>عرض المزيد</span>
              <ChevronLeft size={14} />
            </button>
          </div>

          <div className="flex gap-3 px-4 overflow-x-auto no-scrollbar scroll-smooth">
            {POPULAR_GENRES.map((genre) => {
              const Icon = genre.Icon;
              const isSelected = selectedGenreName === genre.name;
              return (
                <button
                  key={genre.id}
                  type="button"
                  onClick={() => handleSelectGenre(genre.name)}
                  className={`w-[148px] h-[74px] shrink-0 rounded-2xl relative overflow-hidden flex items-end justify-start p-3 cursor-pointer shadow-lg bg-gradient-to-r ${genre.gradient} transition-all duration-200 select-none border ${
                    isSelected ? "border-white ring-2 ring-white/50 scale-[1.02]" : "border-white/10 hover:scale-[1.02]"
                  }`}
                >
                  <span className="font-bold text-white text-sm sm:text-base drop-shadow-md z-10">
                    {genre.name}
                  </span>
                  <Icon
                    size={54}
                    strokeWidth={1.6}
                    className="absolute -left-2 -bottom-2 text-white/25 pointer-events-none rotate-12"
                  />
                </button>
              );
            })}
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────
            SECTION 3: الأكثر شهرة ومتابعة
            ───────────────────────────────────────────────────────────── */}
        <section className="pt-1 pb-5">
          <div className="px-4 mb-3 flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-1.5">
              <span>الأكثر شهرة</span>
              <Sparkles size={15} className="text-purple-400" />
            </h2>
            {popularShelf.length > 0 ? (
              <button
                type="button"
                onClick={() => setViewAllSection({ title: "الأكثر شهرة", genreId: "1", items: popular.data ?? [] })}
                className="text-xs font-semibold text-gray-400 hover:text-white flex items-center gap-0.5 transition-colors"
              >
                <span>عرض المزيد</span>
                <ChevronLeft size={14} />
              </button>
            ) : null}
          </div>

          {popular.isLoading ? (
            <ShelfSkeleton />
          ) : popularShelf.length ? (
            renderShelf(popularShelf, "popular")
          ) : null}
        </section>

        {/* ─────────────────────────────────────────────────────────────
            SECTION 4: أنميات مستمرة / إضافات أخرى (if available)
            ───────────────────────────────────────────────────────────── */}
        {ongoingShelf.length > 0 && !selectedGenreName ? (
          <section className="pt-1 pb-5">
            <div className="px-4 mb-3 flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-bold text-white">المزيد من الأنميات</h2>
              <button
                type="button"
                onClick={() => setViewAllSection({ title: "المزيد من الأنميات", genreId: "18", items: displayLatest })}
                className="text-xs font-semibold text-gray-400 hover:text-white flex items-center gap-0.5 transition-colors"
              >
                <span>عرض المزيد</span>
                <ChevronLeft size={14} />
              </button>
            </div>
            {renderShelf(ongoingShelf, "more")}
          </section>
        ) : null}

        {/* ─────────────────────────────────────────────────────────────
            QUICK RANDOM PICK BANNER
            ───────────────────────────────────────────────────────────── */}
        <section className="px-4 pt-1 pb-4">
          <div className="rounded-2xl bg-gradient-to-r from-[#1a1033] via-[#121429] to-[#0d1424] border border-purple-500/20 p-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white">محتار وش تتابع؟</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">خلينا نختار لك أنمي عشوائي من {activeSourceInfo.label}</p>
            </div>
            <button
              type="button"
              onClick={handlePickRandom}
              disabled={randomQuery.isFetching}
              className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 shadow-lg shadow-purple-600/30 transition-colors disabled:opacity-60"
            >
              {randomQuery.isFetching ? <Loader2 size={14} className="animate-spin" /> : <Shuffle size={14} />}
              <span>اقتراح عشوائي</span>
            </button>
          </div>
        </section>
      </main>

      {/* ─────────────────────────────────────────────────────────────
          BOTTOM NAVIGATION BAR (Docked Mobile App Navbar)
          ───────────────────────────────────────────────────────────── */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-[#070914]/95 backdrop-blur-2xl border-t border-white/10 px-6 pt-2 pb-safe flex items-center justify-around max-w-lg mx-auto sm:rounded-t-2xl shadow-2xl">
        {/* Tab 1: الرئيسية */}
        <button
          type="button"
          onClick={() => {
            setActiveTab("home");
            setSelectedGenreName(null);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className={`flex flex-col items-center justify-center transition-all ${
            activeTab === "home"
              ? "bg-[#5822b4] text-white p-2.5 rounded-xl shadow-lg shadow-purple-600/40"
              : "text-gray-400 hover:text-white p-2"
          }`}
          aria-label="الرئيسية"
        >
          <HomeIcon size={20} />
        </button>

        {/* Tab 2: المفضلة */}
        <button
          type="button"
          onClick={() => setActiveTab("favorites")}
          className={`flex flex-col items-center justify-center p-2 transition-colors relative ${
            activeTab === "favorites" ? "text-purple-400 font-bold" : "text-gray-400 hover:text-white"
          }`}
          aria-label="المفضلة"
        >
          <Bookmark size={21} />
          {mergedFavorites.length > 0 ? (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500" />
          ) : null}
        </button>

        {/* Tab 3: التصنيفات */}
        <button
          type="button"
          onClick={() => setActiveTab("genres")}
          className={`flex flex-col items-center justify-center p-2 transition-colors ${
            activeTab === "genres" ? "text-purple-400 font-bold" : "text-gray-400 hover:text-white"
          }`}
          aria-label="التصنيفات"
        >
          <Layers size={21} />
        </button>

        {/* Tab 4: حسابي (Clean inline SVG/User icon, never broken image) */}
        <Link href="/account" className="flex flex-col items-center justify-center p-1.5 group" aria-label="حسابي">
          <div className="w-8 h-8 rounded-full ring-2 ring-purple-500/60 group-hover:ring-purple-400 transition-all bg-gradient-to-br from-purple-600/40 to-indigo-600/40 flex items-center justify-center text-purple-200">
            <User size={16} />
          </div>
        </Link>
      </nav>

      {/* ─────────────────────────────────────────────────────────────
          SETTINGS SHEET / MODAL
          ───────────────────────────────────────────────────────────── */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        activeSource={activeSource}
        onChangeSource={changeSource}
        rowLayout={rowLayout}
        onChangeLayout={handleSetRowLayout}
      />

      {/* ─────────────────────────────────────────────────────────────
          VIEW ALL SECTION MODAL
          ───────────────────────────────────────────────────────────── */}
      {viewAllSection && (
        <div className="fixed inset-0 z-50 bg-[#060814]/98 backdrop-blur-2xl flex flex-col animate-in fade-in duration-200">
          <header className="bg-[#080b18]/90 border-b border-white/10 px-4 pt-safe pb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-white">{viewAllSection.title}</h2>
            <button
              type="button"
              onClick={() => setViewAllSection(null)}
              className="p-2 text-gray-400 hover:text-white rounded-xl"
            >
              <X size={20} />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto p-4 pb-safe space-y-5">
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {viewAllSection.items.map((anime) => (
                <AnimePosterCard
                  key={`all-${anime.id}`}
                  anime={anime}
                  layout="grid3"
                  onClickMore={(a) => setQuickActionAnime(a)}
                />
              ))}
            </div>
            {viewAllSection.genreId ? (
              <div className="flex justify-center pt-2 pb-4">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={viewAllLoadingMore}
                  onClick={async () => {
                    if (!viewAllSection?.genreId || viewAllLoadingMore) return;
                    setViewAllLoadingMore(true);
                    try {
                      const more = await utils.anime.latest.fetch({
                        genreId: viewAllSection.genreId,
                        start: viewAllSection.items.length,
                        limit: 48,
                      });
                      if (Array.isArray(more) && more.length) {
                        setViewAllSection((prev) => {
                          if (!prev) return prev;
                          const seen = new Set(prev.items.map((x) => x.id));
                          const merged = [...prev.items, ...more.filter((x) => !seen.has(x.id))];
                          return { ...prev, items: merged };
                        });
                      }
                    } finally {
                      setViewAllLoadingMore(false);
                    }
                  }}
                  className="rounded-xl text-xs"
                >
                  {viewAllLoadingMore ? "جاري التحميل..." : "تحميل المزيد من الأنميات"}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          SEARCH OVERLAY / MODAL
          ───────────────────────────────────────────────────────────── */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-[#060814]/98 backdrop-blur-2xl flex flex-col p-4 pt-safe animate-in fade-in duration-200">
          <div className="flex items-center gap-3 pb-3 border-b border-white/10">
            <button
              type="button"
              onClick={() => {
                setSearchOpen(false);
                setSearchQuery("");
              }}
              className="p-2 text-gray-400 hover:text-white rounded-xl"
            >
              <ArrowRight size={22} />
            </button>
            <div className="flex-1 relative">
              <Input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`ابحث في ${activeSourceInfo.label}...`}
                className="w-full bg-[#111424] border-white/10 text-white pl-9 pr-4 py-2.5 rounded-xl h-11 text-sm focus:border-purple-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute left-3 top-3 text-gray-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-4 pb-safe">
            {searchResults.isLoading ? (
              <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
                <Loader2 size={24} className="animate-spin text-purple-400" />
                <span>جاري البحث في {activeSourceInfo.label}...</span>
              </div>
            ) : searchResults.data?.length ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {searchResults.data.map((anime) => (
                  <AnimePosterCard
                    key={`search-${anime.id}`}
                    anime={anime}
                    layout="grid3"
                    onClickMore={(a) => setQuickActionAnime(a)}
                  />
                ))}
              </div>
            ) : searchQuery.trim().length > 1 ? (
              <div className="text-center py-20 text-gray-400">
                <Search size={36} className="mx-auto mb-2 text-gray-600" />
                <p>لم يتم العثور على أنمي مطابق لـ "{searchQuery}"</p>
              </div>
            ) : (
              <div className="py-4">
                <h3 className="text-xs font-bold text-gray-400 mb-3">اقتراحات سريعة للبحث:</h3>
                <div className="flex flex-wrap gap-2">
                  {["Solo Leveling", "One Piece", "Attack on Titan", "Demon Slayer", "Jujutsu Kaisen", "Bleach", "Naruto"].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSearchQuery(s)}
                      className="text-xs bg-white/5 hover:bg-white/10 text-gray-300 px-3 py-1.5 rounded-xl border border-white/5 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          FAVORITES SHEET / OVERLAY
          ───────────────────────────────────────────────────────────── */}
      {activeTab === "favorites" && (
        <div className="fixed inset-0 z-50 bg-[#060814]/98 backdrop-blur-2xl flex flex-col p-4 pt-safe animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Bookmark size={20} className="text-purple-400" />
              <span>قائمتي المفضلة</span>
            </h2>
            <button
              type="button"
              onClick={() => setActiveTab("home")}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-4 pb-safe">
            {!mergedFavorites.length ? (
              <div className="text-center py-24 text-gray-400">
                <Heart size={40} className="mx-auto mb-3 text-gray-600" />
                <h3 className="text-base font-bold text-white mb-1">لا توجد أنميات في المفضلة بعد</h3>
                <p className="text-xs text-gray-400 mb-4">انقر على علامة القلب أو الثلاث نقاط في أي أنمي لحفظه هنا.</p>
                <Button onClick={() => setActiveTab("home")} variant="outline" size="sm">
                  تصفح الأنميات الآن
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {mergedFavorites.map((fav) => (
                  <Link
                    key={fav.contentId}
                    href={`/anime/${encodeURIComponent(fav.contentId)}`}
                    onClick={() => setActiveTab("home")}
                    className="flex flex-col bg-[#0e1122] rounded-2xl overflow-hidden border border-white/10 hover:border-purple-500/40 transition-colors"
                  >
                    <div className="aspect-[2/3] w-full bg-[#14182e] relative">
                      {fav.poster ? (
                        <img
                          src={fav.poster}
                          alt={fav.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500">
                          <Film size={24} />
                        </div>
                      )}
                    </div>
                    <div className="p-2 text-center">
                      <h4 className="text-[11px] font-bold text-white truncate">{fav.title}</h4>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          GENRES SHEET / OVERLAY
          ───────────────────────────────────────────────────────────── */}
      {activeTab === "genres" && (
        <div className="fixed inset-0 z-50 bg-[#060814]/98 backdrop-blur-2xl flex flex-col p-4 pt-safe animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Layers size={20} className="text-purple-400" />
              <span>جميع التصنيفات</span>
            </h2>
            <button
              type="button"
              onClick={() => setActiveTab("home")}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-4 pb-safe">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              {ALL_GENRES.map((genre) => (
                <button
                  key={genre}
                  type="button"
                  onClick={() => {
                    handleSelectGenre(genre);
                    setActiveTab("home");
                  }}
                  className="p-3 rounded-2xl bg-[#0e1122] hover:bg-purple-600/20 border border-white/10 hover:border-purple-500/50 text-center font-bold text-xs sm:text-sm text-gray-200 hover:text-white transition-all flex items-center justify-center"
                >
                  <span>{genre}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          SIDE DRAWER MENU
          ───────────────────────────────────────────────────────────── */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={() => setMenuOpen(false)}
          />

          <div className="relative w-72 max-w-[82vw] bg-[#0a0d1d] h-full p-5 pt-safe pb-safe flex flex-col z-10 shadow-2xl border-l border-white/10 animate-in slide-in-from-right duration-200">
            {/* Brand Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-pink-600 flex items-center justify-center font-black text-sm text-white shadow-lg shadow-purple-600/30">
                  AS
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Anime Sky</h3>
                  <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {activeSourceInfo.label}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="p-1.5 text-gray-400 hover:text-white rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            {/* Navigation */}
            <div className="flex-1 py-4 space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setActiveTab("home");
                }}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl text-gray-200 hover:text-white hover:bg-white/5 transition-colors font-semibold text-sm"
              >
                <HomeIcon size={18} className="text-purple-400" />
                <span>الرئيسية</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setActiveTab("favorites");
                }}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl text-gray-200 hover:text-white hover:bg-white/5 transition-colors font-semibold text-sm"
              >
                <Bookmark size={18} className="text-amber-400" />
                <span>المفضلة</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setActiveTab("genres");
                }}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl text-gray-200 hover:text-white hover:bg-white/5 transition-colors font-semibold text-sm"
              >
                <Layers size={18} className="text-cyan-400" />
                <span>التصنيفات والأنواع</span>
              </button>
              <Link
                href="/account"
                onClick={() => setMenuOpen(false)}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl text-gray-200 hover:text-white hover:bg-white/5 transition-colors font-semibold text-sm"
              >
                <User size={18} className="text-emerald-400" />
                <span>الملف الشخصي</span>
              </Link>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setSettingsOpen(true);
                  }}
                  className="w-full flex items-center justify-between gap-3 p-3 rounded-xl bg-purple-600/15 border border-purple-500/35 text-white hover:bg-purple-600/25 transition-colors font-bold text-sm"
                >
                  <span className="flex items-center gap-2.5">
                    <Settings size={18} className="text-purple-300" />
                    <span>الإعدادات والمصادر</span>
                  </span>
                  <ChevronLeft size={16} className="text-purple-300" />
                </button>
              </div>
            </div>

            {/* Active Source Summary Card */}
            <div className="p-3 bg-[#111428] rounded-xl border border-white/5 mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server size={15} className="text-purple-400" />
                <div>
                  <span className="text-[10px] text-gray-400 block">المصدر النشط</span>
                  <strong className="text-xs text-white">{activeSourceInfo.label}</strong>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setSettingsOpen(true);
                }}
                className="text-[11px] font-bold text-purple-300 hover:text-white bg-purple-600/20 px-2.5 py-1 rounded-lg"
              >
                تبديل
              </button>
            </div>

            <div className="pt-2 border-t border-white/10 text-center">
              <p className="text-[10px] text-gray-500">Anime Sky iOS App v1.3</p>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          QUICK ACTION POPUP FOR THREE DOTS BUTTON
          ───────────────────────────────────────────────────────────── */}
      {quickActionAnime && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setQuickActionAnime(null)}
          />
          <div className="relative w-full max-w-sm bg-[#0e1124] rounded-2xl p-5 z-10 border border-white/10 shadow-2xl animate-in slide-in-from-bottom-4 duration-200">
            <div className="flex items-center gap-3 pb-3 border-b border-white/10">
              {quickActionAnime.poster ? (
                <img
                  src={quickActionAnime.poster}
                  alt={quickActionAnime.title}
                  referrerPolicy="no-referrer"
                  className="w-12 h-16 object-cover rounded-lg"
                />
              ) : null}
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-sm text-white truncate">{quickActionAnime.title}</h4>
                <p className="text-xs text-gray-400">{quickActionAnime.year || "أنمي"}</p>
              </div>
              <button
                type="button"
                onClick={() => setQuickActionAnime(null)}
                className="text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <div className="pt-3 space-y-2">
              <Link
                href={`/anime/${encodeURIComponent(quickActionAnime.id)}`}
                onClick={() => setQuickActionAnime(null)}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs justify-center transition-colors"
              >
                <Play size={14} /> مشاهدة الأنمي والحلقات
              </Link>
              <button
                type="button"
                onClick={() => handleQuickFavorite(quickActionAnime)}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-200 font-bold text-xs justify-center transition-colors"
              >
                <Heart size={14} className="text-rose-400" />
                <span>
                  {mergedFavorites.some((f) => f.contentId === quickActionAnime.id)
                    ? "إزالة من المفضلة"
                    : "إضافة إلى المفضلة"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
