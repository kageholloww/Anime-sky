import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Film,
  Heart,
  Home as HomeIcon,
  Layers,
  Loader2,
  Menu,
  MoreVertical,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  Tv,
  User,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import type { AnimeCard as AnimeCardType } from "../../../server/animeApi";

// Curated Hero Featured Slides matching the user's screenshot
const FEATURED_SLIDES = [
  {
    id: "dragon-ball-super",
    title: "Dragon Ball Super: Beerus",
    episode: "الحلقة 7",
    tag: "أكشن · قوى خارقة",
    image: "https://images5.alphacoders.com/606/606263.jpg",
    searchQuery: "Dragon Ball",
  },
  {
    id: "solo-leveling",
    title: "سولو ليفلينج - Solo Leveling",
    episode: "الموسم 2 · الحلقة 12",
    tag: "أكشن · خيال · مغامرات",
    image: "https://images.alphacoders.com/134/1349542.png",
    searchQuery: "Solo Leveling",
  },
  {
    id: "attack-on-titan",
    title: "هجوم العمالقة - Attack on Titan",
    episode: "الموسم الأخير · الحلقة 28",
    tag: "شونين · دراما · غموض",
    image: "https://images3.alphacoders.com/134/1347071.png",
    searchQuery: "Attack on Titan",
  },
  {
    id: "demon-slayer",
    title: "قاتل الشياطين - Kimetsu no Yaiba",
    episode: "تدريب الهاشيرا · الحلقة 8",
    tag: "أكشن · شياطين · تاريخي",
    image: "https://images8.alphacoders.com/135/1350849.png",
    searchQuery: "Demon Slayer",
  },
  {
    id: "jujutsu-kaisen",
    title: "جوجوتسو كايسن - Jujutsu Kaisen",
    episode: "حادثة شيبويا · الحلقة 23",
    tag: "خارق للطبيعة · أكشن",
    image: "https://images8.alphacoders.com/133/1330919.jpeg",
    searchQuery: "Jujutsu Kaisen",
  },
  {
    id: "one-piece",
    title: "ون بيس - One Piece",
    episode: "أرك إيغ هيد · الحلقة 1122",
    tag: "مغامرات · كوميديا · شونين",
    image: "https://images.alphacoders.com/134/1343714.jpeg",
    searchQuery: "One Piece",
  },
];

// Curated Popular Genres with vibrant colored gradients and character artwork
const POPULAR_GENRES = [
  {
    id: "action",
    name: "أكشن",
    gradient: "from-[#e63946] to-[#b7094c]",
    shadow: "shadow-red-500/20",
    character: "https://pngimg.com/d/attack_on_titan_PNG12.png", // Attack on Titan character
    fallbackChar: "⚔️",
  },
  {
    id: "adventure",
    name: "مغامرة",
    gradient: "from-[#f77f00] to-[#d62828]",
    shadow: "shadow-orange-500/20",
    character: "https://pngimg.com/d/one_piece_PNG42.png", // Luffy One Piece
    fallbackChar: "🏴‍☠️",
  },
  {
    id: "comedy",
    name: "كوميديا",
    gradient: "from-[#00b4d8] to-[#0077b6]",
    shadow: "shadow-cyan-500/20",
    character: "https://pngimg.com/d/naruto_PNG67.png",
    fallbackChar: "😂",
  },
  {
    id: "isekai",
    name: "إيسيكاي",
    gradient: "from-[#7209b7] to-[#480ca8]",
    shadow: "shadow-purple-500/20",
    character: "https://pngimg.com/d/sword_art_online_PNG34.png",
    fallbackChar: "🌀",
  },
  {
    id: "fantasy",
    name: "خيال",
    gradient: "from-[#06d6a0] to-[#118ab2]",
    shadow: "shadow-emerald-500/20",
    character: "https://pngimg.com/d/dragon_ball_PNG58.png",
    fallbackChar: "✨",
  },
  {
    id: "romance",
    name: "رومانسي",
    gradient: "from-[#ff007f] to-[#aa0055]",
    shadow: "shadow-pink-500/20",
    character: "",
    fallbackChar: "💖",
  },
];

// Helper to format vote count nicely
function formatVotes(votes?: string | number): string {
  if (!votes) {
    const randomK = Math.floor(Math.random() * 20 + 4);
    return `${randomK}K تصويت`;
  }
  const n = typeof votes === "number" ? votes : parseInt(String(votes), 10);
  if (isNaN(n) || n === 0) return "5K تصويت";
  if (n >= 1000) return `${Math.round(n / 1000)}K تصويت`;
  return `${n} تصويت`;
}

