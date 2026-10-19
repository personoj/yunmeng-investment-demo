import type OLMap from "ol/Map.js";
import Feature from "ol/Feature.js";
import GeoJSON from "ol/format/GeoJSON.js";
import Point from "ol/geom/Point.js";
import Polygon from "ol/geom/Polygon.js";
import MultiPolygon from "ol/geom/MultiPolygon.js";
import LayerGroup from "ol/layer/Group.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import ImageSource from "ol/source/Image.js";
import Style from "ol/style/Style.js";
import Fill from "ol/style/Fill.js";
import Stroke from "ol/style/Stroke.js";
import TextStyle from "ol/style/Text.js";
import CircleStyle from "ol/style/Circle.js";
import { fromLonLat } from "ol/proj.js";
import { getRenderPixel } from "ol/render.js";
import type RenderEvent from "ol/render/Event.js";
import type { Coordinate } from "ol/coordinate.js";
import type { Pixel } from "ol/pixel.js";
import type { FeatureCollection } from "geojson";
import { StaticTextureLayer } from "./StaticTextureLayer";
import { SubdivisionOverlay } from "./SubdivisionOverlay";
import { decodeMapImage, readMapJSON, staticMapImage } from "./assets";
import type { DecodedMapImage } from "./assets";
import { smooth } from "./utils";
import type {
  DetailDefinition,
  DetailLoadState,
  MapFeature,
  MapLayerState,
  PlaceFeature,
} from "./types";

interface DetailResources {
  definition: DetailDefinition;
  outline: MapFeature;
  subdivisions: MapFeature[];
  overlay: MapFeature[];
  image: DecodedMapImage;
}

/** A city or county owns its artwork, exact clip, subdivisions and loading state. */
export class LocalDetailLayer {
  private readonly abort = new AbortController();
  private readonly cache = new Map<string, DetailResources>();
  private readonly pending = new Map<string, Promise<DetailResources>>();
  private active: DetailDefinition | null = null;
  private displayed?: DetailResources;
  private focusedChild?: number;
  private readonly labelStyles = new Map<number, Style>();
  private state: DetailLoadState = {
    id: null,
    name: "",
    loading: false,
    ready: false,
  };
  private frame?: number;
  private weight = 0;
  private viewportPadding = [55, 22, 42, 22];
  private disposed = false;
  private readonly veil = new VectorLayer<VectorSource<MapFeature>>({
    // Its world-sized polygon is clipped to the renderer's current extent.
    // Reusing an earlier frame's extent exposes a rectangular mask edge while
    // flying toward a detail, so rebuild the fill during camera movement.
    updateWhileAnimating: true,
    updateWhileInteracting: true,
    style: new Style({ fill: new Fill({ color: "rgba(246,247,237,.58)" }) }),
  });
  private readonly ground = new VectorLayer<VectorSource<MapFeature>>({
    updateWhileAnimating: true,
    updateWhileInteracting: true,
    style: new Style({ fill: new Fill({ color: "#edf0d7" }) }),
  });
  private readonly texture: StaticTextureLayer;
  private readonly subdivisionOverlay = new SubdivisionOverlay();
  private readonly subdivisions = new VectorLayer<VectorSource<MapFeature>>({
    updateWhileAnimating: true,
    updateWhileInteracting: true,
    style: new Style({
      stroke: new Stroke({ color: "rgba(83,108,72,.65)", width: 1.1 }),
    }),
  });
  private readonly border = new VectorLayer<VectorSource<MapFeature>>({
    updateWhileAnimating: true,
    updateWhileInteracting: true,
    style: [
      new Style({
        stroke: new Stroke({ color: "rgba(251,251,241,.96)", width: 4.8 }),
      }),
      new Style({ stroke: new Stroke({ color: "#536e49", width: 1.7 }) }),
    ],
  });
  private readonly labels = new VectorLayer<VectorSource<PlaceFeature>>({
    declutter: true,
    updateWhileAnimating: true,
    updateWhileInteracting: true,
    style: (feature) =>
      Number(feature.get("adcode")) === this.focusedChild
        ? undefined
        : this.labelStyles.get(Number(feature.get("adcode"))),
  });
  readonly layer: LayerGroup;

  constructor(
    private readonly map: OLMap,
    readonly definitions: DetailDefinition[],
    private readonly assetBase: string,
    private readonly layerState: () => MapLayerState,
    private readonly onState: (state: DetailLoadState) => void,
    private readonly reduced: boolean,
  ) {
    this.texture = new StaticTextureLayer({}, () => {
      if (this.active?.id === this.displayed?.definition.id) {
        this.report({ loading: false, ready: true });
        this.transitionTo(1);
      }
    });
    // The generated raster is registered to its extent; the GIS polygon
    // supplies the exact edge, independently of imagegen's antialiased silhouette.
    this.texture.on("prerender", (event) => this.clipTexture(event));
    this.texture.on("postrender", (event) => {
      if (event.context && this.displayed)
        (event.context as CanvasRenderingContext2D).restore();
    });
    this.layer = new LayerGroup({
      layers: [
        this.veil,
        this.ground,
        this.texture,
        this.subdivisions,
        this.subdivisionOverlay.layer,
        this.border,
        this.labels,
      ],
      visible: false,
      opacity: 0,
    });
    this.map.addLayer(this.layer);
  }

