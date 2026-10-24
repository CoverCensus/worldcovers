import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestLoginForm } from "@/components/RequestLoginForm";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Formik, Form, Field, FormikHelpers } from "formik";
import { useLocation, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuthState } from "@/hooks/useAuth";
import { signOut, syncCurrentUser } from "@/lib/auth";
import { signIn } from "@/services/account";
import { getRedirectPath } from "@/lib/authRedirect";
import { useSiteInfo } from "@/hooks/useSiteInfo";

interface AuthValues {
  email: string;
  password: string;
}

const validateAuth = (values: AuthValues): Partial<Record<keyof AuthValues, string>> => {
  const errors: Partial<Record<keyof AuthValues, string>> = {};

  if (!values.email?.trim()) {
    errors.email = "Email or username is required";

  }

  if (!values.password) {
    errors.password = "Password is required";
  }

  return errors;
};

const Auth = () => {
  const { user, status, error: sessionError } = useAuthState();
  const [loginError, setLoginError] = useState<string | null>(null);
  const [accountConflict, setAccountConflict] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [siteRetry, setSiteRetry] = useState(0);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const redirectPath = getRedirectPath(location.state);
  const site = useSiteInfo(siteRetry);
  const onTestSite = site !== null && !site.isProduction;

  useEffect(() => {
    if (status === "authenticated" && user && !loginBusy && !loginError) {
      navigate(redirectPath, { replace: true });
    }
  }, [user, status, loginBusy, loginError, navigate, redirectPath]);

  const handleSubmit = async (
    values: AuthValues,
    { setSubmitting }: FormikHelpers<AuthValues>
  ) => {
    setVerificationPending(false);
    setLoginError(null);
    setAccountConflict(false);
    setLoginBusy(true);
    try {
      const signedIn = await signIn(values.email.trim(), values.password);
      if (!signedIn) {
        setVerificationPending(true);
        return;
      }

      toast({
        title: "Welcome back!",
        description: "You have successfully signed in.",
      });
      navigate(redirectPath, { replace: true });
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Network error");
      setAccountConflict((err as { status?: number }).status === 409);
      toast({
        title: "Sign in failed",
        description: err instanceof Error ? err.message : "Network error",
        variant: "destructive",
      });
    } finally {
      setLoginBusy(false);
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      <div className="flex-1 bg-background flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <Card className="w-full max-w-md shadow-archival-lg">
          <CardHeader className="space-y-1 p-4 sm:p-6">
            <CardTitle className="font-heading text-2xl text-center">
              WorldCovers Account
            </CardTitle>
            <CardDescription className="text-center">
              Sign in below, or create an account if you do not have one yet
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            {status === "checking" && <p role="status">Checking your session...</p>}
            {status === "unavailable" && <div role="alert" className="mb-4">
              <p>{sessionError || "Your session could not be checked."}</p>
              <Button onClick={() => void syncCurrentUser().catch(() => {})}>Retry session check</Button>
            </div>}
            {loginError && <div role="alert" className="mb-4">
              <p>{loginError}</p>
              {accountConflict && <Button disabled={loginBusy} onClick={async () => {
                setLoginBusy(true);
                try {
                  await signOut();
                  setAccountConflict(false);
                  setLoginError(null);
                } catch (error) {
                  setLoginError(error instanceof Error ? error.message : "Sign out failed. Please retry.");
                } finally {
                  setLoginBusy(false);
                }
              }}>Sign out of the current account</Button>}
            </div>}
            {verificationPending && <div role="status" className="mb-4 space-y-2">
              <h2 className="font-semibold">Check your email</h2>
              <p>Signing in before confirming your email automatically sends a new confirmation link, unless one was sent recently. Check your inbox and spam folder, then follow the link before signing in again.</p>
            </div>}
            <Formik
              initialValues={{ email: "", password: "" }}
              validate={validateAuth}
              validateOnMount
              onSubmit={handleSubmit}
            >
              {({ errors, touched, isSubmitting, isValid }) => (
                <Form className="space-y-2 sm:space-y-4 pt-2 sm:pt-4" onChange={() => setVerificationPending(false)}>
                  <div className="space-y-1 sm:space-y-2">
                    <Label htmlFor="signin-email">Email or username</Label>
                    <Field
                      as={Input}
                      id="signin-email"
                      autoComplete="username"
                      name="email"
                      type="text"
                      placeholder="name@example.com"
                      aria-invalid={!!(touched.email && errors.email)}
                      aria-describedby={touched.email && errors.email ? "signin-email-error" : undefined}
                      className={touched.email && errors.email ? "border-destructive" : ""}
                    />
                    {touched.email && errors.email && (
                      <p id="signin-email-error" className="text-sm text-destructive">
                        {errors.email}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1 sm:space-y-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <div className="relative">
                      <Field
                        as={Input}
                        id="signin-password"
                        autoComplete="current-password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        aria-invalid={!!(touched.password && errors.password)}
                        aria-describedby={touched.password && errors.password ? "signin-password-error" : undefined}
                        className={
                          (touched.password && errors.password ? "border-destructive " : "") + "pr-10"
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:bg-transparent hover:text-foreground"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    {touched.password && errors.password && (
                      <p id="signin-password-error" className="text-sm text-destructive">
                        {errors.password}
                      </p>
                    )}
                  </div>
                  <div className="flex justify-end -mt-1">
                    <Button
                      type="button"
                      variant="link"
                      className="px-0 text-sm"
                      onClick={() => setForgotPasswordOpen(true)}
                    >
                      Forgot password?
                    </Button>
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!isValid || isSubmitting || status === "checking" || status === "unavailable"}
                  >
                    {isSubmitting ? "Signing in..." : "Sign In"}
                  </Button>
                </Form>
              )}
            </Formik>

            {/* #70: a first-time editor arrives with no credentials, so the sign-in form above is
                unusable to them. Keep this path visually distinct from the form rather than a link
                buried under the submit button. */}
            <div className="mt-6 border-t pt-4 space-y-2 text-center">
              <p className="text-sm font-medium">New to the catalog?</p>
              {site === null ? (
                <>
                  <p role="status">Signup is unavailable until we can identify this site.</p>
                  <Button variant="outline" onClick={() => setSiteRetry((value) => value + 1)}>Retry site check</Button>
                </>
              ) : onTestSite ? (
                <>
                  <p className="text-sm text-muted-foreground" role="note">
                    This is the test site. Create your account on{" "}
                    {site.productionHost}, then verify your email.
                  </p>
                  <Button asChild variant="outline" className="w-full">
                    <a href={`${site.productionUrl}/auth`}>Create an account on {site.productionHost}</a>
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Create an account and verify your email to contribute.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setRequestDialogOpen(true)}
                  >
                    Create account
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <RequestLoginForm
        open={requestDialogOpen}
        onOpenChange={setRequestDialogOpen}
      />

      <ForgotPasswordForm
        open={forgotPasswordOpen}
        onOpenChange={setForgotPasswordOpen}
      />

      <Footer />
    </div>
  );
};

export default Auth;
