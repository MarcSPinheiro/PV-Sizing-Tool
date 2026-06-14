import { Suspense, lazy } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/error-boundary";
import { Layout } from "@/components/layout";

// Pages
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Customers = lazy(() => import("@/pages/customers"));
const CustomerDetail = lazy(() => import("@/pages/customer-detail"));
const Panels = lazy(() => import("@/pages/panels"));
const Inverters = lazy(() => import("@/pages/inverters"));
const Batteries = lazy(() => import("@/pages/batteries"));
const Systems = lazy(() => import("@/pages/systems"));
const SystemNew = lazy(() => import("@/pages/system-new"));
const SystemDetail = lazy(() => import("@/pages/system-detail"));
const StringSizing = lazy(() => import("@/pages/string-sizing"));
const Proposals = lazy(() => import("@/pages/proposals"));
const Projects = lazy(() => import("@/pages/projects"));
const Planning = lazy(() => import("@/pages/planning"));
const LoginPage = lazy(() => import("@/pages/login"));
const CompanySettingsPage = lazy(() => import("@/pages/company-settings"));
const DimensionamentoPage = lazy(() => import("@/pages/dimensionamento"));
const NotFound = lazy(() => import("@/pages/not-found"));

import { AuthProvider, ProtectedRoute } from "@/lib/auth";
import { BrandingProvider } from "@/components/branding-provider";
import { PanelProvider } from "@/contexts/PanelContext";
import { SolarProvider } from "@/contexts/SolarContext";
import { MapaProvider } from "@/contexts/MapaContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 30_000),
      staleTime: 5 * 60 * 1_000,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

function PageLoader() {
  return (
    <div className="grid min-h-[50vh] place-items-center px-4 text-center text-sm text-muted-foreground">
      A carregar...
    </div>
  );
}

function ProtectedApp() {
  return (
    <ProtectedRoute>
      <Layout>
        <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/"><Redirect to="/painel" /></Route>
          <Route path="/painel" component={Dashboard} />
          <Route path="/clientes" component={Customers} />
          <Route path="/clientes/:id" component={CustomerDetail} />
          <Route path="/equipamentos/paineis" component={Panels} />
          <Route path="/equipamentos/inversores" component={Inverters} />
          <Route path="/equipamentos/baterias" component={Batteries} />
          <Route path="/sistemas" component={Systems} />
          <Route path="/sistemas/novo" component={SystemNew} />
          <Route path="/sistemas/:id" component={SystemDetail} />
          <Route path="/calculadora-strings" component={StringSizing} />
          {/* Legacy redirect — keep for bookmarks */}
          <Route path="/wizard"><Redirect to="/dimensionamento" /></Route>
          <Route path="/dimensionamento" component={DimensionamentoPage} />
          <Route path="/planeamento" component={Planning} />
          <Route path="/propostas" component={Proposals} />
          <Route path="/estudos" component={Projects} />
          <Route path="/empresa" component={CompanySettingsPage} />
          <Route component={NotFound} />
        </Switch>
        </Suspense>
      </Layout>
    </ProtectedRoute>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route component={ProtectedApp} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <BrandingProvider>
              <PanelProvider>
                <SolarProvider>
                  <MapaProvider>
                    <ErrorBoundary>
                      <Router />
                    </ErrorBoundary>
                  </MapaProvider>
                </SolarProvider>
              </PanelProvider>
            </BrandingProvider>
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
