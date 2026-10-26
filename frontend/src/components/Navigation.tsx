import { NavLink } from "@/components/NavLink";
import { ExternalLink } from "@/components/ExternalLink";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Menu, X, LogOut, KeyRound, ChevronDown, LayoutDashboard, Settings } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { signOut } from "@/lib/auth";
import { capitalizeFirst } from "@/lib/utils";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import sealImage from "@/assets/uspcs-seal.png";
import { APP_NAME, DONATE_URL, ORG_NAME, ORG_URL } from "@/constants/brand";

export const Navigation = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const user = useAuth();
  const navigate = useNavigate();
  // T108: on the home page the seal is large and hangs below the bar over the hero;
  // on inner pages it stays inside the bar so it never covers page content.
  const isHome = useLocation().pathname === "/";
  const { toast } = useToast();

  const hasEditorAccess =
    user?.role === "editor" || user?.role === "administrator" || user?.is_superuser;
  const dashboardLabel = hasEditorAccess ? "Dashboard" : "My Submissions";
  const dashboardTabState = hasEditorAccess ? { tab: "editor" as const } : { tab: "submissions" as const };

  const handleLogout = async () => {
    try {
      await signOut();

      toast({
        title: "Signed out",
        description: "You have been successfully signed out.",
      });

      navigate("/");
      setMobileMenuOpen(false);
    } catch (error: unknown) {
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
      await signOut();
      toast({
        title: "Signed out",
        description: "Please sign in again with your correct account.",
      });
      navigate("/auth");
      setMobileMenuOpen(false);
    } catch (error: unknown) {
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
        <div className="flex justify-between items-center h-20">
          {/* Logo: the Society seal opens uspcs.org (T99); the name still goes home. */}
          <div className="flex items-center space-x-2">
            <ExternalLink
              href={ORG_URL}
              aria-label={`${ORG_NAME} website`}
              className={isHome ? "flex items-start self-start pt-1" : "flex items-center"}
            >
              <img
                src={sealImage}
                alt={ORG_NAME}
                width={isHome ? 128 : 64}
                height={isHome ? 128 : 64}
                className={
                  isHome
                    ? "w-24 h-24 md:w-32 md:h-32 rounded-full bg-card ring-4 ring-card shadow-archival-md"
                    : "w-16 h-16 rounded-sm"
                }
              />
            </ExternalLink>
            <NavLink
              to="/"
              className="font-heading text-xl font-semibold text-foreground"
              aria-label={`${APP_NAME} home`}
            >
              {APP_NAME}
            </NavLink>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            <Button
              asChild
              size="sm"
              className="bg-[#ffc439] text-[#003087] hover:bg-[#f2ba36]"
            >
              <ExternalLink href={DONATE_URL}>Donate</ExternalLink>
            </Button>
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
              to="/about"
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              activeClassName="text-primary font-semibold"
            >
              About
            </NavLink>
            <NavLink
              to="/help"
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              activeClassName="text-primary font-semibold"
            >
              Help
            </NavLink>
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
                  {user.is_staff === true && (
                    <DropdownMenuItem asChild>
                      <a href="/admin/">
                        <Settings className="mr-2 h-4 w-4" />
                        Admin Panel
                      </a>
                    </DropdownMenuItem>
                  )}
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
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
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
              to="/about"
              className="block px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
              activeClassName="text-primary bg-secondary font-semibold"
              onClick={() => setMobileMenuOpen(false)}
            >
              About
            </NavLink>
            <NavLink
              to="/help"
              className="block px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
              activeClassName="text-primary bg-secondary font-semibold"
              onClick={() => setMobileMenuOpen(false)}
            >
              Help
            </NavLink>
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
                {user.is_staff === true && (
                  <a
                    href="/admin/"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full flex items-center px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md text-left"
                  >
                    <Settings className="h-4 w-4 mr-2 shrink-0" />
                    Admin Panel
                  </a>
                )}
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
            <div className="pt-2">
              <Button asChild className="w-full">
                <ExternalLink href={DONATE_URL} onClick={() => setMobileMenuOpen(false)}>
                  Donate
                </ExternalLink>
              </Button>
            </div>
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
