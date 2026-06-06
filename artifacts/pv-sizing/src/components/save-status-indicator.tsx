import { Loader2, CheckCircle2, AlertTriangle, CloudOff } from "lucide-react";
import { cn } from "@/lib/utils";

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "offline";

interface Props {
  status: SaveStatus;
  lastSavedAt: Date | null;
  className?: string;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

export default function SaveStatusIndicator({ status, lastSavedAt, className }: Props) {
  const base = "inline-flex items-center gap-1.5 text-xs font-medium";

  let Icon = CheckCircle2;
  let label = "";
  let tone = "text-muted-foreground";
  let testId = "save-indicator-idle";
  let spin = false;

  if (status === "saving") {
    Icon = Loader2;
    label = "A guardar...";
    tone = "text-muted-foreground";
    testId = "save-indicator-saving";
    spin = true;
  } else if (status === "error") {
    Icon = AlertTriangle;
    label = "Erro ao guardar";
    tone = "text-destructive";
    testId = "save-indicator-error";
  } else if (status === "offline") {
    Icon = CloudOff;
    label = "Só local (sem projeto)";
    tone = "text-amber-600 dark:text-amber-400";
    testId = "save-indicator-offline";
  } else if (status === "saved" && lastSavedAt) {
    Icon = CheckCircle2;
    label = `Guardado às ${fmtTime(lastSavedAt)}`;
    tone = "text-emerald-600 dark:text-emerald-400";
    testId = "save-indicator-saved";
  }

  return (
    <span
      className={cn(base, tone, !label && "invisible", className)}
      data-testid={testId}
      aria-hidden={!label}
      aria-live="off"
      translate="no"
    >
      <span className="grid h-3.5 w-3.5 shrink-0 place-items-center">
        <Icon className={cn("h-3.5 w-3.5", spin && "animate-spin")} aria-hidden="true" />
      </span>
      <span className="whitespace-nowrap" suppressHydrationWarning>
        {label || "Estado"}
      </span>
    </span>
  );
}
