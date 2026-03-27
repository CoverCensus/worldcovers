import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Menu, X, LogOut, KeyRound, ChevronDown, LayoutDashboard } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { clearStoredUser } from "@/lib/auth";
import { capitalizeFirst } from "@/lib/utils";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

export const Navigation = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const user = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const apiBase = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/+$/, "");
  const logoutUrl = apiBase ? `${apiBase}/logout/` : (import.meta.env.VITE_API_BASE_URL || '/api/v1') + "/logout/";
  const isStateEditor = user?.role === "state_editor" || user?.is_superuser;
  const dashboardLabel = isStateEditor ? "Dashboard" : "My Submissions";
  const dashboardTabState = isStateEditor ? { tab: "editor" as const } : { tab: "submissions" as const };

  const handleLogout = async () => {
    try {
      await fetch(logoutUrl, { method: "POST", credentials: "include" });
      clearStoredUser();

      toast({
        title: "Signed out",
        description: "You have been successfully signed out.",
      });

      navigate("/");
      setMobileMenuOpen(false);
    } catch (error: unknown) {
      clearStoredUser();
      toast({
        title: "Error signing out",
        description: error instanceof Error ? error.message : "Could not sign out",
        variant: "destructive",
      });
    }
  };

  const handleSignOutAndSignIn = async () => {
    setChangePasswordOpen(false);
    try {
      await fetch(logoutUrl, { method: "POST", credentials: "include" });
      clearStoredUser();
      toast({
        title: "Signed out",
        description: "Please sign in again with your correct account.",
      });
      navigate("/auth");
      setMobileMenuOpen(false);
    } catch (error: unknown) {
      clearStoredUser();
      navigate("/auth");
      toast({
        title: "Error signing out",
        description: error instanceof Error ? error.message : "Could not sign out",
        variant: "destructive",
      });
    }
  };

  return (
    <nav className="bg-card border-b border-border sticky top-0 z-50 shadow-archival-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <NavLink to="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-primary rounded-sm flex items-center justify-center">
              <span className="text-primary-foreground font-heading font-bold text-lg">W</span>
            </div>
            <span className="font-heading text-xl font-semibold text-foreground hidden sm:inline">
              WorldCovers
            </span>
          </NavLink>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            <NavLink
              to="/"
              end
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              activeClassName="text-primary font-semibold"
            >
              Home
            </NavLink>
            <NavLink
              to="/search"
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              activeClassName="text-primary font-semibold"
            >
              Catalog
            </NavLink>
            <NavLink
              to="/help"
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              activeClassName="text-primary font-semibold"
            >
              Help
            </NavLink>
            {user && (
              <NavLink
                to="/contribute"
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                activeClassName="text-primary font-semibold"
              >
                Contribute
              </NavLink>
            )}
            {!user && (
              <NavLink
                to="/auth"
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                activeClassName="text-primary font-semibold"
              >
                Login
              </NavLink>
            )}
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-transparent transition-colors"
                  >
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {(user.username || user.email || "U").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="max-w-[120px] truncate">{capitalizeFirst(user.username || user.email || "")}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => navigate("/dashboard", { state: dashboardTabState })}>
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    {dashboardLabel}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setChangePasswordOpen(true)}>
                    <KeyRound className="mr-2 h-4 w-4" />
                    Change password
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-card border-t border-border">
          <div className="px-4 py-3 space-y-1">
            <NavLink
              to="/"
              end
              className="block px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
              activeClassName="text-primary bg-secondary font-semibold"
              onClick={() => setMobileMenuOpen(false)}
            >
              Home
            </NavLink>
            <NavLink
              to="/search"
              className="block px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
              activeClassName="text-primary bg-secondary font-semibold"
              onClick={() => setMobileMenuOpen(false)}
            >
              Catalog
            </NavLink>
            <NavLink
              to="/help"
              className="block px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
              activeClassName="text-primary bg-secondary font-semibold"
              onClick={() => setMobileMenuOpen(false)}
            >
              Help
            </NavLink>
            {user && (
              <NavLink
                to="/contribute"
                className="block px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
                activeClassName="text-primary bg-secondary font-semibold"
                onClick={() => setMobileMenuOpen(false)}
              >
                Contribute
              </NavLink>
            )}
            {!user && (
              <NavLink
                to="/auth"
                className="block px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
                activeClassName="text-primary bg-secondary font-semibold"
                onClick={() => setMobileMenuOpen(false)}
              >
                Login
              </NavLink>
            )}
            {user && (
              <>
                <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-sm bg-primary/10 text-primary">
                      {(user.username || user.email || "U").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium truncate">{user.username || user.email}</span>
                </div>
                <button
                  onClick={() => {
                    navigate("/dashboard", { state: dashboardTabState });
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md text-left"
                >
                  <LayoutDashboard className="h-4 w-4 mr-2 shrink-0" />
                  {dashboardLabel}
                </button>
                <button
                  onClick={() => {
                    setChangePasswordOpen(true);
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md text-left"
                >
                  <KeyRound className="h-4 w-4 mr-2 shrink-0" />
                  Change password
                </button>
                <button
                  onClick={() => handleLogout()}
                  className="w-full flex items-center px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md text-left"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <ChangePasswordForm
        open={changePasswordOpen}
        onOpenChange={setChangePasswordOpen}
        onSignOut={handleSignOutAndSignIn}
      />
    </nav>
  );
};
