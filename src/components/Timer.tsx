"use client";

import { useEffect, useRef, useState } from "react";
import { DATE_OVERRIDE_ALLOWED } from "@/lib/hooks";
import { ls } from "@/lib/idb";
import { Icon, Ring } from "./ui";

export type TimerKind = "trening" | "branje" | "ponovitev" | "pocitnice";

export interface TimerState {
  kind: TimerKind;
  phase: "work" | "done" | "break";
  startedAt: number;
  durationSec: number;
  ref?: string;
  opis?: string;
}

const KEY = "dojo-timer";

export function loadTimer(): TimerState | null {
  try {
    const raw = ls.get(KEY);
    return raw ? (JSON.parse(raw) as TimerState) : null;
  } catch {
    return null;
  }
}
export function saveTimer(t: TimerState | null) {
  if (t) ls.set(KEY, JSON.stringify(t));
  else ls.del(KEY);
}

/** V razvoju z ?hitro=1 trajajo časovniki nekaj sekund (za preizkus). */
export function fastMode(): boolean {
  if (!DATE_OVERRIDE_ALLOWED || typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(location.search).get("hitro");
    if (q === "1") sessionStorage.setItem("dojo-hitro", "1");
    if (q === "0") sessionStorage.removeItem("dojo-hitro");
    return sessionStorage.getItem("dojo-hitro") === "1";
  } catch {
    return false;
  }
}
export function minutes(n: number): number {
  return fastMode() ? Math.max(3, n / 2) : n * 60;
}

// ---------------------------------------------------------------- zvok

let ctx: AudioContext | null = null;
export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    /* brez zvoka */
  }
}
export function soundOn(): boolean {
  return ls.get("dojo-zvok") !== "0";
}
export function setSoundOn(v: boolean) {
  ls.set("dojo-zvok", v ? "1" : "0");
}
export function gong() {
  if (!soundOn()) return;
  try {
    unlockAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const [f, delay] of [[440, 0], [660, 0.25], [880, 0.5]] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + delay);
      g.gain.exponentialRampToValueAtTime(0.4, now + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + delay + 1.2);
      o.connect(g).connect(ctx.destination);
      o.start(now + delay);
      o.stop(now + delay + 1.3);
    }
  } catch {
    /* brez zvoka */
  }
}

// ---------------------------------------------------------------- odštevalnik

export function useCountdown(t: TimerState | null, onEnd: () => void) {
  const [now, setNow] = useState(() => Date.now());
  const ended = useRef(false);
  useEffect(() => {
    ended.current = false;
    if (!t) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [t]);
  const remaining = t ? Math.max(0, t.startedAt + t.durationSec * 1000 - now) : 0;
  useEffect(() => {
    if (t && t.phase !== "done" && remaining <= 0 && !ended.current) {
      ended.current = true;
      onEnd();
    }
  }, [t, remaining, onEnd]);
  return { remaining, progress: t ? 1 - remaining / (t.durationSec * 1000) : 0 };
}

export function fmt(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function TimerFace({ t, remaining, progress, message, onCancel }: { t: TimerState; remaining: number; progress: number; message: string; onCancel: () => void }) {
  const isBreak = t.phase === "break";
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-8 px-4 text-center">
      <Ring progress={progress} size={280} color={isBreak ? "var(--ok)" : "var(--accent)"}>
        <span className="text-6xl font-extrabold tabular-nums" aria-live="off">{fmt(remaining)}</span>
        <span className="mt-1 text-lg font-bold text-muted">{isBreak ? "odmor" : "trening"}</span>
      </Ring>
      <p className="max-w-xs text-2xl font-extrabold leading-snug">{message}</p>
      <button className="btn" onClick={onCancel}>
        <Icon name="x" /> {isBreak ? "Preskoči odmor" : "Prekini"}
      </button>
    </div>
  );
}
