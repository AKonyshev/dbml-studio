import { createRoot } from "react-dom/client";

import { ConnectionForm } from "./ConnectionForm";
import "./form.css";

const root = document.getElementById("root");
if (root !== null) {
  createRoot(root).render(<ConnectionForm />);
}
