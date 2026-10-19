import { useMemo, useState } from "react";
import { FLOW_TYPES, FLOW_TYPE_ORDER } from "../map";

/** 颜色走 CSS 变量，随夜色/浅色主题切换。 */
export const flowColor = (t: FlowType) => `var(--c-${t})`;
import type { FlowFilter, FlowHover, FlowProps, FlowType } from "../map";
import type { FlowRankings } from "../hooks/useFlowLayer";

export function formatFlow(type: FlowType, v: number) {
  if (type === "capital")
    return v >= 10000
      ? `${(v / 10000).toFixed(v >= 1e5 ? 0 : 1)} 亿元`
      : `${Math.round(v).toLocaleString("zh-CN")} 万元`;
  return v >= 100
    ? Math.round(v).toLocaleString("zh-CN")
    : v.toFixed(v >= 10 ? 1 : 2);
}
const UNIT: Record<FlowType, string> = {
  people: "迁徙指数",
  capital: "投资额",
  tech: "技术流强度",
};
const SCOPES: { id: FlowFilter["scope"]; name: string }[] = [
  { id: "national", name: "全国主干" },
  { id: "xiaogan", name: "孝感相关" },
  { id: "yunmeng", name: "云梦明细" },
];
const NATIONAL_LEVELS = [
  { id: 1, name: "核心", hint: "30%" },
  { id: 2, name: "主要", hint: "50%" },
  { id: 3, name: "扩展", hint: "70%" },
] as const;
const LOCAL_LEVELS = [
  { id: 1, name: "前 10" },
  { id: 2, name: "前 20" },
  { id: 3, name: "全部" },
] as const;
const INTRO: Record<FlowFilter["scope"], string> = {
  national: "按流量从大到小累加，只画撑起全国主要流量的主干线。",
  xiaogan: "和孝感市（云梦所在的地级市）往来的城市，按流量排名。",
  yunmeng: "云梦县自己的联合专利与上市公司投资，都是真实记录。",
};

interface Segment<T> {
  value: T;
  options: readonly { id: T; name: string; hint?: string }[];
  onChange: (value: T) => void;
  label: string;
}
function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: Segment<T>) {
  return (
    <div className="flow-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={o.id === value}
          onClick={() => onChange(o.id)}
        >
          {o.name}
          {o.hint && <small>{o.hint}</small>}
        </button>
      ))}
    </div>
  );
}

function Bars({
  rows,
}: {
  rows: { key: string; name: string; value: number; type: FlowType }[];
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ol className="flow-bars">
      {rows.map((r, i) => (
        <li key={r.key}>
          <span className="flow-rank-no">{i + 1}</span>
          <span className="flow-rank-name">{r.name}</span>
          <span className="flow-rank-bar">
            <i
              style={{
                width: `${Math.max(4, (r.value / max) * 100)}%`,
                background: flowColor(r.type),
              }}
            />
          </span>
          <span className="flow-rank-value">{formatFlow(r.type, r.value)}</span>
        </li>
      ))}
    </ol>
  );
}

interface Props {
  filter: FlowFilter;
  setFilter: (next: Partial<FlowFilter>) => void;
  visible: FlowProps[];
  rankings: FlowRankings | null;
  ready: boolean;
  error: string | null;
}

