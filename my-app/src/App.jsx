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
  const [newEmail, setNewEmail] = useState("");
  const [isEditingEmail, setIsEditingEmail] = useState(false);
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
      if (data.session) setNewEmail(data.session.user.email);
      setLoading(false);
    };
    getSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession || null);
      if (newSession) setNewEmail(newSession.user.email);
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
    const { data } = await supabase.from("attendance").select("*").eq("user_id", userId).order("time_in", { ascending: false });
    if (data) setHistory(data || []);
  }

  async function loadAdminRecords() {
    const { data: attendanceData } = await supabase.from("attendance").select("*").order("time_in", { ascending: false });
    const { data: profilesData } = await supabase.from("profiles").select("id, email");
    const emailMap = {};
    profilesData?.forEach(p => emailMap[p.id] = p.email);
    const formatted = attendanceData?.map(row => ({ ...row, email: emailMap[row.user_id] }));
    setAdminRecords(formatted || []);
  }

  async function handleUpdateEmail() {
    setMessage("");
    if (newEmail.trim() === session.user.email) {
      setMessage("Error: That is already your current email.");
      setIsEditingEmail(false);
      return;
    }
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    if (error) setMessage("Update Error: " + error.message);
    else {
      setMessage("Check " + newEmail + " for confirmation link.");
      setIsEditingEmail(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this record?")) return;
    const { error } = await supabase.from("attendance").delete().eq("id", id);
    if (!error) {
      setMessage("Record deleted successfully.");
      loadHistory(session.user.id);
      if (profile?.role === "admin") loadAdminRecords();
    }
  }

  async function timeIn() {
    setMessage("");
    const { data: active } = await supabase.from("attendance").select("*").eq("user_id", session.user.id).is("time_out", null).maybeSingle();
    if (active) {
      setMessage("Error: Finish your current session first.");
      return;
    }
    const { error } = await supabase.from("attendance").insert([{ user_id: session.user.id, date: getToday(), time_in: new Date().toISOString() }]);
    if (!error) { setMessage("Time In recorded."); loadHistory(session.user.id); }
  }

  async function timeOut() {
    setMessage("");
    const { data: active } = await supabase.from("attendance").select("*").eq("user_id", session.user.id).is("time_out", null).order("time_in", { ascending: false }).limit(1).maybeSingle();
    if (!active) { setMessage("Error: No active session."); return; }
    const { error } = await supabase.from("attendance").update({ time_out: new Date().toISOString() }).eq("id", active.id);
    if (!error) { setMessage("Time Out recorded."); loadHistory(session.user.id); }
  }

  if (loading) return <div>Loading...</div>;

  if (!session) {
    return (
      <div className="auth-shell">
        <form className="auth-card" onSubmit={(e) => { e.preventDefault(); authMode === 'login' ? supabase.auth.signInWithPassword({email, password}) : supabase.auth.signUp({email, password}) }}>
          <h2>{authMode === "login" ? "Login" : "Register"}</h2>
          <input type="email" placeholder="Email" onChange={e => setEmail(e.target.value)} />
          <input type="password" placeholder="Password" onChange={e => setPassword(e.target.value)} />
          <button type="submit" className="btn-primary full-btn">{authMode === "login" ? "Login" : "Register"}</button>
        </form>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="topbar">
        <h1>Dashboard</h1>
        <button className="btn-danger" onClick={() => supabase.auth.signOut()}>Logout</button>
      </div>

      {message && <div className="message">{message}</div>}

      <div className="grid-2">
        <div className="card">
          <h3>Actions</h3>
          <div className="button-row">
            <button className="btn-primary" onClick={timeIn}>Time In</button>
            <button className="btn-secondary" onClick={timeOut}>Time Out</button>
          </div>
        </div>

        <div className="card">
          <h3>Account Information</h3>
          <div className="info-item">
            <span className="info-label">Email: </span>
            {isEditingEmail ? (
              <div className="edit-email-group">
                <input value={newEmail} onChange={e => setNewEmail(e.target.value)} />
                <button className="btn-save" onClick={handleUpdateEmail}>Save</button>
                <button className="btn-cancel" onClick={() => setIsEditingEmail(false)}>Cancel</button>
              </div>
            ) : (
              <div className="info-value-row">
                <span>{session.user.email}</span>
                <button className="btn-edit-text" onClick={() => setIsEditingEmail(true)}>Edit</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card table-card">
        <h3>My Attendance</h3>
        <table>
          <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Action</th></tr></thead>
          <tbody>
            {history.map(h => (
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
  );
}