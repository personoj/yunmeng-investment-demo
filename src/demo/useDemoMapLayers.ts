import { useEffect, useRef } from "react";
import Feature from "ol/Feature.js";
import GeoJSON from "ol/format/GeoJSON.js";
import Point from "ol/geom/Point.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import { Circle, Fill, Stroke, Style, Text } from "ol/style.js";
import { fromLonLat } from "ol/proj.js";
import { unByKey } from "ol/Observable.js";
import type { GeographicPlanningMap } from "../map";
import type { DemoData, NationalMode, Scene } from "./types";
import { portraitForRegion, type RegionPortrait } from "./regionPortraits";

interface PortraitLayerState {
  map: GeographicPlanningMap;
  data: DemoData;
  layer: VectorLayer<VectorSource>;
  source: VectorSource;
  disposed: boolean;
  ready: boolean;
  target: 0 | 1;
  frame: number | null;
  transition: number;
}

/** Business markers are a separate layer; the accepted terrain and flow renderer stay untouched. */
export function useDemoMapLayers(
  map: GeographicPlanningMap | null,
  data: DemoData | null,
  scene: Scene,
  mode: NationalMode,
  chainId: string,
  stageId: string,
  showCompanies: boolean,
  onCity: (id: string) => void,
  onCompany: (id: string) => void,
  selectedRegionId?: string,
) {
  const handlers = useRef({ onCity, onCompany });
  handlers.current = { onCity, onCompany };
  const portraitSelection = useRef(selectedRegionId);
  portraitSelection.current = selectedRegionId;
  const portraitLayer = useRef<PortraitLayerState | null>(null);

  const destroyPortrait = (entry: PortraitLayerState) => {
    if (entry.disposed) return;
    entry.disposed = true;
    entry.transition += 1;
    if (entry.frame !== null) cancelAnimationFrame(entry.frame);
    entry.frame = null;
    if (portraitLayer.current === entry) portraitLayer.current = null;
    entry.map.map.removeLayer(entry.layer);
    entry.source.clear();
    entry.layer.dispose();
  };
  const fadePortrait = (entry: PortraitLayerState, target: 0 | 1) => {
    if (entry.disposed) return;
    entry.target = target;
    entry.transition += 1;
    const token = entry.transition;
    if (entry.frame !== null) cancelAnimationFrame(entry.frame);
    entry.frame = null;
    if (!entry.ready && target === 1) return;
    const startOpacity = entry.layer.getOpacity();
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced || Math.abs(startOpacity - target) < 0.001) {
      entry.layer.setOpacity(target);
      if (target === 0) destroyPortrait(entry);
      return;
    }
    const start = performance.now();
    const duration = 320 * Math.max(0.2, Math.abs(startOpacity - target));
    const tick = (now: number) => {
      if (
        entry.disposed ||
        portraitLayer.current !== entry ||
        entry.transition !== token
      )
        return;
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      entry.layer.setOpacity(startOpacity + (target - startOpacity) * eased);
      if (progress < 1) entry.frame = requestAnimationFrame(tick);
      else {
        entry.frame = null;
        if (target === 0) destroyPortrait(entry);
      }
    };
    entry.frame = requestAnimationFrame(tick);
  };

  useEffect(
    () => () => {
      if (portraitLayer.current) destroyPortrait(portraitLayer.current);
    },
    [map],
  );

  useEffect(() => {
    let current = portraitLayer.current;
    if (current && (current.map !== map || current.data !== data)) {
      destroyPortrait(current);
      current = null;
    }
    const active = scene === "national" && mode === "region";
    if (!map || !data || !active) {
      if (current) fadePortrait(current, 0);
      return;
    }
    if (current) {
      fadePortrait(current, 1);
      return;
    }
    const source = new VectorSource();
    const layer = new VectorLayer({
      source,
      opacity: 0,
      updateWhileAnimating: true,
      updateWhileInteracting: true,
    });
    layer.set("demoLayer", "region-portraits");
    const entry: PortraitLayerState = {
      map,
      data,
      layer,
      source,
      disposed: false,
      ready: false,
      target: 1,
      frame: null,
      transition: 0,
    };
    portraitLayer.current = entry;
    const definitions = new Map(
      map.getRegions().map((item) => [item.adcode, item]),
    );
    const styleCache = new Map<string, Style>();
    layer.setStyle((feature) => {
      const portrait = feature.get("portrait") as RegionPortrait | undefined;
      if (!portrait) return undefined;
      const selected = data.regions.find(
        (region) => region.id === portraitSelection.current,
      );
      const provinceId =
        selected?.level === "市"
          ? selected.parentId
          : selected?.id || portraitSelection.current;
      const focused = feature.get("regionId") === provinceId;
      const key = `${portrait.id}:${focused ? "focused" : "normal"}`;
      if (!styleCache.has(key))
        styleCache.set(
          key,
          new Style({
            fill: new Fill({
              color: focused ? portrait.selectedFill : portrait.fill,
            }),
            stroke: new Stroke({
              color: focused ? "rgba(38,91,66,.94)" : "rgba(78,101,79,.27)",
              width: focused ? 2.4 : 0.65,
            }),
            zIndex: focused ? 1 : 0,
          }),
        );
      return styleCache.get(key);
    });
    // Insert immediately after the existing province polygons, below all later
    // administrative boundaries and labels. No terrain/flow renderer is changed.
    const layers = map.map.getLayers();
    const provinceIndex = layers.getArray().findIndex(
      (candidate) =>
        candidate instanceof VectorLayer &&
        candidate
          .getSource()
          ?.getFeatures()
          .some(
            (feature: Feature) =>
              Number(feature.get("adcode")) === 420000 &&
              feature.get("level") === "province",
          ),
    );
    if (provinceIndex >= 0) layers.insertAt(provinceIndex + 1, layer);
    else map.map.addLayer(layer);
    void map
      .loadJSON("provinces.geojson")
      .then((geojson) => {
        if (entry.disposed || portraitLayer.current !== entry) return;
        const features = new GeoJSON().readFeatures(geojson, {
          featureProjection: "EPSG:3857",
        });
        for (const feature of features) {
          const definition = definitions.get(Number(feature.get("adcode")));
          if (!definition) continue;
          const region = data.regions.find(
            (item) => item.id === definition.id && item.level === "省",
          );
          const portrait = portraitForRegion(
            region,
            data.regions,
            definition.id,
          );
          feature.setProperties({
            regionId: definition.id,
            portrait,
            portraitCategory: portrait.id,
            portraitMethod: portrait.method,
          });
          source.addFeature(feature);
        }
        entry.ready = true;
        fadePortrait(entry, entry.target);
      })
      .catch((error: unknown) => {
        if (!entry.disposed) {
          console.warn("Region portrait geometry could not load", error);
          destroyPortrait(entry);
        }
      });
  }, [map, data, scene, mode]);

  useEffect(() => {
    portraitLayer.current?.layer.changed();
  }, [selectedRegionId]);

  useEffect(() => {
    if (!map || !data) return;
    const source = new VectorSource();
    const layer = new VectorLayer({ source, zIndex: 450, declutter: true });
    if (scene === "national" && mode === "industry") {
      const stage = data.chains
        .find((chain) => chain.id === chainId)
        ?.stages.find((item) => item.id === stageId);
      const stageColor =
        stage?.stage === "上游"
          ? "#4d8be4"
          : stage?.stage === "中游"
            ? "#dd9d3a"
            : "#a076ce";
      const relevant = data.regions.filter(
        (region) =>
          region.level === "市" &&
          (region.chainIds.includes(chainId) ||
            data.companies.some(
              (c) =>
                c.cityId === region.id &&
                c.chainIds.includes(chainId) &&
                c.stageIds.includes(stageId),
            )),
      );
      relevant.forEach((region) => {
        const city = data.cities.find(
          (c) =>
            c.id === region.id ||
            c.name.replace(/市$/, "") === region.name.replace(/市$/, ""),
        );
        const lookup = city
          ? undefined
          : map
              .search(region.name)
              .find((item) => item.get("level") === "city") ||
            map.search(region.name)[0];
        const coordinate = city
          ? fromLonLat(city.coordinate)
          : lookup?.getGeometry()?.getCoordinates();
        if (!coordinate) return;
        const companies = data.companies.filter(
          (c) =>
            c.cityId === (city?.id || region.id) &&
            c.chainIds.includes(chainId) &&
            c.stageIds.includes(stageId),
        );
        const feature = new Feature({
          geometry: new Point(coordinate),
          cityId: city?.id || region.id,
        });
        // Gray points indicate a sourced industry-chain association; only sourced company stages get stage colors.
        const color = companies.length ? stageColor : "#8da694";
        feature.setStyle(
          new Style({
            image: new Circle({
              radius: companies.length ? 9 : 4,
              fill: new Fill({ color }),
              stroke: new Stroke({ color: "#fff", width: 2 }),
            }),
            text: companies.length
              ? new Text({
                  text: region.name,
                  offsetY: -20,
                  font: '600 15px "Microsoft YaHei", sans-serif',
                  fill: new Fill({ color: "#283a30" }),
                  stroke: new Stroke({ color: "#fff", width: 3 }),
                })
              : undefined,
          }),
        );
        source.addFeature(feature);
      });
    }
    if (scene === "profile" && showCompanies) {
      data.companies
        .filter((c) => c.local && c.coordinate)
        .forEach((company) => {
          const feature = new Feature({
            geometry: new Point(fromLonLat(company.coordinate!)),
            companyId: company.id,
          });
          feature.setStyle(
            new Style({
              image: new Circle({
                radius: 7,
                fill: new Fill({ color: "#4d8be4" }),
                stroke: new Stroke({ color: "white", width: 2.5 }),
              }),
            }),
          );
          source.addFeature(feature);
        });
    }
    map.map.addLayer(layer);
    const key = map.map.on("singleclick", (event) => {
      const hit = map.map.forEachFeatureAtPixel(event.pixel, (f) => f, {
        layerFilter: (l) => l === layer,
        hitTolerance: 7,
      });
      if (hit?.get("companyId"))
        handlers.current.onCompany(hit.get("companyId"));
      else if (hit?.get("cityId")) handlers.current.onCity(hit.get("cityId"));
      else if (scene === "flows") {
        let closest = 24;
        let selected: string | null = null;
        for (const city of data.cities) {
          const p = map.map.getPixelFromCoordinate(fromLonLat(city.coordinate));
          if (!p) continue;
          const distance = Math.hypot(
            event.pixel[0] - p[0],
            event.pixel[1] - p[1],
          );
          if (distance < closest) {
            closest = distance;
            selected = city.id;
          }
        }
        if (selected) handlers.current.onCity(selected);
      }
    });
    return () => {
      unByKey(key);
      map.map.removeLayer(layer);
      source.clear();
      layer.dispose();
    };
  }, [map, data, scene, mode, chainId, stageId, showCompanies]);
}
