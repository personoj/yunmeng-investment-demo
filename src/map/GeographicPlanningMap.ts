import OLMap from "ol/Map.js";
import View from "ol/View.js";
import Feature from "ol/Feature.js";
import GeoJSONFormat from "ol/format/GeoJSON.js";
import VectorSource from "ol/source/Vector.js";
import ImageStaticSource from "ol/source/ImageStatic.js";
import ImageSource from "ol/source/Image.js";
import ImageLayer from "ol/layer/Image.js";
import VectorLayer from "ol/layer/Vector.js";
import ScaleLine from "ol/control/ScaleLine.js";
import { defaults as defaultInteractions } from "ol/interaction/defaults.js";
import Point from "ol/geom/Point.js";
import Polygon from "ol/geom/Polygon.js";
import MultiPolygon from "ol/geom/MultiPolygon.js";
import type Geometry from "ol/geom/Geometry.js";
import Style from "ol/style/Style.js";
import Fill from "ol/style/Fill.js";
import Stroke from "ol/style/Stroke.js";
import CircleStyle from "ol/style/Circle.js";
import { fromLonLat, toLonLat, transformExtent } from "ol/proj.js";
import type { FeatureCollection, GeoJsonObject } from "geojson";
import type { Coordinate } from "ol/coordinate.js";
import type { Extent } from "ol/extent.js";
import { intersects } from "ol/extent.js";
import type { Pixel } from "ol/pixel.js";
import { MapStyles, CITY_TINTS } from "./MapStyles";
import {
  ease,
  smooth,
  shortName,
  placeKey,
  regionTransition,
  normalizePlaceQuery,
} from "./utils";
import {
  readMapJSON,
  preloadMapImage,
  decodeMapImage,
  staticMapImage,
} from "./assets";
import type { DecodedMapImage } from "./assets";
import { AssetQueue } from "./AssetQueue";
import { createMapAttribution } from "./attribution";
import { StaticTextureLayer } from "./StaticTextureLayer";
import { SurroundingContext } from "./SurroundingContext";
import { LocalDetailLayer } from "./LocalDetailLayer";
import type {
  MapFeature,
  PlaceFeature,
  RegionInfo,
  RegionDefinition,
  RegionRegistry,
  MapMetadata,
  MapStyleConfig,
  MapLayerState,
  MapViewState,
  MapEvents,
  PlaceIndex,
  IndexedPlace,
  RegionEmphasis,
  DetailDefinition,
  MapNavigation,
} from "./types";

const format = new GeoJSONFormat();
type ResourceKind = "texture" | "context" | "cities" | "counties";
interface RegionResources {
  texture?: DecodedMapImage;
  textureReadyAt: number;
  context?: DecodedMapImage;
  contextReadyAt: number;
  cities?: MapFeature[];
  counties?: MapFeature[];
  citiesMounted: boolean;
  countiesMounted: boolean;
  lastUsed: number;
  pending: Set<ResourceKind>;
  failures: Map<ResourceKind, number>;
}
interface RegionRoleTransition {
  fromFocus: number;
  fromContext: number;
  focus: number;
  context: number;
  startedAt: number;
}

/** Geographic engine with no React dependency; one EPSG:3857 view for all layers. */
export class GeographicPlanningMap extends EventTarget {
  readonly target: HTMLElement;
  readonly assetBase: string;
  readonly view: View;
  readonly map: OLMap;
  private readonly observer: ResizeObserver;
  private readonly styles: MapStyles;
  private readonly abortController = new AbortController();
  private readonly assetQueue = new AssetQueue(3);
  private disposed = false;
  private showLabels = true;
  private showBoundaries = true;
  private showTownships = true;
  private showPlanning = true;
  private administrativeNavigation = true;
  private original = false;
  private reduced: boolean;
  private readonly attribution = createMapAttribution();
  private detailMix = 0;
  private activeRegion: RegionInfo | null = null;
  private cityDetails?: LocalDetailLayer;
  private countyDetails?: LocalDetailLayer;
  private regions: RegionDefinition[] = [];
  private regionsById = new Map<string, RegionDefinition>();
  private regionsByAdcode = new Map<number, RegionDefinition>();
  private cityPlaceByCode = new Map<string, PlaceFeature>();
  private cityPlacesByRegion = new Map<string, PlaceFeature[]>();
  private searchTextCache = new WeakMap<
    PlaceFeature,
    { names: string[]; region: string }
  >();
  private provinceByCode = new Map<number, MapFeature>();
  private meta!: MapMetadata;
  private styleA!: MapStyleConfig;
  private provinces!: FeatureCollection;
  private provinceSource!: VectorSource<MapFeature>;
  private citySource!: VectorSource<MapFeature>;
  private countySource!: VectorSource<MapFeature>;
  private hubei?: MapFeature;
  private worldLayer!: ImageLayer<ImageStaticSource>;
  private surroundingContext!: SurroundingContext;
  private nationalLayer!: ImageLayer<ImageStaticSource>;
  private regionLayers = new Map<string, ImageLayer<ImageSource>>();
  private contextLayers = new Map<string, ImageLayer<ImageSource>>();
  private regionResources = new Map<string, RegionResources>();
  private wantedRegions = new Set<string>();
  private wantedContexts = new Set<string>();
  private wantedCounties = new Set<string>();
  private contextLabelFeatures = new Set<PlaceFeature>();
  private regionEmphasis = new Map<string, RegionEmphasis>();
  private roleTransitions = new Map<string, RegionRoleTransition>();
  private effectiveTransitions = new Map<string, [number, number]>();
  private transitionViewportKey = "";
  private overviewEmphasis: RegionEmphasis = {
    focus: 0,
    context: 0,
    overview: true,
    zoomOffset: 0,
  };
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private fadeFrame?: number;
  private detailsReady = false;
  private readonly locationPreloads = new Map<string, Promise<void>>();
  private originalLayer!: ImageLayer<ImageStaticSource>;
  private provinceLayer!: VectorLayer<VectorSource<MapFeature>>;
  private cityBoundaryLayer!: VectorLayer<VectorSource<MapFeature>>;
  private countyBoundaryLayer!: VectorLayer<VectorSource<MapFeature>>;
  private borderLayer!: VectorLayer<VectorSource<MapFeature>>;
  private cityMarkerLayer!: VectorLayer<VectorSource<PlaceFeature>>;
  private labelLayer!: VectorLayer<VectorSource<PlaceFeature>>;
  private businessSource!: VectorSource<MapFeature>;
  private businessLayer!: VectorLayer<VectorSource<MapFeature>>;
  places: PlaceFeature[] = [];

  on<K extends keyof MapEvents>(
    type: K,
    listener: (detail: MapEvents[K]) => void,
  ): () => void {
    const handler = (event: Event) =>
      listener((event as CustomEvent<MapEvents[K]>).detail);
    this.addEventListener(type, handler);
    return () => this.removeEventListener(type, handler);
  }

