import type { ISODate } from "./dates";

export interface Priprava { id: string; besedilo: string; vnos?: string }
export interface Turnir {
  id: string; datum: ISODate; predmet: string; vrsta: string; zacetek: ISODate;
  potrditi?: string; kviz?: string; priprave: Priprava[];
}
export interface Sprotni { id: string; od: ISODate; predmet: string; vrsta: string; priprava: string }
export interface TurnirjiData { sprotni: Sprotni[]; turnirji: Turnir[] }

export interface UrnikData {
  ure: { ura: number; cas: string; dnevi: string[] }[];
  zamenjave: { od: ISODate; iz: string; v: string; opomba?: string }[];
  predmeti: Record<string, string>;
}
export type KataData = Record<string, { predmeti: string[]; opomba: string }>;
export interface RitemDan {
  prihod?: string; odmor?: number; bloki: number; blokiPredTestom: number; kata?: string;
  karate?: boolean; zgodajSpat?: boolean; najdaljsiDan?: boolean; ponovitevTedna?: number;
  sobotaBlokCeTestPonTor?: boolean; nedelja?: string;
}
export interface RitemData { predTestomDni: number; dnevi: Record<string, RitemDan>; karate: string; karateUrnik: string }
export interface PocitniceObdobje { od: ISODate; do: ISODate; nacin: "prosto" | "plan"; besedilo: string; naloge?: string[] }
export interface PocitniceData { obdobja: PocitniceObdobje[] }
export interface Pas { ime: string; od: number; barva: string; tekst: string }
export interface Nagrada { id: string; ime: string; cena: number }
export interface KiData { dejanja: Record<string, { ki: number; ime: string }>; pasovi: Pas[]; nagrade: Nagrada[] }
export interface Vprasanje { id: string; v: string; o: string; preveri?: boolean }
export interface Sklop { id: string; ime: string; turnir: string; navodilo: string; vprasanja: Vprasanje[] }
export interface Znak { id: string; oblika: string; simbol: string; opis: string; pomen: string }
export interface ZnakiData { navodilo: string; znaki: Znak[] }
export interface SolskoLeto { sola: string; razred: string; solskoLeto: string; konecObdobja: ISODate; drugoPolletjeOd: ISODate; lihiTedenPravilo: "iso" | "iso-obratno" }

export interface Content {
  "solsko-leto": SolskoLeto;
  urnik: UrnikData;
  kata: KataData;
  ritem: RitemData;
  pocitnice: PocitniceData;
  turnirji: TurnirjiData;
  ki: KiData;
  kviz: Record<string, Sklop>;
  znaki: ZnakiData;
  nasveti: string[];
}
export type ContentKey = keyof Content;

export type Vrsta = "trening" | "branje" | "kata" | "kviz" | "napaka" | "ponovitev" | "pocitnice" | "turnir_zacetek" | "turnir_seznam";
export type Status = "pending" | "confirmed" | "rejected";

export interface DojoEvent {
  id: string; family_id: string; vrsta: Vrsta; predmet: string; ref: string; opis: string;
  dan: ISODate; ki: number; status: Status; komentar: string; created_at: string;
  decided_at?: string | null;
  /** samo lokalno: še ni poslano na strežnik */
  local?: boolean;
}
export interface ChecklistRow { family_id: string; turnir_id: string; item_id: string; done: boolean; vnos: string; updated_at?: string }
export interface Mistake { id: string; family_id: string; vprasanje: string; odgovor: string; vir: string; fixed_at: string | null; created_at: string }
export interface Feedback { family_id: string; turnir_id: string; mood: "super" | "ok" | "tezko"; created_at?: string }
export interface Redemption { id: string; family_id: string; reward_id: string; label: string; cost: number; created_at: string }
export interface Member { user_id: string; family_id: string; role: "parent" | "student"; device_label: string; created_at: string }
