import type { DemoData, RegionRecord } from "./types";

export type RegionPortraitCategory =
  "agriculture" | "manufacturing" | "services";
export interface RegionPortraitDefinition {
  id: RegionPortraitCategory;
  name: string;
  color: string;
  fill: string;
  selectedFill: string;
  description: string;
}

export const REGION_PORTRAITS: readonly RegionPortraitDefinition[] = [
  {
    id: "agriculture",
    name: "农业特色",
    color: "#7fa464",
    fill: "rgba(127,164,100,.27)",
    selectedFill: "rgba(127,164,100,.40)",
    description: "农业基础与农产品资源",
  },
  {
    id: "manufacturing",
    name: "制造业集聚",
    color: "#6896c8",
    fill: "rgba(104,150,200,.27)",
    selectedFill: "rgba(104,150,200,.40)",
    description: "工业制造与产业链集群",
  },
  {
    id: "services",
    name: "现代服务",
    color: "#b28abb",
    fill: "rgba(178,138,187,.24)",
    selectedFill: "rgba(178,138,187,.38)",
    description: "服务经济与区域枢纽",
  },
];

/**
 * Editorial classification for this demo's territorial portrait, not a claim
 * about the largest GDP sector. In particular, a relatively high primary-sector
 * share can establish "agriculture character" while services remain the largest.
 *
 * Valid three-sector totals (95–105%, allowing source rounding) are normalized:
 * primary >= 10% => agriculture; otherwise secondary >= 38% => manufacturing;
 * otherwise services. Secondary industry is used as a planning proxy for the
 * manufacturing theme; it also contains construction/mining and must not be
 * relabelled as a measured manufacturing share.
 *
 * No missing statistics are synthesized. A city without complete shares uses
 * its parent province portrait. A province without shares uses the explicitly
 * recorded editorial fallback below; this does not fill its numerical fields.
 */
export const REGION_PORTRAIT_METHOD = {
  version: 1,
  basis:
    "relative three-sector structure plus explicitly recorded planning fallbacks",
  primaryThreshold: 10,
  secondaryThreshold: 38,
  validShareTotal: [95, 105],
  statisticalClaim:
    "none: categories are territorial planning portraits, not largest-sector or manufacturing-output rankings",
} as const;

export const REGION_PORTRAIT_FALLBACKS: Readonly<
  Record<string, RegionPortraitCategory>
> = {
  beijing: "services",
  shanghai: "services",
  tianjin: "services",
  hebei: "manufacturing",
  shanxi: "manufacturing",
  anhui: "manufacturing",
  fujian: "manufacturing",
  guangdong: "manufacturing",
  shaanxi: "manufacturing",
  ningxia: "manufacturing",
  hainan: "services",
  tibet: "agriculture",
  gansu: "agriculture",
  qinghai: "agriculture",
  xinjiang: "agriculture",
  "inner-mongolia": "agriculture",
  heilongjiang: "agriculture",
  jilin: "agriculture",
  guangxi: "agriculture",
  guizhou: "agriculture",
  yunnan: "agriculture",
  jiangsu: "manufacturing",
  jiangxi: "manufacturing",
  shandong: "manufacturing",
  zhejiang: "services",
  hubei: "services",
  hunan: "services",
  henan: "services",
  sichuan: "services",
  chongqing: "services",
  liaoning: "services",
  "hong-kong": "services",
  macau: "services",
  taiwan: "manufacturing",
};

export interface RegionPortrait extends RegionPortraitDefinition {
  method: "three-sector-structure" | "parent-portrait" | "planning-fallback";
  inputRegionId?: string;
  normalizedShares: [number, number, number] | null;
}

