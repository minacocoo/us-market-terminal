"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const REFRESH_MS = 30_000;

/* ---------- 포맷 유틸 ---------- */
function fmtNum(n, digits = 2) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return n.toLocaleString("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtTime(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function fmtDateShort(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function dirClass(change) {
  if (typeof change !== "number") return "flat";
  if (change > 0) return "up";
  if (change < 0) return "down";
  return "flat";
}

/* ---------- SVG 미니 스파크라인 ---------- */
function Spark({ series, change }) {
  if (!series || series.length < 2) return null;
  const w = 84;
  const h = 30;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const pts = series
    .map((v, i) => {
      const x = (i / (series.length - 1)) * w;
      const y = h - ((v - min) / span) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const color =
    change > 0 ? "var(--green)" : change < 0 ? "var(--red)" : "var(--muted)";
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* ---------- SVG 상세 추이 차트 ---------- */
function DetailChart({ item }) {
  const series = item.series || [];
  const times = item.seriesT || [];
  if (series.length < 2) {
    return <div className="empty">추이 데이터 없음</div>;
  }
  const W = 920;
  const H = 240;
  const padL = 56;
  const padR = 16;
  const padT = 16;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;

  const x = (i) => padL + (i / (series.length - 1)) * innerW;
  const y = (v) => padT + innerH - ((v - min) / span) * innerH;

  const linePts = series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const areaPts =
    `${padL},${padT + innerH} ` + linePts + ` ${padL + innerW},${padT + innerH}`;

  const up = item.change > 0;
  const color = up ? "var(--green)" : item.change < 0 ? "var(--red)" : "var(--muted)";

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const val = min + span * f;
    return { val, yy: y(val) };
  });

  const xLabels = [0, Math.floor(series.length / 2), series.length - 1].map((i) => ({
    xx: x(i),
    label: fmtDateShort(times[i]),
  }));

  return (
    <div className="chartwrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="fillGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={padL + innerW} y1={t.yy} y2={t.yy} stroke="var(--border)" strokeWidth="1" />
            <text className="axis" x={padL - 8} y={t.yy + 3} textAnchor="end">
              {fmtNum(t.val, 1)}
            </text>
          </g>
        ))}

        {xLabels.map((t, i) => (
          <text
            key={i}
            className="axis"
            x={t.xx}
            y={H - 8}
            textAnchor={i === 0 ? "start" : i === xLabels.length - 1 ? "end" : "middle"}
          >
            {t.label}
          </text>
        ))}

        <polygon points={areaPts} fill="url(#fillGrad)" />
        <polyline points={linePts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <circle cx={x(series.length - 1)} cy={y(series[series.length - 1])} r="3.5" fill={color} />
      </svg>
      <div className="meta-line">
        최근 1개월 일봉 종가 · 최저 {fmtNum(min)} / 최고 {fmtNum(max)}
        {item.currency ? ` (${item.currency})` : ""}
      </div>
    </div>
  );
}

/* ---------- 카드 ---------- */
function Card({ item, selected, onClick }) {
  if (item.status !== "ok") {
    return (
      <div className="card nodata">
        <div className="row1">
          <div>
            <div className="sym">{item.symbol}</div>
            <div className="name">{item.label}</div>
          </div>
        </div>
        <div className="nodata-tag">데이터 없음</div>
      </div>
    );
  }

  const dir = dirClass(item.change);
  const arrow = item.change > 0 ? "▲" : item.change < 0 ? "▼" : "■";
  const sign = item.change > 0 ? "+" : "";
  const digits = 2;

  return (
    <div className={`card ${dir} ${selected ? "selected" : ""}`} onClick={() => onClick(item)}>
      <div className="row1">
        <div>
          <div className="sym">{item.symbol}</div>
          <div className="name">{item.label}</div>
        </div>
      </div>
      <div className="price">
        {fmtNum(item.price, digits)}
        {item.currency ? <span className="cur">{item.currency}</span> : null}
      </div>
      <div className="chg">
        {item.change === null ? (
          "등락 정보 없음"
        ) : (
          <>
            <span className="arrow">{arrow}</span>
            {sign}
            {fmtNum(item.change, digits)} ({sign}
            {fmtNum(item.changePct, 2)}%)
          </>
        )}
      </div>
      <Spark series={item.series} change={item.change} />
    </div>
  );
}

