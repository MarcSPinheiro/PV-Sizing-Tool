import type { Battery, Inverter, SolarPanel } from "@workspace/api-client-react";
import {
  calcBatteryStudy,
  calcBatterySystem,
  type BatteryUnit,
} from "@/components/wizard-battery-study";
import type { MapReportData } from "@/components/wizard-map-step";
import { createPanelLayout, type MapArea } from "@/components/satellite-map";
import type { InverterUnit } from "@/lib/multi-inverter";
import type { SectionId } from "./types";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const PRODUCTION_PROFILE = [0.055, 0.065, 0.085, 0.095, 0.11, 0.12, 0.125, 0.115, 0.095, 0.075, 0.04, 0.02];

type AnyRecord = Record<string, unknown>;

export interface NewReportData {
  projectName: string;
  generatedAt: string;
  project: unknown;
  customer: AnyRecord | null;
  company?: AnyRecord | null;
  draft: (AnyRecord & {
    clienteData?: AnyRecord | null;
    consumoData?: AnyRecord | null;
    locData?: AnyRecord | null;
    sizing?: AnyRecord | null;
    manual?: AnyRecord | null;
    reportMapData?: MapReportData | null;
    orcamentoState?: AnyRecord | null;
    selectedCenarioTipo?: string;
    investimentoManual?: number | null;
    numPaineisStep5?: number | null;
    tipoProjeto?: string;
  }) | null;
  panel: SolarPanel | null;
  inverters: Inverter[];
  batteries: Battery[];
  allInverters: Inverter[];
  inverterUnits: InverterUnit[];
  batteryUnits: BatteryUnit[];
  notes: string;
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ?n : null;
}

function text(value: unknown): string | null {
  if (value == null) return null;
  const str = String(value).trim();
  return str.length ?str : null;
}

function fmt(value: unknown, digits = 2, unit = "") {
  const n = num(value);
  if (n == null) return "-";
  return `${n.toLocaleString("pt-PT", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}${unit ?` ${unit}` : ""}`;
}

function int(value: unknown, unit = "") {
  const n = num(value);
  if (n == null) return "-";
  return `${Math.round(n).toLocaleString("pt-PT")}${unit ?` ${unit}` : ""}`;
}

function money(value: unknown) {
  const n = num(value);
  if (n == null) return "-";
  return n.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
}

function signedMoney(value: unknown) {
  const n = num(value);
  if (n == null) return "-";
  const abs = Math.abs(n).toLocaleString("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
  return `${n >= 0 ?"+" : "-"}${abs}`;
}

function estimateIrr(cashflows: number[]) {
  let low = -0.95;
  let high = 1;
  const npv = (rate: number) =>
    cashflows.reduce((sum, cash, index) => sum + cash / (1 + rate) ** index, 0);

  for (let i = 0; i < 80; i++) {
    const mid = (low + high) / 2;
    if (npv(mid) > 0) low = mid;
    else high = mid;
  }

  const irr = (low + high) / 2;
  return Number.isFinite(irr) ?irr : null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="report-section mt-8 first:mt-0">
      <h2 className="mb-4 border-b-2 border-amber-400 pb-2 text-xl font-bold text-slate-950">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-950">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <tr className="border-b border-slate-100">
      <td className="w-56 py-2 pr-4 text-sm text-slate-500">{label}</td>
      <td className="py-2 text-sm font-semibold text-slate-950">{value ??"-"}</td>
    </tr>
  );
}

function DataTable({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <table className="w-full">
      <tbody>{rows.map(([label, value]) => <Row key={label} label={label} value={value} />)}</tbody>
    </table>
  );
}

function monthlyArray(value: unknown, annualFallback: unknown, flatFallback = false) {
  const arr = Array.isArray(value)
    ?value.map((item) => num(item) ??0)
    : [];
  if (arr.length >= 12 && arr.some((item) => item > 0)) return arr.slice(0, 12);

  const annual = num(annualFallback) ??0;
  if (annual <= 0) return Array.from({ length: 12 }, () => 0);
  if (flatFallback) return Array.from({ length: 12 }, () => Math.round(annual / 12));
  return PRODUCTION_PROFILE.map((factor) => Math.round(annual * factor));
}

