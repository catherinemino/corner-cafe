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
  border: "rgba(242,187,242,0.18)",
};

// ── Supabase helpers ──────────────────────────────────────────
async function dbGet(key) {
  const { data } = await supabase.from("cafe_store").select("value").eq("key", key).single();
  return data ? data.value : null;
}
async function dbSet(key, value) {
  await supabase.from("cafe_store").upsert({ key, value, updated_at: new Date().toISOString() });
}

// ── Google Calendar link builder ─────────────────────────────
function makeCalendarLink(weekOffset, day, shift) {
  // Parse start/end times from shift name e.g. "Flex (9:50–10:35am)"
  const timeMatch = shift.match(/(\d+:\d+)\s*[–-]\s*(\d+:\d+\s*(?:am|pm)?)/i);

  // Get the actual date for this day in the given week
  const now = new Date();
  const currentDay = now.getDay();
  const diff = now.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
  const monday = new Date(now); monday.setDate(diff + weekOffset * 7);
  const dayIndex = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].indexOf(day);
  const shiftDate = new Date(monday); shiftDate.setDate(monday.getDate() + dayIndex);

  const pad = n => String(n).padStart(2, "0");
  const dateStr = `${shiftDate.getFullYear()}${pad(shiftDate.getMonth()+1)}${pad(shiftDate.getDate())}`;

  let startStr = `${dateStr}T090000`;
  let endStr   = `${dateStr}T100000`;

  if (timeMatch) {
    const parseTime = (t, hint) => {
      let [h, m] = t.trim().split(":").map(Number);
      const isPM = /pm/i.test(hint || t);
      const isAM = /am/i.test(hint || t);
      if (isPM && h !== 12) h += 12;
      if (isAM && h === 12) h = 0;
      return `${dateStr}T${pad(h)}${pad(m)}00`;
    };
    startStr = parseTime(timeMatch[1], shift);
    endStr   = parseTime(timeMatch[2], shift);
  }

  const title = encodeURIComponent(`Corner Cafe — ${shift}`);
  const details = encodeURIComponent(`Shift signed up via Corner Cafe scheduler`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startStr}/${endStr}&details=${details}`;
}
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now); monday.setDate(diff + offset * 7);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const fmt = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

function Bubbles() {
  const bs = [
    {cx:8,cy:18,r:5.5,op:.14,dur:10,col:C.lilac},
    {cx:88,cy:25,r:9,op:.1,dur:14,col:C.yellow},
    {cx:22,cy:72,r:4,op:.18,dur:8,col:C.soft},
    {cx:78,cy:78,r:7,op:.12,dur:12,col:C.lilac},
    {cx:52,cy:48,r:13,op:.06,dur:16,col:C.yellow},
    {cx:62,cy:8,r:5,op:.16,dur:9,col:C.soft},
    {cx:38,cy:88,r:8,op:.09,dur:13,col:C.lilac},
    {cx:15,cy:42,r:3.5,op:.2,dur:7,col:C.yellow},
    {cx:93,cy:58,r:6,op:.13,dur:11,col:C.soft},
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

// ── Main App ──────────────────────────────────────────────────
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

  // ── Load from Supabase ──
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
        if (v) setStoredPin(v);
        else setSetupMode(true);
      } catch { setSetupMode(true); }
      setLoaded(true);
    };
    load();
  }, []);

  const showToast = (msg, yellow = true) => {
    setToast({ msg, yellow });
    setTimeout(() => setToast(null), 2400);
  };

  const saveData = useCallback(async nd => {
    setData(nd);
    await dbSet("cc_data", JSON.stringify(nd));
  }, []);

  const saveShiftsConfig = useCallback(async nc => {
    setShiftsConfig(nc);
    await dbSet("cc_shifts", JSON.stringify(nc));
  }, []);

  const saveStaffList = useCallback(async sl => {
    setStaffList(sl);
    await dbSet("cc_staff", JSON.stringify(sl));
  }, []);

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
    showToast("you're on the schedule");
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

  const weekKeyToMonth = (wk) => {
    const offset = parseInt(wk.replace("week_", ""), 10);
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now); monday.setDate(diff + offset * 7);
    return `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,"0")}`;
  };

  const getMonthlyTally = () => {
    const byMonth = {};
    Object.entries(data).forEach(([wk, wd]) => {
      const month = weekKeyToMonth(wk);
      if (!byMonth[month]) byMonth[month] = {};
      Object.values(wd).forEach(dd => Object.values(dd).forEach(ss => ss.forEach(s => {
        if (s.verified) byMonth[month][s.name] = (byMonth[month][s.name] || 0) + 1;
      })));
    });
    const months = Object.keys(byMonth).sort();
    const allNames = [...new Set(months.flatMap(m => Object.keys(byMonth[m])))];
    allNames.sort((a,b) => {
      const ta = months.reduce((s,m) => s+(byMonth[m][a]||0), 0);
      const tb = months.reduce((s,m) => s+(byMonth[m][b]||0), 0);
      return tb - ta;
    });
    return { months, byMonth, allNames };
  };

  if (!loaded) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:C.deep,color:C.yellow,fontFamily:"'Syne',sans-serif",fontSize:16,letterSpacing:3,textTransform:"uppercase"}}>
      loading...
    </div>
  );

  const shifts = getShifts(weekKey);

  return (
    <div style={{minHeight:"100vh",background:C.deep,color:C.white,fontFamily:"'Syne',sans-serif",position:"relative",overflowX:"hidden"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,400&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:5px;}
        ::-webkit-scrollbar-track{background:${C.deep};}
        ::-webkit-scrollbar-thumb{background:${C.mid};border-radius:3px;}
        @keyframes up{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
        @keyframes toastPop{from{opacity:0;transform:translateY(12px) scale(.92);}to{opacity:1;transform:translateY(0) scale(1);}}
        @keyframes pulse{0%,100%{opacity:.5;}50%{opacity:1;}}
        .page{animation:up .32s ease both;}
        .nav-pill{background:transparent;border:1.5px solid rgba(125,107,155,0.5);color:${C.soft};cursor:pointer;font-family:'Syne',sans-serif;font-weight:700;font-size:13px;padding:7px 18px;border-radius:50px;transition:all .2s;white-space:nowrap;}
        .nav-pill:hover{border-color:${C.lilac};color:${C.white};background:rgba(242,187,242,0.07);}
        .nav-pill.on{background:${C.yellow};border-color:${C.yellow};color:${C.deep};}
        .glass{background:rgba(255,255,255,0.045);border:1.5px solid ${C.border};border-radius:20px;backdrop-filter:blur(10px);transition:border-color .2s;}
        .glass:hover{border-color:rgba(242,187,242,0.35);}
        .shift-block{background:rgba(0,0,0,0.25);border:1.5px solid rgba(242,187,242,0.12);border-radius:14px;padding:14px;margin-bottom:10px;transition:border-color .2s;}
        .shift-block:hover{border-color:rgba(242,187,242,0.3);}
        .shift-block.mine{border-color:${C.yellow};background:rgba(255,210,0,0.06);}
        .btn{border:none;border-radius:50px;padding:9px 20px;cursor:pointer;font-family:'Syne',sans-serif;font-weight:700;font-size:13px;transition:all .18s;white-space:nowrap;}
        .btn:hover:not(:disabled){transform:translateY(-2px);filter:brightness(1.1);}
        .btn:active:not(:disabled){transform:translateY(0);}
        .btn:disabled{opacity:.3;cursor:not-allowed;}
        .btn-y{background:${C.yellow};color:${C.deep};}
        .btn-ghost{background:rgba(242,187,242,0.08);color:${C.lilac};border:1.5px solid rgba(242,187,242,0.2);}
        .btn-full{background:rgba(255,255,255,0.05);color:${C.purple};border:1.5px solid rgba(255,255,255,0.08);}
        .field{background:rgba(255,255,255,0.06);border:1.5px solid rgba(242,187,242,0.22);color:${C.white};padding:10px 16px;border-radius:50px;font-family:'DM Sans',sans-serif;font-size:14px;outline:none;transition:border-color .2s,background .2s;width:100%;}
        .field::placeholder{color:rgba(242,187,242,0.35);}
        .field:focus{border-color:${C.yellow};background:rgba(255,255,255,0.09);}
        .field option{background:${C.deep};color:${C.white};}
        .week-btn{background:rgba(255,255,255,0.05);border:1.5px solid rgba(125,107,155,0.4);color:${C.soft};padding:6px 14px;border-radius:50px;cursor:pointer;font-family:'Syne',sans-serif;font-weight:700;font-size:12px;transition:all .2s;}
        .week-btn:hover{border-color:${C.yellow};color:${C.yellow};}
        .adm-input{background:rgba(255,255,255,0.05);border:1.5px solid rgba(242,187,242,0.18);color:${C.white};padding:6px 12px;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:12px;flex:1;outline:none;}
        .adm-input:focus{border-color:${C.yellow};}
        .overlay{position:fixed;inset:0;background:rgba(10,2,28,.75);display:flex;align-items:center;justify-content:center;z-index:100;animation:up .2s ease;}
        .modal{background:#1b0c3b;border:1.5px solid rgba(242,187,242,0.22);border-radius:24px;padding:32px;max-width:340px;width:90%;box-shadow:0 30px 80px rgba(0,0,0,.55);}
        .dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex-shrink:0;}
        .tag{display:inline-flex;align-items:center;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;font-family:'Syne',sans-serif;letter-spacing:.3px;}
        .tag-y{background:rgba(255,210,0,0.14);color:${C.yellow};}
        .tag-g{background:rgba(100,255,160,0.1);color:#72ffa8;}
        .person-row{display:flex;align-items:center;gap:7px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);}
        .person-row:last-child{border-bottom:none;}
      `}</style>

      <Bubbles />

      {/* Toast */}
      {toast && (
        <div style={{position:"fixed",bottom:24,right:20,zIndex:200,background:toast.yellow?C.yellow:C.lilac,color:C.deep,padding:"9px 22px",borderRadius:50,fontWeight:700,fontSize:13,fontFamily:"'Syne',sans-serif",boxShadow:"0 8px 32px rgba(0,0,0,.4)",animation:"toastPop .28s ease",letterSpacing:.4}}>
          {toast.msg}
        </div>
      )}

      {/* Done modal */}
      {showDone && (()=>{
        const myShifts=[];
        DAYS.forEach(day=>{(shifts[day]||[]).forEach(shift=>{if(getSignups(weekKey,day,shift).some(s=>s.name===staffName))myShifts.push({day,shift});});});
        return (
          <div className="overlay" onClick={()=>setShowDone(false)}>
            <div className="modal" style={{maxWidth:400}} onClick={e=>e.stopPropagation()}>
              <div style={{textAlign:"center",marginBottom:18}}>
                <div style={{fontSize:36,marginBottom:8}}>✦</div>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:22,color:C.white,marginBottom:4}}>you're all set</div>
                <div style={{color:C.soft,fontSize:13,fontFamily:"'DM Sans',sans-serif"}}>your shifts for {getWeekLabel(weekOffset)}</div>
              </div>
              {myShifts.length===0
                ? <div style={{color:C.purple,fontSize:13,textAlign:"center",fontFamily:"'DM Sans',sans-serif",padding:"12px 0"}}>no shifts signed up yet</div>
                : <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:22}}>
                    {myShifts.map(({day,shift},i)=>{
                      const verified=getSignups(weekKey,day,shift).find(s=>s.name===staffName)?.verified;
                      return (
                        <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(255,255,255,0.05)",border:`1.5px solid rgba(242,187,242,0.15)`,borderRadius:12,padding:"10px 14px"}}>
                          <div>
                            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,color:C.white}}>{day}</div>
                            <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:C.soft,marginTop:2}}>{shift}</div>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <a href={makeCalendarLink(weekOffset, day, shift)} target="_blank" rel="noreferrer"
                              style={{fontSize:16,textDecoration:"none"}} title="Add to Google Calendar">📅</a>
                            <span className={`tag ${verified?"tag-g":"tag-y"}`}>{verified?"verified ✓":"pending"}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
              }
              <button onClick={()=>setShowDone(false)} className="btn btn-y" style={{width:"100%",fontSize:14,padding:11}}>done</button>
            </div>
          </div>
        );
      })()}

      {/* Confirm remove modal */}
      {confirmRemove && (
        <div className="overlay" onClick={()=>setConfirmRemove(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:20,marginBottom:8,color:C.white}}>remove signup?</div>
            <p style={{color:C.soft,fontSize:13,marginBottom:24,fontFamily:"'DM Sans',sans-serif",lineHeight:1.5}}>
              Remove <span style={{color:C.lilac,fontWeight:600}}>{getSignups(weekKey,confirmRemove.day,confirmRemove.shift)[confirmRemove.idx]?.name}</span> from this shift?
            </p>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setConfirmRemove(null)} className="btn btn-ghost" style={{flex:1}}>cancel</button>
              <button onClick={()=>removeSignup(confirmRemove.day,confirmRemove.shift,confirmRemove.idx)} className="btn" style={{flex:1,background:"rgba(255,90,110,.18)",color:"#ff8096",border:"1.5px solid rgba(255,90,110,.35)"}}>remove</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header style={{position:"relative",zIndex:10,borderBottom:`1.5px solid rgba(242,187,242,0.12)`,padding:"14px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12,backdropFilter:"blur(14px)",background:"rgba(38,8,89,0.65)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:42,height:42,borderRadius:"50%",background:C.yellow,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,boxShadow:`0 0 22px ${C.yellow}55`,flexShrink:0}}>☕</div>
          <div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:21,color:C.white,letterSpacing:"-0.5px",lineHeight:1}}>Corner Cafe</div>
            <div style={{fontSize:10,color:C.purple,fontWeight:600,letterSpacing:2,textTransform:"uppercase",marginTop:2}}>shift schedule</div>
          </div>
        </div>
        <nav style={{display:"flex",gap:7,flexWrap:"wrap",alignItems:"center"}}>
          <button className={`nav-pill ${view==="calendar"?"on":""}`} onClick={()=>setView("calendar")}>schedule</button>
          <button className={`nav-pill ${view==="stats"?"on":""}`} onClick={()=>setView("stats")}>leaderboard</button>
          {isAdmin
            ? <>
                <button className={`nav-pill ${view==="admin"?"on":""}`} onClick={()=>setView("admin")} style={view==="admin"?{background:C.lilac,borderColor:C.lilac,color:C.deep}:{}}>admin</button>
                <button className="nav-pill" onClick={()=>{setIsAdmin(false);setView("calendar");}} style={{borderColor:"rgba(255,90,110,.35)",color:"#ff8096"}}>sign out</button>
              </>
            : <button className="nav-pill" onClick={()=>setView("login")}>admin</button>
          }
        </nav>
      </header>

      <main style={{maxWidth:1200,margin:"0 auto",padding:"26px 16px",position:"relative",zIndex:5}}>

        {/* ── LOGIN ── */}
        {view==="login" && (
          <div className="page" style={{maxWidth:380,margin:"56px auto"}}>
            <div className="glass" style={{padding:36}}>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:26,marginBottom:6,color:C.white}}>{setupMode?"create pin":"admin login"}</div>
              <p style={{color:C.soft,fontSize:13,marginBottom:24,fontFamily:"'DM Sans',sans-serif",lineHeight:1.6}}>{setupMode?"set a pin to protect admin access":"enter your pin"}</p>
              <input className="field" type="password" placeholder={setupMode?"create pin (min 4)":"pin"} value={pinInput}
                onChange={e=>setPinInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAdminLogin()}
                style={{marginBottom:10,textAlign:"center",letterSpacing:10,fontSize:22,borderRadius:12}}/>
              {pinError && <div style={{color:"#ff8096",fontSize:12,fontWeight:700,textAlign:"center",marginBottom:12}}>{pinError}</div>}
              <button onClick={handleAdminLogin} className="btn btn-y" style={{width:"100%",fontSize:14,padding:12}}>
                {setupMode?"set pin →":"login →"}
              </button>
            </div>
          </div>
        )}

        {/* ── LEADERBOARD ── */}
        {view==="stats" && (()=>{
          const { months, byMonth, allNames } = getMonthlyTally();
          const fmtMonth = m => { const [y,mo] = m.split("-"); return new Date(y, mo-1).toLocaleDateString("en-US",{month:"long",year:"numeric"}); };
          const grandTotals = allNames.map(n => months.reduce((s,m)=>s+(byMonth[m][n]||0),0));
          const maxTotal = Math.max(...grandTotals, 1);
          const icons = ["✦","✧","·"];
          return (
            <div className="page">
              <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:24,flexWrap:"wrap"}}>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:30,color:C.white}}>leaderboard</div>
                <span className="tag tag-y">verified shifts only</span>
              </div>
              {allNames.length === 0
                ? <div style={{textAlign:"center",padding:70,color:C.purple,fontFamily:"'DM Sans',sans-serif",fontSize:15}}>no verified shifts yet</div>
                : <div style={{overflowX:"auto",paddingBottom:8}}>
                    <table style={{borderCollapse:"separate",borderSpacing:0,width:"100%",minWidth:months.length>1?500:320}}>
                      <thead>
                        <tr>
                          <th style={{textAlign:"left",padding:"8px 14px",fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:12,color:C.purple,borderBottom:`1.5px solid rgba(242,187,242,0.12)`,whiteSpace:"nowrap"}}>name</th>
                          {months.map(m=>(
                            <th key={m} style={{textAlign:"center",padding:"8px 14px",fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:12,color:C.lilac,borderBottom:`1.5px solid rgba(242,187,242,0.12)`,whiteSpace:"nowrap"}}>{fmtMonth(m)}</th>
                          ))}
                          <th style={{textAlign:"center",padding:"8px 14px",fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:12,color:C.yellow,borderBottom:`1.5px solid rgba(242,187,242,0.12)`,whiteSpace:"nowrap"}}>total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allNames.map((name,i)=>{
                          const total=grandTotals[i];
                          return (
                            <tr key={name} style={{background:i%2===0?"rgba(255,255,255,0.025)":"transparent"}}>
                              <td style={{padding:"11px 14px",borderBottom:`1px solid rgba(242,187,242,0.07)`}}>
                                <div style={{display:"flex",alignItems:"center",gap:8}}>
                                  <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14,color:i===0?C.yellow:C.purple,width:16,flexShrink:0}}>{icons[i]??""}</span>
                                  <div>
                                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,color:C.white}}>{name}</div>
                                    <div style={{background:"rgba(255,255,255,0.07)",borderRadius:3,height:5,width:80,marginTop:4,overflow:"hidden"}}>
                                      <div style={{height:5,borderRadius:3,background:`linear-gradient(90deg,${C.purple},${C.yellow})`,width:`${(total/maxTotal)*100}%`,transition:"width 1s ease"}}/>
                                    </div>
                                  </div>
                                </div>
                              </td>
                              {months.map(m=>{
                                const count=byMonth[m][name]||0;
                                return (
                                  <td key={m} style={{textAlign:"center",padding:"11px 14px",borderBottom:`1px solid rgba(242,187,242,0.07)`}}>
                                    {count>0
                                      ? <span style={{background:"rgba(255,210,0,0.13)",color:C.yellow,borderRadius:20,padding:"3px 12px",fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13}}>{count}</span>
                                      : <span style={{color:"rgba(255,255,255,0.15)",fontSize:13}}>—</span>
                                    }
                                  </td>
                                );
                              })}
                              <td style={{textAlign:"center",padding:"11px 14px",borderBottom:`1px solid rgba(242,187,242,0.07)`}}>
                                <span style={{background:i===0?C.yellow:"rgba(255,210,0,0.13)",color:i===0?C.deep:C.yellow,borderRadius:20,padding:"4px 14px",fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14}}>{total}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
              }
            </div>
          );
        })()}

        {/* ── ADMIN ── */}
        {view==="admin" && isAdmin && (
          <div className="page">
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:14,marginBottom:22}}>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:28,color:C.white}}>manage shifts</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <button className="week-btn" onClick={()=>setWeekOffset(o=>o-1)}>← prev</button>
                <div style={{background:"rgba(242,187,242,0.08)",border:`1.5px solid rgba(242,187,242,0.2)`,borderRadius:50,padding:"5px 16px",fontSize:12,fontWeight:700,color:C.lilac,fontFamily:"'Syne',sans-serif"}}>{getWeekLabel(weekOffset)}</div>
                <button className="week-btn" onClick={()=>setWeekOffset(o=>o+1)}>next →</button>
              </div>
            </div>

            {/* Staff list */}
            <div style={{marginBottom:28}}>
              <div className="glass" style={{padding:18}}>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16,color:C.white,marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
                  staff list
                  <span style={{background:"rgba(242,187,242,0.12)",color:C.soft,borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:600}}>{staffList.length} members</span>
                </div>
                <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
                  <input className="adm-input" placeholder="add staff member name..." value={staffInput}
                    onChange={e=>setStaffInput(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter"&&staffInput.trim()){const n=staffInput.trim();if(!staffList.includes(n)){saveStaffList([...staffList,n]);showToast(`${n} added`);}setStaffInput("");}}}
                    style={{flex:1,minWidth:180,padding:"8px 14px",borderRadius:10,fontSize:13}}/>
                  <button onClick={()=>{const n=staffInput.trim();if(n&&!staffList.includes(n)){saveStaffList([...staffList,n]);showToast(`${n} added`);}setStaffInput("");}}
                    className="btn btn-y" style={{fontSize:13,padding:"8px 18px"}} disabled={!staffInput.trim()}>add</button>
                </div>
                {staffList.length===0
                  ? <div style={{color:C.purple,fontSize:12,fontFamily:"'DM Sans',sans-serif",fontStyle:"italic",padding:"4px 0"}}>no staff members yet</div>
                  : <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                      {[...staffList].sort().map(name=>(
                        <div key={name} style={{display:"flex",alignItems:"center",gap:6,background:"rgba(255,255,255,0.06)",border:`1.5px solid rgba(242,187,242,0.18)`,borderRadius:50,padding:"5px 6px 5px 14px",fontSize:13,fontFamily:"'DM Sans',sans-serif",color:C.white,fontWeight:500}}>
                          {name}
                          <button onClick={()=>{saveStaffList(staffList.filter(n=>n!==name));showToast(`${name} removed`,false);}}
                            style={{background:"rgba(255,90,110,0.15)",border:"none",color:"#ff8096",borderRadius:"50%",width:20,height:20,cursor:"pointer",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontWeight:800,lineHeight:1}}>✕</button>
                        </div>
                      ))}
                    </div>
                }
              </div>
            </div>

            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:600,fontSize:11,color:C.soft,marginBottom:14,letterSpacing:1.5,textTransform:"uppercase"}}>weekly shifts</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14}}>
              {DAYS.map(day=>{
                const dayShifts=shifts[day]||[];
                return (
                  <div key={day} className="glass" style={{padding:16}}>
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16,color:C.white,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span>{day}</span>
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
                          }} style={{background:"rgba(255,90,110,0.12)",border:"1.5px solid rgba(255,90,110,0.25)",color:"#ff8096",borderRadius:50,padding:"3px 10px",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"'Syne',sans-serif",transition:"all .2s"}}
                            onMouseEnter={e=>{e.target.style.background="rgba(255,90,110,0.25)";}}
                            onMouseLeave={e=>{e.target.style.background="rgba(255,90,110,0.12)";}}>
                            close day
                          </button>
                        )}
                      </div>
                    </div>
                    {dayShifts.map((shift,idx)=>{
                      const signups=getSignups(weekKey,day,shift);
                      return (
                        <div key={idx} style={{background:"rgba(0,0,0,0.2)",borderRadius:12,padding:12,marginBottom:10}}>
                          <div style={{display:"flex",gap:6,marginBottom:8}}>
                            <input className="adm-input" value={shift} onChange={e=>updateShiftName(day,idx,e.target.value)}/>
                            <button onClick={()=>removeShift(day,idx)} style={{background:"rgba(255,90,110,.14)",border:"none",color:"#ff8096",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontWeight:800,fontSize:14}}>✕</button>
                          </div>
                          {signups.length===0
                            ? <div style={{color:C.purple,fontSize:11,fontFamily:"'DM Sans',sans-serif",padding:"3px 0"}}>no signups yet</div>
                            : signups.map((s,si)=>(
                              <div key={si} className="person-row">
                                <span className="dot" style={{background:s.verified?"#72ffa8":C.yellow,animation:!s.verified?"pulse 2s infinite":"none"}}/>
                                <span style={{flex:1,fontSize:13,fontFamily:"'DM Sans',sans-serif",color:C.white,fontWeight:500}}>{s.name}</span>
                                {s.verified
                                  ? <span className="tag tag-g">done</span>
                                  : <button onClick={()=>verify(day,shift,si)} style={{background:"rgba(114,255,168,.1)",border:"1px solid rgba(114,255,168,.28)",color:"#72ffa8",borderRadius:20,padding:"2px 10px",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"'Syne',sans-serif"}}>verify</button>
                                }
                                <button onClick={()=>setConfirmRemove({day,shift,idx:si})} style={{background:"none",border:"none",color:C.purple,cursor:"pointer",fontSize:14,padding:"0 2px",lineHeight:1}}>✕</button>
                              </div>
                            ))
                          }
                        </div>
                      );
                    })}
                    <button onClick={()=>addShift(day)} style={{background:"none",border:`1.5px dashed rgba(242,187,242,0.2)`,color:C.purple,padding:"7px 14px",borderRadius:10,cursor:"pointer",fontSize:12,fontWeight:700,width:"100%",fontFamily:"'Syne',sans-serif",transition:"border-color .2s,color .2s"}}
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
                      }} style={{background:`rgba(255,210,0,0.1)`,border:`1.5px solid rgba(255,210,0,0.3)`,color:C.yellow,padding:"7px 14px",borderRadius:10,cursor:"pointer",fontSize:12,fontWeight:700,width:"100%",fontFamily:"'Syne',sans-serif",marginTop:6,transition:"all .2s"}}
                        onMouseEnter={e=>{e.target.style.background="rgba(255,210,0,0.18)";}}
                        onMouseLeave={e=>{e.target.style.background="rgba(255,210,0,0.1)";}}>
                        + unpacking shift
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── CALENDAR ── */}
        {view==="calendar" && (
          <div className="page">
            <div className="glass" style={{padding:"14px 18px",marginBottom:22,display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
              {staffName
                ? <div style={{display:"flex",alignItems:"center",gap:10,flex:1,flexWrap:"wrap"}}>
                    <div style={{background:C.yellow,color:C.deep,borderRadius:50,padding:"5px 16px",fontWeight:800,fontSize:14,fontFamily:"'Syne',sans-serif",flexShrink:0}}>{staffName}</div>
                    <span style={{color:C.soft,fontSize:13,fontFamily:"'DM Sans',sans-serif"}}>tap a shift to sign up</span>
                    <div style={{display:"flex",gap:8,marginLeft:"auto",flexShrink:0}}>
                      <button onClick={()=>setShowDone(true)} className="btn btn-y" style={{fontSize:12,padding:"6px 18px",boxShadow:`0 0 18px ${C.yellow}44`}}>done ✦</button>
                      <button onClick={()=>{setStaffName("");setNameInput("");}} className="btn btn-ghost" style={{fontSize:12,padding:"5px 14px"}}>change</button>
                    </div>
                  </div>
                : <div style={{display:"flex",gap:10,alignItems:"center",flex:1,flexWrap:"wrap"}}>
                    {staffList.length===0
                      ? <div style={{color:C.soft,fontSize:13,fontFamily:"'DM Sans',sans-serif",fontStyle:"italic"}}>no staff added yet — ask your admin to add names</div>
                      : <>
                          <select className="field" value={nameInput} onChange={e=>setNameInput(e.target.value)}
                            style={{flex:1,minWidth:170,cursor:"pointer",appearance:"none",backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23f2bbf2' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,backgroundRepeat:"no-repeat",backgroundPosition:"right 14px center",paddingRight:36}}>
                            <option value="">select your name</option>
                            {[...staffList].sort().map(n=>(
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                          <button onClick={()=>nameInput&&setStaffName(nameInput)} className="btn btn-y" disabled={!nameInput}>go →</button>
                        </>
                    }
                  </div>
              }
              <div style={{display:"flex",gap:7,alignItems:"center",flexShrink:0}}>
                <button className="week-btn" onClick={()=>setWeekOffset(o=>o-1)}>← prev</button>
                <div style={{padding:"5px 12px",fontSize:12,fontWeight:700,color:C.lilac,fontFamily:"'Syne',sans-serif",letterSpacing:.3,whiteSpace:"nowrap"}}>{getWeekLabel(weekOffset)}</div>
                <button className="week-btn" onClick={()=>setWeekOffset(o=>o+1)}>next →</button>
              </div>
            </div>

            {!staffName && (
              <div style={{border:`1.5px dashed rgba(255,210,0,0.28)`,borderRadius:14,padding:"18px 22px",textAlign:"center",marginBottom:20,color:C.yellow,fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,letterSpacing:.4}}>
                select your name to get on the schedule
              </div>
            )}

            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(245px,1fr))",gap:14}}>
              {DAYS.map((day,di)=>{
                const dayShifts=shifts[day]||[];
                return (
                  <div key={day} className="glass" style={{padding:18,animationDelay:`${di*.04}s`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16,color:C.white}}>{day}</div>
                      <div style={{fontFamily:"'Syne',sans-serif",fontSize:11,color:C.purple,fontWeight:600}}>{dayShifts.length} shift{dayShifts.length!==1?"s":""}</div>
                    </div>
                    {dayShifts.length===0
                      ? <div style={{background:"rgba(255,255,255,0.03)",borderRadius:12,padding:16,textAlign:"center",color:C.purple,fontSize:12,fontFamily:"'DM Sans',sans-serif"}}>no shifts</div>
                      : dayShifts.map(shift=>{
                          const signups=getSignups(weekKey,day,shift);
                          const full=signups.length>=MAX_PER_SHIFT;
                          const mine=signups.some(s=>s.name===staffName);
                          return (
                            <div key={shift} className={`shift-block${mine?" mine":""}`}>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                                <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,color:mine?C.yellow:C.lilac}}>{shift}</span>
                                <div style={{display:"flex",gap:3,alignItems:"center"}}>
                                  {Array.from({length:MAX_PER_SHIFT}).map((_,i)=>(
                                    <span key={i} className="dot" style={{background:i<signups.length?(signups[i]?.verified?"#72ffa8":C.yellow):"rgba(255,255,255,0.1)"}}/>
                                  ))}
                                </div>
                              </div>
                              {signups.map((s,si)=>(
                                <div key={si} style={{display:"flex",alignItems:"center",gap:7,padding:"3px 0"}}>
                                  <span className="dot" style={{background:s.verified?"#72ffa8":C.yellow}}/>
                                  <span style={{fontSize:12,color:s.verified?"#72ffa8":C.white,fontFamily:"'DM Sans',sans-serif",fontWeight:s.name===staffName?600:400,flex:1}}>{s.name}</span>
                                  {s.name===staffName&&!s.verified&&<span className="tag tag-y" style={{fontSize:10}}>you</span>}
                                  {s.verified&&<span className="tag tag-g" style={{fontSize:10}}>✓</span>}
                                </div>
                              ))}
                              <div style={{marginTop:10}}>
                                {mine
                                  ? <div style={{display:"flex",flexDirection:"column",gap:6}}>
                                      <a href={makeCalendarLink(weekOffset, day, shift)} target="_blank" rel="noreferrer"
                                        style={{display:"block",textAlign:"center",background:"rgba(255,210,0,0.1)",border:`1.5px solid rgba(255,210,0,0.3)`,color:C.yellow,borderRadius:50,padding:"7px",fontSize:12,fontWeight:700,fontFamily:"'Syne',sans-serif",textDecoration:"none",transition:"all .2s"}}
                                        onMouseEnter={e=>{e.target.style.background="rgba(255,210,0,0.2)";}}
                                        onMouseLeave={e=>{e.target.style.background="rgba(255,210,0,0.1)";}}>
                                        📅 add to google calendar
                                      </a>
                                      <button onClick={()=>cancelSignup(day,shift)} className="btn btn-ghost" style={{width:"100%",fontSize:12,padding:"7px"}}>cancel</button>
                                    </div>
                                  : <button onClick={()=>signUp(day,shift)} className={`btn ${full?"btn-full":"btn-y"}`} disabled={!staffName||full} style={{width:"100%",fontSize:12,padding:"7px"}}>
                                      {full?"full":staffName?"sign up":"select name first"}
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
