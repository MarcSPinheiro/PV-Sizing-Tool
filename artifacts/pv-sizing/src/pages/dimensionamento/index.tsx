import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const WizardPage = lazy(() => import("@/pages/wizard"));

function LoadingSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-full max-w-96" />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  );
}

export default function DimensionamentoPage() {
  return (
    <div className="space-y-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-[#0D2B45] sm:text-3xl">
          Dimensionamento FV
        </h1>
        <p className="mt-1 text-muted-foreground">
          Fluxo passo a passo para o estudo fotovoltaico.
        </p>
      </div>

      <Suspense fallback={<LoadingSkeleton />}>
        <WizardPage />
      </Suspense>
    </div>
  );
}
