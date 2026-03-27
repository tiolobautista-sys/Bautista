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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
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
      .order("date", { ascending: false });

    if (error) {
      setMessage(error.message);
      return;
    }

    setHistory(data || []);
  }

  async function loadAdminRecords() {
    const { data, error } = await supabase
      .from("attendance")
      .select(`
        id,
        user_id,
        date,
        time_in,
        time_out,
        profiles:user_id (full_name, email)
      `)
      .order("date", { ascending: false })
      .order("time_in", { ascending: false });

    if (error) {
      setMessage(error.message);
      return;
    }

    const formatted = (data || []).map((r) => ({
      id: r.id,
      user_id: r.user_id,
      date: r.date,
      time_in: r.time_in,
      time_out: r.time_out,
      full_name: r.profiles?.full_name || "No name",
      email: r.profiles?.email || "No email",
    }));

    setAdminRecords(formatted);
  }

  const filteredRecords = useMemo(() => {
    return adminRecords.filter((r) => {
      const text = userFilter.trim().toLowerCase();

      const matchUser = text
        ? (r.full_name || "").toLowerCase().includes(text) ||
          (r.email || "").toLowerCase().includes(text) ||
          (r.user_id || "").toLowerCase().includes(text)
        : true;

      const matchDate = dateFilter ? r.date === dateFilter : true;

      return matchUser && matchDate;
    });
  }, [adminRecords, userFilter, dateFilter]);

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
    setMessage("Logged out.");
  }

  async function timeIn() {
    if (!session?.user?.id) return;

    setMessage("");
    const today = getToday();

    const { data: existing, error: fetchError } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("date", today)
      .maybeSingle();

    if (fetchError) {
      setMessage(fetchError.message);
      return;
    }

    if (existing?.time_in) {
      setMessage("Already timed in today.");
      return;
    }

    const { error } = await supabase.from("attendance").insert([
      {
        user_id: session.user.id,
        date: today,
        time_in: new Date().toISOString(),
        time_out: null,
      },
    ]);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Time In recorded.");
    await loadHistory(session.user.id);

    if (profile?.role === "admin") {
      await loadAdminRecords();
    }
  }

  async function timeOut() {
    if (!session?.user?.id) return;

    setMessage("");
    const today = getToday();

    const { data: existing, error: fetchError } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("date", today)
      .maybeSingle();

    if (fetchError) {
      setMessage(fetchError.message);
      return;
    }

    if (!existing?.time_in) {
      setMessage("Time in first.");
      return;
    }

    if (existing?.time_out) {
      setMessage("Already timed out.");
      return;
    }

    const { error } = await supabase
      .from("attendance")
      .update({ time_out: new Date().toISOString() })
      .eq("id", existing.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Time Out recorded.");
    await loadHistory(session.user.id);

    if (profile?.role === "admin") {
      await loadAdminRecords();
    }
  }

  if (loading) {
    return (
      <div className="container">
        <h2>Loading...</h2>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="container">
        <h1>Attendance System</h1>

        <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
          <button onClick={() => setAuthMode("login")}>Login</button>
          <button onClick={() => setAuthMode("register")}>Register</button>
        </div>

        <form onSubmit={authMode === "login" ? login : register}>
          {authMode === "register" && (
            <input
              type="text"
              placeholder="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              style={{ display: "block", marginBottom: "10px" }}
            />
          )}

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ display: "block", marginBottom: "10px" }}
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ display: "block", marginBottom: "10px" }}
          />

          <button type="submit">
            {authMode === "login" ? "Login" : "Register"}
          </button>
        </form>

        {message && <p>{message}</p>}
      </div>
    );
  }

  return (
    <div className="container">
      <h2>Welcome {profile?.full_name || session.user.email}</h2>
      <p>Role: {profile?.role || "user"}</p>

      <button onClick={logout}>Logout</button>

      <hr />

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button onClick={timeIn}>Time In</button>
        <button onClick={timeOut}>Time Out</button>
      </div>

      {message && <p>{message}</p>}

      <h3>My Attendance</h3>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Time In</th>
            <th>Time Out</th>
          </tr>
        </thead>
        <tbody>
          {history.length > 0 ? (
            history.map((h) => (
              <tr key={h.id}>
                <td>{formatDate(h.date)}</td>
                <td>{formatDateTime(h.time_in)}</td>
                <td>{formatDateTime(h.time_out)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="3">No attendance records yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      {profile?.role === "admin" && (
        <>
          <h3 style={{ marginTop: "30px" }}>Admin Panel</h3>

          <div style={{ display: "flex", gap: "10px", marginBottom: "15px", flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="Search name, email, or user id"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
            />

            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />

            <button
              onClick={() => {
                setUserFilter("");
                setDateFilter("");
              }}
            >
              Clear Filters
            </button>
          </div>

          <table>
            <thead>
              <tr>
                <th>User ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Date</th>
                <th>Time In</th>
                <th>Time Out</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length > 0 ? (
                filteredRecords.map((r) => (
                  <tr key={r.id}>
                    <td>{r.user_id}</td>
                    <td>{r.full_name}</td>
                    <td>{r.email}</td>
                    <td>{formatDate(r.date)}</td>
                    <td>{formatDateTime(r.time_in)}</td>
                    <td>{formatDateTime(r.time_out)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6">No matching records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}