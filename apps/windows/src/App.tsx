import { type FormEvent, useCallback, useEffect, useState } from "react";
import type { LearningClockDto } from "@gurunet/contracts";
import { releaseRefreshDelay } from "@gurunet/domain";
import { api, signIn } from "./lib/client";
import {
  enableWindowsNotifications,
  pollWindowsNotifications,
  syncWindowsLearningReminders,
  type WindowsReminderBootstrap,
} from "./lib/notifications";

type View = "today" | "notebook" | "progress" | "network" | "settings";
type Data = WindowsReminderBootstrap & {
  clock?: LearningClockDto;
  challenge?: {
    id: string;
    title: string;
    difficulty: string;
    topic: string;
    scenario: string;
    objective: string;
    constraints: string[];
    allowedTools: string[];
    deadlineAt: string;
    status?: string;
  };
  user: { name: string; pisScore: number; currentStreak: number };
};

export function App() {
  const [view, setView] = useState<View>("today");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [auth, setAuth] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await api.request<Data>("/bootstrap");
      setData(result);
      setAuth(false);
      setError("");
    } catch (caught: unknown) {
      if (caught && typeof caught === "object" && "status" in caught && caught.status === 401) {
        setAuth(true);
      } else {
        setError(errorMessage(caught));
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!data) return;
    void enableWindowsNotifications()
      .then(() => Promise.all([pollWindowsNotifications(), syncWindowsLearningReminders(data)]))
      .catch(() => undefined);
    const timer = window.setInterval(() => void pollWindowsNotifications().catch(() => undefined), 60_000);
    return () => window.clearInterval(timer);
  }, [data]);

  useEffect(() => {
    if (!data?.clock) return;
    const delay = releaseRefreshDelay(data.clock);
    const timer = delay === null ? undefined : window.setTimeout(() => void load(), delay);
    const refreshOnFocus = () => void load();
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [data?.clock, load]);

  return (
    <div className="shell">
      <aside>
        <div className="brand">GURUnet <span>Windows</span></div>
        <nav>
          {(["today", "notebook", "progress", "network"] as View[]).map((item) => (
            <button className={view === item ? "active" : ""} onClick={() => setView(item)} key={item}>
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </nav>
        <button className={view === "settings" ? "settings active" : "settings"} onClick={() => setView("settings")}>Settings</button>
      </aside>
      <main>
        <header>
          <div><small>PERSONAL CAPACITY SYSTEM</small><h1>{view[0].toUpperCase() + view.slice(1)}</h1></div>
          <div className="identity">{data?.user.name ?? "Not signed in"}</div>
        </header>
        {auth ? (
          <Login onDone={load} />
        ) : (
          <>
            {error ? <div className="error">{error}</div> : null}
            {view === "today" ? <Today data={data} /> : <Placeholder view={view} />}
          </>
        )}
      </main>
    </div>
  );
}

function Login({ onDone }: { onDone: () => Promise<void> | void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(email, password);
      await onDone();
    } catch (caught: unknown) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="loginPanel" onSubmit={submit}>
      <small>SECURE APP SESSION</small>
      <h2>Sign in to GURUnet</h2>
      <label>Email<input value={email} onChange={(event) => setEmail(event.currentTarget.value)} type="email" autoComplete="email" /></label>
      <label>Password<input value={password} onChange={(event) => setPassword(event.currentTarget.value)} type="password" autoComplete="current-password" /></label>
      {error ? <p className="error">{error}</p> : null}
      <button disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
    </form>
  );
}

function Today({ data }: { data: Data | null }) {
  const challenge = data?.challenge;
  if (!data) return <div className="loading">Loading your workspace...</div>;
  if (!challenge) return <section><h2>Your next challenge is being prepared.</h2></section>;
  return (
    <div className="workspace">
      <article>
        <div className="meta"><span>{challenge.difficulty}</span><span>{challenge.topic}</span><span>Streak {data.user.currentStreak}</span></div>
        <h2>{challenge.title}</h2>
        <p>{challenge.scenario}</p>
        <h3>Objective</h3>
        <p>{challenge.objective}</p>
        <details open>
          <summary>Constraints and tools</summary>
          <div className="columns">
            <ul>{challenge.constraints.map((item) => <li key={item}>{item}</li>)}</ul>
            <ul>{challenge.allowedTools.map((item) => <li key={item}><code>{item}</code></li>)}</ul>
          </div>
        </details>
      </article>
      <section className="actionPane">
        <div><small>PROGRESS SIGNAL</small><strong>{data.user.pisScore.toFixed(1)}</strong><span>PIS</span></div>
        <button>Start response</button>
        <p>Drafts synchronize. Final submission requires a connection.</p>
      </section>
    </div>
  );
}

function Placeholder({ view }: { view: View }) {
  return (
    <section className="empty">
      <h2>{view === "settings" ? "Account and app preferences" : `${view[0].toUpperCase() + view.slice(1)} is ready for signed-in data.`}</h2>
      <p>The Windows app keeps desktop navigation, keyboard access, native notifications, secure credentials, and updates separate from web and mobile presentation.</p>
    </section>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to sign in";
}
