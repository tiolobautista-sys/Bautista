import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.client";
import "./App.css";

// --- Helpers ---
function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calculateDuration(start, end) {
  if (!start || !end) return "-";
  const diff = new Date(end) - new Date(start);
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const [authMode, setAuthMode] = useState("login");
  const [message, setMessage] = useState("");

  const [history, setHistory] = useState([]);
  const [adminRecords, setAdminRecords] = useState([]);

  const [userFilter, setUserFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  // --- Auth Logic ---
  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session || null);
      setLoading(false);
    };
    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession || null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) {
      loadProfile(session.user.id);
      loadHistory(session.user.id);
    } else {
      setProfile(null);
      setHistory([]);
      setAdminRecords([]);
    }
  }, [session]);

  useEffect(() => {
    if (profile?.role === "admin") {
      loadAdminRecords();
    }
  }, [profile]);

  // --- Data Loading ---
  async function loadProfile(userId) {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (!error) setProfile(data);
  }

  async function loadHistory(userId) {
    const { data, error } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", userId)
      .order("time_in", { ascending: false });

    if (!error) setHistory(data || []);
  }

  async function loadAdminRecords() {
    const { data: attendanceData } = await supabase
      .from("attendance")
      .select("*")
      .order("time_in", { ascending: false });

    const { data: profilesData } = await supabase.from("profiles").select("id, email");

    const emailMap = {};
    (profilesData || []).forEach((p) => { emailMap[p.id] = p.email || "No email"; });

    const formatted = (attendanceData || []).map((row) => ({
      ...row,
      email: emailMap[row.user_id] || "No email",
    }));

    setAdminRecords(formatted);
  }

  // --- Attendance Logic (Multiple Support) ---
  async function timeIn() {
    if (!session?.user?.id) return;
    setMessage("");

    // 1. Check if there's an existing session that hasn't timed out yet
    const { data: activeSession, error: fetchError } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", session.user.id)
      .is("time_out", null)
      .maybeSingle();

    if (fetchError) { setMessage(fetchError.message); return; }
    if (activeSession) {
      setMessage("Cannot Time In: You still have an active session. Please Time Out first.");
      return;
    }

    // 2. Create a NEW row for this specific session
    const { error } = await supabase.from("attendance").insert([{
      user_id: session.user.id,
      date: getToday(),
      time_in: new Date().toISOString(),
      time_out: null,
    }]);

    if (error) { setMessage(error.message); return; }

    setMessage("Time In successful. New session started.");
    await loadHistory(session.user.id);
    if (profile?.role === "admin") await loadAdminRecords();
  }

  async function timeOut() {
    if (!session?.user?.id) return;
    setMessage("");

    // 1. Find the LATEST row for this user that doesn't have a time_out
    const { data: activeSession, error: fetchError } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", session.user.id)
      .is("time_out", null)
      .order("time_in", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) { setMessage(fetchError.message); return; }
    if (!activeSession) {
      setMessage("Cannot Time Out: No active session found. Please Time In first.");
      return;
    }

    // 2. Update that specific session ID
    const { error } = await supabase
      .from("attendance")
      .update({ time_out: new Date().toISOString() })
      .eq("id", activeSession.id);

    if (error) { setMessage(error.message); return; }

    setMessage("Time Out successful. Session ended.");
    await loadHistory(session.user.id);
    if (profile?.role === "admin") await loadAdminRecords();
  }

  // --- Auth Functions ---
  async function register(e) {
    e.preventDefault();
    const { error } = await supabase.auth.signUp({
      email, password, options: { data: { full_name: fullName } }
    });
    if (error) setMessage(error.message);
    else { setMessage("Registered! You can log in."); setAuthMode("login"); }
  }

  async function login(e) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message);
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  function getMessageType() {
    const lower = message.toLowerCase();
    return (lower.includes("error") || lower.includes("cannot") || lower.includes("invalid")) ? "error" : "success";
  }

  const filteredRecords = useMemo(() => {
    return adminRecords.filter((r) => {
      const text = userFilter.trim().toLowerCase();
      const matchUser = text ? (r.user_id.toLowerCase().includes(text) || r.email.toLowerCase().includes(text)) : true;
      const matchDate = dateFilter ? r.date === dateFilter : true;
      return matchUser && matchDate;
    });
  }, [adminRecords, userFilter, dateFilter]);

  // --- Render Sections ---
  if (loading) return <div className="loading-shell"><h2>Loading system...</h2></div>;

  if (!session) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-left">
            <h1>Attendance System</h1>
            <p>Track multiple shifts per day with ease.</p>
          </div>
          <div className="auth-right">
            <h2>{authMode === "login" ? "Login" : "Register"}</h2>
            <div className="auth-tabs">
              <button className={authMode === "login" ? "btn-primary" : "btn-outline"} onClick={() => setAuthMode("login")}>Login</button>
              <button className={authMode === "register" ? "btn-primary" : "btn-outline"} onClick={() => setAuthMode("register")}>Register</button>
            </div>
            <form onSubmit={authMode === "login" ? login : register}>
              {authMode === "register" && <input type="text" placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />}
              <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button type="submit" className="btn-primary full-btn">{authMode === "login" ? "Login" : "Register"}</button>
            </form>
            {message && <div className={`message ${getMessageType()}`}>{message}</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="topbar">
        <div>
          <h1>Attendance Dashboard</h1>
          <p>Welcome, <strong>{profile?.full_name || session.user.email}</strong></p>
          <div className="role-badge">Role: {profile?.role || "user"}</div>
        </div>
        <button className="btn-danger" onClick={logout}>Logout</button>
      </div>

      {message && <div className={`message ${getMessageType()}`}>{message}</div>}

      <div className="grid-2">
        <div className="card">
          <h2 className="card-title">Attendance Actions</h2>
          <p className="card-subtitle">Click Time In to start a session and Time Out to end it.</p>
          <div className="button-row">
            <button className="btn-primary" onClick={timeIn}>Time In</button>
            <button className="btn-secondary" onClick={timeOut}>Time Out</button>
          </div>
        </div>

        <div className="card">
          <h2 className="card-title">Account Info</h2>
          <div className="info-list">
            <div className="info-item"><span>Email:</span> <span>{session.user.email}</span></div>
            <div className="info-item"><span>Role:</span> <span>{profile?.role || "user"}</span></div>
          </div>
        </div>
      </div>

      <div className="card table-card">
        <h2 className="card-title">My Attendance History</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Time In</th>
                <th>Time Out</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{formatDate(h.date)}</td>
                  <td>{formatDateTime(h.time_in)}</td>
                  <td>{h.time_out ? formatDateTime(h.time_out) : <span className="active-status">Active</span>}</td>
                  <td>{calculateDuration(h.time_in, h.time_out)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {profile?.role === "admin" && (
        <div className="card table-card">
          <h2 className="card-title">Admin Panel</h2>
          <div className="filter-row">
            <input type="text" placeholder="Search user..." value={userFilter} onChange={(e) => setUserFilter(e.target.value)} />
            <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
            <button className="btn-outline" onClick={() => { setUserFilter(""); setDateFilter(""); }}>Clear</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Date</th>
                  <th>Time In</th>
                  <th>Time Out</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((r) => (
                  <tr key={r.id}>
                    <td>{r.email}</td>
                    <td>{formatDate(r.date)}</td>
                    <td>{formatDateTime(r.time_in)}</td>
                    <td>{r.time_out ? formatDateTime(r.time_out) : "Active"}</td>
                    <td>{calculateDuration(r.time_in, r.time_out)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}