import type OLMap from "ol/Map.js";
import type { FrameState } from "ol/Map.js";
import Layer from "ol/layer/Layer.js";
import { fromLonLat } from "ol/proj.js";
import { createEmpty, extend, isEmpty } from "ol/extent.js";
import type { Extent } from "ol/extent.js";
import type { Coordinate } from "ol/coordinate.js";
import { unByKey } from "ol/Observable.js";
import type { EventsKey } from "ol/events.js";
import type { Pixel } from "ol/pixel.js";
import type { FeatureCollection, LineString as GeoLineString } from "geojson";

export type FlowType = "people" | "capital" | "tech";
export type FlowScope = "national" | "xiaogan" | "yunmeng";
export type FlowDirection = "in" | "out";
/** plan：国土空间规划图风格（默认，亮色、带箭头的流向带）；night：墨色底图 + 发光流线。 */
export type FlowTheme = "plan" | "night";

export const FLOW_TYPES: Record<
  FlowType,
  { name: string; color: string; rgb: string; unit: string }
> = {
  people: {
    name: "人口流",
    color: "#2B6CB0",
    rgb: "43,108,176",
    unit: "迁徙指数",
  },
  capital: {
    name: "资本流",
    color: "#C98A2E",
    rgb: "201,138,46",
    unit: "投资额",
  },
  tech: {
    name: "技术流",
    color: "#8E5BA8",
    rgb: "142,91,168",
    unit: "技术流强度",
  },
};
export const FLOW_TYPE_ORDER: FlowType[] = ["people", "capital", "tech"];
export const YUNMENG_LONLAT: [number, number] = [113.7448, 31.0239];
export const YUNMENG_RED = "#C8463C";
export const FLOW_PALETTE: Record<
  FlowTheme,
  Record<FlowType | "yunmeng", string>
> = {
  night: {
    people: "#56AAFF",
    capital: "#FFB84D",
    tech: "#C47CFF",
    yunmeng: "#FF5C4E",
  },
  plan: {
    people: "#2F74D0",
    capital: "#E39A12",
    tech: "#9A5BD6",
    yunmeng: "#D7263D",
  },
};

export interface FlowProps {
  t: FlowType;
  o: string;
  d: string;
  v: number;
  /** 全国排名，或孝感/云梦相关流在同方向内的排名。 */
  r: number;
  /** 全国流：累计占比与分档（1 核心 30%、2 主要 50%、3 扩展 70%）。 */
  c?: number;
  tier?: 1 | 2 | 3;
  /** 0-1，按对数缩放后的强度，用于线宽、亮度和光点速度。 */
  n: number;
  scope?: "xiaogan" | "yunmeng";
  dir?: "in" | "out" | "local";
  note?: string;
}

export interface FlowFilter {
  scope: FlowScope;
  types: FlowType[];
  /** 全国：1/2/3 档；孝感相关：前 10 / 前 20 / 全部。 */
  level: 1 | 2 | 3;
  direction: FlowDirection;
}

export interface FlowHover {
  pixel: Pixel;
  props: FlowProps;
}

type XY = [number, number];

interface Flow {
  p: FlowProps;
  /** 起点、控制点、终点（EPSG:3857）。数据里的弧线就是二次贝塞尔，可精确还原。 */
  a: XY;
  c: XY;
  b: XY;
  ext: Extent;
  /** 沿曲线的采样点，用于鼠标命中。 */
  pts: Float64Array;
  seed: number;
  /** 入场动画：延迟（毫秒）与当前生长进度 0-1。 */
  delay: number;
  g: number;
  /** 同类流在当前可见集合中的名次（0 最强）；规划风格据此分“主要通道 / 一般联系”。 */
  rank: number;
  major: boolean;
}

interface FlowNode {
  name: string;
  x: number;
  y: number;
  weight: number;
  type: FlowType;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SAMPLES = 24;
const LOCAL_LIMIT = { 1: 10, 2: 20, 3: Infinity } as const;
const COMET_LIMIT = 240;
/** 规划风格下全国视图每类流只把最强的几条画成粗箭头通道，其余画成细线。 */
const MAJOR_PER_TYPE = 6;
const GROW_MS = 950;
const NODE_FADE_MS = 1500;
const FONT = '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';
const TAU = Math.PI * 2;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const rgbOf = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};
const lighten = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const mix = (v: number) => Math.round(v + (255 - v) * k);
  return `${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)}`;
};

function quadAt(a: XY, c: XY, b: XY, t: number): XY {
  const u = 1 - t;
  return [
    u * u * a[0] + 2 * u * t * c[0] + t * t * b[0],
    u * u * a[1] + 2 * u * t * c[1] + t * t * b[1],
  ];
}

/** 二次贝塞尔在 [t0, t1] 上的子段仍是二次贝塞尔（开花算法）。 */
function subQuad(a: XY, c: XY, b: XY, t0: number, t1: number): [XY, XY, XY] {
  const u0 = 1 - t0;
  const u1 = 1 - t1;
  const k0 = u0 * u1;
  const k1 = u0 * t1 + t0 * u1;
  const k2 = t0 * t1;
  return [
    quadAt(a, c, b, t0),
    [k0 * a[0] + k1 * c[0] + k2 * b[0], k0 * a[1] + k1 * c[1] + k2 * b[1]],
    quadAt(a, c, b, t1),
  ];
}

function distSqToPolyline(x: number, y: number, pts: Float64Array) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 2; i += 2) {
    const ax = pts[i];
    const ay = pts[i + 1];
    const dx = pts[i + 2] - ax;
    const dy = pts[i + 3] - ay;
    const len = dx * dx + dy * dy;
    const t = len ? clamp01(((x - ax) * dx + (y - ay) * dy) / len) : 0;
    const ex = ax + t * dx - x;
    const ey = ay + t * dy - y;
    const d = ex * ex + ey * ey;
    if (d < best) best = d;
  }
  return best;
}

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** 县区级名称去掉地级市前缀：“苏州市张家港市” → “张家港市”。 */
const shortName = (name: string) =>
  name.match(/^.+?市(.+[区县市旗])$/)?.[1] ??
  name.match(/^.+?[州盟](.+[区县市旗])$/)?.[1] ??
  name;
/** 县区级地名：部分记录省略了“市”（如“孝感安陆市”“武汉青山区”），也一并去掉地级前缀。 */
const localName = (name: string) => {
  const short = shortName(name);
  return short === name
    ? (name.match(/^[^市]{2}(.{2,}[区县市旗])$/)?.[1] ?? name)
    : short;
};

/**
 * 流空间叠加层（自绘 Canvas）：
 * - 静态部分（底色、流线、城市节点、标签）缓存在离屏画布，只有视角/筛选/悬停变化时重画；
 * - 动态部分（彗星光点、到达涟漪、云梦雷达）每帧绘制。
 * 与底图共用同一个 OpenLayers 地图和 EPSG:3857 坐标系，缩放、下钻时不会错位。
 */
