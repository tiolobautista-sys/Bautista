import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseclient";
import "./App.css";

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL;

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [message, setMessage] = useState("");
  const [history, setHistory] = useState([]);
  const [adminRecords, setAdminRecords] = useState([]);

  const [dateFilter, setDateFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");

  const isAdmin = useMemo(() => {
    return session?.user?.email === ADMIN_EMAIL;
  }, [session]);

  useEffect(() => {
    const getSessionData = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setSession(session);
      setLoading(false);

      if (session) {
        loadMyAttendance(session.user.id);
      }
    };

    getSessionData();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setMessage("");

      if (session) {
        loadMyAttendance(session.user.id);
      } else {
        setHistory([]);
        setAdminRecords([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user?.id) {
      loadMyAttendance(session.user.id);
      if (isAdmin) {
        loadAllAttendance();
      }
    }
  }, [session, isAdmin]);

  const handleRegister = async (e) => {
    e.preventDefault();
    setMessage("");

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Registration successful. Check your email if confirmation is enabled.");
    setEmail("");
    setPassword("");
  };

  const handleLogin = async (e) => {
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

    setEmail("");
    setPassword("");
    setMessage("Login successful.");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setMessage("Logged out.");
  };

  const loadMyAttendance = async (userId) => {
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
  };

  const loadAllAttendance = async () => {
    const { data, error } = await supabase
      .from("attendance")
      .select("*")
      .order("date", { ascending: false })
      .order("time_in", { ascending: false });

    if (error) {
      setMessage(error.message);
      return;
    }

    setAdminRecords(data || []);
  };

  const getTodayDate = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const local = new Date(now.getTime() - offset * 60000);
    return local.toISOString().split("T")[0];
  };

  const handleTimeIn = async () => {
    setMessage("");
    const today = getTodayDate();

    const { data: existing, error: checkError } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("date", today)
      .maybeSingle();

    if (checkError) {
      setMessage(checkError.message);
      return;
    }

    if (existing?.time_in) {
      setMessage("You already timed in today.");
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

    setMessage("Time-in recorded successfully.");
    loadMyAttendance(session.user.id);
    if (isAdmin) loadAllAttendance();
  };

  const handleTimeOut = async () => {
    setMessage("");
    const today = getTodayDate();

    const { data: existing, error: checkError } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("date", today)
      .maybeSingle();

    if (checkError) {
      setMessage(checkError.message);
      return;
    }

    if (!existing?.time_in) {
      setMessage("You need to time in first.");
      return;
    }

    if (existing?.time_out) {
      setMessage("You already timed out today.");
      return;
    }

    const { error } = await supabase
      .from("attendance")
      .update({
        time_out: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Time-out recorded successfully.");
    loadMyAttendance(session.user.id);
    if (isAdmin) loadAllAttendance();
  };

  const filteredAdminRecords = adminRecords.filter((record) => {
    const matchDate = dateFilter ? record.date === dateFilter : true;
    const matchUser = userFilter
      ? record.user_id.toLowerCase().includes(userFilter.toLowerCase())
      : true;

    return matchDate && matchUser;
  });

  const formatDateTime = (value) => {
    if (!value) return "-";
    return new Date(value).toLocaleString();
  };

  if (loading) {
    return <div className="center-box">Loading...</div>;
  }

  if (!session) {
    return (
      <div className="auth-page">
        <div className="card auth-card">
          <h1>Attendance Tracking System</h1>
          <p className="subtitle">
            Register or log in to record your attendance
          </p>

          <div className="auth-switch">
            <button
              className={authMode === "login" ? "active" : ""}
              onClick={() => setAuthMode("login")}
            >
              Login
            </button>
            <button
              className={authMode === "register" ? "active" : ""}
              onClick={() => setAuthMode("register")}
            >
              Register
            </button>
          </div>

          <form onSubmit={authMode === "login" ? handleLogin : handleRegister}>
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

            <button type="submit" className="primary-btn">
              {authMode === "login" ? "Login" : "Register"}
            </button>
          </form>

          {message && <p className="message">{message}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1>Attendance Tracking System</h1>
          <p className="subtitle">Logged in as: {session.user.email}</p>
        </div>
        <button className="logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </header>

      {message && <div className="notice">{message}</div>}

      <section className="grid">
        <div className="card">
          <h2>User Panel</h2>
          <div className="button-row">
            <button className="primary-btn" onClick={handleTimeIn}>
              Time In
            </button>
            <button className="secondary-btn" onClick={handleTimeOut}>
              Time Out
            </button>
          </div>
        </div>

        <div className="card">
          <h2>My Attendance History</h2>
          <div className="table-wrap">
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
                  history.map((item) => (
                    <tr key={item.id}>
                      <td>{item.date}</td>
                      <td>{formatDateTime(item.time_in)}</td>
                      <td>{formatDateTime(item.time_out)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="3">No attendance records yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {isAdmin && (
        <section className="card admin-card">
          <h2>Administrator Monitoring Interface</h2>

          <div className="filters">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
            <input
              type="text"
              placeholder="Filter by user_id"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
            />
            <button
              className="secondary-btn"
              onClick={() => {
                setDateFilter("");
                setUserFilter("");
              }}
            >
              Clear Filters
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Date</th>
                  <th>Time In</th>
                  <th>Time Out</th>
                </tr>
              </thead>
              <tbody>
                {filteredAdminRecords.length > 0 ? (
                  filteredAdminRecords.map((item) => (
                    <tr key={item.id}>
                      <td>{item.user_id}</td>
                      <td>{item.date}</td>
                      <td>{formatDateTime(item.time_in)}</td>
                      <td>{formatDateTime(item.time_out)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4">No matching records found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}