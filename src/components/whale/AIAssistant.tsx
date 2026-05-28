import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import ReactMarkdown from "react-markdown";
import { Send, Sparkles, Wrench, Loader2, RotateCcw } from "lucide-react";
import { Panel } from "./Panel";

const SUGGESTIONS = [
  "Bitcoin kemon lagche akhon?",
  "ETH e ekhon entry nibo?",
  "SOL er TA dekhao, BUY na SELL?",
  "10000 USD account, BTC long, 1% risk — position size?",
];

type Part =
  | { type: "text"; text: string }
  | { type: `tool-${string}`; toolName?: string; state?: string; input?: unknown; output?: unknown };

export function AIAssistant() {
  const [input, setInput] = useState("");
  const transport = useRef(new DefaultChatTransport({ api: "/api/chat" })).current;

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport,
  });

  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    taRef.current?.focus();
  }, [status]);

  const isBusy = status === "submitted" || status === "streaming";

  const submit = async (text: string) => {
    const t = text.trim();
    if (!t || isBusy) return;
    setInput("");
    await sendMessage({ text: t });
  };

  return (
    <Panel
      title="Whale Sense AI · Bangla Trading Assistant"
      subtitle="Real-time market analysis · Signal generation · Risk management · 'Bitcoin kemon lagche?' → full analysis"
      accent="purple"
      action={
        messages.length > 0 ? (
          <button
            onClick={() => setMessages([])}
            className="flex items-center gap-1 rounded-md border border-border bg-secondary/50 px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> New
          </button>
        ) : null
      }
    >
      <div className="flex h-[560px] flex-col">
        {/* Transcript */}
        <div className="flex-1 space-y-3 overflow-y-auto px-1 pb-3">
          {messages.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-secondary/20 p-6">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--neon-purple)]">
                <Sparkles className="h-4 w-4" /> Assalamu Alaikum 👋
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Ami live price, multi-timeframe TA, whale activity, ar fear/greed data dekhe BUY/SELL/HOLD signal di — Bangla te. Try:
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => submit(s)}
                    className="rounded-lg border border-border bg-card/60 px-3 py-1.5 text-[11px] text-foreground hover:border-[var(--neon-purple)] hover:bg-[var(--neon-purple)]/10"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} role={m.role} parts={m.parts as Part[]} />
          ))}

          {status === "submitted" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Bhabchhi…
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-bear/40 bg-bear/10 p-3 text-xs text-bear">
              Error: {error.message}
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="flex items-end gap-2 border-t border-border pt-3"
        >
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
            rows={2}
            placeholder='"BTC kemon lagche?" ba "ETH e entry nibo?" likho…'
            className="min-h-[44px] flex-1 resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[var(--neon-purple)] focus:outline-none"
            disabled={isBusy}
          />
          <button
            type="submit"
            disabled={isBusy || !input.trim()}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--neon-purple)] bg-[var(--neon-purple)]/15 text-[var(--neon-purple)] hover:bg-[var(--neon-purple)]/25 disabled:opacity-40"
          >
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </Panel>
  );
}

function MessageBubble({ role, parts }: { role: string; parts: Part[] }) {
  const isUser = role === "user";
  const text = parts.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join("");
  const tools = parts.filter((p) => p.type.startsWith("tool-"));

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[var(--neon-purple)]/20 px-3 py-2 text-sm text-foreground">
          {text}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {tools.map((tp, i) => (
        <ToolCard key={i} part={tp} />
      ))}
      {text && (
        <div className="prose prose-sm prose-invert max-w-none text-sm text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-code:text-[var(--neon-purple)] prose-li:my-0.5">
          <ReactMarkdown>{text}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function ToolCard({ part }: { part: Part }) {
  const toolName = part.type.replace(/^tool-/, "");
  const state = (part as { state?: string }).state ?? "running";
  const done = state === "output-available" || state === "result";
  return (
    <details className="rounded-lg border border-border bg-secondary/30 px-2 py-1 text-[11px]">
      <summary className="flex cursor-pointer items-center gap-2 font-mono text-muted-foreground">
        <Wrench className="h-3 w-3" />
        <span className="font-semibold text-foreground">{toolName}</span>
        <span className={done ? "text-bull" : "text-warn"}>{done ? "✓ done" : "⟳ running"}</span>
      </summary>
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[10px] text-muted-foreground">
        {JSON.stringify((part as { output?: unknown; input?: unknown }).output ?? (part as { input?: unknown }).input, null, 2)}
      </pre>
    </details>
  );
}
