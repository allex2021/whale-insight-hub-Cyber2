import { Component, type ReactNode } from "react";
import { TriangleAlert, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  label?: string;
}
interface State {
  error: Error | null;
}

/**
 * Client-side safety net: if any downstream component (e.g. MasterSignal)
 * throws — including Zod parse errors from server-fn responses — we render
 * a contained error card instead of letting the whole dashboard go blank.
 */
export class SignalErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error("[SignalErrorBoundary]", error);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      const msg = this.state.error.message || String(this.state.error);
      return (
        <div className="rounded-xl border border-bear/40 bg-bear/5 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-bear">
            <TriangleAlert className="h-4 w-4" />
            {this.props.label ?? "Signal"} failed to render
          </div>
          <p className="mt-1 break-words font-mono text-[11px] text-muted-foreground">
            {msg.slice(0, 400)}
          </p>
          <button
            onClick={this.reset}
            className="mt-2 flex items-center gap-1.5 rounded-md border border-[var(--neon-blue)]/50 bg-[var(--neon-blue)]/15 px-3 py-1.5 text-xs font-semibold text-[var(--neon-blue)] hover:bg-[var(--neon-blue)]/25"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
