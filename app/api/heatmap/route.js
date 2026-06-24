// Finviz 스타일 트리맵용 데이터.
// 박스 크기 = 실제 시가총액, 색 = 일간 등락률.
// 키 없이 Yahoo 공개 quote 엔드포인트를 쿠키+crumb 방식으로 호출한다(등록 불필요).
// 가짜 숫자는 만들지 않으며, 못 가져온 종목은 결과에서 제외한다.

export const dynamic = "force-dynamic";
export const maxDuration = 30; // Vercel: 다종목 호출 타임아웃 방지

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// 섹터별 대표 종목 (라벨/섹터는 정적 메타데이터, 수치는 전부 실제 응답)
const SECTORS = [
  {
    key: "tech",
    name: "기술",
    en: "TECHNOLOGY",
    symbols: ["AAPL", "MSFT", "NVDA", "AVGO", "ORCL", "CRM", "AMD", "ADBE", "CSCO", "ACN", "TXN", "QCOM", "INTC", "IBM", "AMAT", "MU"],
  },
  {
    key: "comm",
    name: "커뮤니케이션",
    en: "COMMUNICATION SERVICES",
    symbols: ["GOOGL", "META", "NFLX", "DIS", "CMCSA", "T", "VZ", "TMUS"],
  },
  {
    key: "cyclical",
    name: "자유소비재",
    en: "CONSUMER CYCLICAL",
    symbols: ["AMZN", "TSLA", "HD", "MCD", "NKE", "LOW", "SBUX", "BKNG"],
  },
  {
    key: "defensive",
    name: "필수소비재",
    en: "CONSUMER DEFENSIVE",
    symbols: ["WMT", "PG", "KO", "PEP", "COST", "PM", "MO"],
  },
  {
    key: "health",
    name: "헬스케어",
    en: "HEALTHCARE",
    symbols: ["UNH", "JNJ", "LLY", "ABBV", "MRK", "PFE", "TMO", "ABT", "DHR", "BMY", "AMGN"],
  },
  {
    key: "financial",
    name: "금융",
    en: "FINANCIAL",
    symbols: ["BRK-B", "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "AXP", "SPGI", "BLK"],
  },
  {
    key: "industrial",
    name: "산업재",
    en: "INDUSTRIALS",
    symbols: ["GE", "CAT", "RTX", "HON", "UNP", "BA", "UPS", "DE", "LMT"],
  },
  {
    key: "energy",
    name: "에너지",
    en: "ENERGY",
    symbols: ["XOM", "CVX", "COP", "SLB", "EOG"],
  },
  {
    key: "utilities",
    name: "유틸리티",
    en: "UTILITIES",
    symbols: ["NEE", "DUK", "SO"],
  },
  {
    key: "realestate",
    name: "부동산",
    en: "REAL ESTATE",
    symbols: ["PLD", "AMT", "EQIX"],
  },
  {
    key: "materials",
    name: "소재",
    en: "BASIC MATERIALS",
    symbols: ["LIN", "SHW", "APD", "ECL"],
  },
];

const SYMBOL_SECTOR = {};
const NAME_KO = {};
for (const s of SECTORS) {
  for (const sym of s.symbols) SYMBOL_SECTOR[sym] = s;
}

// crumb/cookie 캐시 (서버 프로세스 동안 재사용)
let creds = null; // { cookie, crumb }

async function getCreds(force = false) {
  if (creds && !force) return creds;
  const r1 = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": UA, Accept: "*/*" },
  });
  const sc = r1.headers.getSetCookie ? r1.headers.getSetCookie() : [];
  const cookie = (sc || [])
    .map((c) => c.split(";")[0])
    .filter(Boolean)
    .join("; ");
  const r2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, Accept: "*/*", Cookie: cookie },
  });
  const crumb = (await r2.text()).trim();
  creds = { cookie, crumb };
  return creds;
}

async function quoteBatch(symbols, c) {
  const url =
    "https://query2.finance.yahoo.com/v7/finance/quote?symbols=" +
    encodeURIComponent(symbols.join(",")) +
    "&crumb=" +
    encodeURIComponent(c.crumb);
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json", Cookie: c.cookie },
    cache: "no-store",
    signal: AbortSignal.timeout(9000),
  });
  return res;
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export async function GET() {
  const allSymbols = SECTORS.flatMap((s) => s.symbols);
  const batches = chunk(allSymbols, 40);

  let results = [];
  try {
    let c = await getCreds();
    for (const b of batches) {
      let res = await quoteBatch(b, c);
      if (res.status === 401) {
        // crumb 만료 → 1회 갱신 후 재시도
        c = await getCreds(true);
        res = await quoteBatch(b, c);
      }
      if (!res.ok) continue;
      const json = await res.json();
      const arr = json?.quoteResponse?.result || json?.quoteResult?.result || [];
      results = results.concat(arr);
    }
  } catch (e) {
    return Response.json(
      { serverTime: Date.now(), ok: false, reason: e?.message || "fetch-fail", sectors: [], items: [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const items = [];
  for (const q of results) {
    const sym = q?.symbol;
    const sector = SYMBOL_SECTOR[sym];
    if (!sector) continue;
    if (typeof q.marketCap !== "number" || typeof q.regularMarketPrice !== "number") continue;
    items.push({
      symbol: sym,
      name: q.shortName || q.longName || sym,
      sectorKey: sector.key,
      marketCap: q.marketCap,
      price: q.regularMarketPrice,
      changePct:
        typeof q.regularMarketChangePercent === "number"
          ? q.regularMarketChangePercent
          : null,
      change:
        typeof q.regularMarketChange === "number" ? q.regularMarketChange : null,
      currency: q.currency || "USD",
    });
  }

  const sectors = SECTORS.map((s) => ({ key: s.key, name: s.name, en: s.en }));

  return Response.json(
    {
      serverTime: Date.now(),
      ok: items.length > 0,
      sectors,
      items,
      requested: allSymbols.length,
      received: items.length,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
