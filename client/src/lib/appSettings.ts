export type AnimeSourceId = "cluster" | "witcher" | "kawaii" | "animeify" | "animecloud" | "faselhd";
export type RowLayoutMode = "scroll" | "grid3" | "grid6";

export interface AnimeSourceInfo {
  id: AnimeSourceId;
  label: string;
  subtitle: string;
  badge: string;
}

export const ANIME_SOURCES: AnimeSourceInfo[] = [
  {
    id: "cluster",
    label: "Anime Cluster",
    subtitle: "مصدر سريع ومستقر مع مواسم مرتبة وجودات متعددة",
    badge: "سريع",
  },
  {
    id: "witcher",
    label: "Anime Witcher",
    subtitle: "مكتبة ضخمة ومحدثة يومياً بأحدث الحلقات",
    badge: "محدّث",
  },
  {
    id: "kawaii",
    label: "Anime Kawaii",
    subtitle: "مشاهدة مباشرة فائقة السرعة مع ترجمة عربية",
    badge: "مباشر",
  },
  {
    id: "animeify",
    label: "Animefy",
    subtitle: "مصدر إضافي غني بالحلقات وسيرفرات التحميل",
    badge: "متنوع",
  },
  {
    id: "animecloud",
    label: "Anime Cloud",
    subtitle: "سيرفرات أنمي كلاود المباشرة بجودة 1080p و 480p",
    badge: "كلاود",
  },
  {
    id: "faselhd",
    label: "FaselHD",
    subtitle: "مصدر فاصل HD للأفلام والمسلسلات والأنمي المترجم",
    badge: "فاصل",
  },
];

export const SOURCE_STORAGE_KEY = "neonflix-source";
export const LAYOUT_STORAGE_KEY = "neonflix-row-layout";
export const LOCAL_FAVORITES_KEY = "animesky:local-favorites";

export interface LocalFavoriteItem {
  contentId: string;
  title: string;
  poster: string | null;
  source?: string;
  createdAt: string;
}

export function getStoredSource(): AnimeSourceId {
  if (typeof window === "undefined") return "cluster";
  try {
    const raw = localStorage.getItem(SOURCE_STORAGE_KEY) || "cluster";
    if (
      raw === "cluster" ||
      raw === "witcher" ||
      raw === "kawaii" ||
      raw === "animeify" ||
      raw === "animecloud" ||
      raw === "faselhd"
    ) {
      return raw;
    }
  } catch {
    // ignore storage errors
  }
  return "cluster";
}

export function setStoredSource(source: AnimeSourceId): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SOURCE_STORAGE_KEY, source);
  } catch {
    // ignore storage errors
  }
}

export function getStoredLayout(): RowLayoutMode {
  if (typeof window === "undefined") return "grid6";
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (raw === "scroll" || raw === "grid3" || raw === "grid6") {
      return raw;
    }
  } catch {
    // ignore storage errors
  }
  return "grid6";
}

export function setStoredLayout(layout: RowLayoutMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, layout);
  } catch {
    // ignore storage errors
  }
}

export function getLocalFavorites(): LocalFavoriteItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_FAVORITES_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function toggleLocalFavorite(item: {
  contentId: string;
  title: string;
  poster?: string | null;
}): { list: LocalFavoriteItem[]; added: boolean } {
  const current = getLocalFavorites();
  const exists = current.some((f) => f.contentId === item.contentId);
  const next = exists
    ? current.filter((f) => f.contentId !== item.contentId)
    : [
        {
          contentId: item.contentId,
          title: item.title,
          poster: item.poster ?? null,
          source: getStoredSource(),
          createdAt: new Date().toISOString(),
        },
        ...current,
      ];
  try {
    localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
  return { list: next, added: !exists };
}