  constructor(
    target: HTMLElement,
    { assetBase = "./assets/geo/" }: { assetBase?: string } = {},
  ) {
    super();
    this.target = target;
    this.assetBase = assetBase;

    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.view = new View({
      center: fromLonLat([104, 35]),
      zoom: 4,
      minZoom: 2,
      maxZoom: 16,
      enableRotation: false,
      constrainResolution: false,
      extent: transformExtent([60, 0, 145, 60], "EPSG:4326", "EPSG:3857"),
      constrainOnlyCenter: true,
      smoothExtentConstraint: true,
    });
    this.map = new OLMap({
      target,
      view: this.view,
      controls: [],
      interactions: defaultInteractions({
        altShiftDragRotate: false,
        pinchRotate: false,
      }),
      pixelRatio: Math.min(devicePixelRatio, 2),
    });
    this.map.addControl(new ScaleLine({ units: "metric", minWidth: 90 }));
    this.map.addControl(this.attribution);
    this.map.on("moveend", () => {
      // Camera movement changes visible detail, never the explicitly selected province.
      this.refreshVisibleRegions();
      this.emit("viewchange", this.getViewState());
    });
    this.map.on("singleclick", (e) => this.handleClick(e));
    this.map.on("pointermove", (e) => {
      if (e.dragging) return;
      const hit = this.clickableProvince(e.pixel, e.coordinate);
      target.style.cursor = hit ? "pointer" : "grab";
    });
    this.observer = new ResizeObserver(() => {
      this.map.updateSize();
      this.scheduleRegionRefresh();
      this.cityDetails?.updatePresentation();
      this.countyDetails?.updatePresentation();
    });
    this.observer.observe(target);
    this.styles = new MapStyles(
      this.view,
      () => this.getLayerState(),
      (id) => this.regionEmphasis.get(id) || this.overviewEmphasis,
      () => this.cityDetails?.getActive()?.adcode,
    );
  }
  emit<K extends keyof MapEvents>(type: K, detail: MapEvents[K]) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
  loadJSON<T = FeatureCollection>(name: string): Promise<T> {
    return readMapJSON<T>(this.assetBase + name, this.abortController.signal);
  }
  async initialize() {
    const [meta, provinces, styleA, context, registry] = await Promise.all([
      this.loadJSON<MapMetadata>("manifest.json"),
      this.loadJSON("provinces.geojson"),
      this.loadJSON<MapStyleConfig>("style-a.json"),
      this.loadJSON("surrounding-context.geojson"),
      this.loadJSON<RegionRegistry>("regions-style-a.json"),
    ]);
    this.abortController.signal.throwIfAborted();
    this.meta = meta;
    this.styleA = styleA;
    this.provinces = provinces;
    this.regions = registry.regions.map((region) => ({
      ...region,
      adcode: Number(region.adcode),
      available: true,
      transitionZoom: regionTransition(region),
    }));
    for (const region of this.regions) {
      this.regionsById.set(region.id, region);
      this.regionsByAdcode.set(region.adcode, region);
    }
    const [placeIndex, cityRegistry] = await Promise.all([
      registry.placeIndex
        ? this.loadJSON<PlaceIndex>(registry.placeIndex)
        : this.legacyPlaceIndex(),
      registry.cityDetails
        ? this.loadJSON<{
            cities: DetailDefinition[];
            counties?: DetailDefinition[];
          }>(registry.cityDetails)
        : Promise.resolve({ cities: [], counties: [] }),
    ]);
    this.abortController.signal.throwIfAborted();
    const read = (data: FeatureCollection) =>
      format.readFeatures(data, { featureProjection: "EPSG:3857" });
    this.provinceSource = new VectorSource({ features: read(provinces) });
    for (const feature of this.provinceSource.getFeatures())
      this.provinceByCode.set(Number(feature.get("adcode")), feature);
    this.hubei = this.provinceByCode.get(420000);
    this.updateResponsiveTransitions();
    this.citySource = new VectorSource();
    this.countySource = new VectorSource();
    const image = (
      name: string,
      extent: Extent,
      extra: { opacity?: number; visible?: boolean } = {},
    ) =>
      new ImageLayer({
        source: new ImageStaticSource({
          url: this.assetBase + name,
          imageExtent: extent,
          projection: "EPSG:3857",
          interpolate: true,
        }),
        ...extra,
      });
    const world = 20037508.342789244;
    this.surroundingContext = new SurroundingContext(read(context), this.view);
    this.worldLayer = image(
      "world-style-a.webp",
      [-world, -world, world, world],
      { opacity: 0.32 },
    );
    this.nationalLayer = image(
      "china-style-a-imagegen.webp",
      styleA.chinaExtent,
    );
    this.map.addLayer(this.surroundingContext.baseLayer);
    this.map.addLayer(this.worldLayer);
    this.map.addLayer(this.surroundingContext.lineLayer);
    this.map.addLayer(this.nationalLayer);
    this.regionLayers = new Map();
    for (const region of this.regions) {
      // No source or decoded pixels until this province enters the working view.
      const contextLayer = new StaticTextureLayer(
        {
          opacity: 0,
          visible: false,
          extent: region.extent,
        },
        () => this.markTexturePrepared(region.id, "context"),
      );
      const layer = new StaticTextureLayer(
        {
          opacity: 0,
          visible: false,
          extent: region.extent,
        },
        () => this.markTexturePrepared(region.id, "texture"),
      );
      this.regionLayers.set(region.id, layer);
      this.contextLayers.set(region.id, contextLayer);
      this.map.addLayer(contextLayer);
      this.map.addLayer(layer);
      this.regionResources.set(region.id, {
        textureReadyAt: 0,
        contextReadyAt: 0,
        citiesMounted: false,
        countiesMounted: false,
        lastUsed: 0,
        pending: new Set(),
        failures: new Map(),
      });
      this.regionEmphasis.set(region.id, {
        focus: 0,
        context: 0,
        overview: true,
        zoomOffset: this.regionZoomOffset(region),
      });
      this.roleTransitions.set(region.id, {
        fromFocus: 0,
        fromContext: 0,
        focus: 0,
        context: 0,
        startedAt: 0,
      });
    }
    this.originalLayer = image("hubei-original-geographic.webp", meta.extent, {
      visible: false,
    });
    this.map.addLayer(this.originalLayer);
    this.map.addLayer(this.surroundingContext.labelLayer);
    this.provinceLayer = new VectorLayer({
      source: this.provinceSource,
      updateWhileAnimating: true,
      updateWhileInteracting: true,
      style: new Style({
        fill: new Fill({ color: "rgba(242,243,233,0)" }),
        stroke: new Stroke({ color: "rgba(105,124,97,.24)", width: 0.65 }),
      }),
    });
    this.map.addLayer(this.provinceLayer);
    this.cityBoundaryLayer = new VectorLayer({
      source: this.citySource,
      updateWhileAnimating: true,
      updateWhileInteracting: true,
      style: (f, res) => this.styles.cityBoundaryStyle(f as MapFeature, res),
    });
    this.map.addLayer(this.cityBoundaryLayer);
    this.countyBoundaryLayer = new VectorLayer({
      source: this.countySource,
      style: (f, res) => this.styles.countyBoundaryStyle(f as MapFeature, res),
    });
    this.map.addLayer(this.countyBoundaryLayer);
    this.borderLayer = new VectorLayer({
      source: new VectorSource({
        features: this.regions
          .map((r) => {
            const feature = this.provinceByCode.get(r.adcode)?.clone();
            feature?.setProperties(
              { regionId: r.id, zoomOffset: this.regionZoomOffset(r) },
              true,
            );
            return feature;
          })
          .filter((feature): feature is MapFeature => Boolean(feature)),
      }),
      updateWhileAnimating: true,
      updateWhileInteracting: true,
      style: (f, res) => this.styles.focusBorderStyle(f as MapFeature, res),
    });
    this.map.addLayer(this.borderLayer);
    const labels: PlaceFeature[] = [];
    for (const f of provinces.features) {
      const p = f.properties;
      if (!p) continue;
      const center = p.centroid || p.center;
      if (!center || !p.name) continue;
      const region = this.regionsByAdcode.get(Number(p.adcode));
      labels.push(
        new Feature({
          geometry: new Point(fromLonLat(center)),
          name: p.name,
          fullName: p.name,
          level: "province",
          adcode: Number(p.adcode),
          lonlat: center,
          regionId: region?.id,
          regionName: region?.name || p.name,
          zoomOffset: region ? this.regionZoomOffset(region) : 0,
        }),
      );
    }
    const cityCodes = new Set(
      placeIndex.places
        .filter((p) => p.level === "city")
        .map((p) => placeKey(p.regionId, p.adcode)),
    );
    for (const indexed of placeIndex.places) {
      const region = this.regionsById.get(indexed.regionId);
      if (!region || !indexed.center) continue;
      if (
        indexed.level === "county" &&
        cityCodes.has(placeKey(region.id, indexed.adcode))
      )
        continue;
      const place: PlaceFeature = new Feature({
        geometry: new Point(fromLonLat(indexed.center)),
        name: indexed.shortName || shortName(indexed.name),
        fullName: indexed.name,
        level: indexed.level,
        capital: Number(indexed.adcode) === Number(region.capitalAdcode),
        adcode: Number(indexed.adcode),
        lonlat: indexed.center,
        areaCenter: new Point(fromLonLat(indexed.areaCenter || indexed.center)),
        indexedAreaCenter: Boolean(indexed.areaCenter),
        regionId: region.id,
        regionName: region.name,
        zoomOffset: this.regionZoomOffset(region),
        capitalKind: region.capitalKind,
        subdivisionLabel: region.subdivisionLabel || "城市",
      });
      labels.push(place);
      if (indexed.level === "city")
        this.cityPlaceByCode.set(placeKey(region.id, indexed.adcode), place);
    }
    for (const region of this.regions) {
      if (
        !region.capitalCenter ||
        labels.some((f) => f.get("regionId") === region.id && f.get("capital"))
      )
        continue;
      const coordinate = fromLonLat(region.capitalCenter);
      labels.push(
        new Feature({
          geometry: new Point(coordinate),
          areaCenter: new Point(coordinate),
          name: region.capitalName || region.name,
          fullName: region.capitalName || region.name,
          level: "city",
          capital: true,
          municipality: [110000, 120000, 310000, 500000].includes(
            region.adcode,
          ),
          seatLabel: true,
          capitalKind: region.capitalKind,
          zoomOffset: this.regionZoomOffset(region),
          adcode: Number(region.capitalAdcode || region.adcode),
          lonlat: region.capitalCenter,
          regionId: region.id,
          regionName: region.name,
          subdivisionLabel: region.capitalKind || "首府",
        }),
      );
    }
    this.places = labels;
    for (const feature of labels) {
      if (feature.get("level") !== "city") continue;
      const id = feature.get("regionId") as string;
      const cities = this.cityPlacesByRegion.get(id) || [];
      cities.push(feature);
      this.cityPlacesByRegion.set(id, cities);
    }
    this.cityMarkerLayer = new VectorLayer({
      source: new VectorSource({
        features: labels.filter((f) => f.get("level") === "city"),
      }),
      updateWhileAnimating: true,
      updateWhileInteracting: true,
      style: (f, res) => this.styles.cityMarkerStyle(f as PlaceFeature, res),
    });
    this.map.addLayer(this.cityMarkerLayer);
    this.labelLayer = new VectorLayer({
      source: new VectorSource({ features: labels }),
      declutter: true,
      updateWhileAnimating: true,
      updateWhileInteracting: true,
      renderOrder: (a, b) =>
        (b.get("capital")
          ? 4
          : b.get("level") === "city"
            ? 3
            : b.get("level") === "province"
              ? 2
              : 1) -
        (a.get("capital")
          ? 4
          : a.get("level") === "city"
            ? 3
            : a.get("level") === "province"
              ? 2
              : 1),
      style: (f, res) => this.styles.labelStyle(f as PlaceFeature, res),
    });
    this.map.addLayer(this.labelLayer);
    this.cityDetails = new LocalDetailLayer(
      this.map,
      cityRegistry.cities,
      this.assetBase,
      () => this.getLayerState(),
      (state) => {
        this.target.dataset.activeCity = state.id || "";
        this.target.dataset.cityReady = String(state.ready);
        this.emit("citydetailchange", state);
      },
      this.reduced,
    );
    this.countyDetails = new LocalDetailLayer(
      this.map,
      cityRegistry.counties || [],
      this.assetBase,
      () => this.getLayerState(),
      (state) => {
        this.target.dataset.activeCounty = state.id || "";
        this.target.dataset.countyReady = String(state.ready);
        this.cityDetails?.setFocusedChild(
          state.id
            ? this.countyDetails?.getDefinition(state.id)?.adcode
            : undefined,
        );
        this.emit("countydetailchange", state);
      },
      this.reduced,
    );
    this.businessSource = new VectorSource();
    this.businessLayer = new VectorLayer({
      source: this.businessSource,
      style: new Style({
        stroke: new Stroke({ color: "#326c85", width: 2 }),
        fill: new Fill({ color: "rgba(50,108,133,.12)" }),
        image: new CircleStyle({
          radius: 5,
          fill: new Fill({ color: "#326c85" }),
          stroke: new Stroke({ color: "#fff", width: 2 }),
        }),
      }),
    });
    this.map.addLayer(this.businessLayer);
    // The national view never waits for thirty-four large province textures.
    await Promise.all(
      ["world-style-a.webp", "china-style-a-imagegen.webp"].map((name) =>
        preloadMapImage(this.assetBase + name, this.abortController.signal),
      ),
    );
    this.abortController.signal.throwIfAborted();
    this.detailsReady = true;
    this.view.on("change:resolution", () => {
      this.updateDetailOpacity();
      this.scheduleRegionRefresh();
    });
    this.view.on("change:center", () => this.scheduleRegionRefresh());
    this.fitNational(false);
    this.updateDetailOpacity();
    await new Promise<void>((resolve, reject) => {
      const signal = this.abortController.signal;
      const complete = () => {
        signal.removeEventListener("abort", abort);
        resolve();
      };
      const abort = () => {
        this.map.un("rendercomplete", complete);
        reject(new DOMException("地图已卸载", "AbortError"));
      };
      signal.addEventListener("abort", abort, { once: true });
      this.map.once("rendercomplete", complete);
      this.map.renderSync();
    });
    this.attribution.showIntro();
    this.emit("ready", { ...meta, regions: this.getRegions() });
    return this;
  }
  /** Compatibility for the earlier seven-region registry, before the compact index existed. */
  private async legacyPlaceIndex(): Promise<PlaceIndex> {
    if (this.regions.length > 8)
      throw new Error("全国地图配置缺少 placeIndex 地点索引");
    const groups = await Promise.all(
      this.regions.map(async (region) => {
        const [cities, counties] = await Promise.all([
          this.loadJSON(region.cities),
          region.counties
            ? this.loadJSON(region.counties)
            : Promise.resolve({
                type: "FeatureCollection",
                features: [],
              } as FeatureCollection),
        ]);
        const places: IndexedPlace[] = [];
        for (const [collection, level] of [
          [cities, "city"],
          [counties, "county"],
        ] as [FeatureCollection, "city" | "county"][]) {
          for (const area of format.readFeatures(collection, {
            featureProjection: "EPSG:3857",
          })) {
            const p = area.getProperties();
            const areaCenter = toLonLat(
              this.interiorPoint(area.getGeometry()!).getCoordinates(),
            );
            places.push({
              regionId: region.id,
              adcode: Number(p.adcode),
              name: p.name,
              shortName: p.shortName,
              level,
              center: p.center || p.centroid || areaCenter,
              areaCenter,
            });
          }
        }
        return places;
      }),
    );
    return { version: 1, places: groups.flat() };
  }

