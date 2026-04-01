export default function SaasLoading() {
  return (
    <div className="saas-page-card">
      <div className="dashboard-skeleton dashboard-skeleton-title" />

      <div className="dashboard-skeleton-row">
        <div className="dashboard-skeleton dashboard-skeleton-button" />
        <div className="dashboard-skeleton dashboard-skeleton-button" />
        <div className="dashboard-skeleton dashboard-skeleton-button" />
      </div>

      <div className="dashboard-kpi-grid">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="dashboard-kpi-card">
            <div className="dashboard-skeleton dashboard-skeleton-label" />
            <div className="dashboard-skeleton dashboard-skeleton-value" />
            <div className="dashboard-skeleton dashboard-skeleton-line" />
          </div>
        ))}
      </div>

      <div className="dashboard-skeleton dashboard-skeleton-table" style={{ height: 260 }} />
    </div>
  );
}
