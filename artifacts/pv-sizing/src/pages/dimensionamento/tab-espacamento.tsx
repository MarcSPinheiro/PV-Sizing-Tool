import { useState, useEffect, useRef } from "react";
import { useSolar } from "@/contexts/SolarContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildCrossSectionSvg, buildLayoutSvg, buildCoplanarLayoutSvg } from "@/lib/svg-utils";
import { AlertTriangle, Info, MapPin, Loader2, Zap } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface GeoResult {
  lat: string;
  lon: string;
  display_name: string;
}

export default function TabEspacamento() {
  const { params, setParams, results } = useSolar();

  const [locQuery, setLocQuery] = useState("");
  const [locResults, setLocResults] = useState<GeoResult[]>([]);
  const [locLoading, setLocLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (locQuery.length < 2) { setLocResults([]); setShowDropdown(false); return; }
    const timer = setTimeout(async () => {
      setLocLoading(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locQuery)}&countrycodes=pt&format=json&limit=6&addressdetails=0`;
        const r = await fetch(url, { headers: { "Accept": "application/json" } });
        const data: GeoResult[] = await r.json();
        setLocResults(data);
        setShowDropdown(data.length > 0);
      } catch (_) { /* noop */ }
      setLocLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [locQuery]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectLocation = (r: GeoResult) => {
    const shortName = r.display_name.split(",")[0].trim();
    setLocQuery(shortName);
    setParams(prev => ({
      ...prev,
      latitude: parseFloat(r.lat).toFixed(4),
      longitude: parseFloat(r.lon).toFixed(4),
      locationName: shortName,
    }));
    setShowDropdown(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setParams(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const isCoplanar = params.mountType === "coplanar";
  const totalPanels = (parseInt(params.rows) || 0) * (parseInt(params.cols) || 0);
  const totalPowerKwp = results.totalPowerWp / 1000;
  const inverterPowerNum = parseFloat(params.inverterPower) || 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[#0D2B45] tracking-tight">Espaçamento entre Painéis</h2>
        <p className="text-muted-foreground text-sm mt-1">Cálculo de sombras e distância livre entre fileiras.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* ── Left: inputs ── */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-[#1a3d5c]/10 shadow-md">
            <CardHeader className="bg-slate-50 border-b">
              <CardTitle className="text-lg text-[#0D2B45]">Parâmetros de Entrada</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-5">

              {/* Mount type */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Tipo de Instalação</Label>
                <div className="grid grid-cols-2 gap-0 rounded-lg border border-slate-200 overflow-hidden text-sm font-medium">
                  <button
                    type="button"
                    onClick={() => setParams(prev => ({ ...prev, mountType: "triangulos" }))}
                    className={`px-3 py-2.5 text-center transition-colors ${!isCoplanar ?"bg-[#0D2B45] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    Estrutura Triângulos
                  </button>
                  <button
                    type="button"
                    onClick={() => setParams(prev => ({ ...prev, mountType: "coplanar" }))}
                    className={`px-3 py-2.5 text-center border-l border-slate-200 transition-colors ${isCoplanar ?"bg-[#0D2B45] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    Telhado Coplanar
                  </button>
                </div>
                {isCoplanar && (
                  <p className="text-xs text-muted-foreground bg-slate-50 border rounded px-2 py-1.5">
                    Instalação coplanar: sem distanciamento de sombreamento. Apenas cálculo de potência.
                  </p>
                )}
              </div>

              {/* Location */}
              <div className="space-y-2" ref={dropdownRef}>
                <Label htmlFor="locSearch" className="flex items-center gap-1">
                  <MapPin size={13} className="text-[#1E88E5]" /> Localização
                </Label>
                <div className="relative">
                  <Input
                    type="text"
                    id="locSearch"
                    value={locQuery}
                    onChange={e => setLocQuery(e.target.value)}
                    onFocus={() => locResults.length > 0 && setShowDropdown(true)}
                    placeholder="Ex: São Pedro do Sul"
                    autoComplete="off"
                  />
                  {locLoading && (
                    <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
                  )}
                  {showDropdown && locResults.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-52 overflow-y-auto">
                      {locResults.map((r, i) => (
                        <button
                          key={i}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-[#F0F6FB] border-b border-slate-100 last:border-b-0 text-[#0D2B45]"
                          onMouseDown={() => selectLocation(r)}
                        >
                          <span className="font-medium">{r.display_name.split(",")[0]}</span>
                          <span className="text-xs text-muted-foreground ml-1">
                            {r.display_name.split(",").slice(1, 3).join(",")}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Panel dimensions */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="height">Altura (m)</Label>
                  <Input type="number" id="height" name="height" value={params.height} onChange={handleChange} step="0.01" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="width">Largura (m)</Label>
                  <Input type="number" id="width" name="width" value={params.width} onChange={handleChange} step="0.01" />
                </div>
              </div>

              {/* Angle + Latitude */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {!isCoplanar && (
                  <div className="space-y-2">
                    <Label htmlFor="angle">Inclinação (°)</Label>
                    <Input type="number" id="angle" name="angle" value={params.angle} onChange={handleChange} />
                  </div>
                )}
                <div className={`space-y-2 ${isCoplanar ?"sm:col-span-2" : ""}`}>
                  <Label htmlFor="latitude">Latitude (°)</Label>
                  <Input type="number" id="latitude" name="latitude" value={params.latitude} onChange={handleChange} step="0.0001" />
                </div>
              </div>

              {/* Rows + Cols */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="rows">Nº Fileiras</Label>
                  <Input type="number" id="rows" name="rows" value={params.rows} onChange={handleChange} min="1" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cols">Nº Colunas</Label>
                  <Input type="number" id="cols" name="cols" value={params.cols} onChange={handleChange} min="1" />
                </div>
              </div>

              {/* Energy */}
              <div className="border-t border-slate-100 pt-1">
                <div className="flex items-center gap-1.5 mb-3">
                  <Zap size={13} className="text-[#F5A623]" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Energia</span>
                </div>
                <div className="space-y-2 mb-4">
                  <Label htmlFor="panelPower">Potência do Painel (Wp)</Label>
                  <Input type="number" id="panelPower" name="panelPower" value={params.panelPower} onChange={handleChange} step="5" min="1" placeholder="400" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inverterPower">Potência do Inversor (kW)</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input type="number" id="inverterPower" name="inverterPower" value={params.inverterPower} onChange={handleChange} step="0.1" min="0" placeholder="Ex: 5.0" className="flex-1" />
                    <div className="grid grid-cols-2 gap-0 rounded-lg border border-slate-200 overflow-hidden text-xs font-medium sm:shrink-0">
                      <button type="button" onClick={() => setParams(prev => ({ ...prev, inverterPhase: "mono" }))}
                        className={`px-2.5 py-1.5 transition-colors ${params.inverterPhase === "mono" ?"bg-[#1E88E5] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                        1F
                      </button>
                      <button type="button" onClick={() => setParams(prev => ({ ...prev, inverterPhase: "tri" }))}
                        className={`px-2.5 py-1.5 border-l border-slate-200 transition-colors ${params.inverterPhase === "tri" ?"bg-[#1E88E5] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                        3F
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {params.inverterPhase === "mono" ?"Monofásico" : "Trifásico"}
                    {inverterPowerNum > 0 && ` · ${inverterPowerNum.toFixed(1)} kW`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {!isCoplanar && (
            <Alert variant="default" className="bg-[#EBF5FF] border-[#1E88E5] text-[#0D2B45]">
              <Info className="h-4 w-4 text-[#1E88E5]" />
              <AlertTitle>Otimização 21 Dez</AlertTitle>
              <AlertDescription className="text-sm">
                O cálculo garante zero sombreamento no solstício de inverno (ângulo solar: {results.altitudeAngle.toFixed(1)}°).
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* ── Right: results ── */}
        <div className="lg:col-span-8 space-y-6">
          {!isCoplanar ?(
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border-[#1E88E5] shadow-md bg-[#F0F6FB]">
                  <CardContent className="pt-6">
                    <div className="text-sm text-muted-foreground font-medium">Distância Início→Início (d)</div>
                    <div className="text-4xl font-bold text-[#1E88E5] mt-1">{results.rowSpacing.toFixed(3)} m</div>
                  </CardContent>
                </Card>
                <Card className={results.gap < 0.5 ?"border-[#EF4444] bg-[#FEF2F2]" : "border-[#1a3d5c]/10"}>
                  <CardContent className="pt-6">
                    <div className="text-sm text-muted-foreground font-medium">Espaço livre (Gap)</div>
                    <div className={`text-4xl font-bold mt-1 ${results.gap < 0.5 ?"text-[#EF4444]" : "text-[#0D2B45]"}`}>
                      {results.gap.toFixed(3)} m
                    </div>
                    {results.gap < 0.5 && (
                      <div className="text-xs text-[#EF4444] mt-2 flex items-center gap-1">
                        <AlertTriangle size={14} /> Espaço pode ser insuficiente para manutenção
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                <div className="bg-white p-4 rounded-lg border shadow-sm">
                  <div className="text-xs text-muted-foreground">Projeção Horizontal</div>
                  <div className="text-lg font-semibold text-[#0D2B45]">{results.panelProjectedDepth.toFixed(2)} m</div>
                </div>
                <div className="bg-white p-4 rounded-lg border shadow-sm">
                  <div className="text-xs text-muted-foreground">Comprimento N-S</div>
                  <div className="text-lg font-semibold text-[#0D2B45]">{results.totalLength.toFixed(2)} m</div>
                </div>
                <div className="bg-white p-4 rounded-lg border shadow-sm">
                  <div className="text-xs text-muted-foreground">Largura E-O</div>
                  <div className="text-lg font-semibold text-[#0D2B45]">{results.totalWidth.toFixed(2)} m</div>
                </div>
                <div className="bg-white p-4 rounded-lg border shadow-sm">
                  <div className="text-xs text-muted-foreground">Sombra (L)</div>
                  <div className="text-lg font-semibold text-[#0D2B45]">{results.shadowLength.toFixed(2)} m</div>
                </div>
              </div>

              <Card className="shadow-sm">
                <CardHeader className="py-4 border-b">
                  <CardTitle className="text-base text-[#0D2B45]">Perfil e Sombreamento</CardTitle>
                </CardHeader>
                <CardContent className="p-0 overflow-hidden flex justify-center bg-[#F8FAFC]">
                  <div className="w-full max-w-2xl" dangerouslySetInnerHTML={{ __html: buildCrossSectionSvg(results) }} />
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader className="py-4 border-b">
                  <CardTitle className="text-base text-[#0D2B45]">Disposição (Top-down)</CardTitle>
                </CardHeader>
                <CardContent className="p-0 overflow-hidden flex justify-center bg-[#F0F6FB]">
                  <div className="w-full max-w-md" dangerouslySetInnerHTML={{ __html: buildLayoutSvg(results, parseInt(params.rows) || 1, parseInt(params.cols) || 1) }} />
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              <Alert variant="default" className="bg-[#EBF5FF] border-[#1E88E5] text-[#0D2B45]">
                <Info className="h-4 w-4 text-[#1E88E5]" />
                <AlertTitle>Telhado Coplanar</AlertTitle>
                <AlertDescription className="text-sm">
                  Painéis paralelos à cobertura — sem cálculo de sombras. Potência calculada abaixo.
                </AlertDescription>
              </Alert>
              <Card className="shadow-sm">
                <CardHeader className="py-4 border-b">
                  <CardTitle className="text-base text-[#0D2B45]">Disposição (Top-down)</CardTitle>
                </CardHeader>
                <CardContent className="p-0 overflow-hidden flex justify-center bg-[#F0F6FB]">
                  <div className="w-full max-w-md" dangerouslySetInnerHTML={{
                    __html: buildCoplanarLayoutSvg(
                      parseFloat(params.height) || 1,
                      parseFloat(params.width) || 1,
                      parseInt(params.rows) || 1,
                      parseInt(params.cols) || 1
                    )
                  }} />
                </CardContent>
              </Card>
            </>
          )}

          {/* Resumo do Sistema */}
          <Card className="shadow-sm border-[#0D2B45]/15">
            <CardHeader className="py-4 border-b bg-[#0D2B45]">
              <CardTitle className="text-base text-white tracking-wide">Resumo do Sistema</CardTitle>
            </CardHeader>
            <CardContent className="pt-5 pb-4">
              <div className="mb-5 flex flex-col gap-3 bg-[#F0F6FB] rounded-lg px-4 py-3 border border-[#1E88E5]/20 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Zap size={18} className="text-[#F5A623]" />
                  <span className="text-sm font-semibold text-[#0D2B45]">Potência Total do Sistema</span>
                </div>
                <div className="text-left sm:text-right">
                  <span className="text-2xl font-bold text-[#1E88E5]">
                    {results.totalPowerWp >= 1000 ?`${totalPowerKwp.toFixed(2)} kWp` : `${results.totalPowerWp.toFixed(0)} Wp`}
                  </span>
                  {results.totalPowerWp >= 1000 && (
                    <div className="text-xs text-muted-foreground">{results.totalPowerWp.toFixed(0)} Wp</div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-x-8 gap-y-4 text-sm sm:grid-cols-2 md:grid-cols-3">
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Painel</div>
                  <div className="space-y-1">
                    <div className="flex justify-between gap-4"><span className="text-muted-foreground">Altura</span><span className="font-medium text-[#0D2B45]">{results.panelHeight.toFixed(2)} m</span></div>
                    <div className="flex justify-between gap-4"><span className="text-muted-foreground">Largura</span><span className="font-medium text-[#0D2B45]">{results.panelWidth.toFixed(2)} m</span></div>
                    <div className="flex justify-between gap-4"><span className="text-muted-foreground">Potência</span><span className="font-medium text-[#F5A623]">{params.panelPower} Wp</span></div>
                    {!isCoplanar && <div className="flex justify-between gap-4"><span className="text-muted-foreground">Inclinação</span><span className="font-medium text-[#0D2B45]">{results.panelAngle}°</span></div>}
                    <div className="flex justify-between gap-4"><span className="text-muted-foreground">Latitude</span><span className="font-medium text-[#0D2B45]">{params.latitude}°</span></div>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Array</div>
                  <div className="space-y-1">
                    <div className="flex justify-between gap-4"><span className="text-muted-foreground">Fileiras × Colunas</span><span className="font-medium text-[#0D2B45]">{params.rows} × {params.cols}</span></div>
                    <div className="flex justify-between gap-4"><span className="text-muted-foreground">Total painéis</span><span className="font-medium text-[#0D2B45]">{totalPanels} un.</span></div>
                    {!isCoplanar && <>
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Comprimento N-S</span><span className="font-medium text-[#0D2B45]">{results.totalLength.toFixed(2)} m</span></div>
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Largura E-O</span><span className="font-medium text-[#0D2B45]">{results.totalWidth.toFixed(2)} m</span></div>
                    </>}
                  </div>
                </div>
                {!isCoplanar && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Espaçamento / Solar</div>
                    <div className="space-y-1">
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Distância d</span><span className="font-medium text-[#1E88E5]">{results.rowSpacing.toFixed(3)} m</span></div>
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Gap livre</span><span className={`font-medium ${results.gap < 0.5 ?"text-[#EF4444]" : "text-[#0D2B45]"}`}>{results.gap.toFixed(3)} m</span></div>
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Sombra (L)</span><span className="font-medium text-[#0D2B45]">{results.shadowLength.toFixed(2)} m</span></div>
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Ângulo sol 21 Dez</span><span className="font-medium text-[#F5A623]">{results.altitudeAngle.toFixed(1)}°</span></div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
