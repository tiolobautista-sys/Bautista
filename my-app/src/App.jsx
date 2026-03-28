import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.client";
import "./App.css";

// --- Formatting Helpers ---
const formatDate = (v) => v ? new Date(v).toLocaleDateString() : "-";
const formatDateTime = (v) => v ? new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "-";

function calculateDuration(start, end) {
  if (!start || !end) return "-";
  const diff = new Date(end) - new Date(start);
  const mins = Math.floor(diff / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState([]);
  const [adminRecords, setAdminRecords] = useState([]);
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [authMode, setAuthMode] = useState("login");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) {
      loadProfile(session.user.id);
      loadHistory(session.user.id);
    }
  }, [session]);

  useEffect(() => {
    if (profile?.role === "admin") loadAdminRecords();
  }, [profile]);

  async function loadProfile(id) {
    const { data } = await supabase.from("profiles").select("*").eq("id", id).single();
    if (data) setProfile(data);
  }

  async function loadHistory(id) {
    const { data } = await supabase.from("attendance").select("*").eq("user_id", id).order("time_in", { ascending: false });
    setHistory(data || []);
  }

  async function loadAdminRecords() {
    const { data: att } = await supabase.from("attendance").select("*").order("time_in", { ascending: false });
    const { data: profs } = await supabase.from("profiles").select("id, email");
    const map = {}; profs?.forEach(p => map[p.id] = p.email);
    setAdminRecords(att?.map(r => ({ ...r, email: map[r.user_id] || "Unknown" })) || []);
  }

  // --- MULTIPLE SESSION LOGIC ---
  async function handleTimeIn() {
    setMessage("");
    // Check for an OPEN session (time_out is null)
    const { data: active } = await supabase.from("attendance")
      .select("*")
      .eq("user_id", session.user.id)
      .is("time_out", null)
      .maybeSingle();

    if (active) {
      setMessage("Error: You have an active session. Please Time Out first.");
      return;
    }

    // Insert a new row (Date is saved, but not used as a unique key)
    const { error } = await supabase.from("attendance").insert([{
      user_id: session.user.id,
      date: new Date().toISOString().split('T')[0],
      time_in: new Date().toISOString()
    }]);

    if (error) {
        setMessage("Database Error: " + error.message);
    } else {
      setMessage("New session started!");
      loadHistory(session.user.id);
    }
  }

  async function handleTimeOut() {
    setMessage("");
    // Find the current active session
    const { data: active } = await supabase.from("attendance")
      .select("*")
      .eq("user_id", session.user.id)
      .is("time_out", null)
      .order("time_in", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!active) {
      setMessage("Error: No active session found. Please Time In first.");
      return;
    }

    // Update the specific session ID
    const { error } = await supabase.from("attendance")
      .update({ time_out: new Date().toISOString() })
      .eq("id", active.id);

    if (error) setMessage(error.message);
    else {
      setMessage("Session ended successfully.");
      loadHistory(session.user.id);
    }
  }

  async function handleAuth(e) {
    e.preventDefault();
    const { error } = authMode === "login" 
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    if (error) setMessage(error.message);
  }

  if (loading) return <div className="loading-shell"><h2>Loading...</h2></div>;

  if (!session) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h2>{authMode === "login" ? "Login" : "Register"}</h2>
          <form onSubmit={handleAuth}>
            {authMode === "register" && <input type="text" placeholder="Full Name" onChange={e => setFullName(e.target.value)} required />}
            <input type="email" placeholder="Email" onChange={e => setEmail(e.target.value)} required />
            <input type="password" placeholder="Password" onChange={e => setPassword(e.target.value)} required />
            <button type="submit" className="btn-primary full-btn">Submit</button>
          </form>
          <button className="btn-outline" onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>
            Switch to {authMode === "login" ? "Register" : "Login"}
          </button>
          {message && <div className="message error">{message}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="topbar">
        <h1>Attendance Dashboard</h1>
        <button className="btn-danger" onClick={() => supabase.auth.signOut()}>Logout</button>
      </div>

      {message && <div className={`message ${message.includes("Error") ? "error" : "success"}`}>{message}</div>}

      <div className="grid-2">
        <div className="card">
          <h2>Attendance Actions</h2>
          <div className="button-row">
            <button className="btn-primary" onClick={handleTimeIn}>Time In</button>
            <button className="btn-secondary" onClick={handleTimeOut}>Time Out</button>
          </div>
        </div>
        <div className="card">
          <h2>Account Info</h2>
          <p><strong>User:</strong> {profile?.full_name || session.user.email}</p>
          <p><strong>Role:</strong> {profile?.role || "user"}</p>
        </div>
      </div>

      <div className="card table-card">
        <h2>My Attendance History</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>Time In</th><th>Time Out</th><th>Duration</th></tr>
            </thead>
            <tbody>
              {history.map(h => (
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
    </div>
  );
}