import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { accountPost } from "@/services/account";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const key = params.get("key");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    if (!key) return;
    setBusy(true);
    setError("");
    try {
      await accountPost("email/verify", { key });
      setConfirmed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to verify this email address.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="min-h-screen flex flex-col">
    <Navigation />
    <main className="flex-1 mx-auto w-full max-w-md p-6 space-y-4">
      <h1 className="font-heading text-2xl">Verify your email</h1>
      {confirmed ? <p role="status">Your email is verified. Sign in to contribute to the catalog.</p> : <>
        <p>{key ? "Confirm your email address to enable Contributor access." : "This verification link is missing its key."}</p>
        {key && <Button onClick={confirm} disabled={busy}>{busy ? "Confirming..." : "Confirm email"}</Button>}
      </>}
      {error && <p role="alert">{error}</p>}
      <p><Link to="/auth" className="underline">Sign in</Link></p>
      {!confirmed && <p>If the link has expired or was already used, sign in. An unverified account can request another link by signing in again.</p>}
    </main>
    <Footer />
  </div>;
}
