import { matchScore, type DemoData, type ScoreWeights } from "./types";

export function rebalanceWeights(
  weights: ScoreWeights,
  index: number,
  value: number,
): ScoreWeights {
  const next = Math.max(0, Math.min(100, Math.round(value)));
  const otherSum = weights.reduce(
    (sum, n, i) => sum + (i === index ? 0 : n),
    0,
  );
  const allocation = weights.map((n, i) => ({
    i,
    raw: i === index ? next : (100 - next) * (otherSum ? n / otherSum : 1 / 3),
  }));
  const result = allocation.map(({ raw }) => Math.floor(raw)) as ScoreWeights;
  const remainder = 100 - result.reduce((sum, n) => sum + n, 0);
  const order = allocation
    .filter((item) => item.i !== index)
    .sort(
      (a, b) =>
        b.raw - Math.floor(b.raw) - (a.raw - Math.floor(a.raw)) || a.i - b.i,
    );
  for (let n = 0; n < remainder; n++) result[order[n % order.length].i] += 1;
  return result;
}

export function companiesForStage(
  data: DemoData,
  chainId: string,
  stageId: string,
  cityId?: string,
) {
  return data.companies.filter(
    (company) =>
      !company.local &&
      company.chainIds.includes(chainId) &&
      (!stageId || company.stageIds.includes(stageId)) &&
      (!cityId || company.cityId === cityId),
  );
}

export function demoRoute(data: DemoData) {
  const preferred = data.profile.chainLinks.find(
    (link) => link.stageId === "electronics-upstream",
  );
  const direction = [preferred, ...data.profile.chainLinks].find(
    (link) =>
      link &&
      link.status !== "present" &&
      data.companies.some(
        (company) =>
          !company.local &&
          company.relationship === "prospect" &&
          company.stageIds.includes(link.stageId),
      ),
  );
  const fallbackCompany =
    data.companies.find((c) => !c.local && c.relationship === "prospect") ||
    data.companies[0];
  const stageId =
    direction?.stageId ||
    fallbackCompany?.stageIds[0] ||
    data.chains[0]?.stages[0]?.id ||
    "";
  const chain =
    data.chains.find((c) => c.stages.some((s) => s.id === stageId)) ||
    data.chains[0];
  const company =
    data.companies.find(
      (c) =>
        !c.local &&
        c.relationship === "prospect" &&
        c.stageIds.includes(stageId),
    ) || fallbackCompany;
  return {
    chainId: chain?.id || "",
    stageId,
    companyId: company?.id || "",
    cityId: company?.cityId || data.cities[0]?.id || "",
  };
}

/** Region/industry relevance is sourced; four-dimensional scores remain an explicitly labelled model demonstration. */
export function rankedCities(
  data: DemoData,
  chainId: string,
  stageId: string,
  weights: ScoreWeights,
  threshold: number,
) {
  const candidates = companiesForStage(data, chainId, stageId);
  const normalizeName = (name: string) => name.replace(/市$/, "");
  return data.cities
    .filter((city) => {
      const region = data.regions.find(
        (r) =>
          r.id === city.id ||
          (r.level === "市" &&
            normalizeName(r.name) === normalizeName(city.name)),
      );
      return (
        region?.chainIds.includes(chainId) ||
        candidates.some((c) => c.cityId === city.id)
      );
    })
    .map((city) => ({ city, score: matchScore(city, weights) }))
    .filter((row) => row.score >= threshold)
    .sort((a, b) => b.score - a.score);
}
