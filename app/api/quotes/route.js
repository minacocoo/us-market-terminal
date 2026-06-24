// 키 없이 호출 가능한 Yahoo Finance 공개 차트 엔드포인트를 서버에서 호출한다.
// 브라우저에서 직접 부르면 CORS로 막히므로 Next.js 서버 라우트가 프록시 역할을 한다.
// 값을 못 가져오면 status: "error" 로 표시하고 절대 가짜 숫자를 만들지 않는다.

export const dynamic = "force-dynamic"; // 캐시 금지, 매 요청 실시간
export const maxDuration = 30; // Vercel: 다종목 호출 타임아웃 방지

// 표시용 라벨/그룹은 정적 메타데이터일 뿐, 가격·등락은 전부 실제 API 응답에서만 온다.
const INSTRUMENTS = [
  { symbol: "^GSPC", label: "S&P 500", group: "index" },
  { symbol: "^IXIC", label: "나스닥 종합", group: "index" },
  { symbol: "^DJI", label: "다우 산업", group: "index" },

  { symbol: "AAPL", label: "애플", group: "stock" },
  { symbol: "MSFT", label: "마이크로소프트", group: "stock" },
  { symbol: "NVDA", label: "엔비디아", group: "stock" },
  { symbol: "AMZN", label: "아마존", group: "stock" },
  { symbol: "GOOGL", label: "알파벳", group: "stock" },
  { symbol: "META", label: "메타", group: "stock" },
  { symbol: "TSLA", label: "테슬라", group: "stock" },
  { symbol: "AMD", label: "AMD", group: "stock" },
  { symbol: "TQQQ", label: "TQQQ (나스닥100 3배)", group: "stock" },
  { symbol: "SCHD", label: "SCHD (배당 ETF)", group: "stock" },

  { symbol: "KRW=X", label: "원/달러 환율", group: "fx" },
];

async function fetchOne(inst) {
  const url =
    "https://query1.finance.yahoo.com/v8/finance/chart/" +
    encodeURIComponent(inst.symbol) +
    "?interval=1d&range=1mo";

  try {
    const res = await fetch(url, {
      headers: {
        // Yahoo 는 UA 없으면 종종 거절한다.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/json",
      },
      cache: "no-store",
      // 한 종목이 느려도 전체가 무한정 기다리지 않도록
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return base(inst, "error", `HTTP ${res.status}`);
    }

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta || typeof meta.regularMarketPrice !== "number") {
      return base(inst, "error", "no-price");
    }

    // 일봉 종가 시계열 (sparkline + 직전 거래일 종가 산출용)
    const ts = result?.timestamp || [];
    const rawCloses = result?.indicators?.quote?.[0]?.close || [];
    const series = [];
    for (let i = 0; i < ts.length; i++) {
      const c = rawCloses[i];
      if (typeof c === "number" && !Number.isNaN(c)) {
        series.push({ t: ts[i], c });
      }
    }

    const price = meta.regularMarketPrice;

    // 직전 거래일 종가: 시계열의 마지막 직전 값이 가장 정확하다.
    // (range=1mo 의 chartPreviousClose 는 한 달 전 종가라서 일간 등락엔 부적합)
    let prevClose = null;
    if (series.length >= 2) {
      prevClose = series[series.length - 2].c;
    } else if (typeof meta.chartPreviousClose === "number") {
      prevClose = meta.chartPreviousClose;
    }

    let change = null;
    let changePct = null;
    if (typeof prevClose === "number" && prevClose !== 0) {
      change = price - prevClose;
      changePct = (change / prevClose) * 100;
    }

    return {
      symbol: inst.symbol,
      label: inst.label,
      group: inst.group,
      status: "ok",
      price,
      prevClose,
      change,
      changePct,
      currency: meta.currency || null,
      name: meta.shortName || meta.longName || inst.label,
      marketTime: meta.regularMarketTime
        ? meta.regularMarketTime * 1000
        : null,
      // sparkline 용 종가 배열만 가볍게 전달
      series: series.map((p) => p.c),
      seriesT: series.map((p) => p.t * 1000),
    };
  } catch (e) {
    return base(inst, "error", e?.name === "TimeoutError" ? "timeout" : "fetch-fail");
  }
}

function base(inst, status, reason) {
  return {
    symbol: inst.symbol,
    label: inst.label,
    group: inst.group,
    status,
    reason,
    price: null,
    prevClose: null,
    change: null,
    changePct: null,
    currency: null,
    name: inst.label,
    marketTime: null,
    series: [],
    seriesT: [],
  };
}

export async function GET() {
  const items = await Promise.all(INSTRUMENTS.map(fetchOne));
  return Response.json(
    {
      serverTime: Date.now(),
      items,
    },
    {
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  );
}
