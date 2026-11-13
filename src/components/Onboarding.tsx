"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { ls } from "@/lib/idb";
import { createFamily, createPairingCode, joinFamily } from "@/lib/store";
import { Icon, Screen } from "./ui";

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function isStandalone() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function InstallHint({ onContinue }: { onContinue: () => void }) {
  return (
    <Screen title="Najprej na domači zaslon">
      <div className="card flex flex-col gap-3">
        <p>Na iPhonu aplikacijo najprej dodaj na domači zaslon, šele nato jo poveži. Safari in aplikacija na domačem zaslonu imata ločen spomin.</p>
        <ol className="list-decimal space-y-2 pl-6">
          <li>Spodaj tapni gumb <b>Deli</b> (kvadrat s puščico).</li>
          <li>Izberi <b>Dodaj na začetni zaslon</b>.</li>
          <li>Odpri <b>Dojo</b> z domačega zaslona.</li>
        </ol>
      </div>
      <button className="btn" onClick={onContinue}>Nadaljuj tukaj</button>
    </Screen>
  );
}

export function Onboarding() {
  const [prefill] = useState(() => {
    try { return (new URLSearchParams(location.search).get("koda") ?? "").toUpperCase(); } catch { return ""; }
  });
  const [step, setStep] = useState<"install" | "who" | "parent" | "student">(() => (isIOS() && !isStandalone() ? "install" : prefill ? "student" : "who"));

  if (step === "install") return <InstallHint onContinue={() => setStep("who")} />;
  if (step === "parent") return <ParentSetup onBack={() => setStep("who")} />;
  if (step === "student") return <StudentJoin onBack={() => setStep("who")} prefill={prefill} />;
  return (
    <Screen>
      <div className="flex flex-col items-center gap-2 pt-8 text-center">
        <img src="/icon.svg" alt="" width={96} height={96} className="rounded-3xl" />
        <h1 className="text-3xl font-extrabold">Adamov Dojo</h1>
        <p className="text-muted">Kdo bo uporabljal ta telefon?</p>
      </div>
      <button className="btn btn-big btn-primary" onClick={() => setStep("student")}>
        <Icon name="karate" size={30} /> Adam
      </button>
      <button className="btn btn-big" onClick={() => setStep("parent")}>
        <Icon name="lock" size={28} /> Mama
      </button>
      <p className="text-center text-base text-muted">Mama začne prva: ustvari dojo in dobi kodo za Adamov telefon.</p>
    </Screen>
  );
}

function ParentSetup({ onBack }: { onBack: () => void }) {
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ok = /^\d{4,8}$/.test(pin) && pin === pin2;
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      ls.set("dojo-odklenjeno", String(Date.now()));
      await createFamily(pin);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Screen title="Mamin telefon" onBack={onBack}>
      <div className="card flex flex-col gap-3">
        <p>Izberi PIN kodo (4 do 8 številk). Z njo odkleneš starševski način in unovčiš nagrade. Adamu je ne povej.</p>
        <label className="font-bold" htmlFor="pin1">PIN</label>
        <input id="pin1" className="input text-2xl tracking-widest" inputMode="numeric" type="password" autoComplete="new-password" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
        <label className="font-bold" htmlFor="pin2">Ponovi PIN</label>
        <input id="pin2" className="input text-2xl tracking-widest" inputMode="numeric" type="password" autoComplete="new-password" maxLength={8} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} />
        {pin2.length >= 4 && pin !== pin2 && <p className="font-bold text-bad">PIN kodi se ne ujemata.</p>}
        {err && <p className="font-bold text-bad" role="alert">{err}</p>}
        <button className="btn btn-primary" disabled={!ok || busy} onClick={submit}>{busy ? "Ustvarjam ..." : "Ustvari dojo"}</button>
      </div>
      <p className="text-base text-muted">Shranimo samo ime »Adam«, naloge, točke in datume. Brez e-pošte in telefonskih številk.</p>
    </Screen>
  );
}

