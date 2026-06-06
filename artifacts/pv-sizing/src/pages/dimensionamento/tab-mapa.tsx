import { useCallback, useEffect, useRef, useState } from "react";
import { useMapa } from "@/contexts/MapaContext";
import { usePanelCtx } from "@/contexts/PanelContext";
import { useSolar } from "@/contexts/SolarContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Maximize2, Minimize2, Trash2, RotateCcw, Navigation,
  Plus, ChevronDown, ChevronRight, Layers, Zap, Eye, EyeOff,
  MousePointer2, Grid2x2, PencilLine, AlertTriangle, Home,
  Move, ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
  Camera, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface StringState {
  id: string;
  color: string;
  panelCount: number;
  label: string;
}
interface AreaState {
  id: string;
  name: string;
  color: string;
  azimuth: number;
  mountType: "triangulos" | "coplanar";
  maxPanels: number;
  panelW: number;
  panelH: number;
  powerWp: number;
  panelCount: number;
  totalKwp: number;
  roofArea: number;
  orientationLabel: string;
  strings: StringState[];
}
type MapMode = "auto" | "manual" | "select" | "obstacle";
interface LayerState {
  roofs: boolean;
  panels: boolean;
  strings: boolean;
  obstacles: boolean;
}
interface TabMapaProps { isActive?: boolean; }

/* ─── Layer definitions ─────────────────────────────────────────────────── */
const LAYER_DEFS: { key: keyof LayerState; label: string; icon: React.ReactNode; color: string }[] = [
  { key: "roofs",     label: "Telhados",   icon: <Home size={11} />,          color: "#0D2B45" },
  { key: "panels",    label: "Painéis",    icon: <Grid2x2 size={11} />,       color: "#1E88E5" },
  { key: "strings",   label: "Strings",    icon: <Zap size={11} />,           color: "#F5A623" },
  { key: "obstacles", label: "Obstáculos", icon: <AlertTriangle size={11} />, color: "#EF4444" },
];