export class FlowLayer {
  readonly layer: Layer;
  /** 图层根节点：base 画静态内容，fx 画逐帧动画（自带 rAF，不驱动底图重绘）。 */
  private readonly root = document.createElement("div");
  private readonly base = document.createElement("canvas");
  private readonly bctx: CanvasRenderingContext2D;
  private readonly fx = document.createElement("canvas");
  private readonly fctx: CanvasRenderingContext2D;
  private size = { w: 0, h: 0, pr: 1 };
  private raf = 0;
  private lastPaint = 0;
  private national: Flow[] = [];
  private local: Flow[] = [];
  private visible: Flow[] = [];
  /** 按强度升序：强流画在最上面。 */
  private order: Flow[] = [];
  private comets: Flow[] = [];
  private nodes: FlowNode[] = [];
  private hovered: Flow | null = null;
  private filter: FlowFilter = {
    scope: "national",
    types: ["people", "capital", "tech"],
    level: 1,
    direction: "in",
  };
  private theme: FlowTheme = "plan";
  /** 云梦县界（EPSG:3857 环），用于规划图式的县域边界。 */
  private boundary: XY[][] = [];
  private enabled = true;
  private introStart = 0;
  private version = 0;
  private cacheKey = "";
  private transform: number[] = [1, 0, 0, 1, 0, 0];
  private readonly sprites = new Map<string, HTMLCanvasElement>();
  private grid: CanvasPattern | null = null;
  /** 本帧已放置的沿线标签字框，城市名避让用。 */
  private labelBoxes: Box[] = [];
  private readonly keys: EventsKey[] = [];
  private readonly reduced: boolean;
  private readonly yunmeng: XY;
  private readonly onLeave = () => this.setHovered(null, null);
  onHover?: (hover: FlowHover | null) => void;
  onChange?: (visible: FlowProps[]) => void;

  constructor(private readonly map: OLMap) {
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.yunmeng = fromLonLat(YUNMENG_LONLAT) as XY;
    this.bctx = this.base.getContext("2d")!;
    this.fctx = this.fx.getContext("2d")!;
    this.root.className = "flow-canvas";
    for (const el of [this.root, this.base, this.fx]) {
      Object.assign(el.style, {
        position: "absolute",
        left: "0",
        top: "0",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      });
    }
    this.root.append(this.base, this.fx);
    this.layer = new Layer({
      render: (frameState) => this.renderFrame(frameState),
      zIndex: 100,
      properties: { name: "flow-space" },
    });
    map.addLayer(this.layer);
    this.keys.push(
      map.on("pointermove", (e) => {
        if (e.dragging || !this.enabled) return;
        const hit = this.hitTest(e.coordinate);
        this.setHovered(hit, e.pixel);
        const target = map.getTargetElement();
        if (hit && target) target.style.cursor = "pointer";
      }),
    );
    map.getViewport()?.addEventListener("mouseleave", this.onLeave);
    this.applyThemeClass();
    if (!this.reduced) this.raf = requestAnimationFrame(this.tick);
  }

  async load(base: string, signal?: AbortSignal) {
    const read = async (name: string) => {
      const response = await fetch(base + name, { signal });
      if (!response.ok) throw new Error(`流数据加载失败：${name}`);
      const json = (await response.json()) as FeatureCollection<
        GeoLineString,
        FlowProps
      >;
      return json.features.map((f, i) =>
        this.toFlow(f.properties, f.geometry.coordinates, i),
      );
    };
    [this.national, this.local] = await Promise.all([
      read("flows-national.geojson"),
      read("flows-local.geojson"),
      this.loadBoundary(base + "../geo/yunmeng-boundary.geojson", signal),
    ]);
    this.refresh();
  }

  setFilter(next: Partial<FlowFilter>) {
    this.filter = { ...this.filter, ...next };
    this.refresh();
  }

  getFilter() {
    return { ...this.filter };
  }

  setTheme(theme: FlowTheme) {
    if (theme === this.theme) return;
    this.theme = theme;
    this.applyThemeClass();
    this.invalidate();
  }

  setEnabled(value: boolean) {
    if (value === this.enabled) return;
    this.enabled = value;
    this.layer.setVisible(value);
    if (!value) this.setHovered(null, null);
    else this.replay();
    this.applyThemeClass();
    this.map.render();
  }

  /** 重新播放流线“生长”入场动画。 */
  replay() {
    this.introStart = performance.now();
    this.invalidate();
  }

  /** 把镜头移到当前可见流线的范围（云梦始终在画面里）。 */
  fitVisible(padding?: number[]) {
    const [width, height] = this.map.getSize() ?? [1440, 900];
    // Match the responsive panel: wide-screen legend, narrow sidebar, or the
    // mobile top panel. Fixed desktop padding leaves almost no map in a sidebar.
    const viewportPadding =
      padding ??
      (width <= 600
        ? [Math.min(height * 0.46 + 30, height - 180), 70, 65, 20]
        : width <= 1100
          ? [135, 65, 120, Math.min(380, width * 0.44)]
          : width <= 1280
            ? [130, 90, 120, 400]
            : [130, 300, 120, 400]);
    const extent = createEmpty();
    for (const f of this.visible) {
      extend(extent, [...f.a, ...f.a]);
      extend(extent, [...f.b, ...f.b]);
    }
    extend(extent, [...this.yunmeng, ...this.yunmeng]);
    if (isEmpty(extent)) return;
    this.map.getView().fit(extent, {
      padding: viewportPadding,
      duration: this.reduced ? 0 : 1100,
      maxZoom: this.filter.scope === "yunmeng" ? 7.2 : 7.8,
    });
  }

  /** 当前可见流里，按流量排序的前 n 条（用于面板列表）。 */
  topVisible(type: FlowType, n = 10) {
    return this.visible
      .map((f) => f.p)
      .filter((p) => p.t === type)
      .sort((a, b) => b.v - a.v)
      .slice(0, n);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    unByKey(this.keys);
    this.map.getViewport()?.removeEventListener("mouseleave", this.onLeave);
    this.map.removeLayer(this.layer);
    const target = this.map.getTargetElement();
    if (target) delete target.dataset.flowTheme;
  }

  // ---------------------------------------------------------------- 数据