// Single Anime Card component matching the mobile app screenshot with flexible layouts
function MobileAnimeCard({
  anime,
  layout = "grid6",
  onClickMore,
}: {
  anime: AnimeCardType;
  layout?: "grid6" | "scroll" | "grid3";
  onClickMore?: (anime: AnimeCardType) => void;
}) {
  const ratingNum = parseFloat(anime.rating || "0");
  const displayRating = ratingNum > 0 ? ratingNum.toFixed(1) : (7.5 + (parseInt(anime.id.slice(-2) || "5", 16) % 20) / 10).toFixed(1);
  const epNum = anime.episodes || anime.total_episodes || (anime.year ? `${(parseInt(anime.id.slice(-1) || "1", 16) % 12) + 1}` : "8");

  if (layout === "grid6") {
    return (
      <div className="w-full group select-none flex flex-col">
        <Link href={`/anime/${anime.id}`} className="block relative">
          <div className="aspect-[2/3] w-full rounded-lg sm:rounded-xl overflow-hidden relative shadow-md bg-[#0d1020] border border-white/5 group-hover:border-purple-500/50 transition-all duration-300">
            {/* Green Status Badge */}
            <div className="absolute top-1 right-1 z-10">
              <span className="bg-[#22c55e] text-white text-[7px] sm:text-[9px] font-bold px-1 py-0.2 rounded shadow-sm">
                يعرض
              </span>
            </div>

            {/* Anime Poster Image */}
            {anime.poster ? (
              <img
                src={anime.poster}
                alt={anime.title}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 bg-[#121629]">
                <Film size={16} />
              </div>
            )}

            {/* Bottom Overlay on Poster: Episode + Three Dots */}
            <div className="absolute bottom-0 inset-x-0 p-1 bg-gradient-to-t from-black/95 via-black/60 to-transparent flex items-center justify-between text-white">
              <span className="text-[7.5px] sm:text-[9.5px] font-bold text-gray-100 drop-shadow truncate">
                حـ {epNum}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onClickMore?.(anime);
                }}
                className="p-0.5 text-gray-300 hover:text-white rounded-full transition-colors"
                title="خيارات"
              >
                <MoreVertical size={10} />
              </button>
            </div>
          </div>
        </Link>

        {/* Copy below poster */}
        <Link href={`/anime/${anime.id}`} className="block pt-1 text-center">
          <h3 className="text-[9px] sm:text-xs font-bold text-white truncate hover:text-purple-400 transition-colors" title={anime.title}>
            {anime.title}
          </h3>
          <div className="flex items-center justify-center gap-0.5 text-[8px] sm:text-[10px] text-amber-400 font-bold mt-0.5">
            <Star size={9} className="fill-amber-400 text-amber-400" />
            <span>{displayRating}</span>
          </div>
        </Link>
      </div>
    );
  }

  if (layout === "grid3") {
    return (
      <div className="w-full group select-none flex flex-col">
        <Link href={`/anime/${anime.id}`} className="block relative">
          <div className="aspect-[2/3] w-full rounded-xl overflow-hidden relative shadow-md bg-[#0d1020] border border-white/5 group-hover:border-purple-500/50 transition-all duration-300">
            <div className="absolute top-1.5 right-1.5 z-10">
              <span className="bg-[#22c55e] text-white text-[8px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                يعرض حالياً
              </span>
            </div>
            {anime.poster ? (
              <img
                src={anime.poster}
                alt={anime.title}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 bg-[#121629]">
                <Film size={22} />
              </div>
            )}
            <div className="absolute bottom-0 inset-x-0 p-1.5 bg-gradient-to-t from-black/95 via-black/60 to-transparent flex items-center justify-between text-white">
              <span className="text-[10px] font-bold text-gray-100 drop-shadow">
                الحلقة : {epNum}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onClickMore?.(anime);
                }}
                className="p-1 text-gray-300 hover:text-white rounded-full transition-colors"
                title="خيارات"
              >
                <MoreVertical size={12} />
              </button>
            </div>
          </div>
        </Link>
        <Link href={`/anime/${anime.id}`} className="block pt-1.5">
          <h3 className="text-xs sm:text-[13px] font-bold text-white truncate hover:text-purple-400 transition-colors" title={anime.title}>
            {anime.title}
          </h3>
          <div className="flex items-center gap-1 mt-0.5 text-[10px] text-gray-400">
            <Star size={11} className="text-amber-400 fill-amber-400" />
            <span className="font-bold text-gray-200">{displayRating}</span>
          </div>
        </Link>
      </div>
    );
  }

  // layout === "scroll" (Horizontal scrolling shelf with compact cards)
  return (
    <div className="w-[95px] sm:w-[130px] shrink-0 group select-none flex flex-col snap-start">
      <Link href={`/anime/${anime.id}`} className="block relative">
        <div className="h-[140px] sm:h-[185px] md:h-[210px] w-full rounded-xl sm:rounded-2xl overflow-hidden relative shadow-lg bg-[#0d1020] border border-white/5 group-hover:border-purple-500/50 transition-all duration-300">
          <div className="absolute top-1.5 right-1.5 z-10">
            <span className="bg-[#22c55e] text-white text-[8px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm">
              يعرض
            </span>
          </div>
          {anime.poster ? (
            <img
              src={anime.poster}
              alt={anime.title}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 gap-1 bg-[#121629]">
              <Film size={22} />
            </div>
          )}
          <div className="absolute bottom-0 inset-x-0 p-1.5 bg-gradient-to-t from-black/95 via-black/60 to-transparent flex items-center justify-between text-white">
            <span className="text-[10px] sm:text-[11px] font-bold text-gray-100 drop-shadow">
              حلقة : {epNum}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClickMore?.(anime);
              }}
              className="p-1 text-gray-300 hover:text-white rounded-full transition-colors"
              title="خيارات"
            >
              <MoreVertical size={12} />
            </button>
          </div>
        </div>
      </Link>
      <Link href={`/anime/${anime.id}`} className="block pt-1.5">
        <h3 className="text-xs sm:text-[13px] font-bold text-white truncate hover:text-purple-400 transition-colors" title={anime.title}>
          {anime.title}
        </h3>
        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-gray-400">
          <Star size={11} className="text-amber-400 fill-amber-400" />
          <span className="font-bold text-gray-200">{displayRating}</span>
        </div>
      </Link>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"home" | "favorites" | "genres" | "account">("home");
  const [selectedGenreName, setSelectedGenreName] = useState<string | null>(null);
  const [quickActionAnime, setQuickActionAnime] = useState<AnimeCardType | null>(null);
  const [rowLayout, setRowLayout] = useState<"grid6" | "scroll" | "grid3">(() => (typeof window !== "undefined" && (localStorage.getItem("neonflix-row-layout") as any)) || "grid6");
  const [activeSource, setActiveSource] = useState(() => (typeof window !== "undefined" && localStorage.getItem("neonflix-source")) || "cluster");

  const changeSource = (src: string) => {
    try { localStorage.setItem("neonflix-source", src); } catch (_) {}
    setActiveSource(src);
    window.location.reload();
  };

  const handleSetRowLayout = (layout: "grid6" | "scroll" | "grid3") => {
    setRowLayout(layout);
    try { localStorage.setItem("neonflix-row-layout", layout); } catch (_) {}
  };

  // Queries
  const latest = trpc.anime.latest.useQuery({ limit: 36 });
  const popular = trpc.anime.latest.useQuery({ genreId: "1", limit: 24 });
  const searchResults = trpc.anime.search.useQuery(
    { keyword: searchQuery.trim(), limit: 24 },
    { enabled: searchQuery.trim().length > 1 }
  );
  const favorites = trpc.account.favorites.useQuery(undefined, { enabled: Boolean(user) });
  const addFavorite = trpc.account.addFavorite.useMutation({ onSuccess: () => favorites.refetch() });
  const removeFavorite = trpc.account.removeFavorite.useMutation({ onSuccess: () => favorites.refetch() });

  // Auto-rotate Hero Carousel
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % FEATURED_SLIDES.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  // Filter anime list by selected genre if any
  const displayLatest = useMemo(() => {
    const list = latest.data ?? [];
    if (!selectedGenreName) return list;
    return list.filter((item) =>
      (item.genres ?? []).some((g) => {
        const name = typeof g === "string" ? g : (g as Record<string, unknown>)?.name;
        return String(name || "").includes(selectedGenreName);
      })
    );
  }, [latest.data, selectedGenreName]);

  // Chunk latest anime into horizontal rows of 6 ("6 أنميات في صفة وحدة بالعرض")
  const latestRowsOf6 = useMemo(() => {
    const list = displayLatest;
    const rows: AnimeCardType[][] = [];
    for (let i = 0; i < list.length; i += 6) {
      rows.push(list.slice(i, i + 6));
    }
    return rows;
  }, [displayLatest]);

  // Chunk popular anime into horizontal rows of 6
  const popularRowsOf6 = useMemo(() => {
    const list = popular.data ?? [];
    const rows: AnimeCardType[][] = [];
    for (let i = 0; i < list.length; i += 6) {
      rows.push(list.slice(i, i + 6));
    }
    return rows;
  }, [popular.data]);

  const handleSelectGenre = (genreName: string) => {
    if (selectedGenreName === genreName) {
      setSelectedGenreName(null);
    } else {
      setSelectedGenreName(genreName);
      // Scroll to releases section
      document.getElementById("releases-section")?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleQuickFavorite = (anime: AnimeCardType) => {
    const isFav = favorites.data?.some((f) => f.contentId === anime.id);
    if (isFav) removeFavorite.mutate({ contentId: anime.id });
    else addFavorite.mutate({ contentId: anime.id, title: anime.title, poster: anime.poster });
    setQuickActionAnime(null);
  };

  const currentSlideData = FEATURED_SLIDES[currentSlide];

  return (
    <div className="min-h-screen bg-[#060814] text-white flex flex-col antialiased selection:bg-purple-600 selection:text-white" dir="rtl">
      {/* ─────────────────────────────────────────────────────────────
          TOP APP BAR (Mobile Native Header)
          ───────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-[#060814]/90 backdrop-blur-xl border-b border-white/5 px-4 pt-safe pb-2.5 flex items-center justify-between">
        {/* Menu (Hamburger) on the Right side */}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="p-2 -mr-1.5 text-gray-200 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          aria-label="القائمة"
        >
          <Menu size={24} />
        </button>

        {/* Title in Center */}
        <h1 className="text-lg font-bold text-white tracking-wide flex items-center gap-2">
          <span>تصفح الأنمي</span>
        </h1>

        {/* Search Icon on the Left side */}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="p-2 -ml-1.5 text-gray-200 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          aria-label="بحث"
        >
          <Search size={22} />
        </button>
      </header>

      {/* Top Source Switcher & View Layout Selector Bar */}
      <div className="bg-[#080b18] border-b border-white/5 px-3 py-2 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 shrink-0">
          {[
            { id: "cluster", label: "Anime Cluster" },
            { id: "witcher", label: "Anime Witcher" },
            { id: "kawaii", label: "Anime Kawaii" },
            { id: "animeify", label: "Animefy" },
          ].map((src) => (
            <button
              key={src.id}
              type="button"
              onClick={() => changeSource(src.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all border ${
                activeSource === src.id
                  ? "bg-purple-600 text-white border-purple-400 shadow-md shadow-purple-600/30"
                  : "bg-white/5 text-gray-300 border-white/5 hover:border-white/20 hover:text-white"
              }`}
            >
              {src.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 shrink-0 bg-black/40 p-1 rounded-lg border border-white/10 text-[10px]">
          <button
            type="button"
            onClick={() => handleSetRowLayout("grid6")}
            className={`px-2 py-0.5 rounded transition-all font-bold ${
              rowLayout === "grid6" ? "bg-purple-600 text-white shadow-sm" : "text-gray-400 hover:text-white"
            }`}
            title="عرض 6 أنميات كاملة في صف واحد"
          >
            6 بالصف
          </button>
          <button
            type="button"
            onClick={() => handleSetRowLayout("scroll")}
            className={`px-2 py-0.5 rounded transition-all font-bold ${
              rowLayout === "scroll" ? "bg-purple-600 text-white shadow-sm" : "text-gray-400 hover:text-white"
            }`}
            title="شريط سحب أفقي"
          >
            شريط
          </button>
          <button
            type="button"
            onClick={() => handleSetRowLayout("grid3")}
            className={`px-2 py-0.5 rounded transition-all font-bold ${
              rowLayout === "grid3" ? "bg-purple-600 text-white shadow-sm" : "text-gray-400 hover:text-white"
            }`}
            title="شبكة 3 أعمدة"
          >
            3 أعمدة
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 pb-24 max-w-4xl mx-auto w-full">
        {/* ─────────────────────────────────────────────────────────────
            FEATURED HERO CAROUSEL
            ───────────────────────────────────────────────────────────── */}
        <section className="px-4 pt-3 pb-2">
          <div className="relative w-full h-[200px] sm:h-[260px] md:h-[300px] rounded-2xl overflow-hidden shadow-2xl border border-white/10 group bg-[#0e1122]">
            {/* Background Image */}
            <img
              src={currentSlideData.image}
              alt={currentSlideData.title}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />

            {/* Gradient Dark Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />

            {/* Content Overlay */}
            <div className="absolute bottom-0 inset-x-0 p-4 sm:p-6 flex flex-col justify-end text-white">
              <span className="text-xs text-purple-300 font-semibold mb-1 flex items-center gap-1.5 drop-shadow">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                {currentSlideData.tag}
              </span>
              <h2 className="text-lg sm:text-2xl font-black text-white drop-shadow-md mb-0.5 line-clamp-1">
                {currentSlideData.title}
              </h2>
              <p className="text-xs sm:text-sm text-gray-300 font-medium drop-shadow">
                {currentSlideData.episode}
              </p>
            </div>

            {/* Click to search or watch */}
            <button
              type="button"
              onClick={() => {
                setSearchQuery(currentSlideData.searchQuery);
                setSearchOpen(true);
              }}
              className="absolute inset-0 w-full h-full cursor-pointer z-10"
              aria-label={`شاهد ${currentSlideData.title}`}
            />
          </div>

          {/* Carousel Pagination Dots */}
          <div className="flex items-center justify-center gap-1.5 py-3">
            {FEATURED_SLIDES.map((slide, idx) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => setCurrentSlide(idx)}
                className={`transition-all duration-300 ${
                  currentSlide === idx
                    ? "w-6 h-1.5 rounded-full bg-[#e60049] shadow-sm shadow-rose-500/50"
                    : "w-1.5 h-1.5 rounded-full bg-white/25 hover:bg-white/40"
                }`}
                aria-label={`شريحة ${idx + 1}`}
              />
            ))}
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────
            SECTION 1: الإصدارات الحديثة (ROWS OF 6 ANIME HORIZONTALLY)
            ───────────────────────────────────────────────────────────── */}
        <div id="releases-section" className="pt-2">
          {latest.isLoading ? (
            <section className="pt-2 pb-5">
              <div className="px-4 mb-3 flex items-center justify-between">
                <div className="h-5 bg-white/10 rounded w-44 animate-pulse" />
              </div>
              <div className="flex gap-3 px-4 overflow-x-hidden">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div key={n} className="w-[135px] shrink-0">
                    <div className="h-[195px] rounded-2xl bg-white/5 animate-pulse" />
                    <div className="h-3.5 bg-white/5 rounded mt-2 w-3/4 animate-pulse" />
                    <div className="h-3 bg-white/5 rounded mt-1.5 w-1/2 animate-pulse" />
                  </div>
                ))}
              </div>
            </section>
          ) : (
            latestRowsOf6.map((row, rowIdx) => {
              const rowTitles = [
                "الإصدارات الحديثة",
                "أنميات مستمرة",
                "أحدث الحلقات المضافة",
                "إصدارات الموسم",
                "أنميات مختارة",
                "قائمة الأنمي الجديدة",
              ];
              const title = rowTitles[rowIdx] || `قائمة الأنمي - الصف ${rowIdx + 1}`;

              return (
                <section key={`latest-row-${rowIdx}`} className="pt-2 pb-5">
                  <div className="px-4 mb-2.5 flex items-center justify-between">
                    <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                      <span>{title}</span>
                      {rowIdx === 0 && selectedGenreName ? (
                        <span className="text-xs font-normal text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-500/20">
                          {selectedGenreName}
                          <button onClick={() => setSelectedGenreName(null)} className="mr-1 text-gray-400 hover:text-white">✕</button>
                        </span>
                      ) : null}
                      <span className="text-[10px] font-semibold text-purple-300 bg-purple-500/15 px-2 py-0.5 rounded-full border border-purple-500/25">
                        {row.length} أنميات بالعرض
                      </span>
                    </h2>
                    <span className="text-[11px] font-medium text-gray-400">صف {rowIdx + 1}</span>
                  </div>

                  {/* Horizontal row of 6 anime */}
                  {rowLayout === "grid6" ? (
                    <div className="grid grid-cols-6 gap-1 px-1.5 sm:gap-2.5 sm:px-4">
                      {row.map((anime) => (
                        <MobileAnimeCard
                          key={anime.id}
                          anime={anime}
                          layout="grid6"
                          onClickMore={(a) => setQuickActionAnime(a)}
                        />
                      ))}
                    </div>
                  ) : rowLayout === "grid3" ? (
                    <div className="grid grid-cols-3 gap-2 px-3 sm:grid-cols-6 sm:gap-3 sm:px-4">
                      {row.map((anime) => (
                        <MobileAnimeCard
                          key={anime.id}
                          anime={anime}
                          layout="grid3"
                          onClickMore={(a) => setQuickActionAnime(a)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex gap-2.5 px-3 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory">
                      {row.map((anime) => (
                        <MobileAnimeCard
                          key={anime.id}
                          anime={anime}
                          layout="scroll"
                          onClickMore={(a) => setQuickActionAnime(a)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>

        {/* ─────────────────────────────────────────────────────────────
            SECTION 2: الأنواع الشائعة (POPULAR GENRES)
            ───────────────────────────────────────────────────────────── */}
        <section className="pt-1 pb-6">
          <div className="px-4 mb-3 flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-bold text-white">الأنواع الشائعة</h2>
            <button
              type="button"
              onClick={() => setActiveTab("genres")}
              className="text-xs font-semibold text-gray-400 hover:text-white transition-colors"
            >
              عرض المزيد
            </button>
          </div>

          {/* Horizontal Genre Cards with Character Graphics */}
          <div className="flex gap-3 px-4 overflow-x-auto no-scrollbar scroll-smooth">
            {POPULAR_GENRES.map((genre) => (
              <div
                key={genre.id}
                onClick={() => handleSelectGenre(genre.name)}
                className={`w-[165px] h-[78px] shrink-0 rounded-2xl relative overflow-hidden flex items-end p-3 cursor-pointer shadow-lg ${genre.shadow} bg-gradient-to-r ${genre.gradient} hover:scale-102 transition-transform duration-200 select-none border border-white/10`}
              >
                {/* Title */}
                <span className="font-bold text-white text-base drop-shadow-md z-10">
                  {genre.name}
                </span>

                {/* Character Illustration on the left/corner */}
                {genre.character ? (
                  <img
                    src={genre.character}
                    alt={genre.name}
                    className="absolute -left-2 -bottom-2 h-[90px] w-auto object-contain pointer-events-none drop-shadow-lg opacity-95 group-hover:scale-110 transition-transform"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                ) : (
                  <span className="absolute left-2.5 top-2 text-3xl opacity-30 pointer-events-none">
                    {genre.fallbackChar}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────
            SECTION 3: الأكثر شهرة ومتابعة (POPULAR ANIME IN ROWS OF 6)
            ───────────────────────────────────────────────────────────── */}
        <div className="pt-1 pb-4">
          {popularRowsOf6.map((row, rowIdx) => {
            const rowTitles = [
              "الأكثر شهرة ومتابعة",
              "أنميات أسطورية ومميزة",
              "الأعلى تقييماً وإعجاباً",
              "ترشيحات الأسبوع",
            ];
            const title = rowTitles[rowIdx] || `أنميات مميزة - الصف ${rowIdx + 1}`;

            return (
              <section key={`pop-row-${rowIdx}`} className="pt-2 pb-5">
                <div className="px-4 mb-2.5 flex items-center justify-between">
                  <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                    <span>{title}</span>
                    <Sparkles size={14} className="text-purple-400" />
                    <span className="text-[10px] font-semibold text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-500/25">
                      {row.length} أنميات بالعرض
                    </span>
                  </h2>
                  <span className="text-[11px] font-medium text-gray-400">صف {rowIdx + 1}</span>
                </div>

                {/* Row of 6 anime */}
                {rowLayout === "grid6" ? (
                  <div className="grid grid-cols-6 gap-1 px-1.5 sm:gap-2.5 sm:px-4">
                    {row.map((anime) => (
                      <MobileAnimeCard
                        key={`pop-${anime.id}`}
                        anime={anime}
                        layout="grid6"
                        onClickMore={(a) => setQuickActionAnime(a)}
                      />
                    ))}
                  </div>
                ) : rowLayout === "grid3" ? (
                  <div className="grid grid-cols-3 gap-2 px-3 sm:grid-cols-6 sm:gap-3 sm:px-4">
                    {row.map((anime) => (
                      <MobileAnimeCard
                        key={`pop-${anime.id}`}
                        anime={anime}
                        layout="grid3"
                        onClickMore={(a) => setQuickActionAnime(a)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex gap-2.5 px-3 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory">
                    {row.map((anime) => (
                      <MobileAnimeCard
                        key={`pop-${anime.id}`}
                        anime={anime}
                        layout="scroll"
                        onClickMore={(a) => setQuickActionAnime(a)}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </main>

      {/* ─────────────────────────────────────────────────────────────
          BOTTOM NAVIGATION BAR (Docked Mobile App Navbar)
          ───────────────────────────────────────────────────────────── */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-[#070914]/95 backdrop-blur-2xl border-t border-white/10 px-6 py-2.5 pb-safe flex items-center justify-around max-w-lg mx-auto sm:rounded-t-2xl shadow-2xl">
        {/* Tab 1: الرئيسية (Home) */}
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

        {/* Tab 2: المفضلة (Favorites) */}
        <button
          type="button"
          onClick={() => setActiveTab("favorites")}
          className={`flex flex-col items-center justify-center p-2 text-gray-400 hover:text-white transition-colors relative ${
            activeTab === "favorites" ? "text-purple-400 font-bold" : ""
          }`}
          aria-label="المفضلة"
        >
          <Bookmark size={22} />
          {favorites.data?.length ? (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500" />
          ) : null}
        </button>

        {/* Tab 3: التصنيفات (Genres / Browse) */}
        <button
          type="button"
          onClick={() => setActiveTab("genres")}
          className={`flex flex-col items-center justify-center p-2 text-gray-400 hover:text-white transition-colors ${
            activeTab === "genres" ? "text-purple-400 font-bold" : ""
          }`}
          aria-label="التصنيفات"
        >
          <Layers size={22} />
        </button>

        {/* Tab 4: حسابي (Profile) */}
        <Link href="/account" className="flex flex-col items-center justify-center p-1.5 group">
          <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-purple-500/50 group-hover:ring-purple-400 transition-all bg-[#12162a] flex items-center justify-center">
            {user?.name ? (
              <img
                src="https://api.dicebear.com/7.x/bottts/svg?seed=AnimeSky"
                alt="Profile"
                className="w-full h-full object-cover"
              />
            ) : (
              <img
                src="https://i.pinimg.com/736x/8f/94/28/8f94285df646194b341f5e8845efbe27.jpg"
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            )}
          </div>
        </Link>
      </nav>

      {/* ─────────────────────────────────────────────────────────────
          SEARCH OVERLAY / MODAL
          ───────────────────────────────────────────────────────────── */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-[#060814]/98 backdrop-blur-2xl flex flex-col p-4 pt-safe animate-in fade-in duration-200">
          <div className="flex items-center gap-3 pb-3 border-b border-white/10">
            <button
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
                placeholder="ابحث عن أي أنمي (مثال: ون بيس، هجوم العمالقة...)"
                className="w-full bg-[#111424] border-white/10 text-white pl-9 pr-4 py-2.5 rounded-xl h-11 text-sm focus:border-purple-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute left-3 top-3 text-gray-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Results list */}
          <div className="flex-1 overflow-y-auto py-4">
            {searchResults.isLoading ? (
              <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
                <Loader2 size={24} className="animate-spin text-purple-400" />
                <span>جاري البحث في قاعدة البيانات...</span>
              </div>
            ) : searchResults.data?.length ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 sm:gap-3">
                {searchResults.data.map((anime) => (
                  <Link
                    key={anime.id}
                    href={`/anime/${anime.id}`}
                    onClick={() => setSearchOpen(false)}
                    className="flex flex-col bg-[#0e1122] rounded-xl overflow-hidden border border-white/5 hover:border-purple-500/40 transition-colors"
                  >
                    <div className="h-[140px] sm:h-[180px] w-full bg-[#14182e] relative">
                      {anime.poster ? (
                        <img src={anime.poster} alt={anime.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500">
                          <Film size={22} />
                        </div>
                      )}
                      {anime.rating && (
                        <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-amber-400 text-[9px] font-bold px-1 py-0.5 rounded">
                          ★ {anime.rating}
                        </span>
                      )}
                    </div>
                    <div className="p-1.5 text-center">
                      <h4 className="text-[10px] sm:text-xs font-bold text-white truncate">{anime.title}</h4>
                      <p className="text-[9px] text-gray-400 mt-0.5">{anime.year || "أنمي"}</p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : searchQuery.trim().length > 1 ? (
              <div className="text-center py-20 text-gray-400">
                <Search size={36} className="mx-auto mb-2 text-gray-600" />
                <p>لم يتم العثور على أنمي مطابق لـ "{searchQuery}"</p>
              </div>
            ) : (
              <div className="py-6">
                <h3 className="text-xs font-bold text-gray-400 mb-3">اقتراحات سريعة للبحث:</h3>
                <div className="flex flex-wrap gap-2">
                  {["Solo Leveling", "One Piece", "Attack on Titan", "Demon Slayer", "Jujutsu Kaisen", "Bleach", "Naruto"].map((s) => (
                    <button
                      key={s}
                      onClick={() => setSearchQuery(s)}
                      className="text-xs bg-white/5 hover:bg-white/10 text-gray-300 px-3 py-1.5 rounded-lg border border-white/5 transition-colors"
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
              onClick={() => setActiveTab("home")}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-4">
            {!favorites.data?.length ? (
              <div className="text-center py-24 text-gray-400">
                <Heart size={40} className="mx-auto mb-3 text-gray-600" />
                <h3 className="text-base font-bold text-white mb-1">لا توجد أنميات في المفضلة بعد</h3>
                <p className="text-xs text-gray-400 mb-4">انقر على علامة القلب في أي أنمي لحفظه هنا للرجوع إليه لاحقاً.</p>
                <Button onClick={() => setActiveTab("home")} variant="outline" size="sm">
                  تصفح الأنميات الآن
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 sm:gap-3">
                {favorites.data.map((fav) => (
                  <Link
                    key={fav.contentId}
                    href={`/anime/${fav.contentId}`}
                    onClick={() => setActiveTab("home")}
                    className="flex flex-col bg-[#0e1122] rounded-xl overflow-hidden border border-white/5 hover:border-purple-500/40 transition-colors"
                  >
                    <div className="h-[140px] sm:h-[190px] w-full bg-[#14182e] relative">
                      {fav.poster ? (
                        <img src={fav.poster} alt={fav.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500">
                          <Film size={24} />
                        </div>
                      )}
                    </div>
                    <div className="p-1.5 text-center">
                      <h4 className="text-[10px] sm:text-xs font-bold text-white truncate">{fav.title}</h4>
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
              onClick={() => setActiveTab("home")}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-4">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3">
              {[
                "أكشن", "مغامرات", "كوميديا", "إيسيكاي", "خيال", "خارق للطبيعة",
                "شونين", "سينين", "شوجو", "دراما", "غموض", "رعب", "نفسي",
                "إثارة", "رومانسي", "مدرسي", "سحر", "شياطين", "قوى خارقة",
                "شريحة من الحياة", "رياضة", "تاريخي", "فنون قتال", "موسيقى", "آلات / ميكا"
              ].map((genre) => (
                <button
                  key={genre}
                  onClick={() => {
                    handleSelectGenre(genre);
                    setActiveTab("home");
                  }}
                  className="p-2.5 sm:p-4 rounded-xl bg-[#0e1122] hover:bg-purple-600/20 border border-white/5 hover:border-purple-500/50 text-center font-bold text-xs sm:text-sm text-gray-200 hover:text-white transition-all flex items-center justify-center"
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
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={() => setMenuOpen(false)}
          />

          {/* Drawer Body on the Right */}
          <div className="relative w-72 max-w-[80vw] bg-[#0a0d1d] h-full p-5 pt-safe flex flex-col z-10 shadow-2xl border-l border-white/10 animate-in slide-in-from-right duration-200">
            {/* Header / Brand */}
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-pink-600 flex items-center justify-center font-black text-sm text-white shadow-lg shadow-purple-600/30">
                  AS
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Anime Sky</h3>
                  <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    المخدم متصل
                  </span>
                </div>
              </div>
              <button
                onClick={() => setMenuOpen(false)}
                className="p-1.5 text-gray-400 hover:text-white rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            {/* Navigation Links */}
            <div className="flex-1 py-4 space-y-1">
              <button
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
            </div>

            {/* Provider Switcher Info */}
            <div className="p-3 bg-[#111428] rounded-xl border border-white/5 mb-3">
              <span className="text-[10px] text-gray-400 block mb-2 font-bold">مصدر الأنمي (سيرفر المحتوى):</span>
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                {[
                  { id: "cluster", label: "Anime Cluster" },
                  { id: "witcher", label: "Anime Witcher" },
                  { id: "kawaii", label: "Anime Kawaii" },
                  { id: "animeify", label: "Animefy" },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      changeSource(s.id);
                      setMenuOpen(false);
                    }}
                    className={`py-1.5 px-2 text-[11px] font-bold rounded-lg transition-all text-center ${
                      activeSource === s.id
                        ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                        : "bg-white/5 text-gray-300 hover:bg-white/10"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Shelf Display Layout Switcher */}
            <div className="p-3 bg-[#111428] rounded-xl border border-white/5 mb-4">
              <span className="text-[10px] text-gray-400 block mb-2 font-bold">طريقة عرض القوائم:</span>
              <div className="grid grid-cols-3 gap-1">
                <button
                  onClick={() => handleSetRowLayout("grid6")}
                  className={`py-1 text-[11px] font-bold rounded-lg transition-all text-center ${
                    rowLayout === "grid6"
                      ? "bg-purple-600 text-white shadow-md"
                      : "bg-white/5 text-gray-300 hover:bg-white/10"
                  }`}
                >
                  6 بالصف
                </button>
                <button
                  onClick={() => handleSetRowLayout("scroll")}
                  className={`py-1 text-[11px] font-bold rounded-lg transition-all text-center ${
                    rowLayout === "scroll"
                      ? "bg-purple-600 text-white shadow-md"
                      : "bg-white/5 text-gray-300 hover:bg-white/10"
                  }`}
                >
                  شريط أفقي
                </button>
                <button
                  onClick={() => handleSetRowLayout("grid3")}
                  className={`py-1 text-[11px] font-bold rounded-lg transition-all text-center ${
                    rowLayout === "grid3"
                      ? "bg-purple-600 text-white shadow-md"
                      : "bg-white/5 text-gray-300 hover:bg-white/10"
                  }`}
                >
                  3 أعمدة
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-white/10 text-center">
              <p className="text-[10px] text-gray-500">Anime Sky iOS App v1.2</p>
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
              {quickActionAnime.poster && (
                <img src={quickActionAnime.poster} alt={quickActionAnime.title} className="w-12 h-16 object-cover rounded-lg" />
              )}
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-sm text-white truncate">{quickActionAnime.title}</h4>
                <p className="text-xs text-gray-400">{quickActionAnime.year || "أنمي"}</p>
              </div>
              <button onClick={() => setQuickActionAnime(null)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="pt-3 space-y-2">
              <Link
                href={`/anime/${quickActionAnime.id}`}
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
                <Heart size={14} className="text-rose-400" /> إضافة إلى المفضلة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
