import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "./supabase";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const CALENDAR_ROWS = [["Monday", "Tuesday", "Wednesday"], ["Thursday", "Friday"]];
// NOTE: the database also enforces 5 per shift (see supabase-signups-setup.sql).
const MAX_PER_SHIFT = 5;
const EMPTY = [];

const DEFAULT_SHIFTS = {
  Monday:    ["Flex (9:50–10:35am)", "Lunch (11:50am–12:35pm)"],
  Tuesday:   ["Lunch (11:50am–12:35pm)"],
  Wednesday: ["Lunch (11:50am–12:35pm)"],
  Thursday:  ["Lunch (11:50am–12:35pm)"],
  Friday:    ["Flex (9:50–10:35am)", "Lunch (11:50am–12:35pm)"],
  Saturday:  [],
  Sunday:    [],
};

const DEFAULT_STAFF = ["Emily","Daisy","Amira","Mila B.","Eleanor S.","Aubrey","Alex","Jaya","Caidyn","Maggie","Juliette","Emma MW.","Malia","Nyah","Aisling","Anya","Audrey","MacKensie","Rosalie","Diana","Phylicia","Noelle","Sage","Mila V.","Eloise","Dorothy","Brooke","Annabelle","Jo","Madeline","Stella","Eleanor V.","Poppy","Lux","Inez","Julia","Sloan"];

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

// ───────────────────────── dates ─────────────────────────
const pad2 = n => String(n).padStart(2, "0");
const toISO = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseISO = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// Monday of the week, offset 0 = this week
function getMondayForOffset(offset) {
  const now = new Date();
  const dow = now.getDay(); // 0 = Sunday
  const sinceMonday = dow === 0 ? 6 : dow - 1;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMonday + offset * 7);
}
const getDayISO = (offset, dayName) => toISO(addDays(getMondayForOffset(offset), DAYS.indexOf(dayName)));

function getWeekLabel(offset) {
  const monday = getMondayForOffset(offset);
  const fmt = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(monday)} – ${fmt(addDays(monday, 6))}`;
}
function getDayDate(offset, dayName) {
  return parseISO(getDayISO(offset, dayName)).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Pull "9:50–10:35am" style times out of a shift name; falls back to the usual Flex / Lunch times.
function parseShiftTimes(shift) {
  const m = shift.match(/(\d{1,2}):(\d{2})\s*(am|pm)?\s*[–-]\s*(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (m) {
    const endMer = (m[6] || m[3] || "").toLowerCase();
    const startMer = (m[3] || m[6] || "").toLowerCase();
    const to24 = (h, mer) => (mer === "pm" ? (h % 12) + 12 : mer === "am" ? h % 12 : h);
    let sh = to24(parseInt(m[1], 10), startMer);
    const sm = parseInt(m[2], 10);
    const eh = to24(parseInt(m[4], 10), endMer);
    const em = parseInt(m[5], 10);
    if (!m[3] && sh * 60 + sm > eh * 60 + em) sh -= 12; // e.g. 11:30–1:00pm
    return [[sh, sm], [eh, em]];
  }
  const lower = shift.toLowerCase();
  if (lower.includes("flex")) return [[9, 50], [10, 35]];
  if (lower.includes("lunch")) return [[11, 50], [12, 35]];
  return [[9, 0], [10, 0]];
}

function makeCalendarLink(dateISO, shift) {
  const dateStr = dateISO.replace(/-/g, "");
  const [[sh, sm], [eh, em]] = parseShiftTimes(shift);
  const t = (h, m) => `${pad2(h)}${pad2(m)}00`;
  const title = encodeURIComponent(`Corner Cafe — ${shift}`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dateStr}T${t(sh, sm)}/${dateStr}T${t(eh, em)}`;
}

// ───────────────────────── database ─────────────────────────
// Staff list + admin PIN still live in cafe_store (small, rarely changed).
async function dbGet(key) {
  const { data, error } = await supabase.from("cafe_store").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  return data ? data.value : null;
}
async function dbSet(key, value) {
  const { error } = await supabase.from("cafe_store").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// Signups are one row each. We only ever load the week being viewed.
async function fetchWeek(weekStart, weekEnd) {
  const [s, c] = await Promise.all([
    supabase.from("signups")
      .select("id, shift_date, shift_name, staff_name, verified")
      .gte("shift_date", weekStart).lte("shift_date", weekEnd)
      .order("created_at", { ascending: true }).order("id", { ascending: true }),
    supabase.from("week_shifts").select("config").eq("week_start", weekStart).maybeSingle(),
  ]);
  if (s.error) throw s.error;
  if (c.error) throw c.error;
  return { rows: s.data || [], config: c.data ? c.data.config : null };
}

// Leaderboard: every verified signup, in pages so we never hit the 1000-row cap.
async function fetchAllVerified() {
  const out = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase.from("signups")
      .select("shift_date, staff_name").eq("verified", true)
      .order("shift_date", { ascending: true }).order("id", { ascending: true })
      .range(from, from + size - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < size) break;
  }
  return out;
}

