import "./styles.css";
import { createRoot } from "react-dom/client";
import App from "./app";
import InvestigationPages, { investigationRoute } from "./investigation-pages";

const root = createRoot(document.getElementById("root")!);
const investigationId = investigationRoute(window.location.pathname);
root.render(
  investigationId === undefined ? (
    <App />
  ) : (
    <InvestigationPages id={investigationId} />
  )
);
