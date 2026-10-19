export type DataStatus = "sample" | "verified" | "missing";
export interface SourceLink {
  label: string;
  url?: string;
}
export interface RegionRecord {
  id: string;
  name: string;
  level: "省" | "市";
  parentId?: string;
  mapId?: string;
  year: number;
  gdp: number | null;
  growth: number | null;
  shares: [number | null, number | null, number | null];
  pillars: string[];
  priorities: string[];
  chainIds: string[];
  source: string;
  status: DataStatus;
}
export interface ChainStage {
  id: string;
  stage: "上游" | "中游" | "下游";
  name: string;
  products: string[];
  aliases: string[];
  source?: string;
}
export interface IndustryChain {
  id: string;
  name: string;
  shortName: string;
  stages: ChainStage[];
}
export interface CompanyRecord {
  id: string;
  name: string;
  fullName: string;
  cityId: string;
  cityName: string;
  stockCode?: string;
  logo: string | null;
  sector: string;
  summary: string;
  chainIds: string[];
  stageIds: string[];
  products: string[];
  coordinate?: [number, number];
  locationStatus?: DataStatus;
  local: boolean;
  relationship: "existing" | "prospect";
  founded?: string;
  listed?: string;
  registeredCapital?: string;
  legalRepresentative?: string;
  shareholders: { name: string; share: string }[];
  sources: SourceLink[];
  status: DataStatus;
}
export interface MatchCity {
  id: string;
  name: string;
  coordinate: [number, number];
  scores: [number, number, number, number];
  companyIds: string[];
}
export interface CountyIndicator {
  year: number;
  gdp: number | null;
  growth: number | null;
  shares: [number | null, number | null, number | null];
  industrialEnterprises: number | null;
  source: string;
  status: DataStatus;
}
export interface CountyPillar {
  id: string;
  name: string;
  chainId: string;
  output: string | null;
  companyIds: string[];
  park: string | null;
  source: string;
  chainIds?: string[];
}
export interface CountyProfile {
  name: string;
  indicators: CountyIndicator[];
  pillars: CountyPillar[];
  chainLinks: {
    stageId: string;
    status: "present" | "gap" | "unknown";
    companyIds: string[];
    source: string;
    reportedStatus?: "强链" | "补链";
    basis?: string;
    evidenceStatus?: "reported" | "pending";
  }[];
  leaders: {
    chainId: string;
    name: string | null;
    title: string | null;
    company: string | null;
    source: string;
  }[];
  policies: {
    id: string;
    name: string;
    publisher: string;
    date: string;
    url: string | null;
    source: string;
  }[];
  parks: {
    id: string;
    name: string;
    coordinate?: [number, number];
    source: string;
    status?: DataStatus;
    planning?: boolean;
    note?: string;
  }[];
}
export interface DemoData {
  version: 1;
  meta: { title: string; year: number; updatedAt: string; description: string };
  regions: RegionRecord[];
  chains: IndustryChain[];
  profile: CountyProfile;
  companies: CompanyRecord[];
  cities: MatchCity[];
}
export type Scene = "national" | "profile" | "flows";
export type NationalMode = "region" | "industry";
export type ScoreWeights = [number, number, number, number];
export const SCORE_LABELS = [
  "产业关联",
  "可达性",
  "人口流动",
  "要素成本",
] as const;
export function matchScore(city: MatchCity, weights: ScoreWeights): number {
  const total = weights.reduce((sum, n) => sum + n, 0);
  return total
    ? Math.round(
        (city.scores.reduce((sum, n, i) => sum + n * weights[i], 0) / total) *
          10,
      ) / 10
    : 0;
}