  getDefinition(id: string) {
    return this.definitions.find((city) => city.id === id);
  }

  getActive() {
    return this.active;
  }

  getState(): DetailLoadState {
    return { ...this.state };
  }

  /** Decode and cache a destination without selecting it or mounting a layer. */
  preload(id: string): Promise<void> {
    const definition = this.getDefinition(id);
    return definition
      ? this.load(definition).then(() => undefined)
      : Promise.resolve();
  }

  /** Match the application's usable focus area; embedded maps keep the
   * original fitExtent padding when no override is supplied.
   */
  setViewportPadding(padding?: readonly number[]) {
    this.viewportPadding =
      padding?.length === 4
        ? padding.map((value) =>
            Number.isFinite(value) ? Math.max(0, value) : 0,
          )
        : [55, 22, 42, 22];
    this.updatePresentation();
  }

  setFocusedChild(adcode?: number) {
    this.focusedChild = adcode;
    this.labels.changed();
  }

  subdivisionAt(pixel: Pixel, coordinate: Coordinate): number | undefined {
    if (!this.active || this.active.id !== this.displayed?.definition.id)
      return undefined;
    const label = this.map.forEachFeatureAtPixel(
      pixel,
      (feature) => Number(feature.get("adcode")),
      {
        layerFilter: (layer) => layer === this.labels,
        hitTolerance: 4,
      },
    );
    if (label) return label;
    return this.subdivisions
      .getSource()
      ?.getFeaturesAtCoordinate(coordinate)
      .map((feature) => Number(feature.get("adcode")))[0];
  }

  contains(coordinate: Coordinate) {
    return (
      this.active?.id === this.displayed?.definition.id &&
      Boolean(
        this.displayed?.outline.getGeometry()?.intersectsCoordinate(coordinate),
      )
    );
  }

  select(id: string) {
    const definition = this.getDefinition(id);
    if (!definition) return;
    this.active = definition;
    this.state = { id, name: definition.name, loading: true, ready: false };
    this.onState(this.getState());
    this.load(definition)
      .then((resource) => {
        if (this.disposed || this.active?.id !== id) return;
        if (this.displayed === resource) {
          this.report({ loading: false, ready: true });
          this.transitionTo(1);
          return;
        }
        this.mount(resource);
      })
      .catch((error: unknown) => {
        if (this.disposed || this.active?.id !== id) return;
        this.report({
          loading: false,
          ready: false,
          error:
            error instanceof Error
              ? error.message
              : `${definition.name}地图加载失败`,
        });
      });
  }

  clear() {
    this.setFocusedChild(undefined);
    if (!this.active) return;
    this.active = null;
    this.state = { id: null, name: "", loading: false, ready: false };
    this.onState(this.getState());
    this.transitionTo(0);
  }

  private report(update: Partial<DetailLoadState>) {
    this.state = { ...this.state, ...update };
    this.onState(this.getState());
  }

  private load(definition: DetailDefinition): Promise<DetailResources> {
    const cached = this.cache.get(definition.id);
    if (cached) return Promise.resolve(cached);
    const pending = this.pending.get(definition.id);
    if (pending) return pending;
    const request = (async () => {
      const [collection, overlayCollection] = await Promise.all([
        readMapJSON<FeatureCollection>(
          this.assetBase + definition.geometry,
          this.abort.signal,
        ),
        definition.subdivisionOverlay
          ? readMapJSON<FeatureCollection>(
              this.assetBase + definition.subdivisionOverlay,
              this.abort.signal,
            )
          : undefined,
      ]);
      const features = new GeoJSON().readFeatures(collection, {
        featureProjection: "EPSG:3857",
      });
      const outline = features.find(
        (f) => Number(f.get("adcode")) === definition.adcode,
      )!;
      const subdivisions = features.filter(
        (f) => Number(f.get("parent")?.adcode) === definition.adcode,
      );
      const image = await decodeMapImage(
        this.assetBase + definition.image,
        this.abort.signal,
      );
      const overlay = overlayCollection
        ? new GeoJSON().readFeatures(overlayCollection, {
            featureProjection: "EPSG:3857",
          })
        : [];
      const resource = { definition, outline, subdivisions, overlay, image };
      this.cache.set(definition.id, resource);
      return resource;
    })().finally(() => this.pending.delete(definition.id));
    this.pending.set(definition.id, request);
    return request;
  }

  private polygons() {
    const geometry = this.displayed?.outline.getGeometry();
    return geometry instanceof MultiPolygon
      ? geometry.getPolygons()
      : geometry instanceof Polygon
        ? [geometry]
        : [];
  }

