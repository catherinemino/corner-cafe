import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DISPLAY_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
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
  mid:    "#3d2470",
  purple: "#7d6b9b",
  lilac:  "#f2bbf2",
  yellow: "#ffd200",
  white:  "#ffffff",
  soft:   "#c9a8e0",
  green:  "#72ffa8",
};

async function dbGet(key) {
  const { data } = await supabase.from("cafe_store").select("value").eq("key", key).single();
  return data ? data.value : null;
}
async function dbSet(key, value) {
  await supabase.from("cafe_store").upsert({ key, value, updated_at: new Date().toISOString() });
}

// Get the Monday of the week for a given offset (0 = this week)
function getMondayForOffset(offset) {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday + offset * 7);
}

// Week key format: "week_YYYY-MM-DD" based on the Monday date
function getWeekKey(offset) {
  const m = getMondayForOffset(offset);
  const pad = n => String(n).padStart(2, "0");
  return `week_${m.getFullYear()}-${pad(m.getMonth()+1)}-${pad(m.getDate())}`;
}

function getWeekLabel(offset) {
  const monday = getMondayForOffset(offset);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const fmt = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

function getDayDate(weekOffset, dayName) {
  const monday = getMondayForOffset(weekOffset);
  const dayIndex = DAYS.indexOf(dayName);
  const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + dayIndex);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function makeCalendarLink(weekOffset, day, shift) {
  const monday = getMondayForOffset(weekOffset);
  const dayIndex = DAYS.indexOf(day);
  const shiftDate = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + dayIndex);
  const pad = n => String(n).padStart(2, "0");
  const dateStr = `${shiftDate.getFullYear()}${pad(shiftDate.getMonth()+1)}${pad(shiftDate.getDate())}`;
  let startStr, endStr;
  const lower = shift.toLowerCase();
  if (lower.includes("flex")) {
    startStr = `${dateStr}T095000`; endStr = `${dateStr}T103500`;
  } else if (lower.includes("lunch")) {
    startStr = `${dateStr}T115000`; endStr = `${dateStr}T123500`;
  } else {
    startStr = `${dateStr}T090000`; endStr = `${dateStr}T100000`;
  }
  const title = encodeURIComponent(`Corner Cafe — ${shift}`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startStr}/${endStr}`;
}

function CafeLogo({ size = 44 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: C.yellow, display: "flex", alignItems: "center",
      justifyContent: "center", flexShrink: 0,
      border: `3px solid ${C.deep}`,
      boxShadow: `3px 3px 0 ${C.deep}`,
    }}>
      <span style={{
        fontFamily: "'Syne', sans-serif", fontWeight: 800,
        fontSize: Math.round(size * 0.32), color: C.deep,
        letterSpacing: "-1.5px", lineHeight: 1, userSelect: "none",
      }}>xoxo</span>
    </div>
  );
}

function Checkers({ c1 = C.yellow, c2 = C.deep, size = 16, opacity = 1 }) {
  return (
    <div style={{
      width: "100vw", marginLeft: "calc(-50vw + 50%)",
      height: size * 2, opacity, flexShrink: 0,
      backgroundImage: `repeating-conic-gradient(${c1} 0% 25%, ${c2} 0% 50%)`,
      backgroundSize: `${size * 2}px ${size * 2}px`,
    }}/>
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

  const weekKey = getWeekKey(weekOffset);

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
    showToast("you're on the schedule! ✦");
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
    showToast("verified ✓");
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

  const getMonthlyTally = () => {
    const byMonth = {};
    const allTimeMonths = new Set();
    Object.entries(data).forEach(([wk, wd]) => {
      // Parse month from key format "week_YYYY-MM-DD"
      const datePart = wk.replace("week_", "");
      const parts = datePart.split("-");
      if (parts.length >= 2) {
        const month = `${parts[0]}-${parts[1]}`;
        allTimeMonths.add(month);
        if (!byMonth[month]) byMonth[month] = {};
        Object.values(wd).forEach(dd => Object.values(dd).forEach(ss => ss.forEach(s => {
          if (s.verified) byMonth[month][s.name] = (byMonth[month][s.name] || 0) + 1;
        })));
      }
    });
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
    allTimeMonths.add(currentMonth);
    const months = [...allTimeMonths].sort();
    const allNames = [...staffList].sort((a, b) => {
      const ta = months.reduce((s,m) => s+((byMonth[m]||{})[a]||0), 0);
      const tb = months.reduce((s,m) => s+((byMonth[m]||{})[b]||0), 0);
      return tb - ta || a.localeCompare(b);
    });
    return { months, byMonth, allNames };
  };

  if (!loaded) return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",background:C.deep,gap:16}}>
      <CafeLogo size={60}/>
      <div style={{color:C.yellow,fontFamily:"'Syne',sans-serif",fontSize:12,letterSpacing:4,textTransform:"uppercase",fontWeight:800}}>loading...</div>
    </div>
  );

  const shifts = getShifts(weekKey);

  const DoneModal = () => {
    const myShifts = [];
    DISPLAY_DAYS.forEach(day => {
      (shifts[day]||[]).forEach(shift => {
        if (getSignups(weekKey, day, shift).some(s => s.name === staffName))
          myShifts.push({ day, shift });
      });
    });
    const closeDone = () => { setShowDone(false); setStaffName(""); setNameInput(""); };
    return (
      <div className="overlay" onClick={closeDone}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <Checkers c1={C.yellow} c2={C.deep} size={13}/>
          <div className="modal-body">
            <div style={{textAlign:"center",marginBottom:20}}>
              <div style={{display:"flex",justifyContent:"center",marginBottom:12}}><CafeLogo size={52}/></div>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:26,color:C.white,marginBottom:4}}>you're all set!</div>
              <div style={{color:C.soft,fontSize:13,fontFamily:"'DM Sans',sans-serif"}}>{getWeekLabel(weekOffset)}</div>
            </div>
            {myShifts.length === 0
              ? <div style={{color:C.soft,fontSize:13,textAlign:"center",fontFamily:"'DM Sans',sans-serif",padding:"14px 0",fontStyle:"italic"}}>no shifts signed up yet</div>
              : <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:22}}>
                  {myShifts.map(({day, shift}, i) => {
                    const verified = getSignups(weekKey, day, shift).find(s => s.name === staffName)?.verified;
                    return (
                      <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(255,255,255,0.05)",border:`2px solid rgba(242,187,242,0.15)`,borderRadius:10,padding:"11px 14px"}}>
                        <div>
                          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13,color:C.white}}>
                            {day} <span style={{color:C.soft,fontWeight:400,fontSize:11}}>{getDayDate(weekOffset, day)}</span>
                          </div>
                          <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:C.soft,marginTop:2}}>{shift}</div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <a href={makeCalendarLink(weekOffset, day, shift)} target="_blank" rel="noreferrer" style={{fontSize:18,textDecoration:"none",lineHeight:1}}>📅</a>
                          <span className={`tag ${verified ? "tag-g" : "tag-y"}`}>{verified ? "verified" : "pending"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
            }
            <button onClick={closeDone} className="btn btn-y" style={{width:"100%",fontSize:13,padding:13}}>done ✓</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{minHeight:"100vh",background:C.deep,color:C.white,fontFamily:"'Syne',sans-serif",overflowX:"hidden"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,400&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:6px;}
        ::-webkit-scrollbar-track{background:${C.deep};}
        ::-webkit-scrollbar-thumb{background:${C.mid};border-radius:4px;}
        @keyframes up{from{opacity:0;transform:translateY(18px);}to{opacity:1;transform:translateY(0);}}
        @keyframes toastPop{from{opacity:0;transform:translateY(10px) scale(.93);}to{opacity:1;transform:translateY(0) scale(1);}}
        @keyframes pulse{0%,100%{opacity:.4;}50%{opacity:1;}}
        .page{animation:up .3s ease both;}
        .nav-pill{background:transparent;border:2px solid rgba(242,187,242,0.3);color:${C.soft};cursor:pointer;font-family:'Syne',sans-serif;font-weight:800;font-size:12px;padding:7px 16px;border-radius:6px;transition:all .18s;white-space:nowrap;text-transform:uppercase;letter-spacing:.5px;}
        .nav-pill:hover{border-color:${C.yellow};color:${C.yellow};}
        .nav-pill.on{background:${C.yellow};border-color:${C.yellow};color:${C.deep};}
        .glass{background:rgba(255,255,255,0.05);border:2px solid rgba(242,187,242,0.15);border-radius:16px;transition:border-color .2s;}
        .glass:hover{border-color:rgba(242,187,242,0.3);}
        .shift-block{background:rgba(255,255,255,0.04);border:2px solid rgba(242,187,242,0.12);border-radius:12px;padding:14px;margin-bottom:10px;transition:all .18s;}
        .shift-block:hover{border-color:rgba(242,187,242,0.28);}
        .shift-block.mine{border-color:${C.yellow};background:rgba(255,210,0,0.06);}
        .btn{border:none;border-radius:6px;padding:10px 22px;cursor:pointer;font-family:'Syne',sans-serif;font-weight:800;font-size:12px;transition:all .18s;white-space:nowrap;text-transform:uppercase;letter-spacing:.5px;}
        .btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,.3);}
        .btn:active:not(:disabled){transform:translateY(0);}
        .btn:disabled{opacity:.3;cursor:not-allowed;}
        .btn-y{background:${C.yellow};color:${C.deep};}
        .btn-ghost{background:transparent;color:${C.lilac};border:2px solid rgba(242,187,242,0.3);}
        .btn-full{background:rgba(255,255,255,0.05);color:${C.soft};border:2px solid rgba(255,255,255,0.08);}
        .btn-danger{background:rgba(255,90,110,.15);color:#ff8096;border:2px solid rgba(255,90,110,.3);}
        .field{background:rgba(255,255,255,0.07);border:2px solid rgba(242,187,242,0.25);color:${C.white};padding:11px 18px;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:14px;outline:none;transition:border-color .2s;width:100%;}
        .field::placeholder{color:rgba(242,187,242,0.35);}
        .field:focus{border-color:${C.yellow};}
        .field option{background:${C.deep};color:${C.white};}
        .week-btn{background:rgba(255,255,255,0.06);border:2px solid rgba(242,187,242,0.2);color:${C.soft};padding:6px 14px;border-radius:6px;cursor:pointer;font-family:'Syne',sans-serif;font-weight:800;font-size:11px;transition:all .18s;text-transform:uppercase;letter-spacing:.5px;}
        .week-btn:hover{border-color:${C.yellow};color:${C.yellow};}
        .adm-input{background:rgba(255,255,255,0.06);border:2px solid rgba(242,187,242,0.18);color:${C.white};padding:7px 12px;border-radius:6px;font-family:'DM Sans',sans-serif;font-size:12px;flex:1;outline:none;}
        .adm-input:focus{border-color:${C.yellow};}
        .overlay{position:fixed;inset:0;background:rgba(5,0,20,.82);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:100;animation:up .2s ease;}
        .modal{background:#1a0b38;border:2px solid rgba(242,187,242,0.2);border-radius:20px;max-width:400px;width:92%;box-shadow:0 30px 80px rgba(0,0,0,.6);overflow:hidden;}
        .modal-body{padding:28px 28px 30px;}
        .dot{width:9px;height:9px;border-radius:50%;display:inline-block;flex-shrink:0;}
        .tag{display:inline-flex;align-items:center;padding:3px 10px;border-radius:4px;font-size:10px;font-weight:800;font-family:'Syne',sans-serif;letter-spacing:.5px;text-transform:uppercase;}
        .tag-y{background:rgba(255,210,0,0.18);color:${C.yellow};}
        .tag-g{background:rgba(114,255,168,0.12);color:${C.green};}
        .person-row{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.06);}
        .person-row:last-child{border-bottom:none;}
        .hero-select{background:rgba(255,255,255,0.07);border:2px solid rgba(242,187,242,0.3);color:${C.white};padding:14px 46px 14px 20px;border-radius:8px;font-family:'Syne',sans-serif;font-size:15px;font-weight:700;outline:none;cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 12 12'%3E%3Cpath fill='%23f2bbf2' d='M6 8L1 3h10z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 16px center;transition:border-color .2s;width:100%;max-width:340px;}
        .hero-select:focus{border-color:${C.yellow};}
        .hero-select option{background:${C.deep};color:${C.white};}
      `}</style>

      {toast && (
        <div style={{position:"fixed",bottom:24,right:20,zIndex:200,background:toast.yellow?C.yellow:C.lilac,color:C.deep,padding:"10px 22px",borderRadius:6,fontWeight:800,fontSize:12,fontFamily:"'Syne',sans-serif",boxShadow:"0 8px 30px rgba(0,0,0,.4)",animation:"toastPop .25s ease",letterSpacing:.5,textTransform:"uppercase"}}>
          {toast.msg}
        </div>
      )}

      {showDone && <DoneModal/>}

      {confirmRemove && (
        <div className="overlay" onClick={()=>setConfirmRemove(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <Checkers c1="rgba(255,90,110,0.6)" c2={C.deep} size={13}/>
            <div className="modal-body">
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:22,marginBottom:8,color:C.white}}>remove signup?</div>
              <p style={{color:C.soft,fontSize:13,marginBottom:24,fontFamily:"'DM Sans',sans-serif",lineHeight:1.6}}>
                Remove <span style={{color:C.lilac,fontWeight:700}}>{getSignups(weekKey,confirmRemove.day,confirmRemove.shift)[confirmRemove.idx]?.name}</span> from this shift?
              </p>
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>setConfirmRemove(null)} className="btn btn-ghost" style={{flex:1}}>cancel</button>
                <button onClick={()=>removeSignup(confirmRemove.day,confirmRemove.shift,confirmRemove.idx)} className="btn btn-danger" style={{flex:1}}>remove</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <header style={{background:C.deep,borderBottom:`2px solid rgba(242,187,242,0.1)`,position:"relative",zIndex:10}}>
        <div style={{padding:"14px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <CafeLogo size={44}/>
            <div>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:20,color:C.white,lineHeight:1}}>Corner Cafe</div>
              <div style={{fontSize:9,color:C.purple,fontWeight:700,letterSpacing:3,textTransform:"uppercase",marginTop:3}}>shift schedule</div>
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
        </div>
        <Checkers c1={C.yellow} c2={C.deep} size={12}/>
      </header>

      <main style={{maxWidth:1200,margin:"0 auto",padding:"28px 16px",position:"relative"}}>

        {view==="login" && (
          <div className="page" style={{maxWidth:400,margin:"60px auto"}}>
            <div className="glass" style={{overflow:"hidden"}}>
              <Checkers c1={C.yellow} c2={C.deep} size={14}/>
              <div style={{padding:32,textAlign:"center"}}>
                <div style={{display:"flex",justifyContent:"center",marginBottom:16}}><CafeLogo size={52}/></div>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:24,color:C.white,marginBottom:6}}>
                  {setupMode ? "create pin" : "admin login"}
                </div>
                <p style={{color:C.soft,fontSize:13,marginBottom:22,fontFamily:"'DM Sans',sans-serif"}}>
                  {setupMode ? "set a pin to protect admin access" : "enter your pin to continue"}
                </p>
                <input className="field" type="password" placeholder={setupMode?"min 4 digits":"pin"} value={pinInput}
                  onChange={e=>setPinInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAdminLogin()}
                  style={{marginBottom:10,textAlign:"center",letterSpacing:12,fontSize:22}}/>
                {pinError && <div style={{color:"#ff8096",fontSize:12,fontWeight:800,marginBottom:12,textTransform:"uppercase",letterSpacing:.5}}>{pinError}</div>}
                <button onClick={handleAdminLogin} className="btn btn-y" style={{width:"100%",fontSize:13,padding:13}}>
                  {setupMode ? "set pin →" : "login →"}
                </button>
              </div>
            </div>
          </div>
        )}

        {view==="stats" && (()=>{
          const { months, byMonth, allNames } = getMonthlyTally();
          const fmtMonth = m => { const [y,mo]=m.split("-"); return new Date(y,mo-1).toLocaleDateString("en-US",{month:"long",year:"numeric"}); };
          const grandTotals = allNames.map(n => months.reduce((s,m)=>s+((byMonth[m]||{})[n]||0),0));
          const maxTotal = Math.max(...grandTotals,1);
          const medals = ["🥇","🥈","🥉"];
          return (
            <div className="page">
              <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:22,flexWrap:"wrap"}}>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:34,color:C.white,lineHeight:1}}>leaderboard</div>
                <span style={{background:`rgba(255,210,0,0.15)`,color:C.yellow,borderRadius:6,padding:"4px 12px",fontSize:11,fontWeight:800,textTransform:"uppercase",letterSpacing:.5}}>verified only ✓</span>
              </div>
              <div className="glass" style={{overflow:"hidden",padding:0}}>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",minWidth:320,borderCollapse:"collapse"}}>
                    <thead>
                      <tr style={{background:"rgba(0,0,0,0.4)"}}>
                        <th style={{textAlign:"left",padding:"13px 16px",fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:11,color:C.soft,textTransform:"uppercase",letterSpacing:.5}}>#</th>
                        <th style={{textAlign:"left",padding:"13px 16px",fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:11,color:C.soft,textTransform:"uppercase",letterSpacing:.5}}>name</th>
                        {months.map(m=>(
                          <th key={m} style={{textAlign:"center",padding:"13px 16px",fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:11,color:C.lilac,textTransform:"uppercase",letterSpacing:.5,whiteSpace:"nowrap"}}>{fmtMonth(m)}</th>
                        ))}
                        <th style={{textAlign:"center",padding:"13px 16px",fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:11,color:C.yellow,textTransform:"uppercase",letterSpacing:.5}}>total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allNames.map((name,i)=>{
                        const total=grandTotals[i];
                        return (
                          <tr key={name} style={{background:i%2===0?"rgba(255,255,255,0.03)":"transparent"}}>
                            <td style={{padding:"12px 16px",borderBottom:`1px solid rgba(242,187,242,0.07)`,fontSize:16}}>
                              {i<3 ? medals[i] : <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,color:C.purple,fontSize:13}}>{i+1}</span>}
                            </td>
                            <td style={{padding:"12px 16px",borderBottom:`1px solid rgba(242,187,242,0.07)`}}>
                              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,color:C.white}}>{name}</div>
                              <div style={{background:"rgba(255,255,255,0.08)",borderRadius:3,height:4,width:80,marginTop:4,overflow:"hidden"}}>
                                <div style={{height:4,borderRadius:3,background:`linear-gradient(90deg,${C.purple},${C.lilac})`,width:`${(total/maxTotal)*100}%`,transition:"width 1s ease"}}/>
                              </div>
                            </td>
                            {months.map(m=>{
                              const count=(byMonth[m]||{})[name]||0;
                              return (
                                <td key={m} style={{textAlign:"center",padding:"12px 16px",borderBottom:`1px solid rgba(242,187,242,0.07)`}}>
                                  {count>0
                                    ? <span style={{background:"rgba(255,210,0,0.15)",color:C.yellow,borderRadius:4,padding:"3px 12px",fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13}}>{count}</span>
                                    : <span style={{color:"rgba(255,255,255,0.2)",fontFamily:"'Syne',sans-serif",fontSize:13}}>0</span>
                                  }
                                </td>
                              );
                            })}
                            <td style={{textAlign:"center",padding:"12px 16px",borderBottom:`1px solid rgba(242,187,242,0.07)`}}>
                              <span style={{background:total>0&&i===0?C.yellow:total>0?"rgba(255,210,0,0.15)":"rgba(255,255,255,0.07)",color:total>0&&i===0?C.deep:total>0?C.yellow:C.soft,borderRadius:4,padding:"4px 14px",fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13}}>{total}</span>
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

        {view==="admin" && isAdmin && (
          <div className="page">
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:14,marginBottom:22}}>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:30,color:C.white}}>manage shifts</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <button className="week-btn" onClick={()=>setWeekOffset(o=>o-1)}>← prev</button>
                <div style={{background:"rgba(255,255,255,0.08)",border:`2px solid rgba(242,187,242,0.2)`,borderRadius:6,padding:"6px 14px",fontSize:11,fontWeight:800,color:C.lilac,fontFamily:"'Syne',sans-serif",textTransform:"uppercase",letterSpacing:.5}}>{getWeekLabel(weekOffset)}</div>
                <button className="week-btn" onClick={()=>setWeekOffset(o=>o+1)}>next →</button>
              </div>
            </div>
            <div style={{marginBottom:22}}>
              <div className="glass" style={{padding:18}}>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13,color:C.white,marginBottom:14,display:"flex",alignItems:"center",gap:10,textTransform:"uppercase",letterSpacing:.5}}>
                  staff list
                  <span style={{background:"rgba(242,187,242,0.1)",color:C.soft,borderRadius:4,padding:"2px 10px",fontSize:10,fontWeight:800}}>{staffList.length} members</span>
                </div>
                <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
                  <input className="adm-input" placeholder="add name..." value={staffInput}
                    onChange={e=>setStaffInput(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter"&&staffInput.trim()){const n=staffInput.trim();if(!staffList.includes(n)){saveStaffList([...staffList,n]);showToast(`${n} added`);}setStaffInput("");}}}
                    style={{flex:1,minWidth:160,padding:"8px 12px",fontSize:13}}/>
                  <button onClick={()=>{const n=staffInput.trim();if(n&&!staffList.includes(n)){saveStaffList([...staffList,n]);showToast(`${n} added`);}setStaffInput("");}}
                    className="btn btn-y" style={{fontSize:11,padding:"8px 16px"}} disabled={!staffInput.trim()}>+ add</button>
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                  {[...staffList].sort().map(name=>(
                    <div key={name} style={{display:"flex",alignItems:"center",gap:5,background:"rgba(255,255,255,0.06)",border:`2px solid rgba(242,187,242,0.15)`,borderRadius:6,padding:"4px 5px 4px 12px",fontSize:12,fontFamily:"'DM Sans',sans-serif",color:C.white}}>
                      {name}
                      <button onClick={()=>{saveStaffList(staffList.filter(n=>n!==name));showToast(`${name} removed`,false);}}
                        style={{background:"rgba(255,90,110,0.2)",border:"none",color:"#ff8096",borderRadius:4,width:18,height:18,cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontWeight:800}}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:10,color:C.soft,marginBottom:14,letterSpacing:2,textTransform:"uppercase"}}>weekly shifts — {getWeekLabel(weekOffset)}</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
              {DAYS.map(day=>{
                const dayShifts=shifts[day]||[];
                const dateLabel=getDayDate(weekOffset,day);
                return (
                  <div key={day} className="glass" style={{padding:16}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                      <div>
                        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,color:C.white,lineHeight:1}}>{day}</div>
                        <div style={{fontSize:11,color:C.soft,marginTop:3,fontFamily:"'DM Sans',sans-serif"}}>{dateLabel}</div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:7}}>
                        <span style={{color:C.purple,fontSize:10,fontWeight:700,textTransform:"uppercase"}}>{dayShifts.length} shifts</span>
                        {dayShifts.length>0&&(
                          <button onClick={()=>{const cur=getShifts(weekKey);const nc=JSON.parse(JSON.stringify(shiftsConfig));if(!nc[weekKey])nc[weekKey]=JSON.parse(JSON.stringify(cur));nc[weekKey][day]=[];saveShiftsConfig(nc);showToast(`${day} closed`,false);}}
                            style={{background:"rgba(255,90,110,0.1)",border:`2px solid rgba(255,90,110,0.25)`,color:"#ff8096",borderRadius:4,padding:"2px 8px",cursor:"pointer",fontSize:10,fontWeight:800,fontFamily:"'Syne',sans-serif",textTransform:"uppercase"}}>close</button>
                        )}
                      </div>
                    </div>
                    {dayShifts.map((shift,idx)=>{
                      const signups=getSignups(weekKey,day,shift);
                      return (
                        <div key={idx} style={{background:"rgba(0,0,0,0.2)",border:`2px solid rgba(242,187,242,0.1)`,borderRadius:8,padding:10,marginBottom:8}}>
                          <div style={{display:"flex",gap:6,marginBottom:7}}>
                            <input className="adm-input" value={shift} onChange={e=>updateShiftName(day,idx,e.target.value)} style={{fontSize:12}}/>
                            <button onClick={()=>removeShift(day,idx)} style={{background:"rgba(255,90,110,.12)",border:"none",color:"#ff8096",borderRadius:4,padding:"4px 8px",cursor:"pointer",fontWeight:800,fontSize:12}}>✕</button>
                          </div>
                          {signups.length===0
                            ? <div style={{color:C.purple,fontSize:11,fontFamily:"'DM Sans',sans-serif",fontStyle:"italic"}}>no signups yet</div>
                            : signups.map((s,si)=>(
                              <div key={si} className="person-row">
                                <span className="dot" style={{background:s.verified?C.green:C.yellow,animation:!s.verified?"pulse 2s infinite":"none"}}/>
                                <span style={{flex:1,fontSize:12,fontFamily:"'DM Sans',sans-serif",color:C.white,fontWeight:500}}>{s.name}</span>
                                {s.verified
                                  ? <span className="tag tag-g">done</span>
                                  : <button onClick={()=>verify(day,shift,si)} style={{background:"rgba(114,255,168,0.08)",border:`2px solid rgba(114,255,168,0.25)`,color:C.green,borderRadius:4,padding:"2px 8px",cursor:"pointer",fontSize:10,fontWeight:800,fontFamily:"'Syne',sans-serif",textTransform:"uppercase"}}>verify</button>
                                }
                                <button onClick={()=>setConfirmRemove({day,shift,idx:si})} style={{background:"none",border:"none",color:C.purple,cursor:"pointer",fontSize:14,padding:"0 2px"}}>✕</button>
                              </div>
                            ))
                          }
                        </div>
                      );
                    })}
                    <button onClick={()=>addShift(day)} style={{background:"none",border:`2px dashed rgba(242,187,242,0.18)`,color:C.purple,padding:"7px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:800,width:"100%",fontFamily:"'Syne',sans-serif",textTransform:"uppercase",letterSpacing:.5,transition:"all .18s"}}
                      onMouseEnter={e=>{e.target.style.borderColor=C.lilac;e.target.style.color=C.lilac;}}
                      onMouseLeave={e=>{e.target.style.borderColor="rgba(242,187,242,0.18)";e.target.style.color=C.purple;}}>
                      + add shift
                    </button>
                    {day==="Friday"&&!dayShifts.includes("Unpacking")&&(
                      <button onClick={()=>{const cur=getShifts(weekKey);const nc=JSON.parse(JSON.stringify(shiftsConfig));if(!nc[weekKey])nc[weekKey]=JSON.parse(JSON.stringify(cur));nc[weekKey]["Friday"].push("Unpacking");saveShiftsConfig(nc);showToast("unpacking added");}}
                        className="btn btn-y" style={{width:"100%",fontSize:11,padding:"8px",marginTop:6}}>
                        + unpacking shift 📦
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view==="calendar" && (
          <div className="page">
            {!staffName && (
              <div style={{marginBottom:26}}>
                <div className="glass" style={{overflow:"hidden"}}>
                  <Checkers c1={C.yellow} c2={C.deep} size={16}/>
                  <div style={{padding:"36px 28px",textAlign:"center"}}>
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:34,color:C.white,marginBottom:8,lineHeight:1.1}}>hey! who are you? 👋</div>
                    <div style={{color:C.soft,fontSize:15,fontFamily:"'DM Sans',sans-serif",marginBottom:28}}>pick your name to sign up for shifts this week</div>
                    {staffList.length===0
                      ? <div style={{color:C.soft,fontSize:13,fontFamily:"'DM Sans',sans-serif",fontStyle:"italic"}}>no staff added yet — ask your admin</div>
                      : <div style={{display:"flex",gap:12,justifyContent:"center",alignItems:"center",flexWrap:"wrap"}}>
                          <select className="hero-select" value={nameInput} onChange={e=>setNameInput(e.target.value)}>
                            <option value="">select your name ▾</option>
                            {[...staffList].sort().map(n=>(<option key={n} value={n}>{n}</option>))}
                          </select>
                          <button onClick={()=>nameInput&&setStaffName(nameInput)} className="btn btn-y" disabled={!nameInput}
                            style={{fontSize:15,padding:"14px 30px",boxShadow:`0 0 28px rgba(255,210,0,0.3)`}}>
                            let's go →
                          </button>
                        </div>
                    }
                  </div>
                  <Checkers c1={C.deep} c2={C.yellow} size={16}/>
                </div>
              </div>
            )}

            {staffName && (
              <div className="glass" style={{padding:"13px 18px",marginBottom:20,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <div style={{background:C.yellow,color:C.deep,borderRadius:6,padding:"6px 16px",fontWeight:800,fontSize:13,fontFamily:"'Syne',sans-serif",flexShrink:0,textTransform:"uppercase"}}>{staffName}</div>
                <span style={{color:C.soft,fontSize:13,fontFamily:"'DM Sans',sans-serif"}}>tap a shift to sign up</span>
                <div style={{display:"flex",gap:8,marginLeft:"auto",flexShrink:0}}>
                  <button onClick={()=>setShowDone(true)} className="btn btn-y" style={{fontSize:11,padding:"7px 18px"}}>done ✦</button>
                  <button onClick={()=>{setStaffName("");setNameInput("");}} className="btn btn-ghost" style={{fontSize:11,padding:"7px 14px"}}>change</button>
                </div>
              </div>
            )}

            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:20,flexWrap:"wrap"}}>
              <button className="week-btn" onClick={()=>setWeekOffset(o=>o-1)}>← prev week</button>
              <div style={{background:"rgba(255,255,255,0.08)",border:`2px solid rgba(242,187,242,0.2)`,borderRadius:6,padding:"7px 16px",fontSize:11,fontWeight:800,color:C.lilac,fontFamily:"'Syne',sans-serif",textTransform:"uppercase",letterSpacing:.5,whiteSpace:"nowrap"}}>{getWeekLabel(weekOffset)}</div>
              <button className="week-btn" onClick={()=>setWeekOffset(o=>o+1)}>next week →</button>
            </div>

            {[["Monday","Tuesday","Wednesday"],["Thursday","Friday"]].map((rowDays, rowIdx) => (
              <div key={rowIdx} style={{display:"grid",gridTemplateColumns:`repeat(${rowDays.length}, 1fr)`,gap:14,marginBottom:14}}>
                {rowDays.map((day) => {
                  const dayShifts = shifts[day] || [];
                  const dateLabel = getDayDate(weekOffset, day);
                  return (
                    <div key={day} className="glass" style={{padding:18}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                        <div>
                          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,color:C.white,lineHeight:1}}>{day}</div>
                          <div style={{fontSize:12,color:C.soft,marginTop:4,fontFamily:"'DM Sans',sans-serif"}}>{dateLabel}</div>
                        </div>
                        <span style={{background:"rgba(242,187,242,0.1)",color:C.soft,borderRadius:4,padding:"2px 8px",fontSize:10,fontWeight:800,textTransform:"uppercase"}}>{dayShifts.length} shift{dayShifts.length!==1?"s":""}</span>
                      </div>
                      {dayShifts.length === 0
                        ? <div style={{background:"rgba(255,255,255,0.03)",borderRadius:8,padding:16,textAlign:"center",color:C.purple,fontSize:12,fontFamily:"'DM Sans',sans-serif"}}>no shifts this day</div>
                        : dayShifts.map(shift => {
                            const signups = getSignups(weekKey, day, shift);
                            const full = signups.length >= MAX_PER_SHIFT;
                            const mine = signups.some(s => s.name === staffName);
                            return (
                              <div key={shift} className={`shift-block${mine ? " mine" : ""}`}>
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                                  <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16,color:mine?C.yellow:C.lilac,lineHeight:1.2}}>{shift}</span>
                                  <div style={{display:"flex",gap:3,flexShrink:0,marginLeft:8}}>
                                    {Array.from({length:MAX_PER_SHIFT}).map((_,i)=>(
                                      <span key={i} className="dot" style={{background:i<signups.length?(signups[i]?.verified?C.green:C.yellow):"rgba(255,255,255,0.1)"}}/>
                                    ))}
                                  </div>
                                </div>
                                {signups.map((s, si) => (
                                  <div key={si} style={{display:"flex",alignItems:"center",gap:7,padding:"3px 0"}}>
                                    <span className="dot" style={{background:s.verified?C.green:C.yellow}}/>
                                    <span style={{fontSize:13,color:s.verified?C.green:C.white,fontFamily:"'DM Sans',sans-serif",fontWeight:s.name===staffName?700:400,flex:1}}>{s.name}</span>
                                    {s.name===staffName&&!s.verified&&<span className="tag tag-y">you</span>}
                                    {s.verified&&<span className="tag tag-g">✓</span>}
                                  </div>
                                ))}
                                <div style={{marginTop:10}}>
                                  {mine
                                    ? <div style={{display:"flex",flexDirection:"column",gap:6}}>
                                        <a href={makeCalendarLink(weekOffset,day,shift)} target="_blank" rel="noreferrer"
                                          style={{display:"block",textAlign:"center",background:"rgba(255,210,0,0.1)",border:`2px solid rgba(255,210,0,0.3)`,color:C.yellow,borderRadius:6,padding:"8px",fontSize:11,fontWeight:800,fontFamily:"'Syne',sans-serif",textDecoration:"none",transition:"all .18s",textTransform:"uppercase",letterSpacing:.4}}
                                          onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,210,0,0.2)";}}
                                          onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,210,0,0.1)";}}>
                                          📅 add to google calendar
                                        </a>
                                        <button onClick={()=>cancelSignup(day,shift)} className="btn btn-ghost" style={{width:"100%",fontSize:11,padding:"7px"}}>cancel signup</button>
                                      </div>
                                    : <button onClick={()=>signUp(day,shift)} className={`btn ${full?"btn-full":"btn-y"}`} disabled={!staffName||full} style={{width:"100%",fontSize:!staffName?9:12,padding:"9px"}}>
                                        {full ? "shift full" : staffName ? "sign up ✦" : "pick your name first"}
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
            ))}
          </div>
        )}
      </main>

      <div style={{marginTop:48}}>
        <Checkers c1={C.yellow} c2={C.deep} size={12} opacity={0.6}/>
      </div>
    </div>
  );
}
// Mon Mar 23 15:39:54 PDT 2026
