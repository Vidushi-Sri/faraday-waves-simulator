import React from "react";
import ReactDOM from "react-dom/client";
import Simulator from "./features/simulator/Simulator";
import "./styles/app.scss";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Simulator />
  </React.StrictMode>
);
