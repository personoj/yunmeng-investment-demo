import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MAP_ASSET_BASE } from "../config/assets";
import { CompanyLogo, EmptyState, Icon, metric, StatusTag, presentationText } from "./ui";
import {
  matchScore,
  SCORE_LABELS,
  type ChainStage,
  type CompanyRecord,
  type DemoData,
  type IndustryChain,
  type MatchCity,
  type ScoreWeights,
  type SourceLink,
} from "./types";
import "./dialogs.css";

export interface DemoDialogsProps {
  kind: "company" | "strategy" | "documents" | null;
  data: DemoData;
  company: CompanyRecord | null;
  city: MatchCity | null;
  weights: ScoreWeights;
  stageId: string;
  onClose(): void;
  onKind(kind: "company" | "strategy" | "documents"): void;
  onNotice(message: string): void;
  tourControls?: ReactNode;
}

type CompanyTab = "business" | "shareholders" | "news";
type DocumentTab = "indicators" | "pillars" | "links" | "leaders" | "policies";
const DOCUMENT_TABS: [DocumentTab, string][] = [
  ["indicators", "年度指标"],
  ["pillars", "支柱产业"],
  ["links", "强链 / 补链"],
  ["leaders", "链长制"],
  ["policies", "政策文件"],
];
const COMPANY_TABS: [CompanyTab, string][] = [
  ["business", "工商信息"],
  ["shareholders", "股东结构"],
  ["news", "公开动态"],
];
const STRATEGY_STORAGE_KEY = "yunmeng-demo:latest-strategy:v1";

function safeUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function sourceHost(url?: string) {
  const safe = safeUrl(url);
  return safe ? new URL(safe).hostname.replace(/^www\./, "") : "—";
}

function companyWebsite(company: CompanyRecord | null): SourceLink | undefined {
  return company?.sources.find((source) => {
    const url = safeUrl(source.url);
    if (!url) return false;
    const host = new URL(url).hostname.toLowerCase();
    if (
      /(^|\.)gov(?:\.[a-z]{2,})?$/.test(host) ||
      /政府|统计局|委员会|government|bureau|department/i.test(source.label)
    )
      return false;
    const isWebsite = /官网|官方网站|企业网站|official/i.test(source.label);
    const isCompany =
      source.label.includes(company.name) ||
      source.label.includes(company.fullName) ||
      /企业|公司|集团|corporate|company|official\s+(?:website|site)/i.test(
        source.label,
      ) ||
      /^official$/i.test(source.label.trim());
    return isWebsite && isCompany;
  });
}

function SourceText({ value }: { value?: string | null }) {
  const shown = presentationText(value);
  if (!shown) return <MissingValue />;
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of shown.matchAll(
    /https?:\/\/[^\s<>"'|｜，；、。）（【】]+/gi,
  )) {
    const index = match.index || 0;
    if (index > cursor) parts.push(shown.slice(cursor, index));
    const url = safeUrl(match[0]);
    parts.push(
      url ? (
        <a key={index} href={url} target="_blank" rel="noopener noreferrer">
          {match[0]} <span aria-hidden="true">↗</span>
        </a>
      ) : (
        match[0]
      ),
    );
    cursor = index + match[0].length;
  }
  if (cursor < shown.length) parts.push(shown.slice(cursor));
  return <span className="dd-source-text">{parts.length ? parts : shown}</span>;
}

function MissingValue(_props: { label?: string } = {}) {
  return <span className="dd-missing-value">—</span>;
}

function TextValue({ value }: { value?: string | null }) {
  const shown = presentationText(value);
  return shown ? <>{shown}</> : <MissingValue />;
}

function MetricValue({
  value,
  digits = 1,
  unit = "",
}: {
  value?: number | null;
  digits?: number;
  unit?: string;
}) {
  return value == null ? (
    <MissingValue />
  ) : (
    <>
      {metric(value, digits)}
      {unit}
    </>
  );
}

