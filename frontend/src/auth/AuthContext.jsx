import { createContext, useContext, useMemo, useState } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [role, setRole] = useState(localStorage.getItem("role") || "");
  const [displayName, setDisplayName] = useState(localStorage.getItem("displayName") || "");

  const isAuthed = !!token;

  function login({ token, role, displayName }) {
    localStorage.setItem("token", token);
    localStorage.setItem("role", role);
    if (displayName) localStorage.setItem("displayName", displayName);
    setToken(token);
    setRole(role);
    if (displayName) setDisplayName(displayName);
  }

  function setDisplayNameValue(name) {
    if (name) {
      localStorage.setItem("displayName", name);
      setDisplayName(name);
    }
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("displayName");
    setToken("");
    setRole("");
    setDisplayName("");
  }

  const value = useMemo(
    () => ({ token, role, displayName, isAuthed, login, logout, setDisplayNameValue }),
    [token, role, displayName, isAuthed]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
