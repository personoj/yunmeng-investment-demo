import { useEffect, useMemo, useRef, useState } from "react";
import type { FlowFilter, FlowProps, FlowTheme, FlowType } from "../map";
import type { FlowRankings } from "../hooks/useFlowLayer";
import type { TourStep } from "../hooks/useFlowTour";
import { TOUR } from "../hooks/useFlowTour";
import { FLOW_TYPE_ORDER } from "../map";

/** 清洗前的全国城市对数量（地级市 OD）。 */
const PAIRS: Record<FlowType, number> = {
  people: 71634,
  capital: 11521,
  tech: 10517,
};
const TYPE_SHORT: Record<FlowType, string> = {
  people: "人口",
  capital: "资本",
  tech: "技术",
};

/** 数字滚动：从上一个值平滑过渡到新值。 */
function useCountUp(target: number, ms = 900) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const begin = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const v = begin + (target - begin) * (1 - (1 - t) ** 3);
      from.current = v;
      setValue(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

interface Kpi {
  label: string;
  value: number;
  digits?: number;
  unit: string;
  accent?: string;
}

function KpiCell({ kpi }: { kpi: Kpi }) {
  const v = useCountUp(kpi.value);
  return (
    <div
      className="flow-kpi"
      style={{ ["--kpi" as string]: kpi.accent ?? "var(--fp-accent)" }}
    >
      <div className="flow-kpi-label">{kpi.label}</div>
      <div className="flow-kpi-value">
        {v.toLocaleString("zh-CN", {
          minimumFractionDigits: kpi.digits ?? 0,
          maximumFractionDigits: kpi.digits ?? 0,
        })}
        <small>{kpi.unit}</small>
      </div>
    </div>
  );
}

function useKpis(
  filter: FlowFilter,
  visible: FlowProps[],
  rankings: FlowRankings | null,
): Kpi[] {
  return useMemo(() => {
    const cities = (pick: (p: FlowProps) => string[]) =>
      new Set(visible.flatMap(pick)).size;
    if (filter.scope === "national") {
      return [
        {
          label: "底层城市对",
          value: filter.types.reduce((s, t) => s + PAIRS[t], 0),
          unit: "对",
        },
        { label: "当前主干流线", value: visible.length, unit: "条" },
        { label: "覆盖城市", value: cities((p) => [p.o, p.d]), unit: "个" },
        {
          label: "承载全国流量",
          value: [30, 50, 70][filter.level - 1],
          unit: "%",
          accent: "var(--c-yunmeng)",
        },
      ];
    }
    if (filter.scope === "xiaogan") {
      const t = filter.types[0];
      const block = rankings?.[t];
      return [
        {
          label: filter.direction === "in" ? "来源城市" : "去向城市",
          value: cities((p) => [filter.direction === "in" ? p.o : p.d]),
          unit: "个",
        },
        { label: "当前流线", value: visible.length, unit: "条" },
        {
          label: `孝感${TYPE_SHORT[t]}流入 · 全国排名`,
          value: block?.xiaogan_national_rank ?? 0,
          unit: `/ ${block?.cities_ranked ?? "—"}`,
          accent: "var(--c-yunmeng)",
        },
      ];
    }
    const capitalIn = visible.filter(
      (p) => p.t === "capital" && p.dir === "in",
    );
    const patents = visible
      .filter((p) => p.t === "tech")
      .reduce((s, p) => s + Number(p.note?.match(/(\d+)\s*件/)?.[1] ?? 0), 0);
    return [
      { label: "真实流记录", value: visible.length, unit: "条" },
      { label: "外来投资企业", value: capitalIn.length, unit: "家" },
      {
        label: "外来投资额",
        value: capitalIn.reduce((s, p) => s + p.v, 0) / 10000,
        digits: 2,
        unit: "亿元",
        accent: "var(--c-capital)",
      },
      {
        label: "联合申请专利",
        value: patents,
        unit: "件",
        accent: "var(--c-tech)",
      },
    ];
  }, [filter, visible, rankings]);
}

/** 规划图式副标题：随视图与筛选变化。 */
function subtitle(filter: FlowFilter) {
  const types = FLOW_TYPE_ORDER.filter((t) => filter.types.includes(t))
    .map((t) => TYPE_SHORT[t])
    .join("·");
  if (filter.scope === "national") return `全国城市${types}流格局图`;
  if (filter.scope === "xiaogan")
    return `孝感市${types}${filter.direction === "in" ? "流入来源" : "流出去向"}图`;
  return "云梦县企业投资与技术合作流向图";
}

/** 指北针（规划图常用的四角星样式）。 */
function NorthArrow() {
  return (
    <svg className="flow-north" viewBox="0 0 60 76" aria-label="指北针">
      <text x="30" y="11" textAnchor="middle">
        N
      </text>
      <circle cx="30" cy="44" r="17" className="ring" />
      <path
        className="dark"
        d="M30 16 L35 44 L30 44 Z M30 72 L25 44 L30 44 Z"
      />
      <path
        className="light"
        d="M30 16 L25 44 L30 44 Z M30 72 L35 44 L30 44 Z"
      />
      <path className="dark" d="M58 44 L30 49 L30 44 Z M2 44 L30 39 L30 44 Z" />
      <path
        className="light"
        d="M58 44 L30 39 L30 44 Z M2 44 L30 49 L30 44 Z"
      />
    </svg>
  );
}

/** 流向箭头图例符号。 */
function ArrowSymbol({ type, thin }: { type: FlowType; thin?: boolean }) {
  return (
    <svg className="flow-legend-sym" viewBox="0 0 44 16" aria-hidden="true">
      {thin ? (
        <path
          d="M3 8 H40"
          stroke={`var(--c-${type})`}
          strokeWidth="1.6"
          opacity="0.6"
        />
      ) : (
        <>
          <path
            d="M3 4.5 H30 V1.5 L42 8 L30 14.5 V11.5 H3 L6 8 Z"
            fill={`var(--c-${type})`}
            className="band"
          />
          <path d="M8 8 H14 M19 8 H25" className="dash" />
        </>
      )}
    </svg>
  );
}

function Legend({ filter }: { filter: FlowFilter }) {
  return (
    <div className="flow-legend hud-frame">
      <div className="flow-legend-title">图　例</div>
      <ul>
        {FLOW_TYPE_ORDER.map((t) => (
          <li key={t} className={filter.types.includes(t) ? "" : "is-off"}>
            <ArrowSymbol type={t} />
            {TYPE_SHORT[t]}流
          </li>
        ))}
        {filter.scope === "national" && (
          <li className="plan-only">
            <ArrowSymbol type="people" thin />
            一般联系
          </li>
        )}
        <li className="plan-only">
          <svg
            className="flow-legend-sym"
            viewBox="0 0 44 16"
            aria-hidden="true"
          >
            <circle cx="22" cy="8" r="7" className="halo" />
            <circle cx="22" cy="8" r="4.6" className="ring" />
            <circle cx="22" cy="8" r="2.2" className="core" />
          </svg>
          核心枢纽城市
        </li>
        <li className="plan-only">
          <svg
            className="flow-legend-sym"
            viewBox="0 0 44 16"
            aria-hidden="true"
          >
            <circle cx="22" cy="8" r="4" className="ring" />
            <circle cx="22" cy="8" r="1.7" className="core" />
          </svg>
          重要节点城市
        </li>
        <li className="plan-only">
          <svg
            className="flow-legend-sym"
            viewBox="0 0 44 16"
            aria-hidden="true"
          >
            <circle cx="22" cy="8" r="2.6" className="dot" />
          </svg>
          一般节点城市
        </li>
        <li>
          <svg
            className="flow-legend-sym"
            viewBox="0 0 44 16"
            aria-hidden="true"
          >
            <circle cx="22" cy="8" r="7.2" className="target-halo" />
            <circle cx="22" cy="8" r="4.6" className="ring target" />
            <circle cx="22" cy="8" r="2.2" className="core target" />
          </svg>
          云梦县（招商目标）
        </li>
        <li>
          <svg
            className="flow-legend-sym"
            viewBox="0 0 44 16"
            aria-hidden="true"
          >
            <rect x="6" y="3" width="32" height="10" className="county" />
          </svg>
          县域边界
        </li>
      </ul>
    </div>
  );
}

interface Props {
  filter: FlowFilter;
  visible: FlowProps[];
  rankings: FlowRankings | null;
  theme: FlowTheme;
  onTheme: (theme: FlowTheme) => void;
  onReplay: () => void;
  tourStep: number | null;
  tour: TourStep | null;
  onTour: () => void;
  onStopTour: () => void;
}

export function FlowHud({
  filter,
  visible,
  rankings,
  theme,
  onTheme,
  onReplay,
  tourStep,
  tour,
  onTour,
  onStopTour,
}: Props) {
  const kpis = useKpis(filter, visible, rankings);
  return (
    <>
      <div className="flow-hud-title hud-frame">
        <div className="flow-hud-name">
          <svg className="flow-hud-logo" viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="13" />
            <circle cx="16" cy="16" r="7.5" />
            <path d="M16 16 L27 9" />
            <circle className="dot" cx="16" cy="16" r="2.4" />
          </svg>
          <strong>云梦县招商引资流空间分析（2025年）</strong>
        </div>
        <div className="flow-hud-sub">
          <div className="flow-hud-actions">
            <button
              className={tourStep !== null ? "is-on" : ""}
              onClick={tourStep !== null ? onStopTour : onTour}
              title={tourStep !== null ? "退出演示" : "自动演示"}
            >
              {tourStep !== null ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="7" y="7" width="10" height="10" rx="1.5" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 5.5v13l10.5-6.5z" />
                </svg>
              )}
              {tourStep !== null ? "退出演示" : "演示模式"}
            </button>
            <button onClick={onReplay} title="重播流线动画" aria-label="重播">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4" />
              </svg>
            </button>
            <button
              onClick={() => onTheme(theme === "night" ? "plan" : "night")}
              title={
                theme === "night" ? "切换到规划图风格" : "切换到夜色大屏风格"
              }
              aria-label="切换配色"
            >
              {theme === "night" ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />
                </svg>
              )}
            </button>
          </div>
          <b className="flow-hud-subtitle">{subtitle(filter)}</b>
        </div>
      </div>

      <NorthArrow />
      <Legend filter={filter} />

      {tour && tourStep !== null && (
        <div className="flow-caption hud-frame" key={tourStep}>
          <div className="flow-caption-head">
            <span className="flow-caption-step">
              {String(tourStep + 1).padStart(2, "0")}
              <em> / {String(TOUR.length).padStart(2, "0")}</em>
            </span>
            <span className="flow-caption-title">{tour.title}</span>
            <button onClick={onStopTour}>退出</button>
          </div>
          <p>{tour.caption}</p>
          <div className="flow-caption-progress">
            <i style={{ animationDuration: `${tour.ms}ms` }} />
          </div>
        </div>
      )}

      <div className="flow-kpis hud-frame" key={filter.scope}>
        {kpis.map((k) => (
          <KpiCell key={k.label} kpi={k} />
        ))}
      </div>
    </>
  );
}
