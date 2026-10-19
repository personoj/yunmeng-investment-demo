import { useState } from "react";
import type { ChainStage } from "./types";
import { Icon } from "./ui";

export interface StageVisualProps {
  chainId: string;
  stage: ChainStage["stage"];
  className?: string;
}

/** A consistent image frame shared by the national and county chain cards. */
export function StageVisual({ chainId, stage, className = "" }: StageVisualProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const file = { 上游: "wafer", 中游: "chip", 下游: "devices" }[stage];
  const src = chainId === "electronics" ? `${import.meta.env.BASE_URL}assets/demo/industry/${file}.png` : null;
  const icon = chainId === "electronics" ? stage === "下游" ? "grid" : "chip"
    : chainId === "new-energy" ? stage === "下游" ? "battery" : "layers"
    : chainId === "chemicals" ? "flask"
    : chainId === "food" ? "leaf"
    : chainId === "digital" || chainId === "future" ? "chip"
    : stage === "上游" ? "layers" : "grid";
  return <span className={`stage-visual stage-visual-${file} ${className}`} aria-hidden="true">
    {src && failed !== src ? <img src={src} alt="" loading="eager" decoding="async" onError={() => setFailed(src)} /> : <span className="stage-visual-fallback"><Icon name={icon} size={52} /></span>}
  </span>;
}
