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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession || null);
      if (newSession) setNewEmail(newSession.user.email);
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
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    setProfile(data);
  }

  async function loadHistory(userId) {
    const { data, error } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", userId)
      .order("time_in", { ascending: false });

    if (error) {
      setMessage(error.message);
      return;
    }

    setHistory(data || []);
  }

  async function loadAdminRecords() {
    const { data: attendanceData, error: attendanceError } = await supabase
      .from("attendance")
      .select("id, user_id, date, time_in, time_out")
      .order("time_in", { ascending: false });

    if (attendanceError) {
      setMessage(attendanceError.message);
      return;
    }

    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email");

    if (profilesError) {
      setMessage(profilesError.message);
      return;
    }

    const emailMap = {};
    (profilesData || []).forEach((p) => {
      emailMap[p.id] = p.email || "No email";
    });

    const formatted = (attendanceData || []).map((row) => ({
      id: row.id,
      user_id: row.user_id,
      email: emailMap[row.user_id] || "No email",
      date: row.date,
      time_in: row.time_in,
      time_out: row.time_out,
    }));

    setAdminRecords(formatted);
  }

  const filteredRecords = useMemo(() => {
    return adminRecords.filter((r) => {
      const text = userFilter.trim().toLowerCase();

      const matchUser = text
        ? (r.user_id || "").toLowerCase().includes(text) ||
          (r.email || "").toLowerCase().includes(text)
        : true;

      const matchDate = dateFilter ? r.date === dateFilter : true;

      return matchUser && matchDate;
    });
  }, [adminRecords, userFilter, dateFilter]);

  function getMessageType() {
    const lower = message.toLowerCase();
    if (
      lower.includes("error") ||
      lower.includes("invalid") ||
      lower.includes("failed") ||
      lower.includes("already") ||
      lower.includes("cannot") ||
      lower.includes("first")
    ) {
      return "error";
    }
    return "success";
  }

  // --- UPDATED EDIT EMAIL FUNCTION ---
  async function handleUpdateEmail() {
    setMessage("");
    
    // Prevent updating to the exact same email
    if (newEmail.trim() === session.user.email) {
      setMessage("Error: That is already your current email.");
      setIsEditingEmail(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });

    if (error) {
      setMessage("Update Error: " + error.message);
    } else {
      // Since confirmation is disabled, this provides instant feedback
      setMessage("✅ Email updated successfully!");
      setIsEditingEmail(false);
      
      // Auto-clear success message after 3 seconds
      setTimeout(() => setMessage(""), 3000);
    }
  }

  async function register(e) {
    e.preventDefault();
    setMessage("");

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Registered successfully. You can now log in.");
    setFullName("");
    setEmail("");
    setPassword("");
    setAuthMode("login");
  }

  async function login(e) {
    e.preventDefault();
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Login successful.");
    setEmail("");
    setPassword("");
  }

  async function logout() {
    await supabase.auth.signOut();
    setMessage("Logged out successfully.");
  }

  async function handleDelete(id) {
    if (!window.confirm("Are you sure you want to delete this record?")) return;

    const { error } = await supabase.from("attendance").delete().eq("id", id);

    if (error) {
      setMessage("Error deleting: " + error.message);
    } else {
      setMessage("Record deleted successfully.");
      await loadHistory(session.user.id);
      if (profile?.role === "admin") {
        await loadAdminRecords();
      }
    }
  }

  async function timeIn() {
    if (!session?.user?.id) return;
    setMessage("");

    const { data: activeSession, error: fetchError } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", session.user.id)
      .is("time_out", null)
      .maybeSingle();

    if (fetchError) {
      setMessage(fetchError.message);
      return;
    }

    if (activeSession) {
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

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Time In recorded successfully.");
    await loadHistory(session.user.id);

    if (profile?.role === "admin") {
      await loadAdminRecords();
    }
  }

  async function timeOut() {
    if (!session?.user?.id) return;
    setMessage("");

    const { data: activeSession, error: fetchError } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", session.user.id)
      .is("time_out", null)
      .order("time_in", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      setMessage(fetchError.message);
      return;
    }

    if (!activeSession) {
      setMessage("No active session found. Please Time In first.");
      return;
    }

    const { error } = await supabase
      .from("attendance")
      .update({ time_out: new Date().toISOString() })
      .eq("id", activeSession.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Time Out recorded successfully.");
    await loadHistory(session.user.id);

    if (profile?.role === "admin") {
      await loadAdminRecords();
    }
  }

  if (loading) {
    return (
      <div className="loading-shell">
        <div className="loading-box">
          <h2>Loading system...</h2>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-left">
            <div className="brand-badge">Attendance Monitoring System</div>
            <h1 className="auth-title">Attendance System</h1>
            <p className="auth-subtitle">A modern tracking platform.</p>
          </div>

          <div className="auth-right">
            <h2 className="form-title">
              {authMode === "login" ? "Welcome Back" : "Create Account"}
            </h2>

            <div className="auth-tabs">
              <button type="button" className={authMode === "login" ? "btn-primary" : "btn-outline"} onClick={() => setAuthMode("login")}>Login</button>
              <button type="button" className={authMode === "register" ? "btn-primary" : "btn-outline"} onClick={() => setAuthMode("register")}>Register</button>
            </div>

            <form onSubmit={authMode === "login" ? login : register}>
              {authMode === "register" && (
                <div className="form-group">
                  <label>Full Name</label>
                  <input type="text" placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
              )}
              <div className="form-group">
                <label>Email</label>
                <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
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
        <div className="topbar-left">
          <h1>Attendance Dashboard</h1>
          <p>Welcome back, <strong>{profile?.full_name || session.user.email}</strong></p>
          <div className="role-badge">Role: {profile?.role || "user"}</div>
        </div>
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
          <h2 className="card-title">Account Information</h2>
          <div className="info-list">
            <div className="info-item">
              <span className="info-label">User ID</span>
              <span className="info-value">{session.user.id}</span>
            </div>

            <div className="info-item">
              <span className="info-label">Email</span>
              {isEditingEmail ? (
                <div className="edit-email-group">
                  <input 
                    type="email" 
                    className="edit-input"
                    value={newEmail} 
                    onChange={(e) => setNewEmail(e.target.value)} 
                  />
                  <button className="btn-save small" onClick={handleUpdateEmail}>Save</button>
                  <button className="btn-cancel small" onClick={() => setIsEditingEmail(false)}>Cancel</button>
                </div>
              ) : (
                <div className="info-value-row">
                  <span className="info-value">{session.user.email}</span>
                  <button className="btn-edit-text" onClick={() => setIsEditingEmail(true)}>Edit</button>
                </div>
              )}
            </div>

            <div className="info-item">
              <span className="info-label">Role</span>
              <span className="info-value">{profile?.role || "user"}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card table-card">
        <h2 className="card-title">My Attendance</h2>
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
          <div className="filter-row">
            <input type="text" placeholder="Search user id or email" value={userFilter} onChange={(e) => setUserFilter(e.target.value)} />
            <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
            <button className="btn-outline" onClick={() => { setUserFilter(""); setDateFilter(""); }}>Clear</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>User ID</th><th>Email</th><th>Date</th><th>Time In</th><th>Time Out</th><th>Action</th></tr>
              </thead>
              <tbody>
                {filteredRecords.map((r) => (
                  <tr key={r.id}>
                    <td className="user-id-cell">{r.user_id}</td>
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