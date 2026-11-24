import { FormEvent, useState } from "react";
import { Heart, History, Loader2, LogIn, LogOut, UserRound, UserPlus } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
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
  const favorites = trpc.account.favorites.useQuery(undefined, { enabled: Boolean(user) });
  const history = trpc.account.history.useQuery(undefined, { enabled: Boolean(user) });
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  if (loading) return <div className="page-shell center-state"><Loader2 className="spin" size={28} /><span>جاري التحقق من الحساب...</span></div>;

  if (!user) {
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

    return <div className="page-shell center-state auth-page">
      <UserRound size={34} />
      <h2>{mode === "login" ? "تسجيل الدخول" : "إنشاء حساب"}</h2>
      <p>{mode === "login" ? "ادخل إلى حسابك لمتابعة المفضلة وسجل المشاهدة." : "أنشئ حساباً باسم مستخدم وكلمة مرور فقط."}</p>
      <form className="auth-form" onSubmit={onSubmit}>
        <input value={username} onChange={e => setUsername(e.target.value)} placeholder="اسم المستخدم" minLength={3} maxLength={32} required autoComplete="username" />
        <input value={password} onChange={e => setPassword(e.target.value)} placeholder="كلمة المرور" minLength={6} required type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} />
        {error ? <div className="auth-error">{error}</div> : null}
        <Button type="submit" disabled={pending}>{pending ? <Loader2 className="spin" size={16} /> : mode === "login" ? <LogIn size={16} /> : <UserPlus size={16} />}{mode === "login" ? " تسجيل الدخول" : " إنشاء الحساب"}</Button>
      </form>
      <Button variant="ghost" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "ليس لديك حساب؟ إنشاء حساب" : "لديك حساب؟ تسجيل الدخول"}</Button>
      <Link href="/"><Button variant="ghost">العودة للاستكشاف</Button></Link>
    </div>;
  }

  return <div className="page-shell"><header className="subpage-bar"><Link href="/" className="back-link">← العودة</Link><span className="brand-mini">NEON<span>FLIX</span> / ACCOUNT</span><span className="page-code">{user.name || "USER"}</span></header><main className="account-main"><div className="account-heading"><span className="section-eyebrow">PERSONAL NODE / CONNECTED</span><h1>مرحباً، {user.name}.</h1><p>ستبقى جلستك محفوظة حتى تختار تسجيل الخروج بنفسك.</p><Button variant="outline" onClick={() => logout()}><LogOut size={16} /> تسجيل الخروج</Button></div><section className="account-grid"><div className="account-panel"><div className="panel-heading"><Heart size={17} /><h2>المفضلة</h2></div>{favorites.isLoading ? <Loader2 className="spin" /> : !favorites.data?.length ? <div className="panel-empty">لم تضف أي عنوان بعد.</div> : <div className="saved-list">{favorites.data.map(item => <Link href={`/anime/${item.contentId}`} key={item.id} className="saved-row"><div className="saved-thumb">{item.poster ? <img src={item.poster} alt="" /> : null}</div><span>{item.title}</span></Link>)}</div>}</div><div className="account-panel"><div className="panel-heading"><History size={17} /><h2>آخر المشاهدة</h2></div>{history.isLoading ? <Loader2 className="spin" /> : !history.data?.length ? <div className="panel-empty">لا يوجد سجل مشاهدة بعد.</div> : <div className="history-list">{history.data.map(item => <Link href={`/watch/${item.episodeId}?title=${encodeURIComponent(item.episodeTitle)}&anime=${encodeURIComponent(item.animeTitle)}&contentId=${encodeURIComponent(item.contentId)}`} key={item.id} className="history-row"><span>{item.episodeTitle}</span><small>{item.animeTitle}</small></Link>)}</div>}</div></section></main></div>;
}
