import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

function isExternalDomRemovalError(error: Error) {
  const message = error.message ?? "";

  return (
    error.name === "NotFoundError" ||
    message.includes("removeChild") ||
    message.includes("insertBefore") ||
    message.includes("n\u00e3o \u00e9 filho deste n\u00f3") ||
    message.includes("new node is to be inserted") ||
    message.includes("not a child of this node")
  );
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    if (isExternalDomRemovalError(error)) {
      return { hasError: false, error: null };
    }

    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (isExternalDomRemovalError(error)) {
      console.warn("[ErrorBoundary] Erro DOM externo ignorado:", error.message);
      return;
    }

    console.error("[ErrorBoundary] Erro capturado:", error.message, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] p-8 text-center space-y-4">
          <div className="rounded-full bg-destructive/10 p-4">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold">Ocorreu um erro inesperado</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              {this.state.error?.message ?? "Erro desconhecido. Por favor tente novamente."}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={this.handleReset}
            className="gap-2"
          >
            <RefreshCcw size={14} />
            Tentar novamente
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode,
) {
  const Wrapped = (props: P) => (
    <ErrorBoundary fallback={fallback}>
      <Component {...props} />
    </ErrorBoundary>
  );
  Wrapped.displayName = `WithErrorBoundary(${Component.displayName ?? Component.name})`;
  return Wrapped;
}