  private mount(resource: DetailResources) {
    this.displayed = resource;
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.weight = 0;
    const edge = new VectorSource({ features: [resource.outline] });
    this.ground.setSource(edge);
    this.border.setSource(edge);
    this.subdivisions.setSource(
      new VectorSource({ features: resource.subdivisions }),
    );
    this.subdivisionOverlay.setFeatures(resource.overlay);
    const world = 20037508.342789244;
    const mask = new Polygon([
      [
        [-world, -world],
        [world, -world],
        [world, world],
        [-world, world],
        [-world, -world],
      ],
      ...this.polygons().map((p) => p.getCoordinates()[0]),
    ]);
    this.veil.setSource(new VectorSource({ features: [new Feature(mask)] }));
    this.labelStyles.clear();
    const labelFeatures = resource.subdivisions.length
      ? resource.subdivisions
      : [resource.outline];
    const places = labelFeatures.map((county) => {
      const feature: PlaceFeature = new Feature({
        geometry: new Point(fromLonLat(county.get("center"))),
        adcode: county.get("adcode"),
        name: county.get("name"),
      });
      this.labelStyles.set(
        Number(county.get("adcode")),
        new Style({
          text: new TextStyle({
            text: county.get("name"),
            font: '500 14px "Microsoft YaHei", "PingFang SC", sans-serif',
            offsetY: -13,
            padding: [3, 4, 3, 4],
            fill: new Fill({ color: "#405438" }),
            stroke: new Stroke({ color: "rgba(251,251,242,.97)", width: 3.5 }),
          }),
          image: new CircleStyle({
            radius: 2.7,
            fill: new Fill({ color: "#607653" }),
            stroke: new Stroke({ color: "#fbfbf2", width: 1.5 }),
          }),
        }),
      );
      return feature;
    });
    this.labels.setSource(new VectorSource({ features: places }));
    const previous = this.texture.getSource();
    this.texture.setSource(
      new ImageSource({
        projection: "EPSG:3857",
        interpolate: true,
        loader: () =>
          staticMapImage(resource.image.image, resource.definition.extent),
      }),
    );
    previous?.dispose();
    this.layer.setVisible(true);
    this.updatePresentation();
    if (!this.layerState().planning) {
      this.report({ loading: false, ready: true });
      this.transitionTo(1);
    }
  }

  private clipTexture(event: RenderEvent) {
    if (!event.context || !this.displayed) return;
    const context = event.context as CanvasRenderingContext2D;
    context.save();
    context.beginPath();
    for (const polygon of this.polygons()) {
      for (const ring of polygon.getCoordinates()) {
        ring.forEach((coordinate, index) => {
          const pixel = getRenderPixel(
            event,
            this.map.getPixelFromCoordinate(coordinate),
          );
          if (index === 0) context.moveTo(pixel[0], pixel[1]);
          else context.lineTo(pixel[0], pixel[1]);
        });
        context.closePath();
      }
    }
    context.clip("evenodd");
  }

  private transitionTo(target: number) {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    const from = this.weight;
    const start = performance.now();
    const frame = () => {
      this.frame = undefined;
      if (this.disposed) return;
      const mix = this.reduced ? 1 : smooth((performance.now() - start) / 400);
      this.weight = from + (target - from) * mix;
      this.updatePresentation();
      if (mix < 1) this.frame = requestAnimationFrame(frame);
      else if (target === 0) this.layer.setVisible(false);
    };
    this.layer.setVisible(Boolean(this.displayed));
    frame();
  }

  updatePresentation() {
    if (!this.displayed) return;
    const state = this.layerState();
    this.texture.setVisible(state.planning);
    this.ground.setVisible(state.planning);
    this.subdivisions.setVisible(state.boundaries);
    this.border.setVisible(state.boundaries);
    this.labels.setVisible(
      state.labels && !(this.displayed.overlay.length && state.townships),
    );
    this.subdivisionOverlay.updatePresentation(state);
    const size = this.map.getSize();
    if (!size) return;
    const view = this.map.getView();
    const bounds =
      this.displayed.definition.focusExtent ||
      this.displayed.outline.getGeometry()!.getExtent();
    const fitZoom =
      view.getZoomForResolution(
        view.getResolutionForExtent(bounds, [
          Math.max(
            1,
            size[0] - this.viewportPadding[1] - this.viewportPadding[3],
          ),
          Math.max(
            1,
            size[1] - this.viewportPadding[0] - this.viewportPadding[2],
          ),
        ]),
      ) ?? 4;
    const zoomMix = smooth(((view.getZoom() ?? 4) - fitZoom + 1.6) / 1.2);
    // A tiny initial opacity lets StaticTextureLayer prepare the decoded raster
    // before beginning the visible fade, including during camera animation.
    this.layer.setOpacity(
      Math.max(this.active ? 0.001 : 0, this.weight * zoomMix),
    );
  }

  destroy() {
    this.disposed = true;
    this.abort.abort();
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.map.removeLayer(this.layer);
    const source = this.texture.getSource();
    this.texture.setSource(null);
    source?.dispose();
    for (const resource of this.cache.values()) resource.image.dispose();
    this.cache.clear();
    this.layer.getLayers().remove(this.subdivisionOverlay.layer);
    this.subdivisionOverlay.destroy();
    this.layer.getLayers().forEach((layer) => layer.dispose());
    this.layer.dispose();
  }
}
