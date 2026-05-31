import { useMemo, useState } from "react";
import {
  useGetProject,
  useListBatteries,
  useListCustomers,
  useListInverters,
  useListPanels,
} from "@workspace/api-client-react";
import type {
  Battery,
  Customer,
  Inverter,
  SolarPanel,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff, FileText, Printer, RefreshCw } from "lucide-react";
import { useAuth, type Company } from "@/lib/auth";
import type { InverterUnit } from "@/lib/multi-inverter";
import type { BatteryUnit } from "@/components/wizard-battery-study";
import type { MapReportData } from "@/components/wizard-map-step";
import { DEFAULT_SECTIONS, TEMPLATE_SETS, type ReportSection, type SectionId } from "./types";
import ReportPreview, { type NewReportData } from "./ReportPreview";

type DraftData = Record<string, unknown> & {
  clienteData?: Record<string, unknown> | null;
  consumoData?: Record<string, unknown> | null;
  locData?: Record<string, unknown> | null;
  sizing?: Record<string, unknown> | null;
  manual?: Record<string, unknown> | null;
  equipFormValues?: { panelId?: number; inverterId?: number; batteryId?: number };
  inverterUnits?: Array<InverterUnit | Record<string, unknown>>;
  batteryUnits?: Array<BatteryUnit | Record<string, unknown>>;
  reportMapData?: MapReportData | Record<string, unknown> | null;
  orcamentoState?: Record<string, unknown> | null;
  selectedCenarioTipo?: string;
  investimentoManual?: number | null;
  numPaineisStep5?: number | null;
  panelRefId?: number | null;
  tipoProjeto?: string;
};

interface Props {
  projectId: number | null;
  draftOverride?: Record<string, unknown> | null;
  companyOverride?: Company | null;
}

function findById<T extends { id: number }>(items: T[] | undefined, id: number | null | undefined) {
  if (!id) return null;
  return items?.find((item) => item.id === id) ??null;
}

