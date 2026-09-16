import React, { useEffect, useState, useCallback } from "react";
import "../css/GenePanel.css";
import {
  uploadGenePanels,
  getGenePanelStats,
  getGenes,
  getMultiPanelGenes,
} from "../api";

export default function GenePanel() {
  const [stats, setStats] = useState(null);
  const [genes, setGenes] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const [category, setCategory] = useState("");
  const [panel, setPanel] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState("all"); // "all" | "multi"

  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      setStats(await getGenePanelStats());
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchGenes = useCallback(async () => {
    setLoading(true);
    try {
      const data =
        view === "multi"
          ? await getMultiPanelGenes({ search, page, pageSize })
          : await getGenes({ category, panel, search, page, pageSize });
      setGenes(data.genes);
      setTotal(data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, category, panel, search, view]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchGenes(); }, [fetchGenes]);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setUploadMessage(null);

    try {
      const data = await uploadGenePanels(file);
      setUploadMessage({ type: "success", text: `Uploaded ${data.genes_inserted} genes.` });
      await fetchStats();
      setPage(1);
      await fetchGenes();
    } catch (err) {
      setUploadMessage({ type: "error", text: err.message });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const panelOptions = stats
    ? [...new Set(stats.panels.map((p) => p.panel))]
    : [];

  return (
    <div className="gene-panel-page">
      <div className="gene-panel-header">
        <div className="gene-panel-titles">
          <h1>Gene Panel</h1>
          <p>Cancerous and non-cancerous gene reference panels</p>
        </div>
        <label className="upload-btn">
          {uploading ? "Uploading..." : "Upload Gene List (.xlsx)"}
          <input type="file" accept=".xlsx,.xls" onChange={handleUpload} hidden disabled={uploading} />
        </label>
      </div>

      {uploadMessage && (
        <div className={`upload-message ${uploadMessage.type}`}>{uploadMessage.text}</div>
      )}

      <div className="stat-cards">
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-label">Total Genes</span>
            <span className="stat-icon stat-icon-neutral">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19V10M12 19V4M20 19v-7" />
              </svg>
            </span>
          </div>
          <span className="stat-value">{stats?.total_genes ?? "—"}</span>
        </div>
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-label">Cancerous</span>
            <span className="stat-icon stat-icon-cancerous">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v4M12 17h.01M10.29 3.86l-8.18 14.18A2 2 0 0 0 3.82 21h16.36a2 2 0 0 0 1.71-2.96L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              </svg>
            </span>
          </div>
          <span className="stat-value">{stats?.cancerous_genes ?? "—"}</span>
        </div>
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-label">Non-Cancerous</span>
            <span className="stat-icon stat-icon-non-cancerous">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
              </svg>
            </span>
          </div>
          <span className="stat-value">{stats?.non_cancerous_genes ?? "—"}</span>
        </div>
      </div>

      {stats && (
        <div className="panel-breakdown">
          <h3>Cancerous</h3>
          <div className="panel-chips">
            {stats.panels
              .filter((p) => p.category === "cancerous")
              .map((p) => (
                <span key={p.panel} className="panel-chip chip-cancerous">
                  {p.panel}: {p.count}
                </span>
              ))}
          </div>
          <h3>Non-Cancerous</h3>
          <div className="panel-chips">
            {stats.panels
              .filter((p) => p.category === "non_cancerous")
              .map((p) => (
                <span key={p.panel} className="panel-chip chip-non-cancerous">
                  {p.panel}: {p.count}
                </span>
              ))}
          </div>
        </div>
      )}

      <div className="view-toggle">
        <button
          className={view === "all" ? "toggle-btn active" : "toggle-btn"}
          onClick={() => { setView("all"); setPage(1); }}
        >
          All Entries
        </button>
        <button
          className={view === "multi" ? "toggle-btn active" : "toggle-btn"}
          onClick={() => { setView("multi"); setPage(1); }}
        >
          Genes in Multiple Panels
        </button>
      </div>

      <div className="gene-filters">
        <input
          type="text"
          placeholder="Search gene symbol..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        {view === "all" && (
          <>
            <select value={category} onChange={(e) => { setCategory(e.target.value); setPanel(""); setPage(1); }}>
              <option value="">All Categories</option>
              <option value="cancerous">Cancerous</option>
              <option value="non_cancerous">Non-Cancerous</option>
            </select>
            <select value={panel} onChange={(e) => { setPanel(e.target.value); setPage(1); }}>
              <option value="">All Panels</option>
              {panelOptions.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </>
        )}
      </div>

      <div className="gene-table-wrapper">
        {view === "all" ? (
          <table className="gene-table">
            <thead>
              <tr>
                <th>Gene Symbol</th>
                <th>Category</th>
                <th>Panel</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} className="empty-row">Loading...</td></tr>
              ) : genes.length === 0 ? (
                <tr><td colSpan={3} className="empty-row">No genes found.</td></tr>
              ) : (
                genes.map((g, i) => (
                  <tr key={`${g.gene_symbol}-${g.panel}-${i}`}>
                    <td className="gene-symbol">{g.gene_symbol}</td>
                    <td>
                      <span className={`category-badge ${g.category === "cancerous" ? "badge-cancerous" : "badge-non-cancerous"}`}>
                        {g.category === "cancerous" ? "Cancerous" : "Non-Cancerous"}
                      </span>
                    </td>
                    <td>{g.panel}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table className="gene-table">
            <thead>
              <tr>
                <th>Gene Symbol</th>
                <th># Panels</th>
                <th>Panels</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} className="empty-row">Loading...</td></tr>
              ) : genes.length === 0 ? (
                <tr><td colSpan={3} className="empty-row">No genes found in multiple panels.</td></tr>
              ) : (
                genes.map((g) => (
                  <tr key={g.gene_symbol}>
                    <td className="gene-symbol">{g.gene_symbol}</td>
                    <td>{g.panel_count}</td>
                    <td>
                      <div className="panel-chips">
                        {g.panels.map((p) => (
                          <span
                            key={p.panel}
                            className={`panel-chip ${p.category === "cancerous" ? "chip-cancerous" : "chip-non-cancerous"}`}
                          >
                            {p.panel}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="pagination">
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
        <span>Page {page} of {totalPages} ({total} genes)</span>
        <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>
    </div>
  );
}