/* ─── Mode definitions ─────────────────────────────────────────────────── */
const MODE_DEFS: { key: MapMode; label: string; icon: React.ReactNode; cls: string }[] = [
  { key: "auto",     label: "Auto",       icon: <Grid2x2 size={10} />,       cls: "bg-[#0D2B45] text-white" },
  { key: "manual",   label: "Manual",     icon: <PencilLine size={10} />,    cls: "bg-[#1E88E5] text-white" },
  { key: "select",   label: "Selecionar", icon: <MousePointer2 size={10} />, cls: "bg-[#43A047] text-white" },
  { key: "obstacle", label: "Obstáculo",  icon: <AlertTriangle size={10} />, cls: "bg-[#EF4444] text-white" },
];

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function TabMapa({ isActive = false }: TabMapaProps) {
  const { mapData, setMapData } = useMapa();
  const { panel, setPanel } = usePanelCtx();
  const { params: solarParams, results: solarResults } = useSolar();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeReady, setIframeReady] = useState(false);

  /* area state */
  const [areas, setAreas] = useState<AreaState[]>([]);
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [expandedAreaId, setExpandedAreaId] = useState<string | null>(null);

  /* string state */
  const [stringCount, setStringCount] = useState(4);

  /* totals */
  const [totalPanels, setTotalPanels] = useState(0);
  const [totalKwp, setTotalKwp] = useState(0);

  /* layers */
  const [layers, setLayers] = useState<LayerState>({ roofs: true, panels: true, strings: true, obstacles: true });

  /* mode */
  const [mapMode, setMapMode] = useState<MapMode>("auto");

  /* selected panel */
  const [panelSelected, setPanelSelected] = useState(false);
  const [selectedPanelAreaId, setSelectedPanelAreaId] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const prevLocRef = useRef("");
  const activeArea = areas.find(a => a.id === activeAreaId) ?? null;

  /* ── Sync areas → MapaContext so the report always has up-to-date data ── */
  useEffect(() => {
    if (areas.length === 0) return;
    const totalPanels = areas.reduce((s, a) => s + a.panelCount, 0);
    const totalKwp = areas.reduce((s, a) => s + a.totalKwp, 0);
    const totalRoofArea = areas.reduce((s, a) => s + a.roofArea, 0);
    const primary = areas[0];

    /* schematic SVG — bird's-eye panel grid for each area */
    const COLORS = ["#1E88E5","#43A047","#F5A623","#E53935","#8E24AA"];
    const active = areas.filter(a => a.panelCount > 0);
    let schematicSvg = "";
    if (active.length > 0) {
      const W = 500, H = 300, M = 16, GAP = 8;
      const areaW = (W - 2 * M - (active.length - 1) * GAP) / active.length;
      let els = `<rect width="${W}" height="${H}" fill="#1a2744" rx="6"/>`;
      active.forEach((area, i) => {
        const color = COLORS[i % COLORS.length];
        const x = M + i * (areaW + GAP);
        const cnt = area.panelCount;
        const ratio = (area.panelW || 1.13) / (area.panelH || 2.28);
        const cols = Math.max(1, Math.ceil(Math.sqrt(cnt * ratio)));
        const rows = Math.ceil(cnt / cols);
        const labelH = 22;
        const gridH = H - 2 * M - labelH;
        const cellW = areaW / cols, cellH = gridH / rows, p = 1.2;
        els += `<rect x="${x}" y="${M}" width="${areaW}" height="${H - 2 * M}" rx="4" fill="${color}1a" stroke="${color}" stroke-width="1.2"/>`;
        els += `<text x="${x + areaW / 2}" y="${M + 15}" text-anchor="middle" font-size="9.5" fill="${color}" font-weight="700" font-family="system-ui,sans-serif">${area.name}: ${cnt}p · ${area.totalKwp.toFixed(1)} kWp</text>`;
        let n = 0;
        for (let r = 0; r < rows && n < cnt; r++) {
          for (let c = 0; c < cols && n < cnt; c++) {
            const px = x + c * cellW + p, py = M + labelH + r * cellH + p;
            els += `<rect x="${px}" y="${py}" width="${cellW - 2 * p}" height="${cellH - 2 * p}" fill="${color}" opacity="0.85" rx="1"/>`;
            n++;
          }
        }
      });
      schematicSvg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${els}</svg>`;
    }

    setMapData(prev => ({
      ...(prev ?? {}),
      panelCount: totalPanels,
      totalKwp,
      roofArea: totalRoofArea,
      ...(schematicSvg ? { panelSvg: schematicSvg } : {}),
      ...(primary ? {
        panelW: primary.panelW,
        panelH: primary.panelH,
        powerWp: primary.powerWp,
        azimuth: primary.azimuth,
        orientationLabel: primary.orientationLabel,
        mountType: primary.mountType,
      } : {}),
    }));
  }, [areas, setMapData]);

  /* ── postMessage helper ── */
  const post = useCallback((msg: object) => {
    try { iframeRef.current?.contentWindow?.postMessage(JSON.stringify(msg), "*"); }
    catch { /* noop */ }
  }, []);

  /* ── Build per-area update payload ── */
  const areaPayload = useCallback((a: AreaState) => ({
    id: a.id,
    azimuth: a.azimuth,
    mountType: a.mountType,
    panelW: a.panelW,
    panelH: a.panelH,
    powerWp: a.powerWp,
    maxPanels: a.maxPanels,
    panelProjDepth: solarResults.panelProjectedDepth,
    rowSpacing: solarResults.rowSpacing,
  }), [solarResults]);

  /* ── On iframe load ── */
  const onIframeLoad = useCallback(() => {
    setIframeReady(true);
    setTimeout(() => post({ type: "invalidateSize" }), 100);
  }, [post]);

  /* ── Tab activation ── */
  useEffect(() => {
    if (!isActive || !iframeReady) return;
    post({ type: "invalidateSize" });
    const t1 = setTimeout(() => post({ type: "invalidateSize" }), 300);
    const t2 = setTimeout(() => post({ type: "invalidateSize" }), 900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [isActive, iframeReady, post]);

  /* ── Fly to location ── */
  useEffect(() => {
    if (!iframeReady) return;
    const lat = solarParams.latitude, lng = solarParams.longitude;
    if (!lat || !lng) return;
    const key = `${lat},${lng}`;
    if (key === prevLocRef.current) return;
    prevLocRef.current = key;
    const latN = parseFloat(lat), lngN = parseFloat(lng);
    if (isNaN(latN) || isNaN(lngN)) return;
    post({ type: "flyTo", lat: latN, lng: lngN, zoom: 18, name: solarParams.locationName || undefined });
  }, [iframeReady, solarParams.latitude, solarParams.longitude, solarParams.locationName, post]);

  /* ── Re-sync rowSpacing on results change ── */
  useEffect(() => {
    if (!iframeReady) return;
    areas.forEach(a => post({ type: "updateArea", ...areaPayload(a) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iframeReady, solarResults.rowSpacing, solarResults.panelProjectedDepth]);

  /* ── Layer visibility → iframe ── */
  const toggleLayer = useCallback((key: keyof LayerState) => {
    setLayers(prev => {
      const next = { ...prev, [key]: !prev[key] };
      post({ type: "setLayer", name: key, visible: next[key] });
      return next;
    });
  }, [post]);

  /* ── Mode change → iframe ── */
  const changeMode = useCallback((m: MapMode) => {
    setMapMode(m);
    post({ type: "setMode", mode: m });
    if (m !== "select") { setPanelSelected(false); setSelectedPanelAreaId(null); }
  }, [post]);

  /* ── Update area + post to map ── */
  const updateArea = useCallback((id: string, patch: Partial<AreaState>) => {
    setAreas(prev => {
      const next = prev.map(a => a.id === id ? { ...a, ...patch } : a);
      const updated = next.find(a => a.id === id);
      if (updated) post({ type: "updateArea", ...areaPayload(updated), ...patch });
      return next;
    });
  }, [areaPayload, post]);

  /* ── Receive messages from iframe ── */
  useEffect(() => {
    const handle = (e: MessageEvent) => {
      let data: Record<string, unknown>;
      try { data = typeof e.data === "string" ? JSON.parse(e.data) : e.data; }
      catch { return; }

      switch (data.type) {
        case "areaAdded": {
          const newArea: AreaState = {
            id: data.id as string,
            color: data.color as string,
            name: "",  // will be set in setAreas via callback
            azimuth: parseInt(panel.azimuth) || 180,
            mountType: (solarParams.mountType === "coplanar" ? "coplanar" : "triangulos"),
            maxPanels: 0,
            panelW: parseFloat(panel.panelWidth) || 1.13,
            panelH: parseFloat(panel.panelHeight) || 2.28,
            powerWp: parseFloat(panel.panelPower) || 400,
            panelCount: 0, totalKwp: 0, roofArea: 0, orientationLabel: "", strings: [],
          };
          setAreas(prev => {
            const named = { ...newArea, name: `Telhado ${prev.length + 1}` };
            return [...prev, named];
          });
          setActiveAreaId(data.id as string);
          setExpandedAreaId(data.id as string);
          setTimeout(() => post({
            type: "updateArea", id: data.id,
            azimuth: parseInt(panel.azimuth) || 180,
            mountType: solarParams.mountType || "triangulos",
            panelW: parseFloat(panel.panelWidth) || 1.13,
            panelH: parseFloat(panel.panelHeight) || 2.28,
            powerWp: parseFloat(panel.panelPower) || 400,
            maxPanels: 0,
            panelProjDepth: solarResults.panelProjectedDepth,
            rowSpacing: solarResults.rowSpacing,
          }), 50);
          break;
        }
        case "areaSelected":
          setActiveAreaId(data.id as string);
          setExpandedAreaId(data.id as string);
          break;
        case "areaUpdated":
          setAreas(prev => prev.map(a => a.id === data.id ? {
            ...a,
            panelCount: (data.panelCount as number) ?? 0,
            totalKwp: (data.totalKwp as number) ?? 0,
            roofArea: (data.roofArea as number) ?? 0,
            orientationLabel: (data.orientationLabel as string) ?? "",
            ...(typeof data.azimuth === "number" ? { azimuth: data.azimuth as number } : {}),
          } : a));
          break;
        case "areaDeleted":
          setAreas(prev => prev.filter(a => a.id !== data.id));
          setActiveAreaId(prev => prev === data.id ? null : prev);
          break;
        case "summaryUpdated":
          setTotalPanels((data.totalPanels as number) ?? 0);
          setTotalKwp((data.totalKwp as number) ?? 0);
          setMapData(prev => ({
            ...(prev ?? {}),
            panelCount: data.totalPanels as number,
            totalKwp: data.totalKwp as number,
          }));
          break;
        case "stringsUpdated":
          setAreas(prev => prev.map(a =>
            a.id === data.areaId ? { ...a, strings: (data.strings as StringState[]) ?? [] } : a
          ));
          break;
        case "areaAzimuthChanged":
          setAreas(prev => prev.map(a =>
            a.id === data.id ? { ...a, azimuth: data.azimuth as number } : a
          ));
          if (typeof data.azimuth === "number") {
            setPanel(p => ({ ...p, azimuth: String(data.azimuth) }));
          }
          break;
        case "panelSelected":
          setPanelSelected(true);
          setSelectedPanelAreaId(data.areaId as string);
          break;
        case "panelDeselected":
          setPanelSelected(false);
          setSelectedPanelAreaId(null);
          break;
        case "modeChanged":
          setMapMode(data.mode as MapMode);
          break;
        case "screenshotReady":
          setIsCapturing(false);
          setMapData(prev => ({
            ...(prev ?? {}),
            ...(data.dataUrl ? { mapImageDataUrl: data.dataUrl as string } : {}),
            ...(data.panelSvg ? { panelSvg: data.panelSvg as string } : {}),
          }));
          break;
      }
    };
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas.length, panel, solarParams.mountType, solarResults, post, setMapData, setPanel]);

  /* ── Resizable divider ── */
  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const startX = e.clientX, startW = sidebarWidth;
    const onMove = (ev: MouseEvent) => setSidebarWidth(Math.max(220, Math.min(480, startW + ev.clientX - startX)));
    const onUp = () => {
      setIsDragging(false);
      post({ type: "invalidateSize" });
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [sidebarWidth, post]);

  /* ── Fullscreen ── */
  const toggleFullscreen = () => {
    document.fullscreenElement ? document.exitFullscreen?.() : containerRef.current?.requestFullscreen?.();
  };
  useEffect(() => {
    const h = () => { setIsFullscreen(!!document.fullscreenElement); setTimeout(() => post({ type: "invalidateSize" }), 150); };
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, [post]);

  const mapUrl = `${import.meta.env.BASE_URL}map.html`.replace("//", "/");

  /* ─── Selected panel controls ─── */
  const selectedPanelArea = selectedPanelAreaId ? areas.find(a => a.id === selectedPanelAreaId) : null;

  return (
    <div ref={containerRef} className="flex overflow-hidden bg-[#0D2B45]" style={{ height: "calc(100vh - 112px)" }}>

      {/* ── Sidebar ── */}
      <aside className="flex flex-col bg-white border-r border-slate-200 shadow-xl shrink-0 overflow-hidden" style={{ width: sidebarWidth }}>

        {/* Header */}
        <div className="px-4 py-3 border-b bg-[#0D2B45] shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">Editor FV</h2>
              {solarParams.locationName && (
                <p className="text-[10px] text-blue-300 flex items-center gap-1 mt-0.5 truncate">
                  <Navigation size={9} className="shrink-0" /> {solarParams.locationName}
                </p>
              )}
            </div>
            <button onClick={toggleFullscreen} className="p-1.5 rounded hover:bg-white/10 text-white/70 transition-colors shrink-0">
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto min-h-0">

          {/* ── SECTION: Modo ── */}
          <div className="border-b px-3 py-2.5 bg-slate-50">
            <Label className="text-[10px] font-bold text-[#0D2B45] uppercase tracking-wider block mb-1.5">Modo</Label>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
              {MODE_DEFS.map(m => (
                <button key={m.key} type="button"
                  onClick={() => changeMode(m.key)}
                  title={m.label}
                  className={cn(
                    "flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-lg border text-[9px] font-bold transition-all",
                    mapMode === m.key
                      ? m.cls + " border-transparent shadow-sm scale-105"
                      : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                  )}>
                  {m.icon}
                  <span>{m.label}</span>
                </button>
              ))}
            </div>

            {/* Mode hints */}
            {mapMode === "manual" && (
              <div className="mt-1.5 text-[9px] text-[#1E88E5] bg-blue-50 rounded px-2 py-1 border border-blue-100">
                Clique dentro de um telhado para colocar painéis individualmente
              </div>
            )}
            {mapMode === "select" && !panelSelected && (
              <div className="mt-1.5 text-[9px] text-[#43A047] bg-green-50 rounded px-2 py-1 border border-green-100">
                Clique num painel manual (↑↓←→ para mover · Del para apagar)
              </div>
            )}
            {mapMode === "obstacle" && (
              <div className="mt-1.5 text-[9px] text-red-600 bg-red-50 rounded px-2 py-1 border border-red-100">
                Desenhe obstáculos (sombras, chaminés). Clique no obstáculo para apagar.
              </div>
            )}

            {/* Selected panel controls */}
            {mapMode === "select" && panelSelected && (
              <div className="mt-2 rounded-lg border border-green-200 bg-green-50 p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-[#43A047] flex items-center gap-1">
                    <Move size={10} /> Painel selecionado
                    {selectedPanelArea && <span className="font-normal text-slate-500 ml-1">· {selectedPanelArea.name}</span>}
                  </span>
                  <button
                    onClick={() => { post({ type: "deleteSelectedPanel" }); setPanelSelected(false); }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500 text-white text-[9px] font-bold hover:bg-red-600 transition-colors"
                  >
                    <Trash2 size={9} /> Apagar
                  </button>
                </div>
                {/* Nudge arrows */}
                <div className="grid grid-cols-3 gap-1 w-24 mx-auto">
                  <div />
                  <button onClick={() => post({ type: "nudgePanel", dlat: 1 })}
                    onMouseDown={() => {
                      const iv = setInterval(() => post({ type: "nudgePanel", dlat: 1 }), 80);
                      const up = () => { clearInterval(iv); window.removeEventListener("mouseup", up); };
                      window.addEventListener("mouseup", up);
                    }}
                    className="flex items-center justify-center w-8 h-8 rounded bg-white border border-green-300 text-green-700 hover:bg-green-100 active:bg-green-200">
                    <ArrowUp size={12} />
                  </button>
                  <div />
                  <button onClick={() => post({ type: "nudgePanel", dlng: -1 })}
                    onMouseDown={() => {
                      const iv = setInterval(() => post({ type: "nudgePanel", dlng: -1 }), 80);
                      const up = () => { clearInterval(iv); window.removeEventListener("mouseup", up); };
                      window.addEventListener("mouseup", up);
                    }}
                    className="flex items-center justify-center w-8 h-8 rounded bg-white border border-green-300 text-green-700 hover:bg-green-100 active:bg-green-200">
                    <ArrowLeft size={12} />
                  </button>
                  <div className="flex items-center justify-center w-8 h-8 rounded bg-green-100 border border-green-200">
                    <Move size={10} className="text-green-600" />
                  </div>
                  <button onClick={() => post({ type: "nudgePanel", dlng: 1 })}
                    onMouseDown={() => {
                      const iv = setInterval(() => post({ type: "nudgePanel", dlng: 1 }), 80);
                      const up = () => { clearInterval(iv); window.removeEventListener("mouseup", up); };
                      window.addEventListener("mouseup", up);
                    }}
                    className="flex items-center justify-center w-8 h-8 rounded bg-white border border-green-300 text-green-700 hover:bg-green-100 active:bg-green-200">
                    <ArrowRight size={12} />
                  </button>
                  <div />
                  <button onClick={() => post({ type: "nudgePanel", dlat: -1 })}
                    onMouseDown={() => {
                      const iv = setInterval(() => post({ type: "nudgePanel", dlat: -1 }), 80);
                      const up = () => { clearInterval(iv); window.removeEventListener("mouseup", up); };
                      window.addEventListener("mouseup", up);
                    }}
                    className="flex items-center justify-center w-8 h-8 rounded bg-white border border-green-300 text-green-700 hover:bg-green-100 active:bg-green-200">
                    <ArrowDown size={12} />
                  </button>
                  <div />
                </div>
                <p className="text-[9px] text-slate-400 text-center">Ou use ↑↓←→ no teclado</p>
              </div>
            )}
          </div>

          {/* ── SECTION: Layers ── */}
          <div className="border-b">
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50">
              <span className="text-[10px] font-bold text-[#0D2B45] uppercase tracking-wider flex items-center gap-1.5">
                <Layers size={11} className="text-[#1E88E5]" /> Camadas
              </span>
            </div>
            <div className="px-3 py-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {LAYER_DEFS.map(ld => (
                <button key={ld.key} type="button" onClick={() => toggleLayer(ld.key)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-[10px] font-semibold transition-colors",
                    layers[ld.key]
                      ? "border-transparent text-white"
                      : "bg-white border-slate-200 text-slate-400"
                  )}
                  style={layers[ld.key] ? { backgroundColor: ld.color } : undefined}
                >
                  {layers[ld.key] ? <Eye size={10} /> : <EyeOff size={10} />}
                  <span style={{ color: layers[ld.key] ? undefined : ld.color }}>{ld.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── SECTION: Telhados ── */}
          <div className="border-b">
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50">
              <span className="text-[10px] font-bold text-[#0D2B45] uppercase tracking-wider flex items-center gap-1.5">
                <Home size={11} className="text-[#1E88E5]" /> Telhados ({areas.length})
              </span>
              <button onClick={() => post({ type: "startDraw" })}
                className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded bg-[#0D2B45] text-white hover:bg-[#1565C0] transition-colors">
                <Plus size={10} /> Novo
              </button>
            </div>

            {areas.length === 0 && (
              <div className="px-4 py-5 text-center">
                <div className="text-2xl mb-1.5">🏠</div>
                <p className="text-xs text-muted-foreground">Clique em <strong>Novo</strong> ou em <strong>Área</strong> no mapa para desenhar o primeiro telhado.</p>
              </div>
            )}

            <div className="divide-y">
              {areas.map((area) => {
                const isSelected = area.id === activeAreaId;
                const isExpanded = area.id === expandedAreaId;
                return (
                  <div key={area.id} className={cn("transition-colors", isSelected && "bg-blue-50/40")}>
                    {/* Area row */}
                    <div
                      className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-slate-50"
                      onClick={() => { post({ type: "selectArea", id: area.id }); setExpandedAreaId(isExpanded ? null : area.id); }}
                    >
                      <span className="w-3 h-3 rounded-full shrink-0 ring-2 ring-offset-1"
                        style={{ backgroundColor: area.color, "--tw-ring-color": area.color } as React.CSSProperties} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-[#0D2B45] truncate">{area.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {area.panelCount > 0
                            ? `${area.panelCount} painéis · ${area.totalKwp.toFixed(2)} kWp`
                            : "Sem painéis"}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[9px] text-slate-400">{area.azimuth}°</span>
                        {isExpanded ? <ChevronDown size={11} className="text-slate-400" /> : <ChevronRight size={11} className="text-slate-400" />}
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            post({ type: "deleteArea", id: area.id });
                            setAreas(p => p.filter(a => a.id !== area.id));
                          }}
                          className="p-0.5 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>

                    {/* Expanded settings */}
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-1 bg-slate-50/80 border-t border-slate-100 space-y-2.5">
                        {/* Name */}
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Nome</Label>
                          <Input value={area.name}
                            onChange={e => setAreas(prev => prev.map(a => a.id === area.id ? { ...a, name: e.target.value } : a))}
                            className="h-7 text-xs mt-0.5" />
                        </div>
                        {/* Azimuth + mount */}
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Azimute (°)</Label>
                            <Input type="number"
                              value={area.azimuth}
                              onChange={e => updateArea(area.id, { azimuth: parseInt(e.target.value) || 180 })}
                              className="h-7 text-xs mt-0.5" />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Estrutura</Label>
                            <div className="flex mt-0.5 rounded border border-slate-200 overflow-hidden text-[9px] font-bold">
                              {(["triangulos", "coplanar"] as const).map(mt => (
                                <button key={mt} type="button" onClick={() => updateArea(area.id, { mountType: mt })}
                                  className={cn("flex-1 py-1.5 text-center border-r last:border-r-0 transition-colors",
                                    area.mountType === mt ? "bg-[#0D2B45] text-white" : "bg-white text-slate-600 hover:bg-slate-50")}>
                                  {mt === "triangulos" ? "▲ Tri." : "▬ Cop."}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                        {/* Panel dims */}
                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                          {([
                            { label: "Larg (m)", key: "panelW" as const, step: "0.01" },
                            { label: "Alt (m)",  key: "panelH" as const, step: "0.01" },
                            { label: "Potência", key: "powerWp" as const, step: "1"    },
                          ]).map(f => (
                            <div key={f.key}>
                              <Label className="text-[9px] text-muted-foreground leading-tight">{f.label}</Label>
                              <Input type="number" step={f.step}
                                value={area[f.key]}
                                onChange={e => updateArea(area.id, { [f.key]: parseFloat(e.target.value) || 0 })}
                                className="h-7 text-xs mt-0.5 px-1.5" />
                            </div>
                          ))}
                        </div>
                        {/* Max panels */}
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Máx painéis (0 = ∞)</Label>
                          <Input type="number" min="0" value={area.maxPanels}
                            onChange={e => updateArea(area.id, { maxPanels: parseInt(e.target.value) || 0 })}
                            className="h-7 text-xs mt-0.5" />
                        </div>
                        {/* Result chip */}
                        {area.panelCount > 0 && (
                          <div className="flex items-center gap-2 rounded-lg px-2.5 py-2"
                            style={{ backgroundColor: area.color + "18", border: `1px solid ${area.color}40` }}>
                            <span className="text-xl font-extrabold" style={{ color: area.color }}>{area.panelCount}</span>
                            <div className="text-[10px]">
                              <div className="font-bold text-[#0D2B45]">{area.totalKwp.toFixed(2)} kWp</div>
                              <div className="text-muted-foreground truncate">{area.orientationLabel}</div>
                            </div>
                          </div>
                        )}

                        {/* ── Strings ── */}
                        <div className="border-t border-slate-200 pt-2 space-y-1.5">
                          <Label className="text-[10px] font-bold text-[#0D2B45] uppercase tracking-wider flex items-center gap-1">
                            <Zap size={10} className="text-[#F5A623]" /> Strings
                          </Label>
                          <div className="flex items-center gap-1.5">
                            <Input type="number" min="1" max="20" value={stringCount}
                              onChange={e => setStringCount(parseInt(e.target.value) || 1)}
                              className="h-7 text-xs w-14 shrink-0" />
                            <button onClick={() => post({ type: "autoString", areaId: area.id, count: stringCount })}
                              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-[#0D2B45] text-white text-[10px] font-bold hover:bg-[#1565C0] transition-colors">
                              <Zap size={9} /> Auto String
                            </button>
                            <button onClick={() => post({ type: "clearStrings", areaId: area.id })}
                              className="p-1.5 rounded border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                              title="Limpar strings">
                              <RotateCcw size={10} />
                            </button>
                          </div>
                          {area.strings.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {area.strings.map((s, si) => (
                                <span key={s.id} className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[9px] font-bold text-white"
                                  style={{ backgroundColor: s.color }}>
                                  S{si + 1} · {s.panelCount}p
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── SECTION: Totals ── */}
          {areas.length > 0 && (
            <div className="px-4 py-4 space-y-2">
              <Label className="text-[10px] font-bold text-[#0D2B45] uppercase tracking-wider">Total do projeto</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="bg-[#0D2B45] rounded-xl px-3 py-3 text-center">
                  <div className="text-2xl font-extrabold text-white tabular-nums">{totalPanels}</div>
                  <div className="text-[9px] text-blue-300 font-semibold uppercase tracking-wider mt-0.5">Painéis</div>
                </div>
                <div className="bg-[#F5A623] rounded-xl px-3 py-3 text-center">
                  <div className="text-xl font-extrabold text-[#0D2B45] tabular-nums">{totalKwp.toFixed(1)}</div>
                  <div className="text-[9px] text-[#7C4D00] font-semibold uppercase tracking-wider mt-0.5">kWp</div>
                </div>
              </div>
              {areas.length > 1 && (
                <div className="space-y-1 mt-1">
                  {areas.map(a => (
                    <div key={a.id} className="flex items-center gap-2 text-[10px] py-0.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
                      <span className="text-muted-foreground flex-1 truncate">{a.name}</span>
                      <span className="font-semibold text-[#0D2B45] shrink-0 tabular-nums">
                        {a.panelCount} · {a.totalKwp.toFixed(1)} kWp
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Capture for report ── */}
          {areas.length > 0 && (
            <div className="px-4 pb-2">
              <button
                type="button"
                disabled={isCapturing}
                onClick={() => {
                  setIsCapturing(true);
                  post({ type: "requestScreenshot" });
                  setTimeout(() => setIsCapturing(false), 8000);
                }}
                className="w-full flex items-center justify-center gap-2 rounded-lg py-2 px-3 text-[11px] font-semibold transition-colors bg-[#0D2B45] text-white hover:bg-[#1565C0] disabled:opacity-60"
              >
                {isCapturing
                  ? <><Loader2 size={12} className="animate-spin" /> A capturar…</>
                  : <><Camera size={12} /> Capturar Vista para Relatório</>
                }
              </button>
              {(mapData?.mapImageDataUrl || mapData?.panelSvg) && (
                <p className="text-center text-[9px] text-green-600 mt-1 font-medium">✓ Vista guardada no relatório</p>
              )}
            </div>
          )}

          {/* ── Location pin ── */}
          {solarParams.latitude && solarParams.longitude && (
            <div className="px-4 pb-4">
              <button type="button"
                onClick={() => post({ type: "flyTo", lat: parseFloat(solarParams.latitude), lng: parseFloat(solarParams.longitude), zoom: 18, name: solarParams.locationName })}
                className="w-full flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-left hover:bg-slate-100 transition-colors">
                <Navigation size={12} className="text-[#1E88E5] shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold text-[#0D2B45] truncate">
                    {solarParams.locationName || "Centrar no projeto"}
                  </div>
                  <div className="text-[9px] text-muted-foreground">
                    {solarParams.latitude}°, {solarParams.longitude}°
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Resizable divider ── */}
      <div onMouseDown={onDividerMouseDown}
        className={cn("w-1.5 shrink-0 cursor-col-resize transition-colors hover:bg-[#1E88E5]",
          isDragging ? "bg-[#1E88E5]" : "bg-slate-200/40")} />

      {/* ── Map iframe ── */}
      <div className="flex-1 relative overflow-hidden min-w-0 bg-[#0D2B45]">
        <iframe ref={iframeRef} src={mapUrl} onLoad={onIframeLoad}
          className="absolute inset-0 w-full h-full border-none block"
          title="Mapa Satélite" allow="fullscreen" />
      </div>
    </div>
  );
}
