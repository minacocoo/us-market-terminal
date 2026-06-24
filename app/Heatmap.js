"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const REFRESH_MS = 30_000;

/* ---------- squarified treemap ---------- */
function worstRatio(areas, side) {
  let sum = 0,
    max = -Infinity,
    min = Infinity;
  for (const a of areas) {
    sum += a;
    if (a > max) max = a;
    if (a < min) min = a;
  }
  if (sum === 0) return Infinity;
  const s2 = sum * sum;
  const side2 = side * side;
  return Math.max((side2 * max) / s2, s2 / (side2 * min));
}

// rect: {x,y,w,h}, values: [{value, data}] → [{x,y,w,h,data,value}]
function squarify(values, rect) {
  const items = values.filter((v) => v.value > 0).sort((a, b) => b.value - a.value);
  const total = items.reduce((s, v) => s + v.value, 0);
  const out = [];
  if (total <= 0) return out;

  let { x, y, w, h } = rect;
  const scaled = items.map((v) => ({ ...v, area: (v.value / total) * (w * h) }));

  let i = 0;
  while (i < scaled.length) {
    const side = Math.min(w, h);
    const row = [scaled[i]];
    let next = i + 1;
    while (next < scaled.length) {
      const cur = row.map((r) => r.area);
      const withNext = cur.concat(scaled[next].area);
      if (worstRatio(withNext, side) <= worstRatio(cur, side)) {
        row.push(scaled[next]);
        next++;
      } else break;
    }
    const rowArea = row.reduce((s, r) => s + r.area, 0);
    if (w >= h) {
      const rw = rowArea / h || 0;
      let yy = y;
      for (const r of row) {
        const rh = r.area / rw || 0;
        out.push({ x, y: yy, w: rw, h: rh, data: r.data, value: r.value });
        yy += rh;
      }
      x += rw;
      w -= rw;
    } else {
      const rh = rowArea / w || 0;
      let xx = x;
      for (const r of row) {
        const rw = r.area / rh || 0;
        out.push({ x: xx, y, w: rw, h: rh, data: r.data, value: r.value });
        xx += rw;
      }
      y += rh;
      h -= rh;
    }
    i = next;
  }
  return out;
}

