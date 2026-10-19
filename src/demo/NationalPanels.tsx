import { useState } from "react";
import type { ChainStage, DemoData, NationalMode, RegionRecord } from "./types";
import { CompanyLogo, EmptyState, Icon, metric, presentationText } from "./ui";
import {
  HUBEI_DIRECTORY,
  REGION_PORTRAITS,
  portraitForRegion,
} from "./regionPortraits";
import { StageVisual } from "./StageVisual";
import "./panels.css";

export interface NationalPanelsProps {
  data: DemoData;
  mode: NationalMode;
  onMode: (mode: NationalMode) => void;
  regionId: string;
  onRegion: (id: string) => void;
  chainId: string;
  onChain: (id: string) => void;
  stageId: string;
  onStage: (id: string) => void;
  onProfile: () => void;
  onCompany: (id: string) => void;
  onNotice: (message: string) => void;
}

const stageNames: ChainStage["stage"][] = ["上游", "中游", "下游"];
const chainIcons: Record<string, string> = {
  "new-energy": "battery",
  chemicals: "flask",
  "chemical-materials": "flask",
  electronics: "chip",
  automotive: "grid",
  equipment: "grid",
  medicine: "flask",
  food: "leaf",
  textile: "layers",
  digital: "chip",
  future: "bolt",
};

function regionName(region: RegionRecord) {
  if (region.level === "市" || /省|市|自治区|特别行政区/.test(region.name))
    return region.name;
  const suffixes: Record<string, string> = {
    北京: "市",
    天津: "市",
    上海: "市",
    重庆: "市",
    内蒙古: "自治区",
    广西: "壮族自治区",
    宁夏: "回族自治区",
    西藏: "自治区",
    新疆: "维吾尔自治区",
  };
  return region.name + (suffixes[region.name] || "省");
}

