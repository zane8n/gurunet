"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, ChevronLeft, Download, Loader2, Palette, UserRound } from "lucide-react";
import type { User } from "@/lib/domain";
import {
  initialPalette,
  paletteStorageKey,
  themePalettes,
  type ThemePaletteId,
} from "@/lib/theme-palettes";

type SafeUser = Omit<User, "passwordHash">;

async function accountRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text) as { error?: string };
      throw new Error(parsed.error || text || response.statusText);
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(text || response.statusText);
      throw error;
    }
  }
  return response.json() as Promise<T>;
}

export function AccountSettingsPage() {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [palette, setPalette] = useState<ThemePaletteId>(() => initialPalette());
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      document.documentElement.classList.toggle("dark", localStorage.getItem("gurunet.theme.v1") === "dark");
      document.documentElement.dataset.palette = palette;
      localStorage.setItem(paletteStorageKey, palette);
    } catch {
      document.documentElement.dataset.palette = palette;
    }
  }, [palette]);

  useEffect(() => {
    async function load() {
      try {
        const session = await accountRequest<{ user: SafeUser | null }>("/api/auth/session");
        if (!session.user) {
          window.location.assign("/");
          return;
        }
        setUser(session.user);
        setName(session.user.name);
        setTimezone(session.user.timezone);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to load account.");
      } finally {
        setBusy(false);
      }
    }
    void load();
  }, []);

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await accountRequest<{ user: SafeUser }>("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ name, timezone }),
      });
      setUser(result.user);
      setMessage("Account details updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Account update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await accountRequest<{ user: SafeUser }>("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Password updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Password update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function exportLearningRecord() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/me/export", { cache: "no-store" });
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename =
        /filename="([^"]+)"/.exec(disposition)?.[1] ??
        `gurunet-learning-export-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage("Learning export downloaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Learning export failed.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await accountRequest<{ ok: true }>("/api/me", {
        method: "DELETE",
        body: JSON.stringify({ confirmation, password: deletePassword }),
      });
      window.location.assign("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Account deletion failed.");
    } finally {
      setBusy(false);
    }
  }

  const initial = user?.name?.trim()?.[0];

  return (
    <main className="app-background min-h-screen text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1080px] items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/gurunet.svg" alt="GURUnet" width={40} height={40} className="size-10 rounded-md" priority />
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-stone-500">GURUnet</p>
              <h1 className="text-base font-semibold text-stone-950 sm:text-lg">Account</h1>
            </div>
          </Link>
          <Link
            href="/"
            className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ChevronLeft size={15} />
            Home
          </Link>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-[1080px] gap-6 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Account and data controls</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Your GURUnet profile</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Manage the details attached to your learning record, export your data, or permanently remove the account.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white/70 p-2 pr-4">
            <span className="grid size-10 place-items-center rounded-full bg-slate-950 text-sm font-semibold uppercase text-white">
              {initial ?? <UserRound size={17} />}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">{user?.name ?? "Loading"}</p>
              <p className="truncate text-xs text-slate-500">{user?.email ?? ""}</p>
            </div>
          </div>
        </div>

        {message && (
          <p className="rounded-md border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-700">
            {message}
          </p>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.42fr)]">
          <div className="grid gap-4">
            <section className="rounded-md border border-slate-200 bg-white/72 p-5">
              <p className="text-sm font-semibold text-slate-950">Profile details</p>
              <form onSubmit={saveDetails} className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                  Name
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    minLength={2}
                    maxLength={80}
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-700 focus:ring-2 focus:ring-cyan-700/15"
                    required
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                  Timezone
                  <input
                    value={timezone}
                    onChange={(event) => setTimezone(event.target.value)}
                    minLength={3}
                    maxLength={80}
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-700 focus:ring-2 focus:ring-cyan-700/15"
                    required
                  />
                </label>
                <p className="text-xs leading-5 text-slate-500 sm:col-span-2">
                  Email changes need a verification flow, so they stay locked until that route is added.
                </p>
                <button disabled={busy} className="h-10 w-fit rounded-md bg-cyan-700 px-4 text-sm font-semibold text-white disabled:opacity-60">
                  {busy ? <Loader2 className="inline animate-spin" size={15} /> : "Save details"}
                </button>
              </form>
            </section>

            <section className="rounded-md border border-slate-200 bg-white/72 p-5">
              <div className="flex items-center gap-2">
                <Palette size={17} className="text-cyan-700" />
                <p className="text-sm font-semibold text-slate-950">Color palette</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Choose a preset visual tone. Manual colors stay locked so the platform remains consistent.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {themePalettes.map((item) => {
                  const selected = palette === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setPalette(item.id);
                        setMessage(`${item.label} palette applied.`);
                      }}
                      className={`grid gap-3 rounded-md border p-3 text-left transition-colors ${
                        selected
                          ? "border-cyan-700/35 bg-cyan-50"
                          : "border-slate-200 bg-white/70 hover:border-slate-300"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-slate-950">{item.label}</span>
                        {selected && <CheckCircle2 size={15} className="text-cyan-700" />}
                      </span>
                      <span className="text-xs leading-5 text-slate-500">{item.description}</span>
                      <span className="flex gap-1.5">
                        {item.swatches.map((swatch) => (
                          <span
                            key={swatch}
                            className="size-5 rounded-full border border-slate-200"
                            style={{ backgroundColor: swatch }}
                          />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-md border border-slate-200 bg-white/72 p-5">
              <p className="text-sm font-semibold text-slate-950">Password</p>
              <form onSubmit={changePassword} className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                  Current password
                  <input
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    type="password"
                    autoComplete="current-password"
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-700 focus:ring-2 focus:ring-cyan-700/15"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                  New password
                  <input
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    type="password"
                    minLength={8}
                    maxLength={160}
                    autoComplete="new-password"
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-700 focus:ring-2 focus:ring-cyan-700/15"
                    required
                  />
                </label>
                <button disabled={busy} className="h-10 w-fit rounded-md border border-cyan-700/20 bg-cyan-50 px-4 text-sm font-semibold text-cyan-800 disabled:opacity-60">
                  Change password
                </button>
              </form>
            </section>
          </div>

          <aside className="grid h-fit gap-4">
            <section className="rounded-md border border-slate-200 bg-white/72 p-5">
              <p className="text-sm font-semibold text-slate-950">Data export</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Download a machine-readable copy of your learning record.
              </p>
              <button
                type="button"
                onClick={() => void exportLearningRecord()}
                className="mt-4 flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
              >
                <Download size={15} />
                Export data
              </button>
            </section>

            <section className="rounded-md border border-red-200 bg-red-50 p-5">
              <p className="text-sm font-semibold text-red-950">Delete account</p>
              <p className="mt-2 text-sm leading-6 text-red-800">
                Permanently removes your account, sessions, study profile, challenges, submissions, grades, notebook entries, social records, and local uploaded files.
              </p>
              <form onSubmit={deleteAccount} className="mt-4 grid gap-3">
                <label className="grid gap-1.5 text-sm font-medium text-red-900">
                  Type DELETE
                  <input
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    className="h-10 rounded-md border border-red-200 bg-white px-3 text-sm outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/15"
                    required
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-red-900">
                  Password if applicable
                  <input
                    value={deletePassword}
                    onChange={(event) => setDeletePassword(event.target.value)}
                    type="password"
                    autoComplete="current-password"
                    className="h-10 rounded-md border border-red-200 bg-white px-3 text-sm outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/15"
                  />
                </label>
                <button disabled={busy || confirmation !== "DELETE"} className="h-10 rounded-md bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-60">
                  Permanently delete
                </button>
              </form>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