// ───────────────────────── small components ─────────────────────────
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

// Saves when you click away or press Enter (not on every keystroke).
function ShiftNameInput({ value, onCommit }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  const commit = () => {
    const v = draft.trim();
    if (!v || v === value) { setDraft(value); return; }
    onCommit(v);
  };
  return (
    <input className="adm-input" value={draft} style={{ fontSize: 12 }}
      onChange={e => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}/>
  );
}

// ───────────────────────── app ─────────────────────────
export default function CornerCafe() {
  const [view, setView] = useState("calendar");
  // On Sundays, start on the upcoming week
  const [weekOffset, setWeekOffset] = useState(new Date().getDay() === 0 ? 1 : 0);
  const [staffName, setStaffName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [pinError, setPinError] = useState("");
  const [setupMode, setSetupMode] = useState(false);
  const [staffList, setStaffList] = useState([]);
  const [staffInput, setStaffInput] = useState("");
  const [storedPin, setStoredPin] = useState(null);
  const [basicsLoaded, setBasicsLoaded] = useState(false);
  const [basicsError, setBasicsError] = useState("");
  const [weekData, setWeekData] = useState({ weekStart: null, rows: EMPTY, config: null });
  const [loadError, setLoadError] = useState("");
  const [lbRows, setLbRows] = useState(null);
  const [lbError, setLbError] = useState("");
  const [toast, setToast] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [showDone, setShowDone] = useState(false);

  const seqRef = useRef(0);          // bumps on every change so older, slower refreshes are ignored
  const refreshRef = useRef(null);
  const cfgQueue = useRef(Promise.resolve());

  const weekStart = toISO(getMondayForOffset(weekOffset));
  const weekEnd = toISO(addDays(parseISO(weekStart), 6));
  const ready = weekData.weekStart === weekStart;
  const rows = ready ? weekData.rows : EMPTY;
  const shifts = ready && weekData.config ? weekData.config : DEFAULT_SHIFTS;

  const showToast = (msg, yellow = true) => {
    setToast({ msg, yellow });
    setTimeout(() => setToast(null), 2600);
  };
  const bump = () => { seqRef.current += 1; };
  const refresh = () => { if (refreshRef.current) refreshRef.current(); };
  const mutateRows = fn =>
    setWeekData(prev => (prev.weekStart === weekStart ? { ...prev, rows: fn(prev.rows) } : prev));

  // ── staff list + admin PIN (loaded once, retried until it works) ──
  const loadBasics = async () => {
    try {
      const [staffRaw, pinRaw] = await Promise.all([dbGet("cc_staff"), dbGet("cc_pin")]);
      let list = DEFAULT_STAFF;
      if (staffRaw) { try { const p = JSON.parse(staffRaw); if (Array.isArray(p)) list = p; } catch {} }
      setStaffList(list);
      if (pinRaw) { setStoredPin(pinRaw); setSetupMode(false); } else { setSetupMode(true); }
      setBasicsError("");
      setBasicsLoaded(true);
    } catch {
      setBasicsError("can't reach the server right now");
    }
  };
  useEffect(() => { loadBasics(); }, []);
  useEffect(() => {
    if (basicsLoaded) return undefined;
    const id = setInterval(loadBasics, 5000);
    return () => clearInterval(id);
  }, [basicsLoaded]);

  // ── the viewed week: load now, then refresh every 15s and whenever the tab comes back ──
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const mySeq = seqRef.current;
      try {
        const res = await fetchWeek(weekStart, weekEnd);
        if (cancelled || mySeq !== seqRef.current) return; // something changed while loading; a newer refresh is coming
        setWeekData({ weekStart, rows: res.rows, config: res.config });
        setLoadError("");
      } catch {
        if (!cancelled) setLoadError("can't reach the schedule right now. trying again…");
      }
    };
    refreshRef.current = run;
    run();
    const id = setInterval(() => { if (!document.hidden) run(); }, 15000);
    const onVisible = () => { if (!document.hidden) run(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [weekStart, weekEnd]);

  // ── leaderboard: load when opened, refresh every 30s while open ──
  useEffect(() => {
    if (view !== "stats") return undefined;
    let cancelled = false;
    const run = async () => {
      try {
        const data = await fetchAllVerified();
        if (!cancelled) { setLbRows(data); setLbError(""); }
      } catch {
        if (!cancelled) setLbError("couldn't load the leaderboard. trying again…");
      }
    };
    run();
    const id = setInterval(run, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [view]);

  const signupMap = useMemo(() => {
    const m = new Map();
    rows.forEach(r => {
      const k = `${r.shift_date}|${r.shift_name}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    });
    return m;
  }, [rows]);
  const getSignups = (day, shift) => signupMap.get(`${getDayISO(weekOffset, day)}|${shift}`) || EMPTY;

  // ── signups: every action touches only that one row ──
  const signUp = async (day, shift) => {
    if (!staffName || !ready) return;
    const date = getDayISO(weekOffset, day);
    const existing = getSignups(day, shift);
    if (existing.length >= MAX_PER_SHIFT || existing.some(s => s.staff_name === staffName)) return;
    const tmp = { id: `tmp-${Date.now()}`, shift_date: date, shift_name: shift, staff_name: staffName, verified: false };
    mutateRows(r => [...r, tmp]);
    bump();
    const { error } = await supabase.from("signups").insert({ shift_date: date, shift_name: shift, staff_name: staffName });
    if (!error) {
      showToast("you're on the schedule! ✦");
    } else {
      mutateRows(r => r.filter(x => x.id !== tmp.id));
      if (error.code === "23505") showToast("you're already on that shift", false);
      else if ((error.message || "").includes("shift_full")) showToast("that shift just filled up", false);
      else showToast("couldn't save, please try again", false);
    }
    bump();
    refresh();
  };

  const deleteRow = async (row, okMsg) => {
    if (String(row.id).startsWith("tmp-")) { showToast("still saving, try again in a second", false); return; }
    mutateRows(r => r.filter(x => x.id !== row.id));
    bump();
    const { error } = await supabase.from("signups").delete().eq("id", row.id);
    if (error) {
      mutateRows(r => (r.some(x => x.id === row.id) ? r : [...r, row]));
      showToast("couldn't remove, please try again", false);
    } else {
      showToast(okMsg, false);
    }
    bump();
    refresh();
  };

  const cancelSignup = (day, shift) => {
    const mine = getSignups(day, shift).find(s => s.staff_name === staffName);
    if (mine) deleteRow(mine, "signup removed");
  };

  const verify = async row => {
    if (String(row.id).startsWith("tmp-")) { showToast("still saving, try again in a second", false); return; }
    mutateRows(r => r.map(x => (x.id === row.id ? { ...x, verified: true } : x)));
    bump();
    const { error } = await supabase.from("signups").update({ verified: true }).eq("id", row.id);
    if (error) {
      mutateRows(r => r.map(x => (x.id === row.id ? { ...x, verified: false } : x)));
      showToast("couldn't verify, please try again", false);
    } else {
      showToast("verified ✓");
    }
    bump();
    refresh();
  };

  // ── shift setup for the viewed week (admin) ──
  // Always re-reads the saved setup right before changing it, one change at a time.
  const saveWeekConfig = mutator => {
    const ws = weekStart;
    const job = cfgQueue.current.then(async () => {
      let ok = false;
      try {
        const { data, error } = await supabase.from("week_shifts").select("config").eq("week_start", ws).maybeSingle();
        if (error) throw error;
        const base = JSON.parse(JSON.stringify(data ? data.config : DEFAULT_SHIFTS));
        DAYS.forEach(d => { if (!base[d]) base[d] = []; });
        const next = mutator(base) || base;
        const { error: e2 } = await supabase.from("week_shifts")
          .upsert({ week_start: ws, config: next, updated_at: new Date().toISOString() });
        if (e2) throw e2;
        setWeekData(prev => (prev.weekStart === ws ? { ...prev, config: next } : prev));
        ok = true;
      } catch {
        showToast("couldn't save, please try again", false);
      }
      bump();
      refresh();
      return ok;
    });
    cfgQueue.current = job.catch(() => false);
    return job;
  };

  const updateShiftName = async (day, idx, oldName, newName) => {
    if ((shifts[day] || []).some((s, i) => i !== idx && s === newName)) {
      showToast("that day already has a shift with that name", false);
      return;
    }
    const ok = await saveWeekConfig(base => { base[day][idx] = newName; });
    if (!ok) return;
    // move the people who signed up onto the renamed shift
    const { error } = await supabase.from("signups").update({ shift_name: newName })
      .eq("shift_date", getDayISO(weekOffset, day)).eq("shift_name", oldName);
    if (error) showToast("renamed, but couldn't move the signups", false);
    bump();
    refresh();
  };

  const addShift = day => saveWeekConfig(base => {
    let name = "New Shift";
    let n = 2;
    while (base[day].includes(name)) { name = `New Shift ${n}`; n += 1; }
    base[day].push(name);
  });

  const removeShift = (day, idx) => {
    const name = (shifts[day] || [])[idx];
    const count = getSignups(day, name).length;
    if (count > 0 && !window.confirm(
      `This shift has ${count} signup${count === 1 ? "" : "s"}. They'll be hidden (not deleted) until a shift with the same name is added back. Remove it?`
    )) return;
    saveWeekConfig(base => { base[day].splice(idx, 1); });
  };

  const closeDay = day => {
    const count = (shifts[day] || []).reduce((n, s) => n + getSignups(day, s).length, 0);
    if (count > 0 && !window.confirm(
      `${day} has ${count} signup${count === 1 ? "" : "s"}. They'll be hidden (not deleted) until the shifts are added back. Close the day?`
    )) return;
    saveWeekConfig(base => { base[day] = []; }).then(ok => { if (ok) showToast(`${day} closed`, false); });
  };

  const addUnpacking = () => saveWeekConfig(base => {
    if (!base.Friday.includes("Unpacking")) base.Friday.push("Unpacking");
  }).then(ok => { if (ok) showToast("unpacking added"); });

  // ── staff list (admin) ──
  const changeStaff = async (fn, msg, yellow = true) => {
    try {
      const raw = await dbGet("cc_staff");
      let cur = DEFAULT_STAFF;
      if (raw) { try { const p = JSON.parse(raw); if (Array.isArray(p)) cur = p; } catch {} }
      const next = fn(cur);
      if (!next) return;
      await dbSet("cc_staff", JSON.stringify(next));
      setStaffList(next);
      showToast(msg, yellow);
    } catch {
      showToast("couldn't save, please try again", false);
    }
  };
  const addStaff = () => {
    const n = staffInput.trim();
    if (!n) return;
    changeStaff(cur => (cur.includes(n) ? null : [...cur, n]), `${n} added`);
    setStaffInput("");
  };

  // ── admin pin ──
  const handleAdminLogin = async () => {
    if (setupMode) {
      if (pinInput.length < 4) { setPinError("min 4 digits"); return; }
      try { await dbSet("cc_pin", pinInput); } catch { setPinError("couldn't save pin, try again"); return; }
      setStoredPin(pinInput); setIsAdmin(true); setSetupMode(false);
      setPinInput(""); setPinError(""); setView("admin");
    } else if (pinInput === storedPin) {
      setIsAdmin(true); setPinInput(""); setPinError(""); setView("admin");
    } else {
      setPinError("wrong pin");
    }
  };

  // ── leaderboard: each shift counts in the month it actually happened ──
  const getMonthlyTally = () => {
    const byMonth = {};
    (lbRows || []).forEach(r => {
      const m = r.shift_date.slice(0, 7);
      if (!byMonth[m]) byMonth[m] = {};
      byMonth[m][r.staff_name] = (byMonth[m][r.staff_name] || 0) + 1;
    });
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
    const months = [...new Set([...Object.keys(byMonth), currentMonth])].sort();
    const total = n => months.reduce((s, m) => s + ((byMonth[m] || {})[n] || 0), 0);
    const allNames = [...staffList].sort((a, b) => total(b) - total(a) || a.localeCompare(b));
    return { months, byMonth, allNames };
  };

  // ───────────────────────── screens ─────────────────────────
  if (!basicsLoaded) return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",background:C.deep,gap:16,padding:24,textAlign:"center"}}>
      <CafeLogo size={60}/>
      <div style={{color:C.yellow,fontFamily:"'Syne',sans-serif",fontSize:12,letterSpacing:4,textTransform:"uppercase",fontWeight:800}}>
        {basicsError ? basicsError : "loading..."}
      </div>
      {basicsError && (
        <button onClick={loadBasics} style={{background:C.yellow,color:C.deep,border:"none",borderRadius:6,padding:"10px 22px",fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:12,textTransform:"uppercase",cursor:"pointer"}}>try again</button>
      )}
    </div>
  );

  const myShifts = [];
  if (showDone) {
    CALENDAR_ROWS.flat().forEach(day => {
      (shifts[day] || []).forEach(shift => {
        const mine = getSignups(day, shift).find(s => s.staff_name === staffName);
        if (mine) myShifts.push({ day, shift, verified: mine.verified });
      });
    });
  }
  const closeDone = () => { setShowDone(false); setStaffName(""); setNameInput(""); };

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

      {/* Done modal */}
      {showDone && (
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
                    {myShifts.map(({ day, shift, verified }, i) => (
                      <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(255,255,255,0.05)",border:"2px solid rgba(242,187,242,0.15)",borderRadius:10,padding:"11px 14px"}}>
                        <div>
                          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13,color:C.white}}>
                            {day} <span style={{color:C.soft,fontWeight:400,fontSize:11}}>{getDayDate(weekOffset, day)}</span>
                          </div>
                          <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:C.soft,marginTop:2}}>{shift}</div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <a href={makeCalendarLink(getDayISO(weekOffset, day), shift)} target="_blank" rel="noreferrer" style={{fontSize:18,textDecoration:"none",lineHeight:1}}>📅</a>
                          <span className={`tag ${verified ? "tag-g" : "tag-y"}`}>{verified ? "verified" : "pending"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
              }
              <button onClick={closeDone} className="btn btn-y" style={{width:"100%",fontSize:13,padding:13}}>done ✓</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm remove modal */}
      {confirmRemove && (
        <div className="overlay" onClick={() => setConfirmRemove(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <Checkers c1="rgba(255,90,110,0.6)" c2={C.deep} size={13}/>
            <div className="modal-body">
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:22,marginBottom:8,color:C.white}}>remove signup?</div>
              <p style={{color:C.soft,fontSize:13,marginBottom:24,fontFamily:"'DM Sans',sans-serif",lineHeight:1.6}}>
                Remove <span style={{color:C.lilac,fontWeight:700}}>{confirmRemove.staff_name}</span> from this shift?
              </p>
              <div style={{display:"flex",gap:10}}>
                <button onClick={() => setConfirmRemove(null)} className="btn btn-ghost" style={{flex:1}}>cancel</button>
                <button onClick={() => { const r = confirmRemove; setConfirmRemove(null); deleteRow(r, "removed"); }} className="btn btn-danger" style={{flex:1}}>remove</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <header style={{background:C.deep,borderBottom:"2px solid rgba(242,187,242,0.1)",position:"relative",zIndex:10}}>
        <div style={{padding:"14px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <CafeLogo size={44}/>
            <div>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:20,color:C.white,lineHeight:1}}>Corner Cafe</div>
              <div style={{fontSize:9,color:C.purple,fontWeight:700,letterSpacing:3,textTransform:"uppercase",marginTop:3}}>shift schedule</div>
            </div>
          </div>
          <nav style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            <button className={`nav-pill ${view==="calendar"?"on":""}`} onClick={() => setView("calendar")}>schedule</button>
            <button className={`nav-pill ${view==="stats"?"on":""}`} onClick={() => setView("stats")}>leaderboard</button>
            {isAdmin
              ? <>
                  <button className={`nav-pill ${view==="admin"?"on":""}`} onClick={() => setView("admin")}
                    style={view==="admin"?{background:C.lilac,borderColor:C.lilac,color:C.deep}:{}}>admin</button>
                  <button className="nav-pill" onClick={() => { setIsAdmin(false); setView("calendar"); }}
                    style={{borderColor:"rgba(255,90,110,.4)",color:"#ff8096"}}>sign out</button>
                </>
              : <button className="nav-pill" onClick={() => setView("login")}>admin</button>
            }
          </nav>
        </div>
        <Checkers c1={C.yellow} c2={C.deep} size={12}/>
      </header>

      {(loadError || (view === "stats" && lbError)) && (
        <div style={{background:"rgba(255,90,110,.18)",borderBottom:"2px solid rgba(255,90,110,.4)",color:"#ffb3c0",padding:"10px 16px",textAlign:"center",fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:12,letterSpacing:.5,textTransform:"uppercase"}}>
          {view === "stats" && lbError ? lbError : loadError}
        </div>
      )}

      <main style={{maxWidth:1200,margin:"0 auto",padding:"28px 16px",position:"relative"}}>

        {/* LOGIN */}
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
                  onChange={e => setPinInput(e.target.value)} onKeyDown={e => e.key==="Enter" && handleAdminLogin()}
                  style={{marginBottom:10,textAlign:"center",letterSpacing:12,fontSize:22}}/>
                {pinError && <div style={{color:"#ff8096",fontSize:12,fontWeight:800,marginBottom:12,textTransform:"uppercase",letterSpacing:.5}}>{pinError}</div>}
                <button onClick={handleAdminLogin} className="btn btn-y" style={{width:"100%",fontSize:13,padding:13}}>
                  {setupMode ? "set pin →" : "login →"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* LEADERBOARD */}
        {view==="stats" && (() => {
          const { months, byMonth, allNames } = getMonthlyTally();
          const fmtMonth = m => { const [y, mo] = m.split("-"); return new Date(y, mo - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }); };
          const grandTotals = allNames.map(n => months.reduce((s, m) => s + ((byMonth[m] || {})[n] || 0), 0));
          const maxTotal = Math.max(...grandTotals, 1);
          const medals = ["🥇","🥈","🥉"];
          return (
            <div className="page">
              <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:22,flexWrap:"wrap"}}>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:34,color:C.white,lineHeight:1}}>leaderboard</div>
                <span style={{background:"rgba(255,210,0,0.15)",color:C.yellow,borderRadius:6,padding:"4px 12px",fontSize:11,fontWeight:800,textTransform:"uppercase",letterSpacing:.5}}>verified only ✓</span>
              </div>
              {lbRows === null
                ? <div style={{color:C.soft,fontFamily:"'DM Sans',sans-serif",fontStyle:"italic",padding:"20px 0"}}>loading…</div>
                : (
                <div className="glass" style={{overflow:"hidden",padding:0}}>
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",minWidth:320,borderCollapse:"collapse"}}>
                      <thead>
                        <tr style={{background:"rgba(0,0,0,0.4)"}}>
                          <th style={{textAlign:"left",padding:"13px 16px",fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:11,color:C.soft,textTransform:"uppercase",letterSpacing:.5}}>#</th>
                          <th style={{textAlign:"left",padding:"13px 16px",fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:11,color:C.soft,textTransform:"uppercase",letterSpacing:.5}}>name</th>
                          {months.map(m => (
                            <th key={m} style={{textAlign:"center",padding:"13px 16px",fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:11,color:C.lilac,textTransform:"uppercase",letterSpacing:.5,whiteSpace:"nowrap"}}>{fmtMonth(m)}</th>
                          ))}
                          <th style={{textAlign:"center",padding:"13px 16px",fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:11,color:C.yellow,textTransform:"uppercase",letterSpacing:.5}}>total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allNames.map((name, i) => {
                          const total = grandTotals[i];
                          return (
                            <tr key={name} style={{background:i%2===0?"rgba(255,255,255,0.03)":"transparent"}}>
                              <td style={{padding:"12px 16px",borderBottom:"1px solid rgba(242,187,242,0.07)",fontSize:16}}>
                                {i<3 ? medals[i] : <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,color:C.purple,fontSize:13}}>{i+1}</span>}
                              </td>
                              <td style={{padding:"12px 16px",borderBottom:"1px solid rgba(242,187,242,0.07)"}}>
                                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,color:C.white}}>{name}</div>
                                <div style={{background:"rgba(255,255,255,0.08)",borderRadius:3,height:4,width:80,marginTop:4,overflow:"hidden"}}>
                                  <div style={{height:4,borderRadius:3,background:`linear-gradient(90deg,${C.purple},${C.lilac})`,width:`${(total/maxTotal)*100}%`,transition:"width 1s ease"}}/>
                                </div>
                              </td>
                              {months.map(m => {
                                const count = (byMonth[m] || {})[name] || 0;
                                return (
                                  <td key={m} style={{textAlign:"center",padding:"12px 16px",borderBottom:"1px solid rgba(242,187,242,0.07)"}}>
                                    {count>0
                                      ? <span style={{background:"rgba(255,210,0,0.15)",color:C.yellow,borderRadius:4,padding:"3px 12px",fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13}}>{count}</span>
                                      : <span style={{color:"rgba(255,255,255,0.2)",fontFamily:"'Syne',sans-serif",fontSize:13}}>0</span>
                                    }
                                  </td>
                                );
                              })}
                              <td style={{textAlign:"center",padding:"12px 16px",borderBottom:"1px solid rgba(242,187,242,0.07)"}}>
                                <span style={{background:total>0&&i===0?C.yellow:total>0?"rgba(255,210,0,0.15)":"rgba(255,255,255,0.07)",color:total>0&&i===0?C.deep:total>0?C.yellow:C.soft,borderRadius:4,padding:"4px 14px",fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13}}>{total}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ADMIN */}
        {view==="admin" && isAdmin && (
          <div className="page">
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:14,marginBottom:22}}>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:30,color:C.white}}>manage shifts</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <button className="week-btn" onClick={() => setWeekOffset(o => o - 1)}>← prev</button>
                <div style={{background:"rgba(255,255,255,0.08)",border:"2px solid rgba(242,187,242,0.2)",borderRadius:6,padding:"6px 14px",fontSize:11,fontWeight:800,color:C.lilac,fontFamily:"'Syne',sans-serif",textTransform:"uppercase",letterSpacing:.5}}>{getWeekLabel(weekOffset)}</div>
                <button className="week-btn" onClick={() => setWeekOffset(o => o + 1)}>next →</button>
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
                    onChange={e => setStaffInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addStaff(); }}
                    style={{flex:1,minWidth:160,padding:"8px 12px",fontSize:13}}/>
                  <button onClick={addStaff} className="btn btn-y" style={{fontSize:11,padding:"8px 16px"}} disabled={!staffInput.trim()}>+ add</button>
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                  {[...staffList].sort().map(name => (
                    <div key={name} style={{display:"flex",alignItems:"center",gap:5,background:"rgba(255,255,255,0.06)",border:"2px solid rgba(242,187,242,0.15)",borderRadius:6,padding:"4px 5px 4px 12px",fontSize:12,fontFamily:"'DM Sans',sans-serif",color:C.white}}>
                      {name}
                      <button onClick={() => changeStaff(cur => cur.filter(n => n !== name), `${name} removed`, false)}
                        style={{background:"rgba(255,90,110,0.2)",border:"none",color:"#ff8096",borderRadius:4,width:18,height:18,cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontWeight:800}}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:10,color:C.soft,marginBottom:14,letterSpacing:2,textTransform:"uppercase"}}>weekly shifts — {getWeekLabel(weekOffset)}</div>
            {!ready
              ? <div style={{color:C.soft,fontFamily:"'DM Sans',sans-serif",fontStyle:"italic"}}>loading…</div>
              : (
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
                {DAYS.map(day => {
                  const dayShifts = shifts[day] || [];
                  return (
                    <div key={day} className="glass" style={{padding:16}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                        <div>
                          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,color:C.white,lineHeight:1}}>{day}</div>
                          <div style={{fontSize:11,color:C.soft,marginTop:3,fontFamily:"'DM Sans',sans-serif"}}>{getDayDate(weekOffset, day)}</div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:7}}>
                          <span style={{color:C.purple,fontSize:10,fontWeight:700,textTransform:"uppercase"}}>{dayShifts.length} shifts</span>
                          {dayShifts.length > 0 && (
                            <button onClick={() => closeDay(day)}
                              style={{background:"rgba(255,90,110,0.1)",border:"2px solid rgba(255,90,110,0.25)",color:"#ff8096",borderRadius:4,padding:"2px 8px",cursor:"pointer",fontSize:10,fontWeight:800,fontFamily:"'Syne',sans-serif",textTransform:"uppercase"}}>close</button>
                          )}
                        </div>
                      </div>
                      {dayShifts.map((shift, idx) => {
                        const signups = getSignups(day, shift);
                        return (
                          <div key={`${day}-${idx}`} style={{background:"rgba(0,0,0,0.2)",border:"2px solid rgba(242,187,242,0.1)",borderRadius:8,padding:10,marginBottom:8}}>
                            <div style={{display:"flex",gap:6,marginBottom:7}}>
                              <ShiftNameInput value={shift} onCommit={v => updateShiftName(day, idx, shift, v)}/>
                              <button onClick={() => removeShift(day, idx)} style={{background:"rgba(255,90,110,.12)",border:"none",color:"#ff8096",borderRadius:4,padding:"4px 8px",cursor:"pointer",fontWeight:800,fontSize:12}}>✕</button>
                            </div>
                            {signups.length === 0
                              ? <div style={{color:C.purple,fontSize:11,fontFamily:"'DM Sans',sans-serif",fontStyle:"italic"}}>no signups yet</div>
                              : signups.map(s => (
                                <div key={s.id} className="person-row">
                                  <span className="dot" style={{background:s.verified?C.green:C.yellow,animation:!s.verified?"pulse 2s infinite":"none"}}/>
                                  <span style={{flex:1,fontSize:12,fontFamily:"'DM Sans',sans-serif",color:C.white,fontWeight:500}}>{s.staff_name}</span>
                                  {s.verified
                                    ? <span className="tag tag-g">done</span>
                                    : <button onClick={() => verify(s)} style={{background:"rgba(114,255,168,0.08)",border:"2px solid rgba(114,255,168,0.25)",color:C.green,borderRadius:4,padding:"2px 8px",cursor:"pointer",fontSize:10,fontWeight:800,fontFamily:"'Syne',sans-serif",textTransform:"uppercase"}}>verify</button>
                                  }
                                  <button onClick={() => setConfirmRemove(s)} style={{background:"none",border:"none",color:C.purple,cursor:"pointer",fontSize:14,padding:"0 2px"}}>✕</button>
                                </div>
                              ))
                            }
                          </div>
                        );
                      })}
                      <button onClick={() => addShift(day)} style={{background:"none",border:"2px dashed rgba(242,187,242,0.18)",color:C.purple,padding:"7px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:800,width:"100%",fontFamily:"'Syne',sans-serif",textTransform:"uppercase",letterSpacing:.5,transition:"all .18s"}}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = C.lilac; e.currentTarget.style.color = C.lilac; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(242,187,242,0.18)"; e.currentTarget.style.color = C.purple; }}>
                        + add shift
                      </button>
                      {day === "Friday" && !dayShifts.includes("Unpacking") && (
                        <button onClick={addUnpacking} className="btn btn-y" style={{width:"100%",fontSize:11,padding:"8px",marginTop:6}}>
                          + unpacking shift 📦
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SCHEDULE */}
        {view==="calendar" && (
          <div className="page">
            {!staffName && (
              <div style={{marginBottom:26}}>
                <div className="glass" style={{overflow:"hidden"}}>
                  <Checkers c1={C.yellow} c2={C.deep} size={16}/>
                  <div style={{padding:"36px 28px",textAlign:"center"}}>
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:34,color:C.white,marginBottom:8,lineHeight:1.1}}>hey! who are you? 👋</div>
                    <div style={{color:C.soft,fontSize:15,fontFamily:"'DM Sans',sans-serif",marginBottom:28}}>pick your name to sign up for shifts this week</div>
                    {staffList.length === 0
                      ? <div style={{color:C.soft,fontSize:13,fontFamily:"'DM Sans',sans-serif",fontStyle:"italic"}}>no staff added yet — ask your admin</div>
                      : <div style={{display:"flex",gap:12,justifyContent:"center",alignItems:"center",flexWrap:"wrap"}}>
                          <select className="hero-select" value={nameInput} onChange={e => setNameInput(e.target.value)}>
                            <option value="">select your name ▾</option>
                            {[...staffList].sort().map(n => (<option key={n} value={n}>{n}</option>))}
                          </select>
                          <button onClick={() => nameInput && setStaffName(nameInput)} className="btn btn-y" disabled={!nameInput}
                            style={{fontSize:15,padding:"14px 30px",boxShadow:"0 0 28px rgba(255,210,0,0.3)"}}>
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
                  <button onClick={() => setShowDone(true)} className="btn btn-y" style={{fontSize:11,padding:"7px 18px"}}>done ✦</button>
                  <button onClick={() => { setStaffName(""); setNameInput(""); }} className="btn btn-ghost" style={{fontSize:11,padding:"7px 14px"}}>change</button>
                </div>
              </div>
            )}

            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:20,flexWrap:"wrap"}}>
              <button className="week-btn" onClick={() => setWeekOffset(o => o - 1)}>← prev week</button>
              <div style={{background:"rgba(255,255,255,0.08)",border:"2px solid rgba(242,187,242,0.2)",borderRadius:6,padding:"7px 16px",fontSize:11,fontWeight:800,color:C.lilac,fontFamily:"'Syne',sans-serif",textTransform:"uppercase",letterSpacing:.5,whiteSpace:"nowrap"}}>{getWeekLabel(weekOffset)}</div>
              <button className="week-btn" onClick={() => setWeekOffset(o => o + 1)}>next week →</button>
            </div>

            {!ready
              ? <div style={{color:C.soft,fontFamily:"'DM Sans',sans-serif",fontStyle:"italic",padding:"20px 0"}}>loading this week…</div>
              : CALENDAR_ROWS.map((rowDays, rowIdx) => (
              <div key={rowIdx} style={{display:"grid",gridTemplateColumns:`repeat(${rowDays.length}, 1fr)`,gap:14,marginBottom:14}}>
                {rowDays.map(day => {
                  const dayShifts = shifts[day] || [];
                  return (
                    <div key={day} className="glass" style={{padding:18}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                        <div>
                          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,color:C.white,lineHeight:1}}>{day}</div>
                          <div style={{fontSize:12,color:C.soft,marginTop:4,fontFamily:"'DM Sans',sans-serif"}}>{getDayDate(weekOffset, day)}</div>
                        </div>
                        <span style={{background:"rgba(242,187,242,0.1)",color:C.soft,borderRadius:4,padding:"2px 8px",fontSize:10,fontWeight:800,textTransform:"uppercase"}}>{dayShifts.length} shift{dayShifts.length!==1?"s":""}</span>
                      </div>
                      {dayShifts.length === 0
                        ? <div style={{background:"rgba(255,255,255,0.03)",borderRadius:8,padding:16,textAlign:"center",color:C.purple,fontSize:12,fontFamily:"'DM Sans',sans-serif"}}>no shifts this day</div>
                        : dayShifts.map(shift => {
                            const signups = getSignups(day, shift);
                            const full = signups.length >= MAX_PER_SHIFT;
                            const mine = signups.some(s => s.staff_name === staffName);
                            return (
                              <div key={shift} className={`shift-block${mine ? " mine" : ""}`}>
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                                  <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16,color:mine?C.yellow:C.lilac,lineHeight:1.2}}>{shift}</span>
                                  <div style={{display:"flex",gap:3,flexShrink:0,marginLeft:8}}>
                                    {Array.from({ length: MAX_PER_SHIFT }).map((_, i) => (
                                      <span key={i} className="dot" style={{background:i<signups.length?(signups[i]?.verified?C.green:C.yellow):"rgba(255,255,255,0.1)"}}/>
                                    ))}
                                  </div>
                                </div>
                                {signups.map(s => (
                                  <div key={s.id} style={{display:"flex",alignItems:"center",gap:7,padding:"3px 0"}}>
                                    <span className="dot" style={{background:s.verified?C.green:C.yellow}}/>
                                    <span style={{fontSize:13,color:s.verified?C.green:C.white,fontFamily:"'DM Sans',sans-serif",fontWeight:s.staff_name===staffName?700:400,flex:1}}>{s.staff_name}</span>
                                    {s.staff_name===staffName && !s.verified && <span className="tag tag-y">you</span>}
                                    {s.verified && <span className="tag tag-g">✓</span>}
                                  </div>
                                ))}
                                <div style={{marginTop:10}}>
                                  {mine
                                    ? <div style={{display:"flex",flexDirection:"column",gap:6}}>
                                        <a href={makeCalendarLink(getDayISO(weekOffset, day), shift)} target="_blank" rel="noreferrer"
                                          style={{display:"block",textAlign:"center",background:"rgba(255,210,0,0.1)",border:"2px solid rgba(255,210,0,0.3)",color:C.yellow,borderRadius:6,padding:"8px",fontSize:11,fontWeight:800,fontFamily:"'Syne',sans-serif",textDecoration:"none",transition:"all .18s",textTransform:"uppercase",letterSpacing:.4}}
                                          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,210,0,0.2)"; }}
                                          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,210,0,0.1)"; }}>
                                          📅 add to google calendar
                                        </a>
                                        <button onClick={() => cancelSignup(day, shift)} className="btn btn-ghost" style={{width:"100%",fontSize:11,padding:"7px"}}>cancel signup</button>
                                      </div>
                                    : <button onClick={() => signUp(day, shift)} className={`btn ${full?"btn-full":"btn-y"}`} disabled={!staffName||full} style={{width:"100%",fontSize:!staffName?9:12,padding:"9px"}}>
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
