"use client";

import { useState, type ReactNode } from "react";
import type { Pas } from "@/lib/types";

// ---------------------------------------------------------------- ikone (izvirne, preproste)

type IconName =
  | "home" | "trophy" | "car" | "book" | "gift" | "check" | "x" | "play" | "pause" | "clock" | "moon" | "sun"
  | "karate" | "info" | "chat" | "gear" | "calendar" | "back" | "plus" | "trash" | "phone" | "sound" | "mute"
  | "fire" | "star" | "lock" | "qr" | "download" | "upload" | "eye" | "pencil";

export function Icon({ name, size = 24, className = "" }: { name: IconName; size?: number; className?: string }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className, "aria-hidden": true };
  switch (name) {
    case "home": return <svg {...p}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></svg>;
    case "trophy": return <svg {...p}><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" /><path d="M12 13v4M8 20h8M9 17h6" /></svg>;
    case "car": return <svg {...p}><path d="M4 16v-4l2-5h12l2 5v4" /><path d="M3 16h18v2H3z" /><circle cx="7.5" cy="18.5" r="1.5" /><circle cx="16.5" cy="18.5" r="1.5" /><path d="M6 12h12" /></svg>;
    case "book": return <svg {...p}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 21V5M8 7h7" /></svg>;
    case "gift": return <svg {...p}><rect x="3" y="9" width="18" height="12" rx="2" /><path d="M3 13h18M12 9v12" /><path d="M12 9c-2-4-6-4-6-1s6 1 6 1 6 2 6-1-4-3-6 1z" /></svg>;
    case "check": return <svg {...p}><path d="M5 12.5l4.5 4.5L19 7" /></svg>;
    case "x": return <svg {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>;
    case "play": return <svg {...p}><path d="M8 5l11 7-11 7z" fill="currentColor" /></svg>;
    case "pause": return <svg {...p}><path d="M8 5v14M16 5v14" /></svg>;
    case "clock": return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case "moon": return <svg {...p}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>;
    case "sun": return <svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" /></svg>;
    case "karate": return <svg {...p}><circle cx="12" cy="4.5" r="2" /><path d="M12 7v6l-4 7M12 13l4 7M5 9l7 1 6-4" /><path d="M9 12h6" /></svg>;
    case "info": return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg>;
    case "chat": return <svg {...p}><path d="M4 5h16v11H9l-5 4z" /></svg>;
    case "gear": return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></svg>;
    case "calendar": return <svg {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>;
    case "back": return <svg {...p}><path d="M15 5l-7 7 7 7" /></svg>;
    case "plus": return <svg {...p}><path d="M12 5v14M5 12h14" /></svg>;
    case "trash": return <svg {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>;
    case "phone": return <svg {...p}><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></svg>;
    case "sound": return <svg {...p}><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></svg>;
    case "mute": return <svg {...p}><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M17 9l4 6M21 9l-4 6" /></svg>;
    case "fire": return <svg {...p}><path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 2 1 3 3 3 5 1-2 0-5 0-8z" /></svg>;
    case "star": return <svg {...p}><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></svg>;
    case "lock": return <svg {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
    case "qr": return <svg {...p}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><path d="M14 14h3v3h-3zM20 14v1M14 20h1M17 17h4v4h-4" /></svg>;
    case "download": return <svg {...p}><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></svg>;
    case "upload": return <svg {...p}><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>;
    case "eye": return <svg {...p}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
    case "pencil": return <svg {...p}><path d="M4 20l4-1 11-11-3-3L5 16z" /></svg>;
  }
}

// ---------------------------------------------------------------- pas

export function BeltBar({ pas, size = "md" }: { pas: Pas; size?: "sm" | "md" | "lg" }) {
  const w = size === "lg" ? 220 : size === "md" ? 120 : 64;
  const h = w * 0.3;
  const outline = pas.barva.toLowerCase() === "#f5f5f4" || pas.barva.toLowerCase() === "#ffffff" ? "#a8a29e" : "rgba(0,0,0,0.35)";
  return (
    <svg width={w} height={h} viewBox="0 0 100 30" aria-label={`${pas.ime} pas`} role="img">
      <rect x="2" y="10" width="96" height="10" rx="3" fill={pas.barva} stroke={outline} strokeWidth="1.2" />
      <rect x="40" y="6" width="20" height="18" rx="4" fill={pas.barva} stroke={outline} strokeWidth="1.2" />
      <path d="M44 24 L36 30 L44 30 L50 24 Z" fill={pas.barva} stroke={outline} strokeWidth="1" />
      <path d="M56 24 L64 30 L56 30 L50 24 Z" fill={pas.barva} stroke={outline} strokeWidth="1" />
    </svg>
  );
}

// ---------------------------------------------------------------- krog napredka

export function Ring({ progress, size = 260, stroke = 18, color = "var(--accent)", children }: { progress: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - p)} style={{ transition: "stroke-dashoffset 1s linear" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------- okvirji

export function Screen({ title, onBack, right, children }: { title?: string; onBack?: () => void; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-8 pt-[max(16px,env(safe-area-inset-top))]">
      {(title || onBack) && (
        <header className="mb-4 flex items-center gap-2">
          {onBack && (
            <button className="btn !min-h-11 !px-3" onClick={onBack} aria-label="Nazaj"><Icon name="back" /></button>
          )}
          {title && <h1 className="flex-1 text-2xl font-extrabold">{title}</h1>}
          {right}
        </header>
      )}
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="flex-1 text-xl font-extrabold">{title}</h2>
          <button className="btn !min-h-11 !px-3" onClick={onClose} aria-label="Zapri"><Icon name="x" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PinPad({ onSubmit, busy, error, label = "Vpiši PIN" }: { onSubmit: (pin: string) => void; busy?: boolean; error?: string | null; label?: string }) {
  const [pin, setPin] = useState("");
  const [prevError, setPrevError] = useState(error);
  if (error !== prevError) {
    setPrevError(error);
    if (error) setPin("");
  }
  const press = (d: string) => !busy && setPin((p) => (p.length < 8 ? p + d : p));
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="font-bold">{label}</p>
      <div className="flex h-6 gap-3" aria-live="polite" aria-label={`${pin.length} številk vpisanih`} data-testid="pin-pike">
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <span key={i} className="h-5 w-5 rounded-full border-2 border-ink" style={{ background: i < pin.length ? "var(--ink)" : "transparent" }} />
        ))}
      </div>
      {error && <p className="font-bold text-bad" role="alert">{error}</p>}
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} className="btn h-16 w-20 text-2xl" onClick={() => press(d)} disabled={busy}>{d}</button>
        ))}
        <button className="btn h-16 w-20" onClick={() => setPin((p) => p.slice(0, -1))} disabled={busy} aria-label="Pobriši zadnjo"><Icon name="back" /></button>
        <button className="btn h-16 w-20 text-2xl" onClick={() => press("0")} disabled={busy}>0</button>
        <button className="btn btn-primary h-16 w-20" onClick={() => onSubmit(pin)} disabled={busy || pin.length < 4} aria-label="Potrdi PIN" data-testid="pin-ok"><Icon name="check" /></button>
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border-2 border-dashed border-line p-4 text-center text-muted">{children}</p>;
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-1" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span className="font-semibold">{label}</span>
      <span className="relative h-8 w-14 rounded-full transition" style={{ background: on ? "var(--ok)" : "var(--line)" }}>
        <span className="absolute top-1 h-6 w-6 rounded-full bg-white shadow transition" style={{ left: on ? 28 : 4 }} />
      </span>
    </button>
  );
}