export function FlowPanel({
  filter,
  setFilter,
  visible,
  rankings,
  ready,
  error,
}: Props) {
  const [rankType, setRankType] = useState<FlowType>("people");
  const shownRankType = filter.types.includes(rankType)
    ? rankType
    : filter.types[0];
  const counts = useMemo(() => {
    const c: Record<FlowType, number> = { people: 0, capital: 0, tech: 0 };
    for (const p of visible) c[p.t] += 1;
    return c;
  }, [visible]);
  const toggleType = (t: FlowType) => {
    const has = filter.types.includes(t);
    if (has && filter.types.length === 1) return;
    setFilter({
      types: has
        ? filter.types.filter((x) => x !== t)
        : FLOW_TYPE_ORDER.filter((x) => x === t || filter.types.includes(x)),
    });
  };

  const rankRows = useMemo(() => {
    if (filter.scope === "national") {
      return (rankings?.[shownRankType].national_top10 || []).map((r) => ({
        key: r.code,
        name: r.name,
        value: r.inflow,
        type: shownRankType,
      }));
    }
    return visible
      .filter((p) => p.t === shownRankType)
      .sort((a, b) => b.v - a.v)
      .slice(0, 10)
      .map((p, i) => ({
        key: `${p.o}-${p.d}-${i}`,
        name: filter.direction === "in" ? p.o : p.d,
        value: p.v,
        type: p.t,
      }));
  }, [filter.scope, filter.direction, rankings, shownRankType, visible]);

  const yunmengRows = useMemo(
    () =>
      [...visible].sort(
        (a, b) =>
          FLOW_TYPE_ORDER.indexOf(a.t) - FLOW_TYPE_ORDER.indexOf(b.t) ||
          b.v - a.v,
      ),
    [visible],
  );
  const block = rankings?.[shownRankType];

  return (
    <aside className="flow-panel" aria-label="流空间">
      <header>
        <div className="flow-eyebrow">流空间 · 2025</div>
        <h2>城市间的人口、资本、技术流</h2>
        <p>{INTRO[filter.scope]}</p>
      </header>

      <Segmented
        label="范围"
        value={filter.scope}
        options={SCOPES}
        onChange={(scope) => setFilter({ scope })}
      />

      <div className="flow-types" aria-label="流类型">
        {FLOW_TYPE_ORDER.map((t) => (
          <button
            key={t}
            aria-pressed={filter.types.includes(t)}
            onClick={() => toggleType(t)}
            style={{ ["--flow" as string]: flowColor(t) }}
          >
            <span className="flow-dot" />
            {FLOW_TYPES[t].name}
            <small>{filter.types.includes(t) ? counts[t] : "—"}</small>
          </button>
        ))}
      </div>

      {filter.scope === "national" && (
        <div className="flow-field">
          <div className="flow-label">
            显示阈值<span>累计占全国流量</span>
          </div>
          <Segmented
            label="显示阈值"
            value={filter.level}
            options={NATIONAL_LEVELS}
            onChange={(level) => setFilter({ level })}
          />
        </div>
      )}
      {filter.scope === "xiaogan" && (
        <div className="flow-field">
          <Segmented
            label="方向"
            value={filter.direction}
            options={[
              { id: "in", name: "流入孝感" },
              { id: "out", name: "流出孝感" },
            ]}
            onChange={(direction) => setFilter({ direction })}
          />
          <Segmented
            label="条数"
            value={filter.level}
            options={LOCAL_LEVELS}
            onChange={(level) => setFilter({ level })}
          />
        </div>
      )}

      <div className="flow-stat">
        {error
          ? error
          : ready
            ? `当前显示 ${visible.length} 条流线`
            : "正在载入流数据…"}
      </div>

      {filter.scope !== "yunmeng" ? (
        <section className="flow-card">
          <div className="flow-card-head">
            <h3>
              {filter.scope === "national"
                ? "城市流入排名"
                : filter.direction === "in"
                  ? "流入孝感 · 来源城市"
                  : "孝感流出 · 去向城市"}
            </h3>
            <div className="flow-tabs">
              {filter.types.map((t) => (
                <button
                  key={t}
                  aria-pressed={t === shownRankType}
                  onClick={() => setRankType(t)}
                  style={{ ["--flow" as string]: flowColor(t) }}
                >
                  {FLOW_TYPES[t].name.replace("流", "")}
                </button>
              ))}
            </div>
          </div>
          <Bars rows={rankRows} />
          {filter.scope === "national" && block?.xiaogan_national_rank && (
            <div className="flow-xiaogan">
              孝感市：全国第 <b>{block.xiaogan_national_rank}</b> 名
              <span> / {block.cities_ranked} 个城市</span>
            </div>
          )}
          <div className="flow-unit">单位：{UNIT[shownRankType]}</div>
        </section>
      ) : (
        <section className="flow-card">
          <div className="flow-card-head">
            <h3>云梦县的真实流</h3>
          </div>
          <ul className="flow-records">
            {yunmengRows.map((p, i) => (
              <li key={`${p.o}-${p.d}-${i}`}>
                <span
                  className="flow-dot"
                  style={{ ["--flow" as string]: flowColor(p.t) }}
                />
                <div>
                  <div className="flow-record-route">
                    {p.o} <em>→</em> {p.d}
                  </div>
                  <div className="flow-record-note">{p.note}</div>
                </div>
                <span className="flow-rank-value">{formatFlow(p.t, p.v)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer>
        线越粗越亮，流量越大；线由暗到亮、光点飞行的方向，就是流动方向。
        <br />
        数据：地级市 OD 迁徙指数（2025）· 上市公司对外投资（截至 2025-12-31）·
        联合申请专利（2025）
      </footer>
    </aside>
  );
}

export function FlowTooltip({ hover }: { hover: FlowHover | null }) {
  if (!hover) return null;
  const p = hover.props;
  const meta = FLOW_TYPES[p.t];
  const rank =
    p.scope === undefined
      ? `全国第 ${p.r} 名${p.c ? ` · 累计 ${(p.c * 100).toFixed(1)}%` : ""}`
      : p.scope === "xiaogan"
        ? `${p.dir === "in" ? "流入" : "流出"}孝感第 ${p.r} 名`
        : p.note;
  return (
    <div
      className="flow-tooltip"
      style={{
        left: hover.pixel[0] + 16,
        top: hover.pixel[1] + 14,
        ["--flow" as string]: flowColor(p.t),
      }}
    >
      <div className="flow-tooltip-type">
        <span className="flow-dot" />
        {meta.name}
      </div>
      <div className="flow-tooltip-route">
        {p.o} <em>→</em> {p.d}
      </div>
      <div className="flow-tooltip-value">
        {formatFlow(p.t, p.v)}
        <small>{p.t === "capital" ? "" : UNIT[p.t]}</small>
      </div>
      {rank && <div className="flow-tooltip-rank">{rank}</div>}
    </div>
  );
}