export function PanelSource({
  source,
  label = "数据来源",
}: {
  source?: string;
  label?: string;
}) {
  const parts = (presentationText(source) || "—").split(
    /(https?:\/\/[^\s<>"，；、。）（()\[\]【】｜|]+)/g,
  );
  return (
    <details className="np-source-disclosure">
      <summary>
        <Icon name="file" size={16} />
        <span>{label}</span>
        <Icon name="down" size={15} />
      </summary>
      <div>
        {parts.map((part, index) =>
          /^https?:\/\//.test(part) ? (
            <a key={index} href={part} target="_blank" rel="noreferrer">
              {part}
              <Icon name="link" size={13} />
            </a>
          ) : (
            <span key={index}>{part}</span>
          ),
        )}
      </div>
    </details>
  );
}

export function RegionPortraitLegend() {
  return (
    <div className="d-panel np-portrait-legend" aria-label="区域产业画像图例">
      <strong>区域产业画像</strong>
      {REGION_PORTRAITS.map((portrait) => (
        <div key={portrait.id}>
          <i style={{ background: portrait.color }} />
          <span>
            <b>{portrait.name}</b>
            <small>{portrait.description}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

export function NationalPanels(props: NationalPanelsProps) {
  const {
    data,
    mode,
    onMode,
    regionId,
    onRegion,
    chainId,
    onChain,
    stageId,
    onStage,
    onProfile,
    onCompany,
    onNotice,
  } = props;
  const [regionQuery, setRegionQuery] = useState("");
  const [chainQuery, setChainQuery] = useState("");
  const [showAllChains, setShowAllChains] = useState(false);
  const [showAllProvinces, setShowAllProvinces] = useState(false);
  const [expandedCityProvince, setExpandedCityProvince] = useState<
    string | null
  >(null);
  const [relationship, setRelationship] = useState<
    "all" | "existing" | "prospect"
  >("all");
  const region =
    data.regions.find((r) => r.id === regionId) ||
    data.regions.find((r) => r.id === "hubei") ||
    data.regions[0];
  const province =
    region?.level === "市"
      ? data.regions.find((r) => r.id === region.parentId)
      : region;
  const regionSearch = regionQuery.trim();
  const provinceOrder = [
    "hubei",
    "jiangsu",
    "guangdong",
    "zhejiang",
    "sichuan",
  ];
  const allProvinces = data.regions.filter((r) => r.level === "省");
  const provinces = allProvinces
    .filter((r) => !regionSearch || regionName(r).includes(regionSearch))
    .sort((a, b) => {
      const aIndex = provinceOrder.indexOf(a.id);
      const bIndex = provinceOrder.indexOf(b.id);
      return (aIndex < 0 ? 99 : aIndex) - (bIndex < 0 ? 99 : bIndex);
    });
  const defaultProvinces = provinces.slice(0, 5);
  if (
    province &&
    !defaultProvinces.some((item) => item.id === province.id) &&
    !regionSearch
  ) {
    defaultProvinces.splice(4, 1, province);
  }
  const visibleProvinces =
    regionSearch || showAllProvinces ? provinces : defaultProvinces;
  const hubeiDirectory = province?.id === "hubei";
  const cityOrder: readonly string[] = hubeiDirectory
    ? [
        "武汉市",
        "孝感市",
        "宜昌市",
        ...HUBEI_DIRECTORY.map((item) => item.name),
      ]
    : [];
  const cities = data.regions
    .filter(
      (r) =>
        r.level === "市" &&
        (regionSearch
          ? r.name.includes(regionSearch)
          : r.parentId === province?.id),
    )
    .sort((a, b) => {
      const aIndex = cityOrder.indexOf(a.name);
      const bIndex = cityOrder.indexOf(b.name);
      return (aIndex < 0 ? 99 : aIndex) - (bIndex < 0 ? 99 : bIndex);
    });
  const defaultCities = cities.slice(0, 3);
  if (
    region?.level === "市" &&
    !defaultCities.some((item) => item.id === region.id) &&
    !regionSearch
  ) {
    defaultCities.splice(2, 1, region);
  }
  const showAllCities = expandedCityProvince === province?.id;
  const visibleCities =
    regionSearch || showAllCities || hubeiDirectory ? cities : defaultCities;
  const chain = data.chains.find((c) => c.id === chainId) || data.chains[0];
  const stage = chain?.stages.find((s) => s.id === stageId) || chain?.stages[0];
  const matchingChains = data.chains.filter((c) =>
    `${c.name}${c.stages.flatMap((s) => [...s.products, ...s.aliases]).join(" ")}`.includes(
      chainQuery.trim(),
    ),
  );
  const defaultChains = matchingChains.slice(0, 5);
  if (
    chain &&
    !chainQuery.trim() &&
    !defaultChains.some((item) => item.id === chain.id)
  ) {
    defaultChains.splice(4, 1, chain);
  }
  const visibleChains =
    chainQuery.trim() || showAllChains ? matchingChains : defaultChains;
  const chainCompanies = data.companies.filter(
    (company) =>
      !company.local &&
      company.chainIds.includes(chain?.id || "") &&
      (!stage || company.stageIds.includes(stage.id)),
  );
  const companies = chainCompanies.filter(
    (company) =>
      relationship === "all" || company.relationship === relationship,
  );
  const cityNames = [...new Set(companies.map((company) => company.cityName))];
  const shares = region?.shares || [null, null, null];
  const regionChains = data.chains.filter((item) =>
    region?.chainIds.includes(item.id),
  );
  const hasShares = shares.every((share) => share !== null);
  const shareTotal = shares.reduce<number>(
    (sum, share) => sum + (share || 0),
    0,
  );
  const gdpInTrillions = region?.gdp != null && region.gdp >= 10000;
  const regionPortrait = portraitForRegion(region, data.regions);
  const chooseChain = (id: string) => {
    setRelationship("all");
    onChain(id);
  };
  const chooseStage = (id: string) => {
    setRelationship("all");
    onStage(id);
  };

  return (
    <>
      <aside
        className={`d-panel d-left np-panel${mode === "region" ? " np-region-picker" : ""}`}
        aria-label="全国产业全景筛选"
      >
        <div className="np-panel-heading">
          <span className="np-eyebrow">场景 01</span>
          <h1>全国产业全景</h1>
          <div className="d-segment np-mode" aria-label="全景查看方式">
            <button
              className={mode === "region" ? "is-active" : ""}
              aria-pressed={mode === "region"}
              onClick={() => onMode("region")}
            >
              按地区
            </button>
            <button
              className={mode === "industry" ? "is-active" : ""}
              aria-pressed={mode === "industry"}
              onClick={() => onMode("industry")}
            >
              按产业
            </button>
          </div>
          <label className="np-search">
            <Icon name="search" size={21} />
            <input
              aria-label={mode === "region" ? "搜索省份或城市" : "搜索产业链"}
              value={mode === "region" ? regionQuery : chainQuery}
              onChange={(event) =>
                mode === "region"
                  ? setRegionQuery(event.target.value)
                  : setChainQuery(event.target.value)
              }
              placeholder={mode === "region" ? "搜索省份或城市" : "搜索产业链"}
            />
            {(mode === "region" ? regionQuery : chainQuery) && (
              <button
                title="清空搜索"
                aria-label="清空搜索"
                onClick={() =>
                  mode === "region" ? setRegionQuery("") : setChainQuery("")
                }
              >
                <Icon name="close" size={17} />
              </button>
            )}
          </label>
        </div>

        {mode === "region" ? (
          <>
            <div className="np-panel-scroll">
              <section className="np-section">
                <div className="np-section-heading">
                  <h2>{regionSearch ? "省份搜索结果" : "地区选择"}</h2>
                  {!regionSearch && allProvinces.length > 5 && (
                    <button
                      className="np-expand-list"
                      aria-expanded={showAllProvinces}
                      onClick={() => setShowAllProvinces(!showAllProvinces)}
                    >
                      {showAllProvinces
                        ? "收起省份"
                        : `全部 ${allProvinces.length} 省`}
                      <Icon name="down" size={14} />
                    </button>
                  )}
                </div>
                <div className="np-regions" aria-label="省份列表">
                  {visibleProvinces.map((item) => (
                    <button
                      key={item.id}
                      className={`np-region${item.id === region?.id ? " is-selected" : ""}`}
                      aria-pressed={item.id === region?.id}
                      onClick={() => onRegion(item.id)}
                    >
                      <Icon name="pin" size={20} />
                      <span>{regionName(item)}</span>
                      <Icon name="chevron" size={18} />
                    </button>
                  ))}
                  {!provinces.length && (
                    <p className="np-empty-copy">没有匹配的省份</p>
                  )}
                </div>
              </section>
              <section className="np-section np-border-top">
                <div className="np-section-heading">
                  <h2>
                    {regionSearch
                      ? "城市搜索结果"
                      : hubeiDirectory
                        ? `湖北省 · 市州 / 直管地区 ${cities.length}`
                        : `${province ? regionName(province) : "地区"} · 城市`}
                  </h2>
                  {!regionSearch && !hubeiDirectory && cities.length > 3 && (
                    <button
                      className="np-expand-list"
                      aria-expanded={showAllCities}
                      onClick={() =>
                        setExpandedCityProvince(
                          showAllCities ? null : province?.id || null,
                        )
                      }
                    >
                      {showAllCities ? "收起城市" : `全部 ${cities.length} 城`}
                      <Icon name="down" size={14} />
                    </button>
                  )}
                </div>
                <div className="np-cities" aria-label="城市列表">
                  {visibleCities.map((item) => (
                    <button
                      key={item.id}
                      className={`np-city${item.id === region?.id ? " is-selected" : ""}`}
                      aria-pressed={item.id === region?.id}
                      onClick={() => onRegion(item.id)}
                    >
                      <span className="np-radio" />
                      <span>{item.name}</span>
                    </button>
                  ))}
                  {!cities.length && <p className="np-empty-copy">—</p>}
                </div>
              </section>
              <div className="np-note">
                <Icon name="info" size={19} />
                <span>更多地区资料建设中</span>
              </div>
            </div>
            <div className="np-left-footer">
              <button
                className="d-btn"
                onClick={() =>
                  onNotice(
                    `统计年度：${data.meta.year} 年。GDP 单位为亿元，增速与产业占比单位为百分比。`,
                  )
                }
              >
                <Icon name="chart" size={19} />
                {data.meta.year} 指标
              </button>
              <button
                className="d-btn"
                onClick={() =>
                  onNotice(
                    "数据依据各地区统计公报和产业规划。展开数据来源可查看文件名称与链接。",
                  )
                }
              >
                <Icon name="file" size={19} />
                数据说明
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="np-panel-scroll">
              <section className="np-section">
                <div className="np-section-heading">
                  <h2>
                    产业链目录{" "}
                    <span className="np-count">{data.chains.length}</span>
                  </h2>
                  {!chainQuery.trim() && data.chains.length > 5 && (
                    <button
                      className="np-expand-list"
                      aria-expanded={showAllChains}
                      onClick={() => setShowAllChains(!showAllChains)}
                    >
                      {showAllChains
                        ? "收起目录"
                        : `全部 ${data.chains.length} 条`}
                      <Icon name="down" size={14} />
                    </button>
                  )}
                </div>
                <div className="np-chain-list" aria-label="产业链目录">
                  {visibleChains.map((item) => (
                    <button
                      key={item.id}
                      className={`np-chain-choice${item.id === chain?.id ? " is-selected" : ""}`}
                      aria-pressed={item.id === chain?.id}
                      onClick={() => chooseChain(item.id)}
                    >
                      <Icon name={chainIcons[item.id] || "grid"} size={23} />
                      <span>{item.shortName || item.name}</span>
                      <Icon name="chevron" size={18} />
                    </button>
                  ))}
                  {!visibleChains.length && (
                    <p className="np-empty-copy">没有匹配的产业链</p>
                  )}
                </div>
              </section>
              <section className="np-section np-chain-stage">
                <h2>链条环节</h2>
                <div className="d-segment" aria-label="产业链上中下游">
                  {stageNames.map((tier) => {
                    const option = chain?.stages.find((s) => s.stage === tier);
                    return (
                      <button
                        key={tier}
                        className={stage?.stage === tier ? "is-active" : ""}
                        aria-pressed={stage?.stage === tier}
                        onClick={() =>
                          option
                            ? chooseStage(option.id)
                            : onNotice(
                                `${chain?.name || "该产业链"} · ${tier}：—`,
                              )
                        }
                      >
                        {tier}
                      </button>
                    );
                  })}
                </div>
                <label className="np-stage-picker">
                  {chain && stage && (
                    <StageVisual
                      chainId={chain.id}
                      stage={stage.stage}
                      className="np-picker-visual"
                    />
                  )}
                  <select
                    aria-label="选择产业链具体环节"
                    value={stage?.id || ""}
                    onChange={(event) => chooseStage(event.target.value)}
                  >
                    {chain?.stages.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.stage}
                      </option>
                    ))}
                  </select>
                  <Icon name="down" size={17} />
                </label>
                {stage && (
                  <PanelSource
                    label="环节说明与来源"
                    source={`产品或业务：${stage.products.join("、") || "—"}\n各地常见说法：${stage.aliases.join("、") || "—"}\n来源：${stage.source || "—"}`}
                  />
                )}
              </section>
            </div>
            <div className="np-panel-end-note">
              <Icon name="info" size={19} />
              <span>从产业链定位企业与城市</span>
            </div>
          </>
        )}
      </aside>

      {mode === "region" && region ? (
        <aside
          className="d-panel d-right np-panel np-region-overview"
          aria-label="地区产业概览"
        >
          <div className="np-overview-heading">
            <h2>{regionName(region)} · 产业概览</h2>
            <span className="np-portrait-tag">
              <i style={{ background: regionPortrait.color }} />
              {regionPortrait.name}
            </span>
          </div>
          <div className="np-panel-scroll">
            <div className="np-metric-grid">
              <div className="np-metric">
                <span>GDP</span>
                <p>
                  <strong>
                    {metric(
                      gdpInTrillions ? (region.gdp || 0) / 10000 : region.gdp,
                      2,
                    )}
                  </strong>
                  <span>{gdpInTrillions ? "万亿元" : "亿元"}</span>
                </p>
                <small>{region.gdp == null ? "—" : `${region.year} 年`}</small>
              </div>
              <div className="np-metric">
                <span>增速</span>
                <p>
                  <strong>{metric(region.growth, 2)}</strong>
                  {region.growth !== null && <span>%</span>}
                </p>
                <small>{region.growth == null ? "—" : "同比增长"}</small>
              </div>
            </div>
            <section className="np-section np-border-top">
              <h3>三次产业结构</h3>
              {hasShares && shareTotal > 0 ? (
                <div
                  className="np-share-bar"
                  aria-label={`第一产业 ${shares[0]}%，第二产业 ${shares[1]}%，第三产业 ${shares[2]}%`}
                >
                  {shares.map((share, index) => (
                    <span
                      key={index}
                      className={`np-share-${index}`}
                      style={{ width: `${((share || 0) / shareTotal) * 100}%` }}
                      title={`${["第一产业", "第二产业", "第三产业"][index]} ${share}%`}
                    />
                  ))}
                </div>
              ) : (
                <div className="np-share-bar np-share-empty">—</div>
              )}
              <div className="np-share-legend">
                {["第一产业", "第二产业", "第三产业"].map((name, i) => (
                  <span key={name}>
                    <i className={`np-share-${i}`} />
                    {name}
                    <b>
                      {shares[i] == null ? "—" : `${metric(shares[i], 2)}%`}
                    </b>
                  </span>
                ))}
              </div>
            </section>
            <section className="np-section np-border-top">
              <h3>支柱产业</h3>
              {region.pillars.length ? (
                <div className="np-pillar-tags">
                  {region.pillars.map((name, index) => (
                    <span key={name} className={`np-pillar-${index % 3}`}>
                      {name}
                    </span>
                  ))}
                </div>
              ) : (
                <EmptyState text="—" />
              )}
            </section>
            <section className="np-section np-border-top">
              <h3>十五五重点产业</h3>
              {region.priorities.length ? (
                <div className="np-priorities">
                  {region.priorities.map((name) => (
                    <span key={name}>
                      <i />
                      {name}
                    </span>
                  ))}
                </div>
              ) : (
                <EmptyState text="—" />
              )}
            </section>
            <section className="np-section np-border-top">
              <h3>对应产业链</h3>
              {regionChains.length ? (
                <div className="np-region-chains">
                  {regionChains.map((item) => (
                    <button
                      key={item.id}
                      aria-label={`查看${item.name}产业分布`}
                      onClick={() => {
                        chooseChain(item.id);
                        onMode("industry");
                      }}
                    >
                      <span>{item.name}</span>
                      <Icon name="chevron" size={14} />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="np-empty-copy">—</p>
              )}
            </section>
            <PanelSource source={region.source} />
          </div>
          <div className="np-next">
            <h3>下一站　云梦县产业画像</h3>
            <button className="d-btn d-primary" onClick={onProfile}>
              聚焦云梦 <Icon name="arrow" />
            </button>
          </div>
        </aside>
      ) : (
        <aside
          className="d-panel d-right np-panel np-industry-overview"
          aria-label="重点城市与企业"
        >
          <div className="np-overview-heading">
            <h2>重点城市与企业</h2>
            <span className="np-count">{companies.length} 家</span>
          </div>
          <div className="np-panel-scroll">
            {!!cityNames.length && (
              <div
                className="np-city-chips"
                aria-label="当前环节已收录企业的所在城市"
              >
                {cityNames.map((name) => (
                  <span key={name}>{name.replace(/市$/, "")}</span>
                ))}
              </div>
            )}
            <div className="np-company-list">
              {companies.map((company) => (
                <button
                  className="np-company-card"
                  key={company.id}
                  onClick={() => onCompany(company.id)}
                >
                  <CompanyLogo company={company} />
                  <span className="np-company-copy">
                    <strong>{company.name}</strong>
                    <span>
                      {company.cityName.replace(/市$/, "")} · {company.sector}
                    </span>
                    {company.relationship === "existing" && (
                      <span className="np-existing-tag">已有云梦投资记录</span>
                    )}
                  </span>
                  <Icon name="chevron" size={19} />
                </button>
              ))}
              {!companies.length && <EmptyState text="—" />}
            </div>
            <section className="np-relations np-border-top">
              <h3>与云梦的关联</h3>
              <p className="d-muted">已有项目与潜在配套分开查看</p>
              <button
                className={`np-relation-button${relationship === "existing" ? " is-selected" : ""}`}
                aria-pressed={relationship === "existing"}
                onClick={() =>
                  setRelationship(
                    relationship === "existing" ? "all" : "existing",
                  )
                }
              >
                <span className="np-relation-icon">
                  <Icon name="building" />
                </span>
                <span>
                  <strong>已有项目</strong>
                  <small>查看云梦已投企业及配套环节</small>
                </span>
                <Icon name="chevron" size={18} />
              </button>
              <button
                className={`np-relation-button${relationship === "prospect" ? " is-selected" : ""}`}
                aria-pressed={relationship === "prospect"}
                onClick={() =>
                  setRelationship(
                    relationship === "prospect" ? "all" : "prospect",
                  )
                }
              >
                <span className="np-relation-icon">
                  <Icon name="chart" />
                </span>
                <span>
                  <strong>潜在配套</strong>
                  <small>基于产业链识别潜在合作企业</small>
                </span>
                <Icon name="chevron" size={18} />
              </button>
            </section>
          </div>
          <div className="np-next">
            <button className="d-btn d-primary" onClick={onProfile}>
              查看云梦产业画像 <Icon name="arrow" />
            </button>
          </div>
        </aside>
      )}

      {mode === "region" && <RegionPortraitLegend />}
      {mode === "industry" && chain && (
        <>
          <div className="d-panel np-map-legend">
            <strong>{chain.shortName} · 全国分布</strong>
            <div className="np-legend-unverified">
              <i className="np-stage-dot np-tier-unverified" />
              <span>产业链相关城市</span>
            </div>
            {stageNames.map((tier, index) => (
              <div key={tier}>
                <i className={`np-stage-dot np-tier-${index}`} />
                <b>{tier}</b>
                <span>
                  {chain.stages
                    .filter((s) => s.stage === tier)
                    .map((s) => s.name)
                    .join(" / ") || "—"}
                </span>
              </div>
            ))}
          </div>
          <div
            className="d-panel d-center-bottom np-chain-strip"
            aria-label="产业链条"
          >
            <strong>产业链条</strong>
            <div className="np-chain-strip-stages">
              {stageNames.map((tier, index) => (
                <div className="np-chain-strip-step" key={tier}>
                  {index > 0 && <Icon name="arrow" size={18} />}
                  <div className="np-chain-tier" aria-label={`${tier}并行环节`}>
                    {chain.stages
                      .filter((item) => item.stage === tier)
                      .map((item) => (
                        <button
                          key={item.id}
                          className={`np-stage-node np-node-${index}${stage?.id === item.id ? " is-selected" : ""}`}
                          aria-pressed={stage?.id === item.id}
                          onClick={() => chooseStage(item.id)}
                        >
                          <StageVisual
                            chainId={chain.id}
                            stage={item.stage}
                            className="np-node-visual"
                          />
                          <span>{item.name}</span>
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
