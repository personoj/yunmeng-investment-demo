import { useEffect, useRef, useState } from "react";
import { FlowLayer } from "../map";
import type {
  GeographicPlanningMap,
  FlowFilter,
  FlowHover,
  FlowProps,
  FlowTheme,
  FlowType,
} from "../map";
import { FLOW_ASSET_BASE } from "../config/assets";
import { SCENE_MOTION, useReducedMotion } from "../demo/useSceneTransition";

export interface FlowRankingBlock {
  type_cn: string;
  unit: string;
  national_top10: {
    rank: number;
    code: string;
    name: string;
    inflow: number;
  }[];
  xiaogan_national_rank: number | null;
  cities_ranked: number;
  sources_to_xiaogan_top10: {
    rank: number;
    code: string;
    name: string;
    value: number;
  }[];
}
export type FlowRankings = Record<FlowType, FlowRankingBlock>;

const INITIAL_FILTER: FlowFilter = {
  scope: "national",
  types: ["people", "capital", "tech"],
  level: 1,
  direction: "in",
};

const initialTheme = (): FlowTheme =>
  new URLSearchParams(location.search).get("theme") === "night"
    ? "night"
    : "plan";

interface ScopeCameraRequest {
  enabled: boolean;
  scope: FlowFilter["scope"];
  pending: boolean;
}

/** Only a scope change made within this enabled session may request a camera
 * fit. Entering/re-entering belongs to the application's scene flight.
 */
export function consumeScopeCameraRequest(
  state: ScopeCameraRequest,
  enabled: boolean,
  ready: boolean,
  scope: FlowFilter["scope"],
) {
  const entering = enabled && !state.enabled;
  state.enabled = enabled;
  if (!enabled || entering) {
    state.scope = scope;
    state.pending = false;
    return false;
  }
  if (state.scope !== scope) {
    state.scope = scope;
    state.pending = true;
  }
  if (!ready || !state.pending) return false;
  state.pending = false;
  return true;
}

/** 在底图就绪后挂上流空间图层；React 只管面板状态，不逐帧驱动地图。 */
export function useFlowLayer(map: GeographicPlanningMap | null) {
  const layer = useRef<FlowLayer | null>(null);
  const scopeCamera = useRef<ScopeCameraRequest>({
    enabled: false,
    scope: INITIAL_FILTER.scope,
    pending: false,
  });
  const [filter, setFilterState] = useState<FlowFilter>(INITIAL_FILTER);
  const [visible, setVisible] = useState<FlowProps[]>([]);
  const [hover, setHover] = useState<FlowHover | null>(null);
  const [rankings, setRankings] = useState<FlowRankings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const reduced = useReducedMotion();
  const [theme, setTheme] = useState<FlowTheme>(initialTheme);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!map) return;
    const controller = new AbortController();
    map.target.style.setProperty("--flow-scene-opacity", "0");
    const flows = new FlowLayer(map.map);
    // The accepted canvas renderer stays unchanged; visibility is wrapped here.
    flows.setEnabled(false);
    flows.onHover = (value) => {
      if (enabledRef.current) setHover(value);
    };
    flows.onChange = setVisible;
    layer.current = flows;
    Promise.all([
      flows.load(FLOW_ASSET_BASE, controller.signal),
      fetch(`${FLOW_ASSET_BASE}flow-rankings.json`, {
        signal: controller.signal,
      }).then((r) => r.json() as Promise<FlowRankings>),
    ])
      .then(([, ranking]) => {
        setRankings(ranking);
        setReady(true);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "流数据加载失败");
      });
    return () => {
      controller.abort();
      flows.destroy();
      layer.current = null;
      setReady(false);
      setHover(null);
      document.body.dataset.flowTheme = "off";
      map.target.style.removeProperty("--flow-scene-opacity");
    };
  }, [map]);

  useEffect(() => {
    if (ready) layer.current?.setFilter(filter);
  }, [filter, ready]);

  // Loading can finish after the user leaves this scene. Discard that pending
  // fit on disable, and let the unified scene flight own every fresh entrance.
  useEffect(() => {
    if (
      !consumeScopeCameraRequest(
        scopeCamera.current,
        enabled,
        ready,
        filter.scope,
      )
    )
      return;
    map?.map.getView().cancelAnimations();
    if (filter.scope === "national") map?.fitNational();
    else layer.current?.fitVisible();
  }, [filter.scope, enabled, ready, map]);

  useEffect(() => {
    const flow = layer.current;
    if (!flow || !map || !ready) return;
    let frame: number | undefined;
    let finish: ReturnType<typeof setTimeout> | undefined;
    flow.setTheme(theme);
    if (enabled) {
      flow.setEnabled(true);
      document.body.dataset.flowTheme = theme;
      map.target.dataset.flowTheme = theme;
      if (reduced) map.target.style.setProperty("--flow-scene-opacity", "1");
      else {
        // Attach the transparent layer before changing its opacity. This also
        // makes its first entrance animate, rather than appearing at opacity 1.
        map.map.renderSync();
        map.target.querySelector(".flow-canvas")?.getBoundingClientRect();
        frame = requestAnimationFrame(() => {
          map.target.style.setProperty("--flow-scene-opacity", "1");
          flow.replay();
        });
      }
    } else {
      setHover(null);
      map.target.style.setProperty("--flow-scene-opacity", "0");
      document.body.dataset.flowTheme = "off";
      map.target.dataset.flowTheme = "off";
      if (reduced) flow.setEnabled(false);
      else finish = setTimeout(() => flow.setEnabled(false), SCENE_MOTION.flow);
    }
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      clearTimeout(finish);
    };
  }, [theme, enabled, ready, map, reduced]);

  return {
    ready,
    error,
    filter,
    setFilter: (next: Partial<FlowFilter>) =>
      setFilterState((prev) => ({ ...prev, ...next })),
    visible,
    hover,
    rankings,
    enabled,
    setEnabled,
    theme,
    setTheme,
    replay: () => layer.current?.replay(),
  };
}