function SvgLineChart({
  data,
  series,
  xAxisLabel,
}: {
  data: Array<Record<string, number | string>>;
  series: Array<{ key: string; label: string; color: string }>;
  xAxisLabel?: string;
}) {
  const width = 760;
  const height = 260;
  const left = 54;
  const right = 24;
  const top = 20;
  const bottom = 42;
  const values = data.flatMap((row) => series.map((item) => Number(row[item.key] ??0)));
  const max = Math.max(1, ...values) * 1.12;
  const xStep = (width - left - right) / Math.max(1, data.length - 1);
  const y = (value: number) => top + (height - top - bottom) * (1 - value / max);
  const x = (index: number) => left + index * xStep;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full rounded-lg border bg-white">
      {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
        const yy = y(max * tick);
        return (
          <g key={tick}>
            <line x1={left} x2={width - right} y1={yy} y2={yy} stroke="#e2e8f0" />
            <text x={left - 10} y={yy + 4} textAnchor="end" fontSize="10" fill="#64748b">
              {Math.round(max * tick).toLocaleString("pt-PT")}
            </text>
          </g>
        );
      })}
      {data.map((row, index) => (
        <text key={String(row.month)} x={x(index)} y={height - 16} textAnchor="middle" fontSize="11" fill="#475569">
          {row.month}
        </text>
      ))}
      {xAxisLabel && (
        <text x={width - right} y={height - 16} textAnchor="start" fontSize="11" fontWeight="700" fill="#334155">
          {xAxisLabel}
        </text>
      )}
      {series.map((item) => {
        const d = data
          .map((row, index) => `${index === 0 ?"M" : "L"} ${x(index)} ${y(Number(row[item.key] ??0))}`)
          .join(" ");
        return (
          <g key={item.key}>
            <path d={d} fill="none" stroke={item.color} strokeWidth="3" strokeLinecap="round" />
            {data.map((row, index) => (
              <circle key={index} cx={x(index)} cy={y(Number(row[item.key] ??0))} r="3" fill={item.color} />
            ))}
          </g>
        );
      })}
      <g transform={`translate(${left}, ${height - 4})`}>
        {series.map((item, index) => (
          <g key={item.key} transform={`translate(${index * 170}, 0)`}>
            <rect width="12" height="4" y="-8" fill={item.color} rx="2" />
            <text x="18" y="-4" fontSize="11" fill="#334155">{item.label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function SvgBarChart({
  data,
  color = "#16a34a",
  label = "Valor",
}: {
  data: Array<{ month: string; value: number }>;
  color?: string;
  label?: string;
}) {
  const width = 760;
  const height = 230;
  const left = 48;
  const right = 20;
  const top = 18;
  const bottom = 38;
  const max = Math.max(1, ...data.map((item) => item.value)) * 1.12;
  const barSlot = (width - left - right) / data.length;
  const barWidth = barSlot * 0.58;
  const y = (value: number) => top + (height - top - bottom) * (1 - value / max);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full rounded-lg border bg-white">
      {[0, 0.5, 1].map((tick) => {
        const yy = y(max * tick);
        return (
          <g key={tick}>
            <line x1={left} x2={width - right} y1={yy} y2={yy} stroke="#e2e8f0" />
            <text x={left - 8} y={yy + 4} textAnchor="end" fontSize="10" fill="#64748b">
              {Math.round(max * tick).toLocaleString("pt-PT")}
            </text>
          </g>
        );
      })}
      {data.map((item, index) => {
        const x = left + index * barSlot + (barSlot - barWidth) / 2;
        const yy = y(item.value);
        const h = height - bottom - yy;
        return (
          <g key={item.month}>
            <rect x={x} y={yy} width={barWidth} height={Math.max(2, h)} rx="4" fill={color} opacity={index >= 3 && index <= 8 ?1 : 0.55} />
            <text x={x + barWidth / 2} y={height - 16} textAnchor="middle" fontSize="11" fill="#475569">{item.month}</text>
          </g>
        );
      })}
      <g transform={`translate(${left}, ${height - 4})`}>
        <rect width="12" height="4" y="-8" fill={color} rx="2" />
        <text x="18" y="-4" fontSize="11" fill="#334155">{label}</text>
      </g>
    </svg>
  );
}

function SvgBatteryStackedChart({
  data,
}: {
  data: Array<{
    month: string;
    autoconsumoDireto: number;
    cargaBateria: number;
    excedenteRestante: number;
    consumo: number;
  }>;
}) {
  const width = 760;
  const height = 270;
  const left = 52;
  const right = 24;
  const top = 18;
  const bottom = 54;
  const maxStack = Math.max(
    1,
    ...data.map((item) => item.autoconsumoDireto + item.cargaBateria + item.excedenteRestante),
    ...data.map((item) => item.consumo),
  ) * 1.12;
  const slot = (width - left - right) / data.length;
  const barWidth = slot * 0.58;
  const y = (value: number) => top + (height - top - bottom) * (1 - value / maxStack);
  const barH = (value: number) => (height - top - bottom) * (value / maxStack);
  const linePoints = data
    .map((item, index) => {
      const x = left + index * slot + slot / 2;
      return `${x},${y(item.consumo)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full rounded-lg border bg-white">
      {[0, 0.5, 1].map((tick) => {
        const yy = y(maxStack * tick);
        return (
          <g key={tick}>
            <line x1={left} x2={width - right} y1={yy} y2={yy} stroke="#e2e8f0" />
            <text x={left - 8} y={yy + 4} textAnchor="end" fontSize="10" fill="#64748b">
              {Math.round(maxStack * tick).toLocaleString("pt-PT")}
            </text>
          </g>
        );
      })}
      {data.map((item, index) => {
        const x = left + index * slot + (slot - barWidth) / 2;
        let cursor = height - bottom;
        const directH = barH(item.autoconsumoDireto);
        const batteryH = barH(item.cargaBateria);
        const exportH = barH(item.excedenteRestante);
        cursor -= directH;
        const directY = cursor;
        cursor -= batteryH;
        const batteryY = cursor;
        cursor -= exportH;
        const exportY = cursor;
        return (
          <g key={item.month}>
            <rect x={x} y={directY} width={barWidth} height={Math.max(0, directH)} fill="#22c55e" />
            <rect x={x} y={batteryY} width={barWidth} height={Math.max(0, batteryH)} fill="#0ea5e9" />
            <rect x={x} y={exportY} width={barWidth} height={Math.max(0, exportH)} rx="3" fill="#f59e0b" />
            <text x={x + barWidth / 2} y={height - 18} textAnchor="middle" fontSize="11" fill="#475569">{item.month}</text>
          </g>
        );
      })}
      <polyline points={linePoints} fill="none" stroke="#64748b" strokeWidth="2" strokeDasharray="5 3" />
      {data.map((item, index) => {
        const x = left + index * slot + slot / 2;
        return <circle key={item.month} cx={x} cy={y(item.consumo)} r="3" fill="#64748b" />;
      })}
      <g transform={`translate(${left}, ${height - 5})`}>
        {[
          ["#22c55e", "Autoconsumo direto"],
          ["#0ea5e9", "Bateria entregue"],
          ["#f59e0b", "Excedente restante"],
          ["#64748b", "Consumo"],
        ].map(([color, label], index) => (
          <g key={label} transform={`translate(${index * 170}, 0)`}>
            <rect width="12" height="6" y="-10" fill={color} rx="2" />
            <text x="18" y="-4" fontSize="11" fill="#334155">{label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function SvgCompareBarChart({
  data,
}: {
  data: Array<{ label: string; value: number; color: string }>;
}) {
  const width = 760;
  const height = 230;
  const left = 60;
  const right = 30;
  const top = 18;
  const bottom = 54;
  const max = Math.max(1, ...data.map((item) => item.value)) * 1.12;
  const slot = (width - left - right) / data.length;
  const barWidth = Math.min(120, slot * 0.5);
  const y = (value: number) => top + (height - top - bottom) * (1 - value / max);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full rounded-lg border bg-white">
      {[0, 0.5, 1].map((tick) => {
        const yy = y(max * tick);
        return (
          <g key={tick}>
            <line x1={left} x2={width - right} y1={yy} y2={yy} stroke="#e2e8f0" />
            <text x={left - 8} y={yy + 4} textAnchor="end" fontSize="10" fill="#64748b">
              {Math.round(max * tick).toLocaleString("pt-PT")}
            </text>
          </g>
        );
      })}
      {data.map((item, index) => {
        const x = left + index * slot + (slot - barWidth) / 2;
        const yy = y(item.value);
        const h = height - bottom - yy;
        return (
          <g key={item.label}>
            <rect x={x} y={yy} width={barWidth} height={Math.max(2, h)} rx="5" fill={item.color} />
            <text x={x + barWidth / 2} y={height - 30} textAnchor="middle" fontSize="12" fill="#334155">{item.label}</text>
            <text x={x + barWidth / 2} y={yy - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0f172a">
              {Math.round(item.value).toLocaleString("pt-PT")}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function renderMapSvg(map: MapReportData | null | undefined) {
  if (!map?.areas?.length) return null;

  const points = map.areas.flatMap((area) => area.points);
  if (!points.length) return null;

  const minLat = Math.min(...points.map((point) => point.lat));
  const maxLat = Math.max(...points.map((point) => point.lat));
  const minLng = Math.min(...points.map((point) => point.lng));
  const maxLng = Math.max(...points.map((point) => point.lng));
  const pad = 24;
  const width = 760;
  const height = 420;
  const spanLat = Math.max(maxLat - minLat, 0.00001);
  const spanLng = Math.max(maxLng - minLng, 0.00001);
  const project = (lat: number, lng: number) => ({
    x: pad + ((lng - minLng) / spanLng) * (width - pad * 2),
    y: pad + ((maxLat - lat) / spanLat) * (height - pad * 2),
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full rounded-lg bg-slate-900">
      <defs>
        <pattern id="map-grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={width} height={height} fill="#132238" />
      <rect width={width} height={height} fill="url(#map-grid)" />
      {map.areas.map((area) => {
        const polygon = area.points.map((point) => {
          const p = project(point.lat, point.lng);
          return `${p.x},${p.y}`;
        }).join(" ");
        const center = area.points.reduce(
          (acc, point) => ({ lat: acc.lat + point.lat / area.points.length, lng: acc.lng + point.lng / area.points.length }),
          { lat: 0, lng: 0 },
        );
        const cp = project(center.lat, center.lng);
        const panelRows = Math.max(1, Math.ceil(area.paineis / 12));
        const panelCols = Math.max(1, Math.min(12, area.paineis));
        return (
          <g key={area.id}>
            <polygon points={polygon} fill={`${area.cor}33`} stroke={area.cor} strokeWidth="4" />
            {Array.from({ length: Math.min(area.paineis, 72) }).map((_, index) => {
              const row = Math.floor(index / panelCols);
              const col = index % panelCols;
              const x = cp.x - (panelCols * 13) / 2 + col * 13;
              const y = cp.y - (panelRows * 8) / 2 + row * 8;
              return (
                <rect
                  key={index}
                  x={x}
                  y={y}
                  width="10"
                  height="6"
                  rx="1"
                  fill="#1e3a5f"
                  stroke="#9ad1ff"
                  strokeWidth=".6"
                  transform={`rotate(${area.rotacao} ${cp.x} ${cp.y})`}
                />
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

function latLngToTile(lat: number, lng: number, zoom: number) {
  const latRad = (lat * Math.PI) / 180;
  const n = 2 ** zoom;
  return {
    x: Math.floor(((lng + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n),
  };
}

function latLngToWorldPixel(lat: number, lng: number, zoom: number) {
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const scale = 256 * 2 ** zoom;
  return {
    x: ((lng + 180) / 360) * scale,
    y:
      (0.5 -
        Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) *
      scale,
  };
}

function reportAreaToMapArea(area: MapReportData["areas"][number]): MapArea {
  return {
    id: area.id,
    nome: area.nome,
    cor: area.cor,
    tipo: area.tipo,
    panelOrientation: area.panelOrientation,
    paineis: area.paineis,
    strings: area.strings,
    rotacao: area.rotacao,
    panelOffsetLat: area.panelOffsetLat,
    panelOffsetLng: area.panelOffsetLng,
    points: area.points,
  };
}

function renderMapOverlaySvg(
  map: MapReportData | null | undefined,
  tile: { x: number; y: number },
  zoom: number,
) {
  if (!map?.areas?.length) return null;

  const width = 768;
  const height = 768;
  const topLeft = {
    x: (tile.x - 1) * 256,
    y: (tile.y - 1) * 256,
  };
  const project = (lat: number, lng: number) => {
    const pixel = latLngToWorldPixel(lat, lng, zoom);
    return {
      x: pixel.x - topLeft.x,
      y: pixel.y - topLeft.y,
    };
  };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="pointer-events-none absolute inset-0 z-10 h-full w-full">
      {map.areas.map((area) => {
        const polygon = area.points.map((point) => {
          const p = project(point.lat, point.lng);
          return `${p.x},${p.y}`;
        }).join(" ");
        const panels = createPanelLayout(reportAreaToMapArea(area), map.panelSpec);

        return (
          <g key={area.id}>
            <polygon
              points={polygon}
              fill={`${area.cor}33`}
              stroke={area.cor}
              strokeWidth="5"
              strokeLinejoin="round"
            />
            {panels.map((panel) => {
              const panelPolygon = panel.corners.map((point) => {
                const p = project(point.lat, point.lng);
                return `${p.x},${p.y}`;
              }).join(" ");
              return (
                <polygon
                  key={panel.id}
                  points={panelPolygon}
                  fill="#19375f"
                  stroke="#a7d7ff"
                  strokeWidth="1"
                />
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

function renderSatelliteTiles(map: MapReportData | null | undefined) {
  const points = map?.areas?.flatMap((area) => area.points) ??[];
  if (!points.length) return null;

  const center = points.reduce(
    (acc, point) => ({
      lat: acc.lat + point.lat / points.length,
      lng: acc.lng + point.lng / points.length,
    }),
    { lat: 0, lng: 0 },
  );
  const zoom = 19;
  const tile = latLngToTile(center.lat, center.lng, zoom);

  return (
    <div className="report-satellite-map overflow-hidden rounded-lg border bg-slate-900">
      <div className="report-satellite-viewport relative aspect-[16/9] overflow-hidden">
        <div className="report-satellite-tile-grid absolute left-1/2 top-1/2 grid aspect-square w-[150%] -translate-x-1/2 -translate-y-1/2 grid-cols-3 grid-rows-3">
          {[-1, 0, 1].flatMap((dy) =>
            [-1, 0, 1].map((dx) => {
              const x = tile.x + dx;
              const y = tile.y + dy;
              return (
                <img
                  key={`${x}-${y}`}
                  src={`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`}
                  alt=""
                  className="block h-full w-full object-cover"
                  crossOrigin="anonymous"
                />
              );
            }),
          )}
          {renderMapOverlaySvg(map, tile, zoom)}
        </div>
      </div>
      <p className="bg-white px-3 py-2 text-xs text-slate-500">
        Imagem satélite centrada na área desenhada. Fonte: Esri World Imagery.
      </p>
    </div>
  );
}

function renderSatelliteMapSvg(map: MapReportData | null | undefined) {
  const points = map?.areas?.flatMap((area) => area.points) ??[];
  if (!points.length) return null;
  const mapData = map as MapReportData;

  const center = points.reduce(
    (acc, point) => ({
      lat: acc.lat + point.lat / points.length,
      lng: acc.lng + point.lng / points.length,
    }),
    { lat: 0, lng: 0 },
  );
  const zoom = 19;
  const tile = latLngToTile(center.lat, center.lng, zoom);
  const width = 768;
  const height = 432;
  const tileScale = 1.5;
  const tileGridSize = 256 * 3 * tileScale;
  const offsetX = (width - tileGridSize) / 2;
  const offsetY = (height - tileGridSize) / 2;
  const topLeft = {
    x: (tile.x - 1) * 256,
    y: (tile.y - 1) * 256,
  };
  const toMapPoint = (lat: number, lng: number) => {
    const pixel = latLngToWorldPixel(lat, lng, zoom);
    return {
      x: (pixel.x - topLeft.x) * tileScale + offsetX,
      y: (pixel.y - topLeft.y) * tileScale + offsetY,
    };
  };
  const clipId = `sat-map-${tile.x}-${tile.y}-${zoom}`;

  return (
    <div className="report-satellite-map overflow-hidden rounded-lg border bg-slate-900">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="report-satellite-svg block h-auto w-full bg-slate-800"
        aria-label="Mapa satélite com implantação fotovoltaica"
      >
        <defs>
          <clipPath id={clipId}>
            <rect x="0" y="0" width={width} height={height} rx="8" />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          {[-1, 0, 1].flatMap((dy) =>
            [-1, 0, 1].map((dx) => {
              const x = tile.x + dx;
              const y = tile.y + dy;
              return (
                <image
                  key={`${x}-${y}`}
                  href={`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`}
                  x={offsetX + (dx + 1) * 256 * tileScale}
                  y={offsetY + (dy + 1) * 256 * tileScale}
                  width={256 * tileScale}
                  height={256 * tileScale}
                  preserveAspectRatio="none"
                  crossOrigin="anonymous"
                />
              );
            }),
          )}
          {mapData.areas.map((area) => {
            const polygon = area.points.map((point) => {
              const p = toMapPoint(point.lat, point.lng);
              return `${p.x},${p.y}`;
            }).join(" ");
            const panels = createPanelLayout(reportAreaToMapArea(area), mapData.panelSpec);

            return (
              <g key={area.id}>
                <polygon points={polygon} fill={`${area.cor}33`} stroke={area.cor} strokeWidth="4" strokeLinejoin="round" />
                {panels.map((panel) => {
                  const panelPolygon = panel.corners.map((point) => {
                    const p = toMapPoint(point.lat, point.lng);
                    return `${p.x},${p.y}`;
                  }).join(" ");
                  return (
                    <polygon key={panel.id} points={panelPolygon} fill="#19375f" stroke="#a7d7ff" strokeWidth="1" />
                  );
                })}
              </g>
            );
          })}
        </g>
      </svg>
      <p className="bg-white px-3 py-2 text-xs text-slate-500">
        Imagem satélite centrada na área desenhada. Fonte: Esri World Imagery.
      </p>
    </div>
  );
}

function renderShadingSvg({
  tilt,
  pitch,
  panelLength,
  mountType,
}: {
  tilt: number;
  pitch: number;
  panelLength: number;
  mountType: string;
}) {
  const width = 760;
  const height = 340;
  const groundY = 260;
  const scale = 54;
  const angle = Math.max(0, Math.min(75, tilt));
  const radians = (angle * Math.PI) / 180;
  const projection = Math.max(0.4, panelLength * Math.cos(radians));
  const panelRise = Math.max(0.1, panelLength * Math.sin(radians));
  const x0 = 95;
  const x1 = x0 + projection * scale;
  const y1 = groundY - panelRise * scale;
  const pitchPx = pitch * scale;
  const x2 = x0 + pitchPx;
  const x3 = x2 + projection * scale;
  const shadowEnd = x1 + Math.max(1.2, pitch - projection - 0.5) * scale;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full rounded-lg border bg-sky-50">
      <rect width={width} height={height} fill="#f0f9ff" />
      <line x1="40" y1={groundY} x2="720" y2={groundY} stroke="#64748b" strokeWidth="2" />
      <circle cx="88" cy="58" r="28" fill="#facc15" stroke="#f59e0b" strokeWidth="4" />
      <text x="62" y="105" fill="#92400e" fontSize="13" fontWeight="700">Sol 21 Dez</text>
      <line x1="112" y1="72" x2={x1} y2={y1} stroke="#f59e0b" strokeWidth="2" strokeDasharray="7 5" />

      <polygon points={`${x1},${y1} ${shadowEnd},${groundY} ${x1},${groundY}`} fill="rgba(100,116,139,.22)" />
      <line x1={x0} y1={groundY} x2={x1} y2={y1} stroke="#0f172a" strokeWidth="12" strokeLinecap="round" />
      <line x1={x2} y1={groundY} x2={x3} y2={groundY - panelRise * scale} stroke="#0f172a" strokeWidth="12" strokeLinecap="round" />

      <line x1={x0} y1="305" x2={x2} y2="305" stroke="#ef4444" strokeWidth="3" />
      <line x1={x0} y1="296" x2={x0} y2="314" stroke="#ef4444" strokeWidth="2" />
      <line x1={x2} y1="296" x2={x2} y2="314" stroke="#ef4444" strokeWidth="2" />
      <text x={(x0 + x2) / 2} y="296" textAnchor="middle" fill="#ef4444" fontSize="15" fontWeight="700">
        Pitch {fmt(pitch, 2, "m")}
      </text>

      <line x1={x0} y1="276" x2={x1} y2="276" stroke="#2563eb" strokeWidth="2" />
      <text x={(x0 + x1) / 2} y="272" textAnchor="middle" fill="#2563eb" fontSize="13" fontWeight="700">
        Projeção {fmt(projection, 2, "m")}
      </text>
      <line x1={x1} y1={y1} x2={x1} y2={groundY} stroke="#16a34a" strokeWidth="2" strokeDasharray="5 4" />
      <text x={x1 + 8} y={(y1 + groundY) / 2} fill="#16a34a" fontSize="12" fontWeight="700">
        Altura {fmt(panelRise, 2, "m")}
      </text>
      <text x="560" y="48" fill="#0f172a" fontSize="14" fontWeight="700">
        {mountType === "coplanar" ?"Telhado coplanar" : "Estrutura em triângulos"} · {fmt(angle, 1, "º")}
      </text>
      <text x="50" y={groundY - 6} fill="#ea580c" fontSize="14" fontWeight="700">Sul</text>
      <text x="690" y={groundY - 6} fill="#475569" fontSize="14" fontWeight="700">Norte</text>
    </svg>
  );
}

function renderDispositionSvg({
  panelCount,
  panelWidth,
  panelHeight,
  pitch,
  mountType,
}: {
  panelCount: number;
  panelWidth: number;
  panelHeight: number;
  pitch: number;
  mountType: string;
}) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(panelCount * 1.7)));
  const rows = Math.max(1, Math.ceil(panelCount / cols));
  const cellW = 34;
  const cellH = 19;
  const rowGap = mountType === "coplanar" ?8 : 34;
  const width = 760;
  const height = Math.max(260, 90 + rows * cellH + (rows - 1) * rowGap + 90);
  const gridW = cols * cellW;
  const startX = (width - gridW) / 2;
  const startY = 64;
  const totalWidth = cols * panelWidth;
  const totalDepth = rows > 1 ?(rows - 1) * pitch + panelHeight : panelHeight;

  return (
    <div className="mt-5 rounded-lg border bg-white p-4">
      <h3 className="mb-3 text-base font-bold text-slate-950">Disposição — Dimensões e Distâncias</h3>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full rounded-lg bg-slate-50">
        <text x={width / 2} y="28" textAnchor="middle" fontSize="15" fontWeight="700" fill="#0f172a">N</text>
        <text x={width / 2} y={height - 18} textAnchor="middle" fontSize="15" fontWeight="700" fill="#0f172a">S</text>
        <text x={width / 2} y="48" textAnchor="middle" fontSize="12" fill="#475569">
          Largura estimada E-O: {fmt(totalWidth, 2, "m")}
        </text>
        {Array.from({ length: panelCount }).map((_, index) => {
          const row = Math.floor(index / cols);
          const col = index % cols;
          const x = startX + col * cellW;
          const y = startY + row * (cellH + rowGap);
          return (
            <rect key={index} x={x} y={y} width={cellW - 3} height={cellH} rx="3" fill="#1d4ed8" stroke="#0f172a" strokeWidth=".8" />
          );
        })}
        {Array.from({ length: Math.max(0, rows - 1) }).map((_, index) => {
          const y = startY + (index + 1) * cellH + index * rowGap + rowGap / 2;
          return (
            <g key={index}>
              <line x1={startX} x2={startX + gridW - 3} y1={y} y2={y} stroke="#ef4444" strokeWidth="2" strokeDasharray="6 4" />
              <text x={startX + gridW + 14} y={y + 4} fontSize="12" fontWeight="700" fill="#ef4444">
                Pitch {fmt(pitch, 2, "m")}
              </text>
            </g>
          );
        })}
        <text x={startX - 24} y={startY + 8} textAnchor="end" fontSize="12" fill="#475569">E-O</text>
        <text x={startX + gridW + 70} y={height - 44} textAnchor="end" fontSize="12" fill="#475569">
          Profundidade N-S: {fmt(totalDepth, 2, "m")}
        </text>
      </svg>
    </div>
  );
}

export default function ReportPreview({ sections, data }: { sections: SectionId[]; data: NewReportData }) {
  const {
    projectName,
    generatedAt,
    customer,
    company,
    draft,
    panel,
    inverters,
    batteries,
    allInverters,
    inverterUnits,
    batteryUnits,
    notes,
  } = data;

  const cliente = draft?.clienteData ??{};
  const consumo = draft?.consumoData ??{};
  const loc = draft?.locData ??{};
  const sizing = draft?.sizing ??{};
  const manual = draft?.manual ??{};
  const map = draft?.reportMapData ??null;
  const orcamento = draft?.orcamentoState ??{};
  const companyName = text(company?.nome) ?? text(orcamento.empresaNome) ?? "SolarDim";
  const companyLogo = text(company?.logoUrl) ?? text(orcamento.empresaLogoUrl);

  const scenarios = (sizing.cenariosDimensionamento as AnyRecord[] | undefined) ??[];
  const activeScenario =
    scenarios.find((scenario) => scenario.tipo === draft?.selectedCenarioTipo) ??
    scenarios[0] ??
    null;

  const panelCount =
    draft?.numPaineisStep5 ??
    num(manual.numPaineis) ??
    num(sizing.numPaineis) ??
    num(map?.totals?.paineis);
  const panelPower = num(panel?.potencia) ?? num(map?.panelSpec?.potenciaWp) ?? num(manual.potenciaWp);
  const installedKwp =
    num(sizing.potenciaInstalada) ??
    (panelCount && panelPower ? (panelCount * panelPower) / 1000 : null);
  const annualEnergy = num(sizing.energiaAnualEstimada) ?? num(activeScenario?.energiaAnualEstimada);
  const annualConsumption =
    num(sizing.consumoAnualAjustado) ??
    num(consumo.consumoAnual) ??
    (num(consumo.consumoMensal) ? Number(consumo.consumoMensal) * 12 : null);
  const energyPrice = num(consumo.precoKwh ?? consumo.tarifaEnergia) ?? 0.18;
  const monthlyProduction = monthlyArray(
    sizing.producaoMensal ?? activeScenario?.producaoMensal,
    annualEnergy,
  );
  const monthlyConsumption = monthlyArray(
    sizing.consumoMensal ?? activeScenario?.consumoMensal,
    num(sizing.consumoAnualAjustado) ??
      num(consumo.consumoAnual) ??
      (num(consumo.consumoMensal) ? Number(consumo.consumoMensal) * 12 : null),
    true,
  );
  const productionChart = MONTHS.map((month, index) => ({
    month,
    producao: monthlyProduction[index] ?? 0,
    consumo: monthlyConsumption[index] ?? 0,
  }));
  const batterySystem = calcBatterySystem(batteryUnits, batteries);
  const batteryBaseScenario = activeScenario
    ?{
        excessoMensal: monthlyArray(activeScenario.excessoMensal, activeScenario.excessoAnual),
        excessoAnual: num(activeScenario.excessoAnual) ??0,
        autoconsumoMensal: monthlyArray(activeScenario.autoconsumoMensal, activeScenario.autoconsumoAnual),
        consumoMensal: monthlyArray(activeScenario.consumoMensal, annualConsumption, true),
        autoconsumoAnual: num(activeScenario.autoconsumoAnual) ??0,
        energiaAnualEstimada: num(activeScenario.energiaAnualEstimada) ??0,
        capacidadeBateriaRecomendada: num(activeScenario.capacidadeBateriaRecomendada),
        poupancaAnual: num(activeScenario.poupancaAnual) ??0,
        investimentoEstimado: num(activeScenario.investimentoEstimado) ??0,
      }
    : null;
  const batteryStudy = batterySystem && batteryBaseScenario
    ?calcBatteryStudy(
        batterySystem,
        batteryBaseScenario,
        num(consumo.perfilDiurnoPct) ??50,
        energyPrice,
        {
          percVazio: num(sizing.percVazio ??consumo.percVazio) ??0,
          percCheio: num(sizing.percCheio ??consumo.percCheio) ??0,
          percPonta: num(sizing.percPonta ??consumo.percPonta) ??0,
        },
      )
    : null;
  const batteryChartData = batteryStudy && batteryBaseScenario
    ?MONTHS.map((month, index) => ({
        month,
        autoconsumoDireto: batteryBaseScenario.autoconsumoMensal[index] ??0,
        cargaBateria: batteryStudy.entregueMensal[index] ??0,
        excedenteRestante: batteryStudy.excedenteRestanteMensal[index] ??0,
        consumo: batteryBaseScenario.consumoMensal[index] ??0,
      }))
    : [];
  const batteryExportRemaining = batteryStudy
    ?batteryStudy.excedenteRestanteMensal.reduce((sum, value) => sum + value, 0)
    : null;
  const annualSavings =
    num(sizing.poupancaAnual) ??
    num(activeScenario?.poupancaAnual) ??
    num(orcamento.poupancaAnual);
  const currentBill = annualConsumption ? annualConsumption * energyPrice : null;
  const investment =
    num(draft?.investimentoManual) ??
    num(sizing.investimentoEstimado) ??
    num(activeScenario?.investimentoEstimado) ??
    num(orcamento.totalComIva) ??
    num(orcamento.totalFinal);
  const escalationRate = 0.03;
  const degradationRate = 0.005;
  const discountRate = 0.04;
  const annualProjection = Array.from({ length: 25 }, (_, index) => {
    const year = index + 1;
    const yearlySaving = (annualSavings ??0) *
      (1 - degradationRate) ** (year - 1) *
      (1 + escalationRate) ** (year - 1);
    return { year, yearlySaving };
  }).reduce<Array<{ year: number; yearlySaving: number; accumulated: number; npvAccumulated: number }>>(
    (rows, item) => {
      const previous = rows[rows.length - 1];
      const accumulated = (previous?.accumulated ?? -(investment ?? 0)) + item.yearlySaving;
      const npvAccumulated =
        (previous?.npvAccumulated ?? -(investment ?? 0)) +
        item.yearlySaving / (1 + discountRate) ** item.year;
      rows.push({
        year: item.year,
        yearlySaving: item.yearlySaving,
        accumulated,
        npvAccumulated,
      });
      return rows;
    },
    [],
  );
  const paybackReal = annualProjection.find((row) => row.accumulated >= 0)?.year ?? null;
  const payback = paybackReal ?? (annualSavings && investment ? investment / annualSavings : num(activeScenario?.paybackAnos));
  const npv25 = annualProjection[24]?.npvAccumulated ?? null;
  const p25 = annualProjection[24]?.accumulated ?? null;
  const irr = investment
    ?estimateIrr([-(investment ??0), ...annualProjection.map((row) => row.yearlySaving)])
    : null;
  const billReduction = currentBill && annualSavings ?Math.round((annualSavings / currentBill) * 100) : null;
  const cumulativeSavingsData = annualProjection.map((row) => ({
    month: String(row.year),
    poupanca: row.accumulated,
    investimento: 0,
  }));
  const roi25 = investment && p25 != null ?(p25 / investment) * 100 : null;
  const budgetVatRate = num(orcamento.taxaIva) ??23;
  const budgetLines = Array.isArray(orcamento.linhas) ?orcamento.linhas as AnyRecord[] : [];
  const budgetSubtotalFromLines = budgetLines.reduce((acc, line) => {
    const qty = num(line.quantidade) ??0;
    const unit = num(line.precoUnitario) ??0;
    return acc + qty * unit;
  }, 0);
  const budgetVatFromLines = budgetLines.reduce((acc, line) => {
    const qty = num(line.quantidade) ??0;
    const unit = num(line.precoUnitario) ??0;
    const vat = num(line.ivaPerc) ??budgetVatRate;
    return acc + qty * unit * (vat / 100);
  }, 0);
  const budgetTotalFromLines = budgetSubtotalFromLines + budgetVatFromLines;
  const budgetTotal =
    budgetTotalFromLines > 0 ?budgetTotalFromLines :
    num(orcamento.totalComIva) ??
    num(orcamento.totalFinal) ??
    investment;
  const budgetSubtotal =
    budgetSubtotalFromLines > 0 ?budgetSubtotalFromLines :
    num(orcamento.subtotal) ??
    num(orcamento.totalSemIva) ??
    (budgetTotal != null ?budgetTotal / (1 + budgetVatRate / 100) : null);
  const budgetVat =
    budgetVatFromLines > 0 ?budgetVatFromLines :
    num(orcamento.valorIva) ??
    (budgetTotal != null && budgetSubtotal != null ?budgetTotal - budgetSubtotal : null);

  return (
    <article id="report-content" className="report-root w-full min-w-0 bg-white text-slate-950 shadow-xl print:shadow-none sm:w-[21cm] sm:min-w-[21cm]">
      {sections.includes("cover") && (
        <div className="report-page flex min-h-[70vh] flex-col justify-between p-5 sm:min-h-[29.7cm] sm:p-12">
          <div>
            <div className="flex items-center gap-3">
              {companyLogo ? (
                <img src={companyLogo} alt={companyName} className="h-14 w-20 object-contain" />
              ) : (
                <div className="grid h-12 w-12 place-items-center rounded-lg bg-amber-500 text-2xl font-bold text-white">
                  S
                </div>
              )}
              <div>
                <p className="text-2xl font-black text-slate-950">{companyName}</p>
                <p className="text-sm font-semibold text-slate-500">Relatório técnico fotovoltaico</p>
              </div>
            </div>
            <div className="mt-10 h-2 rounded-full bg-gradient-to-r from-slate-950 via-blue-600 to-amber-400" />
          </div>

          <div className="space-y-6 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
              Estudo completo
            </p>
            <h1 className="text-5xl font-black leading-tight text-slate-950">{projectName}</h1>
            <p className="text-xl text-slate-600">
              {text(customer?.nome) ?? text(cliente.nome) ?? "Cliente"}
            </p>
            <div className="mx-auto grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
              <Metric label="Potência" value={fmt(installedKwp, 2, "kWp")} />
              <Metric label="Painéis" value={panelCount ?int(panelCount) : "-"} />
              <Metric label="Produção anual" value={int(annualEnergy, "kWh")} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3 sm:gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Data</p>
              <p className="font-semibold">{generatedAt}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Morada</p>
              <p className="font-semibold">{text(cliente.morada) ?? text(customer?.morada) ?? "-"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Localização</p>
              <p className="font-semibold">
                {fmt(loc.latitude, 4, "º")} / {fmt(loc.longitude, 4, "º")}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="report-page min-h-[70vh] space-y-6 p-5 sm:min-h-[29.7cm] sm:space-y-8 sm:p-12">
        {sections.includes("page1Client") && (
          <Section title="1. Cliente e localização">
            <div className="grid grid-cols-3 gap-6">
              <DataTable
                rows={[
                  ["Empresa", companyName],
                  ["NIF", text(company?.nif) ?? text(orcamento.empresaNif) ?? "-"],
                  ["Telefone", text(company?.telefone) ?? text(orcamento.empresaTelefone) ?? "-"],
                  ["Email", text(company?.email) ?? text(orcamento.empresaEmail) ?? "-"],
                  ["Morada", text(company?.morada) ?? text(orcamento.empresaMorada) ?? "-"],
                ]}
              />
              <DataTable
                rows={[
                  ["Nome", text(cliente.nome) ?? text(customer?.nome) ?? "-"],
                  ["Email", text(cliente.email) ?? text(customer?.email) ?? "-"],
                  ["Telefone", text(cliente.telefone) ?? text(customer?.telefone) ?? "-"],
                  ["Tipo de cliente", text(cliente.tipoCliente) ?? text(customer?.tipoCliente) ?? "-"],
                  ["Morada", text(cliente.morada) ?? text(customer?.morada) ?? "-"],
                  ["Tarifa", text(cliente.tipoTarifa) ?? text(consumo.tipoTarifa) ?? "-"],
                  ["Potência contratada", fmt(cliente.potenciaContratada ?? consumo.potenciaContratada, 2, "kVA")],
                ]}
              />
              <DataTable
                rows={[
                  ["Latitude", fmt(loc.latitude, 5, "º")],
                  ["Longitude", fmt(loc.longitude, 5, "º")],
                  ["Inclinação", fmt(loc.inclinacao, 1, "º")],
                  ["Azimute", fmt(loc.azimute, 1, "º")],
                  ["Município", text(loc.municipio) ??"-"],
                  ["Tipo de projeto", text(draft?.tipoProjeto) ??"-"],
                ]}
              />
            </div>
          </Section>
        )}

        {sections.includes("page2Consumption") && (
          <Section title="2. Consumos">
            <div className="mb-5 grid grid-cols-4 gap-3">
              <Metric label="Consumo diário" value={fmt(sizing.consumoDiario, 1, "kWh/dia")} />
              <Metric label="Consumo anual" value={int(sizing.consumoAnualAjustado ??consumo.consumoAnual, "kWh")} />
              <Metric label="Preço energia" value={fmt(consumo.precoKwh ??consumo.tarifaEnergia, 4, "€/kWh")} />
              <Metric label="Cobertura alvo" value={fmt(consumo.coberturaMeta, 0, "%")} />
            </div>
            <DataTable
              rows={[
                ["Consumo mensal informado", fmt(consumo.consumoMensal, 0, "kWh")],
                ["Percentagem vazio", fmt(sizing.percVazio ??consumo.percVazio, 1, "%")],
                ["Percentagem cheias", fmt(sizing.percCheio ??consumo.percCheio, 1, "%")],
                ["Percentagem ponta", fmt(sizing.percPonta ??consumo.percPonta, 1, "%")],
                ["Bateria incluída", consumo.incluirBateria ?"Sim" : "Não"],
              ]}
            />
          </Section>
        )}

        {sections.includes("page3Profile") && (
          <Section title="3. Perfil de autoconsumo">
            <div className="grid grid-cols-3 gap-3">
              <Metric label="Cenário escolhido" value={text(draft?.selectedCenarioTipo) ??"-"} />
              <Metric label="Cobertura prevista" value={fmt(sizing.coberturaPrevista ??sizing.coberturaReal, 1, "%")} />
              <Metric label="Autoconsumo anual" value={int(sizing.autoconsumoAnual, "kWh")} />
            </div>
            {scenarios.length > 0 && (
              <div className="mt-5 overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-slate-950 text-white">
                    <tr>
                      <th className="px-3 py-2 text-left">Cenário</th>
                      <th className="px-3 py-2 text-right">Painéis</th>
                      <th className="px-3 py-2 text-right">kWp</th>
                      <th className="px-3 py-2 text-right">Produção</th>
                      <th className="px-3 py-2 text-right">Cobertura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios.map((scenario, index) => (
                      <tr key={text(scenario.tipo) ??index} className={index % 2 ?"bg-slate-50" : "bg-white"}>
                        <td className="px-3 py-2 font-semibold">{text(scenario.label) ??text(scenario.tipo)}</td>
                        <td className="px-3 py-2 text-right">{int(scenario.numPaineis)}</td>
                        <td className="px-3 py-2 text-right">{fmt(scenario.potenciaInstalada, 2)}</td>
                        <td className="px-3 py-2 text-right">{int(scenario.energiaAnualEstimada, "kWh")}</td>
                        <td className="px-3 py-2 text-right">{fmt(scenario.coberturaReal, 1, "%")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        )}

        {sections.includes("page4Sizing") && (
          <Section title="4. Pré-dimensionamento fotovoltaico">
            <div className="grid grid-cols-4 gap-3">
              <Metric label="Potência instalada" value={fmt(installedKwp, 2, "kWp")} />
              <Metric label="Painéis" value={panelCount ?int(panelCount) : "-"} />
              <Metric label="HSP" value={fmt(sizing.hsp, 2, "h/dia")} />
              <Metric label="Rendimento" value={fmt(num(sizing.fatorRendimento) ?Number(sizing.fatorRendimento) * 100 : null, 1, "%")} />
            </div>
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-bold text-slate-700">Produção Estimada vs Consumo Mensal</h3>
              <SvgLineChart
                data={productionChart}
                series={[
                  { key: "producao", label: "Produção kWh", color: "#f59e0b" },
                  { key: "consumo", label: "Consumo kWh", color: "#2563eb" },
                ]}
              />
            </div>
          </Section>
        )}

        {sections.includes("page5Equipment") && (
          <Section title="5. Equipamentos selecionados">
            <div className="space-y-5">
              <div className="rounded-lg border p-4">
                <h3 className="font-bold">Módulo fotovoltaico</h3>
                <DataTable
                  rows={[
                    ["Modelo", panel ?`${panel.fabricante} ${panel.nome}` : text(map?.panelSpec?.nome) ??"-"],
                    ["Potência", fmt(panel?.potencia ??map?.panelSpec?.potenciaWp, 0, "Wp")],
                    ["Dimensões", panel?.alturaMm && panel?.larguraMm ?`${fmt(Number(panel.alturaMm) / 1000, 3, "m")} x ${fmt(Number(panel.larguraMm) / 1000, 3, "m")}` : map ?`${fmt(map.panelSpec.alturaM, 3, "m")} x ${fmt(map.panelSpec.larguraM, 3, "m")}` : "-"],
                    ["Voc / Vmp", panel ?`${fmt(panel.voc, 2, "V")} / ${fmt(panel.vmp, 2, "V")}` : "-"],
                    ["Isc / Imp", panel ?`${fmt(panel.isc, 2, "A")} / ${fmt(panel.imp, 2, "A")}` : "-"],
                  ]}
                />
              </div>
              {inverters.map((inverter) => (
                <div key={inverter.id} className="rounded-lg border p-4">
                  <h3 className="font-bold">{inverter.fabricante} {inverter.nome}</h3>
                  <DataTable
                    rows={[
                      ["Potência AC", fmt(inverter.potenciaAc, 2, "kW")],
                      ["Potência DC máx.", fmt(inverter.potenciaDcMax, 2, "kW")],
                      ["MPPT", int(inverter.numMppt)],
                      ["Strings por MPPT", int(inverter.stringsPorMppt)],
                      ["Janela MPPT", `${fmt(inverter.mpptMin, 0, "V")} - ${fmt(inverter.mpptMax, 0, "V")}`],
                    ]}
                  />
                </div>
              ))}
              {batteries.map((battery) => (
                <div key={battery.id} className="rounded-lg border p-4">
                  <h3 className="font-bold">{battery.fabricante} {battery.nome}</h3>
                  <DataTable
                    rows={[
                      ["Capacidade", fmt(battery.capacidade, 2, "kWh")],
                      ["Tecnologia", text(battery.tecnologia) ??"-"],
                      ["Tensão", fmt(battery.tensao, 0, "V")],
                      ["DoD", fmt(battery.profundidadeDescarga, 0, "%")],
                    ]}
                  />
                </div>
              ))}
            </div>
          </Section>
        )}

        {sections.includes("page6Technical") && (
          <Section title="6. Técnica, inversores e strings">
            {inverterUnits.length === 0 ?(
              <p className="rounded-lg border border-dashed p-4 text-sm text-slate-500">Sem configuração técnica de strings guardada.</p>
            ) : (
              <div className="space-y-4">
                {inverterUnits.map((unit, index) => {
                  const inverter = allInverters.find((item) => item.id === unit.inverterId);
                  return (
                    <div key={unit.key ??index} className="rounded-lg border p-4">
                      <h3 className="font-bold">Unidade {index + 1}: {inverter ?`${inverter.fabricante} ${inverter.nome}` : `Inversor ${unit.inverterId}`}</h3>
                      <DataTable
                        rows={[
                          ["Quantidade", int(unit.quantidade ??1)],
                          ["Painéis atribuídos", int(unit.numPaineisOverride)],
                          ["MPPT configurados", int(unit.mpptConfig?.length)],
                        ]}
                      />
                      {unit.mpptConfig && (
                        <div className="mt-3 overflow-hidden rounded border">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-100">
                              <tr>
                                <th className="px-3 py-2 text-left">MPPT</th>
                                <th className="px-3 py-2 text-left">Strings</th>
                                <th className="px-3 py-2 text-right">Total módulos</th>
                              </tr>
                            </thead>
                            <tbody>
                              {unit.mpptConfig.map((row, mpptIndex) => (
                                <tr key={mpptIndex} className="border-t">
                                  <td className="px-3 py-2 font-semibold">MPPT {mpptIndex + 1}</td>
                                  <td className="px-3 py-2">{row.filter((value) => value > 0).join(" + ") || "-"}</td>
                                  <td className="px-3 py-2 text-right font-semibold">{row.reduce((sum, value) => sum + value, 0)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        )}

        {sections.includes("page7Savings") && (
          <Section title="7. Poupança e retorno">
            <div className="grid grid-cols-4 gap-3">
              <Metric label="Investimento" value={money(investment)} />
              <Metric label="Poupança anual" value={money(annualSavings)} />
              <Metric label="Payback" value={fmt(payback, 1, "anos")} />
              <Metric label="Poupança 25 anos" value={money(p25)} />
            </div>
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-bold text-slate-700">Poupança mensal estimada</h3>
              <SvgBarChart
                label="Poupança estimada €"
                data={MONTHS.map((month, index) => ({
                  month,
                  value: (monthlyProduction[index] ??0) * (num(consumo.precoKwh) ??0.18),
                }))}
              />
            </div>
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-bold text-slate-700">Poupança Acumulada a 25 Anos</h3>
              <SvgLineChart
                data={cumulativeSavingsData}
                xAxisLabel="Anos"
                series={[
                  { key: "poupanca", label: "Poupança acumulada €", color: "#16a34a" },
                  { key: "investimento", label: "Investimento €", color: "#ef4444" },
                ]}
              />
            </div>
            {batteryStudy && batteryChartData.length > 0 && (
              <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h3 className="mb-1 text-sm font-bold text-slate-700">Impacto da bateria na poupança</h3>
                <p className="mb-3 text-xs text-slate-500">
                  O excedente carrega primeiro a bateria; apenas o excedente restante é injetado na rede.
                </p>
                <SvgBatteryStackedChart data={batteryChartData} />
                <div className="mt-4 grid grid-cols-4 gap-3">
                  <Metric label="Autoconsumo com bateria" value={`${fmt(batteryStudy.autoconsumoPercComBat, 0, "%")} / ${int(batteryStudy.autoconsumoComBat, "kWh")}`} />
                  <Metric label="Carga anual bateria" value={int(batteryStudy.energiaArmazenadaAnual, "kWh")} />
                  <Metric label="Excedente restante" value={int(batteryExportRemaining, "kWh")} />
                  <Metric label="Poupança adicional" value={money(batteryStudy.poupancaAdicional)} />
                </div>
                <div className="mt-3 overflow-hidden rounded-lg border bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-950 text-white">
                      <tr>
                        <th className="px-3 py-2 text-left">Indicador</th>
                        <th className="px-3 py-2 text-right">Sem bateria</th>
                        <th className="px-3 py-2 text-right">Com bateria</th>
                        <th className="px-3 py-2 text-right">Ganho</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["Autoconsumo anual", int(batteryBaseScenario?.autoconsumoAnual, "kWh"), int(batteryStudy.autoconsumoComBat, "kWh"), `+${int(batteryStudy.ganhoAnual, "kWh")}`],
                        ["Taxa de autoconsumo", fmt(batteryStudy.autoconsumoPercSemBat, 0, "%"), fmt(batteryStudy.autoconsumoPercComBat, 0, "%"), `+${batteryStudy.autoconsumoPercComBat - batteryStudy.autoconsumoPercSemBat} pp`],
                        ["Energia entregue/dia", "-", fmt(batteryStudy.energiaEntregue, 1, "kWh"), int(batteryStudy.energiaEntregueAnual, "kWh/ano")],
                        ["Poupança adicional", "-", money(batteryStudy.poupancaAdicional), money(batteryStudy.poupancaAdicional)],
                      ].map(([label, sem, com, ganho], index) => (
                        <tr key={label} className={index % 2 ?"bg-slate-50" : "bg-white"}>
                          <td className="px-3 py-2 font-semibold">{label}</td>
                          <td className="px-3 py-2 text-right">{sem}</td>
                          <td className="px-3 py-2 text-right">{com}</td>
                          <td className="px-3 py-2 text-right font-semibold text-green-600">{ganho}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="mt-6">
              <h3 className="mb-4 text-base font-bold text-slate-950">Rentabilidade do Investimento</h3>
              <div className="mb-5 grid grid-cols-4 gap-3">
                <div className="rounded-lg bg-slate-50 p-4 text-center">
                  <p className="text-xs text-slate-500">Payback simples</p>
                  <p className="mt-1 text-xl font-bold text-slate-950">
                    {paybackReal ?`${paybackReal} anos` : payback ?`${fmt(payback, 1)} anos` : "-"}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-4 text-center">
                  <p className="text-xs text-slate-500">VAL / NPV a 25 anos</p>
                  <p className={`mt-1 text-xl font-bold ${num(npv25) != null && Number(npv25) >= 0 ?"text-green-600" : "text-red-600"}`}>
                    {money(npv25)}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-4 text-center">
                  <p className="text-xs text-slate-500">TIR estimada</p>
                  <p className="mt-1 text-xl font-bold text-slate-950">
                    {irr != null ?`${fmt(irr * 100, 1)}%` : "-"}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-4 text-center">
                  <p className="text-xs text-slate-500">Redução da fatura</p>
                  <p className="mt-1 text-xl font-bold text-blue-950">
                    {billReduction != null ?`-${billReduction}%` : "-"}
                  </p>
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Detalhe anual (primeiros 10 anos)
                </p>
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">Ano</th>
                        <th className="px-3 py-2 text-right font-medium text-slate-500">Poupança</th>
                        <th className="px-3 py-2 text-right font-medium text-slate-500">Acumulado</th>
                        <th className="px-3 py-2 text-right font-medium text-slate-500">VAL acum.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {annualProjection.slice(0, 10).map((row, index) => {
                        const crossedPayback = row.accumulated >= 0 && (annualProjection[index - 1]?.accumulated ??-1) < 0;
                        return (
                          <tr key={row.year} className={`border-t ${crossedPayback ?"bg-green-50" : ""}`}>
                            <td className="px-3 py-2 font-semibold">Ano {row.year}</td>
                            <td className="px-3 py-2 text-right font-mono text-green-600">{signedMoney(row.yearlySaving)}</td>
                            <td className={`px-3 py-2 text-right font-mono font-semibold ${row.accumulated >= 0 ?"text-green-600" : "text-red-600"}`}>
                              {signedMoney(row.accumulated)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-slate-500">{signedMoney(row.npvAccumulated)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </Section>
        )}

        {sections.includes("page8Shading") && (
          <Section title="8. Sombreamento e espaçamento">
            <div className="grid grid-cols-4 gap-3">
              <Metric label="Inclinação" value={fmt(loc.inclinacao ??map?.tiltDeg, 1, "º")} />
              <Metric label="Pitch" value="4,32 m" />
              <Metric label="Azimute" value={fmt(loc.azimute, 1, "º")} />
              <Metric label="Tipo montagem" value={map?.areas?.[0]?.tipo === "coplanar" ?"Coplanar" : "Triângulos"} />
            </div>
            <div className="mt-5 rounded-lg border bg-slate-50 p-4">
              <p className="text-sm text-slate-600">
                O estudo considera a inclinação definida na localização/técnica e a disposição marcada no mapa.
                Para estruturas em triângulos é usado o pitch início-início configurado no estudo de sombras.
              </p>
            </div>
            <div className="mt-5">
              {renderShadingSvg({
                tilt: num(loc.inclinacao ?? map?.tiltDeg) ?? 30,
                pitch: 4.32,
                panelLength: num(map?.panelSpec?.alturaM) ?? (panel?.alturaMm ? Number(panel.alturaMm) / 1000 : 2.28),
                mountType: map?.areas?.[0]?.tipo ?? "triangulos",
              })}
            </div>
            {renderDispositionSvg({
              panelCount: panelCount ?? map?.totals?.paineis ?? 1,
              panelWidth: num(map?.panelSpec?.larguraM) ?? (panel?.larguraMm ? Number(panel.larguraMm) / 1000 : 1.13),
              panelHeight: num(map?.panelSpec?.alturaM) ?? (panel?.alturaMm ? Number(panel.alturaMm) / 1000 : 2.28),
              pitch: 4.32,
              mountType: map?.areas?.[0]?.tipo ?? "triangulos",
            })}
          </Section>
        )}

        {sections.includes("page9Map") && (
          <Section title="9. Mapa e implantação FV">
            <div className="grid grid-cols-[1.4fr_.8fr] gap-6">
              <div className="space-y-4">
                {renderSatelliteMapSvg(map) ??<div className="rounded-lg border border-dashed p-8 text-center text-slate-500">Mapa satélite ainda não disponível. Abra o passo 9 e guarde a área.</div>}
              </div>
              <div>
                <DataTable
                  rows={[
                    ["Morada", text(map?.morada) ?? text(cliente.morada) ?? "-"],
                    ["Áreas desenhadas", int(map?.totals?.areas)],
                    ["Área disponível", fmt(map?.totals?.areaM2, 2, "m²")],
                    ["Painéis pretendidos", int(map?.totals?.paineisSolicitados ??map?.totals?.paineis)],
                    ["Painéis colocados", int(map?.totals?.paineis)],
                    ["Fora da área", int(map?.totals?.paineisForaArea ??0)],
                    ["Strings", int(map?.totals?.strings)],
                    ["Potência no mapa", fmt(map?.totals?.potenciaKwp, 2, "kWp")],
                    ["Ocupação", fmt(map?.totals?.ocupacao, 0, "%")],
                    ["Inclinação", fmt(map?.tiltDeg, 1, "º")],
                  ]}
                />
              </div>
            </div>
            {map?.areas?.length ?(
              <div className="mt-5 overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-slate-950 text-white">
                    <tr>
                      <th className="px-3 py-2 text-left">Área</th>
                      <th className="px-3 py-2 text-right">m²</th>
                      <th className="px-3 py-2 text-right">Pretendidos</th>
                      <th className="px-3 py-2 text-right">Colocados</th>
                      <th className="px-3 py-2 text-right">Fora</th>
                      <th className="px-3 py-2 text-right">Rotação</th>
                      <th className="px-3 py-2 text-left">Strings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {map.areas.map((area) => (
                      <tr key={area.id} className="border-t">
                        <td className="px-3 py-2 font-semibold">{area.nome}</td>
                        <td className="px-3 py-2 text-right">{fmt(area.areaM2, 2)}</td>
                        <td className="px-3 py-2 text-right">{area.paineis}</td>
                        <td className="px-3 py-2 text-right">{area.paineisColocados ??area.paineis}</td>
                        <td className="px-3 py-2 text-right">{area.paineisForaArea ??0}</td>
                        <td className="px-3 py-2 text-right">{fmt(area.rotacao, 0, "º")}</td>
                        <td className="px-3 py-2">{area.strings.map((item) => `${item.nome}: ${item.paineis}`).join("; ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </Section>
        )}

        {sections.includes("budget") && (
          <Section title="Orçamento">
            <div className="grid grid-cols-3 gap-3">
              <Metric label="Subtotal" value={money(budgetSubtotal)} />
              <Metric label="IVA" value={money(budgetVat)} />
              <Metric label="Total" value={money(budgetTotal)} />
            </div>
          </Section>
        )}

        {sections.includes("notes") && (
          <Section title="Notas e observações">
            <div className="rounded-lg border bg-slate-50 p-4 text-sm leading-6 text-slate-700">
              {notes || "Relatório gerado com base nos dados introduzidos nas páginas 1 a 9 do estudo. Recomenda-se validação final em obra das áreas úteis, sombreamentos reais, estrutura de fixação, distâncias regulamentares e condições de ligação elétrica."}
            </div>
          </Section>
        )}
      </div>
    </article>
  );
}
