import { useState } from "react";
import type { ChainStage, DemoData } from "./types";
import { CompanyLogo, EmptyState, Icon, metric, presentationText } from "./ui";
import { PanelSource } from "./NationalPanels";
import { StageVisual } from "./StageVisual";
import "./panels.css";

export interface CountyPanelsProps {
  data: DemoData;
  chainId: string;
  stageId: string;
  onChain: (id: string) => void;
  onStage: (id: string) => void;
  onMatch: () => void;
  onCompany: (id: string) => void;
  onNotice: (message: string) => void;
  onDocuments: () => void;
}

export function CountyPanels({
  data,
  chainId,
  stageId,
  onChain,
  onStage,
  onMatch,
  onCompany,
  onDocuments,
}: CountyPanelsProps) {
  const [requestedYear, setRequestedYear] = useState(data.meta.year);
  const [showShares, setShowShares] = useState(false);
  const profile = data.profile;
  const years = [...new Set(profile.indicators.map((item) => item.year))].sort(
    (a, b) => b - a,
  );
  const indicator =
    profile.indicators.find((item) => item.year === requestedYear) ||
    profile.indicators.find((item) => item.year === years[0]);
  const chain =
    data.chains.find((item) => item.id === chainId) || data.chains[0];
  const stage =
    chain?.stages.find((item) => item.id === stageId) || chain?.stages[0];
  const selectedLink = profile.chainLinks.find(
    (item) => item.stageId === stage?.id,
  );
  const isGap = selectedLink?.status === "gap";
  const isPresent = selectedLink?.status === "present";
  const isReportedGap = selectedLink?.reportedStatus === "补链";
  const selectedPillar =
    profile.pillars.find((item) => item.chainId === chain?.id) ||
    profile.pillars.find((item) => item.chainIds?.includes(chain?.id || ""));
  const companies = data.companies.filter(
    (company) =>
      company.local &&
      (company.chainIds.includes(chain?.id || "") ||
        selectedPillar?.companyIds.includes(company.id)),
  );
  const allLocal = data.companies.filter((company) => company.local);
  const recordedParks = profile.parks.filter(
    (park) => !park.planning && park.status !== "missing",
  );
  const plannedParks = profile.parks.filter((park) => park.planning);
  const linkedCompanyNames = (selectedLink?.companyIds || [])
    .map((id) => data.companies.find((company) => company.id === id)?.name)
    .filter(Boolean);
  const selectedChainSource = [
    selectedLink?.source,
    stage?.source,
  ].filter(Boolean).join("\n");
  const upstream = chain?.stages.filter((item) => item.stage === "上游") || [];
  const middle = chain?.stages.filter((item) => item.stage === "中游") || [];
  const downstream =
    chain?.stages.filter((item) => item.stage === "下游") || [];
  const currentYear = indicator?.year || requestedYear;

  const chainNode = (item: ChainStage) => {
    const link = profile.chainLinks.find((entry) => entry.stageId === item.id);
    const localNames = (link?.companyIds || [])
      .map((id) => data.companies.find((company) => company.id === id)?.name)
      .filter(Boolean);
    return (
      <div
        className={`cp-node-wrap cp-node-${link?.reportedStatus === "补链" ? "pending" : link?.status || "unknown"}`}
        key={item.id}
      >
        <button
          className={`cp-chain-node${item.id === stage?.id ? " is-selected" : ""}`}
          aria-pressed={item.id === stage?.id}
          onClick={() => onStage(item.id)}
        >
          <StageVisual chainId={chain?.id || ""} stage={item.stage} />
          <span className="cp-node-copy">
            <small>{item.stage}</small>
            <strong>{item.name}</strong>
          </span>
          <span className="cp-node-caption" title={localNames.join("、")}>
            {localNames.length ? `${localNames.slice(0, 2).join("、")}${localNames.length > 2 ? `等${localNames.length}家` : ""}` : ""}
          </span>
        </button>
      </div>
    );
  };

  return (
    <>
      <aside className="d-panel d-left cp-panel" aria-label="云梦产业画像">
        <div className="cp-panel-heading">
          <span className="cp-eyebrow">场景 02</span>
          <h1>云梦产业画像</h1>
          <p>孝感市 · 云梦县</p>
          {!selectedPillar && chain && (
            <div className="cp-current-chain">
              <Icon name="layers" size={17} />
              <span>
                当前产业链 <strong>{chain.name}</strong>
              </span>
            </div>
          )}
        </div>
        <div className="cp-panel-scroll">
          <section className="cp-section">
            <div className="cp-section-title">
              <h2>县域指标</h2>
              <label className="cp-year">
                <span className="cp-sr-only">指标年份</span>
                <select
                  aria-label="云梦指标年份"
                  value={currentYear}
                  onChange={(event) =>
                    setRequestedYear(Number(event.target.value))
                  }
                >
                  {(years.length ? years : [data.meta.year]).map((year) => (
                    <option key={year} value={year}>
                      {year} 年
                    </option>
                  ))}
                </select>
                <Icon name="down" size={14} />
              </label>
            </div>
            <div className="cp-metric-grid">
              <div className="cp-metric">
                <span>地区生产总值</span>
                <p>
                  <strong>{metric(indicator?.gdp, 2)}</strong>
                  {indicator?.gdp != null && <small>亿元</small>}
                </p>
                <small>
                  {indicator?.gdp == null ? "" : `${currentYear} 年`}
                </small>
              </div>
              <div className="cp-metric">
                <span>规上工业</span>
                <p>
                  <strong>{metric(indicator?.industrialEnterprises, 0)}</strong>
                  {indicator?.industrialEnterprises != null && (
                    <small>家</small>
                  )}
                </p>
                <small>
                  {indicator?.industrialEnterprises == null
                    ? ""
                    : "规模以上工业企业"}
                </small>
              </div>
              <div className="cp-metric">
                <span>重点企业</span>
                <p>
                  <strong>{allLocal.length || "—"}</strong>
                  {allLocal.length > 0 && <small>家</small>}
                </p>
                <small>{allLocal.length ? "重点企业" : ""}</small>
              </div>
              <div className="cp-metric">
                <span>产业园区</span>
                <p>
                  <strong>{recordedParks.length || "—"}</strong>
                  {recordedParks.length > 0 && <small>个</small>}
                </p>
                <small>
                  {recordedParks.length
                    ? `已收录${plannedParks.length ? ` · 另有 ${plannedParks.length} 处规划` : "园区"}`
                    : ""}
                </small>
              </div>
            </div>
            <div className="cp-year-details">
              <span>
                GDP 增速{" "}
                <b>
                  {metric(indicator?.growth, 2)}
                  {indicator?.growth != null ? "%" : ""}
                </b>
              </span>
              <button
                aria-expanded={showShares}
                onClick={() => setShowShares(!showShares)}
              >
                三产结构{" "}
                <Icon name={showShares ? "down" : "chevron"} size={15} />
              </button>
            </div>
            {showShares && (
              <div
                className="cp-share-details"
                aria-label={`${currentYear}年三次产业占比`}
              >
                {["第一产业", "第二产业", "第三产业"].map((name, index) => (
                  <span key={name}>
                    {name}
                    <strong>
                      {indicator?.shares[index] == null
                        ? "—"
                        : `${metric(indicator.shares[index], 2)}%`}
                    </strong>
                  </span>
                ))}
              </div>
            )}
            <PanelSource
              label={`${currentYear} 年指标来源`}
              source={indicator?.source}
            />
          </section>

          <section className="cp-section">
            <div className="cp-section-title">
              <h2>重点产业</h2>
            </div>
            <div className="cp-pillar-grid">
              {profile.pillars.map((pillar) => (
                <button
                  key={pillar.id}
                  className={`d-btn${pillar.id === selectedPillar?.id ? " d-primary" : ""}`}
                  aria-pressed={pillar.id === selectedPillar?.id}
                  onClick={() => onChain(pillar.chainId)}
                >
                  {pillar.name}
                </button>
              ))}
              {!profile.pillars.length && (
                <EmptyState text="支柱产业资料待接入" />
              )}
            </div>
            {selectedPillar && (
              <>
                <div className="cp-pillar-facts">
                  <span>
                    产值规模 <b>{presentationText(selectedPillar.output) || "—"}</b>
                  </span>
                  <span>
                    所在园区 <b>{presentationText(selectedPillar.park) || "—"}</b>
                  </span>
                  {selectedPillar.chainIds &&
                    selectedPillar.chainIds.length > 1 && (
                      <span>
                        对应产业链{" "}
                        <b>
                          {selectedPillar.chainIds
                            .map(
                              (id) =>
                                data.chains.find((item) => item.id === id)
                                  ?.shortName,
                            )
                            .filter(Boolean)
                            .join("、")}
                        </b>
                      </span>
                    )}
                </div>
                <PanelSource
                  label="产业规模与园区来源"
                  source={[
                    selectedPillar.source,
                    ...profile.parks
                      .filter((park) =>
                        selectedPillar.park?.includes(park.name),
                      )
                      .map(
                        (park) =>
                          `${park.name}${park.planning ? "（规划中）" : ""}：${park.note || ""}；${park.source}`,
                      ),
                  ]
                    .filter(Boolean)
                    .join("\n")}
                />
              </>
            )}
          </section>

          <section className="cp-section">
            <h2>在地企业</h2>
            <div className="cp-company-list">
              {companies.map((company) => (
                <button
                  key={company.id}
                  className="cp-company-card"
                  onClick={() => onCompany(company.id)}
                >
                  <CompanyLogo company={company} />
                  <span>
                    <strong>{company.name}</strong>
                    <small>{presentationText(company.sector) || "—"}</small>
                  </span>
                  <Icon name="chevron" size={18} />
                </button>
              ))}
              {!companies.length && (
                <EmptyState
                  text="该产业在地企业待补充"
                  detail="未收录不代表本地没有相关企业"
                />
              )}
            </div>
          </section>
        </div>
        <div className="cp-left-footer">
          <button className="d-btn" onClick={onDocuments}>
            <Icon name="file" size={21} />
            公开资料与政策文件 <Icon name="arrow" size={18} />
          </button>
        </div>
      </aside>

      <aside
        className="d-panel d-right cp-panel cp-opportunity"
        aria-label="招商切入点"
      >
        <h2 className="cp-opportunity-title">招商切入点</h2>
        <div className="cp-panel-scroll">
          <label className="cp-chain-picker">
            <Icon name="layers" size={18} />
            <select
              aria-label="画像产业链"
              value={chain?.id || ""}
              onChange={(event) => onChain(event.target.value)}
            >
              {data.chains.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <Icon name="down" size={15} />
          </label>
          <label
            className={`cp-gap-select${isGap || isReportedGap ? " is-gap" : ""}`}
          >
            <span className="cp-sr-only">选择招商切入环节</span>
            <select
              aria-label="选择招商切入环节"
              value={stage?.id || ""}
              onChange={(event) => onStage(event.target.value)}
            >
              {chain?.stages.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <Icon name="down" size={18} />
          </label>
          <section className="cp-section cp-reasons">
            <h3>切入依据与方向</h3>
            <div className="cp-reason">
              <span>01</span>
              <div>
                <h4>
                  {selectedPillar?.name || chain?.shortName || "县域产业"}基础
                </h4>
                <p>
                  {presentationText(selectedLink?.basis)
                    ? presentationText(selectedLink?.basis)
                    : linkedCompanyNames.length
                      ? `相关企业包括${linkedCompanyNames.slice(0, 3).join("、")}${linkedCompanyNames.length > 3 ? "等企业" : ""}。`
                      : companies.length
                        ? `相关产业企业包括${companies
                            .slice(0, 3)
                            .map((company) => company.name)
                            .join(
                              "、",
                            )}。`
                        : `围绕${chain?.name || "所选产业链"}梳理产业与企业布局。`}
                </p>
              </div>
            </div>
            <div className="cp-reason">
              <span>02</span>
              <div>
                <h4>
                  {isPresent ? "产业协同方向" : "招商合作方向"}
                </h4>
                <p>
                  {`围绕${stage?.products.slice(0, 2).join("、") || stage?.name || "目标环节"}，评估产品配套、技术协作与市场拓展机会。`}
                </p>
              </div>
            </div>
            <div className="cp-reason">
              <span>03</span>
              <div>
                <h4>寻找协同企业</h4>
                <p>
                  围绕
                  {stage?.products.slice(0, 3).join("、") ||
                    stage?.name ||
                    "所选产品"}
                  ，在全国名录中寻找配套企业，再结合要素流开展匹配。
                </p>
              </div>
            </div>
            <PanelSource
              label="资料来源"
              source={selectedChainSource}
            />
          </section>
          <section className="cp-section cp-policy-section">
            <h3>链长制与政策</h3>
            <button className="cp-policy-button" onClick={onDocuments}>
              <Icon name="file" size={23} />
              <strong>链长制信息</strong>
              <span>
                {profile.leaders.some((item) => item.name)
                  ? "查看资料"
                  : "—"}
              </span>
              <Icon name="chevron" size={17} />
            </button>
            <button className="cp-policy-button" onClick={onDocuments}>
              <Icon name="file" size={23} />
              <strong>政策原文</strong>
              <span>
                {profile.policies.some((item) => item.url)
                  ? "查看资料"
                  : "—"}
              </span>
              <Icon name="chevron" size={17} />
            </button>
          </section>
        </div>
        <div className="cp-next">
          <button className="d-btn d-primary" onClick={onMatch}>
            匹配这个环节 <Icon name="arrow" />
          </button>
        </div>
      </aside>

      {chain && (
        <div
          className="d-panel d-center-bottom cp-chain-map"
          aria-label="云梦产业链图谱"
        >
          <div className="cp-chain-map-heading">
            <h3>{chain.shortName} · 产业链图谱</h3>
          </div>
          <div className="cp-chain-diagram">
            <div className="cp-chain-column">{upstream.map(chainNode)}</div>
            <div
              className={`cp-chain-connector${middle.length < 2 ? " cp-simple-connector" : ""}`}
              aria-hidden="true"
            >
              <span />
            </div>
            <div className="cp-chain-column cp-parallel-materials">
              {middle.map(chainNode)}
            </div>
            <div
              className={`cp-chain-connector${middle.length < 2 ? " cp-simple-connector" : " cp-connector-merge"}`}
              aria-hidden="true"
            >
              <span />
            </div>
            <div className="cp-chain-column">{downstream.map(chainNode)}</div>
          </div>
        </div>
      )}
    </>
  );
}
