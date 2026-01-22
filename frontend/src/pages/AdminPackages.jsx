import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import DashboardLayout from "../components/DashboardLayout.jsx";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "ARRIVED", label: "At Condo" },
  { value: "PICKED_UP", label: "Picked Up" },
  { value: "RETURNED", label: "Returned" },
];

export default function AdminPackages() {
  const navigate = useNavigate();
  const [packages, setPackages] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [officers, setOfficers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ tenant_id: "", staff_id: "", tracking_no: "", carrier: "", status: "ARRIVED" });
  const [showCreate, setShowCreate] = useState(false);
  const [periodFilter, setPeriodFilter] = useState("");

  const navItems = [
    { key: "dashboard", label: "Dashboard", icon: "▦", onClick: () => navigate("/admin") },
    { key: "packages", label: "Packages", icon: "📦", onClick: () => navigate("/admin/packages") },
    { key: "officers", label: "Officers", icon: "👥", onClick: () => navigate("/admin/officers") },
    { key: "rooms", label: "Rooms / Units", icon: "🏢", onClick: () => navigate("/admin/rooms") },
    { key: "tenants", label: "Tenants", icon: "🧑", onClick: () => navigate("/admin/tenants") },
    { key: "log", label: "Package Log", icon: "📝", onClick: () => navigate("/admin/log") },
  ];

  useEffect(() => {
    loadData();
  }, []);

  function loadData() {
    setLoading(true);
    const qs = new URLSearchParams();
    if (statusFilter) qs.append("status", statusFilter);
    if (periodFilter) qs.append("period", periodFilter);
    const pkgUrl = qs.toString() ? `/admin/packages?${qs.toString()}` : "/admin/packages";
    Promise.all([api.get(pkgUrl), api.get("/admin/tenants"), api.get("/admin/officers")])
      .then(([pkgRes, tenantRes, officerRes]) => {
        setPackages(pkgRes.data.packages || []);
        setTenants(tenantRes.data.tenants || []);
        setOfficers(officerRes.data.officers || []);
      })
      .catch(() => alert("Failed to load packages"))
      .finally(() => setLoading(false));
  }

  async function handleDelete(pkgId) {
    if (!window.confirm("Delete this package?")) return;
    try {
      await api.delete(`/admin/packages/${pkgId}`);
      setPackages((prev) => prev.filter((p) => p.package_id !== pkgId));
    } catch {
      alert("Failed to delete package");
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return packages.filter((p) => {
      const statusOk = statusFilter ? p.current_status === statusFilter : true;
      const searchOk = q
        ? (p.tracking_no || "").toLowerCase().includes(q) ||
          (p.tenant_name || "").toLowerCase().includes(q) ||
          (`${p.building_code || ""}${p.room_no || ""}`).toLowerCase().includes(q)
        : true;
      return statusOk && searchOk;
    });
  }, [packages, statusFilter, search]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.tenant_id || !form.staff_id) {
      alert("Tenant and officer are required");
      return;
    }
    try {
      await api.post("/admin/packages", {
        tenant_id: Number(form.tenant_id),
        staff_id: Number(form.staff_id),
        tracking_no: form.tracking_no || null,
        carrier: form.carrier || null,
        status: form.status,
        note: "",
      });
      setForm({ tenant_id: "", staff_id: "", tracking_no: "", carrier: "", status: "ARRIVED" });
      setShowCreate(false);
      loadData();
      alert("Package created");
    } catch (err) {
      alert("Failed to create package");
    }
  }

  return (
    <DashboardLayout
      title="Packages"
      subtitle="Manage packages and statuses"
      sidebarTitle="ADMIN PANEL"
      sidebarSubtitle="Building Management"
      activeKey="packages"
      userName="Administrator"
      userSub="Admin"
      navItems={navItems}
    >
      <div className="tableBox">
        <div className="tableHeader" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Packages</span>
          <button className="btnPrimary" onClick={() => setShowCreate(true)} style={{ padding: "10px 14px" }}>
            + Add Package
          </button>
        </div>
        <div className="tableControls">
          <div className="filterGroup">
            <select className="filterControl" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <select className="filterControl" value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)}>
              <option value="">All time</option>
              <option value="today">Today</option>
              <option value="last7">Last 7 days</option>
              <option value="last30">Last 30 days</option>
              <option value="month">This month</option>
            </select>
          </div>
          <div className="searchBox">
            <span className="searchIcon">🔍</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tracking, tenant or unit"
            />
          </div>
        </div>

        <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Tracking</th>
                <th>Tenant</th>
                <th>Unit</th>
                <th>Status</th>
                <th>Arrived</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6">Loading…</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="6">No packages found</td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.package_id}>
                    <td>{p.tracking_no || "—"}</td>
                    <td>{p.tenant_name}</td>
                    <td>
                      {p.building_code}
                      {p.room_no}
                    </td>
                    <td>
                      <span className="badge">{p.current_status}</span>
                    </td>
                    <td>{p.arrived_at ? new Date(p.arrived_at).toLocaleString() : "-"}</td>
                    <td style={{ display: "flex", gap: 8 }}>
                      <button className="btnSecondary" onClick={() => navigate(`/admin/packages/${p.package_id}`)}>View</button>
                      <button
                        className="btnSecondary"
                        style={{ background: "#fee2e2", color: "#b91c1c", borderColor: "#fecaca" }}
                        onClick={() => handleDelete(p.package_id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={() => setShowCreate(false)}
          >
            <div
              className="tableBox"
              style={{
                maxWidth: 760,
                width: "90%",
                boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
                background: "#f8fafc",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="tableHeader" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Add Package</span>
                <button className="btnSecondary" onClick={() => setShowCreate(false)}>
                Close
              </button>
            </div>
            <form
              onSubmit={handleCreate}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                padding: 18,
                background: "#fff",
                borderRadius: 16,
                border: "1px solid #e5e7eb",
                margin: "0 12px 16px",
              }}
            >
              <div>
                <label className="label">Tenant</label>
                <select
                  value={form.tenant_id}
                  onChange={(e) => setForm((f) => ({ ...f, tenant_id: e.target.value }))}
                  style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#f9fafb" }}
                >
                  <option value="">Select tenant</option>
                  {tenants.map((t) => (
                    <option key={t.tenant_id} value={t.tenant_id}>
                      {t.full_name} ({t.building_code}
                      {t.room_no})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Officer</label>
                <select
                  value={form.staff_id}
                  onChange={(e) => setForm((f) => ({ ...f, staff_id: e.target.value }))}
                  style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#f9fafb" }}
                >
                  <option value="">Select officer</option>
                  {officers.map((o) => (
                    <option key={o.staff_id} value={o.staff_id}>
                      {o.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Tracking No</label>
                <input
                  placeholder="e.g. TH12345678"
                  value={form.tracking_no}
                  onChange={(e) => setForm((f) => ({ ...f, tracking_no: e.target.value }))}
                  style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#f9fafb" }}
                />
              </div>

              <div>
                <label className="label">Carrier</label>
                <input
                  placeholder="e.g. Kerry"
                  value={form.carrier}
                  onChange={(e) => setForm((f) => ({ ...f, carrier: e.target.value }))}
                  style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#f9fafb" }}
                />
              </div>

              <div>
                <label className="label">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#f9fafb" }}
                >
                  {STATUS_OPTIONS.filter((o) => o.value).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                <button className="btnPrimary" type="submit">
                  Create package
                </button>
                <button className="btnSecondary" type="button" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
