import { Link, Route, Switch } from "wouter";
import Index from "./pages/index";
import InstallationsPage from "./pages/installations";
import ClientsPage from "./pages/clients";
import InvoicesPage from "./pages/invoices";
import PaymentsPage from "./pages/payments";
import UsagePage from "./pages/usage";
import Landing from "./pages/landing";
import Login from "./pages/login";
import ClientDashboard from "./pages/dashboard";
import { Provider } from "./components/provider";
import { AppShell } from "./components/app-shell";
import { RequireRole } from "./components/route-guard";
import { AgentFeedback } from "@runablehq/website-runtime";

function NotFound() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center py-24 text-center">
      <p className="font-mono text-sm text-primary">404</p>
      <h1 className="mt-2 text-2xl font-bold">Page not found</h1>
      <Link to="~/" className="mt-4 text-sm font-semibold text-primary hover:underline">
        Back to home
      </Link>
    </div>
  );
}

/** Operator console. Mounted under /admin and /staff via nested routes, so links inside are relative. */
function Console() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={Index} />
        <Route path="/installations" component={InstallationsPage} />
        <Route path="/clients" component={ClientsPage} />
        <Route path="/invoices" component={InvoicesPage} />
        <Route path="/payments" component={PaymentsPage} />
        <Route path="/usage" component={UsagePage} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function App() {
  return (
    <Provider>
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/login" component={Login} />
        <Route path="/admin" nest>
          <RequireRole roles={["super_admin", "admin"]}>
            <Console />
          </RequireRole>
        </Route>
        <Route path="/staff" nest>
          <RequireRole roles={["staff"]}>
            <Console />
          </RequireRole>
        </Route>
        <Route path="/dashboard">
          <RequireRole roles={["client"]}>
            <ClientDashboard />
          </RequireRole>
        </Route>
        <Route component={NotFound} />
      </Switch>
      {/* Do not remove — off by default, activated by parent iframe via postMessage */}
      {import.meta.env.DEV && <AgentFeedback />}
    </Provider>
  );
}

export default App;
