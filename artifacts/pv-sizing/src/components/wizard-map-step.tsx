import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Eye,
  Grid3X3,
  Info,
  MapPin,
  Move,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  SatelliteMap,
  createPanelLayout,
  polygonAreaM2,
  type MapPanelSpec,
  type MapArea,
  type MapPoint,
  type MapViewState,
} from "./satellite-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type StringConfig = MapArea["strings"][number];

export type MapReportData = {
  morada: string;
  tiltDeg: number;
  panelSpec: MapPanelSpec;
  areas: Array<{
    id: string;
    nome: string;
    cor: string;
    tipo: MapArea["tipo"];
    panelOrientation?: MapArea["panelOrientation"];
    paineis: number;
    strings: MapArea["strings"];
    rotacao: number;
    panelOffsetLat?: number;
    panelOffsetLng?: number;
    paineisColocados: number;
    paineisForaArea: number;
    areaM2: number;
    points: MapPoint[];
  }>;
  totals: {
    areas: number;
    areaM2: number;
    paineis: number;
    paineisSolicitados: number;
    paineisForaArea: number;
    strings: number;
    potenciaKwp: number;
    ocupacao: number;
  };
};

const AREA_COLORS = ["#2563eb", "#4caf50", "#f59e0b", "#7c3aed"];
const MOVE_STEP_DEGREES = 0.000005;
const DEFAULT_PITCH = 4.32;
const FALLBACK_PANEL: MapPanelSpec = {
  nome: "Painel selecionado",
  potenciaWp: 450,
  larguraM: 1.134,
  alturaM: 2.279,
};

function panelOffset(area: MapArea, delta: Partial<MapPoint>) {
  return {
    panelOffsetLat: (area.panelOffsetLat ??0) + (delta.lat ??0),
    panelOffsetLng: (area.panelOffsetLng ??0) + (delta.lng ??0),
  };
}

function orientationLabel(rotacao: number) {
  if (rotacao === 0) return "Sul (0º)";
  if (rotacao > 0) return `Nascente (${rotacao}º)`;
  return `Poente (${rotacao}º)`;
}

function formatArea(value: number) {
  return `${value.toFixed(2).replace(".", ",")} m2`;
}

function formatPower(value: number) {
  return `${value.toFixed(2).replace(".", ",")} kWp`;
}

function distributeStrings(panelCount: number, prefix = "String") {
  const stringsCount = Math.max(1, Math.ceil(panelCount / 20));
  const base = Math.floor(panelCount / stringsCount);
  const rest = panelCount % stringsCount;

  return Array.from({ length: stringsCount }, (_, index) => ({
    nome: `${prefix} ${index + 1}`,
    paineis: base + (index < rest ?1 : 0),
  }));
}

