import { useEffect, useRef, useState } from "react";
import type { Extent } from "ol/extent.js";
import type { GeographicPlanningMap } from "../map";
import type { Scene } from "./types";

export const SCENE_MOTION = {
  exit: 210,
  enter: 380,
  flight: 1250,
  flow: 640,
} as const;

export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Keep the outgoing panels mounted for their exit, then mount the final target.
 * A new request invalidates every pending commit; rapid navigation never queues.
 */
export function useSceneTransition(target: Scene) {
  const reduced = useReducedMotion();
  const [renderedScene, setRenderedScene] = useState(target);
  const [phase, setPhase] = useState<"idle" | "leaving" | "entering">("idle");
  const displayed = useRef(target);
  const request = useRef(0);
  const initial = useRef(true);
  useEffect(() => {
    const token = ++request.current;
    let commit: ReturnType<typeof setTimeout> | undefined;
    let settle: ReturnType<typeof setTimeout> | undefined;
    if (initial.current || reduced) {
      initial.current = false;
      displayed.current = target;
      setRenderedScene(target);
      setPhase("idle");
    } else {
      const enter = () => {
        if (token !== request.current) return;
        displayed.current = target;
        setRenderedScene(target);
        setPhase("entering");
        settle = setTimeout(() => {
          if (token === request.current) setPhase("idle");
        }, SCENE_MOTION.enter);
      };
      // A quick return to the still-mounted scene reverses the CSS transition
      // from its current opacity instead of replaying an entrance from zero.
      if (displayed.current === target) setPhase("idle");
      else {
        setPhase("leaving");
        commit = setTimeout(enter, SCENE_MOTION.exit);
      }
    }
    return () => {
      request.current++;
      clearTimeout(commit);
      clearTimeout(settle);
    };
  }, [target, reduced]);
  return { renderedScene, phase, reduced };
}

const ease = (t: number) => t * t * (3 - 2 * t);

/** A smooth logarithmic zoom avoids saving most of a national→county jump
 * for the final few frames. The camera is never fitted to its endpoint first.
 */
export function flyToSceneExtent(
  map: GeographicPlanningMap,
  extent: Extent,
  padding: number[],
  animated: boolean,
  onEnd?: (complete: boolean) => void,
) {
  const view = map.map.getView();
  view.cancelAnimations();
  const size = map.map.getSize();
  if (!size) return () => {};
  if (!animated) {
    view.fit(extent, { padding, duration: 0, maxZoom: 14 });
    onEnd?.(true);
    return () => {};
  }
  const fitResolution = Math.max(
    view.getResolutionForExtent(extent, [
      Math.max(1, size[0] - padding[1] - padding[3]),
      Math.max(1, size[1] - padding[0] - padding[2]),
    ]),
    view.getResolutionForZoom(14),
  );
  const resolution =
    view.getConstrainedResolution(fitResolution, 1) ?? fitResolution;
  const center = view.getConstrainedCenter(
    [
      (extent[0] + extent[2]) / 2 +
        ((padding[1] - padding[3]) * resolution) / 2,
      (extent[1] + extent[3]) / 2 +
        ((padding[0] - padding[2]) * resolution) / 2,
    ],
    resolution,
  );
  const sourceResolution = view.getResolution() || resolution;
  const resolutionEase =
    Math.abs(sourceResolution - resolution) < 1e-9
      ? ease
      : (t: number) =>
          (sourceResolution * Math.pow(resolution / sourceResolution, ease(t)) -
            sourceResolution) /
          (resolution - sourceResolution);
  let cancelled = false;
  view.animate({ center, duration: SCENE_MOTION.flight, easing: ease });
  view.animate(
    { resolution, duration: SCENE_MOTION.flight, easing: resolutionEase },
    (complete) => {
      if (!cancelled) onEnd?.(complete);
    },
  );
  return () => {
    cancelled = true;
    view.cancelAnimations();
  };
}
