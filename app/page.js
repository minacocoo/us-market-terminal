"use client";

import { useState } from "react";
import Heatmap from "./Heatmap";
import CardView from "./CardView";

export default function Page() {
  const [view, setView] = useState("heatmap"); // heatmap | card

  return (
    <div className="wrap">
      <div className="topbar">
        <div className="brand">
          <h1>
            US 마켓 터미널<span className="blink">_</span>
          </h1>
        </div>
        <div className="tabs">
          <button
            className={`tab ${view === "heatmap" ? "active" : ""}`}
            onClick={() => setView("heatmap")}
          >
            히트맵
          </button>
          <button
            className={`tab ${view === "card" ? "active" : ""}`}
            onClick={() => setView("card")}
          >
            카드
          </button>
        </div>
      </div>

      {view === "heatmap" ? <Heatmap /> : <CardView />}
    </div>
  );
}
