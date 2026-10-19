import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "ol/ol.css";
import "./styles/base.css";
import "./styles/map.css";
import "./styles/attribution.css";
import "./styles/controls.css";
import "./styles/flows.css";
import "./styles/demo.css";
import "./demo/panels.css";
import "./demo/dialogs.css";
import "./demo/presentation.css";
import "./styles/motion.css";
import { App } from "./app/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
