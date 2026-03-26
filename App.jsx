import { useState, useMemo, useRef } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from "recharts";

const HOLES = [
  {h:1,p:4},{h:2,p:4},{h:3,p:3},{h:4,p:4},{h:5,p:4},
  {h:6,p:5},{h:7,p:5},{h:8,p:3},{h:9,p:4},
  {h:10,p:4},{h:11,p:4},{h:12,p:4},{h:13,p:5},
  {h:14,p:4},{h:15,p:3},{h:16,p:4},{h:17,p:5},{h:18,p:4}
];
const TOTAL_PAR = 73;
const FRONT_PAR = 36;
const BACK_PAR  = 37;

const TEES = {
  blue:  { label: "Blue",  rating: 73.0, slope: 141, scratch: 73 },
  black: { label: "Black", rating: 75.0, slope: 143, scratch: 75 },
};

// Matt's bag -- carry distances in METRES
const BAG = [
  { name: "Driver",  loft:  9,   carry: 260, tee: true,  appr: false },
  { name: "Mini",    loft: 13.5, carry: 230, tee: true,  appr: false },
  { name: "4 Wood",  loft: 19,   carry: 220, tee: true,  appr: true  },
  { name: "Hybrid",  loft: 21,   carry: 210, tee: true,  appr: true  },
  { name: "4 Iron",  loft: 22,   carry: 180, tee: false, appr: true  },
  { name: "5 Iron",  loft: 25,   carry: 170, tee: false, appr: true  },
  { name: "6 Iron",  loft: 28,   carry: 160, tee: false, appr: true  },
  { name: "7 Iron",  loft: 32,   carry: 150, tee: false, appr: true  },
  { name: "8 Iron",  loft: 36,   carry: 140, tee: false, appr: true  },
  { name: "9 Iron",  loft: 41,   carry: 130, tee: false, appr: true  },
  { name: "PW",      loft: 46,   carry: 115, tee: false, appr: true  },
  { name: "SW",      loft: 54,   carry: 100, tee: false, appr: true  },
  { name: "LW",      loft: 60,   carry:  70, tee: false, appr: true  },
  { name: "Putter",  loft:  3,   carry:   0, tee: false, appr: true  },
];

function suggestClub(yards) {
  if (!yards || yards <= 0) return null;
  // find closest carry distance, bias toward going one longer (leave full shot)
  const clubs = BAG.filter(c => c.carry > 0 && c.appr);
  let best = clubs[0]; let bestDiff = Math.abs(clubs[0].carry - yards);
  clubs.forEach(c => {
    const diff = Math.abs(c.carry - yards);
    if (diff < bestDiff) { bestDiff = diff; best = c; }
  });
  return best;
}

const TEE_CLUBS  = BAG.map(c => c.name); // all clubs valid off tee (par 3s etc)
const APPR_CLUBS = BAG.filter(c => c.appr).map(c => c.name);
const HAZARD_OPTS = ["OB","Water","Lateral","Drop"];

const PUTT_EV = [[2,1.01],[3,1.08],[5,1.20],[7,1.30],[10,1.49],[15,1.65],[20,1.77],[25,1.85],[30,1.90],[40,1.97],[50,2.02],[75,2.12],[100,2.20]];
function puttEV(ft) {
  const f = Math.max(2, ft || 25);
  for (let i = 0; i < PUTT_EV.length - 1; i++) {
    if (f >= PUTT_EV[i][0] && f <= PUTT_EV[i+1][0]) {
      const t = (f - PUTT_EV[i][0]) / (PUTT_EV[i+1][0] - PUTT_EV[i][0]);
      return PUTT_EV[i][1] + t * (PUTT_EV[i+1][1] - PUTT_EV[i][1]);
    }
  }
  return 2.2;
}

function calcSG(r) {
  const gir = r.girsHit / 18;
  const miss = 18 - r.girsHit;
  const fw = r.fairwaysTotal > 0 ? r.fairwaysHit / r.fairwaysTotal : 0.62;
  const sgPutt = parseFloat((puttEV(r.avgProxFt || 25) * r.girsHit + 1.72 * miss - (r.totalPutts || 32)).toFixed(2));
  const sgOTT  = parseFloat(((fw - 0.62) * (r.fairwaysTotal || 14) * 0.30 + ((r.avgDrive || 238) - 238) / 9 * 0.09).toFixed(2));
  const proxAdj = r.girsHit > 0 ? ((22 - (r.avgProxFt || 26)) / 8) * 0.12 * r.girsHit : 0;
  const sgApp  = parseFloat(((gir - 0.70) * 18 * 0.40 + proxAdj).toFixed(2));
  const att = r.udAttempts || 0;
  const sc  = att > 0 ? r.udMade / att : 0.58;
  const sandG = r.sandAtt > 0 ? (r.sandSaves / r.sandAtt - 0.55) * r.sandAtt * 0.28 : 0;
  const sgATG = parseFloat((att > 0 ? (sc - 0.58) * att * 0.32 + sandG : 0).toFixed(2));
  return { sgPutt, sgOTT, sgApp, sgATG, sgTotal: parseFloat((sgPutt + sgOTT + sgApp + sgATG).toFixed(2)) };
}

function calcHcp(rounds) {
  if (!rounds.length) return null;
  const diffs = rounds.slice(-20)
    .map(r => parseFloat(((r.score - (r.rating || TOTAL_PAR)) * 113 / (r.slope || 130)).toFixed(1)))
    .sort((a, b) => a - b);
  const n = diffs.length;
  const take = n < 6 ? 1 : n < 9 ? 2 : n < 12 ? 3 : n < 15 ? 4 : n < 17 ? 5 : n < 19 ? 6 : n === 19 ? 7 : 8;
  return parseFloat((diffs.slice(0, take).reduce((a, b) => a + b, 0) / take * 0.96).toFixed(1));
}

function emptyHoles() {
  return HOLES.map(h => ({
    hole: h.h, par: h.p, score: h.p, putts: 2,
    fir: h.p >= 4 ? null : undefined,
    firMiss: null, teeClub: null,
    gir: false, prox: 20, distToHole: null, approachClub: null,
    missDir: null, udAtt: false, udMade: false, udType: null, // "chip" | "bunker"
    sand: false, sandSave: false,
    hazard: false, hazardType: null,
    puttDist: null // first putt distance in metres
  }));
}

function emptyRound() {
  return {
    date: new Date().toISOString().split("T")[0],
    course: "", tee: "blue", notes: "", avgDrive: 247,
    wind: null, conditions: null, timeOfDay: null,
    holes: emptyHoles()
  };
}

function aggHoles(holes) {
  const firHoles = holes.filter(h => h.par >= 4);
  const girHoles = holes.filter(h => h.gir);
  const missHoles = holes.filter(h => !h.gir && h.udAtt);
  const sandHoles = holes.filter(h => h.sand);
  const hazHoles  = holes.filter(h => h.hazard);
  return {
    score:         holes.reduce((s, h) => s + (h.score || h.par), 0),
    totalPutts:    holes.reduce((s, h) => s + (h.putts || 2), 0),
    fairwaysHit:   firHoles.filter(h => h.fir === true).length,
    fairwaysTotal: firHoles.length,
    girsHit:       girHoles.length,
    avgProxFt:     girHoles.length ? Math.round(girHoles.reduce((s, h) => s + (h.prox || 25), 0) / girHoles.length) : 25,
    udMade:        missHoles.filter(h => h.udMade).length,
    udAttempts:    missHoles.length,
    chipAtt:       missHoles.filter(h => h.udType !== "bunker").length,
    chipMade:      missHoles.filter(h => h.udType !== "bunker" && h.udMade).length,
    bunkerAtt:     missHoles.filter(h => h.udType === "bunker").length,
    bunkerMade:    missHoles.filter(h => h.udType === "bunker" && h.udMade).length,
    sandAtt:       sandHoles.length,
    sandSaves:     sandHoles.filter(h => h.sandSave).length,
    hazards:       hazHoles.length,
    threePutts:    holes.filter(h => h.putts >= 3).length,
    onePutts:      holes.filter(h => h.putts === 1).length,
    avgPuttDist:   girHoles.filter(h => h.puttDist > 0).length
                     ? Math.round(girHoles.filter(h => h.puttDist > 0).reduce((s,h) => s+(h.puttDist||0), 0) / girHoles.filter(h => h.puttDist > 0).length)
                     : null,
  };
}

function demoRounds() {
  const courses = ["Huntingdale GC","Royal Melbourne","Kingston Heath","Victoria GC"];
  return Array.from({ length: 16 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (15 - i) * 11);
    const p = i / 15;
    const tee = i % 3 === 0 ? "black" : "blue";
    const holes = HOLES.map(h => {
      const over = Math.max(0, Math.round((1.5 - p * 1.2) + Math.random() * 1.5 - 0.5));
      return {
        hole: h.h, par: h.p, score: h.p + over,
        putts: Math.max(1, Math.round(2 + (over > 0 ? 0.4 : 0) + Math.random() * 0.6 - 0.2)),
        fir: h.p >= 4 ? Math.random() > (0.38 - p * 0.18) : undefined,
        firMiss: Math.random() > 0.5 ? "L" : "R",
        teeClub: h.p === 3 ? null : (Math.random() > 0.25 ? "Driver" : Math.random() > 0.5 ? "Mini" : "4 Wood"),
        gir: Math.random() > (0.32 - p * 0.18),
        prox: Math.round(30 - p * 10 + Math.random() * 10 - 5),
        distToHole: Math.round(140 + Math.random() * 60 - 30),
        approachClub: ["7 Iron","8 Iron","9 Iron","PW","6 Iron","5 Iron"][Math.floor(Math.random()*6)],
        missDir: "L", udAtt: over > 0, udMade: over > 0 && Math.random() > (0.45 - p * 0.2),
        udType: Math.random() > 0.7 ? "bunker" : "chip",
        sand: Math.random() > 0.88, sandSave: Math.random() > 0.5,
        hazard: Math.random() > 0.92, hazardType: "Water"
      };
    });
    const agg = aggHoles(holes);
    return {
      id: i + 1, date: d.toISOString().split("T")[0],
      course: courses[i % 4], tee,
      rating: TEES[tee].rating, slope: TEES[tee].slope,
      avgDrive: Math.round(265 + p * 14 + Math.random() * 8 - 4),
      avgProxFt: Math.round(28 - p * 7 + Math.random() * 5 - 2),
      wind: [null,"calm","light","moderate","strong"][Math.floor(Math.random()*5)],
      conditions: [null,"firm","normal","soft"][Math.floor(Math.random()*4)],
      timeOfDay: [null,"morning","afternoon","twilight"][Math.floor(Math.random()*4)],
      notes: "", holes: holes.map(h => ({...h, puttDist: h.gir ? Math.round(4 + Math.random()*12) : null})), ...agg
    };
  });
}

function ravg(arr, k) {
  if (!arr.length) return null;
  return parseFloat((arr.reduce((s, r) => s + (parseFloat(r[k]) || 0), 0) / arr.length).toFixed(1));
}

// -- LIGHT THEME --
const BG   = "#f2f5f9";
const CARD = "#ffffff";
const C2   = "#edf0f6";
const BD   = "#dae0ea";
const T1   = "#18213a";
const T2   = "#4a5570";
const T3   = "#9aa5bf";
const GN   = "#1a8a4a"; const GNL = "#e7f7ee"; const GNM = "#c8edda";
const RD   = "#c0392b"; const RDL = "#fdecea";
const GL   = "#9a6800"; const GLL = "#fdf4dc";
const BL   = "#1a5fb4"; const BLL = "#e8f0fc";
const TL   = "#0e8a7a"; const TLL = "#e6f7f5";
const OR   = "#b85a15"; const ORL = "#fdeedd";
const PU   = "#6e3aa8"; const PUL = "#f3eeff";

function sgColor(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return T3;
  return n > 0.3 ? GN : n > 0 ? TL : n > -0.3 ? GL : RD;
}
function pmColor(pm) {
  if (pm <= -2) return BL; if (pm <= -1) return GN;
  if (pm === 0) return T1; if (pm === 1) return GL; return RD;
}

