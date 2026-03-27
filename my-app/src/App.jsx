import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.client";
import "./App.css";

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [message, setMessage] = useState("");
  const [history, setHistory] = useState([]);
  const [adminRecords, setAdminRecords] = useState([]);
  const [users, setUsers] = useState([]);

  const [dateFilter, setDateFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");

  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("user");
  const [userSearch, setUserSearch] = useState("");

  const isAdmin = useMemo(() => profile?.role === "admin", [profile]);

  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setSession(session);

      if (session?.user) {
        await ensureProfile(session.user);
        await loadProfile(session.user.id);
        await loadMyAttendance(session.user.id);
      }

      setLoading(false);
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setMessage("");

      if (session?.user) {
        await ensureProfile(session.user);
        await loadProfile(session.user.id);
        await loadMyAttendance(session.user.id);
      } else {
        setProfile(null);
        setHistory([]);
        setAdminRecords([]);
        setUsers([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user && isAdmin) {
      loadAllAttendance();
      loadUsers();
    }
  }, [session, isAdmin]);

  const ensureProfile = async (user) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (!data) {
      await supabase.from("profiles").insert([
        {
          id: user.id,
          email: user.email,
          role: "user",
        },
      ]);
    }
  };

  const loadProfile = async (userId) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (!error) {
      setProfile(data);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setMessage("");

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    if (data.user) {
      setMessage("Registration successful. You can now log in.");
    } else {
      setMessage("Registration submitted.");
    }

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
      .select(`
        id,
        user_id,
        date,
        time_in,
        time_out,
        profiles (
          email
        )
      `)
      .order("date", { ascending: false });

    if (error) {
      setMessage(error.message);
      return;
    }

    setAdminRecords(data || []);
  };

  const loadUsers = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      return;
    }

    setUsers(data || []);
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
      .update({ time_out: new Date().toISOString() })
      .eq("id", existing.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Time-out recorded successfully.");
    loadMyAttendance(session.user.id);
    if (isAdmin) loadAllAttendance();
  };

  const createUserByAdmin = async (e) => {
    e.preventDefault();
    setMessage("");

    const response = await fetch("/api/create-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        adminEmail: session.user.email,
        email: newUserEmail,
        password: newUserPassword,
        role: newUserRole,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(result.error || "Failed to create user.");
      return;
    }

    setMessage("User account created successfully.");
    setNewUserEmail("");
    setNewUserPassword("");
    setNewUserRole("user");
    loadUsers();
  };

  const deleteUserByAdmin = async (userId) => {
    const response = await fetch("/api/delete-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        adminEmail: session.user.email,
        userId,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(result.error || "Failed to delete user.");
      return;
    }

    setMessage("User deleted successfully.");
    loadUsers();
    loadAllAttendance();
  };

  const formatDateTime = (value) => {
    if (!value) return "-";
    return new Date(value).toLocaleString();
  };

  const filteredAdminRecords = adminRecords.filter((record) => {
    const matchDate = dateFilter ? record.date === dateFilter : true;
    const keyword = userFilter.toLowerCase();

    const matchUser = userFilter
      ? record.user_id?.toLowerCase().includes(keyword) ||
        record.profiles?.email?.toLowerCase().includes(keyword)
      : true;

    return matchDate && matchUser;
  });

  const filteredUsers = users.filter((user) =>
    user.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  if (loading) {
    return <div className="center-box">Loading...</div>;
  }

  if (!session) {
    return (
      <div className="auth-page">
        <div className="card auth-card">
          <h1>Attendance Tracking System</h1>
          <p className="subtitle">Register or log in</p>

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
          <p className="subtitle">
            Logged in as: {session.user.email} ({profile?.role || "user"})
          </p>
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
        <>
          <section className="card admin-card">
            <h2>Admin Account Panel</h2>

            <form onSubmit={createUserByAdmin} className="admin-form">
              <input
                type="email"
                placeholder="New user email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                required
              />
              <input
                type="password"
                placeholder="New user password"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                required
              />
              <select
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value)}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
              <button type="submit" className="primary-btn">
                Create Account
              </button>
            </form>

            <div className="filters">
              <input
                type="text"
                placeholder="Search user by email"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Created At</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length > 0 ? (
                    filteredUsers.map((user) => (
                      <tr key={user.id}>
                        <td>{user.email}</td>
                        <td>{user.role}</td>
                        <td>{formatDateTime(user.created_at)}</td>
                        <td>
                          {user.id !== session.user.id && (
                            <button
                              className="delete-btn"
                              onClick={() => deleteUserByAdmin(user.id)}
                            >
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4">No users found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

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
                placeholder="Filter by email or user ID"
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
                    <th>Email</th>
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
                        <td>{item.profiles?.email || "-"}</td>
                        <td>{item.user_id}</td>
                        <td>{item.date}</td>
                        <td>{formatDateTime(item.time_in)}</td>
                        <td>{formatDateTime(item.time_out)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5">No matching records found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}