export default function ReportBuilder({ projectId, draftOverride, companyOverride }: Props) {
  const [sections, setSections] = useState<ReportSection[]>(DEFAULT_SECTIONS);
  const [template, setTemplate] = useState("completo");
  const [showPreview, setShowPreview] = useState(true);
  const [notes, setNotes] = useState("");

  const { data: project, isLoading } = useGetProject(projectId ??0);
  const { data: customers } = useListCustomers();
  const { data: panels } = useListPanels();
  const { data: inverters } = useListInverters();
  const { data: batteries } = useListBatteries();
  const { company: authCompany } = useAuth();

  const savedDraft = (project?.draftData as DraftData | null | undefined) ??null;
  const draft = (draftOverride ??savedDraft) as DraftData | null;
  const customer: Customer | null = findById(customers, project?.customerId ??null);
  const company = companyOverride ??authCompany ??null;

  const selectedPanelId =
    draft?.equipFormValues?.panelId ??
    draft?.panelRefId ??
    project?.panelId ??
    null;
  const panel: SolarPanel | null = findById(panels, selectedPanelId);

  const inverterUnits = (draft?.inverterUnits ??[]) as InverterUnit[];
  const batteryUnits = (draft?.batteryUnits ??[]) as BatteryUnit[];

  const selectedInverters: Inverter[] = useMemo(() => {
    const ids = inverterUnits
      .map((unit) => unit.inverterId)
      .filter((id): id is number => Number.isFinite(id) && id > 0);
    const fallbackId = draft?.equipFormValues?.inverterId;
    if (fallbackId) ids.push(fallbackId);
    return [...new Set(ids)]
      .map((id) => findById(inverters, id))
      .filter((item): item is Inverter => Boolean(item));
  }, [draft?.equipFormValues?.inverterId, inverterUnits, inverters]);

  const selectedBatteries: Battery[] = useMemo(() => {
    const ids = batteryUnits
      .map((unit) => unit.batteryId)
      .filter((id): id is number => Number.isFinite(id) && id > 0);
    const fallbackId = draft?.equipFormValues?.batteryId;
    if (fallbackId) ids.push(fallbackId);
    return [...new Set(ids)]
      .map((id) => findById(batteries, id))
      .filter((item): item is Battery => Boolean(item));
  }, [batteryUnits, batteries, draft?.equipFormValues?.batteryId]);

  const enabledSections = sections
    .filter((section) => section.enabled)
    .map((section) => section.id);

  const applyTemplate = (value: string) => {
    setTemplate(value);
    const enabled = TEMPLATE_SETS[value] ??TEMPLATE_SETS.completo;
    setSections((prev) =>
      prev.map((section) => ({ ...section, enabled: enabled.includes(section.id) })),
    );
  };

  const toggleSection = (id: SectionId) => {
    setSections((prev) =>
      prev.map((section) =>
        section.id === id ?{ ...section, enabled: !section.enabled } : section,
      ),
    );
  };

  const printReport = () => {
    const report = document.getElementById("report-content");
    if (!report) {
      window.print();
      return;
    }

    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((node) => node.outerHTML)
      .join("\n");
    const printWindow = window.open("", "_blank", "width=1000,height=900");

    if (!printWindow) {
      window.print();
      return;
    }

    printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${project?.nome ??"Relatorio FV"}</title>
    ${styles}
    <style>
      @page { size: A4 portrait; margin: 10mm; }
      html, body { margin: 0; padding: 0; background: white; overflow: visible; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      #report-print-root { width: 190mm; margin: 0 auto; background: white; }
      #report-content { display: block !important; position: static !important; width: 190mm !important; max-width: 190mm !important; margin: 0 auto !important; box-shadow: none !important; overflow: visible !important; }
      #report-content .report-page { display: block !important; width: 190mm !important; max-width: 190mm !important; height: auto !important; min-height: 0 !important; overflow: visible !important; padding: 0 !important; margin: 0 !important; box-shadow: none !important; }
      #report-content .report-page:first-child { min-height: 277mm !important; break-after: page; page-break-after: always; }
      #report-content .report-section { margin-top: 8mm !important; break-inside: auto; page-break-inside: auto; }
      #report-content h1, #report-content h2, #report-content h3, #report-content thead { break-after: avoid; page-break-after: avoid; }
      #report-content tr, #report-content svg, #report-content img, #report-content .no-break { break-inside: avoid; page-break-inside: avoid; }
      #report-content .report-satellite-map { display: block !important; position: relative !important; width: 100% !important; overflow: hidden !important; break-inside: avoid !important; page-break-inside: avoid !important; }
      #report-content .report-satellite-viewport { display: block !important; position: relative !important; width: 100% !important; aspect-ratio: 16 / 9 !important; overflow: hidden !important; }
      #report-content .report-satellite-tile-grid { display: grid !important; position: absolute !important; left: 50% !important; top: 50% !important; width: 150% !important; aspect-ratio: 1 / 1 !important; grid-template-columns: repeat(3, minmax(0, 1fr)) !important; grid-template-rows: repeat(3, minmax(0, 1fr)) !important; transform: translate(-50%, -50%) !important; overflow: hidden !important; }
      #report-content .report-satellite-tile-grid img { display: block !important; width: 100% !important; height: 100% !important; object-fit: cover !important; break-inside: auto !important; page-break-inside: auto !important; }
      #report-content .report-satellite-tile-grid svg { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; break-inside: auto !important; page-break-inside: auto !important; }
      #report-content .report-satellite-svg { display: block !important; width: 100% !important; height: auto !important; max-height: none !important; overflow: hidden !important; }
    </style>
  </head>
  <body>
    <div id="report-print-root">${report.outerHTML}</div>
  </body>
</html>`);
    printWindow.document.close();

    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 700);
  };

  const reportData: NewReportData = {
    projectName: project?.nome ??"Estudo fotovoltaico",
    generatedAt: new Date().toLocaleDateString("pt-PT", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
    project,
    customer: customer as unknown as Record<string, unknown> | null,
    company: company as unknown as Record<string, unknown> | null,
    draft: draft as NewReportData["draft"],
    panel,
    inverters: selectedInverters,
    batteries: selectedBatteries,
    allInverters: inverters ??[],
    inverterUnits,
    batteryUnits,
    notes,
  };

  if (projectId == null) {
    return (
      <div className="grid h-full place-items-center p-8 text-center text-slate-500">
        <div>
          <FileText className="mx-auto mb-3 h-10 w-10 opacity-40" />
          <p className="font-semibold">Abra um projeto para gerar o relatório.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid h-full place-items-center p-8 text-slate-500">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          A carregar dados do estudo...
        </div>
      </div>
    );
  }

  return (
    <div className="report-builder flex h-full min-h-0 bg-slate-100">
      <aside className="report-controls flex w-72 shrink-0 flex-col border-r bg-white">
        <div className="border-b p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Relatório profissional
          </p>
          <h2 className="mt-1 truncate text-lg font-bold text-slate-950">
            {project?.nome ??"Estudo FV"}
          </h2>
          <div className="mt-3 flex flex-wrap gap-1">
            <Badge variant={draft?.sizing ?"default" : "outline"}>Dimensionamento</Badge>
            <Badge variant={draft?.reportMapData ?"default" : "outline"}>Mapa</Badge>
            <Badge variant={inverterUnits.length ?"default" : "outline"}>Strings</Badge>
          </div>
        </div>

        <div className="border-b p-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Modelo
          </label>
          <Select value={template} onValueChange={applyTemplate}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="completo">Completo</SelectItem>
              <SelectItem value="tecnico">Técnico</SelectItem>
              <SelectItem value="comercial">Comercial</SelectItem>
              <SelectItem value="mapa">Mapa e sombras</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-2 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Campos no PDF
            </p>
            {sections.map((section) => (
              <label
                key={section.id}
                className="flex cursor-pointer items-center gap-3 rounded-md border bg-slate-50 px-3 py-2 text-sm"
              >
                <Checkbox
                  checked={section.enabled}
                  onCheckedChange={() => toggleSection(section.id)}
                />
                <span>{section.label}</span>
              </label>
            ))}
          </div>
        </ScrollArea>

        <Separator />

        <div className="space-y-2 p-4">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start"
            onClick={() => setShowPreview((value) => !value)}
          >
            {showPreview ?<EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
            {showPreview ?"Ocultar pré-visualização" : "Mostrar pré-visualização"}
          </Button>
          <Button type="button" className="w-full justify-start" onClick={printReport}>
            <Printer className="mr-2 h-4 w-4" />
            Gerar PDF / Imprimir
          </Button>
        </div>
      </aside>

      <main className="report-print-main min-h-0 flex-1 overflow-auto p-6">
        <div className="report-print-frame mx-auto max-w-[21cm]">
          <div className="mb-4 rounded-lg border bg-white p-4 print:hidden">
            <label className="mb-2 block text-sm font-semibold">Notas finais do relatório</label>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Observações, condicionantes de obra, validações pendentes ou notas comerciais..."
              rows={3}
            />
          </div>

          {showPreview ?(
            <ReportPreview sections={enabledSections} data={reportData} />
          ) : (
            <div className="grid h-96 place-items-center rounded-lg border bg-white text-slate-500">
              Pré-visualização ocultada.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
