// Preproste, izvirne risbe prometnih znakov (ne uradne podobe).
import type { Znak } from "@/lib/types";

const RED = "#c81e1e";
const BLUE = "#1d4ed8";
const YEL = "#facc15";

function Symbol({ s, color }: { s: string; color: string }) {
  switch (s) {
    case "kolo":
      return (
        <g stroke={color} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="34" cy="60" r="11" /><circle cx="66" cy="60" r="11" />
          <path d="M34 60 L46 40 L60 40 L66 60 M46 40 L52 60 L60 40 M42 34 h8" />
        </g>
      );
    case "pesec":
      return (
        <g stroke={color} strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="50" cy="26" r="5" fill={color} />
          <path d="M50 34 L48 52 L40 70 M48 52 L58 70 M38 44 L50 38 L60 46" />
        </g>
      );
    case "otroka":
      return (
        <g stroke={color} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="40" cy="44" r="4" fill={color} /><circle cx="60" cy="48" r="3.5" fill={color} />
          <path d="M40 50 L38 64 L33 74 M38 64 L44 74 M33 56 L46 56" />
          <path d="M60 54 L59 66 L55 74 M59 66 L63 74 M46 56 L58 58" />
        </g>
      );
    case "krog":
      return (
        <g stroke={color} strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M50 26 a24 24 0 0 1 21 12" /><path d="M66 36 l6 3 1-7" />
          <path d="M72 60 a24 24 0 0 1-21 14" /><path d="M56 76 l-6-2 3-6" />
          <path d="M30 64 a24 24 0 0 1 2-28" /><path d="M28 42 l3-7 6 3" />
        </g>
      );
    case "desno":
      return <path d="M28 50 H66 M54 36 L70 50 L54 64" stroke={color} strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" />;
    case "gor":
      return <path d="M50 76 V30 M36 44 L50 28 L64 44" stroke={color} strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" />;
    case "levo-precrtano":
      return (
        <g>
          <path d="M62 74 V50 H36 M46 38 L34 50 L46 62" stroke="#111" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M24 24 L76 76" stroke={RED} strokeWidth="8" strokeLinecap="round" />
        </g>
      );
    case "crta":
      return <rect x="24" y="43" width="52" height="14" fill="#fff" />;
    case "slepa":
      return (
        <g>
          <rect x="44" y="34" width="12" height="46" fill="#fff" />
          <rect x="30" y="22" width="40" height="12" fill={RED} />
        </g>
      );
    case "semafor":
      return (
        <g>
          <rect x="41" y="34" width="18" height="42" rx="5" fill="#111" />
          <circle cx="50" cy="42" r="5" fill="#ef4444" /><circle cx="50" cy="55" r="5" fill="#facc15" /><circle cx="50" cy="68" r="5" fill="#22c55e" />
        </g>
      );
    case "!":
      return <g fill="#111"><rect x="45" y="34" width="10" height="28" rx="4" /><circle cx="50" cy="71" r="5.5" /></g>;
    case "P":
      return <text x="50" y="72" textAnchor="middle" fontSize="58" fontWeight="900" fill="#fff" fontFamily="system-ui, sans-serif">P</text>;
    case "50":
      return <text x="50" y="64" textAnchor="middle" fontSize="38" fontWeight="900" fill="#111" fontFamily="system-ui, sans-serif">50</text>;
    case "STOP":
      return <text x="50" y="60" textAnchor="middle" fontSize="27" fontWeight="900" fill="#fff" fontFamily="system-ui, sans-serif">STOP</text>;
    default:
      return null;
  }
}

export function Sign({ znak, size = 96 }: { znak: Znak; size?: number }) {
  const { oblika, simbol } = znak;
  let shape = null;
  let symColor = "#111";
  switch (oblika) {
    case "osmerokotnik":
      shape = <polygon points="31,4 69,4 96,31 96,69 69,96 31,96 4,69 4,31" fill={RED} stroke="#fff" strokeWidth="4" />;
      symColor = "#fff";
      break;
    case "trikotnik":
      shape = <polygon points="50,6 96,88 4,88" fill="#fff" stroke={RED} strokeWidth="9" strokeLinejoin="round" />;
      break;
    case "trikotnik-obrnjen":
      shape = <polygon points="4,12 96,12 50,94" fill="#fff" stroke={RED} strokeWidth="9" strokeLinejoin="round" />;
      break;
    case "romb":
      shape = (
        <g>
          <polygon points="50,2 98,50 50,98 2,50" fill="#fff" stroke="#999" strokeWidth="2" />
          <polygon points="50,16 84,50 50,84 16,50" fill={YEL} />
        </g>
      );
      break;
    case "krog-rdec":
      shape = <circle cx="50" cy="50" r="44" fill="#fff" stroke={RED} strokeWidth="10" />;
      break;
    case "krog-poln-rdec":
      shape = <circle cx="50" cy="50" r="46" fill={RED} />;
      symColor = "#fff";
      break;
    case "krog-moder":
      shape = <circle cx="50" cy="50" r="46" fill={BLUE} />;
      symColor = "#fff";
      break;
    case "kvadrat-moder":
      shape = <rect x="4" y="4" width="92" height="92" rx="8" fill={BLUE} />;
      symColor = "#fff";
      break;
  }
  const inner =
    oblika === "kvadrat-moder" && simbol === "pesec" ? (
      <g>
        <polygon points="50,14 88,82 12,82" fill="#fff" />
        <g transform="translate(0,8)"><Symbol s="pesec" color="#111" /></g>
      </g>
    ) : (
      <Symbol s={simbol} color={symColor} />
    );
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={znak.opis}>
      {shape}
      {inner}
    </svg>
  );
}