/* ---------- 색상 (등락률 → 색) ---------- */
function cellColor(pct) {
  if (pct == null || Number.isNaN(pct)) return "rgb(70,74,82)";
  const t = Math.max(-1, Math.min(1, pct / 3)); // ±3%에서 최대 채도
  const neutral = [56, 60, 67];
  const green = [33, 165, 80];
  const red = [205, 52, 52];
  const target = t >= 0 ? green : red;
  const a = Math.abs(t);
  const c = neutral.map((n, i) => Math.round(n + (target[i] - n) * a));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function fmtCap(n) {
  if (typeof n !== "number") return "—";
  if (n >= 1e12) return (n / 1e12).toFixed(2) + "조";
  if (n >= 1e8) return Math.round(n / 1e8) + "억";
  return n.toLocaleString();
}
function fmtPct(p) {
  if (p == null) return "—";
  return (p > 0 ? "+" : "") + p.toFixed(2) + "%";
}
function fmtTime(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function Heatmap() {
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [width, setWidth] = useState(1040);
  const wrapRef = useRef(null);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/heatmap", { cache: "no-store" });
      if (!res.ok) throw new Error("bad");
      const json = await res.json();
      setData(json);
      setLastUpdated(json.serverTime);
      setState(json.ok ? "live" : "error");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [load]);

  useLayoutEffect(() => {
    const update = () => {
      if (wrapRef.current) setWidth(wrapRef.current.offsetWidth);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const height = Math.max(560, Math.round(width * 0.62));

  // 2단계 트리맵 레이아웃
  const layout = useMemo(() => {
    if (!data?.items?.length) return [];
    const sectorsMeta = data.sectors || [];
    const bySector = new Map();
    for (const it of data.items) {
      if (!bySector.has(it.sectorKey)) bySector.set(it.sectorKey, []);
      bySector.get(it.sectorKey).push(it);
    }
    const sectorValues = [];
    for (const meta of sectorsMeta) {
      const list = bySector.get(meta.key);
      if (!list || !list.length) continue;
      const total = list.reduce((s, x) => s + x.marketCap, 0);
      sectorValues.push({ value: total, data: { meta, list } });
    }
    const sectorRects = squarify(sectorValues, { x: 0, y: 0, w: width, h: height });

    const cells = [];
    for (const sr of sectorRects) {
      const { meta, list } = sr.data;
      const headerH = sr.h > 60 ? 18 : 0;
      cells.push({ type: "sector", x: sr.x, y: sr.y, w: sr.w, h: sr.h, headerH, meta });
      const inner = {
        x: sr.x + 1,
        y: sr.y + headerH + 1,
        w: Math.max(0, sr.w - 2),
        h: Math.max(0, sr.h - headerH - 2),
      };
      const stockRects = squarify(
        list.map((x) => ({ value: x.marketCap, data: x })),
        inner
      );
      for (const cell of stockRects) cells.push({ type: "stock", ...cell });
    }
    return cells;
  }, [data, width, height]);

  const sectorCells = layout.filter((c) => c.type === "sector");
  const stockCells = layout.filter((c) => c.type === "stock");

  return (
    <div>
      <div className="hm-status">
        <span>
          <span className={`dot ${state === "live" ? "live" : state === "loading" ? "loading" : "err"}`} />
          <b>{state === "live" ? "실시간" : state === "loading" ? "불러오는 중" : "연결 실패"}</b> · 30초 자동 갱신
        </span>
        <span>
          박스 크기 = 시가총액 · 색 = 일간 등락률
        </span>
        <span>
          마지막 갱신 <b>{fmtTime(lastUpdated)}</b>
          {data ? ` · ${data.received}/${data.requested}종목` : ""}
        </span>
      </div>

      {/* 색상 범례 */}
      <div className="legend">
        <span>-3%</span>
        <i style={{ background: cellColor(-3) }} />
        <i style={{ background: cellColor(-1.5) }} />
        <i style={{ background: cellColor(0) }} />
        <i style={{ background: cellColor(1.5) }} />
        <i style={{ background: cellColor(3) }} />
        <span>+3%</span>
      </div>

      <div className="treemap" ref={wrapRef} style={{ height }}>
        {!data && state === "loading" ? (
          <div className="tm-empty">데이터 불러오는 중…</div>
        ) : null}
        {state === "error" && !data?.items?.length ? (
          <div className="tm-empty">
            데이터를 가져오지 못했습니다. 잠시 후 자동으로 다시 시도합니다.
          </div>
        ) : null}

        {sectorCells.map((c) => (
          <div
            key={"s-" + c.meta.key}
            className="tm-sector"
            style={{ left: c.x, top: c.y, width: c.w, height: c.h }}
          >
            {c.headerH ? (
              <div className="tm-sector-label" style={{ height: c.headerH }}>
                {c.meta.name} <span className="en">{c.meta.en}</span>
              </div>
            ) : null}
          </div>
        ))}

        {stockCells.map((c) => {
          const it = c.data;
          const showText = c.w > 28 && c.h > 18;
          const fs = Math.max(8, Math.min(22, Math.min(c.w / 4.2, c.h / 2.6)));
          return (
            <div
              key={"k-" + it.symbol}
              className="tm-cell"
              title={`${it.symbol} ${it.name}\n현재가 ${it.price} ${it.currency}\n등락 ${fmtPct(
                it.changePct
              )}\n시총 ${fmtCap(it.marketCap)} ${it.currency}`}
              style={{
                left: c.x,
                top: c.y,
                width: c.w,
                height: c.h,
                background: cellColor(it.changePct),
              }}
            >
              {showText ? (
                <div className="tm-cell-inner" style={{ fontSize: fs }}>
                  <div className="tm-sym">{it.symbol}</div>
                  {c.h > 34 ? <div className="tm-pct" style={{ fontSize: fs * 0.62 }}>{fmtPct(it.changePct)}</div> : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="footer">
        데이터 출처: Yahoo Finance 공개 quote API · API 키 없이 서버에서 호출(쿠키+crumb) ·
        값은 모두 실제 응답이며 박스 크기는 실제 시가총액, 색상은 직전 종가 대비 일간 등락률입니다.
        못 가져온 종목은 화면에서 제외됩니다.
      </div>
    </div>
  );
}
