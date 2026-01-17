"use client";

import { useState } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function ChatPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [subject, setSubject] = useState("General");
  const [declaredPrefs, setDeclaredPrefs] = useState(
    '{"tone":"friendly","depth":"conceptual"}',
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMessage() {
    if (!input.trim()) return;
    const outgoing = input.trim();
    setMessages((prev) => [...prev, { role: "user", content: outgoing }]);
    setInput("");
    setLoading(true);

    let declaredPreferences: Record<string, string> | undefined;
    try {
      declaredPreferences = JSON.parse(declaredPrefs);
    } catch {
      declaredPreferences = undefined;
    }

    const body: {
      message: string;
      sessionId?: string;
      subject: string;
      declaredPreferences?: Record<string, string>;
    } = {
      message: outgoing,
      subject,
      declaredPreferences,
    };

    if (sessionId) {
      body.sessionId = sessionId;
    }

    const response = await fetch("/api/chat/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await response.json();
    setSessionId(json.sessionId);
    setMessages((prev) => [...prev, { role: "assistant", content: json.reply }]);
    setLoading(false);
  }

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
        <h2 className="text-2xl font-semibold">Chat personalization lab</h2>
        <p className="mt-2 text-sm text-slate-300">
          Messages are stored with signals and preferences for analytics.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm">
            Subject
            <input
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </label>
          <label className="grid gap-2 text-sm">
            Declared preferences (JSON)
            <textarea
              rows={3}
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
              value={declaredPrefs}
              onChange={(event) => setDeclaredPrefs(event.target.value)}
            />
          </label>
        </div>
      </div>
      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="space-y-4">
          {messages.length === 0 ? (
            <p className="text-sm text-slate-400">No messages yet.</p>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                className={`rounded-2xl px-4 py-3 text-sm ${
                  message.role === "user"
                    ? "bg-slate-800 text-slate-100"
                    : "bg-slate-950 text-slate-200"
                }`}
              >
                <p className="text-xs uppercase text-slate-400">
                  {message.role}
                </p>
                <p className="mt-2 whitespace-pre-wrap">{message.content}</p>
              </div>
            ))
          )}
        </div>
        <div className="mt-4 flex flex-col gap-3 md:flex-row">
          <input
            className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-100"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask for an explanation, example, or simplification..."
          />
          <button
            className="rounded-full bg-slate-100 px-4 py-2 text-slate-900"
            onClick={sendMessage}
            disabled={loading}
          >
            {loading ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </section>
  );
}
