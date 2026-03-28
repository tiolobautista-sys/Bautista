import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.client";
import "./App.css";

// --- Formatting Helpers ---
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
    }
  }, [session]);

  useEffect(() => {
    if (profile?.role === "admin") loadAdminRecords();
  }, [profile]);

  async function loadProfile(userId) {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (data) setProfile(data);
  }

  async function loadHistory(userId) {
    const { data } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", userId)
      .order("time_in", { ascending: false });
    setHistory(data || []);
  }

  async function loadAdminRecords() {
    const { data: att } = await supabase.from("attendance").select("*").order("time_in", { ascending: false });
    const { data: profs } = await supabase.from("profiles").select("id, email");
    const map = {}; profs?.forEach(p => map[p.id] = p.email);
    setAdminRecords(att?.map(r => ({ ...r, email: map[r.user_id] || "No email" })) || []);
  }

  // --- Attendance Logic ---
  async function timeIn() {
    setMessage("");
    // Check for an OPEN session (where time_out is null)
    const { data: active } = await supabase.from("attendance")
      .select("*")
      .eq("user_id", session.user.id)
      .is("time_out", null)
      .maybeSingle();

    if (active) {
      setMessage("Error: You already have an active session. Time out first.");
      return;
    }

    const { error } = await supabase.from("attendance").insert([{
      user_id: session.user.id,
      date: getToday(),
      time_in: new Date().toISOString()
    }]);

    if (error) setMessage(error.message);
    else {
      setMessage("Time In recorded.");
      loadHistory(session.user.id);
      if (profile?.role === "admin") loadAdminRecords();
    }
  }

  async function timeOut() {
    setMessage("");
    const { data: active } = await supabase.from("attendance")
      .select("*")
      .eq("user_id", session.user.id)
      .is("time_out", null)
      .order("time_in", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!active) {
      setMessage("Error: No active session found. Time In first.");
      return;
    }

    const { error } = await supabase.from("attendance")
      .update({ time_out: new Date().toISOString() })
      .eq("id", active.id);

    if (error) setMessage(error.message);
    else {
      setMessage("Time Out recorded.");
      loadHistory(session.user.id);
      if (profile?.role === "admin") loadAdminRecords();
    }
  }

  // --- Delete Function ---
  async function handleDelete(id) {
    if (!window.confirm("Delete this record?")) return;
    const { error } = await supabase.from("attendance").delete().eq("id", id);
    if (error) setMessage(error.message);
    else {
      setMessage("Record deleted.");
      loadHistory(session.user.id);
      if (profile?.role === "admin") loadAdminRecords();
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
        <h1>Dashboard</h1>
        <button className="btn-danger" onClick={() => supabase.auth.signOut()}>Logout</button>
      </div>

      {message && <div className={`message ${message.toLowerCase().includes("error") ? "error" : "success"}`}>{message}</div>}

      <div className="grid-2">
        <div className="card">
          <h2>Actions</h2>
          <div className="button-row">
            <button className="btn-primary" onClick={timeIn}>Time In</button>
            <button className="btn-secondary" onClick={timeOut}>Time Out</button>
          </div>
        </div>
        <div className="card">
          <h2>User: {profile?.full_name || session.user.email}</h2>
          <p>Role: {profile?.role || "user"}</p>
        </div>
      </div>

      <div className="card table-card">
        <h2>My History</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>In</th><th>Out</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id}>
                  <td>{formatDate(h.date)}</td>
                  <td>{formatDateTime(h.time_in)}</td>
                  <td>{h.time_out ? formatDateTime(h.time_out) : <span className="active-status">Active</span>}</td>
                  <td>
                    <button className="btn-danger-small" onClick={() => handleDelete(h.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}