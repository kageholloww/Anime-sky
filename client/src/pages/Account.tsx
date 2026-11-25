import { FormEvent, useState } from "react";
import {
  ArrowRight,
  Film,
  Heart,
  History,
  Loader2,
  LogIn,
  LogOut,
  Server,
  Settings,
  UserPlus,
  UserRound,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
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
} from "@/lib/appSettings";
import { trpc } from "@/lib/trpc";

type Mode = "login" | "register";

async function submitAuth(mode: Mode, username: string, password: string) {
  const response = await fetch(`/api/auth/${mode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "تعذر تنفيذ العملية.");
  return body;
}

export default function Account() {
  const { user, loading, logout, refresh } = useAuth();
  const utils = trpc.useUtils();
  const favorites = trpc.account.favorites.useQuery(undefined, { enabled: Boolean(user) });
  const history = trpc.account.history.useQuery(undefined, { enabled: Boolean(user) });

  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeSource, setActiveSource] = useState<AnimeSourceId>(() => getStoredSource());
  const [rowLayout, setRowLayout] = useState<RowLayoutMode>(() => getStoredLayout());
  const localFavorites = getLocalFavorites();

  const handleChangeSource = async (src: AnimeSourceId) => {
    setStoredSource(src);
    setActiveSource(src);
    await utils.anime.invalidate();
  };

  const handleChangeLayout = (layout: RowLayoutMode) => {
    setRowLayout(layout);
    setStoredLayout(layout);
  };

  const activeSourceLabel = ANIME_SOURCES.find((s) => s.id === activeSource)?.label ?? "Anime Cluster";

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060814] text-white flex flex-col items-center justify-center gap-3" dir="rtl">
        <Loader2 className="animate-spin text-purple-400" size={28} />
        <span className="text-sm text-gray-300">جاري التحقق من الحساب...</span>
      </div>
    );
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      await submitAuth(mode, username, password);
      setPassword("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تنفيذ العملية.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#060814] text-white flex flex-col antialiased pb-safe" dir="rtl">
      <header className="sticky top-0 z-40 bg-[#060814]/92 backdrop-blur-xl border-b border-white/5 px-4 pt-safe pb-3 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-200 hover:text-white bg-white/5 px-3 py-1.5 rounded-xl border border-white/10"
        >
          <ArrowRight size={17} />
          <span>العودة</span>
        </Link>
        <h1 className="text-base font-bold text-white">الملف الشخصي</h1>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-200 hover:text-white"
          aria-label="الإعدادات"
        >
          <Settings size={18} />
        </button>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-5 space-y-5">
        {/* Quick Settings & Source Card */}
        <section className="rounded-2xl bg-[#0d1022] border border-white/10 p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/35 flex items-center justify-center text-purple-300">
              <Server size={18} />
            </div>
            <div>
              <span className="text-[11px] text-gray-400 block">مصدر المحتوى الحالي</span>
              <strong className="text-sm text-white">{activeSourceLabel}</strong>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setSettingsOpen(true)}
            className="rounded-xl bg-purple-600 hover:bg-purple-700 text-xs font-bold"
          >
            الإعدادات وتبديل المصدر
          </Button>
        </section>

        {!user ? (
          <section className="rounded-2xl bg-[#0d1022] border border-white/10 p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
                <UserRound size={22} />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">
                  {mode === "login" ? "تسجيل الدخول" : "إنشاء حساب جديد"}
                </h2>
                <p className="text-xs text-gray-400">
                  {mode === "login"
                    ? "ادخل إلى حسابك لحفظ المفضلة وسجل المشاهدة."
                    : "أنشئ حساباً باسم مستخدم وكلمة مرور فقط."}
                </p>
              </div>
            </div>

            <form className="space-y-3" onSubmit={onSubmit}>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="اسم المستخدم"
                minLength={3}
                maxLength={32}
                required
                autoComplete="username"
                className="w-full h-11 px-3.5 rounded-xl bg-[#060814] border border-white/15 text-sm text-white focus:outline-none focus:border-purple-500"
              />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="كلمة المرور"
                minLength={6}
                required
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className="w-full h-11 px-3.5 rounded-xl bg-[#060814] border border-white/15 text-sm text-white focus:outline-none focus:border-purple-500"
              />
              {error ? (
                <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300">
                  {error}
                </div>
              ) : null}
              <Button
                type="submit"
                disabled={pending}
                className="w-full h-11 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm font-bold"
              >
                {pending ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : mode === "login" ? (
                  <LogIn size={16} />
                ) : (
                  <UserPlus size={16} />
                )}
                <span>{mode === "login" ? "تسجيل الدخول" : "إنشاء الحساب"}</span>
              </Button>
            </form>

            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
              className="w-full text-center text-xs text-purple-300 hover:text-white py-1"
            >
              {mode === "login" ? "ليس لديك حساب؟ إنشاء حساب جديد" : "لديك حساب؟ تسجيل الدخول"}
            </button>

            {localFavorites.length > 0 && (
              <div className="pt-3 border-t border-white/10">
                <h3 className="text-xs font-bold text-gray-300 mb-2">المفضلة المحلية ({localFavorites.length})</h3>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                  {localFavorites.map((item) => (
                    <Link
                      href={`/anime/${encodeURIComponent(item.contentId)}`}
                      key={item.contentId}
                      className="rounded-xl bg-[#131730] border border-white/10 overflow-hidden"
                    >
                      <div className="aspect-[2/3] bg-[#181d3a] flex items-center justify-center">
                        {item.poster ? (
                          <img src={item.poster} alt={item.title} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                        ) : (
                          <Film size={20} className="text-gray-500" />
                        )}
                      </div>
                      <p className="p-1.5 text-[10px] font-bold text-white truncate text-center">{item.title}</p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>
        ) : (
          <>
            <section className="rounded-2xl bg-[#0d1022] border border-white/10 p-5 flex items-center justify-between gap-3">
              <div>
                <span className="text-[11px] text-emerald-400 font-semibold">الحساب متصل</span>
                <h2 className="text-xl font-black text-white mt-0.5">مرحباً، {user.name}</h2>
                <p className="text-xs text-gray-400 mt-0.5">يتم مزامنة المفضلة وسجل المشاهدة تلقائياً.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => logout()} className="rounded-xl text-xs">
                <LogOut size={14} />
                <span>خروج</span>
              </Button>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-[#0d1022] border border-white/10 p-4 space-y-3">
                <div className="flex items-center gap-2 border-b border-white/10 pb-2.5">
                  <Heart size={17} className="text-rose-400" />
                  <h3 className="text-sm font-bold text-white">المفضلة</h3>
                </div>
                {favorites.isLoading ? (
                  <Loader2 className="animate-spin text-purple-400" />
                ) : !favorites.data?.length ? (
                  <p className="text-xs text-gray-400 py-8 text-center">لم تضف أي أنمي للمفضلة بعد.</p>
                ) : (
                  <div className="space-y-2">
                    {favorites.data.map((item) => (
                      <Link
                        href={`/anime/${encodeURIComponent(item.contentId)}`}
                        key={item.id}
                        className="flex items-center gap-3 p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                      >
                        <div className="w-10 h-14 rounded-lg overflow-hidden bg-[#151927] shrink-0 flex items-center justify-center">
                          {item.poster ? (
                            <img src={item.poster} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                          ) : (
                            <Film size={16} className="text-gray-500" />
                          )}
                        </div>
                        <span className="text-xs font-bold text-white truncate">{item.title}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-[#0d1022] border border-white/10 p-4 space-y-3">
                <div className="flex items-center gap-2 border-b border-white/10 pb-2.5">
                  <History size={17} className="text-cyan-400" />
                  <h3 className="text-sm font-bold text-white">آخر المشاهدة</h3>
                </div>
                {history.isLoading ? (
                  <Loader2 className="animate-spin text-purple-400" />
                ) : !history.data?.length ? (
                  <p className="text-xs text-gray-400 py-8 text-center">لا يوجد سجل مشاهدة بعد.</p>
                ) : (
                  <div className="space-y-2">
                    {history.data.map((item) => (
                      <Link
                        href={`/watch/${encodeURIComponent(item.episodeId)}?title=${encodeURIComponent(
                          item.episodeTitle
                        )}&anime=${encodeURIComponent(item.animeTitle)}&contentId=${encodeURIComponent(item.contentId)}`}
                        key={item.id}
                        className="block p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                      >
                        <span className="block text-xs font-bold text-white">{item.episodeTitle}</span>
                        <small className="text-[11px] text-gray-400">{item.animeTitle}</small>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </main>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        activeSource={activeSource}
        onChangeSource={handleChangeSource}
        rowLayout={rowLayout}
        onChangeLayout={handleChangeLayout}
      />
    </div>
  );
}
