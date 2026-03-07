import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MAX_PER_SHIFT = 5;

const DEFAULT_SHIFTS = {
  Monday:    ["Flex (9:50–10:35am)", "Lunch (11:50am–12:35pm)"],
  Tuesday:   ["Lunch (11:50am–12:35pm)"],
  Wednesday: ["Lunch (11:50am–12:35pm)"],
  Thursday:  ["Lunch (11:50am–12:35pm)"],
  Friday:    ["Flex (9:50–10:35am)", "Lunch (11:50am–12:35pm)"],
  Saturday:  [],
  Sunday:    [],
};

const DEFAULT_STAFF = [
  "Julia","Madeline","Sophia C.","Marlee","Amira","Daisy","Chloe T.","Mila",
  "Emily","Eleanor","Aubrey","Rosalie","Maggie","Alex","Olivia","Phylicia",
  "Jaya","Miria","Juliette","Caidyn","Emma O.","Emma M.","Chloe E.","Audrey L.",
  "Eloise","Aisling","Nimah","Che","Ellie","Esmy","Nyah","Malia","Stella",
  "MacKensie","Audrey Y.","Regan","Anya"
];

const C = {
  deep:   "#260859",
  purple: "#7d6b9b",
  lilac:  "#f2bbf2",
  yellow: "#ffd200",
  white:  "#ffffff",
  mid:    "#3d2470",
  soft:   "#c9a8e0",
  bg:     "#f5eeff",
  card:   "#ffffff",
  border: "rgba(242,187,242,0.5)",
  green:  "#72ffa8",
};

async function dbGet(key) {
  const { data } = await supabase.from("cafe_store").select("value").eq("key", key).single();
  return data ? data.value : null;
}
async function dbSet(key, value) {
  await supabase.from("cafe_store").upsert({ key, value, updated_at: new Date().toISOString() });
}

