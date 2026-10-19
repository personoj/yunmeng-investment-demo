import { useCallback, useEffect, useRef, useState } from "react";
import { transformExtent } from "ol/proj.js";
import { usePlanningMap } from "../hooks/usePlanningMap";
import { MapCanvas } from "../components/MapCanvas";
import { FlowTooltip } from "../components/FlowPanel";
import { useFlowLayer } from "../hooks/useFlowLayer";
import { loadDemoData, validateDemoData } from "../demo/data";
import { NationalPanels } from "../demo/NationalPanels";
import { CountyPanels } from "../demo/CountyPanels";
import { MatchingPanels } from "../demo/MatchingPanels";
import { DemoDialogs } from "../demo/DemoDialogs";
import { useDemoMapLayers } from "../demo/useDemoMapLayers";
import { withHubeiDirectory } from "../demo/regionPortraits";
import {
  flyToSceneExtent,
  useSceneTransition,
} from "../demo/useSceneTransition";
import { Icon } from "../demo/ui";
import { demoRoute } from "../demo/selectors";
import type {
  DemoData,
  NationalMode,
  Scene,
  ScoreWeights,
} from "../demo/types";

const SCENES: { id: Scene; name: string }[] = [
  { id: "national", name: "全国产业全景" },
  { id: "profile", name: "云梦产业画像" },
  { id: "flows", name: "流空间匹配" },
];
const DATA_KEY = "yunmeng-demo-data-v1";
const PROFILE_CAMERA = { desktopInset: 300, narrowInset: 360, gap: 20 };
const profileBottomInset = () => {
  const minimum =
    window.innerWidth < 1100
      ? PROFILE_CAMERA.narrowInset
      : PROFILE_CAMERA.desktopInset;
  const dock = document.querySelector<HTMLElement>(".cp-chain-map");
  if (dock) {
    const bottom = Number.parseFloat(getComputedStyle(dock).bottom) || 0;
    return Math.max(
      minimum,
      Math.ceil(
        dock.getBoundingClientRect().height + bottom + PROFILE_CAMERA.gap,
      ),
    );
  }
  return minimum;
};
const initialScene = (): Scene => {
  const query = new URLSearchParams(location.search).get("scene");
  return query === "profile" || query === "flows" || query === "national"
    ? query
    : location.hash === "#yunmeng"
      ? "profile"
      : "national";
};

/** Hash restoration must not override a destination chosen during startup. */
export function firstSceneLocation(
  scene: Scene,
  hash: string,
  navigationRequested: boolean,
) {
  if (!navigationRequested && hash && hash !== "national") return hash;
  return scene === "profile" ? "yunmeng" : "national";
}

/** All remote data loads share one generation. A local JSON import invalidates
 * the current generation, even when a transport resolves after being aborted.
 */
export function createDataRequestGuard() {
  let sequence = 0;
  let controller: AbortController | null = null;
  return {
    begin() {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      const token = ++sequence;
      return {
        signal: current.signal,
        isCurrent: () => token === sequence && !current.signal.aborted,
      };
    },
    invalidate() {
      sequence++;
      controller?.abort();
      controller = null;
    },
  };
}