/* ---------- 섹션 ---------- */
function Section({ title, items, selected, onSelect }) {
  if (!items.length) return null;
  return (
    <>
      <div className="section-title">{title}</div>
      <div className="grid">
        {items.map((it) => (
          <Card key={it.symbol} item={it} selected={selected?.symbol === it.symbol} onClick={onSelect} />
        ))}
      </div>
    </>
  );
}

/* ---------- 상세 패널 ---------- */
function Detail({ item, onClose }) {
  const dir = dirClass(item.change);
  const sign = item.change > 0 ? "+" : "";
  return (
    <div className="detail">
      <div className="dhead">
        <div>
          <span className="dt-sym">{item.symbol}</span>
          <span className="dt-name">{item.label}</span>
          <span className={`dt-name ${dir === "up" ? "txt-up" : dir === "down" ? "txt-down" : ""}`}>
            {"  "}
            {fmtNum(item.price)} {item.currency || ""}
            {item.change !== null
              ? ` · ${sign}${fmtNum(item.change)} (${sign}${fmtNum(item.changePct, 2)}%)`
              : ""}
          </span>
        </div>
        <div className="close" onClick={onClose}>
          닫기 ✕
        </div>
      </div>
      <DetailChart item={item} />
    </div>
  );
}

/* ---------- 카드 뷰 ---------- */
export default function CardView() {
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedSym, setSelectedSym] = useState(null);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/quotes", { cache: "no-store" });
      if (!res.ok) throw new Error("bad response");
      const json = await res.json();
      setData(json);
      setLastUpdated(json.serverTime);
      const anyOk = json.items.some((i) => i.status === "ok");
      setState(anyOk ? "live" : "error");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [load]);

  const items = data?.items || [];
  const indices = items.filter((i) => i.group === "index");
  const stocks = items.filter((i) => i.group === "stock");
  const fx = items.filter((i) => i.group === "fx");

  const selected =
    selectedSym && items.find((i) => i.symbol === selectedSym && i.status === "ok");

  const onSelect = (item) => {
    if (item.status !== "ok") return;
    setSelectedSym((prev) => (prev === item.symbol ? null : item.symbol));
  };

  const okCount = items.filter((i) => i.status === "ok").length;
  const failCount = items.filter((i) => i.status !== "ok").length;

  return (
    <div>
      <div className="hm-status">
        <span>
          <span className={`dot ${state === "live" ? "live" : state === "loading" ? "loading" : "err"}`} />
          <b>{state === "live" ? "실시간" : state === "loading" ? "불러오는 중" : "연결 실패"}</b> · 30초 자동 갱신
        </span>
        <span>오르면 초록 · 내리면 빨강 · 카드 클릭 시 1개월 차트</span>
        <span>
          마지막 갱신 <b>{lastUpdated ? fmtTime(lastUpdated) : "—"}</b>
          {data ? ` · 수신 ${okCount}건${failCount ? ` · 실패 ${failCount}건` : ""}` : ""}
        </span>
      </div>

      {!data && state === "loading" ? <div className="empty">데이터 불러오는 중…</div> : null}
      {state === "error" && !okCount ? (
        <div className="empty">
          데이터를 가져오지 못했습니다. 네트워크 상태를 확인한 뒤 잠시 후 자동으로 다시 시도합니다.
        </div>
      ) : null}

      <Section title="미국 주요 지수" items={indices} selected={selected} onSelect={onSelect} />
      {selected && selected.group === "index" ? (
        <Detail item={selected} onClose={() => setSelectedSym(null)} />
      ) : null}

      <Section title="대표 종목" items={stocks} selected={selected} onSelect={onSelect} />
      {selected && selected.group === "stock" ? (
        <Detail item={selected} onClose={() => setSelectedSym(null)} />
      ) : null}

      <Section title="환율" items={fx} selected={selected} onSelect={onSelect} />
      {selected && selected.group === "fx" ? (
        <Detail item={selected} onClose={() => setSelectedSym(null)} />
      ) : null}

      <div className="footer">
        데이터 출처: Yahoo Finance 공개 차트 API (<code>query1.finance.yahoo.com</code>) ·
        API 키 없이 서버에서 호출 · 표시 값은 모두 실제 응답이며 가져오지 못한 항목은 “데이터 없음”으로 표기합니다.
        지수·종목은 직전 거래일 종가 대비 등락, 차트는 최근 1개월 일봉 종가입니다.
      </div>
    </div>
  );
}
