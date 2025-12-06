import { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

const initialStats = {
  id: "",
  originalUrl: "",
  shortUrl: "",
  createdAt: "",
  visitCount: 0,
  visits: [],
};

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "2-digit",
});
const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Request failed");
  }
  return res.json();
}

function formatDate(input) {
  const dateObj = new Date(input);
  const parts = dateFormatter.formatToParts(dateObj);
  const day = parts.find((p) => p.type === "day")?.value || "";
  const month = parts.find((p) => p.type === "month")?.value || "";
  const year = parts.find((p) => p.type === "year")?.value || "";
  const time = timeFormatter.format(dateObj);
  return `${day}/${month}/${year} ${time}`;
}

function deviceLabel(deviceType) {
  if (deviceType === "mobile") return "Mobile";
  if (deviceType === "desktop") return "Desktop";
  return "Unknown";
}

export default function App() {
  const [url, setUrl] = useState("");
  const [links, setLinks] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [stats, setStats] = useState(initialStats);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    loadLinks();
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadStats(selectedId);
    }
  }, [selectedId]);

  useEffect(() => {
    if (selectedId) {
      loadStats(selectedId, { silent: true });
    }
  }, [startDate, endDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!copyStatus) return undefined;
    const timeout = setTimeout(() => setCopyStatus(""), 1600);
    return () => clearTimeout(timeout);
  }, [copyStatus]);

  const shortBase = useMemo(() => {
    if (links.length && links[0].shortUrl) {
      const urlObject = new URL(links[0].shortUrl);
      return `${urlObject.protocol}//${urlObject.host}`;
    }
    return window.location.origin;
  }, [links]);

  async function loadLinks() {
    try {
      const data = await fetchJson(`${API_BASE}/api/links`);
      setLinks(data);
      if (!selectedId && data.length) {
        setSelectedId(data[0].id);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  function handleCopyShortUrl(shortUrl) {
    if (!shortUrl) return;
    if (!navigator?.clipboard) {
      setCopyStatus("Copy not supported");
      return;
    }
    navigator.clipboard
      .writeText(shortUrl)
      .then(() => setCopyStatus("Copied!"))
      .catch(() => setCopyStatus("Copy failed"));
  }

  async function loadStats(id, opts = {}) {
    setStatsLoading(!opts.silent);
    setError("");
    const params = new URLSearchParams();
    if (startDate) params.set("start", startDate);
    if (endDate) params.set("end", endDate);
    try {
      const data = await fetchJson(
        `${API_BASE}/api/links/${id}/stats?${params.toString()}`
      );
      setStats(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setStatsLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    if (!url.trim()) return;
    setLoading(true);
    try {
      const data = await fetchJson(`${API_BASE}/api/links`, {
        method: "POST",
        body: JSON.stringify({ url }),
      });
      setLinks((prev) => [data, ...prev]);
      setSelectedId(data.id);
      setUrl("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="tag">SisHotel Links Tracker</p>
          <h1>Shorten links and watch visits in real time.</h1>
          <p className="subhead">
            Create a branded short link, share it, and monitor device type,
            time, and volume of visits.
          </p>
        </div>
        <div className="hero-card">
          <form onSubmit={handleCreate} className="card">
            <label className="label" htmlFor="url-input">
              Destination URL
            </label>
            <div className="input-row">
              <input
                id="url-input"
                type="url"
                placeholder="https://example.com/page"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
              <button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Shorten"}
              </button>
            </div>
            {error ? <p className="error">{error}</p> : null}
          </form>
        </div>
      </header>

      <main className="layout">
        <section className="panel">
          <div className="panel-head">
            <h2>Links</h2>
            <p className="muted">Latest links with visit counts.</p>
          </div>
          <div className="table">
            <div className="table-head">
              <span>ID</span>
              <span>Original URL</span>
              <span>Visits</span>
              <span>Created</span>
            </div>
            {links.length === 0 ? (
              <p className="muted">No links yet. Create one to get started.</p>
            ) : (
              links.map((link) => (
                <button
                  key={link.id}
                  className={`table-row ${
                    selectedId === link.id ? "active" : ""
                  }`}
                  onClick={() => setSelectedId(link.id)}
                >
                  <span className="code">{link.id}</span>
                  <span className="truncate">{link.originalUrl}</span>
                  <span>{link.visitCount ?? 0}</span>
                  <span className="muted">{formatDate(link.createdAt)}</span>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Stats</h2>
              <p className="muted">
                {stats.id
                  ? `Tracking ${stats.visitCount} visits for ${stats.id}.`
                  : "Select a link to view stats."}
              </p>
            </div>
            {stats.id ? (
              (() => {
                const shortUrl = stats.shortUrl || `${shortBase}/${stats.id}`;
                return (
                  <div className="badge">
                    <span>Short URL</span>
                    <div className="badge-row">
                      <a
                        href={shortUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate"
                        title={shortUrl}
                      >
                        {shortUrl}
                      </a>
                      <button
                        type="button"
                        className="copy-btn"
                        onClick={() => handleCopyShortUrl(shortUrl)}
                      >
                        {copyStatus ? copyStatus : "Copy"}
                      </button>
                    </div>
                  </div>
                );
              })()
            ) : null}
          </div>

          {stats.id ? (
            <>
              <div className="filters">
                <div>
                  <label className="label">Start date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">End date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                    loadStats(selectedId);
                  }}
                >
                  Clear
                </button>
              </div>

              <div className="stat-grid">
                <div className="stat">
                  <p className="muted">Total visits</p>
                  <p className="stat-value">{stats.visitCount}</p>
                </div>
                <div className="stat">
                  <p className="muted">Created</p>
                  <p className="stat-value">{formatDate(stats.createdAt)}</p>
                </div>
              </div>

              <div className="visits">
                <div className="table-head">
                  <span>When</span>
                  <span>Device</span>
                  <span>User agent</span>
                </div>
                {statsLoading ? (
                  <p className="muted">Loading visits...</p>
                ) : null}
                {!statsLoading && stats.visits.length === 0 ? (
                  <p className="muted">No visits in this range.</p>
                ) : null}
                {stats.visits.map((visit, idx) => (
                  <div
                    key={`${visit.timestamp}-${idx}`}
                    className="table-row no-hover"
                  >
                    <span>{formatDate(visit.timestamp)}</span>
                    <span className="code">
                      {deviceLabel(visit.deviceType)}
                    </span>
                    <span className="truncate">{visit.userAgent}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="muted">Select a link to see detailed stats.</p>
          )}
        </section>
      </main>
    </div>
  );
}
