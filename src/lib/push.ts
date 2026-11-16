"use client";
// Potisna obvestila v brskalniku. Na iPhonu delujejo samo v aplikaciji na
// domačem zaslonu (iOS 16.4 ali novejši) in samo po dovoljenju uporabnika.
import { client } from "./store";

export type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on";

function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  try {
    if (!("serviceWorker" in navigator)) return null;
    return (await navigator.serviceWorker.getRegistration()) ?? null;
  } catch {
    return null;
  }
}

export async function pushState(): Promise<PushState> {
  try {
    if (isIOS() && !isStandalone()) return "needs-install";
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
    if (Notification.permission === "denied") return "denied";
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return "off";
    const { data } = await client().rpc("has_push_subscription", { endpoint: sub.endpoint });
    return data ? "on" : "off";
  } catch {
    return "unsupported";
  }
}

/** Mora se klicati ob tapu (iPhone dovoli vprašanje za dovoljenje samo takrat). */
export async function enablePush(): Promise<void> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Obvestila niso dovoljena. Vklopiš jih v Nastavitvah telefona → Obvestila → Dojo.");
  const reg = (await registration()) ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const { data: key, error } = await client().rpc("vapid_public_key");
  if (error) throw new Error(error.message);
  if (!key) throw new Error("Strežnik za obvestila še ni pripravljen. Poskusi čez nekaj minut.");
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key as string) });
  const j = sub.toJSON();
  const { error: e2 } = await client().rpc("save_push_subscription", { endpoint: j.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth });
  if (e2) throw new Error(e2.message);
  try {
    await reg.showNotification("Obvestila so vklopljena", { body: "Tako bo videti opomnik iz Doja.", icon: "/icon-192.png" });
  } catch { /* ni nujno */ }
}

export async function disablePush(): Promise<void> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await client().rpc("delete_push_subscription", { endpoint: sub.endpoint });
  await sub.unsubscribe();
}
