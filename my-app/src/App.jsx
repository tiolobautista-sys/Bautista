import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.client";
import "./App.css";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
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

  async function loadProfile(userId) {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (error) { setMessage(error.message); return; }
    setProfile(data);
  }

  async function loadHistory(userId) {
    const { data, error } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", userId)
      .order("time_in", { ascending: false });
    if (error) { setMessage(error.message); return; }
    setHistory(data || []);
  }

  async function loadAdminRecords() {
    const { data: attendanceData, error: attendanceError } = await supabase
      .from("attendance")
      .select("id, user_id, date, time_in, time_out")
      .order("time_in", { ascending: false });

    if (attendanceError) { setMessage(attendanceError.message); return; }
    const { data: profilesData, error: profilesError } = await supabase.from("profiles").select("id, email");
    if (profilesError) { setMessage(profilesError.message); return; }

    const emailMap = {};
    (profilesData || []).forEach((p) => { emailMap[p.id] = p.email || "No email"; });

    const formatted = (attendanceData || []).map((row) => ({
      ...row,
      email: emailMap[row.user_id] || "No email",
    }));
    setAdminRecords(formatted);
  }

  const filteredRecords = useMemo(() => {
    return adminRecords.filter((r) => {
      const text = userFilter.trim().toLowerCase();
      const matchUser = text ? (r.user_id || "").toLowerCase().includes(text) || (r.email || "").toLowerCase().includes(text) : true;
      const matchDate = dateFilter ? r.date === dateFilter : true;
      return matchUser && matchDate;
    });
  }, [adminRecords, userFilter, dateFilter]);

  function getMessageType() {
    const lower = message.toLowerCase();
    const errorKeywords = ["error", "invalid", "failed", "already", "cannot", "first", "duplicate"];
    return errorKeywords.some(kw => lower.includes(kw)) ? "error" : "success";
  }

  async function handleDelete(id) {
    if (!window.confirm("Are you sure you want to delete this record?")) return;
    const { error } = await supabase.from("attendance").delete().eq("id", id);
    if (error) {
      setMessage("Error deleting: " + error.message);
    } else {
      setMessage("Record deleted successfully.");
      if (session?.user) await loadHistory(session.user.id);
      if (profile?.role === "admin") await loadAdminRecords();
    }
  }

  async function register(e) {
    e.preventDefault();
    setMessage("");
    const { error } = await supabase.auth.signUp({
      email, password, options: { data: { full_name: fullName } },
    });
    if (error) { setMessage(error.message); return; }
    setMessage("Registered successfully. You can now log in.");
    setAuthMode("login");
  }

  async function login(e) {
    e.preventDefault();
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setMessage(error.message); return; }
    setMessage("Login successful.");
  }

  async function logout() {
    await supabase.auth.signOut();
    setMessage("Logged out successfully.");
  }

  // --- ALLOWS MULTIPLE SESSIONS ---
  async function timeIn() {
    if (!session?.user?.id) return;
    setMessage("");

    // Check if user already has an active session (Timed in but not yet out)
    const { data: active } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", session.user.id)
      .is("time_out", null)
      .maybeSingle();

    if (active) {
      setMessage("You must Time Out from your current session first.");
      return;
    }

    const { error } = await supabase.from("attendance").insert([
      {
        user_id: session.user.id,
        date: getToday(),
        time_in: new Date().toISOString(),
        time_out: null,
      },
    ]);

    if (error) { setMessage(error.message); return; }
    setMessage("New session started.");
    await loadHistory(session.user.id);
    if (profile?.role === "admin") await loadAdminRecords();
  }

  async function timeOut() {
    if (!session?.user?.id) return;
    setMessage("");

    // Find the newest session that doesn't have a Time Out yet
    const { data: latest, error: fetchError } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", session.user.id)
      .is("time_out", null)
      .order("time_in", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) { setMessage(fetchError.message); return; }
    if (!latest) { setMessage("No active session found. Please Time In first."); return; }

    const { error } = await supabase
      .from("attendance")
      .update({ time_out: new Date().toISOString() })
      .eq("id", latest.id);

    if (error) { setMessage(error.message); return; }
    setMessage("Session ended successfully.");
    await loadHistory(session.user.id);
    if (profile?.role === "admin") await loadAdminRecords();
  }

  if (loading) return <div className="loading-shell"><div className="loading-box"><h2>Loading...</h2></div></div>;

  if (!session) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-right">
            <h2>{authMode === "login" ? "Login" : "Register"}</h2>
            <form onSubmit={authMode === "login" ? login : register}>
              {authMode === "register" && (
                <input type="text" placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              )}
              <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button type="submit" className="btn-primary full-btn">{authMode === "login" ? "Login" : "Register"}</button>
            </form>
            <button className="btn-outline full-btn" onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>
              Switch to {authMode === "login" ? "Register" : "Login"}
            </button>
            {message && <div className={`message ${getMessageType()}`}>{message}</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="topbar">
        <h1>Attendance Dashboard</h1>
        <button className="btn-danger" onClick={logout}>Logout</button>
      </div>

      {message && <div className={`message ${getMessageType()}`}>{message}</div>}

      <div className="grid-2">
        <div className="card">
          <h2 className="card-title">Attendance Actions</h2>
          <div className="button-row">
            <button className="btn-primary" onClick={timeIn}>Time In</button>
            <button className="btn-secondary" onClick={timeOut}>Time Out</button>
          </div>
        </div>
        <div className="card">
          <h2 className="card-title">Account</h2>
          <p>Email: {session.user.email}</p>
          <p>Role: {profile?.role || "user"}</p>
        </div>
      </div>

      <div className="card table-card">
        <h2 className="card-title">My Attendance History</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>Time In</th><th>Time Out</th><th>Action</th></tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{formatDate(h.date)}</td>
                  <td>{formatDateTime(h.time_in)}</td>
                  <td>{formatDateTime(h.time_out)}</td>
                  <td><button className="btn-danger small" onClick={() => handleDelete(h.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {profile?.role === "admin" && (
        <div className="card table-card">
          <h2 className="card-title">Admin Panel</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>User</th><th>Date</th><th>Time In</th><th>Time Out</th><th>Action</th></tr>
              </thead>
              <tbody>
                {filteredRecords.map((r) => (
                  <tr key={r.id}>
                    <td>{r.email}</td>
                    <td>{formatDate(r.date)}</td>
                    <td>{formatDateTime(r.time_in)}</td>
                    <td>{formatDateTime(r.time_out)}</td>
                    <td><button className="btn-danger small" onClick={() => handleDelete(r.id)}>Delete</button></td>
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