export default function WizardMapStep({
  morada = "",
  panelSpec = FALLBACK_PANEL,
  suggestedPanels,
  tiltDeg = 30,
  onReportChange,
}: {
  morada?: string;
  panelSpec?: MapPanelSpec;
  suggestedPanels?: number | null;
  tiltDeg?: number;
  onReportChange?: (data: MapReportData) => void;
}) {
  const [areas, setAreas] = useState<MapArea[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [draftPoints, setDraftPoints] = useState<MapPoint[]>([]);
  const [tipo, setTipo] = useState<MapArea["tipo"]>("triangulos");
  const [panelOrientation, setPanelOrientation] = useState<NonNullable<MapArea["panelOrientation"]>>("horizontal");
  const [stringMode, setStringMode] = useState<"auto" | "manual">("auto");
  const [showStringLines, setShowStringLines] = useState(true);
  const [mapView, setMapView] = useState<MapViewState | null>(null);

  const storageKey = `pv-map-step-${morada || "default"}`;
  const selectedArea = areas.find((area) => area.id === selectedId) ??null;
  const displayedTilt = Number.isFinite(tiltDeg) ?tiltDeg : 30;

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as {
        areas?: MapArea[];
        selectedId?: string | null;
        stringMode?: "auto" | "manual";
        panelOrientation?: NonNullable<MapArea["panelOrientation"]>;
        mapView?: MapViewState | null;
      };

      if (Array.isArray(parsed.areas)) {
        setAreas(parsed.areas);
        setSelectedId(parsed.selectedId ??null);
        setStringMode(parsed.stringMode ??"auto");
        setPanelOrientation(parsed.panelOrientation ??"horizontal");
        setMapView(parsed.mapView ??null);
      }
    } catch {
      console.warn("Nao foi possivel carregar o mapa guardado.");
    }
  }, [storageKey]);

  useEffect(() => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ areas, selectedId, stringMode, panelOrientation, mapView }),
    );
  }, [areas, selectedId, stringMode, panelOrientation, mapView, storageKey]);

  useEffect(() => {
    if (!selectedArea) return;
    setTipo(selectedArea.tipo);
    setPanelOrientation(selectedArea.panelOrientation ??"horizontal");
  }, [selectedArea?.id]);

  const areaStats = useMemo(
    () =>
      areas.map((area) => ({
        id: area.id,
        areaM2: polygonAreaM2(area.points),
      })),
    [areas],
  );

  const areaPanelStats = useMemo(
    () =>
      areas.map((area) => {
        const panels = createPanelLayout(area, panelSpec);
        const placed = panels.length;
        return {
          id: area.id,
          placed,
          outside: Math.max(0, area.paineis - placed),
          strings: area.strings.map((string, index) => {
            const stringPlaced = panels.filter((panel) => panel.stringIndex === index).length;
            return {
              requested: string.paineis,
              placed: stringPlaced,
              outside: Math.max(0, string.paineis - stringPlaced),
            };
          }),
        };
      }),
    [areas, panelSpec],
  );

  const totals = useMemo(() => {
    const requestedPanels = areas.reduce((sum, area) => sum + area.paineis, 0);
    const placedPanels = areaPanelStats.reduce((sum, item) => sum + item.placed, 0);
    const outsidePanels = Math.max(0, requestedPanels - placedPanels);
    const totalArea = areaStats.reduce((sum, item) => sum + item.areaM2, 0);

    return {
      areas: areas.length,
      areaM2: totalArea,
      paineis: placedPanels,
      paineisSolicitados: requestedPanels,
      paineisForaArea: outsidePanels,
      strings: areas.reduce((sum, area) => sum + area.strings.length, 0),
      potenciaKwp: (placedPanels * panelSpec.potenciaWp) / 1000,
      ocupacao:
        totalArea > 0
          ?Math.min(
              100,
              (placedPanels * panelSpec.larguraM * panelSpec.alturaM * 100) /
                totalArea,
            )
          : 0,
    };
  }, [areas, areaStats, areaPanelStats, panelSpec]);

  const reportData = useMemo<MapReportData>(
    () => ({
      morada,
      tiltDeg: displayedTilt,
      panelSpec,
      areas: areas.map((area) => ({
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
        paineisColocados: areaPanelStats.find((item) => item.id === area.id)?.placed ??0,
        paineisForaArea: areaPanelStats.find((item) => item.id === area.id)?.outside ??0,
        areaM2: areaStats.find((item) => item.id === area.id)?.areaM2 ??0,
        points: area.points,
      })),
      totals,
    }),
    [areas, morada, panelSpec, totals, displayedTilt, areaStats, areaPanelStats],
  );

  useEffect(() => {
    onReportChange?.(reportData);
  }, [onReportChange, reportData]);

  const updateSelected = (patch: Partial<MapArea>) => {
    if (!selectedArea) return;

    setAreas((prev) =>
      prev.map((area) =>
        area.id === selectedArea.id ?{ ...area, ...patch } : area,
      ),
    );
  };

  const closeArea = () => {
    if (draftPoints.length < 3) return;

    const n = areas.length + 1;
    const panelCount =
      n === 1 ?Math.max(1, suggestedPanels ??36) : n === 2 ?28 : 20;
    const nova: MapArea = {
      id: `area-${Date.now()}`,
      nome: `Area ${n}`,
      cor: AREA_COLORS[(n - 1) % AREA_COLORS.length],
      tipo,
      panelOrientation,
      paineis: panelCount,
      strings: distributeStrings(panelCount),
      rotacao: n === 1 ?0 : n === 2 ?90 : -90,
      panelOffsetLat: 0,
      panelOffsetLng: 0,
      points: draftPoints,
    };

    setAreas((prev) => [...prev, nova]);
    setSelectedId(nova.id);
    setDraftPoints([]);
    setDrawing(false);
  };

  const deleteSelected = () => {
    if (!selectedArea) return;

    setAreas((prev) => prev.filter((area) => area.id !== selectedArea.id));
    setSelectedId(null);
  };

  const updateString = (
    area: MapArea,
    index: number,
    patch: Partial<StringConfig>,
  ) => {
    const strings = area.strings.map((item, i) =>
      i === index ?{ ...item, ...patch } : item,
    );
    const paineis = strings.reduce((sum, item) => sum + item.paineis, 0);

    updateSelected({ strings, paineis });
  };

  const removeString = (area: MapArea, index: number) => {
    if (area.strings.length <= 1) return;

    const strings = area.strings.filter((_, i) => i !== index);
    const paineis = Math.max(
      1,
      strings.reduce((sum, item) => sum + item.paineis, 0),
    );

    updateSelected({ strings, paineis });
  };

  const addString = () => {
    if (!selectedArea) return;

    updateSelected({
      strings: [
        ...selectedArea.strings,
        { nome: `String ${selectedArea.strings.length + 1}`, paineis: 1 },
      ],
      paineis: selectedArea.paineis + 1,
    });
  };

  const areaMetric = (areaId: string) =>
    areaStats.find((item) => item.id === areaId)?.areaM2 ??0;
  const panelMetric = (areaId: string) =>
    areaPanelStats.find((item) => item.id === areaId) ??{ placed: 0, outside: 0, strings: [] };
  const stringMetric = (areaId: string, index: number) =>
    panelMetric(areaId).strings[index] ??{ requested: 0, placed: 0, outside: 0 };

  return (
    <div className="-mx-1 -mt-3 space-y-4 sm:-mx-2 sm:-mt-4">
      <div className="grid grid-cols-1 gap-4 xl:min-h-[780px] xl:grid-cols-[300px_minmax(520px,1fr)_300px]">
        <aside className="order-2 space-y-4 rounded-lg border bg-white p-3 shadow-sm sm:p-4 xl:order-1">
          <div>
            <h2 className="text-xl font-bold">Mapa Satelite</h2>
            <p className="mt-1 text-sm text-slate-600">
              Desenhe as areas disponiveis e adicione os paineis.
            </p>
          </div>

          <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-slate-700">
                Localizacao da instalacao
              </p>
            <div className="rounded-md border bg-slate-50 p-3">
              <div className="flex items-start gap-2 text-sm font-semibold text-slate-800">
                <MapPin className="mt-0.5 h-4 w-4 text-blue-600" />
                <span>{morada || "Sao Pedro do Sul, Portugal"}</span>
              </div>
              <Button type="button" variant="outline" className="mt-3 w-full">
                Alterar localizacao
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase text-slate-700">
              Tipo de instalacao
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={tipo === "triangulos" ?"default" : "outline"}
                onClick={() => {
                  setTipo("triangulos");
                  if (selectedArea) updateSelected({ tipo: "triangulos" });
                }}
              >
                Estrutura
              </Button>
              <Button
                type="button"
                variant={tipo === "coplanar" ?"default" : "outline"}
                onClick={() => {
                  setTipo("coplanar");
                  if (selectedArea) updateSelected({ tipo: "coplanar" });
                }}
              >
                Coplanar
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                type="button"
                variant={panelOrientation === "horizontal" ?"default" : "outline"}
                onClick={() => {
                  setPanelOrientation("horizontal");
                  if (selectedArea) updateSelected({ panelOrientation: "horizontal" });
                }}
              >
                Horizontal
              </Button>
              <Button
                type="button"
                variant={panelOrientation === "vertical" ?"default" : "outline"}
                onClick={() => {
                  setPanelOrientation("vertical");
                  if (selectedArea) updateSelected({ panelOrientation: "vertical" });
                }}
              >
                Vertical
              </Button>
            </div>
          </div>

          <div className="rounded-md border bg-white p-3">
            <p className="text-xs font-semibold text-slate-700">
              Parametros de sombreamento
            </p>
            <div className="mt-3 grid grid-cols-2 divide-x rounded-md border bg-slate-50">
              <div className="p-3">
                <p className="text-xs text-slate-500">Pitch inicio-inicio</p>
                <strong className="text-xl text-blue-600">
                  {DEFAULT_PITCH.toFixed(2).replace(".", ",")} m
                </strong>
              </div>
              <div className="p-3">
                <p className="text-xs text-slate-500">Inclinacao</p>
                <strong className="text-xl text-slate-900">
                  {displayedTilt.toFixed(2).replace(".", ",")}º
                </strong>
              </div>
            </div>
            <div className="mt-3 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
              <strong className="block text-slate-900">{panelSpec.nome}</strong>
              {panelSpec.potenciaWp} Wp -{" "}
              {panelSpec.alturaM.toFixed(3).replace(".", ",")} x{" "}
              {panelSpec.larguraM.toFixed(3).replace(".", ",")} m
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase text-slate-700">
              Areas do projeto
            </p>
            <div className="space-y-2">
              {areas.map((area) => (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => setSelectedId(area.id)}
                  className={`w-full rounded-md border p-3 text-left ${
                    selectedId === area.id
                      ?"border-blue-500 bg-blue-50"
                      : "bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 font-semibold">
                      <span
                        className="h-3 w-3 rounded-sm"
                        style={{ backgroundColor: area.cor }}
                      />
                      {area.nome}
                    </span>
                    <span className="text-sm font-semibold">
                      {formatArea(areaMetric(area.id))}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-slate-600">
                    <span>{orientationLabel(area.rotacao)}</span>
                    <span>
                      {panelMetric(area.id).placed}/{area.paineis} paineis
                    </span>
                  </div>
                  {panelMetric(area.id).outside > 0 && (
                    <div className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                      {panelMetric(area.id).outside} fora da area
                    </div>
                  )}
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                setDrawing(true);
                setDraftPoints([]);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Adicionar area
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase text-slate-700">
              Ferramentas de desenho
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Button
                type="button"
                size="sm"
                variant={drawing ?"default" : "outline"}
                className="h-16 flex-col gap-1 text-xs"
                onClick={() => {
                  setDrawing((value) => !value);
                  setDraftPoints([]);
                }}
              >
                <Pencil className="h-4 w-4" />
                Area
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-16 flex-col gap-1 text-xs"
                disabled={draftPoints.length < 3}
                onClick={closeArea}
              >
                <Plus className="h-4 w-4" />
                Fechar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-16 flex-col gap-1 text-xs"
                disabled={!selectedArea}
                onClick={deleteSelected}
              >
                <Trash2 className="h-4 w-4" />
                Apagar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-16 flex-col gap-1 text-xs"
                onClick={() => {
                  setAreas([]);
                  setSelectedId(null);
                  setDraftPoints([]);
                  localStorage.removeItem(storageKey);
                }}
              >
                <Trash2 className="h-4 w-4" />
                Limpar
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase text-slate-700">Strings</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={stringMode === "auto" ?"default" : "outline"}
                onClick={() => setStringMode("auto")}
              >
                Automatico
              </Button>
              <Button
                type="button"
                variant={stringMode === "manual" ?"default" : "outline"}
                onClick={() => setStringMode("manual")}
              >
                Manual
              </Button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Total de paineis pretendidos</span>
                <strong>{totals.paineisSolicitados}</strong>
              </div>
              <div className="flex justify-between">
                <span>Paineis colocados</span>
                <strong>{totals.paineis}</strong>
              </div>
              <div className="flex justify-between">
                <span>Fora da area</span>
                <strong className={totals.paineisForaArea > 0 ?"text-amber-600" : ""}>
                  {totals.paineisForaArea}
                </strong>
              </div>
            </div>
          </div>
        </aside>

        <main className="order-1 flex h-[calc(100svh-260px)] min-h-[560px] flex-col overflow-hidden rounded-lg border bg-white shadow-sm sm:h-[720px] xl:order-2 xl:h-auto xl:min-h-[820px]">
          <div className="relative min-h-0 flex-1 bg-slate-950">
            <SatelliteMap
              areas={areas}
              selectedId={selectedId}
              drawing={drawing}
              draftPoints={draftPoints}
              address={morada}
              panelSpec={panelSpec}
              showStringLines={showStringLines}
              savedView={mapView}
              onAddPoint={(point) => setDraftPoints((prev) => [...prev, point])}
              onSelectArea={setSelectedId}
              onViewChange={setMapView}
            />

            <div className="pointer-events-none absolute bottom-4 left-4 z-[1000] hidden items-end gap-6 text-white sm:flex">
              <div className="space-y-1 text-xs font-semibold drop-shadow">
                <div className="h-0.5 w-28 bg-white" />
                <div className="flex justify-between">
                  <span>0</span>
                  <span>10</span>
                  <span>20 m</span>
                </div>
              </div>
            </div>

            <div className="absolute bottom-4 left-1/2 z-[1000] hidden -translate-x-1/2 gap-5 rounded-md bg-white/95 px-4 py-3 text-xs shadow-lg sm:flex">
              <span className="flex items-center gap-2">
                <span className="h-4 w-7 rounded border-2 border-dashed border-blue-600" />
                Area selecionada
              </span>
              <span className="flex items-center gap-2">
                <span className="h-3 w-5 rounded-sm bg-[#19375f]" />
                Painel
              </span>
              <span className="flex items-center gap-2">
                <span className="h-0.5 w-8 bg-green-500" />
                String automatica
              </span>
              <span className="flex items-center gap-2">
                <span className="h-0.5 w-8 bg-purple-500" />
                String manual
              </span>
            </div>
          </div>

          <div className="border-t bg-white p-2 sm:p-3">
            <div className="flex flex-col gap-2 rounded-lg border bg-slate-50 p-2 sm:flex-row sm:items-center sm:justify-between sm:p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Move className="h-4 w-4" />
                Mover paineis
              </div>
              <div className="grid grid-cols-3 gap-1 sm:w-40">
                <span />
                <button
                  type="button"
                  className="rounded border bg-white px-2 py-1 text-xs disabled:opacity-40"
                  disabled={!selectedArea}
                  onClick={() =>
                    selectedArea &&
                    updateSelected(
                      panelOffset(selectedArea, {
                        lat: MOVE_STEP_DEGREES,
                      }),
                    )
                  }
                >
                  N
                </button>
                <span />
                <button
                  type="button"
                  className="rounded border bg-white px-2 py-1 text-xs disabled:opacity-40"
                  disabled={!selectedArea}
                  onClick={() =>
                    selectedArea &&
                    updateSelected(
                      panelOffset(selectedArea, {
                        lng: -MOVE_STEP_DEGREES,
                      }),
                    )
                  }
                >
                  O
                </button>
                <button
                  type="button"
                  className="rounded border bg-white px-2 py-1 text-xs disabled:opacity-40"
                  disabled={!selectedArea}
                  onClick={() =>
                    selectedArea &&
                    updateSelected(
                      panelOffset(selectedArea, {
                        lat: -MOVE_STEP_DEGREES,
                      }),
                    )
                  }
                >
                  S
                </button>
                <button
                  type="button"
                  className="rounded border bg-white px-2 py-1 text-xs disabled:opacity-40"
                  disabled={!selectedArea}
                  onClick={() =>
                    selectedArea &&
                    updateSelected(
                      panelOffset(selectedArea, {
                        lng: MOVE_STEP_DEGREES,
                      }),
                    )
                  }
                >
                  E
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  className="flex items-center justify-center gap-2 rounded-md border bg-white px-3 py-2 text-sm disabled:opacity-40"
                  disabled={!selectedArea}
                  onClick={() =>
                    updateSelected({ rotacao: (selectedArea?.rotacao ??0) + 2 })
                  }
                >
                  <RotateCcw className="h-4 w-4" />
                  Rodar
                </button>
                <button type="button" className="flex items-center justify-center gap-2 rounded-md border bg-white px-3 py-2 text-sm">
                  <Grid3X3 className="h-4 w-4" />
                  Grelha
                </button>
                <button type="button" className="flex items-center justify-center gap-2 rounded-md border bg-white px-3 py-2 text-sm">
                  <Info className="h-4 w-4" />
                  Info
                </button>
              </div>
            </div>
          </div>
        </main>

        <aside className="order-3 space-y-4">
          <section className="rounded-lg border bg-white p-4 shadow-sm">
            <h3 className="font-bold">Resumo do projeto</h3>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Areas selecionadas</span>
                <strong>{totals.areas}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Area total disponivel</span>
                <strong>{formatArea(totals.areaM2)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Paineis colocados</span>
                <strong>{totals.paineis}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Fora da area</span>
                <strong className={totals.paineisForaArea > 0 ?"text-amber-600" : ""}>
                  {totals.paineisForaArea}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Potencia instalada</span>
                <strong>{formatPower(totals.potenciaKwp)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Ocupacao do terreno</span>
                <strong>{Math.round(totals.ocupacao)}%</strong>
              </div>
            </div>
            <button type="button" className="mt-4 flex items-center gap-2 text-sm font-semibold text-blue-600">
              Ver detalhes
              <ArrowRight className="h-4 w-4" />
            </button>
          </section>

          <section className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">Strings ({totals.strings})</h3>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                Mostrar linhas
                <input
                  type="checkbox"
                  checked={showStringLines}
                  onChange={(e) => setShowStringLines(e.target.checked)}
                />
              </label>
            </div>

            <div className="mt-4 space-y-3">
              {areas.length === 0 ?(
                <p className="rounded-md border border-dashed p-4 text-sm text-slate-500">
                  Desenhe uma area para criar strings.
                </p>
              ) : (
                areas.flatMap((area) =>
                  area.strings.map((string, index) => {
                    const metric = stringMetric(area.id, index);
                    return (
                      <div key={`${area.id}-${index}`} className="rounded-md border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <strong className="flex items-center gap-2 text-sm">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: area.cor }}
                            />
                            {area.nome} - {string.nome}
                          </strong>
                          <span className="flex items-center gap-2 text-slate-500">
                            <Eye className="h-3.5 w-3.5" />
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">
                          {orientationLabel(area.rotacao)}
                        </p>
                        <div className="mt-2 flex justify-between text-xs">
                          <span>
                            {metric.placed}/{metric.requested} paineis
                          </span>
                          <span>
                            {formatPower(
                              (metric.placed * panelSpec.potenciaWp) / 1000,
                            )}
                          </span>
                        </div>
                        {metric.outside > 0 && (
                          <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                            {metric.outside} por colocar fora da area
                          </p>
                        )}
                      </div>
                    );
                  }),
                )
              )}
            </div>

            {selectedArea && (
              <div className="mt-4 space-y-3 rounded-md border bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">Editar {selectedArea.nome}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={deleteSelected}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Area
                  </Button>
                </div>

                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-slate-600">
                    Numero de paineis da area
                  </span>
                  <Input
                    type="number"
                    min={1}
                    value={selectedArea.paineis}
                    onChange={(e) => {
                      const paineis = Math.max(1, Number(e.target.value) || 1);
                      updateSelected({
                        paineis,
                        strings:
                          stringMode === "auto"
                            ?distributeStrings(paineis)
                            : selectedArea.strings,
                      });
                    }}
                  />
                </label>

                {panelMetric(selectedArea.id).outside > 0 && (
                  <p className="rounded-md bg-amber-50 p-2 text-xs font-semibold text-amber-800">
                    {panelMetric(selectedArea.id).placed} colocados dentro da area;
                    {" "}
                    {panelMetric(selectedArea.id).outside} ficaram fora por falta de espaco.
                  </p>
                )}

                {stringMode === "auto" && (
                  <p className="rounded-md bg-blue-50 p-2 text-xs text-blue-900">
                    Em modo automatico, as strings sao recriadas ao alterar o numero de paineis.
                    Para editar ou eliminar strings, mude para Manual.
                  </p>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                   onClick={() =>
                      updateSelected(
                        panelOffset(selectedArea, {
                          lng: -MOVE_STEP_DEGREES,
                        }),
                      )
                    }
                  >
                    O
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                   onClick={() =>
                      updateSelected(
                        panelOffset(selectedArea, {
                          lat: MOVE_STEP_DEGREES,
                        }),
                      )
                    }
                  >
                    N
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                   onClick={() =>
                      updateSelected(
                        panelOffset(selectedArea, {
                          lng: MOVE_STEP_DEGREES,
                        }),
                      )
                    }
                  >
                    E
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      updateSelected({ rotacao: (selectedArea.rotacao ??0) - 2 })
                    }
                  >
                    -2
                  </Button>
                  <div className="grid place-items-center rounded-md border bg-white text-sm font-semibold">
                    {selectedArea.rotacao}º
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      updateSelected({ rotacao: (selectedArea.rotacao ??0) + 2 })
                    }
                  >
                    +2
                  </Button>
                </div>
                {stringMode === "manual" && (
                  <div className="space-y-2">
                    {selectedArea.strings.map((string, index) => (
                      <div
                        key={`${string.nome}-${index}`}
                        className="grid grid-cols-[1fr_72px_36px] gap-2"
                      >
                        <Input
                          value={string.nome}
                          onChange={(e) =>
                            updateString(selectedArea, index, {
                              nome: e.target.value,
                            })
                          }
                        />
                        <Input
                          type="number"
                          value={string.paineis}
                          onChange={(e) =>
                            updateString(selectedArea, index, {
                              paineis: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={selectedArea.strings.length <= 1}
                          onClick={() => removeString(selectedArea, index)}
                          title="Eliminar string"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" className="w-full" onClick={addString}>
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar string manual
                    </Button>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="rounded-lg border bg-white p-4 text-sm shadow-sm">
            <h3 className="font-bold">Dicas</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-600">
              <li>Arraste o mapa para encontrar o telhado.</li>
              <li>Use a ferramenta Area para marcar o perimetro.</li>
              <li>Em automatico, as strings acompanham o numero de paineis.</li>
            </ul>
          </section>
        </aside>
      </div>

      <div className="grid gap-4 rounded-lg border bg-white p-3 shadow-sm sm:p-4 xl:grid-cols-[1fr_1fr_1fr]">
        <div>
          <p className="text-sm font-semibold">Orientacoes usadas</p>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm bg-blue-600" />
              Sul (0º)
            </span>
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm bg-green-600" />
              Nascente (90º)
            </span>
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm bg-amber-500" />
              Poente (-90º)
            </span>
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold">Distanciamento aplicado</p>
          <p className="mt-3 text-sm text-slate-600">
            Pitch inicio-inicio: {DEFAULT_PITCH.toFixed(2).replace(".", ",")} m entre fileiras N-S.
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold">Telhado Coplanar</p>
          <p className="mt-3 text-sm text-slate-600">
            Quando selecionado, os paineis ficam encostados sem pitch entre fileiras.
          </p>
        </div>
      </div>
    </div>
  );
}
