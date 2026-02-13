import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestLoginForm } from "@/components/RequestLoginForm";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { login, getAdminUrl } from "@/services/djangoAuth";
import { z } from "zod";

const authSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, { message: "Please enter your username" })
    .max(150, { message: "Username must be less than 150 characters" }),
  password: z
    .string()
    .min(1, { message: "Please enter your password" }),
});

const Auth = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading, refetch } = useAuth();

  // Redirect if already logged in: staff → Django admin (full page), normal user → /dashboard
  useEffect(() => {
    if (authLoading) return;
    if (user) {
      if (user.is_staff) {
        window.location.href = getAdminUrl();
        return;
      }
      navigate("/dashboard");
    }
  }, [user, authLoading, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = authSchema.safeParse({ username, password });

    if (!validation.success) {
      const firstError = validation.error.errors[0];
      toast({
        title: "Validation failed",
        description: firstError.message,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { user: loggedInUser } = await login(
        validation.data.username,
        validation.data.password,
      );
      await refetch();
      toast({
        title: "Welcome back!",
        description: `Signed in as ${loggedInUser.username}.`,
      });
      if (loggedInUser.is_staff) {
        window.location.href = getAdminUrl();
      } else {
        navigate("/dashboard");
      }
    } catch (err) {
      toast({
        title: "Sign in failed",
        description: err instanceof Error ? err.message : "Invalid username or password.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      <div className="flex-1 bg-background flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <Card className="w-full max-w-md shadow-archival-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="font-heading text-2xl text-center">
              WorldCovers Account
            </CardTitle>
            <CardDescription className="text-center">
              Sign in with your Django account (same as /admin)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignIn} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="signin-username">Username</Label>
                <Input
                  id="signin-username"
                  type="text"
                  placeholder="Username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signin-password">Password</Label>
                <Input
                  id="signin-password"
                  type="password"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign In"}
              </Button>

              <div className="text-center pt-2">
                <Button
                  type="button"
                  variant="link"
                  className="text-sm"
                  onClick={() => setRequestDialogOpen(true)}
                >
                  Request a login
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <RequestLoginForm
        open={requestDialogOpen}
        onOpenChange={setRequestDialogOpen}
      />

      <Footer />
    </div>
  );
};

export default Auth;
