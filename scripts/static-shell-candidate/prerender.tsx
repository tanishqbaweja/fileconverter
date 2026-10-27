// Render application chrome at BUILD TIME only; never open or convert a user file.
import { renderToString } from "react-dom/server";
import Home from "../../app/page";

export function renderApplicationShell() {
  return renderToString(<Home />);
}
