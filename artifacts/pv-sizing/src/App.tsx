import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/error-boundary";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";

// Pages
import Dashboard from "@/pages/dashboard";
import Customers from "@/pages/customers";
import CustomerDetail from "@/pages/customer-detail";
import Panels from "@/pages/panels";
import Inverters from "@/pages/inverters";
import Batteries from "@/pages/batteries";
import Systems from "@/pages/systems";
import SystemNew from "@/pages/system-new";
import SystemDetail from "@/pages/system-detail";
import StringSizing from "@/pages/string-sizing";
import Wizard from "@/pages/wizard";
import Proposals from "@/pages/proposals";
import Projects from "@/pages/projects";
import LoginPage from "@/pages/login";
import CompanySettingsPage from "@/pages/company-settings";
import DimensionamentoPage from "@/pages/dimensionamento";

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

function ProtectedApp() {
  return (
    <ProtectedRoute>
      <Layout>
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
          <Route path="/propostas" component={Proposals} />
          <Route path="/estudos" component={Projects} />
          <Route path="/empresa" component={CompanySettingsPage} />
          <Route component={NotFound} />
        </Switch>
      </Layout>
    </ProtectedRoute>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route component={ProtectedApp} />
    </Switch>
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
