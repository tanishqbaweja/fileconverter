// Private build experiment: same complete application, no alternative converter.
import { hydrateRoot } from "react-dom/client";
import Home from "../../app/page";
import "../../app/globals.css";

const container = document.getElementById("within-app");
if (!container) throw new Error("Static application root is missing");
hydrateRoot(container, <Home />);