// Fixed calendar link — hardcoded times for known shift types, fallback parser for custom
function makeCalendarLink(weekOffset, day, shift) {
  const now = new Date();
  const currentDay = now.getDay();
  const diff = now.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
  const monday = new Date(now); monday.setDate(diff + weekOffset * 7);
  const dayIndex = DAYS.indexOf(day);
  const shiftDate = new Date(monday); shiftDate.setDate(monday.getDate() + dayIndex);
  const pad = n => String(n).padStart(2, "0");
  const dateStr = `${shiftDate.getFullYear()}${pad(shiftDate.getMonth()+1)}${pad(shiftDate.getDate())}`;

  let startStr, endStr;

  const lower = shift.toLowerCase();
  if (lower.includes("flex")) {
    // 9:50am – 10:35am PT
    startStr = `${dateStr}T095000`;
    endStr   = `${dateStr}T103500`;
  } else if (lower.includes("lunch")) {
    // 11:50am – 12:35pm PT
    startStr = `${dateStr}T115000`;
    endStr   = `${dateStr}T123500`;
  } else {
    // Try to parse from shift name e.g. "Shift (2:00–3:00pm)"
    const timeMatch = shift.match(/(\d+):(\d+)\s*[–-]\s*(\d+):(\d+)\s*(am|pm)?/i);
    if (timeMatch) {
      let [,sh,sm,eh,em,meridiem] = timeMatch;
      sh = parseInt(sh); sm = parseInt(sm); eh = parseInt(eh); em = parseInt(em);
      const isPM = /pm/i.test(meridiem || shift);
      if (isPM && sh !== 12) sh += 12;
      if (isPM && eh !== 12) eh += 12;
      startStr = `${dateStr}T${pad(sh)}${pad(sm)}00`;
      endStr   = `${dateStr}T${pad(eh)}${pad(em)}00`;
    } else {
      startStr = `${dateStr}T090000`;
      endStr   = `${dateStr}T100000`;
    }
  }

  const title = encodeURIComponent(`Corner Cafe — ${shift}`);
  const details = encodeURIComponent("Shift signed up via Corner Cafe scheduler");
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startStr}/${endStr}&details=${details}`;
}

function getWeekLabel(offset) {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now); monday.setDate(diff + offset * 7);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const fmt = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

// Get the actual calendar date for a given day in the given week offset
function getDayDate(weekOffset, dayName) {
  const now = new Date();
  const currentDay = now.getDay();
  const diff = now.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
  const monday = new Date(now); monday.setDate(diff + weekOffset * 7);
  const dayIndex = DAYS.indexOf(dayName);
  const d = new Date(monday); d.setDate(monday.getDate() + dayIndex);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// XOxo hearts logo
function XoxoLogo() {
  return (
    <svg width="72" height="28" viewBox="0 0 72 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* X */}
      <path d="M3 4 L11 16 M11 4 L3 16" stroke={C.yellow} strokeWidth="2.8" strokeLinecap="round"/>
      {/* Heart */}
      <path d="M19 9 C19 7, 21 5.5, 23 7 C25 5.5, 27 7, 27 9 C27 12, 23 16, 23 16 C23 16, 19 12, 19 9Z" stroke={C.yellow} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      {/* X */}
      <path d="M33 4 L41 16 M41 4 L33 16" stroke={C.yellow} strokeWidth="2.8" strokeLinecap="round"/>
      {/* Heart (open, cute) */}
      <path d="M49 9 C49 7, 51 5.5, 53 7 C55 5.5, 57 7, 57 9 C57 13, 53 17, 53 17 C53 17, 49 13, 49 9Z" stroke={C.yellow} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

function Bubbles() {
  const bs = [
    {cx:8,cy:18,r:5.5,op:.15,dur:10,col:C.lilac},
    {cx:88,cy:25,r:9,op:.12,dur:14,col:C.yellow},
    {cx:22,cy:72,r:4,op:.18,dur:8,col:C.soft},
    {cx:78,cy:78,r:7,op:.13,dur:12,col:C.lilac},
    {cx:52,cy:48,r:13,op:.07,dur:16,col:C.yellow},
    {cx:62,cy:8,r:5,op:.16,dur:9,col:C.soft},
    {cx:38,cy:88,r:8,op:.1,dur:13,col:C.lilac},
    {cx:15,cy:42,r:3.5,op:.2,dur:7,col:C.yellow},
    {cx:93,cy:58,r:6,op:.14,dur:11,col:C.soft},
  ];
  return (
    <svg style={{position:"fixed",inset:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:0}} preserveAspectRatio="xMidYMid slice" viewBox="0 0 100 100">
      {bs.map((b,i)=>(
        <circle key={i} cx={`${b.cx}%`} cy={`${b.cy}%`} r={`${b.r}%`} fill={b.col} opacity={b.op}>
          <animate attributeName="cy" values={`${b.cy}%;${b.cy-3.5}%;${b.cy}%`} dur={`${b.dur}s`} repeatCount="indefinite"/>
          <animate attributeName="r" values={`${b.r}%;${b.r*1.12}%;${b.r}%`} dur={`${b.dur*1.4}s`} repeatCount="indefinite"/>
        </circle>
      ))}
    </svg>
  );
}

export default function CornerCafe() {
  const [view, setView] = useState("calendar");
  const [weekOffset, setWeekOffset] = useState(0);
  const [staffName, setStaffName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [pinError, setPinError] = useState("");
  const [setupMode, setSetupMode] = useState(false);
  const [data, setData] = useState({});
  const [shiftsConfig, setShiftsConfig] = useState({});
  const [staffList, setStaffList] = useState([]);
  const [staffInput, setStaffInput] = useState("");
  const [storedPin, setStoredPin] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [showDone, setShowDone] = useState(false);

  const weekKey = `week_${weekOffset}`;

  useEffect(() => {
    const load = async () => {
      try { const v = await dbGet("cc_data"); if (v) setData(JSON.parse(v)); } catch {}
      try { const v = await dbGet("cc_shifts"); if (v) setShiftsConfig(JSON.parse(v)); } catch {}
      try {
        const v = await dbGet("cc_staff");
        if (v) setStaffList(JSON.parse(v));
        else { setStaffList(DEFAULT_STAFF); await dbSet("cc_staff", JSON.stringify(DEFAULT_STAFF)); }
      } catch { setStaffList(DEFAULT_STAFF); }
      try {
        const v = await dbGet("cc_pin");
        if (v) setStoredPin(v); else setSetupMode(true);
      } catch { setSetupMode(true); }
      setLoaded(true);
    };
    load();
  }, []);

  const showToast = (msg, yellow = true) => {
    setToast({ msg, yellow });
    setTimeout(() => setToast(null), 2400);
  };

  const saveData = useCallback(async nd => { setData(nd); await dbSet("cc_data", JSON.stringify(nd)); }, []);
  const saveShiftsConfig = useCallback(async nc => { setShiftsConfig(nc); await dbSet("cc_shifts", JSON.stringify(nc)); }, []);
  const saveStaffList = useCallback(async sl => { setStaffList(sl); await dbSet("cc_staff", JSON.stringify(sl)); }, []);

  const getShifts = wk => shiftsConfig[wk] || DEFAULT_SHIFTS;
  const getSignups = (wk, day, shift) => data[wk]?.[day]?.[shift] || [];

  const signUp = (day, shift) => {
    if (!staffName) return;
    const signups = getSignups(weekKey, day, shift);
    if (signups.length >= MAX_PER_SHIFT || signups.find(s => s.name === staffName)) return;
    const nd = JSON.parse(JSON.stringify(data));
    if (!nd[weekKey]) nd[weekKey] = {};
    if (!nd[weekKey][day]) nd[weekKey][day] = {};
    if (!nd[weekKey][day][shift]) nd[weekKey][day][shift] = [];
    nd[weekKey][day][shift].push({ name: staffName, verified: false });
    saveData(nd);
    showToast("you're on the schedule!");
  };

  const cancelSignup = (day, shift) => {
    const idx = getSignups(weekKey, day, shift).findIndex(s => s.name === staffName);
    if (idx === -1) return;
    const nd = JSON.parse(JSON.stringify(data));
    nd[weekKey][day][shift].splice(idx, 1);
    saveData(nd);
    showToast("signup removed", false);
  };

  const verify = (day, shift, idx) => {
    const nd = JSON.parse(JSON.stringify(data));
    if (nd[weekKey]?.[day]?.[shift]?.[idx]) nd[weekKey][day][shift][idx].verified = true;
    saveData(nd);
    showToast("shift verified ✓");
  };

  const removeSignup = (day, shift, idx) => {
    const nd = JSON.parse(JSON.stringify(data));
    nd[weekKey][day][shift].splice(idx, 1);
    saveData(nd);
    setConfirmRemove(null);
    showToast("removed", false);
  };

  const handleAdminLogin = () => {
    if (setupMode) {
      if (pinInput.length < 4) { setPinError("min 4 digits"); return; }
      dbSet("cc_pin", pinInput);
      setStoredPin(pinInput); setIsAdmin(true); setSetupMode(false);
      setPinInput(""); setPinError(""); setView("admin");
    } else {
      if (pinInput === storedPin) { setIsAdmin(true); setPinInput(""); setPinError(""); setView("admin"); }
      else setPinError("wrong pin");
    }
  };

  const updateShiftName = (day, idx, val) => {
    const cur = getShifts(weekKey);
    const nc = JSON.parse(JSON.stringify(shiftsConfig));
    if (!nc[weekKey]) nc[weekKey] = JSON.parse(JSON.stringify(cur));
    nc[weekKey][day][idx] = val;
    saveShiftsConfig(nc);
  };

  const addShift = day => {
    const cur = getShifts(weekKey);
    const nc = JSON.parse(JSON.stringify(shiftsConfig));
    if (!nc[weekKey]) nc[weekKey] = JSON.parse(JSON.stringify(cur));
    nc[weekKey][day].push("New Shift");
    saveShiftsConfig(nc);
  };

  const removeShift = (day, idx) => {
    const cur = getShifts(weekKey);
    const nc = JSON.parse(JSON.stringify(shiftsConfig));
    if (!nc[weekKey]) nc[weekKey] = JSON.parse(JSON.stringify(cur));
    nc[weekKey][day].splice(idx, 1);
    saveShiftsConfig(nc);
  };

  const weekKeyToMonth = wk => {
    const offset = parseInt(wk.replace("week_", ""), 10);
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now); monday.setDate(diff + offset * 7);
    return `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,"0")}`;
  };

  // Leaderboard: shows ALL staff at 0, increments with verified shifts
  const getMonthlyTally = () => {
    const byMonth = {};
    const allTimeMonths = new Set();

    // Collect verified shift data
    Object.entries(data).forEach(([wk, wd]) => {
      const month = weekKeyToMonth(wk);
      allTimeMonths.add(month);
      if (!byMonth[month]) byMonth[month] = {};
      Object.values(wd).forEach(dd => Object.values(dd).forEach(ss => ss.forEach(s => {
        if (s.verified) byMonth[month][s.name] = (byMonth[month][s.name] || 0) + 1;
      })));
    });

    // Add current month if no data yet
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
    allTimeMonths.add(currentMonth);

    const months = [...allTimeMonths].sort();

    // All staff show up, even at 0
    const allNames = [...staffList].sort((a, b) => {
      const ta = months.reduce((s,m) => s+((byMonth[m]||{})[a]||0), 0);
      const tb = months.reduce((s,m) => s+((byMonth[m]||{})[b]||0), 0);
      return tb - ta || a.localeCompare(b);
    });

    return { months, byMonth, allNames };
  };

  if (!loaded) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:C.deep,color:C.yellow,fontFamily:"'Syne',sans-serif",fontSize:16,letterSpacing:3,textTransform:"uppercase",fontWeight:800}}>
      loading...
    </div>
  );

  const shifts = getShifts(weekKey);

  return (
    <div style={{minHeight:"100vh",background:C.bg,color:C.deep,fontFamily:"'Syne',sans-serif",position:"relative",overflowX:"hidden"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,400&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:6px;}
        ::-webkit-scrollbar-track{background:${C.bg};}
        ::-webkit-scrollbar-thumb{background:${C.soft};border-radius:4px;}
        @keyframes up{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
        @keyframes toastPop{from{opacity:0;transform:translateY(12px) scale(.92);}to{opacity:1;transform:translateY(0) scale(1);}}
        @keyframes pulse{0%,100%{opacity:.5;}50%{opacity:1;}}
        @keyframes wiggle{0%,100%{transform:rotate(-2deg);}50%{transform:rotate(2deg);}}
        .page{animation:up .32s ease both;}
        .nav-pill{background:rgba(255,255,255,0.15);border:1.5px solid rgba(242,187,242,0.4);color:${C.lilac};cursor:pointer;font-family:'Syne',sans-serif;font-weight:700;font-size:13px;padding:7px 18px;border-radius:50px;transition:all .2s;white-space:nowrap;}
        .nav-pill:hover{border-color:${C.lilac};color:${C.white};background:rgba(242,187,242,0.12);}
        .nav-pill.on{background:${C.yellow};border-color:${C.yellow};color:${C.deep};}
        .card{background:rgba(255,255,255,0.08);border:1.5px solid ${C.border};border-radius:22px;backdrop-filter:blur(12px);transition:all .2s;}
        .card:hover{border-color:rgba(242,187,242,0.6);box-shadow:0 8px 32px rgba(38,8,89,0.2);}
        .shift-block{background:rgba(0,0,0,0.2);border:1.5px solid rgba(242,187,242,0.15);border-radius:14px;padding:14px;margin-bottom:10px;transition:all .2s;}
        .shift-block:hover{border-color:rgba(242,187,242,0.4);}
        .shift-block.mine{border-color:${C.yellow};background:rgba(255,210,0,0.07);}
        .btn{border:none;border-radius:50px;padding:9px 22px;cursor:pointer;font-family:'Syne',sans-serif;font-weight:800;font-size:13px;transition:all .18s;white-space:nowrap;}
        .btn:hover:not(:disabled){transform:translateY(-2px);filter:brightness(1.1);box-shadow:0 6px 18px rgba(0,0,0,.25);}
        .btn:active:not(:disabled){transform:translateY(0);}
        .btn:disabled{opacity:.3;cursor:not-allowed;}
        .btn-y{background:${C.yellow};color:${C.deep};}
        .btn-deep{background:${C.deep};color:${C.white};border:1.5px solid rgba(242,187,242,0.3);}
        .btn-ghost{background:rgba(242,187,242,0.1);color:${C.lilac};border:1.5px solid rgba(242,187,242,0.25);}
        .btn-full{background:rgba(255,255,255,0.05);color:${C.soft};border:1.5px solid rgba(255,255,255,0.1);}
        .field{background:rgba(255,255,255,0.08);border:1.5px solid rgba(242,187,242,0.3);color:${C.white};padding:11px 18px;border-radius:50px;font-family:'DM Sans',sans-serif;font-size:14px;outline:none;transition:border-color .2s;width:100%;}
        .field::placeholder{color:rgba(242,187,242,0.4);}
        .field:focus{border-color:${C.yellow};}
        .field option{background:${C.deep};color:${C.white};}
        .week-btn{background:rgba(255,255,255,0.08);border:1.5px solid rgba(242,187,242,0.3);color:${C.soft};padding:6px 14px;border-radius:50px;cursor:pointer;font-family:'Syne',sans-serif;font-weight:700;font-size:12px;transition:all .2s;}
        .week-btn:hover{border-color:${C.yellow};color:${C.yellow};}
        .adm-input{background:rgba(255,255,255,0.07);border:1.5px solid rgba(242,187,242,0.25);color:${C.white};padding:7px 12px;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:12px;flex:1;outline:none;}
        .adm-input:focus{border-color:${C.yellow};}
        .overlay{position:fixed;inset:0;background:rgba(10,2,28,.75);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:100;animation:up .2s ease;}
        .modal{background:#1a0a38;border:1.5px solid rgba(242,187,242,0.25);border-radius:26px;padding:32px;max-width:380px;width:92%;box-shadow:0 30px 80px rgba(0,0,0,.5);}
        .dot{width:9px;height:9px;border-radius:50%;display:inline-block;flex-shrink:0;}
        .tag{display:inline-flex;align-items:center;padding:3px 11px;border-radius:20px;font-size:11px;font-weight:800;font-family:'Syne',sans-serif;}
        .tag-y{background:rgba(255,210,0,0.18);color:${C.yellow};}
        .tag-g{background:rgba(114,255,168,0.12);color:${C.green};}
        .tag-lilac{background:rgba(242,187,242,0.15);color:${C.lilac};}
        .person-row{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.06);}
        .person-row:last-child{border-bottom:none;}
        .hero-box{background:rgba(255,255,255,0.06);border:2px solid rgba(242,187,242,0.35);border-radius:26px;padding:36px 28px;text-align:center;margin-bottom:26px;backdrop-filter:blur(14px);}
        .hero-select{background:rgba(255,255,255,0.08);border:2px solid rgba(242,187,242,0.35);color:${C.white};padding:14px 48px 14px 22px;border-radius:50px;font-family:'Syne',sans-serif;font-size:16px;font-weight:700;outline:none;cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 12 12'%3E%3Cpath fill='%23f2bbf2' d='M6 8L1 3h10z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 18px center;transition:border-color .2s;width:100%;max-width:340px;}
        .hero-select:focus{border-color:${C.yellow};}
        .hero-select option{background:${C.deep};color:${C.white};}
      `}</style>

      <Bubbles />

      {/* Toast */}
      {toast && (
        <div style={{position:"fixed",bottom:24,right:20,zIndex:200,background:toast.yellow?C.yellow:C.lilac,color:C.deep,padding:"10px 24px",borderRadius:50,fontWeight:800,fontSize:13,fontFamily:"'Syne',sans-serif",boxShadow:"0 8px 32px rgba(0,0,0,.35)",animation:"toastPop .28s ease",letterSpacing:.3}}>
          {toast.msg}
        </div>
      )}

      {/* Done modal */}
      {showDone && (()=>{
        const myShifts=[];
        DAYS.forEach(day=>{(shifts[day]||[]).forEach(shift=>{if(getSignups(weekKey,day,shift).some(s=>s.name===staffName))myShifts.push({day,shift});});});
        return (
          <div className="overlay" onClick={()=>setShowDone(false)}>
            <div className="modal" onClick={e=>e.stopPropagation()}>
              <div style={{textAlign:"center",marginBottom:20}}>
                <div style={{display:"flex",justifyContent:"center",marginBottom:10,animation:"wiggle 1s ease infinite"}}><XoxoLogo/></div>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:24,color:C.white,marginBottom:4}}>you're all set!</div>
                <div style={{color:C.soft,fontSize:13,fontFamily:"'DM Sans',sans-serif"}}>shifts for {getWeekLabel(weekOffset)}</div>
              </div>
              {myShifts.length===0
                ? <div style={{color:C.soft,fontSize:13,textAlign:"center",fontFamily:"'DM Sans',sans-serif",padding:"14px 0",fontStyle:"italic"}}>no shifts signed up yet</div>
                : <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:22}}>
                    {myShifts.map(({day,shift},i)=>{
                      const verified=getSignups(weekKey,day,shift).find(s=>s.name===staffName)?.verified;
                      return (
                        <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(255,255,255,0.06)",border:`1.5px solid rgba(242,187,242,0.2)`,borderRadius:14,padding:"11px 15px"}}>
                          <div>
                            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13,color:C.white}}>{day} <span style={{color:C.soft,fontWeight:400,fontSize:11}}>{getDayDate(weekOffset,day)}</span></div>
                            <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:C.soft,marginTop:2}}>{shift}</div>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <a href={makeCalendarLink(weekOffset, day, shift)} target="_blank" rel="noreferrer"
                              style={{fontSize:18,textDecoration:"none",lineHeight:1}} title="Add to Google Calendar">📅</a>
                            <span className={`tag ${verified?"tag-g":"tag-y"}`}>{verified?"verified ✓":"pending"}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
              }
              <button onClick={()=>setShowDone(false)} className="btn btn-y" style={{width:"100%",fontSize:14,padding:13}}>close</button>
            </div>
          </div>
        );
      })()}

      {/* Confirm remove */}
      {confirmRemove && (
        <div className="overlay" onClick={()=>setConfirmRemove(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:22,marginBottom:8,color:C.white}}>remove signup?</div>
            <p style={{color:C.soft,fontSize:13,marginBottom:24,fontFamily:"'DM Sans',sans-serif",lineHeight:1.6}}>
              Remove <span style={{color:C.lilac,fontWeight:700}}>{getSignups(weekKey,confirmRemove.day,confirmRemove.shift)[confirmRemove.idx]?.name}</span> from this shift?
            </p>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setConfirmRemove(null)} className="btn btn-ghost" style={{flex:1}}>cancel</button>
              <button onClick={()=>removeSignup(confirmRemove.day,confirmRemove.shift,confirmRemove.idx)} className="btn" style={{flex:1,background:"rgba(255,90,110,.2)",color:"#ff8096",border:"1.5px solid rgba(255,90,110,.4)"}}>remove</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header style={{background:C.deep,borderBottom:`1.5px solid rgba(242,187,242,0.15)`,padding:"14px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12,boxShadow:"0 2px 20px rgba(0,0,0,.3)",position:"relative",zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{background:"rgba(255,255,255,0.06)",border:`1.5px solid rgba(242,187,242,0.2)`,borderRadius:14,padding:"7px 12px",display:"flex",alignItems:"center"}}>
            <XoxoLogo/>
          </div>
          <div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:21,color:C.white,letterSpacing:"-0.5px",lineHeight:1}}>Corner Cafe</div>
            <div style={{fontSize:10,color:C.purple,fontWeight:700,letterSpacing:2.5,textTransform:"uppercase",marginTop:2}}>shift schedule</div>
          </div>
        </div>
        <nav style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <button className={`nav-pill ${view==="calendar"?"on":""}`} onClick={()=>setView("calendar")}>schedule</button>
          <button className={`nav-pill ${view==="stats"?"on":""}`} onClick={()=>setView("stats")}>leaderboard</button>
          {isAdmin
            ? <>
                <button className={`nav-pill ${view==="admin"?"on":""}`} onClick={()=>setView("admin")}
                  style={view==="admin"?{background:C.lilac,borderColor:C.lilac,color:C.deep}:{}}>admin</button>
                <button className="nav-pill" onClick={()=>{setIsAdmin(false);setView("calendar");}}
                  style={{borderColor:"rgba(255,90,110,.4)",color:"#ff8096"}}>sign out</button>
              </>
            : <button className="nav-pill" onClick={()=>setView("login")}>admin</button>
          }
        </nav>
      </header>

      <main style={{maxWidth:1200,margin:"0 auto",padding:"28px 16px",position:"relative",zIndex:5}}>

        {/* LOGIN */}
        {view==="login" && (
          <div className="page" style={{maxWidth:400,margin:"60px auto"}}>
            <div className="card" style={{padding:38,textAlign:"center"}}>
              <div style={{display:"flex",justifyContent:"center",marginBottom:16,animation:"wiggle 2s ease infinite"}}><XoxoLogo/></div>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:26,color:C.white,marginBottom:6}}>{setupMode?"create pin":"admin login"}</div>
              <p style={{color:C.soft,fontSize:13,marginBottom:24,fontFamily:"'DM Sans',sans-serif"}}>{setupMode?"set a pin to protect admin access":"enter your pin to continue"}</p>
              <input className="field" type="password" placeholder={setupMode?"choose a pin (min 4 digits)":"pin"} value={pinInput}
                onChange={e=>setPinInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAdminLogin()}
                style={{marginBottom:10,textAlign:"center",letterSpacing:10,fontSize:24,borderRadius:16}}/>
              {pinError && <div style={{color:"#ff8096",fontSize:12,fontWeight:800,marginBottom:12}}>{pinError}</div>}
              <button onClick={handleAdminLogin} className="btn btn-y" style={{width:"100%",fontSize:15,padding:13}}>
                {setupMode?"set pin →":"login →"}
              </button>
            </div>
          </div>
        )}

        {/* LEADERBOARD — shows all staff, 0 until verified */}
        {view==="stats" && (()=>{
          const { months, byMonth, allNames } = getMonthlyTally();
          const fmtMonth = m => { const [y,mo] = m.split("-"); return new Date(y, mo-1).toLocaleDateString("en-US",{month:"long",year:"numeric"}); };
          const grandTotals = allNames.map(n => months.reduce((s,m) => s+((byMonth[m]||{})[n]||0), 0));
          const maxTotal = Math.max(...grandTotals, 1);
          const medals = ["🥇","🥈","🥉"];
          return (
            <div className="page">
              <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:26,flexWrap:"wrap"}}>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:32,color:C.white}}>leaderboard</div>
                <span style={{background:`rgba(255,210,0,0.18)`,color:C.yellow,borderRadius:20,padding:"4px 14px",fontSize:12,fontWeight:800}}>verified shifts only ✓</span>
              </div>
              <div className="card" style={{overflow:"hidden",padding:0}}>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",minWidth:months.length>1?500:300,borderCollapse:"collapse"}}>
                    <thead>
                      <tr style={{background:"rgba(0,0,0,0.35)"}}>
                        <th style={{textAlign:"left",padding:"14px 18px",fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:12,color:C.soft,whiteSpace:"nowrap"}}>#</th>
                        <th style={{textAlign:"left",padding:"14px 18px",fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:12,color:C.soft,whiteSpace:"nowrap"}}>name</th>
                        {months.map(m=>(
                          <th key={m} style={{textAlign:"center",padding:"14px 18px",fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:12,color:C.lilac,whiteSpace:"nowrap"}}>{fmtMonth(m)}</th>
                        ))}
                        <th style={{textAlign:"center",padding:"14px 18px",fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:12,color:C.yellow,whiteSpace:"nowrap"}}>total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allNames.map((name,i)=>{
                        const total=grandTotals[i];
                        return (
                          <tr key={name} style={{background:i%2===0?"rgba(255,255,255,0.03)":"transparent"}}>
                            <td style={{padding:"12px 18px",borderBottom:`1px solid rgba(242,187,242,0.08)`,color:C.soft,fontSize:14}}>
                              {i < 3 ? medals[i] : <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,color:C.purple}}>{i+1}</span>}
                            </td>
                            <td style={{padding:"12px 18px",borderBottom:`1px solid rgba(242,187,242,0.08)`}}>
                              <div>
                                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,color:C.white}}>{name}</div>
                                <div style={{background:"rgba(255,255,255,0.08)",borderRadius:4,height:4,width:80,marginTop:5,overflow:"hidden"}}>
                                  <div style={{height:4,borderRadius:4,background:`linear-gradient(90deg,${C.purple},${C.lilac})`,width:`${(total/maxTotal)*100}%`,transition:"width 1s ease"}}/>
                                </div>
                              </div>
                            </td>
                            {months.map(m=>{
                              const count=(byMonth[m]||{})[name]||0;
                              return (
                                <td key={m} style={{textAlign:"center",padding:"12px 18px",borderBottom:`1px solid rgba(242,187,242,0.08)`}}>
                                  {count>0
                                    ? <span style={{background:"rgba(255,210,0,0.15)",color:C.yellow,borderRadius:20,padding:"3px 14px",fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13}}>{count}</span>
                                    : <span style={{color:"rgba(255,255,255,0.18)",fontFamily:"'Syne',sans-serif",fontSize:13,fontWeight:700}}>0</span>
                                  }
                                </td>
                              );
                            })}
                            <td style={{textAlign:"center",padding:"12px 18px",borderBottom:`1px solid rgba(242,187,242,0.08)`}}>
                              <span style={{background:total>0?(i===0?C.yellow:"rgba(255,210,0,0.15)"):"rgba(255,255,255,0.07)",color:total>0?(i===0?C.deep:C.yellow):C.soft,borderRadius:20,padding:"4px 16px",fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14}}>{total}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ADMIN */}
        {view==="admin" && isAdmin && (
          <div className="page">
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:14,marginBottom:24}}>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:30,color:C.white}}>manage shifts</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <button className="week-btn" onClick={()=>setWeekOffset(o=>o-1)}>← prev</button>
                <div style={{background:"rgba(255,255,255,0.1)",border:`1.5px solid rgba(242,187,242,0.25)`,borderRadius:50,padding:"6px 16px",fontSize:12,fontWeight:700,color:C.lilac,fontFamily:"'Syne',sans-serif"}}>{getWeekLabel(weekOffset)}</div>
                <button className="week-btn" onClick={()=>setWeekOffset(o=>o+1)}>next →</button>
              </div>
            </div>

            <div style={{marginBottom:28}}>
              <div className="card" style={{padding:20}}>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16,color:C.white,marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
                  staff list
                  <span style={{background:"rgba(242,187,242,0.12)",color:C.soft,borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700}}>{staffList.length} members</span>
                </div>
                <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
                  <input className="adm-input" placeholder="add staff member name..." value={staffInput}
                    onChange={e=>setStaffInput(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter"&&staffInput.trim()){const n=staffInput.trim();if(!staffList.includes(n)){saveStaffList([...staffList,n]);showToast(`${n} added`);}setStaffInput("");}}}
                    style={{flex:1,minWidth:180,padding:"9px 14px",borderRadius:10,fontSize:13}}/>
                  <button onClick={()=>{const n=staffInput.trim();if(n&&!staffList.includes(n)){saveStaffList([...staffList,n]);showToast(`${n} added`);}setStaffInput("");}}
                    className="btn btn-y" style={{fontSize:13,padding:"9px 18px"}} disabled={!staffInput.trim()}>+ add</button>
                </div>
                {staffList.length===0
                  ? <div style={{color:C.soft,fontSize:12,fontFamily:"'DM Sans',sans-serif",fontStyle:"italic"}}>no staff members yet</div>
                  : <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                      {[...staffList].sort().map(name=>(
                        <div key={name} style={{display:"flex",alignItems:"center",gap:6,background:"rgba(255,255,255,0.07)",border:`1.5px solid rgba(242,187,242,0.2)`,borderRadius:50,padding:"5px 6px 5px 14px",fontSize:13,fontFamily:"'DM Sans',sans-serif",color:C.white,fontWeight:500}}>
                          {name}
                          <button onClick={()=>{saveStaffList(staffList.filter(n=>n!==name));showToast(`${name} removed`,false);}}
                            style={{background:"rgba(255,90,110,0.2)",border:"none",color:"#ff8096",borderRadius:"50%",width:20,height:20,cursor:"pointer",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontWeight:800}}>✕</button>
                        </div>
                      ))}
                    </div>
                }
              </div>
            </div>

            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11,color:C.soft,marginBottom:14,letterSpacing:2,textTransform:"uppercase"}}>weekly shifts</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14}}>
              {DAYS.map(day=>{
                const dayShifts=shifts[day]||[];
                const dateLabel=getDayDate(weekOffset,day);
                return (
                  <div key={day} className="card" style={{padding:16}}>
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16,color:C.white,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <span>{day}</span>
                        <span style={{marginLeft:8,fontSize:11,fontWeight:400,color:C.soft}}>{dateLabel}</span>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{color:C.purple,fontSize:11,fontWeight:600}}>{dayShifts.length} shift{dayShifts.length!==1?"s":""}</span>
                        {dayShifts.length>0&&(
                          <button onClick={()=>{
                            const cur=getShifts(weekKey);
                            const nc=JSON.parse(JSON.stringify(shiftsConfig));
                            if(!nc[weekKey]) nc[weekKey]=JSON.parse(JSON.stringify(cur));
                            nc[weekKey][day]=[];
                            saveShiftsConfig(nc);
                            showToast(`${day} closed`,false);
                          }} style={{background:"rgba(255,90,110,0.12)",border:`1.5px solid rgba(255,90,110,0.3)`,color:"#ff8096",borderRadius:50,padding:"3px 10px",cursor:"pointer",fontSize:11,fontWeight:800,fontFamily:"'Syne',sans-serif"}}>
                            close day
                          </button>
                        )}
                      </div>
                    </div>
                    {dayShifts.map((shift,idx)=>{
                      const signups=getSignups(weekKey,day,shift);
                      return (
                        <div key={idx} style={{background:"rgba(0,0,0,0.2)",border:`1.5px solid rgba(242,187,242,0.12)`,borderRadius:12,padding:12,marginBottom:10}}>
                          <div style={{display:"flex",gap:6,marginBottom:8}}>
                            <input className="adm-input" value={shift} onChange={e=>updateShiftName(day,idx,e.target.value)}/>
                            <button onClick={()=>removeShift(day,idx)} style={{background:"rgba(255,90,110,.14)",border:"none",color:"#ff8096",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontWeight:800,fontSize:14}}>✕</button>
                          </div>
                          {signups.length===0
                            ? <div style={{color:C.purple,fontSize:11,fontFamily:"'DM Sans',sans-serif",padding:"3px 0",fontStyle:"italic"}}>no signups yet</div>
                            : signups.map((s,si)=>(
                              <div key={si} className="person-row">
                                <span className="dot" style={{background:s.verified?C.green:C.yellow,animation:!s.verified?"pulse 2s infinite":"none"}}/>
                                <span style={{flex:1,fontSize:13,fontFamily:"'DM Sans',sans-serif",color:C.white,fontWeight:500}}>{s.name}</span>
                                {s.verified
                                  ? <span className="tag tag-g">done ✓</span>
                                  : <button onClick={()=>verify(day,shift,si)} style={{background:"rgba(114,255,168,0.1)",border:`1.5px solid rgba(114,255,168,0.3)`,color:C.green,borderRadius:20,padding:"2px 10px",cursor:"pointer",fontSize:11,fontWeight:800,fontFamily:"'Syne',sans-serif"}}>verify</button>
                                }
                                <button onClick={()=>setConfirmRemove({day,shift,idx:si})} style={{background:"none",border:"none",color:C.purple,cursor:"pointer",fontSize:15,padding:"0 2px"}}>✕</button>
                              </div>
                            ))
                          }
                        </div>
                      );
                    })}
                    <button onClick={()=>addShift(day)} style={{background:"none",border:`2px dashed rgba(242,187,242,0.2)`,color:C.purple,padding:"8px 14px",borderRadius:12,cursor:"pointer",fontSize:12,fontWeight:800,width:"100%",fontFamily:"'Syne',sans-serif",transition:"all .2s"}}
                      onMouseEnter={e=>{e.target.style.borderColor=C.lilac;e.target.style.color=C.lilac;}}
                      onMouseLeave={e=>{e.target.style.borderColor="rgba(242,187,242,0.2)";e.target.style.color=C.purple;}}>
                      + add shift
                    </button>
                    {day==="Friday"&&!dayShifts.includes("Unpacking")&&(
                      <button onClick={()=>{
                        const cur=getShifts(weekKey);
                        const nc=JSON.parse(JSON.stringify(shiftsConfig));
                        if(!nc[weekKey]) nc[weekKey]=JSON.parse(JSON.stringify(cur));
                        nc[weekKey]["Friday"].push("Unpacking");
                        saveShiftsConfig(nc);
                        showToast("unpacking shift added");
                      }} className="btn btn-y" style={{width:"100%",fontSize:12,padding:"9px",marginTop:6}}>
                        + unpacking shift 📦
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* CALENDAR */}
        {view==="calendar" && (
          <div className="page">

            {/* Hero name picker */}
            {!staffName && (
              <div className="hero-box">
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:30,color:C.white,marginBottom:6}}>hey! who are you?</div>
                <div style={{color:C.soft,fontSize:15,fontFamily:"'DM Sans',sans-serif",marginBottom:26}}>pick your name to sign up for shifts this week</div>
                {staffList.length===0
                  ? <div style={{color:C.soft,fontSize:14,fontFamily:"'DM Sans',sans-serif",fontStyle:"italic"}}>no staff added yet — ask your admin</div>
                  : <div style={{display:"flex",gap:12,justifyContent:"center",alignItems:"center",flexWrap:"wrap"}}>
                      <select className="hero-select" value={nameInput} onChange={e=>setNameInput(e.target.value)}>
                        <option value="">select your name ▾</option>
                        {[...staffList].sort().map(n=>(
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                      <button onClick={()=>nameInput&&setStaffName(nameInput)} className="btn btn-y" disabled={!nameInput}
                        style={{fontSize:16,padding:"14px 30px",boxShadow:`0 4px 20px rgba(255,210,0,0.3)`}}>
                        let's go →
                      </button>
                    </div>
                }
              </div>
            )}

            {/* Top bar once signed in */}
            {staffName && (
              <div className="card" style={{padding:"14px 20px",marginBottom:22,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <div style={{background:C.yellow,color:C.deep,borderRadius:50,padding:"7px 20px",fontWeight:800,fontSize:14,fontFamily:"'Syne',sans-serif",flexShrink:0}}>{staffName}</div>
                <span style={{color:C.soft,fontSize:13,fontFamily:"'DM Sans',sans-serif"}}>tap a shift to sign up</span>
                <div style={{display:"flex",gap:8,marginLeft:"auto",flexShrink:0}}>
                  <button onClick={()=>setShowDone(true)} className="btn btn-y" style={{fontSize:12,padding:"7px 20px"}}>done ✦</button>
                  <button onClick={()=>{setStaffName("");setNameInput("");}} className="btn btn-ghost" style={{fontSize:12,padding:"7px 16px"}}>change</button>
                </div>
              </div>
            )}

            {/* Week nav */}
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:22,flexWrap:"wrap"}}>
              <button className="week-btn" onClick={()=>setWeekOffset(o=>o-1)}>← prev week</button>
              <div style={{background:"rgba(255,255,255,0.1)",border:`1.5px solid rgba(242,187,242,0.25)`,borderRadius:50,padding:"7px 18px",fontSize:12,fontWeight:700,color:C.lilac,fontFamily:"'Syne',sans-serif",whiteSpace:"nowrap"}}>{getWeekLabel(weekOffset)}</div>
              <button className="week-btn" onClick={()=>setWeekOffset(o=>o+1)}>next week →</button>
            </div>

            {/* Day cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(245px,1fr))",gap:14}}>
              {DAYS.map((day,di)=>{
                const dayShifts=shifts[day]||[];
                const dateLabel=getDayDate(weekOffset,day);
                return (
                  <div key={day} className="card" style={{padding:18,animationDelay:`${di*.04}s`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                      <div>
                        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,color:C.white,lineHeight:1}}>{day}</div>
                        <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:C.soft,marginTop:3}}>{dateLabel}</div>
                      </div>
                      <span style={{background:"rgba(242,187,242,0.12)",color:C.soft,borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700}}>{dayShifts.length} shift{dayShifts.length!==1?"s":""}</span>
                    </div>
                    {dayShifts.length===0
                      ? <div style={{background:"rgba(255,255,255,0.03)",borderRadius:14,padding:16,textAlign:"center",color:C.purple,fontSize:12,fontFamily:"'DM Sans',sans-serif"}}>no shifts this day</div>
                      : dayShifts.map(shift=>{
                          const signups=getSignups(weekKey,day,shift);
                          const full=signups.length>=MAX_PER_SHIFT;
                          const mine=signups.some(s=>s.name===staffName);
                          return (
                            <div key={shift} className={`shift-block${mine?" mine":""}`}>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                                <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,color:mine?C.yellow:C.lilac}}>{shift}</span>
                                <div style={{display:"flex",gap:3}}>
                                  {Array.from({length:MAX_PER_SHIFT}).map((_,i)=>(
                                    <span key={i} className="dot" style={{background:i<signups.length?(signups[i]?.verified?C.green:C.yellow):"rgba(255,255,255,0.12)"}}/>
                                  ))}
                                </div>
                              </div>
                              {signups.map((s,si)=>(
                                <div key={si} style={{display:"flex",alignItems:"center",gap:7,padding:"3px 0"}}>
                                  <span className="dot" style={{background:s.verified?C.green:C.yellow}}/>
                                  <span style={{fontSize:12,color:s.verified?C.green:C.white,fontFamily:"'DM Sans',sans-serif",fontWeight:s.name===staffName?700:400,flex:1}}>{s.name}</span>
                                  {s.name===staffName&&!s.verified&&<span className="tag tag-y" style={{fontSize:10}}>you</span>}
                                  {s.verified&&<span className="tag tag-g" style={{fontSize:10}}>✓</span>}
                                </div>
                              ))}
                              <div style={{marginTop:10}}>
                                {mine
                                  ? <div style={{display:"flex",flexDirection:"column",gap:6}}>
                                      <a href={makeCalendarLink(weekOffset, day, shift)} target="_blank" rel="noreferrer"
                                        style={{display:"block",textAlign:"center",background:"rgba(255,210,0,0.12)",border:`1.5px solid rgba(255,210,0,0.35)`,color:C.yellow,borderRadius:50,padding:"8px",fontSize:12,fontWeight:800,fontFamily:"'Syne',sans-serif",textDecoration:"none",transition:"all .2s"}}
                                        onMouseEnter={e=>{e.target.style.background="rgba(255,210,0,0.22)";e.target.style.transform="translateY(-1px)";}}
                                        onMouseLeave={e=>{e.target.style.background="rgba(255,210,0,0.12)";e.target.style.transform="none";}}>
                                        📅 add to google calendar
                                      </a>
                                      <button onClick={()=>cancelSignup(day,shift)} className="btn btn-ghost" style={{width:"100%",fontSize:12,padding:"7px"}}>cancel signup</button>
                                    </div>
                                  : <button onClick={()=>signUp(day,shift)} className={`btn ${full?"btn-full":"btn-y"}`} disabled={!staffName||full} style={{width:"100%",fontSize:12,padding:"9px"}}>
                                      {full?"shift full":staffName?"sign up ✦":"pick your name first"}
                                    </button>
                                }
                              </div>
                            </div>
                          );
                        })
                    }
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
