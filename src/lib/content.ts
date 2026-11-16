import solskoLeto from "../../data/solsko-leto.json";
import urnik from "../../data/urnik.json";
import kata from "../../data/kata.json";
import ritem from "../../data/ritem.json";
import pocitnice from "../../data/pocitnice.json";
import turnirji from "../../data/turnirji.json";
import ki from "../../data/ki.json";
import znaki from "../../data/znaki.json";
import nasveti from "../../data/nasveti.json";
import obvestila from "../../data/obvestila.json";
import slj from "../../data/kviz/slj.json";
import druPokrajine from "../../data/kviz/dru-pokrajine.json";
import tja from "../../data/kviz/tja.json";
import gos from "../../data/kviz/gos.json";
import druCasovniTrak from "../../data/kviz/dru-casovni-trak.json";
import type { Content, ContentKey, Sklop } from "./types";

export const DEFAULT_CONTENT: Content = {
  "solsko-leto": solskoLeto as Content["solsko-leto"],
  urnik: urnik as Content["urnik"],
  kata: kata as Content["kata"],
  ritem: ritem as Content["ritem"],
  pocitnice: pocitnice as Content["pocitnice"],
  turnirji: turnirji as Content["turnirji"],
  ki: ki as Content["ki"],
  kviz: Object.fromEntries(
    [slj, druPokrajine, tja, gos, druCasovniTrak].map((s) => [s.id, s as Sklop]),
  ),
  znaki: znaki as Content["znaki"],
  nasveti: nasveti as string[],
  obvestila: obvestila as Content["obvestila"],
};

export const CONTENT_KEYS = Object.keys(DEFAULT_CONTENT) as ContentKey[];

/** Združi shranjeno vsebino s privzeto (manjkajoči ključi dobijo privzeto vrednost). */
export function mergeContent(stored: Partial<Record<string, unknown>>): Content {
  const out = { ...DEFAULT_CONTENT } as Record<string, unknown>;
  for (const k of CONTENT_KEYS) if (stored[k] != null) out[k] = stored[k];
  return out as unknown as Content;
}
