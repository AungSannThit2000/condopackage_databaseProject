import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import DashboardLayout from "../components/DashboardLayout.jsx";

export default function TenantProfile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/tenant/profile")
      .then((res) => setProfile(res.data.profile))
      .catch(() => alert("Failed to load profile"))
      .finally(() => setLoading(false));
  }, []);

  const roomLabel = profile ? `${profile.building_code || ""}${profile.room_no || ""}` : "";
  const userBadge = roomLabel && profile?.full_name ? `${roomLabel} - ${profile.full_name}` : "Resident";

  return (
    <DashboardLayout
      title="Profile"
      subtitle="Your condo contact details"
      sidebarTitle="TENANT"
      sidebarSubtitle={userBadge}
      activeKey="profile"
      userName={profile?.full_name || "Tenant"}
      userSub={userBadge}
      navItems={[
        { key: "dashboard", label: "Dashboard", icon: "▦", onClick: () => navigate("/tenant") },
        { key: "mypackages", label: "My Packages", icon: "📦", onClick: () => navigate("/tenant/packages") },
        { key: "profile", label: "Profile", icon: "👤", onClick: () => navigate("/tenant/profile") },
      ]}
    >
      <div className="tableBox" style={{ maxWidth: 720, margin: "0 auto" }}>
        <div className="tableHeader">Profile (read-only)</div>
        {loading ? (
          <div style={{ padding: 18 }}>Loading…</div>
        ) : !profile ? (
          <div style={{ padding: 18 }}>Profile not found</div>
        ) : (
          <div style={{ padding: 18 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 18,
                marginBottom: 20,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span role="img" aria-label="person">👤</span>
                  <span style={{ fontWeight: 600, color: "#374151" }}>Tenant Name</span>
                </div>
                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e5e7eb",
                    borderRadius: 16,
                    padding: "14px 16px",
                    color: "#111827",
                  }}
                >
                  {profile.full_name || "-"}
                </div>
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span role="img" aria-label="home">🏠</span>
                  <span style={{ fontWeight: 600, color: "#374151" }}>Unit / Room</span>
                </div>
                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e5e7eb",
                    borderRadius: 16,
                    padding: "14px 16px",
                    color: "#111827",
                  }}
                >
                  {profile.building_code}
                  {profile.room_no}
                </div>
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span role="img" aria-label="phone">📞</span>
                  <span style={{ fontWeight: 600, color: "#374151" }}>Phone</span>
                </div>
                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e5e7eb",
                    borderRadius: 16,
                    padding: "14px 16px",
                    color: "#111827",
                  }}
                >
                  {profile.phone || "-"}
                </div>
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span role="img" aria-label="email">✉️</span>
                  <span style={{ fontWeight: 600, color: "#374151" }}>Email</span>
                </div>
                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e5e7eb",
                    borderRadius: 16,
                    padding: "14px 16px",
                    color: "#111827",
                  }}
                >
                  {profile.email || "-"}
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
              }}
            >
              <div
                style={{
                  background: "#f8fafc",
                  borderRadius: 16,
                  padding: 14,
                  border: "1px solid #e5e7eb",
                }}
              >
                <div style={{ fontWeight: 600, color: "#6b21a8", display: "flex", alignItems: "center", gap: 8 }}>
                  🏢 <span>Building</span>
                </div>
                <div style={{ marginTop: 6, color: "#111827" }}>
                  {profile.building_code || "-"}
                </div>
              </div>
              <div
                style={{
                  background: "#f8fafc",
                  borderRadius: 16,
                  padding: 14,
                  border: "1px solid #e5e7eb",
                }}
              >
                <div style={{ fontWeight: 600, color: "#2563eb", display: "flex", alignItems: "center", gap: 8 }}>
                  🧑 <span>Floor</span>
                </div>
                <div style={{ marginTop: 6, color: "#111827" }}>
                  {profile.floor ? `${profile.floor} Floor` : "-"}
                </div>
              </div>
              <div
                style={{
                  background: "#f8fafc",
                  borderRadius: 16,
                  padding: 14,
                  border: "1px solid #e5e7eb",
                }}
              >
                <div style={{ fontWeight: 600, color: "#16a34a", display: "flex", alignItems: "center", gap: 8 }}>
                  ☎️ <span>Status</span>
                </div>
                <div style={{ marginTop: 6, color: "#111827" }}>
                  Active
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
