import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Search from "./pages/Search";
import RecordDetail from "./pages/RecordDetail";
import Contribute from "./pages/Contribute";
import EditCatalogEntry from "./pages/EditCatalogEntry";
import Dashboard from "./pages/Dashboard";
import MySuggestions from "./pages/MySuggestions";
import SubmissionDetail from "./pages/SubmissionDetail";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();
// Scroll to top on every route change so pages open at the top.
const ScrollToTop = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname, location.search]);
  return <>{children}</>;
};
// Protect routes that require an authenticated user.
const RequireAuth = ({ children }: { children: ReactNode }) => {
  const user = useAuth();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScrollToTop>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/search" element={<Search />} />
            <Route path="/record/:id" element={<RecordDetail />} />
            <Route
              path="/contribute"
              element={(
                <RequireAuth>
                  <Contribute />
                </RequireAuth>
              )}
            />
            <Route
              path="/edit/:id"
              element={(
                <RequireAuth>
                  <EditCatalogEntry />
                </RequireAuth>
              )}
            />
            <Route
              path="/dashboard"
              element={(
                <RequireAuth>
                  <Dashboard />
                </RequireAuth>
              )}
            />
            <Route
              path="/suggestions"
              element={(
                <RequireAuth>
                  <MySuggestions />
                </RequireAuth>
              )}
            />
            <Route
              path="/dashboard/:id"
              element={(
                <RequireAuth>
                  <SubmissionDetail />
                </RequireAuth>
              )}
            />
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ScrollToTop>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
