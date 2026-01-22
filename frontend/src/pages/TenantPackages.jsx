import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import DashboardLayout from "../components/DashboardLayout.jsx";

const STATUS_LABELS = {
  ARRIVED: "At Condo",
  PICKED_UP: "Picked Up",
  RETURNED: "Returned",
};

export default function TenantPackages() {
  const navigate = useNavigate();

  const [packages, setPackages] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    api
      .get("/tenant/packages")
      .then((res) => {
        setPackages(res.data.packages || []);
        setProfile(res.data.profile);
      })
      .catch(() => alert("Failed to load package history"))
      .finally(() => setLoading(false));
  }, []);

  const filteredPackages = useMemo(() => {
    const q = search.trim().toLowerCase();
    return packages.filter((p) => {
      const statusOk = statusFilter ? p.current_status === statusFilter : true;
      const searchOk = q
        ? (p.tracking_no || "").toLowerCase().includes(q)
        : true;
      return statusOk && searchOk;
    });
  }, [packages, statusFilter, search]);

  const roomLabel = profile ? `${profile.building_code || ""}${profile.room_no || ""}` : "";
  const userBadge = roomLabel && profile?.full_name ? `${roomLabel} - ${profile.full_name}` : "Resident";

  return (
    <DashboardLayout
      title="Tenant View"
      subtitle="Check your deliveries and pickup history."
      sidebarTitle="TENANT"
      sidebarSubtitle={userBadge}
      activeKey="mypackages"
      userName={profile?.full_name || "Tenant"}
      userSub={userBadge}
      navItems={[
        { key: "dashboard", label: "Dashboard", icon: "▦", onClick: () => navigate("/tenant") },
        { key: "mypackages", label: "My Packages", icon: "📦", onClick: () => navigate("/tenant/packages") },
        { key: "profile", label: "Profile", icon: "👤", onClick: () => navigate("/tenant/profile") },
      ]}
    >
      <div className="tableBox">
        <div className="tableHeader">My Package History</div>

        <div className="tableControls">
          <div className="filterGroup">
            <select
              className="filterControl"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="ARRIVED">At Condo</option>
              <option value="PICKED_UP">Picked up</option>
              <option value="RETURNED">Returned</option>
            </select>
          </div>

          <div className="searchBox" style={{ flex: 1, maxWidth: 420 }}>
            <span className="searchIcon">🔍</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tracking number"
            />
          </div>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Tracking No.</th>
              <th>Status</th>
              <th>Arrived</th>
              <th>Picked up / Returned</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="4">Loading…</td>
              </tr>
            ) : filteredPackages.length === 0 ? (
              <tr>
                <td colSpan="4">No packages found</td>
              </tr>
            ) : (
              filteredPackages.map((p) => (
                <tr key={p.package_id}>
                  <td>{p.tracking_no || "—"}</td>
                  <td>
                    <span className="badge">{STATUS_LABELS[p.current_status] || p.current_status}</span>
                  </td>
                  <td>{p.arrived_at ? new Date(p.arrived_at).toLocaleString() : "-"}</td>
                  <td>{p.picked_up_at ? new Date(p.picked_up_at).toLocaleString() : "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}
