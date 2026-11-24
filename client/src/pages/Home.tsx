import { FormEvent, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowUpRight, Check, Dice5, Filter, Loader2, Play, RefreshCw, RotateCcw, Search, Sparkles, Terminal, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import type { AnimeCard as AnimeCardType, AnimeDetails } from "../../../server/animeApi";

function StatusPill({ value }: { value?: string }) {
  if (!value) return null;
  const normalized = value.toLowerCase();
  const live = normalized.includes("يعرض") || normalized.includes("airing") || normalized.includes("ongoing");
  return <span className={`status-pill ${live ? "status-live" : ""}`}>{value}</span>;
}

export function AnimeCard({ anime, compact = false }: { anime: AnimeCardType; compact?: boolean }) {
  return (
    <Link href={`/anime/${anime.id}`} className={`anime-card group ${compact ? "anime-card-compact" : ""}`}>
      <div className="anime-card-poster">
        {anime.poster ? (
          <img src={anime.poster} alt={anime.title} loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <div className="poster-fallback">
            <Zap size={28} />
            <span>NO SIGNAL</span>
          </div>
        )}
        <div className="poster-scanline" />
        {anime.rating && anime.rating !== "0" ? <div className="rating-badge">★ {anime.rating}</div> : null}
      </div>
      <div className="anime-card-copy">
        <div className="card-meta">
          <StatusPill value={anime.airingDay} />
          <span>{anime.year || "—"}</span>
        </div>
        <h3>{anime.title}</h3>
        <p>{anime.englishTitle || (anime.episodes ? `${anime.episodes} حلقة` : "بيانات غير مكتملة")}</p>
      </div>
    </Link>
  );
}

function SectionHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="section-header">
      <div>
        <span className="section-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

const FALLBACK_GENRES = [
  "إيتشي", "إيسيكاي", "كوميديا", "أكشن", "مغامرات", "رومانسي", "خيال", "دراما",
  "سحر", "غموض", "رعب", "خيال علمي", "خارق للطبيعة", "نفسي", "إثارة", "شونين",
  "شوجو", "سينين", "حريم", "رياضة", "مدرسي", "تاريخي", "شياطين", "قوى خارقة",
  "شريحة من الحياة", "آلات / ميكا", "مصاصي دماء", "فنون قتال", "جريمة", "موسيقى", "ألعاب مميتة"
];

const PRESET_COMBOS = [
  { label: "إيتشي + كوميدي + إيسيكاي", genres: ["إيتشي", "كوميديا", "إيسيكاي"] },
  { label: "أكشن + مغامرات + خيال", genres: ["أكشن", "مغامرات", "خيال"] },
  { label: "رعب + غموض + نفسي", genres: ["رعب", "غموض", "نفسي"] },
  { label: "رومانسي + مدرسي + كوميديا", genres: ["رومانسي", "مدرسي", "كوميديا"] },
];

export default function Home() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [searchPage, setSearchPage] = useState(0);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [genreFilter, setGenreFilter] = useState("");

  const pageSize = 24;
  const latest = trpc.anime.latest.useQuery({ genreId: "18", start: 0, limit: 12 });
  const search = trpc.anime.search.useQuery(
    { keyword: submitted, start: searchPage * pageSize, limit: pageSize },
    { enabled: submitted.length > 0 }
  );

  const random = trpc.anime.random.useQuery(
    { genres: selectedGenres.length ? selectedGenres : undefined },
    { refetchOnWindowFocus: false }
  );

  const discoveredGenres = trpc.anime.genres.useQuery();
  const allGenres = useMemo(() => {
    return discoveredGenres.data?.length ? discoveredGenres.data : FALLBACK_GENRES;
  }, [discoveredGenres.data]);

  const filteredGenres = useMemo(() => {
    if (!genreFilter.trim()) return allGenres;
    const q = genreFilter.trim().toLowerCase();
    return allGenres.filter(g => g.toLowerCase().includes(q));
  }, [allGenres, genreFilter]);

  const toggleGenre = (genre: string) => {
    setSelectedGenres(current =>
      current.includes(genre) ? current.filter(g => g !== genre) : [...current, genre]
    );
  };

  const clearGenres = () => {
    setSelectedGenres([]);
  };

  const applyRandomCombo = () => {
    const pool = [...allGenres];
    const shuffled = pool.sort(() => Math.random() - 0.5);
    const count = Math.random() > 0.5 ? 3 : 2;
    setSelectedGenres(shuffled.slice(0, count));
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    setSearchPage(0);
    setSubmitted(value);
    if (value) document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const activeItems = submitted ? search.data ?? [] : latest.data ?? [];
  const loading = submitted ? search.isLoading : latest.isLoading;
  const error = submitted ? search.error : latest.error;

  return (
    <div className="site-shell">
      <header className="topbar">
        <Link href="/" className="brand-mark">
          <span className="brand-icon">//</span>
          <span>NEON<span>FLIX</span></span>
        </Link>
        <nav className="topnav">
          <a href="#explore">استكشاف</a>
          <a href="#random">اقتراح عشوائي</a>
          <a href="#about">النظام</a>
          <Link href="/account">حسابي</Link>
        </nav>
        <div className="topbar-status">
          <span className="pulse-dot" /> API ONLINE
        </div>
      </header>

      <main>
        {/* HERO SECTION */}
        <section className="hero-section">
          <div className="hero-grid" />
          <div className="hero-content">
            <div className="hero-kicker">
              <Terminal size={14} /> ANIME DISCOVERY NETWORK <span>v.01</span>
            </div>
            <h1>عالمك القادم<br /><em>يبدأ هنا.</em></h1>
            <p>اكتشف عوالم جديدة، تابع الحلقات، واتصل مباشرة بمكتبة الأنمي المتاحة.</p>
            <form className="search-console" onSubmit={submitSearch}>
              <Search size={19} />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="ابحث عن اسم أنمي..."
                aria-label="البحث عن الأنمي"
              />
              <Button type="submit">بحث <ArrowUpRight size={16} /></Button>
            </form>
            <div className="hero-stats">
              <span><b>01</b> بحث مباشر</span>
              <span><b>02</b> مواسم وحلقات</span>
              <span><b>03</b> مصادر خارجية</span>
            </div>
          </div>
          <div className="hero-signal">
            <span>SYNC</span>
            <div className="signal-bars"><i /><i /><i /><i /><i /><i /><i /></div>
            <small>LIVE / CLUSTER</small>
          </div>
        </section>

        {/* EXPLORE FEED */}
        <section id="explore" className="content-section">
          <SectionHeader
            eyebrow={submitted ? "SEARCH RESULTS" : "CURATED FEED / 01"}
            title={submitted ? `نتائج البحث: ${submitted}` : "آخر الإضافات"}
            action={submitted ? (
              <Button variant="ghost" onClick={() => { setSubmitted(""); setQuery(""); setSearchPage(0); }}>
                مسح البحث
              </Button>
            ) : undefined}
          />
          {loading ? (
            <div className="loading-state">
              <Loader2 className="spin" size={26} />
              <span>جاري مزامنة البيانات...</span>
            </div>
          ) : error ? (
            <div className="error-state">
              <span>تعذر الاتصال بمصدر البيانات.</span>
              <small>تحقق من إعدادات API ثم حاول من جديد.</small>
            </div>
          ) : activeItems.length === 0 ? (
            <div className="empty-state">
              <Search size={28} />
              <span>لا توجد نتائج مطابقة.</span>
              <small>جرّب عنوانًا آخر أو كلمة أقصر.</small>
            </div>
          ) : (
            <>
              <div id="results" className="anime-grid">
                {activeItems.map(anime => (
                  <AnimeCard key={anime.id} anime={anime} />
                ))}
              </div>
              {submitted ? (
                <div className="pagination-bar">
                  <Button variant="outline" disabled={searchPage === 0 || search.isFetching} onClick={() => setSearchPage(page => Math.max(0, page - 1))}>
                    السابق
                  </Button>
                  <span>صفحة {searchPage + 1}</span>
                  <Button variant="outline" disabled={activeItems.length < pageSize || search.isFetching} onClick={() => setSearchPage(page => page + 1)}>
                    التالي
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </section>

        {/* RANDOM ANIME DISCOVERY SECTION */}
        <section id="random" className="random-section content-section">
          <div className="random-panel">
            <div>
              <span className="section-eyebrow">DISCOVERY LOOP / 02</span>
              <h2>اختر تصنيفاتك<br /><em>أو دعنا نفاجئك.</em></h2>
              <p>
                ادمج تصنيفات متعددة معاً (مثل: <strong>إيتشي + كوميدي + إيسيكاي</strong>) لاقتراح أنمي يجمعها، أو اتركها فارغة لاقتراح عشوائي شامل عبر جميع سنوات الإنتاج من أقدم أنمي إلى الأحدث.
              </p>

              <div className="random-controls">
                {/* Search & Filter Toolbar */}
                <div className="genre-filter-row">
                  <div className="genre-search-box">
                    <Search size={13} />
                    <input
                      type="text"
                      value={genreFilter}
                      onChange={e => setGenreFilter(e.target.value)}
                      placeholder="تصفية التصنيفات (إيتشي، إيسيكاي، رعب...)"
                      aria-label="تصفية التصنيفات"
                    />
                  </div>
                  <button type="button" className="genre-preset-btn" onClick={applyRandomCombo} title="اختر دمجاً عشوائياً نيابة عني">
                    <Dice5 size={12} style={{ display: "inline", verticalAlign: "middle", marginLeft: 4 }} />
                    دمج عشوائي
                  </button>
                  {selectedGenres.length > 0 && (
                    <button type="button" className="genre-clear-btn" onClick={clearGenres}>
                      <RotateCcw size={11} style={{ display: "inline", verticalAlign: "middle", marginLeft: 3 }} />
                      مسح التحديد
                    </button>
                  )}
                </div>

                {/* Quick Presets */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                  {PRESET_COMBOS.map(combo => {
                    const isSelected = combo.genres.every(g => selectedGenres.includes(g)) && selectedGenres.length === combo.genres.length;
                    return (
                      <button
                        key={combo.label}
                        type="button"
                        onClick={() => setSelectedGenres(combo.genres)}
                        style={{
                          fontSize: "10px",
                          padding: "3px 8px",
                          border: isSelected ? "1px solid #ff2abf" : "1px solid rgba(255,255,255,0.12)",
                          background: isSelected ? "rgba(255,42,191,0.2)" : "rgba(255,255,255,0.03)",
                          color: isSelected ? "#fff" : "#8d97aa",
                          cursor: "pointer",
                          fontFamily: "inherit"
                        }}
                      >
                        {combo.label}
                      </button>
                    );
                  })}
                </div>

                {/* Genre chips picker */}
                <div className="genre-picker" aria-label="اختر تصنيفاً أو أكثر">
                  {filteredGenres.map(genre => {
                    const isActive = selectedGenres.includes(genre);
                    return (
                      <button
                        key={genre}
                        type="button"
                        className={isActive ? "genre-chip genre-chip-active" : "genre-chip"}
                        onClick={() => toggleGenre(genre)}
                      >
                        {genre}
                      </button>
                    );
                  })}
                </div>

                {/* Active Selected Tags Strip */}
                {selectedGenres.length > 0 ? (
                  <div className="selected-tags-strip">
                    <span style={{ fontSize: "10px", color: "#8d9bb5" }}>تم دمج:</span>
                    {selectedGenres.map(genre => (
                      <span key={genre} className="selected-tag-chip" onClick={() => toggleGenre(genre)} title="اضغط للإزالة">
                        {genre} <X size={11} />
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: "11px", color: "#57f5a6", marginTop: 8, fontFamily: "monospace" }}>
                    ✓ لم تختر أي تصنيف: الاقتراح سيكون عشوائياً كلياً من أقدم أنمي إلى الأحدث (1980 - 2026).
                  </div>
                )}

                {/* Roll Action Button */}
                <div className="random-action-row">
                  <span style={{ fontWeight: 600 }}>
                    {selectedGenres.length ? `مطابقة (${selectedGenres.length}) تصنيفات معاً` : "عشوائي شامل عبر التاريخ"}
                  </span>
                  <Button onClick={() => random.refetch()} disabled={random.isFetching}>
                    {random.isFetching ? <RefreshCw className="spin" size={16} /> : <Dice5 size={17} />}
                    {random.isFetching ? "جاري البحث والمطابقة..." : "اقترح لي أنمي 🎲"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Suggested Anime Presentation */}
            {random.isError ? (
              <div className="random-placeholder">
                <Sparkles size={32} />
                <span>NO SIGNAL</span>
                <small>تعذر الوصول إلى الاقتراح الآن، حاول مرة أخرى.</small>
              </div>
            ) : random.data ? (
              <div className="suggested-card-container">
                <div className="anime-card-poster" style={{ height: 260 }}>
                  <img
                    src={random.data.poster || "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx21202-mPOr80AEjUcZ.png"}
                    alt={random.data.title}
                    referrerPolicy="no-referrer"
                  />
                  <div className="poster-scanline" />
                  {random.data.rating && random.data.rating !== "0" ? (
                    <div className="rating-badge">★ {random.data.rating}</div>
                  ) : null}
                </div>

                <div className="anime-card-copy" style={{ direction: "rtl" }}>
                  <div className="suggested-meta-row">
                    <StatusPill value={random.data.airingDay} />
                    <span className="suggested-year-badge">سنة الإنتاج: {random.data.year || "—"}</span>
                  </div>

                  <h3 style={{ fontSize: "16px", margin: "6px 0 2px", color: "#fff" }}>
                    {random.data.title}
                  </h3>

                  {random.data.englishTitle && (
                    <p style={{ color: "#74f7ff", fontSize: "11px", marginBottom: "4px" }}>
                      {random.data.englishTitle}
                    </p>
                  )}

                  {/* Highlighted genres list */}
                  <div className="suggested-genres-pills">
                    {random.data.genres?.map((g, i) => {
                      const label = typeof g === "string" ? g : String((g as Record<string, unknown>)?.name ?? (g as Record<string, unknown>)?.genre_name ?? "");
                      if (!label) return null;
                      const isMatched = selectedGenres.some(selected =>
                        label.toLowerCase().includes(selected.toLowerCase()) ||
                        selected.toLowerCase().includes(label.toLowerCase())
                      );
                      return (
                        <span
                          key={label + i}
                          className={`suggested-genre-pill ${isMatched ? "suggested-genre-match" : ""}`}
                          title={isMatched ? "مطابق لاختيارك!" : undefined}
                        >
                          {isMatched && "★ "}
                          {label}
                        </span>
                      );
                    })}
                  </div>

                  {random.data.description && (
                    <p style={{
                      color: "#949fb5",
                      fontSize: "11px",
                      lineHeight: "1.5",
                      margin: "8px 0",
                      maxHeight: "50px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical"
                    }}>
                      {random.data.description}
                    </p>
                  )}

                  <Link href={`/anime/${random.data.id}`} className="suggested-watch-btn">
                    <Play size={14} /> مشاهدة الأنمي والحلقات
                  </Link>
                </div>
              </div>
            ) : (
              <div className="random-placeholder">
                <Sparkles size={32} />
                <span>READY TO ROLL</span>
                <small>
                  {selectedGenres.length > 0
                    ? `اضغط زر "اقترح لي أنمي" للمطابقة مع: ${selectedGenres.join(" + ")}`
                    : "اضغط زر 'اقترح لي أنمي' لاقتراح عشوائي شامل عبر جميع السنوات."}
                </small>
              </div>
            )}
          </div>
        </section>

        {/* SYSTEM NOTES */}
        <section id="about" className="content-section protocol-section">
          <div className="protocol-line" />
          <div>
            <span className="section-eyebrow">SYSTEM NOTES</span>
            <h2>واجهة بسيطة.<br /><em>اكتشاف بلا ضوضاء.</em></h2>
          </div>
          <p>
            تُعرض روابط المشاهدة والتحميل من المصادر الخارجية كما يوفّرها المصدر، مع فتح صفحة التحميل الخارجية بدل تنزيل الملفات مباشرة من المنصة.
          </p>
        </section>
      </main>

      <footer className="site-footer">
        <span>NEONFLIX // ANIME WATCH NETWORK</span>
        <span>STATUS: <b>CONNECTED</b></span>
      </footer>
    </div>
  );
}