export function App() {
  const container = useRef<HTMLElement>(null);
  const {
    map,
    loading,
    error,
    locationName,
    navigation,
    cityDetail,
    countyDetail,
    layers,
  } = usePlanningMap(container);
  const flows = useFlowLayer(map);
  const [data, setData] = useState<DemoData | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [scene, setScene] = useState<Scene>(initialScene);
  const { renderedScene, phase, reduced } = useSceneTransition(scene);
  const [mode, setMode] = useState<NationalMode>("region");
  const [regionId, setRegionId] = useState("hubei");
  const [chainId, setChainId] = useState("new-energy");
  const [stageId, setStageId] = useState("");
  const [cityId, setCityId] = useState("shenzhen");
  const [companyId, setCompanyId] = useState("capchem");
  const [weights, setWeights] = useState<ScoreWeights>([40, 20, 20, 20]);
  const [threshold, setThreshold] = useState(80);
  const [dialog, setDialog] = useState<
    "company" | "strategy" | "documents" | null
  >(null);
  const [dataOpen, setDataOpen] = useState(false);
  const [layerOpen, setLayerOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [mobilePanel, setMobilePanel] = useState<"left" | "right" | "none">(
    "none",
  );
  const previousScene = useRef<Scene | null>(null);
  const initialLocation = useRef(location.hash.slice(1) || "national");
  const navigationRequested = useRef(false);
  const dataRequests = useRef(createDataRequestGuard()).current;
  const pendingResize = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelFlight = useRef<() => void>(() => {});
  const flightRequest = useRef(0);
  const lastProfileInset = useRef(0);
  const notify = useCallback((message: string) => setToast(message), []);

  useEffect(() => {
    const request = dataRequests.begin();
    const cached = localStorage.getItem(DATA_KEY);
    if (cached) {
      try {
        setData(withHubeiDirectory(validateDemoData(JSON.parse(cached))));
        setDataError(null);
        return () => dataRequests.invalidate();
      } catch {
        notify("本地数据格式已失效，正在载入项目数据");
      }
    }
    loadDemoData(request.signal)
      .then((value) => {
        if (!request.isCurrent()) return;
        setData(withHubeiDirectory(value));
        setDataError(null);
      })
      .catch((cause: unknown) => {
        if (request.isCurrent())
          setDataError(cause instanceof Error ? cause.message : "资料加载失败");
      });
    return () => dataRequests.invalidate();
  }, [notify, dataRequests]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 4200);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    document.body.classList.add("demo-app");
    return () => document.body.classList.remove("demo-app");
  }, []);
  useEffect(() => {
    if (!data) return;
    const route = demoRoute(data);
    if (
      !data.chains.some(
        (chain) =>
          chain.id === chainId &&
          chain.stages.some((stage) => stage.id === stageId),
      )
    ) {
      setChainId(route.chainId);
      setStageId(route.stageId);
    }
    if (!data.regions.some((region) => region.id === regionId))
      setRegionId(
        data.regions.find((region) => region.id === "hubei")?.id ||
          data.regions[0].id,
      );
    if (!data.companies.some((company) => company.id === companyId))
      setCompanyId(route.companyId);
    if (!data.cities.some((city) => city.id === cityId))
      setCityId(route.cityId);
  }, [data]);
  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set("scene", scene);
    history.replaceState(null, "", url.pathname + url.search + url.hash);
    flows.setEnabled(scene === "flows");
    setLayerOpen(false);
  }, [scene, flows.setEnabled]);
  useEffect(() => {
    map?.setAdministrativeNavigation(scene === "national" && mode === "region");
    return () => map?.setAdministrativeNavigation(true);
  }, [map, scene, mode]);
  useEffect(() => {
    if (map) void map.preloadLocation("yunmeng").catch(() => {});
  }, [map]);

  const fitScreen = useCallback(
    (id: string, targetScene: Scene, animate = true, targetMode = mode) => {
      if (!map) return false;
      // Select/loading and camera movement are deliberately separate operations.
      // No intermediate fit is allowed: each request starts at the current pose.
      const token = ++flightRequest.current;
      cancelFlight.current();
      void map.preloadLocation(id).catch(() => {});
      if (!map.selectLocation(id)) return false;
      const width = window.innerWidth;
      const panel =
        width <= 1440 ? 300 : Math.min(390, Math.max(310, width * 0.218));
      const narrow = width < 1100;
      const profileInset = targetScene === "profile" ? profileBottomInset() : 0;
      if (targetScene === "profile") lastProfileInset.current = profileInset;
      const padding = [
        100,
        narrow ? 32 : panel + 48,
        targetScene === "profile"
          ? profileInset
          : targetScene === "national" && targetMode === "industry"
            ? 150
            : 100,
        narrow ? 32 : panel + 48,
      ];
      map.setDetailViewportPadding(padding);
      const extent =
        id === "national"
          ? transformExtent(
              targetScene === "flows"
                ? [94, 19, 135.2, 51]
                : [73, 16.8, 135.2, 54],
              "EPSG:4326",
              "EPSG:3857",
            )
          : id === "yunmeng"
            ? [
                12648971.022515744, 3601125.928274871, 12677357.181641405,
                3660021.002026684,
              ]
            : id === "xiaogan"
              ? [
                  12613681.558878984, 3553067.855970516, 12755682.154201783,
                  3744425.949616036,
                ]
              : map.getRegions().find((region) => region.id === id)
                  ?.focusExtent ||
                map.getRegions().find((region) => region.id === id)?.extent;
      if (extent) {
        map.target.dataset.sceneCameraTarget = id;
        map.target.dataset.sceneCameraPhase =
          animate && !reduced ? "moving" : "idle";
        cancelFlight.current = flyToSceneExtent(
          map,
          extent,
          padding,
          animate && !reduced,
          (complete) => {
            if (flightRequest.current === token)
              map.target.dataset.sceneCameraPhase = complete
                ? "idle"
                : "interrupted";
          },
        );
      }
      return true;
    },
    [map, mode, reduced],
  );
  useEffect(() => {
    if (!map || previousScene.current === scene) return;
    const first = previousScene.current === null;
    previousScene.current = scene;
    fitScreen(
      first
        ? firstSceneLocation(
            scene,
            initialLocation.current,
            navigationRequested.current,
          )
        : scene === "profile"
          ? "yunmeng"
          : "national",
      scene,
      !first,
    );
  }, [map, scene, fitScreen]);
  useEffect(
    () => () => {
      flightRequest.current++;
      cancelFlight.current();
    },
    [map],
  );
  useEffect(() => {
    const resize = () => {
      if (pendingResize.current) clearTimeout(pendingResize.current);
      pendingResize.current = setTimeout(() => {
        map?.map.updateSize();
        fitScreen(
          scene === "profile" ? "yunmeng" : navigation.id,
          scene,
          Boolean(map?.map.getView().getAnimating()),
        );
      }, 180);
    };
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      if (pendingResize.current) clearTimeout(pendingResize.current);
    };
  }, [map, scene, navigation.id, fitScreen]);
  useEffect(() => {
    if (!map || scene !== "profile" || renderedScene !== "profile" || !data)
      return;
    const dock = document.querySelector<HTMLElement>(".cp-chain-map");
    if (!dock) return;
    let frame: number | undefined;
    const update = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (
          !map.map.getView().getAnimating() &&
          profileBottomInset() > lastProfileInset.current + 1
        )
          fitScreen("yunmeng", "profile", true);
      });
    };
    // The fixed inset covers the current dock before it mounts. Only expand it
    // for larger content after the flight finishes, preserving its velocity.
    const observer = new ResizeObserver(update);
    observer.observe(dock);
    map.map.on("moveend", update);
    update();
    return () => {
      observer.disconnect();
      map.map.un("moveend", update);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [map, scene, renderedScene, data, fitScreen]);
  useEffect(() => {
    if (
      scene !== "national" ||
      !data?.regions.some((region) => region.id === navigation.id)
    )
      return;
    setRegionId((selectedId) => {
      const selected = data.regions.find((region) => region.id === selectedId);
      return selected?.level === "市" &&
        (selected.mapId === navigation.id ||
          selected.parentId === navigation.id)
        ? selectedId
        : navigation.id;
    });
  }, [navigation.id, scene, data]);

  const goScene = (next: Scene) => {
    navigationRequested.current = true;
    setDialog(null);
    setMobilePanel("none");
    setScene(next);
    if (next === scene)
      fitScreen(next === "profile" ? "yunmeng" : "national", next);
  };
  const chooseChain = (id: string) => {
    setChainId(id);
    const chain = data?.chains.find((c) => c.id === id);
    const pending = chain?.stages.find((stage) =>
      data?.profile.chainLinks.some(
        (link) => link.stageId === stage.id && link.reportedStatus === "补链",
      ),
    );
    setStageId(
      pending?.id ||
        chain?.stages.find((stage) => stage.stage === "中游")?.id ||
        chain?.stages[0]?.id ||
        "",
    );
  };
  const openCompany = (id: string) => {
    setCompanyId(id);
    setDialog("company");
  };
  const onRegion = (id: string) => {
    setRegionId(id);
    const region = data?.regions.find((r) => r.id === id);
    if (!fitScreen(region?.mapId || id, "national"))
      notify((region?.name || "该地区") + "专题建设中，已显示可用资料");
  };
  useDemoMapLayers(
    map,
    data,
    scene,
    mode,
    chainId,
    stageId,
    true,
    (id) => {
      setCityId(id);
      if (scene === "national") {
        const company = data?.companies.find(
          (c) =>
            c.cityId === id &&
            c.chainIds.includes(chainId) &&
            c.stageIds.includes(stageId),
        );
        if (company) openCompany(company.id);
        else {
          setMode("region");
          setRegionId(id);
          const region = data?.regions.find((item) => item.id === id);
          fitScreen(region?.mapId || id, "national", true, "region");
        }
      }
    },
    openCompany,
    regionId,
  );

  const detail = countyDetail?.id ? countyDetail : cityDetail;
  const status =
    error ||
    detail?.error ||
    dataError ||
    (loading ? "正在载入地图…" : !data ? "正在载入招商资料…" : "");
  const company = data?.companies.find((c) => c.id === companyId) || null;
  const city =
    data?.cities.find((c) => c.id === (company?.cityId || cityId)) || null;

  return (
    <div
      className={"demo-shell scene-" + renderedScene}
      data-mobile-panel={mobilePanel}
      data-national-mode={mode}
      data-scene-phase={phase}
      data-scene-target={scene}
    >
      <MapCanvas containerRef={container} locationName={locationName} />
      <header className="demo-header">
        <button
          className="demo-brand"
          onClick={() => goScene("national")}
          aria-label="云梦招商策略首页"
        >
          <img
            src={
              import.meta.env.BASE_URL +
              "assets/demo/brand/yunmeng-platform.png"
            }
            alt=""
          />
          <strong>云梦招商策略</strong>
        </button>
        <nav aria-label="主场景">
          {SCENES.map((item) => (
            <button
              key={item.id}
              aria-current={scene === item.id ? "page" : undefined}
              onPointerEnter={() => {
                if (item.id === "profile")
                  void map?.preloadLocation("yunmeng").catch(() => {});
              }}
              onFocus={() => {
                if (item.id === "profile")
                  void map?.preloadLocation("yunmeng").catch(() => {});
              }}
              onClick={() => goScene(item.id)}
            >
              {item.name}
            </button>
          ))}
        </nav>
        <div className="demo-header-actions">
          <button
            className="demo-data-button"
            onClick={() => setDataOpen(true)}
          >
            {data?.meta.year || 2025} 数据 <Icon name="down" size={15} />
          </button>
        </div>
      </header>
      {data && (
        <>
          {renderedScene === "national" && (
            <NationalPanels
              data={data}
              mode={mode}
              onMode={(next) => {
                setMode(next);
                fitScreen("national", "national", true, next);
              }}
              regionId={regionId}
              onRegion={onRegion}
              chainId={chainId}
              onChain={chooseChain}
              stageId={stageId}
              onStage={setStageId}
              onProfile={() => goScene("profile")}
              onCompany={openCompany}
              onNotice={notify}
            />
          )}
          {renderedScene === "profile" && (
            <CountyPanels
              data={data}
              chainId={chainId}
              stageId={stageId}
              onChain={chooseChain}
              onStage={setStageId}
              onMatch={() => goScene("flows")}
              onCompany={openCompany}
              onNotice={notify}
              onDocuments={() => setDialog("documents")}
            />
          )}
          {renderedScene === "flows" && (
            <MatchingPanels
              data={data}
              flows={flows}
              chainId={chainId}
              stageId={stageId}
              onChain={chooseChain}
              onStage={setStageId}
              cityId={cityId}
              onCity={setCityId}
              onCompany={openCompany}
              weights={weights}
              onWeights={setWeights}
              threshold={threshold}
              onThreshold={setThreshold}
              onNotice={notify}
            />
          )}
          <DemoDialogs
            kind={dialog}
            data={data}
            company={company}
            city={city}
            weights={weights}
            stageId={stageId}
            onClose={() => setDialog(null)}
            onKind={setDialog}
            onNotice={notify}
          />
        </>
      )}
      <div className="demo-map-tools" aria-label="地图工具">
        <button onClick={() => map?.zoomBy(1)} aria-label="放大" title="放大">
          ＋
        </button>
        <button onClick={() => map?.zoomBy(-1)} aria-label="缩小" title="缩小">
          −
        </button>
        <button
          aria-label="地图图层"
          title="地图图层"
          aria-expanded={layerOpen}
          onClick={() => setLayerOpen(!layerOpen)}
        >
          <Icon name="layers" />
        </button>
        <button
          aria-label={
            navigation.parentName ? "返回" + navigation.parentName : "返回全国"
          }
          title={
            navigation.parentName ? "返回" + navigation.parentName : "返回全国"
          }
          onClick={() => fitScreen(navigation.parentId || "national", scene)}
        >
          <Icon name="globe" />
        </button>
      </div>
      {layerOpen && (
        <div className="d-panel demo-map-popover">
          <strong>地图图层</strong>
          <label>
            <input
              type="checkbox"
              checked={layers?.boundaries ?? true}
              onChange={(event) => map?.setBoundaries(event.target.checked)}
            />
            行政界线
          </label>
          <label>
            <input
              type="checkbox"
              checked={layers?.labels ?? true}
              onChange={(event) => map?.setLabels(event.target.checked)}
            />
            地名标注
          </label>
          {layers?.townshipsAvailable && (
            <label>
              <input
                type="checkbox"
                checked={layers.townships}
                onChange={(event) => map?.setTownships(event.target.checked)}
              />
              乡镇界线和名称
            </label>
          )}
          <button
            className="d-btn"
            onClick={() => {
              fitScreen(scene === "profile" ? "yunmeng" : "national", scene);
              setLayerOpen(false);
            }}
          >
            恢复当前场景视图
          </button>
        </div>
      )}
      {renderedScene === "flows" && (
        <div className="demo-flow-legend">
          <span>
            <i style={{ background: "var(--c-people)" }} />
            人口流
          </span>
          <span>
            <i style={{ background: "var(--c-capital)" }} />
            资本流
          </span>
          <span>
            <i style={{ background: "var(--c-tech)" }} />
            技术流
          </span>
          <small>{flows.visible.length.toLocaleString()} 条流线</small>
        </div>
      )}
      {flows.enabled && !dialog && <FlowTooltip hover={flows.hover} />}
      <div className="demo-mobile-controls">
        <button
          aria-pressed={mobilePanel === "left"}
          onClick={() =>
            setMobilePanel(mobilePanel === "left" ? "none" : "left")
          }
        >
          筛选与画像
        </button>
        <button
          aria-pressed={mobilePanel === "right"}
          onClick={() =>
            setMobilePanel(mobilePanel === "right" ? "none" : "right")
          }
        >
          分析结果
        </button>
      </div>
      {toast && (
        <div className="demo-toast" role="status">
          <Icon name="info" size={18} />
          {toast}
        </div>
      )}
      {status && (
        <div id="load-status" role="status">
          {status}
          {(error || dataError) && (
            <button className="d-btn" onClick={() => location.reload()}>
              重新载入
            </button>
          )}
        </div>
      )}
      {dataOpen && (
        <DataDialog
          data={data}
          onClose={() => setDataOpen(false)}
          onApply={(next) => {
            dataRequests.invalidate();
            localStorage.setItem(DATA_KEY, JSON.stringify(next));
            setData(withHubeiDirectory(next));
            setDataError(null);
            notify("数据已更新；地图与流线资源保持原样");
          }}
          onReset={async () => {
            const request = dataRequests.begin();
            try {
              const next = await loadDemoData(request.signal);
              if (!request.isCurrent()) return;
              localStorage.removeItem(DATA_KEY);
              setData(withHubeiDirectory(next));
              setDataError(null);
              notify("已恢复项目数据");
            } catch {
              if (request.isCurrent()) notify("项目数据读取失败，请稍后重试");
            }
          }}
        />
      )}
    </div>
  );
}

