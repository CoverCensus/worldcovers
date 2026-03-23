import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Formik, Form, Field, FormikHelpers } from "formik";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useMemo } from "react";
import { setStoredUser, type AuthUser } from "@/lib/auth";

interface ResetPasswordValues {
  password: string;
  confirmPassword: string;
}

const validateResetPassword = (
  values: ResetPasswordValues
): Partial<Record<keyof ResetPasswordValues, string>> => {
  const errors: Partial<Record<keyof ResetPasswordValues, string>> = {};

  if (!values.password) {
    errors.password = "Password is required";
  } else if (values.password.length < 8) {
    errors.password = "Password must be at least 8 characters long";
  } else {
    // Strong password: at least one upper, one lower, one digit, one symbol
    if (!/[A-Z]/.test(values.password)) {
      errors.password = "Password must include at least one uppercase letter";
    } else if (!/[a-z]/.test(values.password)) {
      errors.password = "Password must include at least one lowercase letter";
    } else if (!/[0-9]/.test(values.password)) {
      errors.password = "Password must include at least one number";
    } else if (!/[!@#$%^&*(),.?":{}|<>_\-+=\\[\];'/`~]/.test(values.password)) {
      errors.password = "Password must include at least one special character";
    }
  }

  if (!values.confirmPassword) {
    errors.confirmPassword = "Please confirm your password";
  } else if (values.password && values.confirmPassword !== values.password) {
    errors.confirmPassword = "Passwords do not match";
  }

  return errors;
};

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const uid = useMemo(
    () => searchParams.get("uid")?.trim() ?? "",
    [searchParams]
  );
  const token = useMemo(
    () => searchParams.get("token")?.trim() ?? "",
    [searchParams]
  );

  useEffect(() => {
    if (!uid || !token) {
      toast({
        title: "Invalid reset link",
        description: "The password reset link is missing or invalid. Please request a new reset email.",
        variant: "destructive",
      });
    }
  }, [uid, token, toast]);

  const handleSubmit = async (
    values: ResetPasswordValues,
    { setSubmitting }: FormikHelpers<ResetPasswordValues>
  ) => {
    if (!uid || !token) {
      toast({
        title: "Unable to reset password",
        description: "The password reset link is missing or invalid. Please request a new reset email.",
        variant: "destructive",
      });
      setSubmitting(false);
      return;
    }

    try {
      const base = import.meta.env.VITE_API_URL;
      if (!base || typeof base !== "string" || base.trim() === "") {
        toast({
          title: "Password reset unavailable",
          description: "API URL is not configured. Please contact support.",
          variant: "destructive",
        });
        return;
      }

      const trimmed = base.trim().replace(/\/+$/, "");
      const url = `${trimmed}/api/reset-password/`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          uid,
          token,
          password: values.password,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const anyData = data as { detail?: string; message?: string } | null;
        const message =
          anyData?.detail ||
          anyData?.message ;

        toast({
          title: "Unable to reset password",
          description: message,
          variant: "destructive",
        });
        return;
      }

      const anyData = data as {
        data?: {
          user?: Partial<AuthUser> & {
            id?: number;
            display?: string;
            has_usable_password?: boolean;
          };
        };
      };

      const user = anyData.data?.user;
      if (user && typeof user.id === "number") {
        setStoredUser({
          id: user.id,
          username: user.username || user.display || user.email || "User",
          email: user.email || "",
          is_staff: Boolean(user.is_staff),
        });
      }

      const successDetail =
        (data as { detail?: string; message?: string }).detail ||
        (data as { detail?: string; message?: string }).message;

      toast({
        title: "Password updated",
        description: successDetail,
      });
      navigate("/");
    } catch (err) {
      toast({
        title: "Unable to reset password",
        description: err instanceof Error ? err.message : "Network error",
        variant: "destructive",
      });
    } finally {
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
              Reset your password
            </CardTitle>
            <CardDescription className="text-center">
              Choose a new password for your WorldCovers account.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <Formik
              initialValues={{ password: "", confirmPassword: "" }}
              validate={validateResetPassword}
              validateOnMount
              onSubmit={handleSubmit}
            >
              {({ errors, touched, isSubmitting, isValid }) => (
                <Form className="space-y-2 sm:space-y-4 pt-2 sm:pt-4">
                  <div className="space-y-1 sm:space-y-2">
                    <Label htmlFor="new-password">New password</Label>
                    <Field
                      as={Input}
                      id="new-password"
                      name="password"
                      type="password"
                      placeholder="Enter a new password"
                      aria-invalid={!!(touched.password && errors.password)}
                      aria-describedby={touched.password && errors.password ? "new-password-error" : undefined}
                      className={touched.password && errors.password ? "border-destructive" : ""}
                    />
                    {touched.password && errors.password && (
                      <p id="new-password-error" className="text-sm text-destructive">
                        {errors.password}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1 sm:space-y-2">
                    <Label htmlFor="confirm-password">Confirm password</Label>
                    <Field
                      as={Input}
                      id="confirm-password"
                      name="confirmPassword"
                      type="password"
                      placeholder="Re-enter your new password"
                      aria-invalid={!!(touched.confirmPassword && errors.confirmPassword)}
                      aria-describedby={touched.confirmPassword && errors.confirmPassword ? "confirm-password-error" : undefined}
                      className={touched.confirmPassword && errors.confirmPassword ? "border-destructive" : ""}
                    />
                    {touched.confirmPassword && errors.confirmPassword && (
                      <p id="confirm-password-error" className="text-sm text-destructive">
                        {errors.confirmPassword}
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!isValid || isSubmitting || !uid || !token}
                  >
                    {isSubmitting ? "Resetting password..." : "Reset password"}
                  </Button>
                </Form>
              )}
            </Formik>
          </CardContent>
        </Card>
      </div>

      <Footer />
    </div>
  );
};

export default ResetPassword;

