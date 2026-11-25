import { Check, LayoutGrid, Rows3, Server, Smartphone, Trash2, X } from "lucide-react";
import { useState } from "react";
import {
  ANIME_SOURCES,
  type AnimeSourceId,
  type RowLayoutMode,
} from "@/lib/appSettings";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  activeSource: AnimeSourceId;
  onChangeSource: (src: AnimeSourceId) => void;
  rowLayout: RowLayoutMode;
  onChangeLayout: (layout: RowLayoutMode) => void;
}

export function SettingsModal({
  open,
  onClose,
  activeSource,
  onChangeSource,
  rowLayout,
  onChangeLayout,
}: SettingsModalProps) {
  const [clearedMsg, setClearedMsg] = useState("");

  if (!open) return null;

  const clearWatchProgress = () => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith("neonflix:watch-progress") || k.startsWith("neonflix:witcher-progress") || k.startsWith("neonflix:watched:"))) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
      setClearedMsg("تم مسح سجل التقدم المحلي بنجاح.");
      setTimeout(() => setClearedMsg(""), 2500);
    } catch {
      setClearedMsg("تعذر الوصول للتخزين المحلي.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#060814]/98 backdrop-blur-2xl flex flex-col animate-in fade-in duration-200" dir="rtl">
      {/* Header */}
      <header className="bg-[#080b18]/90 border-b border-white/10 px-4 pt-safe pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
            <Server size={17} />
          </div>
          <div>
            <h2 className="text-base font-bold text-white leading-tight">الإعدادات</h2>
            <p className="text-[11px] text-gray-400">تبديل مصادر الأنمي ومظهر التطبيق</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          aria-label="إغلاق الإعدادات"
        >
          <X size={20} />
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-5 pb-safe max-w-2xl mx-auto w-full space-y-6">
        {/* Source Switcher Section */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Server size={16} className="text-purple-400" />
              <span>مصدر الأنمي (السيرفر)</span>
            </h3>
            <span className="text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-full font-semibold">
              {ANIME_SOURCES.find((s) => s.id === activeSource)?.label}
            </span>
          </div>

          <div className="space-y-2.5">
            {ANIME_SOURCES.map((src) => {
              const isSelected = activeSource === src.id;
              return (
                <button
                  key={src.id}
                  type="button"
                  onClick={() => {
                    if (!isSelected) {
                      onChangeSource(src.id);
                    }
                    onClose();
                  }}
                  className={`w-full text-right p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    isSelected
                      ? "bg-purple-600/15 border-purple-500 shadow-lg shadow-purple-600/15"
                      : "bg-[#0e1122] border-white/10 hover:border-white/25 hover:bg-[#13172e]"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-sm text-white">{src.label}</span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          isSelected
                            ? "bg-purple-500/30 text-purple-200 border border-purple-400/30"
                            : "bg-white/5 text-gray-400"
                        }`}
                      >
                        {src.badge}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">{src.subtitle}</p>
                  </div>

                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border transition-colors ${
                      isSelected
                        ? "bg-purple-600 border-purple-400 text-white"
                        : "border-white/20 bg-white/5 text-transparent"
                    }`}
                  >
                    <Check size={14} />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Layout Selector Section */}
        <section>
          <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
            <LayoutGrid size={16} className="text-cyan-400" />
            <span>طريقة عرض البطاقات</span>
          </h3>

          <div className="grid grid-cols-3 gap-2.5">
            {[
              {
                id: "scroll" as const,
                title: "شريط أفقي",
                desc: "بطاقات كبيرة مرتبة",
                icon: Rows3,
              },
              {
                id: "grid3" as const,
                title: "3 أعمدة",
                desc: "شبكة متوازنة",
                icon: LayoutGrid,
              },
              {
                id: "grid6" as const,
                title: "6 بالصف",
                desc: "عرض مكثف",
                icon: Smartphone,
              },
            ].map((opt) => {
              const Icon = opt.icon;
              const active = rowLayout === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeLayout(opt.id)}
                  className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5 ${
                    active
                      ? "bg-purple-600/20 border-purple-500 text-white shadow-md shadow-purple-600/20"
                      : "bg-[#0e1122] border-white/10 text-gray-300 hover:border-white/25"
                  }`}
                >
                  <Icon size={18} className={active ? "text-purple-300" : "text-gray-400"} />
                  <span className="text-xs font-bold">{opt.title}</span>
                  <span className="text-[10px] text-gray-400">{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* App Storage & Info */}
        <section className="bg-[#0e1122] border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-white">سجل التقدم المحلي</h4>
              <p className="text-[11px] text-gray-400 mt-0.5">حذف نقاط التوقف المحفوظة للحلقات على هذا الجهاز</p>
            </div>
            <button
              type="button"
              onClick={clearWatchProgress}
              className="px-3 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Trash2 size={13} />
              <span>مسح</span>
            </button>
          </div>
          {clearedMsg ? (
            <p className="text-xs text-emerald-400 font-semibold">{clearedMsg}</p>
          ) : null}

          <div className="pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-gray-400">
            <span>إصدار التطبيق</span>
            <span className="font-mono text-gray-300">Anime Sky iOS v1.3</span>
          </div>
        </section>
      </div>
    </div>
  );
}