const Box = ({ children, style }) => (
  <div style={{ background: CARD, border: "1px solid " + BD, borderRadius: 10, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", ...style }}>
    {children}
  </div>
);
const Lbl = ({ t, style }) => (
  <div style={{ color: T3, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5, ...style }}>{t}</div>
);
function KPI({ label, value, unit, target, color }) {
  return (
    <Box style={{ padding: "12px 14px" }}>
      <Lbl t={label} />
      <div style={{ fontFamily: "monospace", fontSize: 24, fontWeight: 700, color: color || T1, lineHeight: 1.1 }}>
        {value != null ? value + (unit || "") : "--"}
      </div>
      {target && <div style={{ fontSize: 10, color: T3, marginTop: 4 }}>Target: <span style={{ color: GL, fontWeight: 600 }}>{target}</span></div>}
    </Box>
  );
}
function SGB({ v }) {
  if (v == null) return <span style={{ color: T3 }}>--</span>;
  const n = parseFloat(v);
  const c = sgColor(v);
  const bg = n > 0 ? GNL : n < 0 ? RDL : C2;
  return <span style={{ color: c, fontFamily: "monospace", fontWeight: 700, fontSize: 12, background: bg, padding: "1px 5px", borderRadius: 3 }}>{n > 0 ? "+" : ""}{n.toFixed(2)}</span>;
}
const TT = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: CARD, border: "1px solid " + BD, borderRadius: 7, padding: "10px 14px", fontSize: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}>
      <div style={{ color: T2, marginBottom: 4, fontWeight: 600 }}>{label}</div>
      {payload.map((p, i) => <div key={i} style={{ color: p.color || T1 }}>{p.name}: {typeof p.value === "number" ? p.value.toFixed(2) : p.value}</div>)}
    </div>
  );
};
function NIn({ value, onChange, min, max, style }) {
  return <input type="number" value={value} min={min || 0} max={max} onChange={e => onChange(parseFloat(e.target.value) || 0)} style={{ background: CARD, color: T1, border: "1px solid " + BD, borderRadius: 4, padding: "5px 7px", fontSize: 13, outline: "none", width: "100%", fontFamily: "inherit", ...style }} />;
}
function Sel({ value, onChange, opts, placeholder, style }) {
  return (
    <select value={value || ""} onChange={e => onChange(e.target.value || null)} style={{ background: CARD, color: value ? T1 : T3, border: "1px solid " + BD, borderRadius: 4, padding: "5px 6px", fontSize: 12, outline: "none", width: "100%", fontFamily: "inherit", cursor: "pointer", ...style }}>
      <option value="">{placeholder || "--"}</option>
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
function Btn({ label, active, onClick, ac, small }) {
  const acolor = ac || BL;
  return (
    <button onClick={onClick} style={{ background: active ? acolor : C2, color: active ? "#fff" : T2, border: "1px solid " + (active ? acolor : BD), borderRadius: 4, padding: small ? "2px 7px" : "5px 12px", fontSize: small ? 10 : 12, cursor: "pointer", fontWeight: active ? 700 : 400, whiteSpace: "nowrap" }}>
      {label}
    </button>
  );
}

const TABS = [["dash","Dashboard"],["enter","+ Log Round"],["sg","Strokes Gained"],["holes","Hole Analysis"],["clubs","Club Stats"],["trend","Trends"],["practice","Practice Log"],["insights","Insights"]];

export default function App() {
  const [rounds, setRoundsRaw] = useState(() => {
    try { const s = localStorage.getItem("strokelab_rounds"); return s ? JSON.parse(s) : []; } catch(e) { return []; }
  });
  const setRounds = (v) => {
    const next = typeof v === "function" ? v(rounds) : v;
    setRoundsRaw(next);
    try { localStorage.setItem("strokelab_rounds", JSON.stringify(next)); } catch(e) {}
  };
  const [tab,     setTab]     = useState("dash");
  const [form,    setForm]    = useState(emptyRound());
  const [editId,  setEditId]  = useState(null);
  const [nine,    setNine]    = useState(0);
  const [saved,       setSaved]       = useState(false);
  const [selectedRound, setSelectedRound] = useState(null);
  const [practiceLogs, setPracticeLogsRaw] = useState(() => {
    try { const s = localStorage.getItem("strokelab_practice"); return s ? JSON.parse(s) : []; } catch(e) { return []; }
  });
  const setPracticeLogs = (v) => {
    const next = typeof v === "function" ? v(practiceLogs) : v;
    setPracticeLogsRaw(next);
    try { localStorage.setItem("strokelab_practice", JSON.stringify(next)); } catch(e) {}
  };
  const [practiceForm, setPracticeForm] = useState({ date: new Date().toISOString().split("T")[0], area: "Putting", drill: "", duration: 30, notes: "", made: null, att: null });
  const [roundTargets] = useState({ girMin: 11, puttsMax: 30, firMin: 8, hazMax: 1 });
  const fileRef = useRef();

  const rSG  = useMemo(() => rounds.map(r => ({ ...r, ...calcSG(r) })), [rounds]);
  const hcp  = useMemo(() => calcHcp(rounds), [rounds]);
  const last = n => rSG.slice(-Math.min(n, rSG.length));

  const s10 = useMemo(() => {
    const r = last(10);
    if (!r.length) return null;
    const sc = r.filter(x => x.udAttempts > 0);
    const fr = r.filter(x => x.fairwaysTotal > 0);
    return {
      score: ravg(r,"score"), drive: ravg(r,"avgDrive"), putts: ravg(r,"totalPutts"), prox: ravg(r,"avgProxFt"),
      hazards: ravg(r,"hazards"),
      fir: fr.length ? parseFloat((fr.reduce((s,x) => s + x.fairwaysHit/x.fairwaysTotal,0)/fr.length*100).toFixed(1)) : null,
      gir: parseFloat((r.reduce((s,x) => s + x.girsHit/18,0)/r.length*100).toFixed(1)),
      scr: sc.length ? parseFloat((sc.reduce((s,x) => s + x.udMade/x.udAttempts,0)/sc.length*100).toFixed(1)) : null,
      sgT: ravg(r,"sgTotal"), sgApp: ravg(r,"sgApp"), sgOTT: ravg(r,"sgOTT"), sgATG: ravg(r,"sgATG"), sgPutt: ravg(r,"sgPutt"),
      threePutts: ravg(r,"threePutts"), onePutts: ravg(r,"onePutts"),
    };
  }, [rSG]);

  const sh = (i, k, v) => setForm(f => { const holes = [...f.holes]; holes[i] = { ...holes[i], [k]: v }; return { ...f, holes }; });
  const teeInfo = TEES[form.tee] || TEES.blue;

  function saveRound() {
    const agg = aggHoles(form.holes);
    const ti  = TEES[form.tee] || TEES.blue;
    const nr  = { ...form, ...agg, rating: ti.rating, slope: ti.slope, avgDrive: parseFloat(form.avgDrive) || 270, id: editId || Date.now() };
    setRounds(p => editId ? p.map(r => r.id === editId ? nr : r) : [...p, nr]);
    setForm(emptyRound()); setEditId(null);
    setSaved(true); setTimeout(() => setSaved(false), 2500);
    setTab("dash");
  }

  function doExport() {
    const b = new Blob([JSON.stringify(rounds, null, 2)], { type: "application/json" });
    Object.assign(document.createElement("a"), { href: URL.createObjectURL(b), download: "strokelab.json" }).click();
  }
  function doImport(e) {
    const f = e.target.files[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = ev => { try { setRounds(JSON.parse(ev.target.result)); } catch(err) {} };
    fr.readAsText(f); e.target.value = "";
  }

  const fAgg       = useMemo(() => aggHoles(form.holes), [form.holes]);
  const frontScore = form.holes.slice(0,9).reduce((s,h) => s + (h.score||h.par), 0);
  const backScore  = form.holes.slice(9).reduce((s,h)  => s + (h.score||h.par), 0);
  const totalScore = frontScore + backScore;
  const totalPM    = totalScore - TOTAL_PAR;

  // -- DASHBOARD --
  function Dash() {
    if (!rSG.length) return (
      <div style={{ textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>&#9971;</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: T1, marginBottom: 8 }}>StrokeLab</div>
        <div style={{ color: T2, marginBottom: 6 }}>No rounds yet. Log your first or load demo data.</div>
        <div style={{ color: T3, fontSize: 12, marginBottom: 28 }}>Strokes Gained | DECADE | +2 Target | Par {TOTAL_PAR}</div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button onClick={() => setTab("enter")} style={{ background: BL, color: "#fff", padding: "10px 24px", borderRadius: 7, fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer" }}>+ Log Round</button>
          <button onClick={() => setRounds(demoRounds())} style={{ background: C2, color: T2, border: "1px solid " + BD, padding: "10px 24px", borderRadius: 7, fontSize: 14, cursor: "pointer" }}>Load Demo Data</button>
        </div>
      </div>
    );
    const hcpColor = hcp == null ? T1 : hcp <= -2 ? BL : hcp <= 0 ? GN : hcp <= 5 ? GL : RD;
    const sg4 = [
      { name: "Tee",      val: s10 && s10.sgOTT, color: BL },
      { name: "Approach", val: s10 && s10.sgApp,  color: GN },
      { name: "Around",   val: s10 && s10.sgATG,  color: OR },
      { name: "Putting",  val: s10 && s10.sgPutt, color: GL },
    ];
    const trend = last(10).map(r => ({ date: (r.date||"").slice(5), score: r.score }));
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 10 }}>
          <KPI label="Handicap Index" value={hcp != null ? (hcp > 0 ? "+" + hcp : String(hcp)) : null} target="+2.0" color={hcpColor} />
          <KPI label="Avg Score (10r)" value={s10 && s10.score} target={String(TOTAL_PAR-2)} color={s10 && s10.score <= TOTAL_PAR-2 ? GN : s10 && s10.score <= TOTAL_PAR ? GL : RD} />
          <KPI label="FIR % (10r)" value={s10 && s10.fir} unit="%" target="65%" color={s10 && s10.fir >= 65 ? GN : s10 && s10.fir >= 55 ? GL : RD} />
          <KPI label="GIR % (10r)" value={s10 && s10.gir} unit="%" target="74%" color={s10 && s10.gir >= 74 ? GN : s10 && s10.gir >= 64 ? GL : RD} />
          <KPI label="Putts/Rd (10r)" value={s10 && s10.putts} target="28.0" color={s10 && s10.putts <= 28 ? GN : s10 && s10.putts <= 30 ? GL : RD} />
          <KPI label="Hazards/Rd (10r)" value={s10 && s10.hazards} target="0-1" color={s10 && s10.hazards <= 1 ? GN : s10 && s10.hazards <= 2 ? GL : RD} />
        </div>
        {/* HANDICAP TRAJECTORY */}
        {rSG.length >= 3 && (() => {
          // Compute rolling handicap every round
          const hcpSeries = rSG.map((_, i) => {
            const slice = rSG.slice(0, i + 1);
            const h = calcHcp(slice);
            return { date: (rSG[i].date || "").slice(5), hcp: h, score: rSG[i].score };
          }).filter(d => d.hcp !== null);
          // Simple linear trend on last 5 points
          const recent = hcpSeries.slice(-5);
          let projected = null;
          if (recent.length >= 3) {
            const xs = recent.map((_, i) => i);
            const ys = recent.map(d => d.hcp);
            const n = xs.length;
            const xm = xs.reduce((a,b)=>a+b,0)/n;
            const ym = ys.reduce((a,b)=>a+b,0)/n;
            const slope = xs.reduce((s,x,i)=>s+(x-xm)*(ys[i]-ym),0) / xs.reduce((s,x)=>s+(x-xm)**2,0);
            const inter = ym - slope*xm;
            const curr = hcpSeries[hcpSeries.length-1].hcp;
            const stepsToP2 = slope < 0 ? Math.ceil(((-2) - inter) / slope) : null;
            projected = { slope: parseFloat(slope.toFixed(3)), stepsToP2, curr };
          }
          return (
            <Box style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <Lbl t="Handicap Trajectory" />
                  {projected && projected.slope < 0 && projected.stepsToP2 && projected.stepsToP2 > 0 && projected.stepsToP2 <= 40 && (
                    <div style={{ fontSize: 11, color: GN, fontWeight: 700, marginTop: 2 }}>
                      At current trend: +2 in ~{projected.stepsToP2} more round{projected.stepsToP2 !== 1 ? "s" : ""}
                    </div>
                  )}
                  {projected && projected.slope >= 0 && (
                    <div style={{ fontSize: 11, color: RD, fontWeight: 600, marginTop: 2 }}>Trend moving away from target -- review last 5 rounds</div>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 800, color: hcpColor }}>
                    {hcp != null ? (hcp > 0 ? "+" + hcp : String(hcp)) : "--"}
                  </div>
                  <div style={{ fontSize: 10, color: T3 }}>Current HCP</div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={hcpSeries} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid stroke={BD} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fill: T3, fontSize: 9 }} tickLine={false} />
                  <YAxis domain={["auto","auto"]} tick={{ fill: T3, fontSize: 9 }} tickLine={false} tickFormatter={v => v > 0 ? "+"+v : v} />
                  <Tooltip content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null;
                    const v = payload[0].value;
                    return <div style={{ background: CARD, border: "1px solid " + BD, borderRadius: 6, padding: "6px 10px", fontSize: 11 }}>
                      <div style={{ color: T2 }}>{label}</div>
                      <div style={{ fontFamily: "monospace", fontWeight: 800, color: v <= -2 ? BL : v <= 0 ? GN : GL }}>HCP: {v > 0 ? "+" : ""}{v}</div>
                    </div>;
                  }} />
                  <ReferenceLine y={-2} stroke={BL} strokeDasharray="5 4" label={{ value: "+2", fill: BL, fontSize: 9, position: "insideTopRight" }} />
                  <ReferenceLine y={0} stroke={T3} strokeDasharray="3 3" />
                  <Line dataKey="hcp" stroke={GN} strokeWidth={2.5} dot={{ r: 3, fill: GN, stroke: "#fff", strokeWidth: 1 }} name="Handicap" connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </Box>
          );
        })()}

        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
          <Box>
            <Lbl t="Score Trend (last 10 rounds)" />
            <ResponsiveContainer width="100%" height={155}>
              <LineChart data={trend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke={BD} strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: T3, fontSize: 10 }} tickLine={false} />
                <YAxis domain={["auto","auto"]} tick={{ fill: T3, fontSize: 10 }} tickLine={false} />
                <Tooltip content={<TT />} />
                <ReferenceLine y={TOTAL_PAR} stroke={T3} strokeDasharray="4 4" />
                <Line dataKey="score" stroke={BL} strokeWidth={2.5} dot={{ r: 3, fill: BL }} name="Score" />
              </LineChart>
            </ResponsiveContainer>
          </Box>
          <Box>
            <Lbl t="Strokes Gained vs Scratch (10r avg)" />
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
              {sg4.map(({ name, val, color }) => {
                const n = parseFloat(val) || 0;
                const w = Math.min(100, Math.abs(n) / 1.5 * 100);
                return (
                  <div key={name}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 12, color: T2 }}>{name}</span>
                      <SGB v={val} />
                    </div>
                    <div style={{ background: C2, borderRadius: 3, height: 5, overflow: "hidden", position: "relative" }}>
                      <div style={{ position: "absolute", height: "100%", background: n >= 0 ? color : RD, width: w + "%", left: n >= 0 ? "50%" : undefined, right: n < 0 ? "50%" : undefined, borderRadius: 3 }} />
                      <div style={{ position: "absolute", left: "50%", top: 0, width: 1, height: "100%", background: BD }} />
                    </div>
                  </div>
                );
              })}
              <div style={{ borderTop: "1px solid " + BD, paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: T1, fontWeight: 700 }}>Total SG</span>
                <SGB v={s10 && s10.sgT} />
              </div>
            </div>
          </Box>
        </div>
        <Box>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <Lbl t="Recent Rounds" style={{ marginBottom: 0 }} />
            <div style={{ fontSize: 10, color: T3 }}>Targets: GIR {roundTargets.girMin}+ | Putts {roundTargets.puttsMax}- | FIR {roundTargets.firMin}+ | Haz {roundTargets.hazMax}-</div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid " + BD, background: C2 }}>
                  {["Date","Course","Tee","F9","B9","Score","+/-","FIR","GIR","Putts","3-Putt","1-Putt","Prox","Haz","Score Qual","SG Tee","SG App","SG ATG","SG Putt","SG Tot",""].map(h => (
                    <th key={h} style={{ padding: "7px 8px", textAlign: "left", color: T2, fontWeight: 700, whiteSpace: "nowrap", fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...rSG].reverse().slice(0,15).map(r => {
                  const pm = r.score - TOTAL_PAR;
                  const f9 = r.holes ? r.holes.slice(0,9).reduce((s,h) => s+(h.score||h.par),0) : "--";
                  const b9 = r.holes ? r.holes.slice(9).reduce((s,h)  => s+(h.score||h.par),0) : "--";
                  const ti = TEES[r.tee] || TEES.blue;
                  return (
                    <tr key={r.id}
                      onClick={() => setSelectedRound(selectedRound === r.id ? null : r.id)}
                      style={{ borderBottom: "1px solid " + BD, cursor: "pointer", background: selectedRound === r.id ? BLL : "transparent", borderLeft: selectedRound === r.id ? "3px solid " + BL : "3px solid transparent", transition: "background 0.1s" }}
                      onMouseEnter={e => { if (selectedRound !== r.id) e.currentTarget.style.background = C2; }}
                      onMouseLeave={e => { if (selectedRound !== r.id) e.currentTarget.style.background = "transparent"; }}>
                      <td style={{ padding: "7px 8px", color: T2, whiteSpace: "nowrap" }}>{r.date}</td>
                      <td style={{ padding: "7px 8px", color: T1, fontWeight: 500 }}>{r.course || "--"}</td>
                      <td style={{ padding: "7px 8px" }}><span style={{ background: r.tee === "black" ? T1 : BLL, color: r.tee === "black" ? "#fff" : BL, padding: "1px 6px", borderRadius: 3, fontSize: 10, fontWeight: 700 }}>{ti.label}</span></td>
                      <td style={{ padding: "7px 8px", color: T2, fontFamily: "monospace" }}>{f9}</td>
                      <td style={{ padding: "7px 8px", color: T2, fontFamily: "monospace" }}>{b9}</td>
                      <td style={{ padding: "7px 8px", color: T1, fontFamily: "monospace", fontWeight: 700 }}>{r.score}</td>
                      <td style={{ padding: "7px 8px", color: pmColor(pm), fontFamily: "monospace", fontWeight: 600 }}>{pm > 0 ? "+" : ""}{pm}</td>
                      <td style={{ padding: "7px 8px" }}>{r.fairwaysTotal > 0 ? r.fairwaysHit + "/" + r.fairwaysTotal : "--"}</td>
                      <td style={{ padding: "7px 8px" }}>{r.girsHit + "/18"}</td>
                      <td style={{ padding: "7px 8px", color: r.totalPutts <= 28 ? GN : r.totalPutts <= 31 ? GL : RD, fontFamily: "monospace" }}>{r.totalPutts}</td>
                      <td style={{ padding: "7px 8px", color: T2 }}>{r.avgProxFt ? r.avgProxFt + "m" : "--"}</td>
                      <td style={{ padding: "7px 8px", color: (r.hazards||0) <= 1 ? GN : RD, fontFamily: "monospace" }}>{r.hazards || 0}</td>
                      <td style={{ padding: "7px 8px", color: (r.threePutts||0) <= 1 ? GN : (r.threePutts||0) <= 2 ? GL : RD, fontFamily: "monospace" }}>{r.threePutts ?? "--"}</td>
                      <td style={{ padding: "7px 8px", color: (r.onePutts||0) >= 5 ? GN : (r.onePutts||0) >= 3 ? GL : T2, fontFamily: "monospace" }}>{r.onePutts ?? "--"}</td>
                      <td style={{ padding: "7px 8px", color: T2 }}>{r.avgProxFt ? r.avgProxFt + "m" : "--"}</td>
                      <td style={{ padding: "7px 8px" }}>{(() => {
                        const badges = [];
                        if (r.girsHit >= roundTargets.girMin) badges.push({ t: "GIR", c: GN });
                        if (r.totalPutts <= roundTargets.puttsMax) badges.push({ t: "Putts", c: GN });
                        if (r.fairwaysHit >= roundTargets.firMin) badges.push({ t: "FIR", c: GN });
                        if ((r.hazards||0) <= roundTargets.hazMax) badges.push({ t: "Haz", c: GN });
                        const score = badges.length;
                        return <div style={{ display: "flex", gap: 3, flexWrap: "nowrap" }}>
                          <span style={{ background: score === 4 ? GN : score >= 2 ? GL : C2, color: score >= 2 ? "#fff" : T3, fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 3, whiteSpace: "nowrap" }}>{score}/4</span>
                        </div>;
                      })()}</td>
                      <td style={{ padding: "7px 8px" }}><SGB v={r.sgOTT} /></td>
                      <td style={{ padding: "7px 8px" }}><SGB v={r.sgApp} /></td>
                      <td style={{ padding: "7px 8px" }}><SGB v={r.sgATG} /></td>
                      <td style={{ padding: "7px 8px" }}><SGB v={r.sgPutt} /></td>
                      <td style={{ padding: "7px 8px" }}><SGB v={r.sgTotal} /></td>
                      <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>
                        <button onClick={() => { setForm({ ...r, holes: r.holes || emptyHoles() }); setEditId(r.id); setTab("enter"); }} style={{ background: "none", color: T2, border: "none", cursor: "pointer", fontSize: 11, textDecoration: "underline" }}>Edit</button>
                        <button onClick={() => setRounds(p => p.filter(x => x.id !== r.id))} style={{ background: "none", color: RD, border: "none", cursor: "pointer", fontSize: 11, marginLeft: 6 }}>Del</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {selectedRound && (
            <div style={{ marginTop: 10, padding: "8px 12px", background: BLL, borderRadius: 6, border: "1px solid " + BL, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: BL, fontWeight: 600 }}>
                Round selected -- SG chart and hole analysis will highlight this round.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setTab("sg")} style={{ background: BL, color: "#fff", border: "none", borderRadius: 5, padding: "5px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>View SG</button>
                <button onClick={() => setSelectedRound(null)} style={{ background: "none", color: T2, border: "1px solid " + BD, borderRadius: 5, padding: "5px 10px", fontSize: 12, cursor: "pointer" }}>Clear</button>
              </div>
            </div>
          )}
          {!selectedRound && rSG.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: T3, textAlign: "center" }}>Click any row to isolate that round in the SG chart</div>
          )}
        </Box>
      </div>
    );
  }

  // -- LOG ROUND --
  function EnterRound() {
    const nineHoles = nine === 0 ? form.holes.slice(0,9) : form.holes.slice(9);
    const offset    = nine === 0 ? 0 : 9;
    const ninePar   = nine === 0 ? FRONT_PAR : BACK_PAR;
    const nineScore = nine === 0 ? frontScore : backScore;
    const ninePM    = nineScore - ninePar;
    const inp = { background: CARD, color: T1, border: "1px solid " + BD, borderRadius: 4, padding: "5px 7px", fontSize: 13, outline: "none", fontFamily: "inherit", width: "100%" };

    function sLabel(score, par) {
      const d = score - par;
      if (d <= -2) return { bg: BLL, tc: BL,  lbl: "Eagle" };
      if (d === -1) return { bg: GNL, tc: GN, lbl: "Birdie" };
      if (d === 0)  return { bg: "transparent", tc: T1, lbl: "" };
      if (d === 1)  return { bg: GLL, tc: GL,  lbl: "Bogey" };
      if (d === 2)  return { bg: ORL, tc: OR,  lbl: "Double" };
      return               { bg: RDL, tc: RD,  lbl: "Triple+" };
    }

    return (
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
        <Box>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 140px 80px 80px 100px auto", gap: 10, alignItems: "end" }}>
            <div><Lbl t="Date" /><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={{ ...inp }} /></div>
            <div><Lbl t="Course" /><input type="text" value={form.course} placeholder="Huntingdale GC" onChange={e => setForm(f => ({ ...f, course: e.target.value }))} style={{ ...inp }} /></div>
            <div>
              <Lbl t="Tee" />
              <div style={{ display: "flex", gap: 6 }}>
                {Object.entries(TEES).map(([key, ti]) => (
                  <button key={key} onClick={() => setForm(f => ({ ...f, tee: key }))} style={{ background: form.tee === key ? (key === "black" ? T1 : BL) : C2, color: form.tee === key ? "#fff" : T2, border: "1px solid " + (form.tee === key ? (key === "black" ? T1 : BL) : BD), borderRadius: 5, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", flex: 1 }}>
                    {ti.label}
                    <div style={{ fontSize: 9, fontWeight: 400, opacity: 0.8 }}>R{ti.rating} S{ti.slope}</div>
                  </button>
                ))}
              </div>
            </div>
            <div><Lbl t="Avg Drive" /><NIn value={form.avgDrive} onChange={v => setForm(f => ({ ...f, avgDrive: v }))} /></div>
            <div><Lbl t="Rating" /><div style={{ fontFamily: "monospace", fontSize: 13, padding: "7px 0", color: T2 }}>{teeInfo.rating}</div></div>
            <div><Lbl t="Slope" /><div style={{ fontFamily: "monospace", fontSize: 13, padding: "7px 0", color: T2 }}>{teeInfo.slope}</div></div>
            <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 4, gap: 8 }}>
              <span style={{ fontFamily: "monospace", fontSize: 26, fontWeight: 700, color: pmColor(totalPM) }}>{totalPM > 0 ? "+" : ""}{totalPM}</span>
              <span style={{ fontSize: 12, color: T2 }}>{totalScore}</span>
            </div>
          </div>
        </Box>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {[["Front 9", FRONT_PAR, frontScore, 0], ["Back 9", BACK_PAR, backScore, 1]].map(([label, par, score, idx]) => {
            const pm = score - par;
            return (
              <button key={idx} onClick={() => setNine(idx)} style={{ background: nine === idx ? BL : C2, color: nine === idx ? "#fff" : T2, border: "1px solid " + (nine === idx ? BL : BD), borderRadius: 6, padding: "7px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                {label}: {score} ({pm > 0 ? "+" : ""}{pm})
              </button>
            );
          })}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: T2 }}>GIR: <b style={{ color: fAgg.girsHit >= 13 ? GN : fAgg.girsHit >= 9 ? GL : RD }}>{fAgg.girsHit}/18</b></span>
          <span style={{ fontSize: 12, color: T2, marginLeft: 8 }}>FIR: <b style={{ color: T1 }}>{fAgg.fairwaysHit}/{fAgg.fairwaysTotal}</b></span>
          <span style={{ fontSize: 12, color: T2, marginLeft: 8 }}>Putts: <b style={{ color: fAgg.totalPutts <= 28 ? GN : GL }}>{fAgg.totalPutts}</b></span>
          <span style={{ fontSize: 12, color: T2, marginLeft: 8 }}>Haz: <b style={{ color: fAgg.hazards <= 1 ? GN : RD }}>{fAgg.hazards}</b></span>
        </div>

        <Box style={{ padding: "8px 10px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid " + BD, background: C2 }}>
                {["Hole","Par","Score","Putts","FIR","Tee Club","GIR","Prox","1st Putt m","Dist m","Appr Club","Miss Dir","U/D","Bunker","Hazard"].map(h => (
                  <th key={h} style={{ padding: "6px 5px", textAlign: "center", color: T2, fontSize: 10, fontWeight: 700, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {nineHoles.map((h, idx) => {
                const gi = offset + idx;
                const sl = sLabel(h.score, h.par);
                const isPar3 = h.par === 3;
                return (
                  <tr key={h.hole} style={{ borderBottom: "1px solid " + BD, background: sl.bg }}>
                    <td style={{ padding: "4px 5px", textAlign: "center", fontWeight: 700, color: BL, fontSize: 13 }}>{h.hole}</td>
                    <td style={{ padding: "4px 5px", textAlign: "center", color: T2 }}>{h.par}</td>
                    <td style={{ padding: "3px 5px", textAlign: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 2, justifyContent: "center" }}>
                        <NIn value={h.score} min={1} max={12} onChange={v => sh(gi,"score",v)} style={{ width: 42, textAlign: "center", color: sl.tc, fontWeight: 700, fontSize: 14 }} />
                        {sl.lbl ? <span style={{ fontSize: 8, color: sl.tc, minWidth: 26 }}>{sl.lbl}</span> : null}
                      </div>
                    </td>
                    <td style={{ padding: "3px 5px" }}>
                      <NIn value={h.putts} min={0} max={6} onChange={v => sh(gi,"putts",v)} style={{ textAlign: "center", width: 40, color: h.putts <= 1 ? GN : h.putts >= 3 ? RD : T1 }} />
                    </td>
                    <td style={{ padding: "3px 5px", textAlign: "center" }}>
                      {isPar3 ? <span style={{ color: T3, fontSize: 10 }}>N/A</span> : (
                        <Btn label={h.fir === true ? "HIT" : h.fir === false ? "MIS" : "?"} active={h.fir === true} onClick={() => sh(gi,"fir", h.fir === true ? null : h.fir === null ? true : false)} ac={GN} />
                      )}
                    </td>
                    <td style={{ padding: "3px 5px" }}>
                      {isPar3 ? <span style={{ color: T3, fontSize: 10, display: "block", textAlign: "center" }}>--</span> : (
                        <Sel value={h.teeClub} onChange={v => sh(gi,"teeClub",v)} opts={TEE_CLUBS} placeholder="Club" style={{ fontSize: 11 }} />
                      )}
                    </td>
                    <td style={{ padding: "3px 5px", textAlign: "center" }}>
                      <Btn label={h.gir ? "GIR" : "MIS"} active={h.gir} onClick={() => sh(gi,"gir",!h.gir)} ac={GN} />
                    </td>
                    <td style={{ padding: "3px 5px" }}>
                      {h.gir ? (
                        <div>
                          <NIn value={h.prox} min={1} max={200} onChange={v => sh(gi,"prox",v)} style={{ textAlign: "center", width: 50, color: h.prox <= 15 ? GN : h.prox <= 25 ? TL : h.prox <= 40 ? GL : T2 }} />
                          {h.putts === 1 && <div style={{ fontSize: 8, color: GN, textAlign: "center", fontWeight: 700 }}>1-putt</div>}
                        </div>
                      ) : <span style={{ color: T3, display: "block", textAlign: "center" }}>--</span>}
                    </td>
                    <td style={{ padding: "3px 5px" }}>
                      <NIn value={h.distToHole || ""} min={1} max={275} onChange={v => sh(gi,"distToHole",v)} style={{ textAlign: "center", width: 50, color: T1 }} />
                      {h.distToHole > 0 && (() => { const s = suggestClub(h.distToHole); return s ? <div style={{ fontSize: 9, color: BL, fontWeight: 600, textAlign: "center", marginTop: 1 }}>{s.name} ({s.carry}y)</div> : null; })()}
                    </td>
                    <td style={{ padding: "3px 5px" }}>
                      <Sel value={h.approachClub} onChange={v => sh(gi,"approachClub",v)} opts={APPR_CLUBS} placeholder="Club" style={{ fontSize: 11 }} />
                    </td>
                    <td style={{ padding: "3px 5px", textAlign: "center" }}>
                      {!h.gir ? (
                        <div style={{ display: "flex", gap: 2, justifyContent: "center" }}>
                          {["L","R","Lg","Sh"].map(d => <Btn key={d} label={d} small active={h.missDir === d} onClick={() => sh(gi,"missDir", h.missDir === d ? null : d)} ac={OR} />)}
                        </div>
                      ) : <span style={{ color: T3, fontSize: 10, display: "block", textAlign: "center" }}>--</span>}
                    </td>
                    <td style={{ padding: "3px 5px", textAlign: "center" }}>
                      {!h.gir ? (
                        <div style={{ display: "flex", gap: 2, justifyContent: "center" }}>
                          <Btn label="Att" small active={h.udAtt} onClick={() => sh(gi,"udAtt",!h.udAtt)} ac={BL} />
                          {h.udAtt && (
                            <>
                              <Btn label="Chip" small active={h.udType !== "bunker"} onClick={() => sh(gi,"udType","chip")} ac={OR} />
                              <Btn label="Bkr"  small active={h.udType === "bunker"} onClick={() => sh(gi,"udType","bunker")} ac={GL} />
                              <Btn label={h.udMade ? "Y" : "N"} small active={h.udMade} onClick={() => sh(gi,"udMade",!h.udMade)} ac={GN} />
                            </>
                          )}
                        </div>
                      ) : <span style={{ color: T3, fontSize: 10, display: "block", textAlign: "center" }}>--</span>}
                    </td>
                    <td style={{ padding: "3px 5px", textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 2, justifyContent: "center" }}>
                        <Btn label={h.sand ? "Bkr" : "--"} small active={h.sand} onClick={() => sh(gi,"sand",!h.sand)} ac={GL} />
                        {h.sand && <Btn label={h.sandSave ? "Y" : "N"} small active={h.sandSave} onClick={() => sh(gi,"sandSave",!h.sandSave)} ac={GN} />}
                      </div>
                    </td>
                    <td style={{ padding: "3px 5px", textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 2, justifyContent: "center" }}>
                        <Btn label={h.hazard ? (h.hazardType || "Haz") : "--"} small active={h.hazard} onClick={() => sh(gi,"hazard",!h.hazard)} ac={RD} />
                        {h.hazard && <Sel value={h.hazardType} onChange={v => sh(gi,"hazardType",v)} opts={HAZARD_OPTS} placeholder="Type" style={{ fontSize: 10, width: 62 }} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid " + BD, background: C2, fontWeight: 700 }}>
                <td colSpan={2} style={{ padding: "6px 5px", color: T2, fontSize: 12 }}>Nine Total</td>
                <td style={{ padding: "6px 5px", textAlign: "center", fontFamily: "monospace", color: pmColor(ninePM), fontSize: 14 }}>{nineScore} ({ninePM > 0 ? "+" : ""}{ninePM})</td>
                <td style={{ padding: "6px 5px", textAlign: "center", fontFamily: "monospace", color: T2 }}>{nineHoles.reduce((s,h) => s+(h.putts||0), 0)}</td>
                <td colSpan={10} />
              </tr>
            </tfoot>
          </table>
        </Box>

        <Box>
          <Lbl t="Round Notes / DECADE Reflection" />
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Course management, decisions, practice focus..." rows={2}
            style={{ background: CARD, color: T1, border: "1px solid " + BD, borderRadius: 5, padding: "8px 10px", fontSize: 13, outline: "none", width: "100%", resize: "vertical", fontFamily: "inherit" }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
            <div>
              <Lbl t="Wind" />
              <select value={form.wind || ""} onChange={e => setForm(f => ({ ...f, wind: e.target.value || null }))}
                style={{ background: CARD, color: form.wind ? T1 : T3, border: "1px solid " + BD, borderRadius: 5, padding: "7px 9px", fontSize: 13, outline: "none", width: "100%" }}>
                <option value="">-- Not set</option>
                {["Calm","Light","Moderate","Strong"].map(v => <option key={v} value={v.toLowerCase()}>{v}</option>)}
              </select>
            </div>
            <div>
              <Lbl t="Course Conditions" />
              <select value={form.conditions || ""} onChange={e => setForm(f => ({ ...f, conditions: e.target.value || null }))}
                style={{ background: CARD, color: form.conditions ? T1 : T3, border: "1px solid " + BD, borderRadius: 5, padding: "7px 9px", fontSize: 13, outline: "none", width: "100%" }}>
                <option value="">-- Not set</option>
                {["Firm","Normal","Soft"].map(v => <option key={v} value={v.toLowerCase()}>{v}</option>)}
              </select>
            </div>
            <div>
              <Lbl t="Time of Day" />
              <select value={form.timeOfDay || ""} onChange={e => setForm(f => ({ ...f, timeOfDay: e.target.value || null }))}
                style={{ background: CARD, color: form.timeOfDay ? T1 : T3, border: "1px solid " + BD, borderRadius: 5, padding: "7px 9px", fontSize: 13, outline: "none", width: "100%" }}>
                <option value="">-- Not set</option>
                {["Morning","Afternoon","Twilight"].map(v => <option key={v} value={v.toLowerCase()}>{v}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
            <button onClick={saveRound} style={{ background: BL, color: "#fff", padding: "11px 28px", borderRadius: 7, fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer", flex: 1 }}>
              {editId ? "Update Round" : "Save Round"} -- {totalScore} ({totalPM > 0 ? "+" : ""}{totalPM} to par) [{teeInfo.label} tees]
            </button>
            {editId && <button onClick={() => { setForm(emptyRound()); setEditId(null); setTab("dash"); }} style={{ background: C2, color: T2, border: "1px solid " + BD, padding: "11px 18px", borderRadius: 7, fontSize: 14, cursor: "pointer" }}>Cancel</button>}
            {saved && <span style={{ color: GN, fontWeight: 600 }}>Saved!</span>}
          </div>
        </Box>
      </div>
    );
  }

  // -- STROKES GAINED --
  function SGTab() {
    const [activeSG,  setActiveSG]  = useState(null);      // null = all
    const [sgView,    setSgView]    = useState("radar");    // "radar" | "trend"
    const [sgWindow,  setSgWindow]  = useState(10);         // 1=last, 3, 5, 10, 20, 0=all
    if (!rSG.length) return <div style={{ color: T3, padding: 40, textAlign: "center" }}>No rounds yet.</div>;

    // Window helpers
    const WINDOWS = [
      { n: 1,  label: "Last Round" },
      { n: 3,  label: "Last 3"     },
      { n: 5,  label: "Last 5"     },
      { n: 10, label: "Last 10"    },
      { n: 20, label: "Last 20"    },
      { n: 0,  label: "All"        },
    ];
    const windowRounds = sgWindow === 0 ? rSG : rSG.slice(-Math.min(sgWindow, rSG.length));
    const sgAvg = (key) => {
      const vals = windowRounds.map(r => parseFloat(r[key])).filter(v => !isNaN(v));
      return vals.length ? parseFloat((vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2)) : null;
    };

    // Drill-down: find selected round if any
    const drillRound = selectedRound ? rSG.find(r => r.id === selectedRound) : null;

    // When drilling a single round, ignore the window
    const effWindow  = drillRound ? 1 : sgWindow;
    const windowLabel = drillRound
      ? drillRound.date + " -- " + (drillRound.course || "Round")
      : (WINDOWS.find(w => w.n === sgWindow) || { label: "Last 10" }).label;

    const SG_SERIES = [
      { key: "sgOTT",   label: "SG: Tee",      color: BL, avg: drillRound ? drillRound.sgOTT   : sgAvg("sgOTT")   },
      { key: "sgApp",   label: "SG: Approach",  color: GN, avg: drillRound ? drillRound.sgApp   : sgAvg("sgApp")   },
      { key: "sgATG",   label: "SG: Around",    color: OR, avg: drillRound ? drillRound.sgATG   : sgAvg("sgATG")   },
      { key: "sgPutt",  label: "SG: Putting",   color: GL, avg: drillRound ? drillRound.sgPutt  : sgAvg("sgPutt")  },
      { key: "sgTotal", label: "SG: Total",     color: TL, avg: drillRound ? drillRound.sgTotal : sgAvg("sgTotal") },
    ];

    // For radar, map short keys back
    const SG_RADAR_KEY = { sgOTT: "OTT", sgApp: "App", sgATG: "ATG", sgPutt: "Putt", sgTotal: "Tot" };

    const sgTrend = last(20).map(r => ({ date: (r.date||"").slice(5), OTT: r.sgOTT, App: r.sgApp, ATG: r.sgATG, Putt: r.sgPutt, Tot: r.sgTotal, id: r.id }));
    const activeSeries = activeSG ? SG_SERIES.filter(s => s.key === activeSG) : SG_SERIES;
    const activeData   = activeSG
      ? sgTrend.map(r => ({ date: r.date, [SG_RADAR_KEY[activeSG]]: r[SG_RADAR_KEY[activeSG]], id: r.id }))
      : sgTrend;

    const vals = activeSeries.flatMap(s => sgTrend.map(r => r[SG_RADAR_KEY[s.key]])).filter(v => v != null);
    const yMin = vals.length ? Math.floor(Math.min(...vals) * 10) / 10 - 0.2 : -1.5;
    const yMax = vals.length ? Math.ceil(Math.max(...vals)  * 10) / 10 + 0.2 :  1.5;
    const activeSer = activeSG ? SG_SERIES.find(s => s.key === activeSG) : null;

    // Comparison: compute SG avg for each window period side by side
    const CMP_WINDOWS = [3, 5, 10, 20, 0];
    const cmpData = SG_SERIES.filter(s => s.key !== "sgTotal").map(s => {
      const row = { cat: s.label.replace("SG: ", ""), color: s.color };
      CMP_WINDOWS.forEach(n => {
        const r = n === 0 ? rSG : rSG.slice(-Math.min(n, rSG.length));
        const v = r.map(x => parseFloat(x[s.key])).filter(v => !isNaN(v));
        row["w" + n] = v.length ? parseFloat((v.reduce((a,b)=>a+b,0)/v.length).toFixed(2)) : null;
      });
      return row;
    });

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Window selector + KPI cards row */}
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>

          {/* Window toggle column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
            <div style={{ fontSize: 10, color: T3, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>Period</div>
            {WINDOWS.map(w => (
              <button key={w.n} onClick={() => { setSgWindow(w.n); setSelectedRound(null); }}
                style={{ background: sgWindow === w.n && !drillRound ? BL : C2, color: sgWindow === w.n && !drillRound ? "#fff" : T2, border: "1px solid " + (sgWindow === w.n && !drillRound ? BL : BD), borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: sgWindow === w.n && !drillRound ? 700 : 400, cursor: "pointer", whiteSpace: "nowrap", textAlign: "left" }}>
                {w.label}
                {rSG.length > 0 && w.n > 0 && <span style={{ color: sgWindow === w.n && !drillRound ? "rgba(255,255,255,0.7)" : T3, fontSize: 10, marginLeft: 4 }}>({Math.min(w.n, rSG.length)})</span>}
              </button>
            ))}
            {drillRound && (
              <button onClick={() => setSelectedRound(null)}
                style={{ background: RDL, color: RD, border: "1px solid " + RD, borderRadius: 6, padding: "6px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", marginTop: 4 }}>
                Clear Round
              </button>
            )}
          </div>

          {/* KPI cards */}
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10 }}>
            {SG_SERIES.map(({ key, label, color, avg }) => {
              const isActive = activeSG === key;
              const isOther  = activeSG !== null && !isActive;
              return (
                <div key={key} onClick={() => setActiveSG(isActive ? null : key)}
                  style={{ background: isActive ? color + "18" : CARD, border: "2px solid " + (isActive ? color : BD), borderRadius: 10, padding: "12px 14px", cursor: "pointer", opacity: isOther ? 0.45 : 1, transition: "all 0.15s", userSelect: "none" }}>
                  <Lbl t={label} />
                  <div style={{ fontFamily: "monospace", fontSize: 26, fontWeight: 700, color: avg != null ? (parseFloat(avg) > 0 ? color : RD) : T3 }}>
                    {avg != null ? (parseFloat(avg) > 0 ? "+" : "") + parseFloat(avg).toFixed(2) : "--"}
                  </div>
                  <div style={{ fontSize: 10, color: T3, marginTop: 2 }}>{windowLabel}</div>
                  {isActive && <div style={{ fontSize: 10, color: color, fontWeight: 700, marginTop: 4 }}>Isolated -- click to reset</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Period comparison table */}
        <Box style={{ padding: "14px 16px" }}>
          <Lbl t="Period Comparison -- SG Avg by Window" />
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid " + BD, background: C2 }}>
                <th style={{ padding: "7px 10px", textAlign: "left", color: T2, fontWeight: 700, fontSize: 11 }}>Category</th>
                {CMP_WINDOWS.map(n => (
                  <th key={n} onClick={() => { setSgWindow(n); setSelectedRound(null); }}
                    style={{ padding: "7px 10px", textAlign: "center", color: sgWindow === n && !drillRound ? BL : T2, fontWeight: sgWindow === n && !drillRound ? 800 : 700, fontSize: 11, cursor: "pointer", background: sgWindow === n && !drillRound ? BLL : "transparent", borderBottom: sgWindow === n && !drillRound ? "2px solid " + BL : "none" }}>
                    {n === 0 ? "All" : "Last " + n}
                    {n > 0 && rSG.length > 0 && <div style={{ fontSize: 9, color: T3, fontWeight: 400 }}>({Math.min(n, rSG.length)}r)</div>}
                  </th>
                ))}
                {drillRound && (
                  <th style={{ padding: "7px 10px", textAlign: "center", color: BL, fontWeight: 800, fontSize: 11, background: BLL }}>
                    {drillRound.date}
                    <div style={{ fontSize: 9, color: T2, fontWeight: 400 }}>Selected</div>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {cmpData.map(row => (
                <tr key={row.cat} style={{ borderBottom: "1px solid " + BD }}
                  onMouseEnter={e => e.currentTarget.style.background = C2}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "7px 10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: row.color, flexShrink: 0 }} />
                      <span style={{ fontWeight: 700, color: T1 }}>{row.cat}</span>
                    </div>
                  </td>
                  {CMP_WINDOWS.map(n => {
                    const v = row["w" + n];
                    const isActive = sgWindow === n && !drillRound;
                    const c = v == null ? T3 : v > 0.3 ? GN : v > 0 ? TL : v > -0.3 ? GL : RD;
                    const bg = v == null ? "transparent" : v > 0 ? "rgba(26,138,74,0.06)" : v < -0.2 ? "rgba(192,57,43,0.06)" : "transparent";
                    return (
                      <td key={n} style={{ padding: "7px 10px", textAlign: "center", background: isActive ? BLL : bg, fontWeight: isActive ? 800 : 600 }}>
                        <span style={{ fontFamily: "monospace", fontSize: 13, color: c }}>{v != null ? (v > 0 ? "+" : "") + v.toFixed(2) : "--"}</span>
                      </td>
                    );
                  })}
                  {drillRound && (() => {
                    const keyMap = { "Tee": "sgOTT", "Approach": "sgApp", "Around": "sgATG", "Putting": "sgPutt" };
                    const v = parseFloat(drillRound[keyMap[row.cat]]);
                    const c = isNaN(v) ? T3 : v > 0.3 ? GN : v > 0 ? TL : v > -0.3 ? GL : RD;
                    return (
                      <td style={{ padding: "7px 10px", textAlign: "center", background: BLL, fontWeight: 800 }}>
                        <span style={{ fontFamily: "monospace", fontSize: 13, color: c }}>{!isNaN(v) ? (v > 0 ? "+" : "") + v.toFixed(2) : "--"}</span>
                      </td>
                    );
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
        </Box>

        {/* View switcher */}
        <div style={{ display: "flex", gap: 8, marginBottom: 2 }}>
          {[["radar","Spider Chart"],["trend","Trend Lines"]].map(([v,lbl]) => (
            <button key={v} onClick={() => setSgView(v)}
              style={{ background: sgView === v ? BL : C2, color: sgView === v ? "#fff" : T2, border: "1px solid " + (sgView === v ? BL : BD), borderRadius: 5, padding: "5px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              {lbl}
            </button>
          ))}
        </div>

        {/* RADAR CHART */}
        {sgView === "radar" && s10 && (
          <Box style={{ padding: "20px 24px" }}>
            {/* Header */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: T1, marginBottom: 4 }}>
                {drillRound ? "Round: " + drillRound.date + " -- " + (drillRound.course || "") : "Game Profile -- Strengths and Weaknesses"}
              </div>
              <div style={{ fontSize: 12, color: T2 }}>
                {drillRound ? "Blue = this round  |  Teal dashed = 10r avg  |  Amber dashed = +2 target" : "Blue filled = your " + WINDOWS.find(w => w.n === sgWindow).label + " average  |  Amber dashed = +2 target  |  Larger area = better"}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 24, alignItems: "start" }}>

              {/* Radar chart -- simple and robust */}
              {(() => {
                const P2    = { sgOTT: 0.18, sgApp: 0.32, sgATG: 0.12, sgPutt: 0.10 };
                const CATS  = [
                  { key: "sgOTT",  label: "Off the Tee",  p2: 0.18, color: BL  },
                  { key: "sgApp",  label: "Approach",      p2: 0.32, color: GN  },
                  { key: "sgATG",  label: "Around Green",  p2: 0.12, color: OR  },
                  { key: "sgPutt", label: "Putting",       p2: 0.10, color: GL  },
                ];
                const getVal = key => {
                  if (drillRound) return parseFloat(drillRound[key]) || 0;
                  return parseFloat(sgAvg(key)) || 0;
                };
                const getAvg = key => parseFloat(sgAvg(key)) || 0;
                const norm = v => Math.min(100, Math.max(0, (v + 1.5) / 3 * 100));

                const data = CATS.map(c => ({
                  subject: c.label,
                  You:    parseFloat(norm(getVal(c.key)).toFixed(1)),
                  Avg:    parseFloat(norm(getAvg(c.key)).toFixed(1)),
                  Target: parseFloat(norm(c.p2).toFixed(1)),
                  raw:    getVal(c.key),
                  rawAvg: getAvg(c.key),
                  p2:     c.p2,
                }));

                return (
                  <ResponsiveContainer width="100%" height={420}>
                    <RadarChart data={data} margin={{ top: 30, right: 50, bottom: 30, left: 50 }}>
                      <PolarGrid stroke={BD} />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: T1, fontSize: 13, fontWeight: 700 }} />
                      <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar name="You" dataKey="You" stroke={BL} strokeWidth={3} fill={BL} fillOpacity={0.20} dot={{ r: 6, fill: BL, stroke: "#fff", strokeWidth: 2 }} />
                      {drillRound && <Radar name="10r Avg" dataKey="Avg" stroke={TL} strokeWidth={2} fill="none" strokeDasharray="5 4" dot={{ r: 4, fill: TL }} />}
                      <Radar name="+2 Target" dataKey="Target" stroke={GL} strokeWidth={2} fill="none" strokeDasharray="6 4" dot={false} />
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const d = payload[0].payload;
                        const n = d.raw; const gap = parseFloat((d.p2 - n).toFixed(2));
                        return (
                          <div style={{ background: CARD, border: "2px solid " + (gap <= 0 ? GN : RD), borderRadius: 9, padding: "12px 16px", fontSize: 12, minWidth: 180 }}>
                            <div style={{ fontWeight: 800, color: T1, fontSize: 14, marginBottom: 6 }}>{d.subject}</div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                              <span style={{ color: T2 }}>{drillRound ? "This round" : "Your avg"}</span>
                              <span style={{ fontFamily: "monospace", fontWeight: 800, color: n >= 0 ? GN : RD }}>{n > 0 ? "+" : ""}{n.toFixed(2)}</span>
                            </div>
                            {drillRound && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                              <span style={{ color: T2 }}>10r avg</span>
                              <span style={{ fontFamily: "monospace", fontWeight: 700, color: TL }}>{d.rawAvg > 0 ? "+" : ""}{d.rawAvg.toFixed(2)}</span>
                            </div>}
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                              <span style={{ color: T2 }}>+2 target</span>
                              <span style={{ fontFamily: "monospace", fontWeight: 700, color: GL }}>+{d.p2}</span>
                            </div>
                            <div style={{ borderTop: "1px solid " + BD, paddingTop: 6, fontWeight: 700, color: gap <= 0 ? GN : RD }}>
                              {gap <= 0 ? "Above +2 benchmark" : "Gap: -" + gap}
                            </div>
                          </div>
                        );
                      }} />
                    </RadarChart>
                  </ResponsiveContainer>
                );
              })()}

              {/* Stat cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 20 }}>
                {[
                  { key: "sgOTT",  label: "Off the Tee",  p2: 0.18, color: BL },
                  { key: "sgApp",  label: "Approach",      p2: 0.32, color: GN },
                  { key: "sgATG",  label: "Around Green",  p2: 0.12, color: OR },
                  { key: "sgPutt", label: "Putting",       p2: 0.10, color: GL },
                ].map(c => {
                  const n    = drillRound ? (parseFloat(drillRound[c.key]) || 0) : (parseFloat(sgAvg(c.key)) || 0);
                  const avg  = parseFloat(sgAvg(c.key)) || 0;
                  const gap  = parseFloat((c.p2 - n).toFixed(2));
                  const atP2 = gap <= 0.05;
                  const barW = Math.min(100, Math.max(0, (n + 1.5) / 3 * 100));
                  const p2W  = Math.min(100, Math.max(0, (c.p2 + 1.5) / 3 * 100));
                  return (
                    <div key={c.key} style={{ background: atP2 ? GNL : n >= 0 ? GLL : RDL, border: "2px solid " + (atP2 ? GN : n >= 0 ? GL : RD), borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <div style={{ width: 11, height: 11, borderRadius: "50%", background: c.color }} />
                          <span style={{ fontSize: 13, fontWeight: 800, color: T1 }}>{c.label}</span>
                        </div>
                        <span style={{ fontFamily: "monospace", fontWeight: 900, fontSize: 20, color: n >= 0 ? GN : RD }}>{n > 0 ? "+" : ""}{n.toFixed(2)}</span>
                      </div>
                      {drillRound && (
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 11 }}>
                          <span style={{ color: T2 }}>10r avg</span>
                          <span style={{ color: TL, fontFamily: "monospace", fontWeight: 700 }}>{avg > 0 ? "+" : ""}{avg.toFixed(2)}</span>
                        </div>
                      )}
                      <div style={{ position: "relative", background: "rgba(255,255,255,0.5)", borderRadius: 4, height: 8, marginBottom: 5 }}>
                        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: barW + "%", background: c.color, borderRadius: 4, opacity: 0.75 }} />
                        <div style={{ position: "absolute", left: p2W + "%", top: -2, bottom: -2, width: 2, background: GL, borderRadius: 1 }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                        <span style={{ color: T3 }}>+2: <b style={{ color: GL }}>+{c.p2}</b></span>
                        <span style={{ color: atP2 ? GN : RD, fontWeight: 800 }}>{atP2 ? "On track" : "Gap -" + gap}</span>
                      </div>
                    </div>
                  );
                })}
                <div style={{ background: BLL, border: "2px solid " + BL, borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: T1 }}>Total SG</span>
                    <span style={{ fontFamily: "monospace", fontWeight: 900, fontSize: 22, color: parseFloat(sgAvg("sgTotal")) >= 0 ? GN : RD }}>
                      {(() => { const v = parseFloat(sgAvg("sgTotal")); return (v > 0 ? "+" : "") + v.toFixed(2); })()}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: T2, marginTop: 4 }}>{WINDOWS.find(w => w.n === sgWindow).label}</div>
                </div>
              </div>

            </div>
          </Box>
        )}

        {/* Chart */}
        {sgView === "trend" && <Box>
          {drillRound && (
            <div style={{ marginBottom: 10, padding: "8px 12px", background: BLL, borderRadius: 6, border: "1px solid " + BL, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: BL, fontWeight: 700 }}>
                Showing: {drillRound.date} -- {drillRound.course || "Round"} ({drillRound.score}, {drillRound.score - TOTAL_PAR > 0 ? "+" : ""}{drillRound.score - TOTAL_PAR})
              </div>
              <button onClick={() => setSelectedRound(null)} style={{ background: "none", color: T2, border: "1px solid " + BD, borderRadius: 5, padding: "3px 10px", fontSize: 11, cursor: "pointer" }}>Clear -- back to 10r avg</button>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <Lbl t={drillRound ? "SG: " + drillRound.date + " vs 10-Round Avg" : activeSer ? activeSer.label + " -- Last 20 Rounds" : "All SG Categories -- Last 20 Rounds"} />
              {activeSG && (
                <div style={{ fontSize: 11, color: T2 }}>
                  Showing isolated view. Click the card above again or
                  <button onClick={() => setActiveSG(null)} style={{ background: "none", border: "none", color: BL, cursor: "pointer", fontSize: 11, fontWeight: 700, padding: "0 4px", textDecoration: "underline" }}>reset to all</button>
                </div>
              )}
            </div>
            {/* Legend toggles */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {SG_SERIES.map(({ key, label, color }) => (
                <button key={key} onClick={() => setActiveSG(activeSG === key ? null : key)}
                  style={{ background: activeSG === key ? color : activeSG === null ? color + "20" : C2, color: activeSG === key ? "#fff" : activeSG === null ? color : T3, border: "1px solid " + (activeSG === key ? color : BD), borderRadius: 4, padding: "3px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.12s" }}>
                  {label.replace("SG: ", "")}
                </button>
              ))}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={activeData} margin={{ top: 8, right: 12, left: -15, bottom: 0 }}>
              <CartesianGrid stroke={BD} strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: T3, fontSize: 10 }} tickLine={false} />
              <YAxis domain={[yMin, yMax]} tick={{ fill: T3, fontSize: 10 }} tickLine={false} tickFormatter={v => v.toFixed(1)} />
              <Tooltip content={<TT />} />
              <ReferenceLine y={0} stroke={T2} strokeWidth={1.5} />
              {drillRound && sgTrend.find(r => r.id === drillRound.id) && (
                <ReferenceLine x={sgTrend.find(r => r.id === drillRound.id).date} stroke={BL} strokeWidth={2} strokeDasharray="4 3" label={{ value: "Selected", position: "top", fill: BL, fontSize: 9 }} />
              )}
              {activeSeries.map(s => {
                const dk = SG_RADAR_KEY[s.key];
                return (
                  <Line key={s.key} dataKey={dk}
                    stroke={s.color}
                    strokeWidth={activeSG === s.key ? 3 : activeSG === null && s.key === "sgTotal" ? 2.5 : 1.5}
                    dot={activeSG === s.key ? { r: 4, fill: s.color, stroke: "#fff", strokeWidth: 1.5 } : activeSG === null && s.key === "sgTotal" ? { r: 2.5, fill: s.color } : false}
                    name={s.label}
                    connectNulls
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>

          {/* Round-by-round values table when isolated */}
          {activeSG && activeSer && (
            <div style={{ marginTop: 14, borderTop: "1px solid " + BD, paddingTop: 12 }}>
              <Lbl t={activeSer.label + " -- All 20 Rounds"} />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {sgTrend.map((r, i) => {
                  const v = r[SG_RADAR_KEY[activeSG]];
                  const n = parseFloat(v);
                  return (
                    <div key={i} style={{ background: n > 0 ? GNL : n < -0.2 ? RDL : GLL, border: "1px solid " + BD, borderRadius: 5, padding: "5px 9px", textAlign: "center", minWidth: 58 }}>
                      <div style={{ fontSize: 9, color: T3 }}>{r.date}</div>
                      <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13, color: n > 0 ? GN : n < -0.2 ? RD : GL }}>
                        {n > 0 ? "+" : ""}{n.toFixed(2)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Box>
        }

      </div>
    );
  }

  // -- HOLE ANALYSIS --
  function HoleAnalysis() {
    if (!rSG.length) return <div style={{ color: T3, padding: 40, textAlign: "center" }}>No rounds yet.</div>;
    const r20 = last(20);

    const holeData = HOLES.map(ch => {
      const hd = r20.map(r => r.holes && r.holes.find(h => h.hole === ch.h)).filter(Boolean);
      if (!hd.length) return { hole: ch.h, par: ch.p, n: 0, avgScore: ch.p, pm: 0, girPct: 0, avgPutts: 2, avgProx: 0, scrPct: 0, hazardPct: 0, firPct: null, avgDist: 0, clubs: {}, missDirs: {} };
      const firHoles = hd.filter(h => h.fir !== undefined && h.par >= 4);
      const girHoles = hd.filter(h => h.gir);
      const missH    = hd.filter(h => !h.gir && h.udAtt);
      const distH    = hd.filter(h => h.distToHole > 0);
      // tee: { "Driver": { L:3, R:1, hit:2 }, "3W": {...} }
      const teeMap = {};
      hd.forEach(h => {
        if (!h.teeClub || h.par < 4) return;
        if (!teeMap[h.teeClub]) teeMap[h.teeClub] = { total: 0, hit: 0, L: 0, R: 0, Sh: 0 };
        teeMap[h.teeClub].total++;
        if (h.fir === true)  teeMap[h.teeClub].hit++;
        if (h.firMiss === "L")  teeMap[h.teeClub].L++;
        if (h.firMiss === "R")  teeMap[h.teeClub].R++;
        if (h.firMiss === "Sh") teeMap[h.teeClub].Sh++;
      });
      // approach: { "8i": { gir:3, missL:1, missR:2, missLg:0, missSh:1, sand:1 } }
      const apprMap = {};
      hd.forEach(h => {
        if (!h.approachClub) return;
        if (!apprMap[h.approachClub]) apprMap[h.approachClub] = { total: 0, gir: 0, L: 0, R: 0, Lg: 0, Sh: 0, sand: 0 };
        apprMap[h.approachClub].total++;
        if (h.gir) apprMap[h.approachClub].gir++;
        else {
          if (h.missDir === "L")  apprMap[h.approachClub].L++;
          if (h.missDir === "R")  apprMap[h.approachClub].R++;
          if (h.missDir === "Lg") apprMap[h.approachClub].Lg++;
          if (h.missDir === "Sh") apprMap[h.approachClub].Sh++;
          if (h.sand) apprMap[h.approachClub].sand++;
        }
      });
      const clubs = {};
      hd.forEach(h => { if (h.teeClub) clubs[h.teeClub] = (clubs[h.teeClub]||0)+1; if (h.approachClub) clubs[h.approachClub] = (clubs[h.approachClub]||0)+1; });
      const topClub = Object.entries(clubs).sort((a,b) => b[1]-a[1])[0];
      const missDirs = {};
      hd.forEach(h => { if (h.missDir) missDirs[h.missDir] = (missDirs[h.missDir]||0)+1; if (h.firMiss) missDirs["Tee-"+h.firMiss] = (missDirs["Tee-"+h.firMiss]||0)+1; });
      return {
        hole: ch.h, par: ch.p, n: hd.length,
        avgScore: parseFloat((hd.reduce((s,h) => s+(h.score||h.par),0)/hd.length).toFixed(2)),
        pm:       parseFloat((hd.reduce((s,h) => s+(h.score||h.par)-h.par,0)/hd.length).toFixed(2)),
        girPct:   Math.round(girHoles.length/hd.length*100),
        avgPutts: parseFloat((hd.reduce((s,h) => s+(h.putts||2),0)/hd.length).toFixed(1)),
        avgProx:  girHoles.length ? Math.round(girHoles.reduce((s,h) => s+(h.prox||25),0)/girHoles.length) : 0,
        scrPct:   missH.length ? Math.round(missH.filter(h=>h.udMade).length/missH.length*100) : null,
        hazardPct:Math.round(hd.filter(h=>h.hazard).length/hd.length*100),
        firPct:   firHoles.length ? Math.round(firHoles.filter(h=>h.fir===true).length/firHoles.length*100) : null,
        avgDist:  distH.length ? Math.round(distH.reduce((s,h)=>s+(h.distToHole||0),0)/distH.length) : 0,
        topClub:  topClub ? topClub[0] : "--",
        missDirs, teeMap, apprMap,
        hazardPct2: hd.filter(h=>h.hazard).length,
      };
    });

    const sorted = [...holeData].filter(h => h.n >= 2).sort((a,b) => b.pm - a.pm);
    const worst6 = sorted.slice(0, 6);
    const best6  = sorted.slice(-6).reverse();

    function HoleCard({ h, type }) {
      const isWeak = type === "weak";
      const bg     = isWeak ? RDL : GNL;
      const border = isWeak ? RD  : GN;
      const tc     = isWeak ? RD  : GN;

      // Build tee club rows: "Driver (8x): L x4, R x1, HIT x3"
      const teeRows = Object.entries(h.teeMap || {})
        .sort((a,b) => b[1].total - a[1].total)
        .map(([club, d]) => {
          const parts = [];
          if (d.L)   parts.push("Left x" + d.L);
          if (d.R)   parts.push("Right x" + d.R);
          if (d.Sh)  parts.push("Short x" + d.Sh);
          if (d.hit) parts.push("FIR x" + d.hit);
          return { club, total: d.total, detail: parts.join(", ") || "No miss recorded" };
        });

      // Build approach club rows: "8i (6x): Miss Right x3 (incl 2 bunker), GIR x3"
      const apprRows = Object.entries(h.apprMap || {})
        .sort((a,b) => b[1].total - a[1].total)
        .map(([club, d]) => {
          const missParts = [];
          if (d.L)    missParts.push("Left x" + d.L);
          if (d.R)    missParts.push("Right x" + d.R);
          if (d.Lg)   missParts.push("Long x" + d.Lg);
          if (d.Sh)   missParts.push("Short x" + d.Sh);
          if (d.sand) missParts.push("bunker x" + d.sand);
          const missStr = missParts.length ? "Miss: " + missParts.join(", ") : "";
          const girStr  = d.gir ? "GIR x" + d.gir : "";
          const detail  = [girStr, missStr].filter(Boolean).join(" | ") || "No data";
          return { club, total: d.total, detail };
        });

      const stat = (label, val, col) => (
        <div style={{ background: "rgba(255,255,255,0.65)", borderRadius: 5, padding: "5px 8px" }}>
          <div style={{ color: T3, fontSize: 9, fontWeight: 700, textTransform: "uppercase" }}>{label}</div>
          <div style={{ color: col, fontWeight: 700, fontFamily: "monospace", fontSize: 12 }}>{val}</div>
        </div>
      );

      return (
        <div style={{ background: bg, border: "1px solid " + border, borderRadius: 8, padding: "12px 14px" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <span style={{ fontWeight: 800, fontSize: 18, color: tc }}>Hole {h.hole}</span>
              <span style={{ color: T2, fontSize: 12, marginLeft: 8 }}>Par {h.par}</span>
              {h.avgDist > 0 && <span style={{ color: T3, fontSize: 11, marginLeft: 8 }}>{h.avgDist}y avg in</span>}
              {h.hazardPct2 > 0 && <span style={{ background: RDL, color: RD, fontSize: 10, fontWeight: 700, marginLeft: 8, padding: "1px 6px", borderRadius: 3 }}>Haz x{h.hazardPct2}</span>}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 800, color: tc }}>{h.pm > 0 ? "+" : ""}{h.pm}</div>
              <div style={{ fontSize: 10, color: T3 }}>avg vs par</div>
            </div>
          </div>

          {/* Key stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 5, marginBottom: 12 }}>
            {stat("GIR", h.girPct + "%", h.girPct >= 65 ? GN : h.girPct >= 45 ? GL : RD)}
            {h.firPct !== null && stat("FIR", h.firPct + "%", h.firPct >= 65 ? GN : h.firPct >= 45 ? GL : RD)}
            {stat("Putts", h.avgPutts, h.avgPutts <= 1.8 ? GN : h.avgPutts <= 2.1 ? GL : RD)}
            {h.avgProx > 0 && stat("Prox", h.avgProx + "m", h.avgProx <= 20 ? GN : h.avgProx <= 30 ? GL : RD)}
            {h.scrPct !== null && stat("Scr", h.scrPct + "%", h.scrPct >= 60 ? GN : h.scrPct >= 40 ? GL : RD)}
          </div>

          {/* Tee club patterns */}
          {teeRows.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T2, textTransform: "uppercase", marginBottom: 5 }}>Tee Club Patterns</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {teeRows.map(row => (
                  <div key={row.club} style={{ display: "flex", alignItems: "baseline", gap: 6, background: "rgba(255,255,255,0.55)", borderRadius: 5, padding: "5px 8px" }}>
                    <span style={{ fontWeight: 700, color: T1, fontSize: 12, minWidth: 58 }}>{row.club}</span>
                    <span style={{ color: T3, fontSize: 11 }}>({row.total}x)</span>
                    <span style={{ color: isWeak ? OR : TL, fontSize: 11 }}>{row.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Approach club patterns */}
          {apprRows.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: T2, textTransform: "uppercase", marginBottom: 5 }}>Approach Club Patterns</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {apprRows.map(row => (
                  <div key={row.club} style={{ display: "flex", alignItems: "baseline", gap: 6, background: "rgba(255,255,255,0.55)", borderRadius: 5, padding: "5px 8px" }}>
                    <span style={{ fontWeight: 700, color: T1, fontSize: 12, minWidth: 36 }}>{row.club}</span>
                    <span style={{ color: T3, fontSize: 11 }}>({row.total}x)</span>
                    <span style={{ color: isWeak ? OR : TL, fontSize: 11 }}>{row.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {teeRows.length === 0 && apprRows.length === 0 && (
            <div style={{ color: T3, fontSize: 11, fontStyle: "italic" }}>Log club selections to see patterns here</div>
          )}
        </div>
      );
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: RD, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ background: RDL, border: "1px solid " + RD, borderRadius: 5, padding: "2px 10px", fontSize: 12 }}>Bottom 6 Holes -- Where You Lose Shots</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {worst6.map(h => <HoleCard key={h.hole} h={h} type="weak" />)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: GN, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ background: GNL, border: "1px solid " + GN, borderRadius: 5, padding: "2px 10px", fontSize: 12 }}>Top 6 Holes -- Where You Gain Shots</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {best6.map(h => <HoleCard key={h.hole} h={h} type="strong" />)}
            </div>
          </div>
        </div>

        {/* PAR TYPE ANALYSIS */}
        {(() => {
          const r20 = last(20);
          const parTypes = [3, 4, 5];
          const parData = parTypes.map(par => {
            const hd = r20.flatMap(r => (r.holes||[]).filter(h => h.par === par));
            if (!hd.length) return { par, n: 0, avgScore: par, avgPM: 0, birdiePct: 0, parPct: 0, bogeyplusPct: 0, girPct: 0 };
            const avgPM = parseFloat((hd.reduce((s,h) => s+(h.score-h.par), 0)/hd.length).toFixed(2));
            return {
              par, n: hd.length,
              avgPM,
              birdiePct: Math.round(hd.filter(h => h.score < h.par).length / hd.length * 100),
              parPct:    Math.round(hd.filter(h => h.score === h.par).length / hd.length * 100),
              bogeyplusPct: Math.round(hd.filter(h => h.score > h.par).length / hd.length * 100),
              girPct:    Math.round(hd.filter(h => h.gir).length / hd.length * 100),
              avgPutts:  parseFloat((hd.reduce((s,h)=>s+(h.putts||2),0)/hd.length).toFixed(1)),
            };
          }).filter(d => d.n > 0);

          // Score after bogey
          const bogeyFollowData = r20.flatMap(r => {
            if (!r.holes) return [];
            const result = [];
            for (let i = 0; i < r.holes.length - 1; i++) {
              if (r.holes[i].score > r.holes[i].par) {
                result.push({ next: r.holes[i+1].score - r.holes[i+1].par, prev: r.holes[i].score - r.holes[i].par });
              }
            }
            return result;
          });
          const afterBogeyPM  = bogeyFollowData.length ? parseFloat((bogeyFollowData.reduce((s,d)=>s+d.next,0)/bogeyFollowData.length).toFixed(2)) : null;
          const afterParPM    = (() => {
            const d = r20.flatMap(r => { if (!r.holes) return []; const res = []; for (let i=0;i<r.holes.length-1;i++) if (r.holes[i].score===r.holes[i].par) res.push(r.holes[i+1].score-r.holes[i+1].par); return res; });
            return d.length ? parseFloat((d.reduce((a,b)=>a+b,0)/d.length).toFixed(2)) : null;
          })();
          const afterBirdiePM = (() => {
            const d = r20.flatMap(r => { if (!r.holes) return []; const res = []; for (let i=0;i<r.holes.length-1;i++) if (r.holes[i].score<r.holes[i].par) res.push(r.holes[i+1].score-r.holes[i+1].par); return res; });
            return d.length ? parseFloat((d.reduce((a,b)=>a+b,0)/d.length).toFixed(2)) : null;
          })();

          // Front vs Back 9
          const fbData = [
            { label: "Front 9", holes: [1,2,3,4,5,6,7,8,9], par: FRONT_PAR },
            { label: "Back 9",  holes: [10,11,12,13,14,15,16,17,18], par: BACK_PAR },
          ].map(nine => {
            const hd = r20.flatMap(r => (r.holes||[]).filter(h => nine.holes.includes(h.hole)));
            const rounds9 = r20.map(r => (r.holes||[]).filter(h => nine.holes.includes(h.hole)).reduce((s,h)=>s+(h.score||h.par),0));
            const avgScore = rounds9.length ? parseFloat((rounds9.reduce((a,b)=>a+b,0)/rounds9.length).toFixed(1)) : nine.par;
            const girPct = hd.length ? Math.round(hd.filter(h=>h.gir).length/hd.length*100) : 0;
            const avgPutts = hd.length ? parseFloat((hd.reduce((s,h)=>s+(h.putts||2),0)/hd.length).toFixed(1)) : 2;
            return { ...nine, avgScore, avgPM: parseFloat((avgScore - nine.par).toFixed(1)), girPct, avgPutts };
          });

          const pmC = pm => pm < 0 ? GN : pm < 0.3 ? TL : pm < 0.8 ? GL : pm < 1.5 ? OR : RD;

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 14 }}>
              {/* Par type analysis */}
              <Box>
                <Lbl t="Scoring by Par Type (last 20 rounds)" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginTop: 8 }}>
                  {parData.map(d => (
                    <div key={d.par} style={{ background: C2, border: "1px solid " + BD, borderRadius: 10, padding: "14px 16px" }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: T2, marginBottom: 2 }}>Par {d.par}s</div>
                      <div style={{ fontFamily: "monospace", fontSize: 28, fontWeight: 900, color: pmC(d.avgPM), lineHeight: 1 }}>{d.avgPM > 0 ? "+" : ""}{d.avgPM}</div>
                      <div style={{ fontSize: 10, color: T3, marginBottom: 10 }}>{d.n} holes played</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {[["Birdie+", d.birdiePct, BL], ["Par", d.parPct, GN], ["Bogey+", d.bogeyplusPct, RD]].map(([lbl, pct, col]) => (
                          <div key={lbl}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                              <span style={{ color: T2 }}>{lbl}</span>
                              <span style={{ color: col, fontFamily: "monospace", fontWeight: 700 }}>{pct}%</span>
                            </div>
                            <div style={{ background: "rgba(255,255,255,0.6)", borderRadius: 2, height: 4 }}>
                              <div style={{ width: pct + "%", background: col, height: "100%", borderRadius: 2 }} />
                            </div>
                          </div>
                        ))}
                        <div style={{ borderTop: "1px solid " + BD, paddingTop: 6, marginTop: 2, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 10 }}>
                          <div><span style={{ color: T3 }}>GIR: </span><span style={{ color: d.girPct >= 70 ? GN : d.girPct >= 50 ? GL : RD, fontWeight: 700 }}>{d.girPct}%</span></div>
                          <div><span style={{ color: T3 }}>Putts: </span><span style={{ color: d.avgPutts <= 1.8 ? GN : T2, fontWeight: 700, fontFamily: "monospace" }}>{d.avgPutts}</span></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Box>

              {/* Front vs Back 9 */}
              <Box>
                <Lbl t="Front 9 vs Back 9 (last 20 rounds)" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
                  {fbData.map(nine => (
                    <div key={nine.label} style={{ background: C2, border: "1px solid " + BD, borderRadius: 10, padding: "14px 16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: T1 }}>{nine.label}</div>
                          <div style={{ fontSize: 10, color: T3 }}>Par {nine.par}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontFamily: "monospace", fontSize: 26, fontWeight: 900, color: pmC(nine.avgPM), lineHeight: 1 }}>{nine.avgScore}</div>
                          <div style={{ fontSize: 12, color: pmC(nine.avgPM), fontWeight: 700 }}>{nine.avgPM > 0 ? "+" : ""}{nine.avgPM}</div>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 10, fontSize: 11 }}>
                        <div style={{ background: "rgba(255,255,255,0.6)", borderRadius: 6, padding: "6px 8px" }}>
                          <div style={{ color: T3, fontSize: 9, fontWeight: 700, textTransform: "uppercase" }}>GIR</div>
                          <div style={{ color: nine.girPct >= 70 ? GN : nine.girPct >= 50 ? GL : RD, fontWeight: 800, fontFamily: "monospace" }}>{nine.girPct}%</div>
                        </div>
                        <div style={{ background: "rgba(255,255,255,0.6)", borderRadius: 6, padding: "6px 8px" }}>
                          <div style={{ color: T3, fontSize: 9, fontWeight: 700, textTransform: "uppercase" }}>Putts</div>
                          <div style={{ color: nine.avgPutts <= 1.8 ? GN : nine.avgPutts <= 2.1 ? T2 : RD, fontWeight: 800, fontFamily: "monospace" }}>{nine.avgPutts}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Box>

              {/* Score after bogey / par / birdie */}
              <Box>
                <Lbl t="Mental Resilience -- Score After Hole Result (last 20 rounds)" />
                <div style={{ color: T3, fontSize: 11, marginBottom: 12 }}>Average score to par on the NEXT hole, following each result type. Positive = compounds, Negative = recovers.</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                  {[
                    { label: "After Birdie/Eagle", val: afterBirdiePM, ideal: "<=0", note: "Birdie momentum" },
                    { label: "After Par",           val: afterParPM,    ideal: "<=0.3", note: "Consistency" },
                    { label: "After Bogey+",        val: afterBogeyPM,  ideal: "<0.5", note: "Recovery key" },
                  ].map(({ label, val, ideal, note }) => {
                    const n = val;
                    const c = n === null ? T3 : label.includes("Bogey") ? (n < 0.5 ? GN : n < 1 ? GL : RD) : (n <= 0 ? GN : n <= 0.4 ? GL : RD);
                    return (
                      <div key={label} style={{ background: C2, border: "1px solid " + BD, borderRadius: 10, padding: "12px 14px" }}>
                        <div style={{ fontSize: 11, color: T2, fontWeight: 700, marginBottom: 4 }}>{label}</div>
                        <div style={{ fontFamily: "monospace", fontSize: 26, fontWeight: 900, color: c, lineHeight: 1 }}>
                          {n !== null ? (n > 0 ? "+" : "") + n.toFixed(2) : "--"}
                        </div>
                        <div style={{ fontSize: 10, color: T3, marginTop: 3 }}>{note}</div>
                        <div style={{ fontSize: 9, color: T3, marginTop: 1 }}>Ideal: {ideal} avg to par</div>
                      </div>
                    );
                  })}
                </div>
              </Box>
            </div>
          );
        })()}

        <Box>
          <Lbl t="All 18 Holes -- Full Summary" />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid " + BD, background: C2 }}>
                  {["Hole","Par","Rounds","Avg","+/-","FIR%","GIR%","Avg Prox","Avg Dist","Top Club","Scr%","Putts","Hazards"].map(h => (
                    <th key={h} style={{ padding: "6px 8px", textAlign: "center", color: T2, fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {holeData.map(h => {
                  const c = h.pm < 0 ? GN : h.pm < 0.3 ? TL : h.pm < 0.8 ? GL : h.pm < 1.5 ? OR : RD;
                  const bg = h.pm < 0 ? GNL : h.pm > 1 ? RDL : "transparent";
                  return (
                    <tr key={h.hole} style={{ borderBottom: "1px solid " + BD, background: bg }}>
                      <td style={{ padding: "5px 8px", textAlign: "center", fontWeight: 700, color: BL, fontSize: 13 }}>{h.hole}</td>
                      <td style={{ padding: "5px 8px", textAlign: "center", color: T2 }}>{h.par}</td>
                      <td style={{ padding: "5px 8px", textAlign: "center", color: T3 }}>{h.n}</td>
                      <td style={{ padding: "5px 8px", textAlign: "center", fontFamily: "monospace", color: c, fontWeight: 600 }}>{h.avgScore}</td>
                      <td style={{ padding: "5px 8px", textAlign: "center", fontFamily: "monospace", color: c, fontWeight: 700 }}>{h.pm > 0 ? "+" : ""}{h.pm}</td>
                      <td style={{ padding: "5px 8px", textAlign: "center", color: h.firPct === null ? T3 : h.firPct >= 65 ? GN : h.firPct >= 45 ? GL : RD }}>{h.firPct !== null ? h.firPct + "%" : "N/A"}</td>
                      <td style={{ padding: "5px 8px", textAlign: "center", color: h.girPct >= 70 ? GN : h.girPct >= 50 ? GL : RD }}>{h.girPct}%</td>
                      <td style={{ padding: "5px 8px", textAlign: "center", color: h.avgProx <= 20 ? GN : h.avgProx <= 30 ? GL : T2 }}>{h.avgProx > 0 ? h.avgProx + "m" : "--"}</td>
                      <td style={{ padding: "5px 8px", textAlign: "center", color: T2 }}>{h.avgDist > 0 ? h.avgDist + "m" : "--"}</td>
                      <td style={{ padding: "5px 8px", textAlign: "center", color: T1, fontSize: 11 }}>{h.topClub}</td>
                      <td style={{ padding: "5px 8px", textAlign: "center", color: h.scrPct === null ? T3 : h.scrPct >= 60 ? GN : h.scrPct >= 40 ? GL : RD }}>{h.scrPct !== null ? h.scrPct + "%" : "N/A"}</td>
                      <td style={{ padding: "5px 8px", textAlign: "center", color: h.avgPutts <= 1.8 ? GN : h.avgPutts <= 2.1 ? T2 : RD, fontFamily: "monospace" }}>{h.avgPutts}</td>
                      <td style={{ padding: "5px 8px", textAlign: "center", color: h.hazardPct2 > 2 ? RD : h.hazardPct2 > 0 ? GL : GN, fontFamily: "monospace" }}>{h.hazardPct2}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Box>
      </div>
    );
  }


  // -- CLUB STATS --
  function ClubStats() {
    const [showBag,       setShowBag]       = useState(false);
    const [selFirClub,    setSelFirClub]    = useState(null); // isolated tee club
    const [selGirClub,    setSelGirClub]    = useState(null); // isolated approach club
    if (!rSG.length) return <div style={{ color: T3, padding: 40, textAlign: "center" }}>No rounds yet. Load demo data or log rounds to see club statistics.</div>;
    const allRounds = last(50);
    const allHoles  = allRounds.flatMap(r => r.holes || []);

    // -- FIR per tee club per round --
    // firByRound[date] = { "Driver": { hit, total }, "Mini": {...}, ... }
    const firByRound = {};
    allRounds.forEach(r => {
      if (!r.holes) return;
      const dateKey = (r.date || "").slice(5);
      r.holes.filter(h => h.par >= 4 && h.teeClub).forEach(h => {
        if (!firByRound[dateKey]) firByRound[dateKey] = {};
        if (!firByRound[dateKey][h.teeClub]) firByRound[dateKey][h.teeClub] = { hit: 0, total: 0, L: 0, R: 0, Sh: 0 };
        const c = firByRound[dateKey][h.teeClub];
        c.total++;
        if (h.fir === true) c.hit++;
        else if (h.fir === false) {
          if (h.firMiss === "L")  c.L++;
          if (h.firMiss === "R")  c.R++;
          if (h.firMiss === "Sh") c.Sh++;
        }
      });
    });
    const firDates = Object.keys(firByRound).sort();
    const firTeeClubs = [...new Set(allHoles.filter(h => h.par >= 4 && h.teeClub).map(h => h.teeClub))];
    const clubOrder = BAG.map(c => c.name);
    firTeeClubs.sort((a, b) => {
      const ai = clubOrder.indexOf(a); const bi = clubOrder.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    // Build flat chart data: one row per round, columns per club (null if not used that round)
    const firChartData = firDates.map(date => {
      const row = { date };
      firTeeClubs.forEach(club => {
        const d = firByRound[date][club];
        row[club] = d && d.total > 0 ? Math.round(d.hit / d.total * 100) : null;
        row[club + "_miss"] = d ? { L: d.L, R: d.R, Sh: d.Sh, total: d.total, hit: d.hit } : null;
      });
      return row;
    });

    // -- GIR per approach club per round --
    const girByRound = {};
    allRounds.forEach(r => {
      if (!r.holes) return;
      const dateKey = (r.date || "").slice(5);
      r.holes.filter(h => h.approachClub).forEach(h => {
        if (!girByRound[dateKey]) girByRound[dateKey] = {};
        if (!girByRound[dateKey][h.approachClub]) girByRound[dateKey][h.approachClub] = { gir: 0, total: 0, L: 0, R: 0, Lg: 0, Sh: 0, sand: 0 };
        const c = girByRound[dateKey][h.approachClub];
        c.total++;
        if (h.gir) c.gir++;
        else {
          if (h.missDir === "L")  c.L++;
          if (h.missDir === "R")  c.R++;
          if (h.missDir === "Lg") c.Lg++;
          if (h.missDir === "Sh") c.Sh++;
          if (h.sand) c.sand++;
        }
      });
    });
    const girDates = Object.keys(girByRound).sort();
    const girApprClubs = [...new Set(allHoles.filter(h => h.approachClub).map(h => h.approachClub))];
    girApprClubs.sort((a, b) => {
      const ai = clubOrder.indexOf(a); const bi = clubOrder.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    const girChartData = girDates.map(date => {
      const row = { date };
      girApprClubs.forEach(club => {
        const d = girByRound[date][club];
        row[club] = d && d.total > 0 ? Math.round(d.gir / d.total * 100) : null;
        row[club + "_miss"] = d ? { L: d.L, R: d.R, Lg: d.Lg, Sh: d.Sh, sand: d.sand, total: d.total, gir: d.gir } : null;
      });
      return row;
    });

    // Club colours: cycle through palette
    const CLUB_COLORS = [BL, GN, OR, GL, TL, RD, PU, "#e040fb", "#26c6da", "#ff7043", "#66bb6a", "#ffa726", "#29b6f6", "#ec407a"];
    const clubColor = (clubs, i) => CLUB_COLORS[i % CLUB_COLORS.length];

    // -- FAIRWAYS BY TEE CLUB --
    const teeClubMap = {};
    allHoles.forEach(h => {
      if (!h.teeClub || h.par < 4) return;
      if (!teeClubMap[h.teeClub]) teeClubMap[h.teeClub] = { hit: 0, miss: 0, L: 0, R: 0, Sh: 0 };
      const c = teeClubMap[h.teeClub];
      if (h.fir === true)       { c.hit++; }
      else if (h.fir === false) {
        c.miss++;
        if (h.firMiss === "L")  c.L++;
        if (h.firMiss === "R")  c.R++;
        if (h.firMiss === "Sh") c.Sh++;
      }
    });
    const teeClubs = Object.entries(teeClubMap)
      .map(([club, d]) => ({ club, total: d.hit + d.miss, hit: d.hit, miss: d.miss, L: d.L, R: d.R, Sh: d.Sh, pct: d.hit + d.miss > 0 ? Math.round(d.hit / (d.hit + d.miss) * 100) : 0 }))
      .sort((a, b) => b.total - a.total);

    // -- GREENS BY APPROACH CLUB x DISTANCE BUCKET --
    const DIST_BUCKETS = [
      { label: "<85m",     min: 0,   max: 85,  club: "LW"    },
      { label: "85-107m",  min: 85,  max: 107, club: "SW"    },
      { label: "107-122m", min: 107, max: 122, club: "PW"    },
      { label: "122-135m", min: 122, max: 135, club: "9 Iron"},
      { label: "135-145m", min: 135, max: 145, club: "8 Iron"},
      { label: "145-155m", min: 145, max: 155, club: "7 Iron"},
      { label: "155-165m", min: 155, max: 165, club: "6 Iron"},
      { label: "165-175m", min: 165, max: 175, club: "5 Iron"},
      { label: "175-195m", min: 175, max: 195, club: "4 Iron"},
      { label: "195-215m", min: 195, max: 215, club: "Hybrid"},
      { label: ">215m",    min: 215, max: 9999,club: "4 Wood"},
    ];

    // apprClubBucket[club][bucketLabel] = { gir, total, L, R, Lg, Sh, sand }
    const apprClubBucket = {};
    allHoles.forEach(h => {
      if (!h.approachClub) return;
      const dist = h.distToHole;
      const bucket = dist > 0 ? DIST_BUCKETS.find(b => dist >= b.min && dist < b.max) : null;
      const bLabel = bucket ? bucket.label : "No dist";
      if (!apprClubBucket[h.approachClub]) apprClubBucket[h.approachClub] = {};
      if (!apprClubBucket[h.approachClub][bLabel]) apprClubBucket[h.approachClub][bLabel] = { gir: 0, total: 0, L: 0, R: 0, Lg: 0, Sh: 0, sand: 0 };
      const cell = apprClubBucket[h.approachClub][bLabel];
      cell.total++;
      if (h.gir) { cell.gir++; }
      else {
        if (h.missDir === "L")  cell.L++;
        if (h.missDir === "R")  cell.R++;
        if (h.missDir === "Lg") cell.Lg++;
        if (h.missDir === "Sh") cell.Sh++;
        if (h.sand) cell.sand++;
      }
    });

    // Also aggregate by distance bucket only (all clubs)
    const distBucketTotals = {};
    allHoles.forEach(h => {
      if (!h.approachClub) return;
      const dist = h.distToHole;
      const bucket = dist > 0 ? DIST_BUCKETS.find(b => dist >= b.min && dist < b.max) : null;
      if (!bucket) return;
      if (!distBucketTotals[bucket.label]) distBucketTotals[bucket.label] = { gir: 0, total: 0, L: 0, R: 0, Lg: 0, Sh: 0, sand: 0, clubs: {} };
      const cell = distBucketTotals[bucket.label];
      cell.total++;
      if (h.gir) cell.gir++;
      else {
        if (h.missDir === "L")  cell.L++;
        if (h.missDir === "R")  cell.R++;
        if (h.missDir === "Lg") cell.Lg++;
        if (h.missDir === "Sh") cell.Sh++;
        if (h.sand) cell.sand++;
      }
      if (h.approachClub) cell.clubs[h.approachClub] = (cell.clubs[h.approachClub] || 0) + 1;
    });

    const apprClubs = Object.keys(apprClubBucket).sort((a, b) => {
      const order = ["Driver","3W","5W","Hybrid","2i","3i","4i","5i","6i","7i","8i","9i","PW","GW","SW","LW","Putter"];
      return (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b));
    });

    const activeBuckets = DIST_BUCKETS.filter(b => apprClubs.some(c => apprClubBucket[c][b.label]));

    function girColor(pct) {
      if (pct === null) return T3;
      return pct >= 70 ? GN : pct >= 50 ? GL : pct >= 30 ? OR : RD;
    }
    function girBg(pct) {
      if (pct === null) return "transparent";
      return pct >= 70 ? GNL : pct >= 50 ? GLL : pct >= 30 ? ORL : RDL;
    }
    function missLabel(d) {
      const parts = [];
      if (d.L)    parts.push("L:" + d.L);
      if (d.R)    parts.push("R:" + d.R);
      if (d.Lg)   parts.push("Lng:" + d.Lg);
      if (d.Sh)   parts.push("Sh:" + d.Sh);
      if (d.sand) parts.push("Bkr:" + d.sand);
      return parts.join(" ");
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

        {/* Your Bag */}
        <Box>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T1 }}>Your Bag -- Carry Distances</div>
            <button onClick={() => setShowBag(v => !v)} style={{ background: C2, color: T2, border: "1px solid " + BD, borderRadius: 5, padding: "4px 12px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
              {showBag ? "Hide" : "Show"}
            </button>
          </div>
          {showBag && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px,1fr))", gap: 8 }}>
                {BAG.filter(c => c.carry > 0).map(c => {
                  const pct = Math.round(c.carry / 245 * 100);
                  return (
                    <div key={c.name} style={{ background: C2, border: "1px solid " + BD, borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <span style={{ fontWeight: 800, fontSize: 14, color: T1 }}>{c.name}</span>
                        <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: BL }}>{c.carry}m</span>
                      </div>
                      <div style={{ fontSize: 10, color: T3, marginBottom: 5 }}>Loft {c.loft}deg</div>
                      <div style={{ background: BD, borderRadius: 3, height: 5 }}>
                        <div style={{ width: pct + "%", background: BL, height: "100%", borderRadius: 3 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: T3 }}>
                All carry distances in metres. When entering rounds, the Dist column will suggest your best club automatically.
              </div>
            </div>
          )}
        </Box>

        {/* -- DRIVING ACCURACY ALL CLUBS -- */}
        <Box>
          <div style={{ fontSize: 15, fontWeight: 800, color: T1, marginBottom: 2 }}>Driving Accuracy Over Time -- All Clubs</div>
          <div style={{ color: T3, fontSize: 11, marginBottom: 12 }}>FIR% per round for every tee club used. Hover a point for miss breakdown. Only rounds where that club was used are shown.</div>
          {firChartData.length === 0 ? (
            <div style={{ color: T3, fontSize: 12, fontStyle: "italic" }}>No tee club data yet. Select clubs when logging rounds.</div>
          ) : (
            <div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={firChartData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke={BD} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fill: T3, fontSize: 9 }} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: T3, fontSize: 9 }} tickLine={false} tickFormatter={v => v + "%"} />
                  <ReferenceLine y={65} stroke={GL} strokeDasharray="5 4" label={{ value: "65% target", fill: GL, fontSize: 9, position: "insideTopRight" }} />
                  <Tooltip content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null;
                    const present = payload.filter(p => p.value != null);
                    if (!present.length) return null;
                    return (
                      <div style={{ background: CARD, border: "1px solid " + BD, borderRadius: 8, padding: "10px 14px", fontSize: 11, minWidth: 170 }}>
                        <div style={{ fontWeight: 800, color: T1, marginBottom: 6 }}>{label}</div>
                        {present.map((p, i) => {
                          const miss = payload[0].payload[p.name + "_miss"];
                          return (
                            <div key={i} style={{ marginBottom: 4 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                <span style={{ color: p.color, fontWeight: 700 }}>{p.name}</span>
                                <span style={{ fontFamily: "monospace", fontWeight: 700, color: p.value >= 65 ? GN : p.value >= 50 ? GL : RD }}>{p.value}%</span>
                              </div>
                              {miss && miss.total > 0 && (
                                <div style={{ color: T3, fontSize: 10 }}>
                                  {miss.hit}/{miss.total} FIR
                                  {(miss.L + miss.R + miss.Sh) > 0 && " | Miss: " + [miss.L?"L"+miss.L:null, miss.R?"R"+miss.R:null, miss.Sh?"Sh"+miss.Sh:null].filter(Boolean).join(" ")}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  }} />
                  {firTeeClubs.map((club, i) => {
                    const isActive = selFirClub === club;
                    const isDimmed = selFirClub !== null && !isActive;
                    return (
                      <Line key={club} dataKey={club}
                        stroke={clubColor(firTeeClubs, i)}
                        strokeWidth={isActive ? 3.5 : isDimmed ? 0.8 : 2}
                        strokeOpacity={isDimmed ? 0.2 : 1}
                        dot={isActive ? { r: 5, fill: clubColor(firTeeClubs, i), stroke: "#fff", strokeWidth: 2 } : isDimmed ? false : { r: 3, fill: clubColor(firTeeClubs, i), stroke: "#fff", strokeWidth: 1 }}
                        name={club}
                        connectNulls={false}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
              {/* Clickable legend */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, justifyContent: "center" }}>
                {firTeeClubs.map((club, i) => {
                  const isActive = selFirClub === club;
                  const isDimmed = selFirClub !== null && !isActive;
                  const col = clubColor(firTeeClubs, i);
                  return (
                    <button key={club} onClick={() => setSelFirClub(isActive ? null : club)}
                      style={{ display: "flex", alignItems: "center", gap: 6, background: isActive ? col + "22" : isDimmed ? C2 : CARD, border: "1.5px solid " + (isActive ? col : BD), borderRadius: 20, padding: "4px 12px", cursor: "pointer", opacity: isDimmed ? 0.4 : 1, transition: "all 0.12s", WebkitTapHighlightColor: "transparent" }}>
                      <div style={{ width: 20, height: 3, background: col, borderRadius: 2 }} />
                      <span style={{ fontSize: 11, fontWeight: isActive ? 800 : 600, color: isActive ? col : T1 }}>{club}</span>
                      {isActive && <span style={{ fontSize: 10, color: col }}>x</span>}
                    </button>
                  );
                })}
              </div>
              {selFirClub && (
                <div style={{ marginTop: 8, textAlign: "center", fontSize: 11, color: T2 }}>
                  Showing <b style={{ color: T1 }}>{selFirClub}</b> isolated --
                  <button onClick={() => setSelFirClub(null)} style={{ background: "none", border: "none", color: BL, cursor: "pointer", fontSize: 11, fontWeight: 700, padding: "0 4px", textDecoration: "underline" }}>show all</button>
                </div>
              )}
            </div>
          )}
        </Box>

        {/* -- GIR ALL APPROACH CLUBS OVER TIME -- */}
        <Box>
          <div style={{ fontSize: 15, fontWeight: 800, color: T1, marginBottom: 2 }}>Greens in Regulation Over Time -- All Clubs</div>
          <div style={{ color: T3, fontSize: 11, marginBottom: 12 }}>GIR% per round for every approach club. Hover for miss breakdown. Only rounds where that club was used are shown.</div>
          {girChartData.length === 0 ? (
            <div style={{ color: T3, fontSize: 12, fontStyle: "italic" }}>No approach club data yet. Select clubs when logging rounds.</div>
          ) : (
            <div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={girChartData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke={BD} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fill: T3, fontSize: 9 }} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: T3, fontSize: 9 }} tickLine={false} tickFormatter={v => v + "%"} />
                  <ReferenceLine y={70} stroke={GL} strokeDasharray="5 4" label={{ value: "70% target", fill: GL, fontSize: 9, position: "insideTopRight" }} />
                  <Tooltip content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null;
                    const present = payload.filter(p => p.value != null);
                    if (!present.length) return null;
                    return (
                      <div style={{ background: CARD, border: "1px solid " + BD, borderRadius: 8, padding: "10px 14px", fontSize: 11, minWidth: 170 }}>
                        <div style={{ fontWeight: 800, color: T1, marginBottom: 6 }}>{label}</div>
                        {present.map((p, i) => {
                          const miss = payload[0].payload[p.name + "_miss"];
                          return (
                            <div key={i} style={{ marginBottom: 4 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                <span style={{ color: p.color, fontWeight: 700 }}>{p.name}</span>
                                <span style={{ fontFamily: "monospace", fontWeight: 700, color: p.value >= 70 ? GN : p.value >= 50 ? GL : RD }}>{p.value}%</span>
                              </div>
                              {miss && miss.total > 0 && (
                                <div style={{ color: T3, fontSize: 10 }}>
                                  {miss.gir}/{miss.total} GIR
                                  {(miss.L + miss.R + miss.Lg + miss.Sh) > 0 && " | Miss: " + [miss.L?"L"+miss.L:null, miss.R?"R"+miss.R:null, miss.Lg?"Lng"+miss.Lg:null, miss.Sh?"Sh"+miss.Sh:null, miss.sand?"Bkr"+miss.sand:null].filter(Boolean).join(" ")}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  }} />
                  {girApprClubs.map((club, i) => {
                    const isActive = selGirClub === club;
                    const isDimmed = selGirClub !== null && !isActive;
                    return (
                      <Line key={club} dataKey={club}
                        stroke={clubColor(girApprClubs, i)}
                        strokeWidth={isActive ? 3.5 : isDimmed ? 0.8 : 2}
                        strokeOpacity={isDimmed ? 0.2 : 1}
                        dot={isActive ? { r: 5, fill: clubColor(girApprClubs, i), stroke: "#fff", strokeWidth: 2 } : isDimmed ? false : { r: 3, fill: clubColor(girApprClubs, i), stroke: "#fff", strokeWidth: 1 }}
                        name={club}
                        connectNulls={false}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
              {/* Clickable legend */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, justifyContent: "center" }}>
                {girApprClubs.map((club, i) => {
                  const isActive = selGirClub === club;
                  const isDimmed = selGirClub !== null && !isActive;
                  const col = clubColor(girApprClubs, i);
                  return (
                    <button key={club} onClick={() => setSelGirClub(isActive ? null : club)}
                      style={{ display: "flex", alignItems: "center", gap: 6, background: isActive ? col + "22" : isDimmed ? C2 : CARD, border: "1.5px solid " + (isActive ? col : BD), borderRadius: 20, padding: "4px 12px", cursor: "pointer", opacity: isDimmed ? 0.4 : 1, transition: "all 0.12s", WebkitTapHighlightColor: "transparent" }}>
                      <div style={{ width: 20, height: 3, background: col, borderRadius: 2 }} />
                      <span style={{ fontSize: 11, fontWeight: isActive ? 800 : 600, color: isActive ? col : T1 }}>{club}</span>
                      {isActive && <span style={{ fontSize: 10, color: col }}>x</span>}
                    </button>
                  );
                })}
              </div>
              {selGirClub && (
                <div style={{ marginTop: 8, textAlign: "center", fontSize: 11, color: T2 }}>
                  Showing <b style={{ color: T1 }}>{selGirClub}</b> isolated --
                  <button onClick={() => setSelGirClub(null)} style={{ background: "none", border: "none", color: BL, cursor: "pointer", fontSize: 11, fontWeight: 700, padding: "0 4px", textDecoration: "underline" }}>show all</button>
                </div>
              )}
            </div>
          )}
        </Box>

        <Box>
          <div style={{ fontSize: 15, fontWeight: 800, color: T1, marginBottom: 4 }}>Fairways Hit by Tee Club</div>
          <div style={{ color: T3, fontSize: 11, marginBottom: 12 }}>All rounds tracked. Miss direction shows where the ball goes when you miss the fairway.</div>
          {teeClubs.length === 0 ? (
            <div style={{ color: T3, fontSize: 12, fontStyle: "italic" }}>No tee club data recorded yet -- select clubs in the Log Round tab.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid " + BD, background: C2 }}>
                    {["Club","Rounds","FIR","FIR %","Miss L","Miss R","Miss Short","Miss Rate"].map(h => (
                      <th key={h} style={{ padding: "7px 10px", textAlign: "center", color: T2, fontWeight: 700, fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teeClubs.map(d => (
                    <tr key={d.club} style={{ borderBottom: "1px solid " + BD }}
                      onMouseEnter={e => e.currentTarget.style.background = BLL}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <td style={{ padding: "7px 10px", fontWeight: 700, color: T1, fontSize: 13 }}>{d.club}</td>
                      <td style={{ padding: "7px 10px", textAlign: "center", color: T2, fontFamily: "monospace" }}>{d.total}</td>
                      <td style={{ padding: "7px 10px", textAlign: "center", color: T2, fontFamily: "monospace" }}>{d.hit}</td>
                      <td style={{ padding: "7px 10px", textAlign: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, background: C2, borderRadius: 3, height: 8, border: "1px solid " + BD, minWidth: 60 }}>
                            <div style={{ width: d.pct + "%", background: girColor(d.pct), height: "100%", borderRadius: 3 }} />
                          </div>
                          <span style={{ fontFamily: "monospace", fontWeight: 700, color: girColor(d.pct), minWidth: 34, textAlign: "right" }}>{d.pct}%</span>
                        </div>
                      </td>
                      <td style={{ padding: "7px 10px", textAlign: "center", color: d.L > 0 ? BL : T3, fontFamily: "monospace", fontWeight: d.L > 0 ? 700 : 400 }}>{d.L > 0 ? d.L + "x" : "--"}</td>
                      <td style={{ padding: "7px 10px", textAlign: "center", color: d.R > 0 ? OR : T3, fontFamily: "monospace", fontWeight: d.R > 0 ? 700 : 400 }}>{d.R > 0 ? d.R + "x" : "--"}</td>
                      <td style={{ padding: "7px 10px", textAlign: "center", color: d.Sh > 0 ? RD : T3, fontFamily: "monospace", fontWeight: d.Sh > 0 ? 700 : 400 }}>{d.Sh > 0 ? d.Sh + "x" : "--"}</td>
                      <td style={{ padding: "7px 10px", textAlign: "center", color: d.miss > 0 ? RD : GN, fontFamily: "monospace" }}>{d.miss > 0 ? d.miss + "x" : "Clean"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Box>

        {/* -- GIR BY DISTANCE BUCKET (all clubs) -- */}
        <Box>
        {/* GREEN MISS VISUALISER */}
        {(() => {
          const r20 = last(20);
          const allH = r20.flatMap(r => r.holes || []);
          const total  = allH.length;
          const girCnt = allH.filter(h => h.gir).length;
          const missH  = allH.filter(h => !h.gir);
          const missTotal = missH.length || 1;
          const L  = missH.filter(h => h.missDir === "L").length;
          const R  = missH.filter(h => h.missDir === "R").length;
          const Lg = missH.filter(h => h.missDir === "Lg").length;
          const Sh = missH.filter(h => h.missDir === "Sh").length;
          const girPct = total > 0 ? Math.round(girCnt / total * 100) : 0;

          // Chip vs bunker toggle data
          const chipAtts   = r20.reduce((s,r) => s + (r.chipAtt   || 0), 0);
          const chipMade   = r20.reduce((s,r) => s + (r.chipMade  || 0), 0);
          const bunkerAtts = r20.reduce((s,r) => s + (r.bunkerAtt || 0), 0);
          const bunkerMade = r20.reduce((s,r) => s + (r.bunkerMade|| 0), 0);
          const chipPct    = chipAtts   > 0 ? Math.round(chipMade   / chipAtts   * 100) : null;
          const bunkerPct  = bunkerAtts > 0 ? Math.round(bunkerMade / bunkerAtts * 100) : null;

          const sz = 280; const cx = sz/2; const cy = sz/2;
          const rGreen = 68; const rRough = 110;

          // intensity for direction shading
          const maxCnt = Math.max(L, R, Lg, Sh, 1);
          const shade = (cnt) => Math.round(30 + (cnt / maxCnt) * 160);

          return (
            <Box style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: T1, marginBottom: 4 }}>Miss Direction Visualiser -- Last 20 Rounds</div>
              <div style={{ color: T3, fontSize: 11, marginBottom: 14 }}>Based on all approach shots missed. Darker = more misses in that zone. GIR shown in centre.</div>

              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 28, alignItems: "center" }}>

                {/* SVG Green */}
                <svg width={sz} height={sz} viewBox={"0 0 " + sz + " " + sz} style={{ display: "block" }}>
                  {/* rough background */}
                  <ellipse cx={cx} cy={cy} rx={rRough+8} ry={rRough+8} fill="#c8dfc8" />

                  {/* MISS ZONES -- ellipse segments via clip paths */}
                  {/* Long */}
                  <clipPath id="clipLg">
                    <rect x={0} y={0} width={sz} height={cy} />
                  </clipPath>
                  <ellipse cx={cx} cy={cy} rx={rRough} ry={rRough} fill={"rgb("+shade(Lg)+",80,60)"} fillOpacity={0.65} clipPath="url(#clipLg)" />

                  {/* Short */}
                  <clipPath id="clipSh">
                    <rect x={0} y={cy} width={sz} height={cy} />
                  </clipPath>
                  <ellipse cx={cx} cy={cy} rx={rRough} ry={rRough} fill={"rgb("+shade(Sh)+",80,60)"} fillOpacity={0.65} clipPath="url(#clipSh)" />

                  {/* Left */}
                  <clipPath id="clipL">
                    <rect x={0} y={0} width={cx} height={sz} />
                  </clipPath>
                  <ellipse cx={cx} cy={cy} rx={rRough} ry={rRough} fill={"rgb(60,80,"+shade(L)+")"} fillOpacity={0.55} clipPath="url(#clipL)" />

                  {/* Right */}
                  <clipPath id="clipR">
                    <rect x={cx} y={0} width={cx} height={sz} />
                  </clipPath>
                  <ellipse cx={cx} cy={cy} rx={rRough} ry={rRough} fill={"rgb(60,80,"+shade(R)+")"} fillOpacity={0.55} clipPath="url(#clipR)" />

                  {/* Division lines */}
                  <line x1={cx} y1={cy - rRough - 10} x2={cx} y2={cy + rRough + 10} stroke="rgba(255,255,255,0.4)" strokeWidth={1} strokeDasharray="4 3" />
                  <line x1={cx - rRough - 10} y1={cy} x2={cx + rRough + 10} y2={cy} stroke="rgba(255,255,255,0.4)" strokeWidth={1} strokeDasharray="4 3" />

                  {/* Green surface */}
                  <ellipse cx={cx} cy={cy} rx={rGreen} ry={rGreen} fill="#2d9e5f" stroke="rgba(255,255,255,0.6)" strokeWidth={1.5} />

                  {/* Pin */}
                  <line x1={cx} y1={cy - rGreen + 6} x2={cx} y2={cy - rGreen - 22} stroke="#ccc" strokeWidth={1.5} />
                  <polygon points={cx+","+( cy-rGreen-22)+" "+(cx+12)+","+(cy-rGreen-14)+" "+cx+","+(cy-rGreen-6)} fill={RD} />

                  {/* GIR centre text */}
                  <text x={cx} y={cy - 8} textAnchor="middle" style={{ fill: "#fff", fontSize: 22, fontWeight: 800, fontFamily: "monospace" }}>{girPct}%</text>
                  <text x={cx} y={cy + 8} textAnchor="middle" style={{ fill: "rgba(255,255,255,0.85)", fontSize: 10, fontWeight: 600 }}>GIR</text>
                  <text x={cx} y={cy + 20} textAnchor="middle" style={{ fill: "rgba(255,255,255,0.7)", fontSize: 9 }}>{girCnt}/{total}</text>

                  {/* Direction labels */}
                  <text x={cx} y={cy - rRough - 16} textAnchor="middle" style={{ fill: T1, fontSize: 12, fontWeight: 800 }}>LONG</text>
                  <text x={cx} y={cy - rRough - 5}  textAnchor="middle" style={{ fill: T1, fontSize: 13, fontFamily: "monospace", fontWeight: 700 }}>{Lg}x</text>
                  <text x={cx} y={cy + rRough + 22}  textAnchor="middle" style={{ fill: T1, fontSize: 12, fontWeight: 800 }}>SHORT</text>
                  <text x={cx} y={cy + rRough + 11}  textAnchor="middle" style={{ fill: T1, fontSize: 13, fontFamily: "monospace", fontWeight: 700 }}>{Sh}x</text>
                  <text x={cx - rRough - 14} y={cy + 5}  textAnchor="middle" style={{ fill: T1, fontSize: 12, fontWeight: 800 }}>LEFT</text>
                  <text x={cx - rRough - 14} y={cy + 16} textAnchor="middle" style={{ fill: T1, fontSize: 13, fontFamily: "monospace", fontWeight: 700 }}>{L}x</text>
                  <text x={cx + rRough + 14} y={cy + 5}  textAnchor="middle" style={{ fill: T1, fontSize: 12, fontWeight: 800 }}>RIGHT</text>
                  <text x={cx + rRough + 14} y={cy + 16} textAnchor="middle" style={{ fill: T1, fontSize: 13, fontFamily: "monospace", fontWeight: 700 }}>{R}x</text>
                </svg>

                {/* Stats panel */}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                  {/* Miss count summary */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T2, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Miss Breakdown</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {[["Long", Lg, OR], ["Short", Sh, RD], ["Left", L, BL], ["Right", R, TL]].map(([dir, cnt, col]) => (
                        <div key={dir} style={{ background: C2, border: "1px solid " + BD, borderRadius: 8, padding: "10px 12px" }}>
                          <div style={{ fontSize: 11, color: T2, fontWeight: 700, marginBottom: 3 }}>{dir}</div>
                          <div style={{ fontFamily: "monospace", fontSize: 26, fontWeight: 800, color: cnt > 0 ? col : T3 }}>{cnt}x</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Chip vs Bunker U&D */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T2, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Up and Down Split</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

                      {/* Chip */}
                      <div style={{ background: chipPct !== null && chipPct >= 65 ? GNL : chipPct !== null && chipPct >= 50 ? GLL : C2, border: "1px solid " + BD, borderRadius: 8, padding: "10px 14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <div style={{ width: 10, height: 10, borderRadius: "50%", background: OR }} />
                            <span style={{ fontSize: 13, fontWeight: 800, color: T1 }}>Chip / Pitch</span>
                          </div>
                          <span style={{ fontFamily: "monospace", fontWeight: 900, fontSize: 20, color: chipPct !== null ? (chipPct >= 65 ? GN : chipPct >= 50 ? GL : RD) : T3 }}>
                            {chipPct !== null ? chipPct + "%" : "--"}
                          </span>
                        </div>
                        <div style={{ background: "rgba(255,255,255,0.5)", borderRadius: 3, height: 6, marginBottom: 4 }}>
                          <div style={{ width: (chipPct || 0) + "%", background: chipPct >= 65 ? GN : chipPct >= 50 ? GL : OR, height: "100%", borderRadius: 3 }} />
                        </div>
                        <div style={{ fontSize: 10, color: T2 }}>{chipMade}/{chipAtts} saved &nbsp; target: <span style={{ color: GL, fontWeight: 600 }}>65%</span></div>
                      </div>

                      {/* Bunker */}
                      <div style={{ background: bunkerPct !== null && bunkerPct >= 55 ? GNL : bunkerPct !== null && bunkerPct >= 40 ? GLL : C2, border: "1px solid " + BD, borderRadius: 8, padding: "10px 14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <div style={{ width: 10, height: 10, borderRadius: "50%", background: GL }} />
                            <span style={{ fontSize: 13, fontWeight: 800, color: T1 }}>Bunker Save</span>
                          </div>
                          <span style={{ fontFamily: "monospace", fontWeight: 900, fontSize: 20, color: bunkerPct !== null ? (bunkerPct >= 55 ? GN : bunkerPct >= 40 ? GL : RD) : T3 }}>
                            {bunkerPct !== null ? bunkerPct + "%" : "--"}
                          </span>
                        </div>
                        <div style={{ background: "rgba(255,255,255,0.5)", borderRadius: 3, height: 6, marginBottom: 4 }}>
                          <div style={{ width: (bunkerPct || 0) + "%", background: bunkerPct >= 55 ? GN : bunkerPct >= 40 ? GL : RD, height: "100%", borderRadius: 3 }} />
                        </div>
                        <div style={{ fontSize: 10, color: T2 }}>{bunkerMade}/{bunkerAtts} saved &nbsp; target: <span style={{ color: GL, fontWeight: 600 }}>55%</span></div>
                      </div>

                    </div>
                  </div>

                  <div style={{ fontSize: 10, color: T3, lineHeight: 1.5 }}>
                    Log chip/bunker type in the U/D column when entering rounds to build this split over time.
                  </div>
                </div>
              </div>
            </Box>
          );
        })()}


                  <div style={{ fontSize: 15, fontWeight: 800, color: T1, marginBottom: 4 }}>GIR by Distance Bucket (All Clubs)</div>
          <div style={{ color: T3, fontSize: 11, marginBottom: 12 }}>Overall green-hitting performance by distance. Shows most-used club in each band and dominant miss pattern.</div>
          {Object.keys(distBucketTotals).length === 0 ? (
            <div style={{ color: T3, fontSize: 12, fontStyle: "italic" }}>No approach distance data yet -- enter distance to hole in the Log Round tab.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))", gap: 10 }}>
              {DIST_BUCKETS.filter(b => distBucketTotals[b.label]).map(b => {
                const d = distBucketTotals[b.label];
                const pct = d.total > 0 ? Math.round(d.gir / d.total * 100) : 0;
                const topClub = Object.entries(d.clubs).sort((a,z) => z[1]-a[1])[0];
                const miss = missLabel(d);
                return (
                  <div key={b.label} style={{ background: girBg(pct), border: "1px solid " + BD, borderRadius: 8, padding: "12px 14px" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T2, marginBottom: 2 }}>{b.label}</div>
                    {b.club && <div style={{ fontSize: 10, color: T3, marginBottom: 5 }}>Typical: {b.club}</div>}
                    <div style={{ fontFamily: "monospace", fontSize: 30, fontWeight: 800, color: girColor(pct), lineHeight: 1 }}>{pct}%</div>
                    <div style={{ fontSize: 10, color: T3, marginTop: 2, marginBottom: 8 }}>GIR ({d.gir}/{d.total} holes)</div>
                    {topClub && <div style={{ fontSize: 11, color: T1, marginBottom: 4 }}>Top club: <b>{topClub[0]}</b> ({topClub[1]}x)</div>}
                    {miss && <div style={{ fontSize: 10, color: OR, fontFamily: "monospace" }}>{miss}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </Box>

        {/* -- GIR BY APPROACH CLUB x DISTANCE -- */}
        <Box>
          <div style={{ fontSize: 15, fontWeight: 800, color: T1, marginBottom: 4 }}>GIR % by Club and Distance</div>
          <div style={{ color: T3, fontSize: 11, marginBottom: 12 }}>Green hit rate per club in each distance band. Red = below 50%, amber = 50-69%, green = 70%+. Miss codes: L=Left, R=Right, Lng=Long, Sh=Short, Bkr=Bunker.</div>
          {apprClubs.length === 0 ? (
            <div style={{ color: T3, fontSize: 12, fontStyle: "italic" }}>No approach club data yet -- select approach clubs in the Log Round tab.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid " + BD, background: C2 }}>
                    <th style={{ padding: "7px 10px", textAlign: "left", color: T2, fontWeight: 700, whiteSpace: "nowrap", minWidth: 60 }}>Club</th>
                    <th style={{ padding: "7px 10px", textAlign: "center", color: T2, fontWeight: 700 }}>Total</th>
                    <th style={{ padding: "7px 10px", textAlign: "center", color: T2, fontWeight: 700 }}>Overall GIR%</th>
                    {activeBuckets.map(b => (
                      <th key={b.label} style={{ padding: "7px 8px", textAlign: "center", color: T2, fontWeight: 700, whiteSpace: "nowrap", fontSize: 10 }}>
                        <div>{b.label}</div>
                        {b.club && <div style={{ color: T3, fontWeight: 400, fontSize: 9 }}>{b.club}</div>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {apprClubs.map(club => {
                    const allForClub = Object.values(apprClubBucket[club]).reduce((acc, d) => ({ gir: acc.gir + d.gir, total: acc.total + d.total, L: acc.L + d.L, R: acc.R + d.R, Lg: acc.Lg + d.Lg, Sh: acc.Sh + d.Sh, sand: acc.sand + d.sand }), { gir: 0, total: 0, L: 0, R: 0, Lg: 0, Sh: 0, sand: 0 });
                    const overallPct = allForClub.total > 0 ? Math.round(allForClub.gir / allForClub.total * 100) : null;
                    return (
                      <tr key={club} style={{ borderBottom: "1px solid " + BD }}
                        onMouseEnter={e => e.currentTarget.style.background = BLL}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td style={{ padding: "6px 10px", fontWeight: 700, color: T1, fontSize: 12 }}>{club}</td>
                        <td style={{ padding: "6px 10px", textAlign: "center", color: T2, fontFamily: "monospace" }}>{allForClub.total}</td>
                        <td style={{ padding: "6px 10px", textAlign: "center" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <div style={{ width: 44, background: C2, borderRadius: 3, height: 7, border: "1px solid " + BD }}>
                              <div style={{ width: (overallPct || 0) + "%", background: girColor(overallPct), height: "100%", borderRadius: 3 }} />
                            </div>
                            <span style={{ fontFamily: "monospace", fontWeight: 700, color: girColor(overallPct) }}>{overallPct !== null ? overallPct + "%" : "--"}</span>
                          </div>
                        </td>
                        {activeBuckets.map(b => {
                          const cell = apprClubBucket[club][b.label];
                          if (!cell) return <td key={b.label} style={{ padding: "6px 8px", textAlign: "center", color: T3 }}>--</td>;
                          const pct = cell.total > 0 ? Math.round(cell.gir / cell.total * 100) : 0;
                          const miss = missLabel(cell);
                          return (
                            <td key={b.label} style={{ padding: "4px 6px", textAlign: "center", background: girBg(pct), verticalAlign: "top" }}>
                              <div style={{ fontFamily: "monospace", fontWeight: 700, color: girColor(pct), fontSize: 13 }}>{pct}%</div>
                              <div style={{ color: T3, fontSize: 9 }}>{cell.gir}/{cell.total}</div>
                              {miss && <div style={{ color: OR, fontSize: 9, fontFamily: "monospace", marginTop: 1 }}>{miss}</div>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Box>

      </div>
    );
  }

  // -- TRENDS --
  function Trends() {
    if (!rSG.length) return <div style={{ color: T3, padding: 40, textAlign: "center" }}>No rounds yet.</div>;
    const td = last(20).map(r => ({
      date: (r.date||"").slice(5), score: r.score,
      fir:  r.fairwaysTotal > 0 ? parseFloat((r.fairwaysHit/r.fairwaysTotal*100).toFixed(1)) : null,
      gir:  parseFloat((r.girsHit/18*100).toFixed(1)),
      putts: r.totalPutts, prox: r.avgProxFt, drive: r.avgDrive,
      scr:  r.udAttempts > 0 ? parseFloat((r.udMade/r.udAttempts*100).toFixed(1)) : null,
      haz:  r.hazards || 0,
    }));
    const C = ({ k, c, ref1, n }) => (
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={td} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
          <CartesianGrid stroke={BD} strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fill: T3, fontSize: 9 }} tickLine={false} />
          <YAxis domain={["auto","auto"]} tick={{ fill: T3, fontSize: 9 }} tickLine={false} />
          <Tooltip content={<TT />} />
          {ref1 && <ReferenceLine y={ref1} stroke={GL} strokeDasharray="4 4" />}
          <Line dataKey={k} stroke={c} strokeWidth={2} dot={{ r: 2, fill: c }} name={n||k} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    );
    const lagData = last(20).map(r => ({
      date: (r.date||"").slice(5),
      threePutt: r.threePutts || 0,
      onePutt: r.onePutts || 0,
    }));
    const puttBands = [2,3,4,5,6,7,8,10];
    const puttMakeData = puttBands.map(dist => {
      const allH = last(20).flatMap(r => (r.holes||[]).filter(h => h.gir && h.puttDist && Math.round(h.puttDist) === dist));
      return { dist: dist + "m", pct: allH.length >= 2 ? Math.round(allH.filter(h=>h.putts===1).length/allH.length*100) : null, n: allH.length };
    }).filter(d => d.n >= 1);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Box><Lbl t="Fairways in Regulation %" /><C k="fir" c={BL} ref1={65} n="FIR%" /></Box>
          <Box><Lbl t="Greens in Regulation %"   /><C k="gir" c={GN} ref1={74} n="GIR%" /></Box>
          <Box><Lbl t="Driving Distance (m)"      /><C k="drive" c={OR} ref1={244} n="Drive (m)" /></Box>
          <Box><Lbl t="Total Putts"               /><C k="putts" c={GL} ref1={28} n="Putts" /></Box>
          <Box><Lbl t="Avg Proximity (m)"          /><C k="prox" c={TL} ref1={16} n="Prox (m)" /></Box>
          <Box><Lbl t="Scrambling %"              /><C k="scr"  c={GN} ref1={65} n="Scrambling%" /></Box>
          <Box><Lbl t="Hazards / Round"           /><C k="haz"  c={RD} ref1={1}  n="Hazards" /></Box>
          <Box>
            <Lbl t="3-Putts and 1-Putts per Round" />
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={lagData} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid stroke={BD} strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: T3, fontSize: 9 }} tickLine={false} />
                <YAxis tick={{ fill: T3, fontSize: 9 }} tickLine={false} />
                <Tooltip content={<TT />} />
                <ReferenceLine y={2} stroke={RD} strokeDasharray="4 4" />
                <Line dataKey="threePutt" stroke={RD} strokeWidth={2} dot={{ r: 2 }} name="3-Putts" connectNulls />
                <Line dataKey="onePutt" stroke={GN} strokeWidth={2} dot={{ r: 2 }} name="1-Putts" connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </div>
        {puttMakeData.length >= 2 && (
          <Box>
            <Lbl t="Putt Make % by Distance" />
            <div style={{ color: T3, fontSize: 11, marginBottom: 10 }}>Enter first putt distance in 1st Putt m column. Needs 2+ data points per distance.</div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              {puttMakeData.map(d => {
                const c = d.pct >= 80 ? GN : d.pct >= 50 ? GL : d.pct >= 30 ? OR : RD;
                return (
                  <div key={d.dist} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: c, fontFamily: "monospace" }}>{d.pct !== null ? d.pct + "%" : "--"}</div>
                    <div style={{ width: "100%", background: C2, border: "1px solid " + BD, borderRadius: 4, overflow: "hidden", height: 60, display: "flex", alignItems: "flex-end" }}>
                      <div style={{ width: "100%", height: (d.pct || 0) + "%", background: c, opacity: 0.8 }} />
                    </div>
                    <div style={{ fontSize: 10, color: T2, fontWeight: 600 }}>{d.dist}</div>
                    <div style={{ fontSize: 9, color: T3 }}>{d.n}x</div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 10 }}>
              {[["Tour 3m","90%",GN],["Tour 6m","60%",GL],["Tour 10m","35%",OR]].map(([l,v,c]) => (
                <div key={l} style={{ color: T2 }}>{l}: <span style={{ color: c, fontWeight: 700 }}>{v}</span></div>
              ))}
            </div>
          </Box>
        )}
      </div>
    );
  }

  // -- INSIGHTS --
  function PracticeLog() {
    const AREAS = ["Putting","Chipping","Bunker","Approach","Driver","Iron Play","Mental","Fitness","Course Management"];
    const logs = practiceLogs;

    function savePractice() {
      if (!practiceForm.drill.trim()) return;
      setPracticeLogs(p => [...p, { ...practiceForm, id: Date.now() }]);
      setPracticeForm(f => ({ ...f, drill: "", made: null, att: null, notes: "", duration: 30 }));
    }

    // Stats per area
    const areaStats = AREAS.map(area => {
      const sessions = logs.filter(l => l.area === area);
      const totalMins = sessions.reduce((s,l) => s+(l.duration||0), 0);
      const withConv = sessions.filter(l => l.made !== null && l.att !== null && l.att > 0);
      const convPct = withConv.length ? Math.round(withConv.reduce((s,l) => s+l.made/l.att, 0)/withConv.length*100) : null;
      return { area, sessions: sessions.length, totalMins, convPct };
    }).filter(a => a.sessions > 0);

    // Time allocation chart data (last 30 days)
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const recent30 = logs.filter(l => new Date(l.date) >= cutoff);
    const allocData = AREAS.map(area => ({
      area, mins: recent30.filter(l=>l.area===area).reduce((s,l)=>s+(l.duration||0),0)
    })).filter(d => d.mins > 0).sort((a,b)=>b.mins-a.mins);

    // Weakness from SG
    const weakArea = s10 ? [
      { area: "Putting",    sg: s10.sgPutt || 0 },
      { area: "Chipping",   sg: s10.sgATG  || 0 },
      { area: "Approach",   sg: s10.sgApp  || 0 },
      { area: "Driver",     sg: s10.sgOTT  || 0 },
    ].sort((a,b) => a.sg - b.sg)[0] : null;

    const inp = { background: CARD, color: T1, border: "1px solid " + BD, borderRadius: 5, padding: "7px 9px", fontSize: 13, outline: "none", fontFamily: "inherit" };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Priority from SG */}
        {weakArea && (
          <Box style={{ borderLeft: "4px solid " + RD, background: RDL }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: RD, marginBottom: 4 }}>Current Practice Priority</div>
            <div style={{ fontSize: 13, color: T1 }}>
              Based on your last {WINDOWS.find(w=>w.n===10).label} SG data, your biggest gain is in <b>{weakArea.area}</b> (SG: {weakArea.sg > 0 ? "+" : ""}{weakArea.sg.toFixed(2)}).
              {allocData.length > 0 && allocData[0].area !== weakArea.area && (
                <span style={{ color: RD }}> You have been spending most time on <b>{allocData[0].area}</b> -- consider rebalancing.</span>
              )}
            </div>
          </Box>
        )}

        {/* Log session form */}
        <Box>
          <div style={{ fontSize: 15, fontWeight: 800, color: T1, marginBottom: 12 }}>Log Practice Session</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: 10, marginBottom: 10 }}>
            <div>
              <Lbl t="Date" />
              <input type="date" value={practiceForm.date} onChange={e => setPracticeForm(f=>({...f,date:e.target.value}))} style={{ ...inp, width: "100%" }} />
            </div>
            <div>
              <Lbl t="Area" />
              <select value={practiceForm.area} onChange={e => setPracticeForm(f=>({...f,area:e.target.value}))} style={{ ...inp, width: "100%", cursor: "pointer" }}>
                {AREAS.map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <Lbl t="Mins" />
              <input type="number" value={practiceForm.duration} min={5} step={5} onChange={e=>setPracticeForm(f=>({...f,duration:+e.target.value||30}))} style={{ ...inp, width: "100%" }} />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <Lbl t="Drill / Focus" />
            <input type="text" value={practiceForm.drill} placeholder="e.g. Gate drill 6ft -- 10 in a row" onChange={e=>setPracticeForm(f=>({...f,drill:e.target.value}))} style={{ ...inp, width: "100%" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "80px 80px 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <Lbl t="Made" />
              <input type="number" value={practiceForm.made ?? ""} min={0} placeholder="--" onChange={e=>setPracticeForm(f=>({...f,made:e.target.value===""?null:+e.target.value}))} style={{ ...inp, width: "100%" }} />
            </div>
            <div>
              <Lbl t="Attempts" />
              <input type="number" value={practiceForm.att ?? ""} min={0} placeholder="--" onChange={e=>setPracticeForm(f=>({...f,att:e.target.value===""?null:+e.target.value}))} style={{ ...inp, width: "100%" }} />
            </div>
            {practiceForm.made !== null && practiceForm.att > 0 && (
              <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 4 }}>
                <span style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 800, color: (practiceForm.made/practiceForm.att) >= 0.8 ? GN : GL }}>
                  {Math.round(practiceForm.made/practiceForm.att*100)}% conversion
                </span>
              </div>
            )}
          </div>
          <div style={{ marginBottom: 12 }}>
            <Lbl t="Notes" />
            <textarea value={practiceForm.notes} onChange={e=>setPracticeForm(f=>({...f,notes:e.target.value}))} placeholder="Key learnings, feels, drills to repeat..." rows={2}
              style={{ ...inp, width: "100%", resize: "vertical" }} />
          </div>
          <button onClick={savePractice} style={{ background: BL, color: "#fff", border: "none", borderRadius: 7, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Save Session
          </button>
        </Box>

        {/* Time allocation pie / bars */}
        {allocData.length > 0 && (
          <Box>
            <Lbl t="Practice Allocation (last 30 days)" />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {allocData.map((d, i) => {
                const maxMins = allocData[0].mins;
                const c = CLUB_COLORS[i % CLUB_COLORS.length];
                const isWeak = weakArea && d.area === weakArea.area;
                return (
                  <div key={d.area} style={{ display: "grid", gridTemplateColumns: "130px 1fr 50px", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: T1, fontWeight: isWeak ? 800 : 500 }}>
                      {d.area}{isWeak && " *"}
                    </span>
                    <div style={{ background: C2, borderRadius: 3, height: 10 }}>
                      <div style={{ width: (d.mins/maxMins*100) + "%", background: c, height: "100%", borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 11, color: T2, fontFamily: "monospace" }}>{d.mins}m</span>
                  </div>
                );
              })}
            </div>
            {weakArea && <div style={{ fontSize: 10, color: RD, marginTop: 6 }}>* = SG-identified priority area</div>}
          </Box>
        )}

        {/* Per-area stats */}
        {areaStats.length > 0 && (
          <Box>
            <Lbl t="Practice Stats by Area (all time)" />
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid " + BD, background: C2 }}>
                    {["Area","Sessions","Total Time","Conversion %","Last Session"].map(h => (
                      <th key={h} style={{ padding: "7px 10px", textAlign: "left", color: T2, fontWeight: 700, fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {areaStats.map(a => {
                    const last = [...logs].reverse().find(l => l.area === a.area);
                    const hrs = Math.floor(a.totalMins/60);
                    const mins = a.totalMins % 60;
                    return (
                      <tr key={a.area} style={{ borderBottom: "1px solid " + BD }}
                        onMouseEnter={e=>e.currentTarget.style.background=C2}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <td style={{ padding: "7px 10px", color: T1, fontWeight: 700 }}>{a.area}</td>
                        <td style={{ padding: "7px 10px", color: T2, fontFamily: "monospace" }}>{a.sessions}</td>
                        <td style={{ padding: "7px 10px", color: T2, fontFamily: "monospace" }}>{hrs > 0 ? hrs + "h " : ""}{mins}m</td>
                        <td style={{ padding: "7px 10px", fontFamily: "monospace", color: a.convPct !== null ? (a.convPct >= 80 ? GN : a.convPct >= 60 ? GL : RD) : T3, fontWeight: 600 }}>
                          {a.convPct !== null ? a.convPct + "%" : "--"}
                        </td>
                        <td style={{ padding: "7px 10px", color: T2, fontSize: 11 }}>{last ? last.date + " -- " + last.drill : "--"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Box>
        )}

        {/* Session history */}
        {logs.length > 0 && (
          <Box>
            <Lbl t="Recent Sessions" />
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
              {[...logs].reverse().slice(0, 10).map(l => (
                <div key={l.id} style={{ background: C2, borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 12, color: T1, fontWeight: 700 }}>{l.area} -- {l.drill}</div>
                    <div style={{ fontSize: 10, color: T3, marginTop: 2 }}>{l.date} | {l.duration}min{l.made !== null && l.att > 0 ? " | " + l.made + "/" + l.att + " (" + Math.round(l.made/l.att*100) + "%)" : ""}</div>
                    {l.notes && <div style={{ fontSize: 11, color: T2, marginTop: 3 }}>{l.notes}</div>}
                  </div>
                  <button onClick={() => setPracticeLogs(p => p.filter(x=>x.id!==l.id))} style={{ background: "none", border: "none", color: RD, cursor: "pointer", fontSize: 11, flexShrink: 0, marginLeft: 8 }}>Del</button>
                </div>
              ))}
            </div>
          </Box>
        )}

        {logs.length === 0 && (
          <Box>
            <div style={{ color: T3, textAlign: "center", padding: "20px 0", fontSize: 13 }}>No practice sessions logged yet. Log sessions above to track your practice investment against on-course results.</div>
          </Box>
        )}
      </div>
    );
  }

  function Insights() {
    if (!s10) return <div style={{ color: T3, padding: 40, textAlign: "center" }}>Log at least 5 rounds to generate insights.</div>;
    const [condFilter, setCondFilter] = useState(null);
    const [windFilter, setWindFilter] = useState(null);
    const filteredRounds = last(20).filter(r =>
      (!condFilter || r.conditions === condFilter) &&
      (!windFilter  || r.wind      === windFilter)
    );
    const condStats = filteredRounds.length >= 3 ? {
      score: ravg(filteredRounds, "score"),
      gir:   parseFloat((filteredRounds.reduce((s,r)=>s+r.girsHit/18,0)/filteredRounds.length*100).toFixed(1)),
      putts: ravg(filteredRounds, "totalPutts"),
      sgT:   ravg(filteredRounds, "sgTotal"),
    } : null;

    const cats = [
      { name: "Off the Tee",    sg: s10.sgOTT, p2: 0.18, tips: ["Play to your miss width off tee -- avoid short-side danger (DECADE)", "10 extra yards = approx +0.08 SG -- distance gains are free shots", "Use Hole Analysis tab to find which holes your tee club is costing you"] },
      { name: "Approach Play",  sg: s10.sgApp, p2: 0.32, tips: ["Every foot of proximity gained = approx +0.012 SG App", "At +2: target under 18ft avg from 150y -- check your distance-to-hole data", "Aim centre-to-fat side away from trouble (DECADE principle)"] },
      { name: "Around Green",   sg: s10.sgATG, p2: 0.12, tips: ["65%+ scrambling is the +2 baseline -- check your worst 6 holes", "Choose highest-percentage shot -- putt before chip before pitch", "Eliminate 3-putts from off-green with lag approach"] },
      { name: "Putting",        sg: s10.sgPutt,p2: 0.10, tips: ["Limit 3-putts to under 2 per round", "Average first putt under 20ft is the +2 proximity target", "6ft gate drill (10 in a row) -- builds the stroke needed at +2"] },
    ].sort((a, b) => (parseFloat(a.sg)||0) - (parseFloat(b.sg)||0));
    const pc  = i => [RD, OR, GL, GN][i];
    const pcl = i => [RDL, ORL, GLL, GNL][i];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Conditions filter */}
        <Box>
          <Lbl t="Filter by Conditions (last 20 rounds)" />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: condStats ? 12 : 0 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: T2, fontWeight: 600 }}>Wind:</span>
              {[null,"calm","light","moderate","strong"].map(v => (
                <button key={v??""} onClick={() => setWindFilter(v)}
                  style={{ background: windFilter===v ? BL : C2, color: windFilter===v ? "#fff" : T2, border: "1px solid " + (windFilter===v ? BL : BD), borderRadius: 4, padding: "3px 10px", fontSize: 11, cursor: "pointer", fontWeight: windFilter===v ? 700 : 400 }}>
                  {v ?? "All"}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: T2, fontWeight: 600 }}>Course:</span>
              {[null,"firm","normal","soft"].map(v => (
                <button key={v??""} onClick={() => setCondFilter(v)}
                  style={{ background: condFilter===v ? BL : C2, color: condFilter===v ? "#fff" : T2, border: "1px solid " + (condFilter===v ? BL : BD), borderRadius: 4, padding: "3px 10px", fontSize: 11, cursor: "pointer", fontWeight: condFilter===v ? 700 : 400 }}>
                  {v ?? "All"}
                </button>
              ))}
            </div>
          </div>
          {condStats && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 8 }}>
              {[["Avg Score", condStats.score, ""], ["GIR%", condStats.gir, "%"], ["Putts", condStats.putts, ""], ["SG Total", condStats.sgT, ""]].map(([l,v,u]) => (
                <div key={l} style={{ background: C2, borderRadius: 7, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: T3, fontWeight: 700, textTransform: "uppercase" }}>{l}</div>
                  <div style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 16, color: T1 }}>{v != null ? v + u : "--"}</div>
                </div>
              ))}
            </div>
          )}
          {!condStats && (windFilter || condFilter) && (
            <div style={{ color: T3, fontSize: 11, marginTop: 6 }}>Need 3+ rounds with this condition to show stats. Keep logging!</div>
          )}
        </Box>

        <Box style={{ borderLeft: "4px solid " + GL, background: GLL }}>
          <div style={{ fontSize: 14, color: GL, fontWeight: 800, marginBottom: 6 }}>DECADE Golf Framework</div>
          <div style={{ color: T1, fontSize: 13, lineHeight: 1.7 }}>
            Scott Fawcett model: aim to the <b>optimal miss location</b>, not the flag. Centre-to-wide side of the green maximises expected value given your real dispersion. Make decisions based on your actual shot pattern. Target +2 on Par {TOTAL_PAR} = avg score ~{TOTAL_PAR - 2}.
          </div>
        </Box>
        <div style={{ fontSize: 15, color: T1, fontWeight: 800 }}>Priority Stack -- Biggest Gains First</div>
        {cats.map(({ name, sg, p2, tips }, i) => {
          const n = parseFloat(sg) || 0;
          const gap = parseFloat((p2 - n).toFixed(2));
          const isGap = gap > 0.05;
          return (
            <Box key={name} style={{ borderLeft: "4px solid " + pc(i), background: isGap ? pcl(i) : CARD }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ background: pc(i), color: "#fff", width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>{i+1}</div>
                  <span style={{ color: T1, fontWeight: 700, fontSize: 14 }}>{name}</span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <SGB v={sg} />
                  {isGap ? <div style={{ fontSize: 10, color: RD, marginTop: 2 }}>Gap to +2: -{gap}</div> : <div style={{ fontSize: 10, color: GN, marginTop: 2 }}>At +2 benchmark</div>}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {tips.map((t, j) => (
                  <div key={j} style={{ display: "flex", gap: 8, color: T2, fontSize: 12 }}>
                    <span style={{ color: isGap ? pc(i) : GN, flexShrink: 0, fontWeight: 700 }}>{isGap ? "=>" : "OK"}</span>
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </Box>
          );
        })}
        <Box>
          <Lbl t="Your Stats vs Benchmarks (10r avg)" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {[
              { l: "FIR %",         v: s10.fir,   scr: 62, p2: 65,  u: "%",  inv: false },
              { l: "GIR %",         v: s10.gir,   scr: 70, p2: 74,  u: "%",  inv: false },
              { l: "Proximity ft",  v: s10.prox,  scr: 22, p2: 18,  u: "ft", inv: true  },
              { l: "Total Putts",   v: s10.putts, scr: 29, p2: 28,  u: "",   inv: true  },
              { l: "Scrambling %",  v: s10.scr,   scr: 58, p2: 65,  u: "%",  inv: false },
              { l: "Drive (m)",   v: s10.drive, scr: 278,p2: 285, u: "y",  inv: false },
              { l: "Hazards/Rd",    v: s10.hazards,scr: 1.5,p2: 1,  u: "",   inv: true  },
            ].filter(x => x.v != null).map(({ l, v, scr, p2, u, inv }) => {
              const atP2  = inv ? v <= p2  : v >= p2;
              const atScr = inv ? v <= scr : v >= scr;
              const c = atP2 ? GN : atScr ? GL : RD;
              return (
                <div key={l} style={{ display: "grid", gridTemplateColumns: "130px 1fr 65px 65px 65px", gap: 8, alignItems: "center", fontSize: 12 }}>
                  <span style={{ color: T2, fontWeight: 500 }}>{l}</span>
                  <div style={{ background: C2, borderRadius: 3, height: 6, border: "1px solid " + BD }}>
                    <div style={{ width: Math.min(100, (v / (p2||1)) * 100) + "%", background: c, height: "100%", borderRadius: 3 }} />
                  </div>
                  <span style={{ color: c, fontFamily: "monospace", fontWeight: 700, textAlign: "right" }}>{v}{u}</span>
                  <span style={{ color: T3, fontSize: 10, textAlign: "center" }}>Scr: {scr}{u}</span>
                  <span style={{ color: GL, fontSize: 10, textAlign: "center", fontWeight: 600 }}>+2: {p2}{u}</span>
                </div>
              );
            })}
          </div>
        </Box>
      </div>
    );
  }

  // -- SHELL --
  return (
    <div style={{ minHeight: "100vh", background: BG, color: T1, fontFamily: "system-ui, sans-serif", fontSize: 14 }}>
      <div style={{ background: CARD, borderBottom: "2px solid " + BD, padding: "0 24px", display: "flex", alignItems: "center", height: 54, position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 32 }}>
          <span style={{ fontSize: 22 }}>&#9971;</span>
          <div>
            <div style={{ fontSize: 16, color: T1, fontWeight: 800 }}>StrokeLab</div>
            <div style={{ fontSize: 9, color: T3, textTransform: "uppercase", letterSpacing: "0.08em" }}>Golf Analytics | Par {TOTAL_PAR} | +2 Target</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 0, flex: 1 }}>
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{ background: "none", border: "none", borderBottom: tab === id ? "3px solid " + BL : "3px solid transparent", color: tab === id ? BL : T2, padding: "0 14px", height: 54, fontSize: 12, cursor: "pointer", fontWeight: tab === id ? 700 : 400, whiteSpace: "nowrap" }}>{label}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto", alignItems: "center" }}>
          {hcp !== null && (
            <div style={{ fontSize: 12, color: T1, background: BLL, border: "1px solid " + BD, borderRadius: 5, padding: "4px 10px", fontWeight: 600 }}>
              HCP: <span style={{ color: BL, fontFamily: "monospace" }}>{hcp > 0 ? "+" + hcp : hcp}</span>
            </div>
          )}
          <button onClick={doExport} style={{ background: C2, color: T2, border: "1px solid " + BD, borderRadius: 5, padding: "5px 12px", fontSize: 11, cursor: "pointer" }}>Export</button>
          <button onClick={() => fileRef.current.click()} style={{ background: C2, color: T2, border: "1px solid " + BD, borderRadius: 5, padding: "5px 12px", fontSize: 11, cursor: "pointer" }}>Import</button>
          <input ref={fileRef} type="file" accept=".json" onChange={doImport} style={{ display: "none" }} />
        </div>
      </div>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 20px 60px" }}>
        {tab === "dash"     && <Dash />}
        {tab === "enter"    && <EnterRound />}
        {tab === "sg"       && <SGTab />}
        {tab === "holes"    && <HoleAnalysis />}
        {tab === "clubs"    && <ClubStats />}
        {tab === "trend"    && <Trends />}
        {tab === "practice"  && <PracticeLog />}
        {tab === "insights" && <Insights />}
      </div>
      <div style={{ borderTop: "1px solid " + BD, padding: "12px 24px", display: "flex", justifyContent: "space-between", fontSize: 10, color: T3, maxWidth: 1200, margin: "0 auto" }}>
        <span>StrokeLab | SG: Broadie (2014) | DataGolf / DECADE (Fawcett) | Blue R73 S141 | Black R75 S143</span>
        <span>{rounds.length} round{rounds.length !== 1 ? "s" : ""} tracked</span>
      </div>
    </div>
  );
}
