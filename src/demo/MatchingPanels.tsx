import { useMemo, useState } from "react";
import type { useFlowLayer } from "../hooks/useFlowLayer";
import { FlowPanel } from "../components/FlowPanel";
import { FLOW_TYPE_ORDER, FLOW_TYPES } from "../map";
import { CompanyLogo, Icon, EmptyState, presentationText } from "./ui";
import { matchScore, SCORE_LABELS } from "./types";
import type { DemoData, ScoreWeights } from "./types";
import { companiesForStage, rankedCities, rebalanceWeights } from "./selectors";

type Flows = ReturnType<typeof useFlowLayer>;
interface Props {
  data: DemoData;
  flows: Flows;
  chainId: string;
  stageId: string;
  onChain(id: string): void;
  onStage(id: string): void;
  cityId: string;
  onCity(id: string): void;
  onCompany(id: string): void;
  weights: ScoreWeights;
  onWeights(weights: ScoreWeights): void;
  threshold: number;
  onThreshold(value: number): void;
  onNotice(text: string): void;
}
export function MatchingPanels({
  data,
  flows,
  chainId,
  stageId,
  onChain,
  onStage,
  cityId,
  onCity,
  onCompany,
  weights,
  onWeights,
  threshold,
  onThreshold,
  onNotice,
}: Props) {
  const [showFlowSettings, setShowFlowSettings] = useState(false);
  const [page, setPage] = useState(0);
  const chain = data.chains.find((c) => c.id === chainId) || data.chains[0];
  const stages = chain?.stages || [];
  const ranked = useMemo(
    () => rankedCities(data, chainId, stageId, weights, threshold),
    [data, chainId, stageId, weights, threshold],
  );
  const city = ranked.find((row) => row.city.id === cityId)?.city;
  const companies = city
    ? companiesForStage(data, chainId, stageId, city.id)
    : [];
  const eligibleCompanies = companiesForStage(data, chainId, stageId).filter(
    (company) => ranked.some((row) => row.city.id === company.cityId),
  );
  const chainLink = data.profile.chainLinks.find(
    (link) => link.stageId === stageId,
  );
  function changeWeight(index: number, next: number) {
    onWeights(rebalanceWeights(weights, index, next));
  }
  return (
    <>
      <aside className="d-panel d-left mp-left" aria-label="流空间招商匹配条件">
        <div className="mp-scroll">
          <div className="d-eyebrow">场景 03</div>
          <h1 className="d-heading">流空间招商匹配</h1>
          <div className="mp-field">
            <label>招商目标</label>
            <strong>云梦县</strong>
          </div>
          <label className="mp-field">
            <span>目标产业链</span>
            <select
              aria-label="匹配产业链"
              value={chainId}
              onChange={(e) => onChain(e.target.value)}
            >
              {data.chains.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mp-gap">
            <select
              aria-label="匹配目标环节"
              value={stageId}
              onChange={(e) => onStage(e.target.value)}
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <section className="d-section">
            <h3>要素联系</h3>
            <div className="mp-flow-types">
              {FLOW_TYPE_ORDER.map((t) => (
                <button
                  key={t}
                  aria-pressed={flows.filter.types.includes(t)}
                  style={
                    { "--type-color": `var(--c-${t})` } as React.CSSProperties
                  }
                  onClick={() => {
                    const next = flows.filter.types.includes(t)
                      ? flows.filter.types.filter((v) => v !== t)
                      : FLOW_TYPE_ORDER.filter(
                          (v) => v === t || flows.filter.types.includes(v),
                        );
                    if (next.length) flows.setFilter({ types: next });
                  }}
                >
                  <span>{flows.filter.types.includes(t) ? "✓" : ""}</span>
                  {FLOW_TYPES[t].name}
                </button>
              ))}
            </div>
            <button
              className="mp-settings-toggle"
              aria-expanded={showFlowSettings}
              onClick={() => setShowFlowSettings(!showFlowSettings)}
            >
              <Icon name="layers" size={17} />
              流线设置与实际排名 <Icon name="down" size={16} />
            </button>
            <div className="mp-flow-settings" hidden={!showFlowSettings}>
              <div className="mp-flow-actions">
                <button
                  className="d-btn"
                  onClick={() =>
                    flows.setTheme(flows.theme === "plan" ? "night" : "plan")
                  }
                >
                  {flows.theme === "plan" ? "夜色底图" : "浅色底图"}
                </button>
                <button className="d-btn" onClick={flows.replay}>
                  <Icon name="replay" size={16} />
                  重播
                </button>
                <button
                  className="d-btn"
                  onClick={() => flows.setEnabled(!flows.enabled)}
                >
                  {flows.enabled ? "隐藏流线" : "显示流线"}
                </button>
              </div>
              <FlowPanel
                filter={flows.filter}
                setFilter={flows.setFilter}
                visible={flows.visible}
                rankings={flows.rankings}
                ready={flows.ready}
                error={flows.error}
              />
            </div>
          </section>
          <section className="d-section mp-threshold">
            <div className="d-section-title">
              <h3>匹配阈值</h3>
            </div>
            <div className="mp-slider-row">
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={threshold}
                aria-label="匹配分数阈值"
                onChange={(e) => {
                  onThreshold(+e.target.value);
                  setPage(0);
                }}
              />
              <output>{threshold}</output>
            </div>
          </section>
          <section className="d-section">
            <h3>匹配权重</h3>
            <div className="mp-weights">
              {SCORE_LABELS.map((label, i) => (
                <label key={label}>
                  <span>{label}</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    aria-label={`${label}权重`}
                    value={weights[i]}
                    onChange={(e) => changeWeight(i, +e.target.value)}
                  />
                  <output>{weights[i]}%</output>
                </label>
              ))}
            </div>
          </section>
        </div>
        <div className="mp-footer">
          <button
            className="d-btn d-primary"
            onClick={() => {
              setPage(0);
              if (ranked[0]) onCity(ranked[0].city.id);
              flows.replay();
              onNotice(`匹配完成：${ranked.length} 个城市达到阈值`);
            }}
          >
            <Icon name="replay" />
            重新匹配
          </button>
        </div>
      </aside>
      <aside className="d-panel d-right mp-right" aria-label="城市匹配潜力">
        <div className="d-section-title">
          <h2>城市匹配潜力</h2>
        </div>
        <div className="d-segment">
          <button aria-pressed={page === 0} onClick={() => setPage(0)}>
            前 10
          </button>
          <button aria-pressed={page === 1} onClick={() => setPage(1)}>
            11–50
          </button>
        </div>
        <div className="mp-rank-scroll">
          {ranked.length > page * 10 ? (
            <ol className="mp-ranks" start={page ? 11 : 1}>
              {ranked
                .slice(page ? 10 : 0, page ? 50 : 10)
                .map(({ city: item, score }, index) => (
                  <li key={item.id}>
                    <button
                      aria-pressed={cityId === item.id}
                      onClick={() => onCity(item.id)}
                    >
                      <span className="mp-rank-number">
                        {String(index + (page ? 11 : 1)).padStart(2, "0")}
                      </span>
                      <strong>{item.name.replace(/市$/, "")}</strong>
                      <span className="mp-rank-bar">
                        <i style={{ width: `${score}%` }} />
                      </span>
                      <b>{score.toFixed(1)}</b>
                    </button>
                  </li>
                ))}
            </ol>
          ) : (
            <EmptyState
              text="当前分段没有城市"
              detail="可降低匹配阈值或调整匹配权重"
            />
          )}
        </div>
        <section className="mp-company-section">
          <h3>{city?.name.replace(/市$/, "") || "选择城市"} · 企业线索</h3>
          <div className="mp-company-list">
            {companies.length ? (
              companies.map((company) => (
                <button
                  className="mp-company"
                  key={company.id}
                  onClick={() => onCompany(company.id)}
                >
                  <CompanyLogo company={company} />
                  <span>
                    <strong>
                      {company.name}{" "}
                      {company.stockCode && <small>{company.stockCode}</small>}
                    </strong>
                    <span>{presentationText(company.sector) || "—"}</span>
                    {company.relationship === "existing" && (
                      <span className="d-tag d-tag-verified">
                        已有云梦投资记录
                      </span>
                    )}
                  </span>
                  <b>
                    {city ? matchScore(city, weights).toFixed(1) : "—"}
                  </b>
                </button>
              ))
            ) : (
              <EmptyState
                text="—"
              />
            )}
          </div>
          <button
            className="d-btn d-primary"
            disabled={!companies.length}
            onClick={() => companies[0] && onCompany(companies[0].id)}
          >
            查看企业 <Icon name="arrow" />
          </button>
        </section>
      </aside>
      <div className="d-panel mp-kpis" aria-label="匹配结果概况">
        <div>
          <span>匹配城市</span>
          <strong>
            {ranked.length}
            <small>个</small>
          </strong>
        </div>
        <div>
          <span>重点城市</span>
          <strong>
            {Math.min(ranked.length, 10)}
            <small>个</small>
          </strong>
        </div>
        <div>
          <span>企业线索</span>
          <strong>
            {eligibleCompanies.length}
            <small>家</small>
          </strong>
        </div>
      </div>
    </>
  );
}