function DataDialog({
  data,
  onClose,
  onApply,
  onReset,
}: {
  data: DemoData | null;
  onClose(): void;
  onApply(data: DemoData): void;
  onReset(): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="demo-data-dialog"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="demo-data-content">
        <div className="d-section-title">
          <div>
            <span className="d-eyebrow">数据管理</span>
            <h2>资料与替换入口</h2>
          </div>
          <button
            className="d-icon-button"
            aria-label="关闭数据管理"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <p className="d-muted">
          全国指标、产业链与云梦画像使用同一份数据。企业标识可通过每家企业的
          logo 图片地址替换。
        </p>
        <div className="demo-data-summary">
          <span>
            <strong>{data?.regions.length || 0}</strong>地区
          </span>
          <span>
            <strong>{data?.chains.length || 0}</strong>产业链
          </span>
          <span>
            <strong>{data?.companies.length || 0}</strong>企业
          </span>
        </div>
        <ol>
          <li>下载包含三个 sheet 的 Excel 模板，保留表头和来源。</li>
          <li>资料整理完成后，通过项目导入工具转换为数据文件。</li>
          <li>在此载入数据 JSON；仅保存在当前浏览器，可随时恢复项目数据。</li>
        </ol>
        <div className="demo-data-links">
          <a
            className="d-btn"
            href={import.meta.env.BASE_URL + "assets/demo/数据模板.xlsx"}
            download
          >
            <Icon name="file" />
            下载 Excel 模板
          </a>
          <button
            className="d-btn"
            onClick={() => {
              if (!data) return;
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(data, null, 2)], {
                  type: "application/json",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "yunmeng-demo-data.json";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            导出当前数据
          </button>
        </div>
        <label className="demo-file-input">
          导入数据 JSON
          <input
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const next = validateDemoData(JSON.parse(await file.text()));
                onApply(next);
                setMessage("已载入 " + file.name);
              } catch (cause) {
                setMessage(
                  "未应用：" +
                    (cause instanceof Error ? cause.message : "文件格式无效"),
                );
              }
            }}
          />
        </label>
        {message && <p role="status">{message}</p>}
        <div className="demo-data-bottom">
          <button
            className="d-btn"
            onClick={() => {
              setMessage("");
              onReset();
            }}
          >
            恢复项目数据
          </button>
        </div>
      </div>
    </dialog>
  );
}
