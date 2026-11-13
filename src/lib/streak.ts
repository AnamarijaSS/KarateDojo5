import { addDays, isoWeek, weekday, type ISODate } from "./dates";

/**
 * Niz dni z vsaj enim treningom.
 * Petek, sobota, nedelja in počitnice niza ne prekinejo.
 * En zamujen delovni dan (pon–čet) na teden je »prost dan« in niza ne prekine.
 * Današnji dan, ki še ni opravljen, niza ne prekine.
 */
export function streak(trainingDays: Set<ISODate>, today: ISODate, isHoliday: (d: ISODate) => boolean = () => false): number {
  let count = 0;
  const freeUsed = new Set<string>();
  for (let i = 0; i < 400; i++) {
    const d = addDays(today, -i);
    if (trainingDays.has(d)) { count++; continue; }
    if (i === 0) continue;
    const w = weekday(d);
    if (w >= 5 || isHoliday(d)) continue;
    const key = `${d.slice(0, 4)}-${isoWeek(d)}`;
    if (!freeUsed.has(key)) { freeUsed.add(key); continue; }
    break;
  }
  return count;
}
