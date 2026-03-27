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
  return now.toISOString().split("T")[0];
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

  // ================= SESSION =================
  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setLoading(false);
    };

    getSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ================= LOAD DATA =================
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

  // ================= LOAD PROFILE =================
  async function loadProfile(userId) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    setProfile(data);
  }

  // ================= USER HISTORY =================
  async function loadHistory(userId) {
    const { data } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false });

    setHistory(data || []);
  }

  // ================= ADMIN RECORDS =================
  async function loadAdminRecords() {
    const { data } = await supabase
      .from("attendance")
      .select(`
        id,
        user_id,
        date,
        time_in,
        time_out,
        profiles:user_id (full_name, email)
      `)
      .order("date", { ascending: false });

    const formatted = (data || []).map((r) => ({
      ...r,
      full_name: r.profiles?.full_name || "No name",
      email: r.profiles?.email || "No email",
    }));

    setAdminRecords(formatted);
  }

  // ================= FILTER =================
  const filteredRecords = useMemo(() => {
    return adminRecords.filter((r) => {
      const matchUser = userFilter
        ? r.full_name.toLowerCase().includes(userFilter.toLowerCase()) ||
          r.email.toLowerCase().includes(userFilter.toLowerCase())
        : true;

      const matchDate = dateFilter ? r.date === dateFilter : true;

      return matchUser && matchDate;
    });
  }, [adminRecords, userFilter, dateFilter]);

  // ================= AUTH =================
  async function register(e) {
    e.preventDefault();

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });

    if (error) return setMessage(error.message);

    setMessage("Registered! Please login.");
    setAuthMode("login");
  }

  async function login(e) {
    e.preventDefault();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) return setMessage(error.message);

    setMessage("Login success!");
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  // ================= TIME IN =================
  async function timeIn() {
    const today = getToday();

    const { data: existing } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("date", today)
      .maybeSingle();

    if (existing?.time_in) {
      return setMessage("Already timed in today.");
    }

    const { error } = await supabase.from("attendance").insert([
      {
        user_id: session.user.id,
        date: today,
        time_in: new Date().toISOString(),
      },
    ]);

    if (error) return setMessage(error.message);

    setMessage("Time In recorded.");
    loadHistory(session.user.id);
    loadAdminRecords();
  }

  // ================= TIME OUT =================
  async function timeOut() {
    const today = getToday();

    const { data: existing } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("date", today)
      .maybeSingle();

    if (!existing?.time_in) {
      return setMessage("Time in first.");
    }

    if (existing?.time_out) {
      return setMessage("Already timed out.");
    }

    const { error } = await supabase
      .from("attendance")
      .update({ time_out: new Date().toISOString() })
      .eq("id", existing.id);

    if (error) return setMessage(error.message);

    setMessage("Time Out recorded.");
    loadHistory(session.user.id);
    loadAdminRecords();
  }

  // ================= UI =================
  if (loading) return <h2>Loading...</h2>;

  if (!session) {
    return (
      <div className="container">
        <h1>Attendance System</h1>

        <button onClick={() => setAuthMode("login")}>Login</button>
        <button onClick={() => setAuthMode("register")}>Register</button>

        <form onSubmit={authMode === "login" ? login : register}>
          {authMode === "register" && (
            <input
              placeholder="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          )}

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button type="submit">
            {authMode === "login" ? "Login" : "Register"}
          </button>
        </form>

        <p>{message}</p>
      </div>
    );
  }

  return (
    <div className="container">
      <h2>Welcome {profile?.full_name || session.user.email}</h2>
      <p>Role: {profile?.role}</p>

      <button onClick={logout}>Logout</button>

      <hr />

      <button onClick={timeIn}>Time In</button>
      <button onClick={timeOut}>Time Out</button>

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
          {history.map((h) => (
            <tr key={h.id}>
              <td>{formatDate(h.date)}</td>
              <td>{formatDateTime(h.time_in)}</td>
              <td>{formatDateTime(h.time_out)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {profile?.role === "admin" && (
        <>
          <h3>Admin Panel</h3>

          <input
            placeholder="Search name/email"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
          />

          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
          />

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
              {filteredRecords.map((r) => (
                <tr key={r.id}>
                  <td>{r.user_id}</td>
                  <td>{r.full_name}</td>
                  <td>{r.email}</td>
                  <td>{formatDate(r.date)}</td>
                  <td>{formatDateTime(r.time_in)}</td>
                  <td>{formatDateTime(r.time_out)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}