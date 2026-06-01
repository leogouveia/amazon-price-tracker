import { useEffect, useRef } from "preact/hooks";
import {
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  LineSeries,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { formatDateTime } from "../../utils";

export type PriceHistoryPoint = {
  price: number;
  checked_at: string;
};

type PriceHistoryChartProps = {
  history: PriceHistoryPoint[];
  height?: number;
  className?: string;
};

function parseCheckedAtToUnix(checkedAt: string): UTCTimestamp | null {
  const iso = checkedAt.includes("T")
    ? checkedAt
    : `${checkedAt.replace(" ", "T")}Z`;
  const ms = new Date(iso).getTime();

  if (Number.isNaN(ms)) {
    return null;
  }

  return Math.floor(ms / 1000) as UTCTimestamp;
}

function formatBrlPrice(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatChartTime(time: Time): string {
  if (typeof time === "number") {
    const iso = new Date(time * 1000).toISOString();
    return formatDateTime(iso);
  }

  if (typeof time === "string") {
    return formatDateTime(time);
  }

  const iso = `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}T00:00:00Z`;
  return formatDateTime(iso);
}

function historyToLineData(history: PriceHistoryPoint[]): LineData<Time>[] {
  const points: LineData<Time>[] = [];

  for (const entry of history) {
    const time = parseCheckedAtToUnix(entry.checked_at);
    if (time === null) {
      continue;
    }

    points.push({ time, value: entry.price });
  }

  points.sort((a, b) => {
    const ta = typeof a.time === "number" ? a.time : 0;
    const tb = typeof b.time === "number" ? b.time : 0;
    return ta - tb;
  });

  const deduped: LineData<Time>[] = [];
  for (const point of points) {
    const last = deduped[deduped.length - 1];
    if (last && last.time === point.time) {
      last.value = point.value;
    } else {
      deduped.push({ ...point });
    }
  }

  return deduped;
}

const CHART_COLORS_LIGHT = {
  text: "#374151",
  grid: "#e5e7eb",
  line: "#2563eb",
  background: "#ffffff",
} as const;

const CHART_COLORS_DARK = {
  text: "#d1d5db",
  grid: "#374151",
  line: "#60a5fa",
  background: "#1f2937",
} as const;

type ChartColors = {
  text: string;
  grid: string;
  line: string;
  background: string;
};

/** Lightweight Charts only accepts hex/rgb — not oklch() from Tailwind v4. */
function isChartSafeColor(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (
    normalized.includes("oklch") ||
    normalized.includes("oklab") ||
    normalized.includes("lch(") ||
    normalized.includes("lab(") ||
    normalized.includes("color(")
  ) {
    return false;
  }

  return (
    /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(normalized) ||
    /^rgba?\(/.test(normalized)
  );
}

function readComputedCssColor(
  host: HTMLElement,
  property: "color" | "backgroundColor" | "borderColor",
  cssVar: string,
  fallback: string,
): string {
  const probe = document.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:absolute;width:0;height:0;opacity:0;pointer-events:none;";

  if (property === "color") {
    probe.style.color = cssVar;
  } else if (property === "backgroundColor") {
    probe.style.backgroundColor = cssVar;
  } else {
    probe.style.borderColor = cssVar;
  }

  host.appendChild(probe);
  const computed = getComputedStyle(probe)[property];
  probe.remove();

  return isChartSafeColor(computed) ? computed : fallback;
}

function prefersDarkTheme(): boolean {
  const root = document.documentElement;
  const theme = root.getAttribute("data-theme");

  if (theme) {
    return theme.includes("dark");
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readThemeColors(container: HTMLElement): ChartColors {
  const fallback = prefersDarkTheme()
    ? CHART_COLORS_DARK
    : CHART_COLORS_LIGHT;

  return {
    text: readComputedCssColor(
      container,
      "color",
      "var(--color-base-content)",
      fallback.text,
    ),
    grid: readComputedCssColor(
      container,
      "borderColor",
      "var(--color-base-300)",
      fallback.grid,
    ),
    line: readComputedCssColor(
      container,
      "backgroundColor",
      "var(--color-primary)",
      fallback.line,
    ),
    background: readComputedCssColor(
      container,
      "backgroundColor",
      "var(--color-base-100)",
      fallback.background,
    ),
  };
}

export function PriceHistoryChart({
  history,
  height = 320,
  className = "",
}: PriceHistoryChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const colors = readThemeColors(container);

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: true,
      },
      localization: {
        locale: "pt-BR",
        priceFormatter: formatBrlPrice,
        timeFormatter: formatChartTime,
      },
    });

    const series = chart.addSeries(LineSeries, {
      color: colors.line,
      lineWidth: 2,
      crosshairMarkerRadius: 4,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      chart.applyOptions({ width: entry.contentRect.width });
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    const container = containerRef.current;

    if (!series || !chart || !container) {
      return;
    }

    const colors = readThemeColors(container);
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      localization: {
        locale: "pt-BR",
        priceFormatter: formatBrlPrice,
        timeFormatter: formatChartTime,
      },
    });

    series.applyOptions({ color: colors.line });

    const data = historyToLineData(history);
    series.setData(data);

    if (data.length > 0) {
      chart.timeScale().fitContent();
    }
  }, [history]);

  if (history.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      <div ref={containerRef} className="w-full" style={{ height }} />
    </div>
  );
}