  private toFlow(p: FlowProps, coords: number[][], i: number): Flow {
    const m = coords.map((c) => fromLonLat(c) as XY);
    const a = m[0];
    const b = m[m.length - 1];
    // 弧线由 17 个等参数点组成，中点就是 t = 0.5：c = 2·B(0.5) − (a + b) / 2。
    const mid =
      m.length % 2
        ? m[(m.length - 1) / 2]
        : ([
            (m[m.length / 2 - 1][0] + m[m.length / 2][0]) / 2,
            (m[m.length / 2 - 1][1] + m[m.length / 2][1]) / 2,
          ] as XY);
    const c: XY = [
      2 * mid[0] - (a[0] + b[0]) / 2,
      2 * mid[1] - (a[1] + b[1]) / 2,
    ];
    const pts = new Float64Array((SAMPLES + 1) * 2);
    for (let k = 0; k <= SAMPLES; k++) {
      const q = quadAt(a, c, b, k / SAMPLES);
      pts[k * 2] = q[0];
      pts[k * 2 + 1] = q[1];
    }
    const ext: Extent = [
      Math.min(a[0], b[0], c[0]),
      Math.min(a[1], b[1], c[1]),
      Math.max(a[0], b[0], c[0]),
      Math.max(a[1], b[1], c[1]),
    ];
    return {
      p,
      a,
      c,
      b,
      ext,
      pts,
      seed: (i * 0.6180339887) % 1,
      delay: 0,
      g: 1,
      rank: 0,
      major: true,
    };
  }