export function portraitForRegion(
  region?: RegionRecord,
  regions: readonly RegionRecord[] = [],
  fallbackRegionId?: string,
): RegionPortrait {
  const shares = region?.shares;
  const complete = shares?.every(
    (value) =>
      value != null && Number.isFinite(value) && value >= 0 && value <= 100,
  );
  const total =
    shares?.reduce<number>((sum, value) => sum + (value || 0), 0) || 0;
  if (complete && total >= 95 && total <= 105) {
    const normalized = shares!.map((value) => (value! / total) * 100) as [
      number,
      number,
      number,
    ];
    const category =
      normalized[0] >= REGION_PORTRAIT_METHOD.primaryThreshold
        ? "agriculture"
        : normalized[1] >= REGION_PORTRAIT_METHOD.secondaryThreshold
          ? "manufacturing"
          : "services";
    return {
      ...REGION_PORTRAITS.find((item) => item.id === category)!,
      method: "three-sector-structure",
      inputRegionId: region?.id,
      normalizedShares: normalized,
    };
  }
  if (region?.level === "市") {
    const parent = regions.find(
      (item) => item.id === region.parentId && item.level === "省",
    );
    if (parent)
      return { ...portraitForRegion(parent), method: "parent-portrait" };
  }
  const id =
    fallbackRegionId || (region?.level === "市" ? region.parentId : region?.id);
  const category = REGION_PORTRAIT_FALLBACKS[id || ""] || "services";
  return {
    ...REGION_PORTRAITS.find((item) => item.id === category)!,
    method: "planning-fallback",
    inputRegionId: id,
    normalizedShares: null,
  };
}

/** Names/adcodes checked against public/assets/geo/hubei-cities.geojson, 17 features. */
export const HUBEI_DIRECTORY = [
  { id: "wuhan", adcode: 420100, name: "武汉市" },
  { id: "huangshi", adcode: 420200, name: "黄石市" },
  { id: "shiyan", adcode: 420300, name: "十堰市" },
  { id: "yichang", adcode: 420500, name: "宜昌市" },
  { id: "xiangyang", adcode: 420600, name: "襄阳市" },
  { id: "ezhou", adcode: 420700, name: "鄂州市" },
  { id: "jingmen", adcode: 420800, name: "荆门市" },
  { id: "xiaogan", adcode: 420900, name: "孝感市" },
  { id: "jingzhou", adcode: 421000, name: "荆州市" },
  { id: "huanggang", adcode: 421100, name: "黄冈市" },
  { id: "xianning", adcode: 421200, name: "咸宁市" },
  { id: "suizhou", adcode: 421300, name: "随州市" },
  { id: "enshi", adcode: 422800, name: "恩施土家族苗族自治州" },
  { id: "xiantao", adcode: 429004, name: "仙桃市" },
  { id: "qianjiang", adcode: 429005, name: "潜江市" },
  { id: "tianmen", adcode: 429006, name: "天门市" },
  { id: "shennongjia", adcode: 429021, name: "神农架林区" },
] as const;

function normalizedCityName(name: string) {
  return name.replace(/土家族苗族自治州$|自治州$|林区$|市$|州$/, "");
}

/**
 * Add administrative navigation entries at runtime. Original Excel records and
 * their identifiers, figures, ordering, and source strings remain untouched.
 * Reapplying is idempotent; additions contain no GDP/share/industry assumptions.
 */
export function withHubeiDirectory(data: DemoData): DemoData {
  const additions: RegionRecord[] = HUBEI_DIRECTORY.filter(
    (entry) =>
      !data.regions.some(
        (region) =>
          region.id === entry.id ||
          (region.parentId === "hubei" &&
            normalizedCityName(region.name) === normalizedCityName(entry.name)),
      ),
  ).map((entry) => ({
    id: entry.id,
    name: entry.name,
    level: "市",
    parentId: "hubei",
    mapId: entry.id === "xiaogan" ? "xiaogan" : "hubei",
    year: data.meta.year,
    gdp: null,
    growth: null,
    shares: [null, null, null],
    pillars: [],
    priorities: [],
    chainIds: [],
    source: `hubei-cities.geojson · 行政区划目录 ${entry.adcode}`,
    status: "missing",
  }));
  return additions.length
    ? { ...data, regions: [...data.regions, ...additions] }
    : data;
}