function SourceCards({ sources }: { sources: SourceLink[] }) {
  if (!sources.length)
    return (
      <EmptyState text="公开资料待接入"  />
    );
  return (
    <div className="dd-source-list">
      {sources.map((source, i) => {
        const url = safeUrl(source.url);
        const contents = (
          <>
            <span className="dd-source-icon">
              <Icon name={i ? "file" : "link"} />
            </span>
            <span>
              <strong>
                {presentationText(source.label) || (url ? sourceHost(url) : "来源")}
                {url && <span aria-hidden="true"> ↗</span>}
              </strong>
              {url && <small>{sourceHost(url)}</small>}
            </span>
          </>
        );
        return url ? (
          <a
            className="dd-source"
            href={url}
            key={`${source.label}-${i}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {contents}
          </a>
        ) : (
          <div className="dd-source" key={`${source.label}-${i}`}>
            {contents}
          </div>
        );
      })}
    </div>
  );
}

function ScoreBars({
  city,
  weights,
  compact = false,
}: {
  city: MatchCity | null;
  weights: ScoreWeights;
  compact?: boolean;
}) {
  return (
    <div className={`dd-scores${compact ? " dd-scores-compact" : ""}`}>
      {SCORE_LABELS.map((label, index) => (
        <div
          className="dd-score-row"
          key={label}
          title={`权重 ${weights[index]}%`}
        >
          <span>{label}</span>
          <span className="dd-score-track">
            <span
              style={{
                width: `${Math.max(0, Math.min(100, city?.scores[index] ?? 0))}%`,
              }}
            />
          </span>
          <strong>{city ? metric(city.scores[index]) : "—"}</strong>
        </div>
      ))}
    </div>
  );
}

function MiniMap({
  city,
  company,
}: {
  city: MatchCity | null;
  company: CompanyRecord;
}) {
  const arrowId = useId().replace(/:/g, "");
  const location = city?.coordinate || company.coordinate;
  if (!location)
    return (
      <div className="dd-mini-map">
        <EmptyState text="城市位置待接入" />
      </div>
    );
  const mercator = ([lon, lat]: [number, number]) => [
    (lon * 20037508.34) / 180,
    (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) * 20037508.34) / Math.PI,
  ];
  const start = mercator(location);
  const destination = mercator([113.7448, 31.0239]);
  const width = 320,
    height = 185;
  const centerX = (start[0] + destination[0]) / 2,
    centerY = (start[1] + destination[1]) / 2;
  const spanX = Math.max(
    720000,
    Math.abs(start[0] - destination[0]) * 1.65,
    (Math.abs(start[1] - destination[1]) * 1.65 * width) / height,
  );
  const spanY = (spanX * height) / width;
  const left = centerX - spanX / 2,
    top = centerY + spanY / 2;
  const x = (value: number) => ((value - left) / spanX) * width;
  const y = (value: number) => ((top - value) / spanY) * height;
  const sx = x(start[0]),
    sy = y(start[1]),
    tx = x(destination[0]),
    ty = y(destination[1]);
  const extent = [
    8140023.688314296, 383674.81389056146, 15079509.483611906,
    7128815.068805873,
  ];
  const coincident = Math.hypot(sx - tx, sy - ty) < 30;
  return (
    <figure className="dd-mini-map">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${company.cityName}至云梦县的区位`}
      >
        <defs>
          <marker
            id={arrowId}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path
              d="M1 1 9 5 1 9"
              fill="none"
              stroke="#3d83c6"
              strokeWidth="1.6"
            />
          </marker>
        </defs>
        <rect width={width} height={height} fill="#eff2e8" />
        <image
          href={`${MAP_ASSET_BASE}china-style-a-imagegen.webp`}
          x={x(extent[0])}
          y={y(extent[3])}
          width={((extent[2] - extent[0]) / spanX) * width}
          height={((extent[3] - extent[1]) / spanY) * height}
          preserveAspectRatio="none"
          opacity=".72"
        />
        {!coincident && (
          <>
            <path
              d={`M${sx},${sy} Q${(sx + tx) / 2 - 28},${(sy + ty) / 2 - 9} ${tx},${ty + 13}`}
              stroke="white"
              strokeWidth="6"
              fill="none"
            />
            <path
              d={`M${sx},${sy} Q${(sx + tx) / 2 - 28},${(sy + ty) / 2 - 9} ${tx},${ty + 13}`}
              stroke="#3d83c6"
              strokeWidth="2.5"
              fill="none"
              markerEnd={`url(#${arrowId})`}
            />
            <circle
              cx={sx}
              cy={sy}
              r="8"
              fill="#3d83c6"
              stroke="white"
              strokeWidth="3"
            />
            <text x={Math.min(sx + 13, width - 60)} y={sy + 5}>
              {company.cityName}
            </text>
          </>
        )}
        <circle
          cx={tx}
          cy={ty}
          r="11"
          fill="white"
          stroke="#c44d46"
          strokeWidth="2"
        />
        <circle cx={tx} cy={ty} r="6.5" fill="#c44d46" />
        <text x={Math.min(tx + 17, width - 65)} y={ty + 5}>
          云梦县
        </text>
      </svg>
      <figcaption>城市区位</figcaption>
    </figure>
  );
}

function RelationDiagram({
  company,
  data,
  chain,
  stage,
}: {
  company: CompanyRecord;
  data: DemoData;
  chain?: IndustryChain;
  stage?: ChainStage;
}) {
  const tiers = ["上游", "中游", "下游"];
  const companyStage =
    chain?.stages.find(
      (item) => item.id === stage?.id && company.stageIds.includes(item.id),
    ) || chain?.stages.find((item) => company.stageIds.includes(item.id));
  const localCompanies = data.companies.filter(
    (item) =>
      item.local &&
      item.id !== company.id &&
      item.chainIds.includes(chain?.id || ""),
  );
  const parallelCompany =
    companyStage &&
    localCompanies.find((item) =>
      chain?.stages.some(
        (itemStage) =>
          itemStage.stage === companyStage.stage &&
          item.stageIds.includes(itemStage.id),
      ),
    );
  const nextStage =
    companyStage &&
    chain?.stages.find(
      (item) =>
        tiers.indexOf(item.stage) === tiers.indexOf(companyStage.stage) + 1,
    );
  if (!companyStage || !parallelCompany || !nextStage)
    return (
      <div className="dd-relation-pending">
        <div className="dd-relation-position">
          <Icon name="layers" size={22} />
          <div>
            <strong>{chain?.name || "产业关联"}</strong>
            <span>
              {companyStage
                ? `${companyStage.stage} · ${companyStage.name}`
                : "—"}
            </span>
          </div>
          
        </div>
        {localCompanies.length > 0 && <p>云梦同链企业：{localCompanies.map(item => item.name).join("、")}</p>}
        {companyStage?.source && (
          <small>
            环节来源：
            <SourceText value={companyStage.source} />
          </small>
        )}
      </div>
    );
  return (
    <div
      className="dd-relation"
      aria-label="企业在产业链目录中的分类位置"
    >
      <div className="dd-relation-inputs">
        <div className="dd-relation-node dd-relation-blue">
          <strong>{company.name}</strong>
          <span>{presentationText(company.products[0] || company.sector) || "—"}</span>
        </div>
        <div className="dd-relation-node dd-relation-amber">
          <strong>{parallelCompany.name}</strong>
          <span>{presentationText(parallelCompany.products[0] || parallelCompany.sector) || "—"}</span>
        </div>
      </div>
      <svg viewBox="0 0 140 110" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 28H47Q65 28 76 55M0 83H47Q65 83 76 55H127" />
        <path d="m123 49 10 6-10 6" className="dd-relation-arrow" />
      </svg>
      <div className="dd-relation-node dd-relation-purple">
        <Icon name="layers" size={27} />
        <div>
          <strong>{nextStage.name}</strong>
          <span>{nextStage.stage} · 目录环节</span>
        </div>
      </div>
      <p>产业链目录关系</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{presentationText(value) || "—"}</strong>
    </div>
  );
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

export function DemoDialogs({
  kind,
  data,
  company,
  city,
  weights,
  stageId,
  onClose,
  onKind,
  onNotice,
  tourControls,
}: DemoDialogsProps) {
  const titleId = useId();
  const tabsId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [companyTab, setCompanyTab] = useState<CompanyTab>("business");
  const [documentTab, setDocumentTab] = useState<DocumentTab>("indicators");
  const isOpen = kind !== null;
  useEffect(() => {
    setCompanyTab("business");
  }, [company?.id]);
  useEffect(() => {
    if (!isOpen) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = requestAnimationFrame(() => dialogRef.current?.focus());
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
        ),
      ).filter((element) => element.getClientRects().length > 0);
      if (!controls.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = controls[0],
        last = controls[controls.length - 1];
      const active = document.activeElement;
      if (
        event.shiftKey &&
        (active === first ||
          active === dialogRef.current ||
          !dialogRef.current.contains(active))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last ||
          active === dialogRef.current ||
          !dialogRef.current.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKey, true);
      document.body.style.overflow = oldOverflow;
      previous?.isConnected && previous.focus();
    };
  }, [isOpen]);
  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.focus();
      dialogRef.current?.querySelector(".dd-body")?.scrollTo(0, 0);
    }
  }, [kind, isOpen]);

  if (!kind) return null;
  const scoreCity = company
    ? data.cities.find((item) => item.id === company.cityId) ||
      (city?.id === company.cityId ? city : null)
    : city;
  const score = scoreCity ? matchScore(scoreCity, weights) : null;
  const chain =
    data.chains.find((item) =>
      item.stages.some((stage) => stage.id === stageId),
    ) || data.chains.find((item) => company?.chainIds.includes(item.id));
  const stage = chain?.stages.find((item) => item.id === stageId);
  const knownProducts =
    company?.products.filter(
      (product) =>
        product.trim() && !/待补充|待接入|待核实|^缺$/.test(product.trim()),
    ) || [];
  const targetProduct =
    knownProducts.find((product) =>
      stage?.products.some(
        (category) => category.includes(product) || product.includes(category),
      ),
    ) ||
    knownProducts[0] ||
    (company?.sector && !/待补充|待接入|待核实|^缺$/.test(company.sector)
      ? company.sector
      : "产业合作");
  const stageName = stage ? `${stage.stage} · ${targetProduct}` : targetProduct;
  const stageProducts = stage?.products.join("、") || "—";
  const chainLink = data.profile.chainLinks.find(
    (item) => item.stageId === stage?.id,
  );
  const localCompanies = data.companies.filter(
    (item) =>
      item.local &&
      item.id !== company?.id &&
      item.chainIds.includes(chain?.id || ""),
  );
  const chainName = chain?.name || "目标产业链";
  const isChemical = /化工/.test(chainName);
  const isDigital = /数字|人工智能/.test(chainName);
  const isFood = /食品|农产品/.test(chainName);
  const isEquipment = /装备|汽车/.test(chainName);
  const collaborationTitle = isChemical
    ? "工艺与产品配套"
    : isDigital
      ? "技术与场景适配"
      : isFood
        ? "原料与加工协同"
        : isEquipment
          ? "制造环节协同"
          : "产业环节适配";
  const officialSource = companyWebsite(company);
  const officialUrl = safeUrl(officialSource?.url);
  const reasonItems = [
    {
      icon: "layers",
      title: collaborationTitle,
      text: `围绕${chainName}的${stageName}，评估产品适配与合作方向。`,
    },
    {
      icon: "chart",
      title: "本地产业衔接",
      text: localCompanies.length
        ? `结合已收录的${localCompanies
            .slice(0, 2)
            .map((item) => item.name)
            .join("、")}，探讨供需、技术与服务配套。`
        : `围绕${stageName}，探讨产业配套与落地条件。`,
    },
    {
      icon: "people",
      title: isDigital
        ? "应用场景合作"
        : isFood
          ? "供应链与市场合作"
          : "区域市场协同",
      text: isDigital
        ? "围绕本地产业数字化需求，探讨应用场景、数据条件与服务模式。"
        : isFood
          ? "结合原料来源、冷链能力与销售渠道，评估协同加工和市场服务。"
          : `结合${data.profile.name}区位与企业目标市场，评估服务半径和项目可行性。`,
    },
  ];
  const discussionItems = [
    {
      icon: "pin",
      title: isDigital
        ? "办公与研发空间"
        : isFood
          ? "加工与仓储空间"
          : "土地与产业空间",
      tag: "待核实",
      text: `围绕${stageName}的项目需求，沟通载体条件与落地方式。`,
    },
    {
      icon: "bolt",
      title: isChemical
        ? "能源与公辅配套"
        : isDigital
          ? "网络与算力条件"
          : isFood
            ? "冷链与物流配套"
            : "用电与生产配套",
      tag: "待核实",
      text: isChemical
        ? "沟通工艺所需能源、公用工程与安全环保条件。"
        : isDigital
          ? "结合业务需求，评估网络、算力与运行成本。"
          : isFood
            ? "围绕产品需求，沟通保鲜、仓储、运输与质量控制条件。"
            : "围绕企业生产需求，沟通园区资源与配套条件。",
    },
    {
      icon: "layers",
      title: isFood
        ? "检测与品牌服务"
        : isDigital
          ? "技术与运营服务"
          : "研发与企业服务",
      tag: "洽谈方向",
      text: isFood
        ? "探讨检测认证、品牌推广与渠道合作。"
        : `结合${chain?.shortName || chainName}特点，探讨研发、检测、人才及企业服务。`,
    },
    {
      icon: "file",
      title: "政策适用性",
      tag: "洽谈方向",
      text: `围绕${chain?.shortName || "目标产业"}项目，沟通适用政策与实施路径。`,
    },
  ];
  const contactSteps = [
    { title: "沟通项目需求", text: "与企业沟通投资意向与核心需求" },
    { title: "对接园区条件", text: "梳理可用资源，形成初步方案" },
    { title: "安排企业洽谈", text: "组织园区与企业对接，推动后续沟通" },
  ];

  const strategyRecord = () => ({
    version: 1,
    savedAt: new Date().toISOString(),
    title: `${company?.name || "企业"} · ${stageName}`,
    companyId: company?.id,
    company: company?.fullName,
    city: company?.cityName,
    stageId,
    stage: stageName,
    stageCatalogName: stage?.name || "",
    stageTier: stage?.stage || "",
    targetProduct,
    stageProducts: stage?.products || [],
    stageSource: stage?.source || "",
    chain: chain?.name,
    chainId: chain?.id,
    countyEvidence: chainLink || null,
    score,
    scores: scoreCity?.scores ?? null,
    weights,
    status: "示意方案",
    reasons: reasonItems.map((item) => ({
      title: item.title,
      text: item.text,
    })),
    discussions: discussionItems.map((item) => ({
      title: item.title,
      status: item.tag,
      text: item.text,
    })),
    contactSteps,
    sources: company?.sources || [],
    officialWebsite: officialUrl || null,
    note: "匹配评分为模型示意。产业协同尚未核验；未收录企业不表示没有相关企业；具体条件以园区核实和正式政策为准。",
  });

  function saveStrategy() {
    try {
      localStorage.setItem(
        STRATEGY_STORAGE_KEY,
        JSON.stringify(strategyRecord()),
      );
      onNotice("方案已保存");
    } catch {
      onNotice("保存失败，请导出策略卡保留方案");
    }
  }

  function exportStrategy() {
    const record = strategyRecord();
    const output = buildStrategyDocument(record);
    const blob = new Blob([output], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      `云梦招商策略-${company?.name || "企业"}-${stageName}.html`.replace(
        /[<>:"/\\|?*]/g,
        "-",
      );
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    onNotice("策略卡已导出");
  }

  const companyMissing = kind !== "documents" && !company;
  return (
    <div
      className="dd-overlay"
      onWheel={(event) => event.stopPropagation()}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`dd-dialog dd-dialog-${kind}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={dialogRef}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="dd-header">
          <span className="dd-eyebrow">
            {kind === "company"
              ? "企业详情"
              : kind === "strategy"
                ? "招商策略卡"
                : "云梦画像 · 资料中心"}
          </span>
          <button
            className="dd-close"
            aria-label="关闭弹出层"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
          {companyMissing ? (
            <h2 id={titleId}>企业详情</h2>
          ) : kind === "documents" ? (
            <>
              <h2 id={titleId}>{data.profile.name}产业资料</h2>
              <p className="dd-subtitle">
                年度指标、产业基础与政策依据{" "}
                
              </p>
            </>
          ) : kind === "company" && company ? (
            <div className="dd-company-heading">
              <CompanyLogo company={company} />
              <div>
                <h2 id={titleId}>
                  {company.name}{" "}
                  {company.stockCode && (
                    <span className="dd-stock">{company.stockCode}</span>
                  )}
                </h2>
                <p className="dd-legal-name">{company.fullName}</p>
                <div className="dd-tags">
                  <span className="d-tag">{company.cityName}</span>
                  <span className="d-tag">{presentationText(company.sector) || "—"}</span>
                  <StatusTag status={company.status} />
                </div>
              </div>
              <div className="dd-score-total">
                <strong>{score === null ? "—" : metric(score)}</strong>
                <span>匹配得分</span>
              </div>
            </div>
          ) : company ? (
            <>
              <h2 id={titleId}>
                {company.name} · {stageName} <StatusTag>示意方案</StatusTag>
              </h2>
              <div className="dd-strategy-subtitle">
                <span>
                  从{company.cityName}寻找{presentationText(company.sector) || "产业"}配套企业
                </span>
                <span className="d-tag">
                  {chain?.shortName || chain?.name || "产业链"}
                </span>
                <span className="d-tag">云梦县</span>
              </div>
            </>
          ) : null}
        </header>

        <div className="dd-body">
          {companyMissing ? (
            <EmptyState
              text="尚未选择企业"
              detail="请从匹配结果中选择一家企业查看"
            />
          ) : kind === "company" && company ? (
            <div className="dd-company-grid">
              <section className="dd-company-main">
                <h3>企业概况</h3>
                <div className="dd-facts">
                  <Fact
                    label={company.local ? "项目所在地" : "所在地"}
                    value={company.cityName}
                  />
                  <Fact label="创立" value={company.founded} />
                  <Fact label="上市" value={company.listed} />
                  <Fact label="主营" value={company.sector} />
                </div>
                <div
                  className="dd-tabs"
                  role="tablist"
                  aria-label="企业公开资料"
                >
                  {COMPANY_TABS.map(([key, label]) => (
                    <button
                      role="tab"
                      id={`${tabsId}-${key}`}
                      aria-controls={`${tabsId}-company-panel`}
                      aria-selected={companyTab === key}
                      className={companyTab === key ? "is-active" : ""}
                      key={key}
                      onClick={() => setCompanyTab(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div
                  className="dd-company-tabpanel"
                  id={`${tabsId}-company-panel`}
                  role="tabpanel"
                  aria-labelledby={`${tabsId}-${companyTab}`}
                >
                  {companyTab === "business" ? (
                    <div className="dd-public-fields">
                      <section>
                        <h4>工商字段</h4>
                        {company.registeredCapital ||
                        company.legalRepresentative ? (
                          <dl className="dd-simple-facts">
                            <dt>法定代表人</dt>
                            <dd>{presentationText(company.legalRepresentative) || "—"}</dd>
                            <dt>注册资本</dt>
                            <dd>{presentationText(company.registeredCapital) || "—"}</dd>
                          </dl>
                        ) : (
                          <EmptyState text="待接入" detail="待接入公开资料" />
                        )}
                      </section>
                      <section>
                        <h4>股东结构</h4>
                        {company.shareholders.length ? (
                          <ul className="dd-shareholders-brief">
                            {company.shareholders.slice(0, 3).map((item, i) => (
                              <li key={i}>
                                <span>{item.name}</span>
                                <strong>{presentationText(item.share) || "—"}</strong>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <EmptyState
                            text="待接入公开资料"
                            
                          />
                        )}
                      </section>
                    </div>
                  ) : companyTab === "shareholders" ? (
                    company.shareholders.length ? (
                      <div className="dd-table-scroll">
                        <table className="dd-table">
                          <thead>
                            <tr>
                              <th>股东名称</th>
                              <th>持股比例</th>
                            </tr>
                          </thead>
                          <tbody>
                            {company.shareholders.map((item, i) => (
                              <tr key={i}>
                                <td>{item.name}</td>
                                <td>{presentationText(item.share) || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <EmptyState
                        text="股东结构待接入"
                        
                      />
                    )
                  ) : (
                    <div className="dd-public-updates">
                      <p>{presentationText(company.summary) || "—"}</p>
                      <SourceCards sources={company.sources} />
                    </div>
                  )}
                </div>
                <section className="dd-synergy">
                  <h3>与云梦产业的潜在协同</h3>
                  <RelationDiagram
                    company={company}
                    data={data}
                    chain={chain}
                    stage={stage}
                  />
                </section>
              </section>
              <aside className="dd-company-side">
                <div className="dd-section-heading">
                  <h3>为什么推荐</h3>
                  <StatusTag>模型示意</StatusTag>
                </div>
                <ScoreBars city={scoreCity} weights={weights} />
                <div className="dd-target">
                  <span className="d-tag">目标环节</span>
                  <span className="d-tag dd-amber">{stageName}</span>
                </div>
                <p className="dd-target-products">
                  目录分类：{stage?.stage} · {stage?.name || "—"}
                  <br />
                  完整产品 / 业务：{stageProducts}
                </p>
                <section className="dd-sources">
                  <h3>公开资料来源</h3>
                  <SourceCards sources={company.sources} />
                </section>
              </aside>
            </div>
          ) : kind === "strategy" && company ? (
            <>
              <div className="dd-strategy-grid">
                <section className="dd-strategy-column">
                  <h3>
                    <span>01</span> 去哪里找
                  </h3>
                  <div className="dd-where">
                    <div>
                      <Icon name="pin" />
                      <Fact label="目标城市" value={company.cityName} />
                    </div>
                    <div>
                      <Icon name="building" />
                      <Fact label="目标企业" value={company.name} />
                      {company.stockCode && (
                        <span className="dd-stock">{company.stockCode}</span>
                      )}
                    </div>
                    <div>
                      <Icon name="layers" />
                      <Fact label="目标环节" value={stageName} />
                    </div>
                    <div>
                      <span className="dd-star" aria-hidden="true">
                        ★
                      </span>
                      <div>
                        <span>匹配得分</span>
                        <strong className="dd-where-score">
                          {score === null ? "—" : metric(score)}{" "}
                          
                        </strong>
                      </div>
                    </div>
                  </div>
                  <MiniMap city={scoreCity} company={company} />
                  {company.relationship === "existing" && (
                    <p className="dd-footnote">
                      {company.local ? "云梦在地企业" : "已有云梦投资记录"}
                    </p>
                  )}
                </section>
                <section className="dd-strategy-column">
                  <h3>
                    <span>02</span> 为什么值得谈
                  </h3>
                  <div className="dd-reason-list">
                    {reasonItems.map((item) => (
                      <article className="dd-topic-card" key={item.title}>
                        <Icon name={item.icon} size={28} />
                        <div>
                          <div className="dd-topic-heading">
                            <h4>{item.title}</h4>
                            <StatusTag>模型示意</StatusTag>
                          </div>
                          <p>{item.text}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="dd-section-heading dd-dimension-heading">
                    <h4>匹配维度评分</h4>
                    <StatusTag>模型示意</StatusTag>
                  </div>
                  <ScoreBars city={scoreCity} weights={weights} compact />
                </section>
                <section className="dd-strategy-column">
                  <h3>
                    <span>03</span> 可以谈什么
                  </h3>
                  <div className="dd-discussion-list">
                    {discussionItems.map((item) => (
                      <article className="dd-topic-card" key={item.title}>
                        <Icon name={item.icon} size={28} />
                        <div>
                          <div className="dd-topic-heading">
                            <h4>{item.title}</h4>
                          </div>
                          <p>{item.text}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
              <EvidenceSummary link={chainLink} stage={stage} chain={chain} />
              <section className="dd-contact">
                <h3>对接路径</h3>
                <div className="dd-contact-steps">
                  {contactSteps.map((step, i) => (
                    <div className="dd-contact-step" key={step.title}>
                      <span className="dd-step-number">{i + 1}</span>
                      <div>
                        <h4>{step.title}</h4>
                        <p>{step.text}</p>
                      </div>
                      {i < 2 && (
                        <span className="dd-step-arrow" aria-hidden="true">
                          →
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : kind === "documents" ? (
            <>
              <div
                className="dd-tabs dd-document-tabs"
                role="tablist"
                aria-label="云梦画像资料类型"
              >
                {DOCUMENT_TABS.map(([key, label]) => (
                  <button
                    role="tab"
                    id={`${tabsId}-${key}`}
                    aria-controls={`${tabsId}-document-panel`}
                    aria-selected={documentTab === key}
                    className={documentTab === key ? "is-active" : ""}
                    key={key}
                    onClick={() => setDocumentTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div
                className="dd-document-panel"
                id={`${tabsId}-document-panel`}
                role="tabpanel"
                aria-labelledby={`${tabsId}-${documentTab}`}
              >
                <ProfileDocuments data={data} tab={documentTab} />
              </div>
            </>
          ) : null}
        </div>

        <footer className="dd-footer">
          {kind === "strategy" && company ? (
            <>
              <div className="dd-contact-source">
                <span>联系渠道：</span>
                <span>企业官网入口</span>
                {officialUrl ? (
                  <a
                    href={officialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon name="link" size={17} />
                    {sourceHost(officialUrl)}
                    <span aria-hidden="true">↗</span>
                  </a>
                ) : (
                  <span className="d-tag">—</span>
                )}
              </div>
              <div className="dd-footer-actions">
                <span className="dd-complete">
                  <Icon name="check" size={17} />
                  策略已生成
                </span>
                <button className="d-btn" onClick={() => onKind("company")}>
                  返回企业详情
                </button>
                <button className="d-btn dd-save" onClick={saveStrategy}>
                  保存方案
                </button>
                <button className="d-btn d-primary" onClick={exportStrategy}>
                  导出策略卡
                </button>
              </div>
            </>
          ) : kind === "company" && company ? (
            <>
              <span className="dd-footer-hint"></span>
              <div className="dd-footer-actions">
                <button className="d-btn" onClick={onClose}>
                  返回匹配结果
                </button>
                <button
                  className="d-btn d-primary"
                  onClick={() => onKind("strategy")}
                >
                  生成招商策略 <Icon name="arrow" size={18} />
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="dd-footer-hint">
                
              </span>
              <button className="d-btn d-primary" onClick={onClose}>
                返回地图
              </button>
            </>
          )}
        </footer>
        {tourControls && (
          <div className="dd-tour-tools" aria-label="演示步骤控制">
            {tourControls}
          </div>
        )}
      </div>
    </div>
  );
}

type ChainLinkRecord = DemoData["profile"]["chainLinks"][number];

function EvidenceSummary({ link, stage, chain }: { link?: ChainLinkRecord; stage?: ChainStage; chain?: IndustryChain }) {
  const basis = presentationText(link?.basis);
  return <details className="dd-evidence-summary"><summary><Icon name="file" size={18} /><strong>产业资料与来源</strong></summary><div className="dd-evidence-body"><dl>
    <dt>产业链</dt><dd>{chain?.name || <MissingValue />}</dd>
    <dt>环节分类</dt><dd>{stage ? `${stage.stage} · ${stage.name}` : <MissingValue />}</dd>
    <dt>产品与业务</dt><dd>{stage?.products.join("、") || <MissingValue />}</dd>
    {basis && <><dt>产业基础</dt><dd>{basis}</dd></>}
    <dt>县域资料来源</dt><dd><SourceText value={link?.source} /></dd>
    <dt>产业环节来源</dt><dd><SourceText value={stage?.source} /></dd>
  </dl></div></details>;
}

function DataTable({
  heads,
  rows,
  empty,
}: {
  heads: string[];
  rows: ReactNode[][];
  empty: string;
}) {
  if (!rows.length)
    return (
      <EmptyState
        text={empty}
        
      />
    );
  return (
    <div className="dd-table-scroll">
      <table className="dd-table">
        <thead>
          <tr>
            {heads.map((heading) => (
              <th key={heading}>{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((value, j) => (
                <td key={j}>{value}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface StrategyDocumentRecord {
  title: string; company?: string; city?: string; chain?: string; stage: string;
  stageCatalogName: string; stageTier: string; stageProducts: string[]; stageSource: string;
  score: number | null; scores: [number, number, number, number] | null; weights: ScoreWeights;
  reasons: { title: string; text: string }[];
  discussions: { title: string; text: string; status: string }[];
  contactSteps: { title: string; text: string }[];
  sources: SourceLink[]; officialWebsite: string | null; savedAt: string;
  countyEvidence: ChainLinkRecord | null;
}

/** Formal presentation export. Source records and their status stay in the saved model. */
export function buildStrategyDocument(record: StrategyDocumentRecord): string {
  const clean = (value?: string | null) => escapeHtml(presentationText(value) || "—");
  const sourceMarkup = (value?: string | null): string => {
    const text = presentationText(value);
    if (!text) return "—";
    let output = "", cursor = 0;
    for (const match of text.matchAll(/https?:\/\/[^\s<>"'|｜，；、。）（【】]+/gi)) {
      const at = match.index || 0;
      output += escapeHtml(text.slice(cursor, at));
      const url = safeUrl(match[0]);
      output += url ? `<a href="${escapeHtml(url)}">${escapeHtml(match[0])}</a>` : escapeHtml(match[0]);
      cursor = at + match[0].length;
    }
    return output + escapeHtml(text.slice(cursor));
  };
  const official = safeUrl(record.officialWebsite);
  const sources = record.sources.map(source => {
    const url = safeUrl(source.url);
    const label = presentationText(source.label) || (url ? sourceHost(url) : "");
    if (!label && !url) return "";
    return `<li>${escapeHtml(label)}${url ? `：<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>` : ""}</li>`;
  }).join("");
  const fact = (label: string, value: string) => `<div class="item"><small>${label}</small><h3>${value}</h3></div>`;
  const basis = presentationText(record.countyEvidence?.basis);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${clean(record.title)} · 招商策略卡</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f0f3ed;color:#24342d;font:16px/1.65 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1180px;margin:32px auto;background:#fff;padding:36px;border:1px solid #dce3db;border-radius:12px}h1{font-size:32px;margin:8px 0}h2{font-size:21px}h3{font-size:17px;margin:0 0 6px}p{margin:5px 0}small{color:#778278}.columns{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin:24px 0}.column{padding:18px;border:1px solid #dce3db;border-radius:8px}.item{border-top:1px solid #edf0ea;padding:13px 0}strong{color:#285846}.score{font-size:32px}.steps{display:flex;gap:20px;background:#f4f7f2;border-radius:8px;padding:18px}.steps p{flex:1}a{color:#285846;overflow-wrap:anywhere}footer{margin-top:24px;border-top:1px solid #dce3db;padding-top:16px}.print{display:block;margin:18px auto;padding:12px 25px;border:0;background:#285846;color:#fff;border-radius:6px;cursor:pointer}@media(max-width:800px){main{margin:10px;padding:20px}.columns{grid-template-columns:1fr}.steps{display:block}}@media print{@page{size:A4 landscape;margin:12mm}body{background:#fff;font-size:11px}main{margin:0;padding:0;border:0}h1{font-size:24px}h2{font-size:16px}h3{font-size:13px}.columns{gap:12px}.column{padding:12px}.print{display:none}a{color:inherit;text-decoration:none}}
  </style></head><body><main><small>云梦招商策略 · 招商策略卡</small><h1>${clean(record.title)}</h1><p>${clean(record.chain)} · 云梦县</p>
  <div class="columns"><section class="column"><h2>01 去哪里找</h2>${fact("目标城市", clean(record.city))}${fact("目标企业", clean(record.company))}${fact("目标环节", clean(record.stage))}<div class="item"><small>匹配得分</small><p class="score"><strong>${record.score === null ? "—" : metric(record.score)}</strong></p></div>${official ? fact("企业官网", `<a href="${escapeHtml(official)}">${escapeHtml(official)}</a>`) : ""}</section>
  <section class="column"><h2>02 为什么值得谈</h2>${record.reasons.map(item => `<div class="item"><h3>${clean(item.title)}</h3><p>${clean(item.text)}</p></div>`).join("")}<div class="item"><h3>匹配维度评分</h3>${SCORE_LABELS.map((label, i) => `<p>${label}：<strong>${record.scores ? metric(record.scores[i]) : "—"}</strong> <small>权重 ${record.weights[i]}%</small></p>`).join("")}</div></section>
  <section class="column"><h2>03 可以谈什么</h2>${record.discussions.map(item => `<div class="item"><h3>${clean(item.title)}</h3><p>${clean(item.text)}</p></div>`).join("")}</section></div>
  <section class="column"><h2>产业资料</h2><p><strong>产业链：</strong>${clean(record.chain)}</p><p><strong>环节分类：</strong>${clean(record.stageTier)} · ${clean(record.stageCatalogName)}</p><p><strong>产品与业务：</strong>${clean(record.stageProducts.join("、"))}</p>${basis ? `<p><strong>产业基础：</strong>${escapeHtml(basis)}</p>` : ""}<p><strong>县域资料来源：</strong>${sourceMarkup(record.countyEvidence?.source)}</p><p><strong>产业环节来源：</strong>${sourceMarkup(record.stageSource)}</p></section>
  <h2>对接路径</h2><div class="steps">${record.contactSteps.map((item, i) => `<p><strong>${i + 1}. ${clean(item.title)}</strong><br>${clean(item.text)}</p>`).join("")}</div>
  <footer>${sources ? `<h3>资料来源</h3><ul>${sources}</ul>` : ""}<small>${escapeHtml(record.savedAt)}</small></footer></main><button class="print" onclick="window.print()">打印策略卡</button></body></html>`;
}


export function ProfileDocuments({ data, tab }: { data: DemoData; tab: DocumentTab }) {
  return <>{tab === "indicators" ? (
                  <>
                    <p className="dd-table-note">GDP 单位：亿元 · 增速与三产占比单位：%</p>
                    <DataTable
                      heads={[
                        "年份",
                        "GDP",
                        "增速",
                        "一产",
                        "二产",
                        "三产",
                        "规上工业企业",
                        "来源",
                      ]}
                      empty="年度指标待接入"
                      rows={data.profile.indicators.map((item) => [
                        <span className="dd-year" key="year">
                          {item.year}
                          <StatusTag status={item.status} />
                        </span>,
                        <MetricValue key="gdp" value={item.gdp} digits={2} />,
                        <MetricValue key="growth" value={item.growth} />,
                        ...item.shares.map((value, index) => (
                          <MetricValue key={`share-${index}`} value={value} />
                        )),
                        <MetricValue
                          key="industrial"
                          value={item.industrialEnterprises}
                          digits={0}
                          unit=" 家"
                        />,
                        <SourceText key="source" value={item.source} />,
                      ])}
                    />
                  </>
                ) : tab === "pillars" ? (
                  <DataTable
                    heads={[
                      "支柱产业",
                      "对应产业链",
                      "产值规模",
                      "龙头企业",
                      "所在园区",
                      "来源",
                    ]}
                    empty="支柱产业待接入"
                    rows={data.profile.pillars.map((item) => [
                      item.name,
                      [...new Set(item.chainIds || [item.chainId])]
                        .map(
                          (id) =>
                            data.chains.find((value) => value.id === id)?.name,
                        )
                        .filter(Boolean)
                        .join("、") || <MissingValue key="chain" />,
                      <TextValue key="output" value={item.output} />,
                      item.companyIds
                        .map(
                          (id) =>
                            data.companies.find((value) => value.id === id)
                              ?.name,
                        )
                        .filter(Boolean)
                        .join("、") || (
                        <MissingValue key="company" label="企业名称待补充" />
                      ),
                      <TextValue key="park" value={item.park} />,
                      <SourceText key="source" value={item.source} />,
                    ])}
                  />
                ) : tab === "links" ? (
                  <DataTable heads={["产业链", "环节", "产品 / 业务", "相关企业", "产业基础", "资料来源", "环节来源"]} empty="—" rows={data.profile.chainLinks.map(item => {
                    const itemChain = data.chains.find(value => value.stages.some(stageItem => stageItem.id === item.stageId));
                    const itemStage = itemChain?.stages.find(value => value.id === item.stageId);
                    return [itemChain?.name || "—", itemStage?.stage || "—", itemStage?.products.join("、") || itemStage?.name || "—", item.companyIds.map(id => data.companies.find(value => value.id === id)?.name).filter(Boolean).join("、") || "—", <TextValue key="basis" value={item.basis} />, <SourceText key="source" value={item.source} />, <SourceText key="stage-source" value={itemStage?.source} />];
                  })} />
                ) : tab === "leaders" ? (
                  <DataTable
                    heads={["产业链", "链长姓名", "职务", "链主企业", "来源"]}
                    empty="链长制资料待接入"
                    rows={data.profile.leaders.map((item) => [
                      data.chains.find((value) => value.id === item.chainId)
                        ?.name || item.chainId,
                      <TextValue key="name" value={item.name} />,
                      <TextValue key="title" value={item.title} />,
                      <TextValue key="company" value={item.company} />,
                      <SourceText key="source" value={item.source} />,
                    ])}
                  />
                ) : (
                  <DataTable
                    heads={["文件名称", "发布单位", "发布日期", "链接", "来源"]}
                    empty="政策文件待接入"
                    rows={data.profile.policies.map((item) => [
                      item.name,
                      <TextValue key="publisher" value={item.publisher} />,
                      <TextValue key="date" value={item.date} />,
                      safeUrl(item.url) ? (
                        <a
                          key="link"
                          href={safeUrl(item.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          查看文件 ↗
                        </a>
                      ) : (
                        <MissingValue key="link" label="链接待补充" />
                      ),
                      <SourceText key="source" value={item.source} />,
                    ])}
                  />
                )}</>;
}