  /** 县界只是装饰，加载失败不影响流线。 */
  private async loadBoundary(url: string, signal?: AbortSignal) {
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) return;
      const json = (await response.json()) as FeatureCollection;
      const rings: XY[][] = [];
      for (const f of json.features) {
        const g = f.geometry;
        const polys =
          g.type === "Polygon"
            ? [g.coordinates]
            : g.type === "MultiPolygon"
              ? g.coordinates
              : [];
        for (const poly of polys)
          rings.push(poly[0].map((c) => fromLonLat(c) as XY));
      }
      this.boundary = rings;
    } catch {
      this.boundary = [];
    }
  }

  private passes(p: FlowProps) {
    const { scope, types, level, direction } = this.filter;
    if (!types.includes(p.t)) return false;
    if (scope === "national") return (p.tier ?? 3) <= level;
    if (p.scope !== scope) return false;
    if (scope === "yunmeng") return true;
    return p.dir === direction && p.r <= LOCAL_LIMIT[level];
  }

  private refresh() {
    const pool = this.filter.scope === "national" ? this.national : this.local;
    this.visible = pool.filter((f) => this.passes(f.p));
    this.order = [...this.visible].sort((x, y) => x.p.n - y.p.n);
    const strongest = [...this.order].reverse();
    const seen: Record<FlowType, number> = { people: 0, capital: 0, tech: 0 };
    const national = this.filter.scope === "national";
    for (const f of strongest) {
      f.rank = seen[f.p.t]++;
      f.major = !national || f.rank < MAJOR_PER_TYPE;
    }
    // 强流先长出来，弱流随后铺开。
    const count = strongest.length;
    const spread = Math.min(1500, 350 + count * 2.2);
    strongest.forEach((f, i) => {
      f.delay = count > 1 ? spread * (i / (count - 1)) ** 0.8 : 0;
    });
    this.comets =
      this.filter.scope === "national"
        ? strongest.slice(0, COMET_LIMIT)
        : strongest;
    this.nodes = this.buildNodes();
    this.hovered = null;
    this.introStart = performance.now();
    this.onChange?.(this.visible.map((f) => f.p));
    this.invalidate();
  }

  private buildNodes() {
    const nodes = new Map<
      string,
      FlowNode & { byType: Record<FlowType, number> }
    >();
    const add = (name: string, xy: XY, f: Flow) => {
      if (Math.hypot(xy[0] - this.yunmeng[0], xy[1] - this.yunmeng[1]) < 3000)
        return; // 云梦有专门的标记
      const key = `${Math.round(xy[0] / 800)},${Math.round(xy[1] / 800)}`;
      let node = nodes.get(key);
      if (!node) {
        node = {
          name: this.filter.scope === "yunmeng" ? localName(name) : name,
          x: xy[0],
          y: xy[1],
          weight: 0,
          type: f.p.t,
          byType: { people: 0, capital: 0, tech: 0 },
        };
        nodes.set(key, node);
      }
      const w = 0.25 + clamp01(f.p.n);
      node.weight += w;
      node.byType[f.p.t] += w;
    };
    for (const f of this.visible) {
      add(f.p.o, f.a, f);
      add(f.p.d, f.b, f);
    }
    return [...nodes.values()]
      .map((n) => ({
        ...n,
        type: FLOW_TYPE_ORDER.reduce((a, b) =>
          n.byType[b] > n.byType[a] ? b : a,
        ),
      }))
      .sort((a, b) => b.weight - a.weight);
  }

  // ---------------------------------------------------------------- 交互

  private hitTest(coordinate: Coordinate) {
    const resolution = this.map.getView().getResolution() ?? 1;
    const tol = 7 * resolution;
    const [x, y] = coordinate;
    let best: Flow | null = null;
    let bestD = tol * tol;
    for (const f of this.visible) {
      if (f.g < 1) continue;
      const e = f.ext;
      if (x < e[0] - tol || x > e[2] + tol || y < e[1] - tol || y > e[3] + tol)
        continue;
      // 距离相近时优先选中更强的流。
      const d = distSqToPolyline(x, y, f.pts) * (1 - 0.35 * clamp01(f.p.n));
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  private setHovered(flow: Flow | null, pixel: Pixel | null) {
    if (flow !== this.hovered) {
      this.hovered = flow;
      this.invalidate();
    }
    this.onHover?.(flow && pixel ? { pixel, props: flow.p } : null);
  }

  private applyThemeClass() {
    const target = this.map.getTargetElement();
    if (target) target.dataset.flowTheme = this.enabled ? this.theme : "off";
    // 夜色下动画层用“滤色”与下方合成，光点叠在流线上会更亮。
    this.fx.style.mixBlendMode = this.theme === "night" ? "screen" : "normal";
  }

  /** 静态内容需要重画。动画模式下由 rAF 接手；减弱动效时请求一次底图渲染。 */
  private invalidate() {
    this.version++;
    if (this.reduced || !this.size.w) this.map.render();
  }

  private readonly tick = () => {
    this.raf = requestAnimationFrame(this.tick);
    if (!this.enabled || !this.size.w || document.hidden) return;
    const now = performance.now();
    if (now - this.lastPaint > 8) this.paint(now);
  };

  // ---------------------------------------------------------------- 绘制

  private px(xy: XY): XY {
    const t = this.transform;
    return [
      t[0] * xy[0] + t[2] * xy[1] + t[4],
      t[1] * xy[0] + t[3] * xy[1] + t[5],
    ];
  }

  private sprite(key: FlowType | "yunmeng" | "node") {
    const id = `${this.theme}|${key}`;
    let sprite = this.sprites.get(id);
    if (!sprite) {
      const pal = FLOW_PALETTE[this.theme];
      const rgb = rgbOf(key === "node" ? "#BFF6EE" : pal[key]);
      sprite = document.createElement("canvas");
      sprite.width = sprite.height = 64;
      const s = sprite.getContext("2d")!;
      const g = s.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.12, `rgba(${rgb},0.95)`);
      g.addColorStop(0.4, `rgba(${rgb},0.32)`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      s.fillStyle = g;
      s.fillRect(0, 0, 64, 64);
      this.sprites.set(id, sprite);
    }
    return sprite;
  }

  private renderFrame(frameState: FrameState): HTMLElement {
    const [w, h] = frameState.size;
    const pr = frameState.pixelRatio;
    const W = Math.round(w * pr);
    const H = Math.round(h * pr);
    for (const c of [this.base, this.fx]) {
      if (c.width !== W || c.height !== H) {
        c.width = W;
        c.height = H;
      }
    }
    this.size = { w, h, pr };
    this.transform = frameState.coordinateToPixelTransform.slice();
    this.paint(performance.now());
    return this.root;
  }

  private paint(now: number) {
    const { w, h, pr } = this.size;
    const elapsed = this.reduced ? Infinity : now - this.introStart;
    let growing = false;
    for (const f of this.visible) {
      const g = clamp01((elapsed - f.delay) / GROW_MS);
      f.g = easeOut(g);
      if (g < 1) growing = true;
    }
    const key = `${this.transform.join(",")}|${w}|${h}|${pr}|${this.version}`;
    if (growing || elapsed < NODE_FADE_MS + 100 || key !== this.cacheKey) {
      this.drawBase(w, h, pr, elapsed);
      this.cacheKey = key;
    }
    const ctx = this.fctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.fx.width, this.fx.height);
    ctx.setTransform(pr, 0, 0, pr, 0, 0);
    if (this.theme === "night") {
      if (!this.reduced) this.drawComets(ctx, now);
      this.drawRadar(ctx, now);
    } else {
      if (!this.reduced) this.drawDashes(ctx, now);
      this.drawRipplePlan(ctx, now);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    this.lastPaint = now;
  }

  /** 静态层：底色、流线、节点与标签。 */
  private drawBase(w: number, h: number, pr: number, elapsed: number) {
    const s = this.bctx;
    const night = this.theme === "night";
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalCompositeOperation = "source-over";
    s.globalAlpha = 1;
    s.clearRect(0, 0, this.base.width, this.base.height);
    s.setTransform(pr, 0, 0, pr, 0, 0);
    if (night) this.drawVeil(s, w, h);
    this.drawBoundary(s);
    s.lineCap = "round";
    const hot = this.hovered;
    const stroke = night
      ? (f: Flow, dim: number, isHot: boolean) =>
          this.strokeFlow(s, f, dim, isHot)
      : (f: Flow, dim: number, isHot: boolean) =>
          this.strokeFlowPlan(s, f, dim, isHot);
    const layers = night
      ? [this.order]
      : [this.order.filter((f) => !f.major), this.order.filter((f) => f.major)];
    for (const list of layers)
      for (const f of list) {
        if (f.g <= 0 || f === hot) continue;
        stroke(f, hot ? 0.2 : 1, false);
      }
    if (hot) stroke(hot, 1, true);
    s.globalCompositeOperation = "source-over";
    const fade = clamp01((elapsed - 350) / (NODE_FADE_MS - 350));
    this.labelBoxes = [];
    if (!hot && fade > 0) this.drawFlowLabels(s, fade);
    if (night) this.drawNodes(s, fade);
    else this.drawNodesPlan(s, fade);
    s.globalCompositeOperation = "source-over";
    s.globalAlpha = 1;
    if (night) this.drawYunmengMark(s);
    else this.drawYunmengPlan(s);
  }

  private drawBoundary(s: CanvasRenderingContext2D) {
    if (!this.boundary.length) return;
    const night = this.theme === "night";
    s.save();
    s.beginPath();
    for (const ring of this.boundary) {
      ring.forEach((c, i) => {
        const [x, y] = this.px(c);
        if (i) s.lineTo(x, y);
        else s.moveTo(x, y);
      });
      s.closePath();
    }
    s.lineJoin = "round";
    if (night) {
      s.fillStyle = "rgba(255,92,78,0.10)";
      s.fill();
      s.strokeStyle = "rgba(255,92,78,0.85)";
      s.lineWidth = 1.4;
      s.stroke();
    } else {
      // 规划图的县域边界：粉色晕边 + 深红实线。
      s.fillStyle = "rgba(255,160,80,0.14)";
      s.fill();
      s.strokeStyle = "rgba(214,96,140,0.38)";
      s.lineWidth = 9;
      s.stroke();
      s.strokeStyle = "#8E1F3A";
      s.lineWidth = 1.7;
      s.stroke();
    }
    s.restore();
  }

  /** 规划图式流向带：白色衬边 + 半透明色带 + 燕尾箭头。 */
  private strokeFlowPlan(
    s: CanvasRenderingContext2D,
    f: Flow,
    dim: number,
    hot: boolean,
  ) {
    const geo = this.arrowGeometry(f);
    if (!geo) return;
    const { body, tip, dir, head, width } = geo;
    const local = f.p.scope !== undefined;
    const n = clamp01(f.p.n);
    const tierK = f.p.tier === 3 ? 0.7 : f.p.tier === 2 ? 0.85 : 1;
    const rgb = rgbOf(FLOW_PALETTE.plan[f.p.t]);
    let alpha =
      (local ? 0.86 : f.major ? 0.78 + 0.14 * n : (0.3 + 0.3 * n) * tierK) *
      dim;
    if (hot) alpha = 0.96;
    const [p0, q, p2] = body;
    const path = () => {
      s.beginPath();
      s.moveTo(p0[0], p0[1]);
      s.quadraticCurveTo(q[0], q[1], p2[0], p2[1]);
    };
    const arrow = f.major || hot;
    const nx = -dir[1];
    const ny = dir[0];
    const hw = width * 1.15 + 3;
    const bx = tip[0] - dir[0] * head;
    const by = tip[1] - dir[1] * head;
    const arrowPath = () => {
      s.beginPath();
      s.moveTo(tip[0], tip[1]);
      s.lineTo(bx + nx * hw, by + ny * hw);
      s.lineTo(bx + dir[0] * head * 0.28, by + dir[1] * head * 0.28);
      s.lineTo(bx - nx * hw, by - ny * hw);
      s.closePath();
    };
    s.lineCap = "butt";
    s.lineJoin = "round";
    if (hot || f.major) {
      path();
      s.lineWidth = width + (hot ? 5 : 3);
      s.strokeStyle = hot
        ? "rgba(30,30,30,0.55)"
        : `rgba(255,255,255,${0.9 * dim})`;
      s.stroke();
      if (arrow) {
        arrowPath();
        s.lineWidth = hot ? 2.5 : 1.6;
        s.stroke();
      }
    }
    path();
    s.lineWidth = width;
    s.strokeStyle = `rgba(${rgb},${alpha})`;
    s.stroke();
    if (arrow) {
      arrowPath();
      s.fillStyle = `rgba(${rgb},${Math.min(1, alpha + 0.08)})`;
      s.fill();
    }
    // 减弱动效时把中心虚线画在静态层。
    if (this.reduced && width >= 4) this.centerDash(s, body, width, 0);
  }

  /** 流线在像素空间的几何：去掉箭头长度后的曲线主体 + 箭头尖端和方向。 */
  private arrowGeometry(f: Flow) {
    const A = this.px(f.a);
    const C = this.px(f.c);
    const B = this.px(f.b);
    const [p0, q, p2] = f.g < 1 ? subQuad(A, C, B, 0, f.g) : [A, C, B];
    const local = f.p.scope !== undefined;
    const n = clamp01(f.p.n);
    const width =
      (local
        ? 1.8 + 8 * n
        : f.major
          ? 4.5 + 6.5 * (1 - f.rank / MAJOR_PER_TYPE)
          : 0.7 + 1.6 * n ** 3) + (f === this.hovered ? 1.5 : 0);
    let dx = p2[0] - q[0];
    let dy = p2[1] - q[1];
    let d = Math.hypot(dx, dy);
    if (d < 1e-6) {
      dx = p2[0] - p0[0];
      dy = p2[1] - p0[1];
      d = Math.hypot(dx, dy);
    }
    if (d < 1e-6) return null;
    const chord = Math.hypot(p2[0] - p0[0], p2[1] - p0[1]);
    const head = Math.min(Math.max(7, width * 2.2), chord * 0.35);
    // 终点附近的速度约为 2·|p2 − q|，据此把曲线主体收短一个箭头长度。
    const trim = clamp01(1 - (head * 0.8) / (2 * d));
    const body = subQuad(p0, q, p2, 0, Math.max(0.5, trim));
    return {
      body,
      tip: p2,
      dir: [dx / d, dy / d] as XY,
      head,
      width,
    };
  }

  private centerDash(
    s: CanvasRenderingContext2D,
    [p0, q, p2]: [XY, XY, XY],
    width: number,
    offset: number,
  ) {
    const on = width * 1.3 + 4;
    const off = width * 0.9 + 4;
    s.save();
    s.setLineDash([on, off]);
    s.lineDashOffset = -offset % (on + off);
    s.lineCap = "butt";
    s.beginPath();
    s.moveTo(p0[0], p0[1]);
    s.quadraticCurveTo(q[0], q[1], p2[0], p2[1]);
    s.lineWidth = Math.max(1.2, width * 0.3);
    s.strokeStyle = "rgba(255,255,255,0.92)";
    s.stroke();
    s.restore();
  }

  /** 规划图式（动态）：主要流向带中心的白色虚线沿流向移动。 */
  private drawDashes(ctx: CanvasRenderingContext2D, now: number) {
    const hot = this.hovered;
    for (const f of this.comets) {
      if (f.g < 1 || (hot && f !== hot)) continue;
      const geo = this.arrowGeometry(f);
      if (!geo || geo.width < (f.p.scope ? 3.4 : 4)) continue;
      this.centerDash(ctx, geo.body, geo.width, now / 28);
    }
  }

  /** 沿曲线书写标签（规划图里“××发展带”的写法），只给最强的几条流。 */
  private drawFlowLabels(s: CanvasRenderingContext2D, fade: number) {
    const scope = this.filter.scope;
    const max = scope === "national" ? 3 : 4;
    const night = this.theme === "night";
    const typeName = { people: "人口流", capital: "资本流", tech: "技术流" };
    const strip = (name: string) => name.replace(/市$/, "");
    let shown = 0;
    s.save();
    s.globalAlpha = fade;
    s.font = `700 13px ${FONT}`;
    s.textAlign = "center";
    s.textBaseline = "middle";
    s.lineJoin = "round";
    const labelled = new Set<FlowType>();
    const ym = this.px(this.yunmeng);
    this.labelBoxes = [
      this.calloutBox(ym),
      { x: ym[0] - 18, y: ym[1] - 18, w: 36, h: 36 },
    ];
    for (let i = this.order.length - 1; i >= 0 && shown < max; i--) {
      const f = this.order[i];
      if (f.g < 1) continue;
      if (scope === "national") {
        if (labelled.has(f.p.t) || f.rank > 2) continue;
      }
      let A = this.px(f.a);
      const C = this.px(f.c);
      let B = this.px(f.b);
      const reversed = B[0] < A[0];
      if (reversed) [A, B] = [B, A];
      let text: string;
      if (scope === "yunmeng") {
        if (f.p.t === "capital") {
          const company = f.p.note?.split(" → ")[0] ?? "";
          const v = f.p.v;
          text = `${company} ${v >= 10000 ? `${(v / 10000).toFixed(1)}亿元` : `${Math.round(v)}万元`}`;
        } else text = (f.p.note ?? "").replace(/\s+/g, "");
      } else {
        const [l, r] = reversed ? [f.p.d, f.p.o] : [f.p.o, f.p.d];
        text = `${strip(shortName(l))}—${strip(shortName(r))} ${typeName[f.p.t]}`;
      }
      const chars = [...text];
      const widths = chars.map((ch) => s.measureText(ch).width + 1.5);
      const textW = widths.reduce((a, b) => a + b, 0);
      // 曲线弧长表
      const N = 40;
      const pts: XY[] = [];
      const cum = [0];
      for (let k = 0; k <= N; k++) {
        pts.push(quadAt(A, C, B, k / N));
        if (k)
          cum.push(
            cum[k - 1] +
              Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]),
          );
      }
      const total = cum[N];
      if (textW > total * 0.62) continue;
      const width = this.arrowGeometry(f)?.width ?? 2;
      const offset = width / 2 + 10;
      // 字写在曲线外凸的一侧
      const mid = quadAt(A, C, B, 0.5);
      const side =
        (C[0] - mid[0]) * -(B[1] - A[1]) + (C[1] - mid[1]) * (B[0] - A[0]) >= 0
          ? 1
          : -1;
      let pos = (total - textW) / 2;
      const color = FLOW_PALETTE[this.theme][f.p.t];
      const glyphs = chars.map((ch, j) => {
        const at = pos + widths[j] / 2;
        pos += widths[j];
        let k = 1;
        while (k < N && cum[k] < at) k++;
        const seg = cum[k] - cum[k - 1] || 1;
        const t = (at - cum[k - 1]) / seg;
        const x = pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * t;
        const y = pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t;
        const ang = Math.atan2(
          pts[k][1] - pts[k - 1][1],
          pts[k][0] - pts[k - 1][0],
        );
        const ox = -Math.sin(ang) * offset * side;
        const oy = Math.cos(ang) * offset * side;
        return { ch, x: x + ox, y: y + oy, ang };
      });
      // 与已放置的标签（含云梦标注）重叠就跳过这条，换下一条较强的流。
      const boxes = glyphs.map((g) => ({
        x: g.x - 8,
        y: g.y - 8,
        w: 16,
        h: 16,
      }));
      if (boxes.some((b) => this.labelBoxes.some((p) => overlaps(p, b))))
        continue;
      this.labelBoxes.push(...boxes);
      for (const { ch, x, y, ang } of glyphs) {
        s.save();
        s.translate(x, y);
        s.rotate(ang);
        s.lineWidth = 4;
        s.strokeStyle = night ? "rgba(3,12,15,0.9)" : "rgba(255,255,255,0.96)";
        s.strokeText(ch, 0, 0);
        s.fillStyle = color;
        s.fillText(ch, 0, 0);
        s.restore();
      }
      shown++;
      labelled.add(f.p.t);
    }
    s.restore();
  }

  /** 规划图式城市节点：核心枢纽 ⊙ 带晕圈，重要节点 ◎，一般节点 ●。 */
  private drawNodesPlan(s: CanvasRenderingContext2D, fade: number) {
    if (fade <= 0 || !this.nodes.length) return;
    const local = this.filter.scope !== "national";
    const red = "#D7263D";
    const list = this.nodes.slice(0, local ? 60 : 90);
    const ym = this.px(this.yunmeng);
    const placed: Box[] = [
      this.calloutBox(ym),
      { x: ym[0] - 16, y: ym[1] - 16, w: 32, h: 32 },
      ...this.labelBoxes,
    ];
    s.save();
    s.globalAlpha = fade * (this.hovered ? 0.4 : 1);
    const grade = (i: number) => (i < 3 ? 1 : i < 12 ? 2 : 3);
    list.forEach((node, i) => {
      const [x, y] = this.px([node.x, node.y]);
      const g = grade(i);
      s.lineWidth = 1;
      if (g === 1) {
        s.beginPath();
        s.arc(x, y, 14, 0, TAU);
        s.fillStyle = "rgba(240,110,40,0.16)";
        s.fill();
        s.strokeStyle = "rgba(232,89,12,0.6)";
        s.stroke();
      }
      const r = g === 1 ? 8 : g === 2 ? 5.5 : 2.8;
      s.beginPath();
      s.arc(x, y, r, 0, TAU);
      s.fillStyle = g === 3 ? red : "#ffffff";
      s.fill();
      s.lineWidth = g === 3 ? 1 : g === 1 ? 2.4 : 1.8;
      s.strokeStyle = g === 3 ? "#ffffff" : red;
      s.stroke();
      if (g < 3) {
        s.beginPath();
        s.arc(x, y, g === 1 ? 3.8 : 2.4, 0, TAU);
        s.fillStyle = red;
        s.fill();
      }
    });
    const labelMax = this.filter.scope === "yunmeng" ? 20 : local ? 14 : 12;
    s.textBaseline = "middle";
    s.textAlign = "left";
    s.lineJoin = "round";
    let shown = 0;
    const named = new Set<string>();
    for (let i = 0; i < list.length && shown < labelMax; i++) {
      const node = list[i];
      // 云梦县内的点由云梦标记代表；同名点只标一次。
      if (node.name.includes("云梦") || named.has(node.name)) continue;
      const g = grade(i);
      const [x, y] = this.px([node.x, node.y]);
      const r = g === 1 ? 14 : g === 2 ? 6 : 3;
      s.font =
        g === 1 ? `700 14px ${FONT}` : `${g === 2 ? 600 : 500} 12.5px ${FONT}`;
      const tw = s.measureText(node.name).width;
      const h = g === 1 ? 18 : 16;
      const candidates: Box[] = [
        { x: x + r + 4, y: y - h / 2, w: tw + 4, h },
        { x: x - r - 8 - tw, y: y - h / 2, w: tw + 4, h },
        { x: x - tw / 2 - 2, y: y - r - h - 2, w: tw + 4, h },
        { x: x - tw / 2 - 2, y: y + r + 2, w: tw + 4, h },
      ];
      const box = candidates.find((b) => !placed.some((p) => overlaps(p, b)));
      if (!box) continue;
      placed.push(box);
      named.add(node.name);
      shown++;
      s.lineWidth = 3.6;
      s.strokeStyle = "rgba(255,255,255,0.96)";
      s.strokeText(node.name, box.x + 2, box.y + h / 2);
      s.fillStyle = g === 1 ? "#111111" : "#2b2b2b";
      s.fillText(node.name, box.x + 2, box.y + h / 2);
    }
    s.restore();
  }

  /** 规划图式云梦标记（静态）：同心晕圈 + ⊙ + 名称与“招商目标”标签。 */
  private drawYunmengPlan(s: CanvasRenderingContext2D) {
    const at = this.yunmengPixel();
    if (!at) return;
    const [x, y] = at;
    const red = FLOW_PALETTE.plan.yunmeng;
    s.save();
    s.beginPath();
    s.arc(x, y, 30, 0, TAU);
    s.fillStyle = "rgba(240,110,40,0.16)";
    s.fill();
    s.setLineDash([4, 3]);
    s.lineWidth = 1.4;
    s.strokeStyle = "rgba(232,89,12,0.8)";
    s.stroke();
    s.setLineDash([]);
    s.beginPath();
    s.arc(x, y, 20, 0, TAU);
    s.lineWidth = 3;
    s.strokeStyle = "rgba(232,89,12,0.45)";
    s.stroke();
    s.beginPath();
    s.arc(x, y, 9.5, 0, TAU);
    s.fillStyle = "#ffffff";
    s.fill();
    s.lineWidth = 2.6;
    s.strokeStyle = red;
    s.stroke();
    s.beginPath();
    s.arc(x, y, 4.6, 0, TAU);
    s.fillStyle = red;
    s.fill();
    const box = this.calloutBox([x, y]);
    s.font = `800 17px ${FONT}`;
    s.textBaseline = "middle";
    s.textAlign = "left";
    s.lineJoin = "round";
    s.lineWidth = 4.5;
    s.strokeStyle = "rgba(255,255,255,0.97)";
    s.strokeText("云梦县", box.x, box.y + box.h / 2);
    s.fillStyle = "#B0141F";
    s.fillText("云梦县", box.x, box.y + box.h / 2);
    const tw = s.measureText("云梦县").width;
    s.font = `600 11px ${FONT}`;
    const tag = "招商目标";
    const tagW = s.measureText(tag).width + 12;
    const tx = box.x + tw + 6;
    const ty = box.y + box.h / 2 - 9;
    s.fillStyle = red;
    s.fillRect(tx, ty, tagW, 18);
    s.fillStyle = "#ffffff";
    s.fillText(tag, tx + 6, ty + 9.5);
    s.restore();
  }

  /** 规划图式（动态）：云梦的扩散圈。 */
  private drawRipplePlan(ctx: CanvasRenderingContext2D, now: number) {
    const at = this.yunmengPixel();
    if (!at || this.reduced) return;
    const [x, y] = at;
    for (const offset of [0, 0.5]) {
      const q = (now / 2600 + offset) % 1;
      ctx.beginPath();
      ctx.arc(x, y, 10 + 40 * q, 0, TAU);
      ctx.strokeStyle = `rgba(232,89,12,${(0.6 * (1 - q)).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  private drawVeil(s: CanvasRenderingContext2D, w: number, h: number) {
    s.fillStyle = "rgba(3,12,15,0.38)";
    s.fillRect(0, 0, w, h);
    if (!this.grid) {
      const tile = document.createElement("canvas");
      tile.width = tile.height = 26;
      const t = tile.getContext("2d")!;
      t.fillStyle = "rgba(150,235,220,0.13)";
      t.fillRect(12, 12, 1.4, 1.4);
      this.grid = s.createPattern(tile, "repeat");
    }
    if (this.grid) {
      s.fillStyle = this.grid;
      s.fillRect(0, 0, w, h);
    }
    const r = Math.hypot(w, h) / 2;
    const v = s.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,4,6,0.55)");
    s.fillStyle = v;
    s.fillRect(0, 0, w, h);
  }

  private strokeFlow(
    s: CanvasRenderingContext2D,
    f: Flow,
    dim: number,
    hot: boolean,
  ) {
    const night = this.theme === "night";
    const hex = FLOW_PALETTE[this.theme][f.p.t];
    const rgb = rgbOf(hex);
    const local = f.p.scope !== undefined;
    const n = clamp01(f.p.n);
    const tierK = f.p.tier === 3 ? 0.6 : f.p.tier === 2 ? 0.8 : 1;
    let width = local ? 1.2 + 3.2 * n : 0.55 + 2.5 * n ** 1.3;
    let alpha = (local ? 0.5 + 0.45 * n : (0.18 + 0.52 * n) * tierK) * dim;
    if (!night) {
      // 浅色底图上线条需要更实一些。
      width *= 1.1;
      alpha = Math.min(1, alpha * 1.3);
    }
    if (hot) {
      width += 1.8;
      alpha = 1;
    }
    const [p0, c, p2] =
      f.g < 1
        ? subQuad(this.px(f.a), this.px(f.c), this.px(f.b), 0, f.g)
        : [this.px(f.a), this.px(f.c), this.px(f.b)];
    s.beginPath();
    s.moveTo(p0[0], p0[1]);
    s.quadraticCurveTo(c[0], c[1], p2[0], p2[1]);
    // 夜色：光晕用叠加混合发亮，主线用普通混合，避免几十条线叠成一团白。
    if (hot || (dim === 1 && (local || n > 0.5))) {
      if (night) s.globalCompositeOperation = "lighter";
      const k = (hot ? 2.2 : 1) * (night ? 1 : 0.55);
      s.lineWidth = width * 5 + 3;
      s.strokeStyle = `rgba(${rgb},${(local ? 0.06 : 0.035) * k})`;
      s.stroke();
      s.lineWidth = width * 2.4 + 1;
      s.strokeStyle = `rgba(${rgb},${(local ? 0.1 : 0.065) * k})`;
      s.stroke();
    }
    s.globalCompositeOperation = night && local ? "lighter" : "source-over";
    if (hot || local || n > 0.08) {
      // 从流出地（暗）到流入地（亮）的渐变，方向一眼可读。
      const g = s.createLinearGradient(p0[0], p0[1], p2[0], p2[1]);
      g.addColorStop(0, `rgba(${rgb},${alpha * 0.12})`);
      g.addColorStop(0.6, `rgba(${rgb},${alpha * 0.62})`);
      g.addColorStop(1, `rgba(${night ? lighten(hex, 0.25) : rgb},${alpha})`);
      s.strokeStyle = g;
    } else {
      s.strokeStyle = `rgba(${rgb},${alpha * 0.6})`;
    }
    s.lineWidth = width;
    s.stroke();
    if (hot) {
      s.lineWidth = 1;
      s.strokeStyle = night
        ? "rgba(255,255,255,0.85)"
        : "rgba(255,255,255,0.7)";
      s.stroke();
    }
  }

  private drawNodes(s: CanvasRenderingContext2D, fade: number) {
    if (fade <= 0 || !this.nodes.length) return;
    const night = this.theme === "night";
    const local = this.filter.scope !== "national";
    const pal = FLOW_PALETTE[this.theme];
    const list = this.nodes.slice(0, local ? 60 : 90);
    const placed: Box[] = [...this.labelBoxes];
    const ym = this.px(this.yunmeng);
    placed.push(this.calloutBox(ym), {
      x: ym[0] - 14,
      y: ym[1] - 14,
      w: 28,
      h: 28,
    });
    const dim = this.hovered ? 0.35 : 1;
    s.globalAlpha = fade * dim;
    for (const node of list) {
      const [x, y] = this.px([node.x, node.y]);
      const r = Math.min(local ? 9 : 8, 1.8 + 1.5 * Math.sqrt(node.weight));
      s.globalCompositeOperation = night ? "lighter" : "source-over";
      const sp = this.sprite(node.type);
      s.globalAlpha = fade * dim * (night ? 0.75 : 0.3);
      s.drawImage(sp, x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
      s.globalAlpha = fade * dim;
      s.globalCompositeOperation = "source-over";
      s.beginPath();
      s.arc(x, y, r, 0, TAU);
      s.strokeStyle = `rgba(${rgbOf(pal[node.type])},${night ? 0.75 : 0.9})`;
      s.lineWidth = 1;
      s.stroke();
      s.beginPath();
      s.arc(x, y, Math.max(1.4, r * 0.42), 0, TAU);
      s.fillStyle = night ? "rgba(255,255,255,0.95)" : pal[node.type];
      s.fill();
    }
    // 标签：只给最重要的节点，按权重贪心避让。
    const labelMax = this.filter.scope === "yunmeng" ? 20 : local ? 14 : 12;
    s.font = `500 12px ${FONT}`;
    s.textBaseline = "middle";
    s.lineJoin = "round";
    let shown = 0;
    for (const node of list) {
      if (shown >= labelMax) break;
      const [x, y] = this.px([node.x, node.y]);
      const r = Math.min(local ? 9 : 8, 1.8 + 1.5 * Math.sqrt(node.weight));
      const tw = s.measureText(node.name).width;
      const candidates: Box[] = [
        { x: x + r + 5, y: y - 8, w: tw + 4, h: 16 },
        { x: x - r - 9 - tw, y: y - 8, w: tw + 4, h: 16 },
        { x: x - tw / 2 - 2, y: y - r - 21, w: tw + 4, h: 16 },
        { x: x - tw / 2 - 2, y: y + r + 4, w: tw + 4, h: 16 },
      ];
      const box = candidates.find((b) => !placed.some((p) => overlaps(p, b)));
      if (!box) continue;
      placed.push(box);
      shown++;
      s.lineWidth = 3.2;
      s.strokeStyle = night ? "rgba(3,12,15,0.9)" : "rgba(255,253,244,0.95)";
      s.strokeText(node.name, box.x + 2, box.y + 8);
      s.fillStyle = night ? "#EAF6F2" : "#2f4537";
      s.fillText(node.name, box.x + 2, box.y + 8);
    }
    s.globalAlpha = 1;
  }

  /** 彗星：带渐隐拖尾的光点，从流出地飞向流入地，到达后激起涟漪。 */
  private drawComets(ctx: CanvasRenderingContext2D, now: number) {
    const night = this.theme === "night";
    const pal = FLOW_PALETTE[this.theme];
    const hot = this.hovered;
    ctx.lineCap = "round";
    for (const f of this.comets) {
      if (f.g < 1 || (hot && f !== hot)) continue;
      const local = f.p.scope !== undefined;
      const n = clamp01(f.p.n);
      const period = (local ? 2300 : 2800) + (1 - n) * 2400;
      const s = ((now / period + f.seed) % 1) * 1.3;
      const len = local ? 0.34 : 0.26;
      const head = Math.min(1, s);
      const tail = Math.max(0, s - len);
      const hex = pal[f.p.t];
      const rgb = rgbOf(hex);
      ctx.globalCompositeOperation = night ? "lighter" : "source-over";
      const a = this.px(f.a);
      const c = this.px(f.c);
      const b = this.px(f.b);
      if (head - tail > 0.004) {
        const [p0, q, p2] = subQuad(a, c, b, tail, head);
        const g = ctx.createLinearGradient(p0[0], p0[1], p2[0], p2[1]);
        g.addColorStop(0, `rgba(${rgb},0)`);
        g.addColorStop(0.7, `rgba(${rgb},${night ? 0.55 : 0.6})`);
        g.addColorStop(
          1,
          `rgba(${night ? lighten(hex, 0.6) : rgb},${night ? 1 : 0.95})`,
        );
        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]);
        ctx.quadraticCurveTo(q[0], q[1], p2[0], p2[1]);
        ctx.strokeStyle = g;
        ctx.lineWidth =
          (local ? 1.8 + 2.4 * n : 1 + 1.9 * n) + (f === hot ? 1 : 0);
        ctx.stroke();
      }
      if (s <= 1) {
        const [x, y] = quadAt(a, c, b, head);
        const r = local ? 9 + 9 * n : 5 + 8 * n;
        ctx.globalAlpha = night ? 1 : 0.7;
        ctx.drawImage(this.sprite(f.p.t), x - r, y - r, r * 2, r * 2);
        ctx.globalAlpha = 1;
      } else if (local || n > 0.55) {
        const q = (s - 1) / 0.3;
        ctx.globalCompositeOperation = "source-over";
        ctx.beginPath();
        ctx.arc(b[0], b[1], 3 + (local ? 18 : 12) * q, 0, TAU);
        ctx.strokeStyle = `rgba(${rgb},${0.7 * (1 - q)})`;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  private calloutBox([x, y]: XY): Box {
    return this.theme === "night"
      ? { x: x + 28, y: y - 58, w: 118, h: 40 }
      : { x: x - 146, y: y + 12, w: 134, h: 24 };
  }

  private yunmengPixel(): XY | null {
    const [x, y] = this.px(this.yunmeng);
    const { w, h } = this.size;
    return x < -200 || y < -200 || x > w + 200 || y > h + 200 ? null : [x, y];
  }

  /** 云梦（动态）：雷达扫描扇面 + 距离环 + 扩散波纹 + 光晕。 */
  private drawRadar(ctx: CanvasRenderingContext2D, now: number) {
    const at = this.yunmengPixel();
    if (!at) return;
    const [x, y] = at;
    const night = this.theme === "night";
    const rgb = rgbOf(FLOW_PALETTE[this.theme].yunmeng);
    const R = 56;
    const t = this.reduced ? 0 : now;
    ctx.save();
    const ang = ((t / 2600) % 1) * TAU;
    if (!this.reduced && "createConicGradient" in ctx) {
      const span = 0.17;
      const g = ctx.createConicGradient(ang - span * TAU, x, y);
      g.addColorStop(0, `rgba(${rgb},0)`);
      g.addColorStop(span, `rgba(${rgb},${night ? 0.4 : 0.24})`);
      g.addColorStop(span + 0.002, `rgba(${rgb},0)`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, R, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + R * Math.cos(ang), y + R * Math.sin(ang));
      ctx.strokeStyle = `rgba(${rgb},0.8)`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(${rgb},0.5)`;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = `rgba(${rgb},0.28)`;
    ctx.beginPath();
    ctx.arc(x, y, R * 0.55, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = `rgba(${rgb},0.7)`;
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      ctx.moveTo(x + (R + 3) * Math.cos(a), y + (R + 3) * Math.sin(a));
      ctx.lineTo(x + (R + 9) * Math.cos(a), y + (R + 9) * Math.sin(a));
    }
    ctx.stroke();
    for (const offset of this.reduced ? [0.4] : [0, 0.5]) {
      const q = (((t / 2400 + offset) % 1) + 1) % 1;
      ctx.beginPath();
      ctx.arc(x, y, 6 + (R - 6) * q, 0, TAU);
      ctx.strokeStyle = `rgba(${rgb},${(0.7 * (1 - q)).toFixed(3)})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = night ? "lighter" : "source-over";
    const pulse = this.reduced ? 1 : 0.85 + 0.15 * Math.sin(t / 380);
    const r = 22 * pulse;
    ctx.drawImage(this.sprite("yunmeng"), x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }

  /** 云梦（静态）：朱砂圆点 + 标注牌，画在静态层，夜色下也保持不透明。 */
  private drawYunmengMark(ctx: CanvasRenderingContext2D) {
    const at = this.yunmengPixel();
    if (!at) return;
    const [x, y] = at;
    const night = this.theme === "night";
    const hex = FLOW_PALETTE[this.theme].yunmeng;
    const rgb = rgbOf(hex);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 5.5, 0, TAU);
    ctx.fillStyle = hex;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = night ? "#ffffff" : "#fffdf4";
    ctx.stroke();
    const box = this.calloutBox([x, y]);
    ctx.beginPath();
    ctx.moveTo(x + 5, y - 5);
    ctx.lineTo(box.x - 8, box.y + box.h / 2);
    ctx.lineTo(box.x, box.y + box.h / 2);
    ctx.strokeStyle = `rgba(${rgb},0.85)`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = night ? "rgba(26,8,9,0.85)" : "rgba(255,253,244,0.96)";
    ctx.strokeStyle = `rgba(${rgb},0.9)`;
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = hex;
    ctx.fillRect(box.x, box.y, 3, box.h);
    ctx.textBaseline = "alphabetic";
    ctx.font = `700 14px ${FONT}`;
    ctx.fillStyle = night ? "#ffffff" : "#3b1f1c";
    ctx.fillText("云梦县", box.x + 11, box.y + 18);
    ctx.font = `500 9.5px ${FONT}`;
    ctx.fillStyle = night ? "rgba(255,190,180,0.9)" : "#9a4a40";
    ctx.fillText("招商目标 · 孝感市", box.x + 11, box.y + 32);
    ctx.font = `600 9px ${FONT}`;
    ctx.fillStyle = `rgba(${rgb},0.95)`;
    ctx.fillText("TARGET", box.x + box.w - 44, box.y + 18);
    ctx.restore();
  }
}