  private regionZoomOffset(region: RegionDefinition) {
    return (
      (this.effectiveTransitions.get(region.id)?.[0] ??
        region.transitionZoom?.[0] ??
        5.6) - 5.6
    );
  }

  private updateResponsiveTransitions() {
    const size = this.map.getSize();
    if (!size || !size[0] || !size[1]) return;
    const key = size.join("x");
    if (key === this.transitionViewportKey) return;
    this.transitionViewportKey = key;
    const availableSize = [
      Math.max(1, size[0] - 44),
      Math.max(1, size[1] - 97),
    ];
    for (const region of this.regions) {
      const bounds =
        region.focusExtent ||
        this.provinceByCode.get(region.adcode)?.getGeometry()?.getExtent() ||
        region.extent;
      const fitZoom = Math.min(
        region.maxZoom ?? 14,
        this.view.getZoomForResolution(
          this.view.getResolutionForExtent(bounds, availableSize),
        ) ?? 4,
      );
      const [start, end] = region.transitionZoom || [5.6, 7];
      // Preserve the accepted desktop scale. A substantially smaller fit needs its own detail range.
      const shift = fitZoom < end - 0.35 ? fitZoom - 0.04 - end : 0;
      this.effectiveTransitions.set(region.id, [start + shift, end + shift]);
      const emphasis = this.regionEmphasis.get(region.id);
      if (emphasis) emphasis.zoomOffset = start + shift - 5.6;
    }
  }

