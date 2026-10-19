import { useState, type ReactNode } from "react";
import type { CompanyRecord, DataStatus } from "./types";

export function Icon({
  name = "grid",
  size = 22,
}: {
  name?: string;
  size?: number;
}) {
  const paths: Record<string, ReactNode> = {
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    down: <path d="m6 9 6 6 6-6" />,
    building: (
      <>
        <path d="M3 21h18M5 21V9h5V4h9v17M14 8h1m-1 4h1m-1 4h1M7 12v1m0 3v1" />
      </>
    ),
    file: (
      <>
        <path d="M5 3h9l5 5v13H5V3Zm9 0v5h5M8 12h8M8 16h6" />
      </>
    ),
    layers: (
      <>
        <path d="m3 8 9-5 9 5-9 5-9-5Zm0 4 9 5 9-5M3 16l9 5 9-5" />
      </>
    ),
    battery: (
      <>
        <path d="M9 3h6M7 5h10v16H7zM10 10h4m-2-2v4" />
      </>
    ),
    flask: (
      <>
        <path d="M9 3h6m-5 0v7L4 20q0 1 2 1h12q2 0 2-1l-6-10V3M7 16h10" />
      </>
    ),
    chip: (
      <>
        <rect x="6" y="6" width="12" height="12" rx="2" />
        <path d="M9 1v5m6-5v5M9 18v5m6-5v5M1 9h5m-5 6h5m12-6h5m-5 6h5M10 10h4v4h-4z" />
      </>
    ),
    leaf: (
      <>
        <path d="M20 3C4 2 2 12 7 17c5 5 14 0 13-14ZM4 21l11-12" />
      </>
    ),
    chart: (
      <>
        <path d="M4 21h17M6 18v-5h3v5m3 0V8h3v10m3 0V3h3v15" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <ellipse cx="12" cy="12" rx="4" ry="9" />
        <path d="M3 12h18" />
      </>
    ),
    replay: <path d="M4 9a8 8 0 1 1 0 7M4 3v6h6" />,
    close: <path d="m5 5 14 14M5 19 19 5" />,
    check: <path d="m5 12 4 4L19 6" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 10v7m0-11v1" />
      </>
    ),
    play: <path d="m8 4 12 8-12 8V4Z" />,
    link: (
      <>
        <path d="m9 15 6-6m-5-3 2-2a5 5 0 0 1 7 7l-2 2m-3 5-2 2a5 5 0 0 1-7-7l2-2" />
      </>
    ),
    people: (
      <>
        <circle cx="9" cy="7" r="3" />
        <path d="M3 21v-4a6 6 0 0 1 12 0v4H3Zm13-17a4 4 0 0 1 0 8m2 2a5 5 0 0 1 3 5v2" />
      </>
    ),
    bolt: <path d="m14 2-9 12h7l-2 8 10-13h-7l1-7Z" />,
    grid: (
      <>
        <rect x="4" y="4" width="6" height="6" rx="1" />
        <rect x="14" y="4" width="6" height="6" rx="1" />
        <rect x="4" y="14" width="6" height="6" rx="1" />
        <rect x="14" y="14" width="6" height="6" rx="1" />
      </>
    ),
  };
  return (
    <svg
      className="d-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.grid}
    </svg>
  );
}
export function CompanyLogo({ company }: { company: CompanyRecord }) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span className="d-company-logo">
      {company.logo && failed !== company.logo ? (
        <img
          src={company.logo}
          alt={`${company.name}标识`}
          onError={() => setFailed(company.logo)}
        />
      ) : (
        <span aria-label={`${company.name}标识`}>
          {company.name.slice(0, 1)}
        </span>
      )}
    </span>
  );
}
export function StatusTag({
  status = "sample",
  children,
}: {
  status?: DataStatus;
  children?: ReactNode;
}) {
  if (!children) return null;
  const content = typeof children === "string" ? presentationText(children) : children;
  if (!content) return null;
  return (
    <span className={`d-tag d-tag-${status}`}>
      {content}
    </span>
  );
}
export function EmptyState({
  text = "资料待接入",
  detail,
}: {
  text?: string;
  detail?: string;
}) {
  const heading = presentationText(text) || "—";
  const description = presentationText(detail);
  return (
    <div className="d-empty">
      <Icon name="file" size={30} />
      <strong>{heading}</strong>
      {description && <span>{description}</span>}
    </div>
  );
}

/** Presentation only: complete evidence and collection status remain in the dataset. */
export function presentationText(value?: string | null): string {
  if (!value?.trim()) return "";
  const hidden = /模型示意|评分示意|示意|示例|核实|核验|待接入|待补(?:充)?|尚待|尚未|暂未|未收录|未检索|未找到|未公开|不含纲要|仅为批准|资料尚不|资料不完整|资料尚待|资料正在整理|证据不足|不代表|不等于|非已发生|原表报告|显示名称为|来源链接待|后续.*(?:接入|替换|展示)|文件名称或公开链接|^缺(?:[（(].*)?$/;
  return value.split(/(?<=[。！？；;])|[\n｜|]/).map(part => part.trim()).filter(part => part && !hidden.test(part)).join(" ").trim();
}
export function metric(value: number | null | undefined, digits = 1) {
  return value == null
    ? "—"
    : value.toLocaleString("zh-CN", { maximumFractionDigits: digits });
}
