import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isSupabaseConfig =
      error.message.includes("Supabase") && error.message.includes("not configured");

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-foreground mb-2">
            {isSupabaseConfig ? "Configuration required" : "Something went wrong"}
          </h1>
          <p className="text-sm text-muted-foreground mb-4">{error.message}</p>
          {isSupabaseConfig && (
            <p className="text-xs text-muted-foreground mb-4">
              In your GitHub repo: Settings → Secrets and variables → Actions → add{" "}
              <code className="bg-muted px-1 rounded">VITE_SUPABASE_URL</code> and{" "}
              <code className="bg-muted px-1 rounded">VITE_SUPABASE_PUBLISHABLE_KEY</code>.
              Then push to main to trigger a new build.
            </p>
          )}
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="text-sm font-medium text-primary hover:underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