  private markTexturePrepared(id: string, kind: "texture" | "context") {
    if (this.disposed) return;
    const resource = this.regionResources.get(id)!;
    if (!resource[kind]) return;
    if (kind === "texture") resource.textureReadyAt = performance.now();
    else resource.contextReadyAt = performance.now();
    this.animateLoadedTextures();
  }

  private scheduleRegionRefresh() {
    if (this.disposed || !this.detailsReady || this.refreshTimer) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      this.refreshVisibleRegions();
    }, 100);
  }

  private refreshVisibleRegions() {
    if (this.disposed || !this.detailsReady || !this.map.getSize()) return;
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    this.updateResponsiveTransitions();
    const extent = this.view.calculateExtent(this.map.getSize());
    const focused = this.activeRegion?.available
      ? this.regionsById.get(this.activeRegion.id)
      : undefined;
    const zoom = this.view.getZoom() ?? 4;
    this.wantedContexts = new Set(
      (focused?.neighbors || []).filter((id) => {
        const region = this.regionsById.get(id);
        if (!region || region.id === focused?.id) return false;
        return (
          this.provinceByCode
            .get(region.adcode)
            ?.getGeometry()
            ?.intersectsExtent(extent) ?? intersects(region.extent, extent)
        );
      }),
    );
    this.wantedRegions = new Set(
      focused ? [focused.id, ...this.wantedContexts] : [],
    );
    this.wantedCounties = new Set(
      focused &&
        this.showBoundaries &&
        focused.counties &&
        zoom > 8.3 + this.regionZoomOffset(focused)
        ? [focused.id]
        : [],
    );
    this.setRoleTargets(focused?.id);
    this.selectContextLabels(extent);
    const keys = new Set<string>();
    if (focused) {
      if (this.showPlanning) keys.add(focused.id + ":texture");
      keys.add(focused.id + ":cities");
      if (this.wantedCounties.has(focused.id))
        keys.add(focused.id + ":counties");
    }
    if (this.showPlanning)
      for (const id of this.wantedContexts) {
        if (
          !this.regionResources.get(id)!.texture &&
          this.regionsById.get(id)!.contextImage
        )
          keys.add(id + ":context");
      }
    this.assetQueue.retain(keys);
    if (focused) {
      this.primeRegion(focused);
      if (this.wantedCounties.has(focused.id))
        this.requestRegionResource(focused, "counties", 2);
    }
    for (const id of this.wantedContexts) {
      const region = this.regionsById.get(id)!,
        resource = this.regionResources.get(id)!;
      resource.lastUsed = performance.now();
      // A low-resolution neighbor never starts a high-resolution or administrative request.
      if (this.showPlanning && !resource.texture && region.contextImage)
        this.requestRegionResource(region, "context", 10);
    }
    for (const [id, resource] of this.regionResources)
      this.mountRegionGeometry(id, resource);
    this.trimRegionCache();
    this.updateDetailOpacity();
    this.invalidatePresentation();
  }

  private primeRegion(region: RegionDefinition) {
    this.wantedRegions.add(region.id);
    this.regionResources.get(region.id)!.lastUsed = performance.now();
    if (this.showPlanning) this.requestRegionResource(region, "texture", 0);
    this.requestRegionResource(region, "cities", 1);
  }

  private setRoleTargets(focusedId?: string) {
    const now = performance.now();
    this.advanceRoleWeights(now);
    let changed = false;
    for (const region of this.regions) {
      const role = this.roleTransitions.get(region.id)!,
        current = this.regionEmphasis.get(region.id)!;
      const focus = region.id === focusedId ? 1 : 0;
      const context = this.wantedContexts.has(region.id) ? 1 : 0;
      if (role.focus === focus && role.context === context) continue;
      this.roleTransitions.set(region.id, {
        fromFocus: current.focus,
        fromContext: current.context,
        focus,
        context,
        startedAt: now,
      });
      changed = true;
    }
    if (changed) this.animateLoadedTextures();
  }

  private advanceRoleWeights(now = performance.now()) {
    const overview = !this.activeRegion?.available;
    this.overviewEmphasis.overview = overview;
    let fading = false;
    for (const [id, transition] of this.roleTransitions) {
      const mix = this.reduced ? 1 : smooth((now - transition.startedAt) / 450);
      const emphasis = this.regionEmphasis.get(id)!;
      emphasis.focus =
        transition.fromFocus * (1 - mix) + transition.focus * mix;
      emphasis.context =
        transition.fromContext * (1 - mix) + transition.context * mix;
      emphasis.overview = overview;
      if (
        mix < 1 &&
        (transition.fromFocus !== transition.focus ||
          transition.fromContext !== transition.context)
      )
        fading = true;
    }
    return fading;
  }

  private selectContextLabels(extent: Extent) {
    const center = [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2];
    const chosen = new Set<PlaceFeature>();
    const minSpacing = (this.view.getResolution() || 1) * 110;
    for (const id of this.wantedContexts) {
      const candidates = (this.cityPlacesByRegion.get(id) || [])
        .filter((feature) => {
          const [x, y] = feature.getGeometry()!.getCoordinates();
          return (
            x >= extent[0] && x <= extent[2] && y >= extent[1] && y <= extent[3]
          );
        })
        .sort((a, b) => {
          const priority =
            Number(Boolean(b.get("capital"))) -
            Number(Boolean(a.get("capital")));
          const distance = (feature: PlaceFeature) => {
            const p = feature.getGeometry()!.getCoordinates();
            return (p[0] - center[0]) ** 2 + (p[1] - center[1]) ** 2;
          };
          return priority || distance(a) - distance(b);
        });
      const selected: PlaceFeature[] = [];
      for (const feature of candidates) {
        const p = feature.getGeometry()!.getCoordinates();
        if (
          selected.some((other) => {
            const q = other.getGeometry()!.getCoordinates();
            return Math.hypot(p[0] - q[0], p[1] - q[1]) < minSpacing;
          })
        )
          continue;
        selected.push(feature);
        chosen.add(feature);
        if (selected.length === 2) break;
      }
    }
    for (const feature of this.contextLabelFeatures)
      if (!chosen.has(feature)) feature.set("contextLabel", false, true);
    for (const feature of chosen) feature.set("contextLabel", true, true);
    this.contextLabelFeatures = chosen;
  }

  private invalidatePresentation() {
    this.cityBoundaryLayer.changed();
    this.countyBoundaryLayer.changed();
    this.borderLayer.changed();
    this.labelLayer.changed();
    this.cityMarkerLayer.changed();
  }

  private requestRegionResource(
    region: RegionDefinition,
    kind: ResourceKind,
    priority: number,
  ) {
    const resource = this.regionResources.get(region.id)!;
    if (kind === "context" && !region.contextImage) return;
    if (resource[kind]) return;
    if (resource.pending.has(kind)) {
      this.assetQueue.prioritize(`${region.id}:${kind}`, priority);
      return;
    }
    if (performance.now() - (resource.failures.get(kind) ?? -Infinity) < 15000)
      return;
    resource.pending.add(kind);
    const imageKind = kind === "texture" || kind === "context";
    const filename =
      kind === "texture"
        ? region.image
        : kind === "context"
          ? region.contextImage!
          : region[kind]!;
    this.assetQueue
      .enqueue<DecodedMapImage | FeatureCollection>(
        `${region.id}:${kind}`,
        priority,
        (signal) =>
          imageKind
            ? decodeMapImage(this.assetBase + filename, signal)
            : readMapJSON<FeatureCollection>(this.assetBase + filename, signal),
      )
      .then((value) => {
        if (this.disposed) {
          if (imageKind) (value as DecodedMapImage).dispose();
          return;
        }
        if (kind === "texture" || kind === "context") {
          resource[kind] = value as DecodedMapImage;
          // The renderer starts the clock only after this image is actually drawable.
          if (kind === "texture") resource.textureReadyAt = Infinity;
          else resource.contextReadyAt = Infinity;
          const image = resource[kind]!.image;
          (kind === "texture" ? this.regionLayers : this.contextLayers)
            .get(region.id)!
            .setSource(
              new ImageSource({
                projection: "EPSG:3857",
                interpolate: true,
                loader: () => staticMapImage(image, region.extent),
              }),
            );
          this.animateLoadedTextures();
        } else {
          resource[kind] = format
            .readFeatures(value as FeatureCollection, {
              featureProjection: "EPSG:3857",
            })
            .map((feature, index) => {
              feature.setProperties(
                {
                  regionId: region.id,
                  regionName: region.name,
                  tintIndex: index % CITY_TINTS.length,
                  zoomOffset: this.regionZoomOffset(region),
                },
                true,
              );
              if (kind === "cities") {
                const place = this.cityPlaceByCode.get(
                  placeKey(region.id, feature.get("adcode")),
                );
                if (place && !place.get("indexedAreaCenter"))
                  place.set(
                    "areaCenter",
                    this.interiorPoint(feature.getGeometry()!),
                  );
              }
              return feature;
            });
        }
        this.mountRegionGeometry(region.id, resource);
        this.emit("detailchange", { regionId: region.id, resource: kind });
      })
      .catch((cause: unknown) => {
        if (
          this.disposed ||
          (cause instanceof DOMException && cause.name === "AbortError")
        )
          return;
        resource.failures.set(kind, performance.now());
        this.emit("asseterror", {
          regionId: region.id,
          resource: kind,
          message: cause instanceof Error ? cause.message : "地图细节加载失败",
        });
      })
      .finally(() => {
        resource.pending.delete(kind);
        if (!this.disposed) this.scheduleRegionRefresh();
      });
  }

  private mountRegionGeometry(id: string, resource: RegionResources) {
    for (const kind of ["cities", "counties"] as const) {
      const source = kind === "cities" ? this.citySource : this.countySource;
      const mountedKey =
        kind === "cities" ? "citiesMounted" : "countiesMounted";
      // Invisible city polygons still support clicking an entire city area.
      const wanted =
        kind === "cities"
          ? this.activeRegion?.id === id ||
            (this.regionEmphasis.get(id)?.focus || 0) > 0.001
          : this.showBoundaries &&
            (this.wantedCounties.has(id) ||
              (this.activeRegion?.id !== id &&
                resource.countiesMounted &&
                (this.regionEmphasis.get(id)?.focus || 0) > 0.001));
      if (resource[kind] && resource[mountedKey] !== wanted) {
        if (wanted) source.addFeatures(resource[kind]);
        else source.removeFeatures(resource[kind]);
        resource[mountedKey] = wanted;
      }
    }
  }

  private trimRegionCache() {
    const loaded = [...this.regionResources.entries()].filter(
      ([, resource]) =>
        resource.texture ||
        resource.context ||
        resource.cities ||
        resource.counties,
    );
    const removable = loaded
      .filter(
        ([id, resource]) =>
          !this.wantedRegions.has(id) &&
          (this.regionEmphasis.get(id)?.focus || 0) < 0.001 &&
          (this.regionEmphasis.get(id)?.context || 0) < 0.001 &&
          !resource.pending.size &&
          (!resource.texture ||
            !Number.isFinite(resource.textureReadyAt) ||
            performance.now() - resource.textureReadyAt > 450) &&
          (!resource.context ||
            !Number.isFinite(resource.contextReadyAt) ||
            performance.now() - resource.contextReadyAt > 450),
      )
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    let count = loaded.length;
    for (const [id, resource] of removable) {
      if (count <= 8) break;
      for (const layers of [this.regionLayers, this.contextLayers]) {
        const layer = layers.get(id)!;
        layer.setVisible(false);
        const source = layer.getSource();
        layer.setSource(null);
        source?.dispose();
      }
      resource.texture?.dispose();
      resource.context?.dispose();
      resource.texture = undefined;
      resource.context = undefined;
      resource.cities = undefined;
      resource.counties = undefined;
      count--;
    }
    this.target.dataset.loadedRegions = String(
      [...this.regionResources.values()].filter((r) => r.texture).length,
    );
    this.target.dataset.loadedContextRegions = String(
      [...this.regionResources.values()].filter((r) => r.context).length,
    );
  }

  private animateLoadedTextures() {
    if (this.disposed || this.fadeFrame !== undefined) return;
    const frame = () => {
      this.fadeFrame = undefined;
      if (this.disposed) return;
      this.updateDetailOpacity();
      this.invalidatePresentation();
      for (const [id, resource] of this.regionResources)
        this.mountRegionGeometry(id, resource);
      const fading =
        this.advanceRoleWeights() ||
        [...this.regionResources.values()].some(
          (resource) =>
            (resource.texture &&
              Number.isFinite(resource.textureReadyAt) &&
              performance.now() - resource.textureReadyAt < 400) ||
            (resource.context &&
              Number.isFinite(resource.contextReadyAt) &&
              performance.now() - resource.contextReadyAt < 400),
        );
      if (fading) this.fadeFrame = requestAnimationFrame(frame);
      else this.trimRegionCache();
    };
    this.fadeFrame = requestAnimationFrame(frame);
  }

  /** Diagnostic snapshot for local motion/network review; does not expose or change the view. */
  getLoadingState() {
    const fullTextures = [...this.regionResources]
      .filter(([, r]) => r.texture)
      .map(([id]) => id);
    const drawableTextures = [...this.regionResources]
      .filter(([, r]) => r.texture && Number.isFinite(r.textureReadyAt))
      .map(([id]) => id);
    const contextTextures = [...this.regionResources]
      .filter(([, r]) => r.context)
      .map(([id]) => id);
    const active = this.activeRegion?.available
      ? this.activeRegion.id
      : undefined;
    const resource = active ? this.regionResources.get(active) : undefined;
    const cityDetail = this.cityDetails?.getState();
    const countyDetail = this.countyDetails?.getState();
    return {
      ...this.assetQueue.getState(),
      wanted: [...this.wantedRegions],
      textures: drawableTextures,
      fullTextures,
      contextTextures,
      wantedFull: active ? [active] : [],
      wantedContext: [...this.wantedContexts],
      contextFullReuse: [...this.wantedContexts].filter(
        (id) => this.regionResources.get(id)?.texture,
      ),
      targetReady:
        (!active ||
          Boolean(
            (!this.showPlanning ||
              (resource?.texture &&
                Number.isFinite(resource.textureReadyAt))) &&
            resource?.cities,
          )) &&
        (!cityDetail?.id || cityDetail.ready) &&
        (!countyDetail?.id || countyDetail.ready),
      effectiveTransitionZoom: active
        ? this.effectiveTransitions.get(active)
        : undefined,
      roles: Object.fromEntries(
        [...this.regionEmphasis]
          .filter(
            ([id, role]) =>
              this.wantedRegions.has(id) ||
              role.focus > 0.001 ||
              role.context > 0.001,
          )
          .map(([id, role]) => [
            id,
            {
              focus: role.focus,
              context: role.context,
              target: this.roleTransitions.get(id)?.focus
                ? "focus"
                : this.roleTransitions.get(id)?.context
                  ? "context"
                  : "retiring",
            },
          ]),
      ),
      cityRegions: [...this.regionResources]
        .filter(([, r]) => r.citiesMounted)
        .map(([id]) => id),
      countyRegions: [...this.regionResources]
        .filter(([, r]) => r.countiesMounted)
        .map(([id]) => id),
      cityDetail,
      countyDetail,
    };
  }

  interiorPoint(geometry: Geometry): Point {
    const polygon =
      geometry instanceof MultiPolygon
        ? geometry
            .getPolygons()
            .reduce((largest, p) =>
              p.getArea() > largest.getArea() ? p : largest,
            )
        : (geometry as Polygon);
    return new Point(polygon.getInteriorPoint().getCoordinates().slice(0, 2));
  }
  updateDetailOpacity() {
    if (!this.detailsReady) return;
    this.advanceRoleWeights();
    const zoom = this.view.getZoom() ?? 4,
      now = performance.now();
    const active =
      this.activeRegion && this.regionsById.get(this.activeRegion.id);
    const zoomMix = (region: RegionDefinition) => {
      const [start, end] =
        this.effectiveTransitions.get(region.id) ||
        region.transitionZoom ||
        this.styleA.transitionZoom;
      return smooth((zoom - start) / (end - start));
    };
    const activeMix = active ? zoomMix(active) : 0;
    let visibleFocus = 0,
      retiringFocus = 0;
    for (const region of this.regions) {
      const resource = this.regionResources.get(region.id)!,
        role = this.regionEmphasis.get(region.id)!;
      const mix = zoomMix(region);
      const opacity =
        role.focus * mix + role.context * 0.28 * (active ? activeMix : mix);
      const fullMix = resource.texture
        ? this.reduced
          ? 1
          : smooth((now - resource.textureReadyAt) / 400)
        : 0;
      const contextMix = resource.context
        ? this.reduced
          ? 1
          : smooth((now - resource.contextReadyAt) / 400)
        : 0;
      const fullOpacity = opacity * fullMix;
      // Preserve total opacity while the same geographic texture changes resolution.
      const contextOpacity =
        fullOpacity >= 0.999999
          ? 0
          : Math.max(
              0,
              (opacity * contextMix - fullOpacity) / (1 - fullOpacity),
            );
      const allowed =
        this.showPlanning && !(this.original && region.id === "hubei");
      const fullLayer = this.regionLayers.get(region.id)!,
        contextLayer = this.contextLayers.get(region.id)!;
      fullLayer.setOpacity(fullOpacity);
      fullLayer.setVisible(
        allowed && Boolean(resource.texture) && opacity > 0.001,
      );
      contextLayer.setOpacity(contextOpacity);
      contextLayer.setVisible(
        allowed &&
          Boolean(resource.context) &&
          opacity > 0.001 &&
          (contextOpacity > 0.001 || !Number.isFinite(resource.contextReadyAt)),
      );
      if (allowed)
        visibleFocus = Math.max(
          visibleFocus,
          role.focus * mix * Math.max(fullMix, contextMix),
        );
      retiringFocus = Math.max(retiringFocus, role.focus * mix);
    }
    this.detailMix = active ? activeMix : retiringFocus;
    this.nationalLayer.setOpacity(1 - 0.32 * visibleFocus);
    this.surroundingContext.update(this.detailMix, this.showLabels);
    this.borderLayer.setOpacity(1);
    this.target.dataset.detailOpacity = this.detailMix.toFixed(3);
    this.cityDetails?.updatePresentation();
    this.countyDetails?.updatePresentation();
  }

  handleClick(e: { pixel: Pixel; coordinate: Coordinate }) {
    if (!this.administrativeNavigation) {
      this.emit("mapclick", { coordinate: toLonLat(e.coordinate) });
      return;
    }
    // Keep camera gestures separate from explicit selection. Only configured
    // child regions drill down; clicking another area can return to its parent.
    if (this.countyDetails?.contains(e.coordinate)) {
      this.emit("mapclick", { coordinate: toLonLat(e.coordinate) });
      return;
    }
    const county = this.clickableCounty(e.pixel, e.coordinate);
    if (county) {
      if (this.countyDetails?.getActive()?.id !== county.id)
        this.fitCounty(county.id);
      return;
    }
    if (this.cityDetails?.contains(e.coordinate)) {
      if (this.countyDetails?.getActive())
        this.fitCity(this.cityDetails.getActive()!.id);
      else this.emit("mapclick", { coordinate: toLonLat(e.coordinate) });
      return;
    }
    const city = this.clickableCity(e.pixel, e.coordinate);
    if (city) {
      if (this.cityDetails?.getActive()?.id !== city.id) this.fitCity(city.id);
      return;
    }
    const province = this.clickableProvince(e.pixel, e.coordinate);
    if (province) {
      this.fitProvince(province);
      return;
    }
    this.emit("mapclick", { coordinate: toLonLat(e.coordinate) });
  }
  private clickableCounty(pixel: Pixel, coordinate: Coordinate) {
    const adcode = this.cityDetails?.subdivisionAt(pixel, coordinate);
    return this.countyDetails?.definitions.find(
      (county) =>
        county.parentId === this.cityDetails?.getActive()?.id &&
        county.adcode === adcode,
    );
  }
  private clickableCity(pixel: Pixel, coordinate: Coordinate) {
    const candidates = this.cityDetails?.definitions.filter(
      (city) => city.parentId === this.activeRegion?.id,
    );
    if (!candidates?.length) return undefined;
    const matching = (feature: MapFeature) =>
      candidates.find((city) => city.adcode === Number(feature.get("adcode")));
    const labelHit = this.map.forEachFeatureAtPixel(
      pixel,
      (feature) => matching(feature as MapFeature),
      {
        layerFilter: (layer) =>
          layer === this.labelLayer || layer === this.cityMarkerLayer,
        hitTolerance: 4,
      },
    );
    return (
      labelHit ||
      this.citySource
        .getFeaturesAtCoordinate(coordinate)
        .map(matching)
        .find(Boolean)
    );
  }
  provinceAt(coordinate: Coordinate) {
    return this.provinceSource
      ?.getFeaturesAtCoordinate(coordinate)
      .find((feature) =>
        this.regionsByAdcode.has(Number(feature.get("adcode"))),
      );
  }
  private clickableProvince(pixel: Pixel, coordinate: Coordinate) {
    const province = this.provinceAt(coordinate);
    if (province) return province;
    // Text may extend beyond a coastline or a tiny island. Its hit area selects
    // the same province as its geography, rather than starting a city drill-down.
    return this.map.forEachFeatureAtPixel(
      pixel,
      (feature) => {
        const region =
          this.regionsById.get(feature.get("regionId")) ||
          this.regionsByAdcode.get(Number(feature.get("adcode")));
        return region ? this.provinceByCode.get(region.adcode) : undefined;
      },
      {
        layerFilter: (layer) =>
          layer === this.labelLayer ||
          layer === this.cityMarkerLayer ||
          layer === this.provinceLayer,
        hitTolerance: 3,
      },
    );
  }
  regionForProvince(feature?: MapFeature): RegionInfo | null {
    if (!feature) return null;
    const adcode = Number(feature.get("adcode"));
    return (
      this.regionsByAdcode.get(adcode) || {
        id: `province-${adcode}`,
        name: feature.get("name"),
        adcode,
        available: false,
      }
    );
  }
  setActiveRegion(region: RegionInfo | null | undefined) {
    this.countyDetails?.clear();
    this.cityDetails?.clear();
    const changed = this.activeRegion?.id !== region?.id;
    this.activeRegion = region || null;
    if (this.original && region?.id !== "hubei") this.setOriginal(false);
    if (changed)
      this.emit(
        "regionchange",
        region
          ? {
              id: region.id,
              name: region.name,
              adcode: region.adcode,
              available: region.available,
            }
          : { id: "national", name: "全国", adcode: 100000, available: true },
      );
    this.refreshVisibleRegions();
  }
  duration(animate = true) {
    return animate && !this.reduced ? 1150 : 0;
  }
  fitExtent(extent: Extent, animate = true, maxZoom = 14) {
    this.view.cancelAnimations();
    this.view.fit(extent, {
      padding: [55, 22, 42, 22],
      duration: this.duration(animate),
      easing: ease,
      maxZoom,
    });
  }
  fitRegion(id: string, animate = true) {
    const region = this.regionsById.get(id),
      province = region && this.provinceByCode.get(region.adcode);
    if (!province) return false;
    this.setActiveRegion(region!);
    this.primeRegion(region!);
    this.fitExtent(
      region!.focusExtent || province.getGeometry()!.getExtent(),
      animate,
      region!.maxZoom ?? 14,
    );
    this.emit("locationchange", {
      id: region!.id,
      name: region!.name,
      adcode: region!.adcode,
      level: "province",
    });
    this.emit("navigationchange", this.getNavigationState());
    return true;
  }
  fitCity(id: string, animate = true) {
    const city = this.cityDetails?.getDefinition(id);
    const parent = city && this.activateCity(city);
    if (!city || !parent) return false;
    this.fitExtent(city.focusExtent || city.extent, animate, city.maxZoom);
    this.emit("locationchange", {
      id: city.id,
      name: city.name,
      adcode: city.adcode,
      level: "city",
      regionName: parent.name,
      regionAdcode: parent.adcode,
    });
    this.emit("navigationchange", this.getNavigationState());
    return true;
  }
  private activateCity(city: DetailDefinition) {
    const province = this.regionsById.get(city.provinceId);
    if (!province) return undefined;
    this.countyDetails?.clear();
    if (
      this.activeRegion?.id !== province.id ||
      this.cityDetails?.getActive()?.id !== city.id
    ) {
      this.setActiveRegion(province);
      if (this.original) this.setOriginal(false);
      this.cityDetails!.select(city.id);
    }
    this.primeRegion(province);
    this.invalidatePresentation();
    return province;
  }
  fitCounty(id: string, animate = true) {
    const county = this.countyDetails?.getDefinition(id);
    const city = county && this.cityDetails?.getDefinition(county.parentId);
    if (!county || !city) return false;
    if (
      this.cityDetails?.getActive()?.id !== city.id &&
      !this.activateCity(city)
    )
      return false;
    this.countyDetails!.select(id);
    this.fitExtent(
      county.focusExtent || county.extent,
      animate,
      county.maxZoom,
    );
    this.emit("locationchange", {
      id: county.id,
      name: county.name,
      adcode: county.adcode,
      level: "county",
      regionName: this.activeRegion?.name,
      regionAdcode: this.activeRegion?.adcode,
    });
    this.emit("navigationchange", this.getNavigationState());
    return true;
  }
  fitLocation(id: string, animate = true) {
    if (id === "national") {
      this.fitNational(animate);
      return true;
    }
    return (
      this.fitCounty(id, animate) ||
      this.fitCity(id, animate) ||
      this.fitRegion(id, animate)
    );
  }
  /** Warm parent resources and cache destination geometry/artwork without
   * changing selection, mounting a detail layer, or moving the camera.
   */
  preloadLocation(id: string): Promise<void> {
    if (id === "national") return Promise.resolve();
    const pending = this.locationPreloads.get(id);
    if (pending) return pending;
    const county = this.countyDetails?.getDefinition(id);
    const city = this.cityDetails?.getDefinition(county?.parentId || id);
    const region = this.regionsById.get(
      county?.provinceId || city?.provinceId || id,
    );
    if (!region) return Promise.resolve();
    const request = Promise.all([
      preloadMapImage(
        this.assetBase + region.image,
        this.abortController.signal,
      ),
      readMapJSON(this.assetBase + region.cities, this.abortController.signal),
      region.counties
        ? readMapJSON(
            this.assetBase + region.counties,
            this.abortController.signal,
          )
        : undefined,
      city ? this.cityDetails?.preload(city.id) : undefined,
      county ? this.countyDetails?.preload(county.id) : undefined,
    ])
      .then(() => undefined)
      .catch((error) => {
        this.locationPreloads.delete(id);
        throw error;
      });
    this.locationPreloads.set(id, request);
    return request;
  }
  /** Select and start normal resource loading, leaving the current pose intact.
   * Applications can then animate once to their own panel-aware framing.
   */
  selectLocation(id: string): boolean {
    if (id === "national") {
      this.setActiveRegion(null);
      this.emit("locationchange", {
        id,
        name: "全国",
        adcode: 100000,
        level: "national",
      });
    } else {
      const county = this.countyDetails?.getDefinition(id);
      const city = this.cityDetails?.getDefinition(county?.parentId || id);
      if (county && city) {
        if (
          this.cityDetails?.getActive()?.id !== city.id &&
          !this.activateCity(city)
        )
          return false;
        if (this.countyDetails?.getActive()?.id !== county.id)
          this.countyDetails!.select(county.id);
        this.emit("locationchange", {
          id: county.id,
          name: county.name,
          adcode: county.adcode,
          level: "county",
          regionName: this.activeRegion?.name,
          regionAdcode: this.activeRegion?.adcode,
        });
      } else if (city) {
        const parent = this.activateCity(city);
        if (!parent) return false;
        this.emit("locationchange", {
          id: city.id,
          name: city.name,
          adcode: city.adcode,
          level: "city",
          regionName: parent.name,
          regionAdcode: parent.adcode,
        });
      } else {
        const region = this.regionsById.get(id);
        if (!region || !this.provinceByCode.has(region.adcode)) return false;
        this.setActiveRegion(region);
        this.primeRegion(region);
        this.emit("locationchange", {
          id: region.id,
          name: region.name,
          adcode: region.adcode,
          level: "province",
        });
      }
    }
    this.emit("navigationchange", this.getNavigationState());
    return true;
  }
  /** Use the same panel-aware viewport for detail fades as for camera fitting.
   * Omit padding to restore the original embedded-map framing semantics.
   */
  setDetailViewportPadding(padding?: readonly number[]) {
    this.cityDetails?.setViewportPadding(padding);
    this.countyDetails?.setViewportPadding(padding);
  }
  /** Let an application scene handle business markers without also drilling into a province. */
  setAdministrativeNavigation(enabled: boolean) {
    this.administrativeNavigation = enabled;
  }
  getNavigationState(): MapNavigation {
    const county = this.countyDetails?.getActive();
    if (county)
      return {
        id: county.id,
        name: county.name,
        level: "county",
        parentId: county.parentId,
        parentName: county.parentName,
      };
    const city = this.cityDetails?.getActive();
    if (city)
      return {
        id: city.id,
        name: city.name,
        level: "city",
        parentId: city.parentId,
        parentName: city.parentName,
      };
    if (this.activeRegion)
      return {
        id: this.activeRegion.id,
        name: this.activeRegion.name,
        level: "province",
        parentId: "national",
        parentName: "全国",
      };
    return { id: "national", name: "全国", level: "national" };
  }
  fitParent(animate = true) {
    const county = this.countyDetails?.getActive();
    if (county) return this.fitCity(county.parentId, animate);
    const city = this.cityDetails?.getActive();
    if (city) return this.fitRegion(city.parentId, animate);
    this.fitNational(animate);
    return true;
  }
  fitHubei(animate = true) {
    return this.fitRegion("hubei", animate);
  }
  fitNational(animate = true) {
    this.setActiveRegion(null);
    this.fitExtent(
      transformExtent([73, 16.8, 135.2, 54], "EPSG:4326", "EPSG:3857"),
      animate,
    );
    this.emit("locationchange", {
      id: "national",
      name: "全国",
      adcode: 100000,
      level: "national",
    });
    this.emit("navigationchange", this.getNavigationState());
  }
  fitProvince(feature: MapFeature, animate = true) {
    const region = this.regionForProvince(feature);
    if (!region) return false;
    if (region.available) return this.fitRegion(region.id, animate);
    this.setActiveRegion(region);
    this.fitExtent(feature.getGeometry()!.getExtent(), animate);
    this.emit("locationchange", { ...region, level: "province" });
    this.emit("navigationchange", this.getNavigationState());
    return true;
  }
  getRegions() {
    return this.regions.map((region) => ({
      ...region,
      extent: [...region.extent],
      focusExtent: region.focusExtent ? [...region.focusExtent] : undefined,
      neighbors: region.neighbors ? [...region.neighbors] : undefined,
      transitionZoom: region.transitionZoom
        ? ([...region.transitionZoom] as [number, number])
        : undefined,
      capitalCenter: region.capitalCenter
        ? [...region.capitalCenter]
        : undefined,
    }));
  }
  getActiveRegion() {
    const active = this.activeRegion;
    return active?.available
      ? this.getRegions().find((region) => region.id === active.id) || null
      : null;
  }
  focusPlace(feature: PlaceFeature) {
    if (feature.get("level") === "province") {
      const province = this.provinceByCode.get(Number(feature.get("adcode")));
      if (province) this.fitProvince(province);
      return;
    }
    const county = this.countyDetails?.definitions.find(
      (definition) => definition.adcode === Number(feature.get("adcode")),
    );
    if (county) {
      this.fitCounty(county.id);
      return;
    }
    const city = this.cityDetails?.definitions.find(
      (definition) => definition.adcode === Number(feature.get("adcode")),
    );
    if (city) {
      this.fitCity(city.id);
      return;
    }
    const region = this.regionsById.get(feature.get("regionId"));
    if (region) this.setActiveRegion(region);
    if (region) this.primeRegion(region);
    this.emit("navigationchange", this.getNavigationState());
    this.view.cancelAnimations();
    this.view.animate({
      center: feature.getGeometry()!.getCoordinates(),
      zoom: Math.min(
        region?.maxZoom ?? 16,
        feature.get("level") === "county"
          ? (region?.countyFocusZoom ??
              10 + (region ? this.regionZoomOffset(region) : 0))
          : (region?.cityFocusZoom ??
              8.8 + (region ? this.regionZoomOffset(region) : 0)),
      ),
      duration: this.duration(),
      easing: ease,
    });
    this.emit("locationchange", {
      id: region?.id,
      name: feature.get("name"),
      adcode: feature.get("adcode"),
      level: feature.get("level"),
      regionName: region?.name,
      regionAdcode: region?.adcode,
    });
  }
  search(query: string) {
    const q = normalizePlaceQuery(query);
    const searchText = (feature: PlaceFeature) => {
      let cached = this.searchTextCache.get(feature);
      if (!cached) {
        cached = {
          names: [feature.get("name"), feature.get("fullName")]
            .filter(Boolean)
            .map(normalizePlaceQuery),
          region: normalizePlaceQuery(feature.get("regionName") || ""),
        };
        this.searchTextCache.set(feature, cached);
      }
      return cached;
    };
    const score = (feature: PlaceFeature) => {
      const values = searchText(feature).names;
      return values.some((name) => name === q)
        ? 0
        : values.some((name) => name.startsWith(q))
          ? 1
          : values.some((name) => name.includes(q))
            ? 2
            : 3;
    };
    return this.places
      .filter(
        (f) =>
          !q ||
          searchText(f).names.some((name) => name.includes(q)) ||
          searchText(f).region.includes(q),
      )
      .sort(
        (a, b) =>
          score(a) - score(b) ||
          (a.get("level") === "province" ? -1 : 0) -
            (b.get("level") === "province" ? -1 : 0),
      )
      .slice(0, 12);
  }
  emitLayers() {
    this.cityDetails?.updatePresentation();
    this.countyDetails?.updatePresentation();
    const state = this.getLayerState();
    this.emit("layerschange", state);
    this.emit("layerchange", state);
  }
  setLabels(value: boolean) {
    this.showLabels = !!value;
    this.surroundingContext.update(this.detailMix, this.showLabels);
    this.labelLayer.changed();
    this.cityMarkerLayer.changed();
    this.emitLayers();
  }
  setBoundaries(value: boolean) {
    this.showBoundaries = !!value;
    this.cityBoundaryLayer.changed();
    this.countyBoundaryLayer.changed();
    this.refreshVisibleRegions();
    this.emitLayers();
  }
  setTownships(value: boolean) {
    this.showTownships = !!value;
    this.emitLayers();
  }
  setPlanning(value: boolean) {
    this.showPlanning = !!value;
    this.originalLayer.setVisible(this.showPlanning && this.original);
    this.refreshVisibleRegions();
    this.emitLayers();
  }
  setOriginal(value: boolean) {
    this.original =
      !!value &&
      this.activeRegion?.id === "hubei" &&
      !this.cityDetails?.getActive();
    this.setPlanning(this.showPlanning);
    this.cityBoundaryLayer.changed();
    this.countyBoundaryLayer.changed();
    this.labelLayer.changed();
    this.cityMarkerLayer.changed();
    return this.original;
  }
  getLayerState(): MapLayerState {
    return {
      labels: this.showLabels,
      boundaries: this.showBoundaries,
      townships: this.showTownships,
      townshipsAvailable: Boolean(
        this.countyDetails?.getActive()?.subdivisionOverlay,
      ),
      planning: this.showPlanning,
      original: this.original,
      originalAvailable:
        this.activeRegion?.id === "hubei" && !this.cityDetails?.getActive(),
    };
  }
  zoomBy(delta: number) {
    this.view.cancelAnimations();
    this.view.animate({
      zoom: Math.max(
        2,
        Math.min(this.view.getMaxZoom(), (this.view.getZoom() ?? 4) + delta),
      ),
      duration: this.reduced ? 0 : 250,
    });
  }
  setBusinessData(geojson: GeoJsonObject) {
    this.businessSource.clear();
    this.businessSource.addFeatures(
      format.readFeatures(geojson, { featureProjection: "EPSG:3857" }),
    );
  }
  getViewState(): MapViewState {
    return {
      center: toLonLat(this.view.getCenter()!),
      zoom: this.view.getZoom() ?? 4,
      resolution: this.view.getResolution()!,
      detailOpacity: this.detailMix || 0,
      activeRegionId: this.activeRegion?.id || null,
      activeCityId: this.cityDetails?.getActive()?.id || null,
      activeCountyId: this.countyDetails?.getActive()?.id || null,
    };
  }
  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.abortController.abort();
    this.countyDetails?.destroy();
    this.cityDetails?.destroy();
    this.assetQueue.destroy();
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    if (this.fadeFrame !== undefined) cancelAnimationFrame(this.fadeFrame);
    for (const [id, resource] of this.regionResources) {
      for (const layers of [this.regionLayers, this.contextLayers]) {
        const layer = layers.get(id);
        const source = layer?.getSource();
        layer?.setSource(null);
        source?.dispose();
      }
      resource.texture?.dispose();
      resource.context?.dispose();
    }
    this.attribution.dispose();
    this.observer.disconnect();
    this.view.cancelAnimations();
    this.map.setTarget(undefined);
    this.map.dispose();
  }
}
