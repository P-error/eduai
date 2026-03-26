"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/client-auth";

type ChatMessage = { role: "user" | "assistant"; content: string };
type PersonalizationMode = "on" | "off";

type ProfilePayload = {
  ux?: {
    effectivePreferences?: {
      explanation_style?: { confidence?: number };
    };
  };
};

function confidenceLabel(value: number | undefined) {
  if (value == null) return "low";
  if (value >= 0.66) return "high";
  if (value >= 0.33) return "medium";
  return "low";
}

function styleReason(style: string | undefined) {
  if (style === "concise") return "Short, focused explanations seem to suit you.";
  if (style === "exploratory") return "Open-ended explanations seem to work better for you.";
  return "Step-by-step explanations tend to work best for you.";
}

export default function LearnPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<PersonalizationMode>("on");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastMeta, setLastMeta] = useState<{
    explanation_style?: string;
  } | null>(null);
  const [profile, setProfile] = useState<ProfilePayload | null>(null);

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      const response = await authFetch("/api/users/me/profile");
      if (!response.ok) return;
      const json = (await response.json()) as ProfilePayload;
      if (active) setProfile(json);
    }
    loadProfile();
    return () => {
      active = false;
    };
  }, []);

  const explanationConfidence = useMemo(
    () => profile?.ux?.effectivePreferences?.explanation_style?.confidence,
    [profile],
  );

  async function sendMessage() {
    const content = input.trim();
    if (!content) return;

    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setLoading(true);

    const response = await authFetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: nextMessages,
        personalizationMode: mode,
      }),
    });
    const json = await response.json();
    if (!response.ok) {
      setError(json?.message ?? "Unable to send message.");
      setLoading(false);
      return;
    }

    setMessages((prev) => [...prev, { role: "assistant", content: json.reply }]);
    setLastMeta({
      explanation_style: json?.meta?.uxPreset?.explanation_style,
    });
    setLoading(false);
  }

  return (
    <section className="grid gap-5">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <h2 className="text-2xl font-semibold">Learn</h2>
        <p className="mt-2 text-sm text-slate-300">
          Ask questions and get educational guidance tailored to your learning style.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          This prototype is for educational topics.
        </p>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-300">Mode:</span>
          <button
            className={`rounded-full px-3 py-1 ${mode === "on" ? "bg-slate-100 text-slate-900" : "border border-slate-700 text-slate-100"}`}
            type="button"
            onClick={() => setMode("on")}
          >
            Personalized
          </button>
          <button
            className={`rounded-full px-3 py-1 ${mode === "off" ? "bg-slate-100 text-slate-900" : "border border-slate-700 text-slate-100"}`}
            type="button"
            onClick={() => setMode("off")}
          >
            Standard
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
          {messages.length === 0 ? (
            <p className="text-sm text-slate-400">Start by asking any study question.</p>
          ) : (
            messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`rounded-2xl px-4 py-3 text-sm ${
                  message.role === "user"
                    ? "bg-slate-800 text-slate-100"
                    : "bg-slate-950 text-slate-200"
                }`}
              >
                <p className="text-xs uppercase text-slate-400">{message.role}</p>
                <p className="mt-2 whitespace-pre-wrap">{message.content}</p>
                {message.role === "assistant" && index === messages.length - 1 && lastMeta ? (
                  <details className="mt-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                    <summary className="cursor-pointer text-xs text-slate-300">
                      Why this answer looked like this
                    </summary>
                    <p className="mt-2 text-xs text-slate-400">
                      {styleReason(lastMeta.explanation_style)} (confidence:{" "}
                      {confidenceLabel(explanationConfidence)}).
                    </p>
                  </details>
                ) : null}
              </div>
            ))
          )}
        </div>
        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
        <div className="mt-4 flex flex-col gap-3 md:flex-row">
          <input
            className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask a concept, request an example, or ask for a simpler explanation..."
          />
          <button
            className="rounded-full bg-slate-100 px-4 py-2 text-slate-900"
            onClick={sendMessage}
            disabled={loading || !input.trim()}
          >
            {loading ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </section>
  );
}
