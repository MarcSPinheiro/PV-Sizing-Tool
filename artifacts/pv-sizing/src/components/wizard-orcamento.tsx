import { useState, useRef, memo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Plus, Trash2, Printer, FileText, Building2, User, Package, StickyNote,
  MapPin, ArrowUp, ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type OrcamentoState, type LinhaOrcamento, calcTotais, fmtEurPT,
} from "@/lib/orcamento";
import OrcamentoPDF, { type EstudoEnergetico } from "@/components/orcamento-pdf";

interface Props {
  state:    OrcamentoState;
  onChange: (s: OrcamentoState) => void;
  estudo?:  EstudoEnergetico | null;
}

function uid() { return Math.random().toString(36).slice(2, 9); }

function Field({
  label, children, className,
}: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

/* ── Print CSS ──────────────────────────────────────────────────────────── */
const PRINT_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111827; background: white; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #d1d5db; padding: 4px 8px; text-align: left; font-size: 10px; }
  th { background: #f3f4f6; font-weight: 600; color: #374151; }
  .text-right, [style*="text-align:right"] { text-align: right; }
  .font-bold { font-weight: 700; }
  .bg-gray-100 { background: #f3f4f6; }
  .bg-gray-50  { background: #f9fafb; }
  .whitespace-pre-line { white-space: pre-line; }
  @page { margin: 10mm 12mm; size: A4; }
  @media print {
    body { padding: 0; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
`;

function WizardOrcamento({ state, onChange, estudo }: Props) {
  const [tab, setTab] = useState<"editar" | "visualizar">("editar");
  const printRef = useRef<HTMLDivElement>(null);

  function set<K extends keyof OrcamentoState>(key: K, value: OrcamentoState[K]) {
    onChange({ ...state, [key]: value });
  }

  function setLinha(id: string, key: keyof LinhaOrcamento, value: string | number) {
    onChange({
      ...state,
      linhas: state.linhas.map(l => l.id === id ?{ ...l, [key]: value } : l),
    });
  }

  function addLinha() {
    onChange({
      ...state,
      linhas: [
        ...state.linhas,
        { id: uid(), codigo: "", descricao: "", quantidade: 1, precoUnitario: 0, ivaPerc: state.taxaIva },
      ],
    });
  }

  function removeLinha(id: string) {
    onChange({ ...state, linhas: state.linhas.filter(l => l.id !== id) });
  }

  function moveLinha(id: string, dir: -1 | 1) {
    const idx = state.linhas.findIndex(l => l.id === id);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= state.linhas.length) return;
    const arr = [...state.linhas];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    onChange({ ...state, linhas: arr });
  }

  function handlePrint() {
    const content = document.getElementById("orcamento-print-content");
    if (!content) return;
    const win = window.open("", "_blank", "width=960,height=750");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html lang="pt"><head>
<meta charset="utf-8">
<title>${state.codigo} – Orçamento</title>
<style>${PRINT_CSS}</style>
</head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  }

  const { totalLiquido, totalIva, totalFinal } = calcTotais(state.linhas, state.taxaIva);

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-primary" />
          <span className="font-semibold text-sm">{state.codigo}</span>
        </div>
        <Button onClick={handlePrint} className="w-full gap-2 sm:w-auto">
          <Printer size={15} /> Imprimir / Exportar PDF
        </Button>
      </div>

      <Tabs value={tab} onValueChange={v => setTab(v as "editar" | "visualizar")}>
        <TabsList className="grid w-full grid-cols-2 sm:w-auto">
          <TabsTrigger value="editar">Editar</TabsTrigger>
          <TabsTrigger value="visualizar">Pré-visualizar</TabsTrigger>
        </TabsList>

        {/* ── EDITAR ─────────────────────────────────────────────────────── */}
        <TabsContent value="editar" className="space-y-4 mt-4">

          {/* Empresa + Orçamento meta */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Building2 size={15} /> Dados da Empresa
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Field label="Nome / Empresa">
                  <Input
                    value={state.empresaNome}
                    onChange={e => set("empresaNome", e.target.value)}
                    placeholder="Nome da empresa emissora"
                  />
                </Field>
                <Field label="Morada">
                  <Textarea
                    value={state.empresaMorada}
                    onChange={e => set("empresaMorada", e.target.value)}
                    placeholder="Rua, localidade, código postal"
                    rows={2}
                  />
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="NIF">
                    <Input value={state.empresaNif} onChange={e => set("empresaNif", e.target.value)} placeholder="NIF" />
                  </Field>
                  <Field label="Telefone">
                    <Input value={state.empresaTelefone} onChange={e => set("empresaTelefone", e.target.value)} placeholder="+351 9xx xxx xxx" />
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="E-mail">
                    <Input value={state.empresaEmail} onChange={e => set("empresaEmail", e.target.value)} placeholder="email@empresa.pt" type="email" />
                  </Field>
                  <Field label="Website">
                    <Input value={state.empresaWebsite} onChange={e => set("empresaWebsite", e.target.value)} placeholder="www.empresa.pt" />
                  </Field>
                </div>
                <Field label="IBAN">
                  <Input value={state.empresaIban} onChange={e => set("empresaIban", e.target.value)} placeholder="PT50 0000 0000 0000 0000 0000 0" />
                </Field>
                <Field label="Logotipo">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    {state.empresaLogoUrl ?(
                      <img src={state.empresaLogoUrl} alt="Logotipo" className="h-12 w-20 rounded border object-contain p-1" />
                    ) : null}
                    <Input
                      value={state.empresaLogoUrl ??""}
                      onChange={e => set("empresaLogoUrl", e.target.value)}
                      placeholder="URL ou imagem em base64"
                    />
                  </div>
                </Field>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {/* Cliente */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <User size={15} /> Dados do Cliente
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Field label="Nome do Cliente">
                    <Input value={state.nomeCliente} onChange={e => set("nomeCliente", e.target.value)} placeholder="Nome completo ou empresa" />
                  </Field>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="NIF do Cliente">
                      <Input value={state.nifCliente} onChange={e => set("nifCliente", e.target.value)} placeholder="NIF" />
                    </Field>
                  </div>
                  <Field label="Morada de Faturação">
                    <Textarea
                      value={state.moradaCliente}
                      onChange={e => set("moradaCliente", e.target.value)}
                      placeholder="Rua, localidade, código postal"
                      rows={2}
                    />
                  </Field>
                </CardContent>
              </Card>

              {/* Instalação */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MapPin size={15} /> Morada da Instalação
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Field label="Endereço do local de instalação">
                    <Textarea
                      value={state.moradaInstalacao}
                      onChange={e => set("moradaInstalacao", e.target.value)}
                      placeholder="Se diferente da morada de faturação"
                      rows={2}
                    />
                  </Field>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Orçamento meta */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Dados do Orçamento</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Código">
                  <Input value={state.codigo} onChange={e => set("codigo", e.target.value)} />
                </Field>
                <Field label="Data de Emissão">
                  <Input value={state.dataEmissao} onChange={e => set("dataEmissao", e.target.value)} type="date" />
                </Field>
                <Field label="Validade (dias)">
                  <Input value={state.validadeDias} onChange={e => set("validadeDias", Number(e.target.value))} type="number" min={1} />
                </Field>
                <Field label="IVA (%)">
                  <Input value={state.taxaIva} onChange={e => set("taxaIva", Number(e.target.value))} type="number" min={0} max={100} />
                </Field>
              </div>
            </CardContent>
          </Card>

          {/* Items table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package size={15} /> Componentes e Serviços
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 overflow-x-auto">
              {/* Header row */}
              <div
                className="grid gap-1 text-xs font-medium text-muted-foreground px-1"
                style={{ gridTemplateColumns: "60px 1fr 70px 90px 60px 32px 32px", minWidth: "720px" }}
              >
                <span>Código</span>
                <span>Descrição</span>
                <span className="text-right">Quant.</span>
                <span className="text-right">Preço Unit. (€)</span>
                <span className="text-right">IVA %</span>
                <span />
                <span />
              </div>
              <Separator />
              <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
                {state.linhas.map((l, idx) => {
                  const lineTotal = l.quantidade * l.precoUnitario;
                  return (
                    <div
                      key={l.id}
                      className="grid gap-1 items-center"
                      style={{ gridTemplateColumns: "60px 1fr 70px 90px 60px 32px 32px", minWidth: "720px" }}
                    >
                      <Input
                        value={l.codigo}
                        onChange={e => setLinha(l.id, "codigo", e.target.value)}
                        className="h-8 text-xs px-2"
                        placeholder="Ref."
                      />
                      <Input
                        value={l.descricao}
                        onChange={e => setLinha(l.id, "descricao", e.target.value)}
                        className="h-8 text-xs px-2"
                        placeholder="Descrição do artigo/serviço"
                      />
                      <Input
                        value={l.quantidade}
                        onChange={e => setLinha(l.id, "quantidade", Number(e.target.value))}
                        className="h-8 text-xs px-2 text-right"
                        type="number" min={0}
                      />
                      <Input
                        value={l.precoUnitario}
                        onChange={e => setLinha(l.id, "precoUnitario", Number(e.target.value))}
                        className={cn("h-8 text-xs px-2 text-right", lineTotal > 0 && "border-primary/40")}
                        type="number" min={0} step={0.01}
                        placeholder="0.00"
                      />
                      <Input
                        value={l.ivaPerc}
                        onChange={e => setLinha(l.id, "ivaPerc", Number(e.target.value))}
                        className="h-8 text-xs px-2 text-right"
                        type="number" min={0} max={100}
                      />
                      <Button
                        size="icon" variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => moveLinha(l.id, idx === 0 ?1 : -1)}
                        title="Mover"
                      >
                        {idx === 0 ?<ArrowDown size={13} /> : <ArrowUp size={13} />}
                      </Button>
                      <Button
                        size="icon" variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeLinha(l.id)}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  );
                })}
              </div>
              <Button variant="outline" size="sm" onClick={addLinha} className="gap-1.5 mt-1">
                <Plus size={14} /> Adicionar Linha
              </Button>

              {/* Totals */}
              <Separator className="mt-3" />
              <div className="flex justify-end">
                <div className="w-full text-sm space-y-1 sm:w-auto sm:min-w-[220px]">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Total Líquido</span>
                    <span className="font-medium text-foreground">{fmtEurPT(totalLiquido)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>IVA {state.taxaIva}%</span>
                    <span>{fmtEurPT(totalIva)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-base pt-1 border-t">
                    <span>Total Final</span>
                    <span className="text-primary">{fmtEurPT(totalFinal)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes + conditions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <StickyNote size={15} /> Observações e Condições
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Observações">
                <Textarea
                  value={state.observacoes}
                  onChange={e => set("observacoes", e.target.value)}
                  rows={3}
                  placeholder="Observações a incluir no orçamento"
                />
              </Field>
              <Field label="Condições de Pagamento">
                <Textarea
                  value={state.condicoesPagamento}
                  onChange={e => set("condicoesPagamento", e.target.value)}
                  rows={2}
                  placeholder="Condições de pagamento"
                />
              </Field>
              <div className="flex items-center gap-3">
                <Switch
                  id="estudo-toggle"
                  checked={state.incluirEstudoEnergetico}
                  onCheckedChange={v => set("incluirEstudoEnergetico", v)}
                />
                <Label htmlFor="estudo-toggle" className="text-sm cursor-pointer">
                  Incluir Estudo de Produção e Poupança no PDF
                </Label>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── VISUALIZAR ─────────────────────────────────────────────────── */}
        <TabsContent value="visualizar" className="mt-4">
          <div ref={printRef} className="border rounded-lg overflow-auto bg-white shadow-sm">
            <OrcamentoPDF
              state={state}
              estudo={state.incluirEstudoEnergetico ?estudo : null}
            />
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Pré-visualização — use "Imprimir / Exportar PDF" para obter o ficheiro final
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
export default memo(WizardOrcamento);
