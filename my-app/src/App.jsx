import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.client";
import "./App.css";

// Formats the Date for display (e.g., 3/28/2026)
function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

// Formats Time for display (e.g., 9:19:08 AM)
function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
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
    if (profile?.role === "admin") {
      loadAdminRecords();
    }
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
    if (data) setHistory(data);
  }

  async function loadAdminRecords() {
    const { data: attendanceData } = await supabase.from("attendance").select("*").order("time_in", { ascending: false });
    const { data: profilesData } = await supabase.from("profiles").select("id, email");

    const emailMap = {};
    (profilesData || []).forEach((p) => { emailMap[p.id] = p.email; });

    const formatted = (attendanceData || []).map((row) => ({
      ...row,
      email: emailMap[row.user_id] || "No email",
    }));
    setAdminRecords(formatted);
  }

  const filteredRecords = useMemo(() => {
    return adminRecords.filter((r) => {
      const text = userFilter.toLowerCase();
      const matchUser = !text || (r.user_id?.toLowerCase().includes(text) || r.email?.toLowerCase().includes(text));
      const matchDate = !dateFilter || r.date === dateFilter;
      return matchUser && matchDate;
    });
  }, [adminRecords, userFilter, dateFilter]);

  async function handleDelete(id) {
    if (!window.confirm("Delete this record?")) return;
    const { error } = await supabase.from("attendance").delete().eq("id", id);
    if (!error) {
      setMessage("Deleted.");
      loadHistory(session.user.id);
      if (profile?.role === "admin") loadAdminRecords();
    }
  }

  async function login(e) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message);
  }

  async function register(e) {
    e.preventDefault();
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    if (error) setMessage(error.message);
    else setAuthMode("login");
  }

  // --- UPDATED LOGIC TO ALLOW MULTIPLE ENTRIES ---
  async function timeIn() {
    setMessage("");
    
    // Optional: Only block if they haven't Timed Out from their LAST session
    const { data: active } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", session.user.id)
      .is("time_out", null)
      .maybeSingle();

    if (active) {
      setMessage("Please Time Out before starting a new session.");
      return;
    }

    const { error } = await supabase.from("attendance").insert([{
      user_id: session.user.id,
      date: getToday(),
      time_in: new Date().toISOString()
    }]);

    if (error) {
      setMessage("Database Error: " + error.message);
    } else {
      setMessage("Time In recorded.");
      loadHistory(session.user.id);
      if (profile?.role === "admin") loadAdminRecords();
    }
  }

  async function timeOut() {
    setMessage("");
    const { data: latest } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", session.user.id)
      .is("time_out", null)
      .order("time_in", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latest) {
      setMessage("No active session found.");
      return;
    }

    const { error } = await supabase
      .from("attendance")
      .update({ time_out: new Date().toISOString() })
      .eq("id", latest.id);

    if (!error) {
      setMessage("Time Out recorded.");
      loadHistory(session.user.id);
      if (profile?.role === "admin") loadAdminRecords();
    }
  }

  if (loading) return <div className="loading">Loading...</div>;

  if (!session) {
    return (
      <div className="auth-shell">
        <form onSubmit={authMode === "login" ? login : register}>
          <h2>{authMode === "login" ? "Login" : "Register"}</h2>
          {authMode === "register" && <input placeholder="Full Name" onChange={e => setFullName(e.target.value)} />}
          <input placeholder="Email" onChange={e => setEmail(e.target.value)} />
          <input type="password" placeholder="Password" onChange={e => setPassword(e.target.value)} />
          <button type="submit" className="btn-primary full-btn">Submit</button>
          <p onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>Switch Mode</p>
        </form>
        {message && <div className="message error">{message}</div>}
      </div>
    );
  }

  return (
    <div className="container">
      <div className="topbar">
        <h1>Dashboard</h1>
        <button onClick={() => supabase.auth.signOut()}>Logout</button>
      </div>

      {message && <div className="message success">{message}</div>}

      <div className="grid-2">
        <div className="card">
          <h2>Actions</h2>
          <button className="btn-primary" onClick={timeIn}>Time In</button>
          <button className="btn-secondary" onClick={timeOut}>Time Out</button>
        </div>
        <div className="card">
          <h2>Profile</h2>
          <p>{session.user.email} ({profile?.role})</p>
        </div>
      </div>

      <div className="card">
        <h2>My History</h2>
        <table>
          <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Action</th></tr></thead>
          <tbody>
            {history.map(h => (
              <tr key={h.id}>
                <td>{formatDate(h.date)}</td>
                <td>{formatDateTime(h.time_in)}</td>
                <td>{formatDateTime(h.time_out)}</td>
                <td><button className="btn-danger" onClick={() => handleDelete(h.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}