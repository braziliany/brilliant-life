export type GenshinMajorSeries = "5.x" | "6.x" | "7.x";

export type GenshinQuote = {
  text: string;
  speaker: string;
  majorSeries: "5.x" | "6.x";
};

type ConfirmedVersionWindow = {
  majorSeries: GenshinMajorSeries;
  startsOn: string;
  endsOn: string;
};

// Explicit, locally maintained main-series boundaries. The latest window ends
// at the last date confirmed when this pool was reviewed; later dates fall back
// safely instead of extrapolating a release cadence.
export const GENSHIN_VERSION_WINDOWS: readonly ConfirmedVersionWindow[] = [
  { majorSeries: "5.x", startsOn: "2024-08-28", endsOn: "2025-09-09" },
  { majorSeries: "6.x", startsOn: "2025-09-10", endsOn: "2026-08-11" },
  { majorSeries: "7.x", startsOn: "2026-08-12", endsOn: "2026-09-11" },
];

export const GENSHIN_QUOTE_POOLS: Readonly<Record<"5.x" | "6.x", readonly GenshinQuote[]>> = {
  "5.x": [
    { text: "探索与挑战…嗯，冒险家的生活很合我的胃口。", speaker: "玛薇卡", majorSeries: "5.x" },
    { text: "无论有多忙，也要为自己挤出休息的时间。", speaker: "希诺宁", majorSeries: "5.x" },
  ],
  "6.x": [
    { text: "群星已互道过晚安，轮到我们了。", speaker: "菈乌玛", majorSeries: "6.x" },
    { text: "差不多是睡觉时间了，拉好窗帘，别被月亮偷看了。", speaker: "奈芙尔", majorSeries: "6.x" },
    { text: "睡吧，无梦地安眠。", speaker: "菲林斯", majorSeries: "6.x" },
  ],
};

const PREVIOUS_MAJOR: Partial<Record<GenshinMajorSeries, "5.x" | "6.x">> = {
  "6.x": "5.x",
  "7.x": "6.x",
};

const LATEST_CONFIRMED_PREVIOUS_MAJOR: "6.x" = "6.x";

export const toShanghaiNaturalDate = (value: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
};

export const resolveGenshinMajorSeries = (naturalDate: string): GenshinMajorSeries | null =>
  GENSHIN_VERSION_WINDOWS.find(({ startsOn, endsOn }) => naturalDate >= startsOn && naturalDate <= endsOn)?.majorSeries ?? null;

const naturalDayOrdinal = (naturalDate: string) => {
  const [year, month, day] = naturalDate.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
};

export const selectGenshinQuote = (value: Date = new Date()): GenshinQuote => {
  const naturalDate = toShanghaiNaturalDate(value);
  const currentSeries = resolveGenshinMajorSeries(naturalDate);
  const quoteSeries = (currentSeries && PREVIOUS_MAJOR[currentSeries]) ?? LATEST_CONFIRMED_PREVIOUS_MAJOR;
  const pool = GENSHIN_QUOTE_POOLS[quoteSeries];
  return pool[naturalDayOrdinal(naturalDate) % pool.length];
};
