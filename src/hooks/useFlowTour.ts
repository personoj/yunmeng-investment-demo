import { useEffect, useState } from "react";
import type { FlowFilter } from "../map";

export interface TourStep {
  title: string;
  caption: string;
  filter: FlowFilter;
  ms: number;
}

const ALL: FlowFilter["types"] = ["people", "capital", "tech"];

/** 演示模式：从全国主干一路推进到云梦企业明细。文案里的数字都来自清洗后的流数据。 */
export const TOUR: TourStep[] = [
  {
    title: "全国主干",
    caption:
      "257 条核心流线就承载了全国 30% 的流量：人口向珠三角、长三角集聚，资本与技术以北京、上海、深圳为源头。",
    filter: { scope: "national", types: ALL, level: 1, direction: "in" },
    ms: 8000,
  },
  {
    title: "资本流",
    caption:
      "223 条资本流线占全国一半的跨城投资额。北京、上海、深圳输出资本，武汉是中部最活跃的资本节点。",
    filter: {
      scope: "national",
      types: ["capital"],
      level: 2,
      direction: "in",
    },
    ms: 8000,
  },
  {
    title: "流入孝感",
    caption:
      "武汉贡献了孝感 57% 的人口流入、27% 的资本流入、76% 的技术流入——云梦所在的孝感，紧贴武汉都市圈。",
    filter: { scope: "xiaogan", types: ALL, level: 2, direction: "in" },
    ms: 9000,
  },
  {
    title: "云梦明细",
    caption:
      "7 家外地上市公司已在云梦投资落地，合计约 6.5 亿元，其中 4 家来自长三角（张家港、上海、常州、南京）。",
    filter: { scope: "yunmeng", types: ALL, level: 3, direction: "in" },
    ms: 9000,
  },
  {
    title: "招商方向",
    caption:
      "从全国主干、都市圈到县域企业：用真实的人口、资本、技术流，定位云梦的招商方向。",
    filter: { scope: "national", types: ALL, level: 1, direction: "in" },
    ms: 7000,
  },
];

export function useFlowTour(
  apply: (filter: FlowFilter) => void,
  onStart?: () => void,
) {
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    if (step === null) return;
    apply(TOUR[step].filter);
    const id = window.setTimeout(
      () => setStep((s) => (s !== null && s + 1 < TOUR.length ? s + 1 : null)),
      TOUR[step].ms,
    );
    return () => window.clearTimeout(id);
    // apply 每次渲染都是新函数，只跟着步骤走。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  return {
    step,
    current: step === null ? null : TOUR[step],
    start: () => {
      onStart?.();
      setStep(0);
    },
    stop: () => setStep(null),
  };
}
