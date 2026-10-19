import type { DemoData } from "./types";

/** Validate imported JSON before replacing the working demo dataset. */
export function validateDemoData(value: unknown): DemoData {
  const errors: string[] = [];
  const fail = (path: string, message: string) => {
    if (errors.length < 50) errors.push(`${path}：${message}`);
  };
  const record = (v: unknown, path: string): Record<string, unknown> => {
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      fail(path, "应为对象");
      return {};
    }
    return v as Record<string, unknown>;
  };
  const text = (v: unknown, path: string, allowEmpty = true) => {
    if (typeof v !== "string" || (!allowEmpty && !v.trim()))
      fail(path, "应为文本" + (allowEmpty ? "" : "且不能为空"));
  };
  const optionalText = (v: unknown, path: string) => {
    if (v !== undefined && v !== null) text(v, path);
  };
  const array = (v: unknown, path: string): unknown[] => {
    if (!Array.isArray(v)) {
      fail(path, "应为数组");
      return [];
    }
    return v;
  };
  const strings = (v: unknown, path: string) =>
    array(v, path).forEach((x, i) => text(x, `${path}[${i}]`));
  const number = (
    v: unknown,
    path: string,
    nullable = false,
    min = -Infinity,
    max = Infinity,
  ) => {
    if (nullable && v === null) return;
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
      fail(
        path,
        `应为${nullable ? "空值或" : ""}有效数值${min === 0 && max === 100 ? "（0–100）" : ""}`,
      );
  };
  const choice = (v: unknown, path: string, choices: string[]) => {
    if (typeof v !== "string" || !choices.includes(v))
      fail(path, `应为 ${choices.join(" / ")}`);
  };
  const status = (v: unknown, path: string) =>
    choice(v, path, ["sample", "verified", "missing"]);
  const tuple = (
    v: unknown,
    path: string,
    length: number,
    nullable: boolean,
    min: number,
    max: number,
  ) => {
    const a = array(v, path);
    if (a.length !== length) fail(path, `需要 ${length} 个数值`);
    a.forEach((x, i) => number(x, `${path}[${i}]`, nullable, min, max));
  };
  const coordinate = (v: unknown, path: string) => {
    const a = array(v, path);
    if (a.length !== 2) fail(path, "需要经度、纬度两个数值");
    number(a[0], `${path}[0]`, false, -180, 180);
    number(a[1], `${path}[1]`, false, -90, 90);
  };
  const url = (v: unknown, path: string, relative = false) => {
    if (v === null || v === undefined || v === "") return;
    if (
      typeof v !== "string" ||
      /^(?:javascript|vbscript|data):/i.test(v.trim()) ||
      (!relative && !/^https?:\/\//i.test(v))
    )
      fail(
        path,
        relative ? "需要安全的图片地址或相对路径" : "需要 http(s) 链接",
      );
  };
  const unique = (rows: unknown[], path: string): Set<string> => {
    const ids = new Set<string>();
    rows.forEach((row, i) => {
      const r = record(row, `${path}[${i}]`);
      text(r.id, `${path}[${i}].id`, false);
      if (typeof r.id === "string") {
        if (ids.has(r.id)) fail(`${path}[${i}].id`, "ID 重复");
        ids.add(r.id);
      }
    });
    return ids;
  };
  const d = record(value, "data");
  if (d.version !== 1) fail("version", "当前仅支持版本 1");
  const meta = record(d.meta, "meta");
  text(meta.title, "meta.title", false);
  number(meta.year, "meta.year", false, 1900, 2200);
  text(meta.updatedAt, "meta.updatedAt");
  text(meta.description, "meta.description");
  const regions = array(d.regions, "regions"),
    chains = array(d.chains, "chains"),
    companies = array(d.companies, "companies"),
    cities = array(d.cities, "cities");
  if (!regions.length) fail("regions", "至少需要一个地区");
  if (!chains.length) fail("chains", "至少需要一条产业链");
  const regionIds = unique(regions, "regions"),
    chainIds = unique(chains, "chains"),
    companyIds = unique(companies, "companies");
  unique(cities, "cities");
  const stageIds = new Set<string>();
  const refs = (v: unknown, path: string, ids: Set<string>) =>
    array(v, path).forEach((id, i) => {
      text(id, `${path}[${i}]`, false);
      if (typeof id === "string" && !ids.has(id))
        fail(`${path}[${i}]`, `找不到引用 ${id}`);
    });
  chains.forEach((v, i) => {
    const p = `chains[${i}]`,
      r = record(v, p);
    text(r.name, `${p}.name`, false);
    text(r.shortName, `${p}.shortName`, false);
    const stages = array(r.stages, `${p}.stages`);
    unique(stages, `${p}.stages`);
    stages.forEach((v, j) => {
      const q = `${p}.stages[${j}]`,
        s = record(v, q);
      text(s.name, `${q}.name`, false);
      choice(s.stage, `${q}.stage`, ["上游", "中游", "下游"]);
      strings(s.products, `${q}.products`);
      strings(s.aliases, `${q}.aliases`);
      optionalText(s.source, `${q}.source`);
      if (typeof s.id === "string") {
        if (stageIds.has(s.id)) fail(`${q}.id`, "产业环节 ID 必须全局唯一");
        stageIds.add(s.id);
      }
    });
  });
  regions.forEach((v, i) => {
    const p = `regions[${i}]`,
      r = record(v, p);
    text(r.name, `${p}.name`, false);
    choice(r.level, `${p}.level`, ["省", "市"]);
    optionalText(r.parentId, `${p}.parentId`);
    optionalText(r.mapId, `${p}.mapId`);
    if (r.parentId && !regionIds.has(String(r.parentId)))
      fail(`${p}.parentId`, "所属省不存在");
    number(r.year, `${p}.year`, false, 1900, 2200);
    number(r.gdp, `${p}.gdp`, true, 0);
    number(r.growth, `${p}.growth`, true);
    tuple(r.shares, `${p}.shares`, 3, true, 0, 100);
    strings(r.pillars, `${p}.pillars`);
    strings(r.priorities, `${p}.priorities`);
    refs(r.chainIds, `${p}.chainIds`, chainIds);
    text(r.source, `${p}.source`);
    status(r.status, `${p}.status`);
  });
  companies.forEach((v, i) => {
    const p = `companies[${i}]`,
      r = record(v, p);
    ["name", "fullName", "cityId", "cityName", "sector", "summary"].forEach(
      (k) => text(r[k], `${p}.${k}`, k === "summary"),
    );
    [
      "stockCode",
      "founded",
      "listed",
      "registeredCapital",
      "legalRepresentative",
    ].forEach((k) => optionalText(r[k], `${p}.${k}`));
    if (r.logo !== null && typeof r.logo !== "string")
      fail(`${p}.logo`, "应为图片路径或 null");
    url(r.logo, `${p}.logo`, true);
    refs(r.chainIds, `${p}.chainIds`, chainIds);
    refs(r.stageIds, `${p}.stageIds`, stageIds);
    strings(r.products, `${p}.products`);
    if (r.coordinate !== undefined) coordinate(r.coordinate, `${p}.coordinate`);
    if (r.locationStatus !== undefined)
      status(r.locationStatus, `${p}.locationStatus`);
    if (typeof r.local !== "boolean") fail(`${p}.local`, "应为布尔值");
    choice(r.relationship, `${p}.relationship`, ["existing", "prospect"]);
    status(r.status, `${p}.status`);
    array(r.shareholders, `${p}.shareholders`).forEach((v, j) => {
      const s = record(v, `${p}.shareholders[${j}]`);
      text(s.name, `${p}.shareholders[${j}].name`);
      text(s.share, `${p}.shareholders[${j}].share`);
    });
    array(r.sources, `${p}.sources`).forEach((v, j) => {
      const s = record(v, `${p}.sources[${j}]`);
      text(s.label, `${p}.sources[${j}].label`);
      url(s.url, `${p}.sources[${j}].url`);
    });
  });
  cities.forEach((v, i) => {
    const p = `cities[${i}]`,
      r = record(v, p);
    text(r.name, `${p}.name`, false);
    coordinate(r.coordinate, `${p}.coordinate`);
    tuple(r.scores, `${p}.scores`, 4, false, 0, 100);
    refs(r.companyIds, `${p}.companyIds`, companyIds);
  });
  const profile = record(d.profile, "profile");
  text(profile.name, "profile.name", false);
  const years = new Set<unknown>();
  array(profile.indicators, "profile.indicators").forEach((v, i) => {
    const p = `profile.indicators[${i}]`,
      r = record(v, p);
    number(r.year, `${p}.year`, false, 1900, 2200);
    if (years.has(r.year)) fail(`${p}.year`, "年份重复");
    years.add(r.year);
    number(r.gdp, `${p}.gdp`, true, 0);
    number(r.growth, `${p}.growth`, true);
    tuple(r.shares, `${p}.shares`, 3, true, 0, 100);
    number(r.industrialEnterprises, `${p}.industrialEnterprises`, true, 0);
    text(r.source, `${p}.source`);
    status(r.status, `${p}.status`);
  });
  const pillars = array(profile.pillars, "profile.pillars");
  unique(pillars, "profile.pillars");
  pillars.forEach((v, i) => {
    const p = `profile.pillars[${i}]`,
      r = record(v, p);
    text(r.name, `${p}.name`, false);
    refs([r.chainId], `${p}.chainId`, chainIds);
    if (r.chainIds !== undefined) refs(r.chainIds, `${p}.chainIds`, chainIds);
    optionalText(r.output, `${p}.output`);
    refs(r.companyIds, `${p}.companyIds`, companyIds);
    optionalText(r.park, `${p}.park`);
    text(r.source, `${p}.source`);
  });
  array(profile.chainLinks, "profile.chainLinks").forEach((v, i) => {
    const p = `profile.chainLinks[${i}]`,
      r = record(v, p);
    refs([r.stageId], `${p}.stageId`, stageIds);
    choice(r.status, `${p}.status`, ["present", "gap", "unknown"]);
    refs(r.companyIds, `${p}.companyIds`, companyIds);
    text(r.source, `${p}.source`);
    if (r.reportedStatus !== undefined)
      choice(r.reportedStatus, `${p}.reportedStatus`, ["强链", "补链"]);
    if (r.evidenceStatus !== undefined)
      choice(r.evidenceStatus, `${p}.evidenceStatus`, ["reported", "pending"]);
    optionalText(r.basis, `${p}.basis`);
  });
  array(profile.leaders, "profile.leaders").forEach((v, i) => {
    const p = `profile.leaders[${i}]`,
      r = record(v, p);
    refs([r.chainId], `${p}.chainId`, chainIds);
    ["name", "title", "company"].forEach((k) =>
      optionalText(r[k], `${p}.${k}`),
    );
    text(r.source, `${p}.source`);
  });
  const policies = array(profile.policies, "profile.policies");
  unique(policies, "profile.policies");
  policies.forEach((v, i) => {
    const p = `profile.policies[${i}]`,
      r = record(v, p);
    ["name", "publisher", "date", "source"].forEach((k) =>
      text(r[k], `${p}.${k}`),
    );
    url(r.url, `${p}.url`);
  });
  const parks = array(profile.parks, "profile.parks");
  unique(parks, "profile.parks");
  parks.forEach((v, i) => {
    const p = `profile.parks[${i}]`,
      r = record(v, p);
    text(r.name, `${p}.name`, false);
    text(r.source, `${p}.source`);
    if (r.coordinate !== undefined) coordinate(r.coordinate, `${p}.coordinate`);
    if (r.status !== undefined) status(r.status, `${p}.status`);
    if (r.planning !== undefined && typeof r.planning !== "boolean")
      fail(`${p}.planning`, "应为布尔值");
    optionalText(r.note, `${p}.note`);
  });
  if (errors.length)
    throw new Error(`数据格式不正确，请检查：\n${errors.join("\n")}`);
  return value as DemoData;
}

export async function loadDemoData(signal?: AbortSignal): Promise<DemoData> {
  const response = await fetch(
    `${import.meta.env.BASE_URL}assets/demo/demo-data.json`,
    { signal, cache: "no-cache" },
  );
  if (!response.ok)
    throw new Error(`招商数据加载失败（HTTP ${response.status}）`);
  return validateDemoData(await response.json());
}