export function PairingCode({ role = "student" }: { role?: "student" | "parent" }) {
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [qr, setQr] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const make = async () => {
    setErr(null);
    try {
      const c = await createPairingCode(role);
      setCode(c);
      const url = `${location.origin}/?koda=${c.code}`;
      setQr(await QRCode.toDataURL(url, { margin: 1, width: 240 }));
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = code ? Math.max(0, new Date(code.expires_at).getTime() - now) : 0;
  return (
    <div className="card flex flex-col items-center gap-3 text-center">
      {!code || left === 0 ? (
        <>
          <p>{role === "student" ? "Ustvari kodo in jo vpiši na Adamovem telefonu." : "Koda za drug starševski telefon (npr. nov telefon)."}</p>
          <button className="btn btn-primary" onClick={make}><Icon name="qr" /> {code ? "Nova koda" : "Ustvari kodo"}</button>
        </>
      ) : (
        <>
          <p className="font-bold">Koda za {role === "student" ? "Adamov telefon" : "starševski telefon"}</p>
          <p className="font-mono text-5xl font-extrabold tracking-[0.2em]" data-testid="pairing-code">{code.code}</p>
          {qr && <img src={qr} alt={`QR koda za ${code.code}`} width={200} height={200} className="rounded-xl bg-white p-2" />}
          <p className="text-muted">Velja še {Math.floor(left / 60000)}:{String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}</p>
        </>
      )}
      {err && <p className="font-bold text-bad" role="alert">{err}</p>}
    </div>
  );
}

function StudentJoin({ onBack, prefill }: { onBack: () => void; prefill: string }) {
  const [code, setCode] = useState(prefill);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [scan, setScan] = useState(false);
  const submit = async (c = code) => {
    setBusy(true);
    setErr(null);
    try {
      await joinFamily(c, "Adamov telefon");
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Screen title="Adamov telefon" onBack={onBack}>
      <div className="card flex flex-col gap-3">
        <p>Mama ti pokaže kodo na svojem telefonu. Vpiši jo sem.</p>
        <input aria-label="Koda" className="input text-center font-mono text-4xl uppercase tracking-[0.3em]" maxLength={6} autoCapitalize="characters" autoComplete="off" value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
        {err && <p className="font-bold text-bad" role="alert">{err}</p>}
        <button className="btn btn-primary btn-big" disabled={code.length !== 6 || busy} onClick={() => submit()}>{busy ? "Povezujem ..." : "Poveži"}</button>
        <button className="btn" onClick={() => setScan(true)}><Icon name="qr" /> Skeniraj QR kodo</button>
      </div>
      {scan && <QrScanner onCode={(c) => { setScan(false); setCode(c); void submit(c); }} onClose={() => setScan(false)} />}
    </Screen>
  );
}

function QrScanner({ onCode, onClose }: { onCode: (c: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    (async () => {
      try {
        const jsQR = (await import("jsqr")).default;
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        const v = video.current!;
        v.srcObject = stream;
        v.setAttribute("playsinline", "true");
        await v.play();
        const canvas = document.createElement("canvas");
        const g = canvas.getContext("2d", { willReadFrequently: true })!;
        const tick = () => {
          if (stopped) return;
          if (v.readyState === v.HAVE_ENOUGH_DATA) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            g.drawImage(v, 0, 0);
            const img = g.getImageData(0, 0, canvas.width, canvas.height);
            const res = jsQR(img.data, img.width, img.height);
            if (res?.data) {
              let c = res.data;
              try { c = new URL(res.data).searchParams.get("koda") ?? res.data; } catch { /* ni URL */ }
              c = c.toUpperCase().replace(/[^A-Z0-9]/g, "");
              if (c.length === 6) { onCode(c); return; }
            }
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setErr("Kamera ni dostopna. Vpiši kodo ročno.");
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black p-4 text-white">
      <video ref={video} className="w-full max-w-sm rounded-2xl" muted playsInline />
      {err && <p className="font-bold">{err}</p>}
      <button className="btn" onClick={onClose}><Icon name="x" /> Zapri</button>
    </div>
  );
}
