"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Status = "idle" | "uploading" | "building" | "ready" | "error";
type ReadyState = "QUEUED" | "INITIALIZING" | "BUILDING" | "READY" | "ERROR" | "CANCELED" | "";
type RateLimitInfo = { limit: number | null; remaining: number | null; reset: number | null } | null;

type LogLine = {
  time: string;
  text: string;
  kind: "info" | "build" | "error" | "success";
};

const STAGES: { key: ReadyState; label: string }[] = [
  { key: "", label: "Upload" },
  { key: "QUEUED", label: "Queued" },
  { key: "INITIALIZING", label: "Init" },
  { key: "BUILDING", label: "Build" },
  { key: "READY", label: "Live" },
];

const PROGRESS_MAP: Record<ReadyState, number> = {
  "": 8,
  QUEUED: 25,
  INITIALIZING: 45,
  BUILDING: 70,
  READY: 100,
  ERROR: 100,
  CANCELED: 100,
};

function nowLabel() {
  return new Date().toLocaleTimeString("id-ID", { hour12: false });
}

function formatResetIn(resetEpochSeconds: number) {
  const diffMs = resetEpochSeconds * 1000 - Date.now();
  if (diffMs <= 0) return "sebentar lagi";
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "< 1m lagi";
  if (diffMin < 60) return `${diffMin}m lagi`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return `${h}j ${m}m lagi`;
}

function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" fill="currentColor" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 16V4M12 4 7 9M12 4l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function Home() {
  const [projectName, setProjectName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [deployUrl, setDeployUrl] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [readyState, setReadyState] = useState<ReadyState>("");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [copiedError, setCopiedError] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [lastDeployId, setLastDeployId] = useState("");
  const [deployedProjectName, setDeployedProjectName] = useState("");
  const [rateLimit, setRateLimit] = useState<RateLimitInfo>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seenLogTimestamps = useRef<Set<number>>(new Set());
  const topRef = useRef<HTMLDivElement>(null);
  const logsSectionRef = useRef<HTMLDivElement>(null);
  const logsScrollRef = useRef<HTMLDivElement>(null);
  const clearLogsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addLog = useCallback((text: string, kind: LogLine["kind"] = "info") => {
    setLogs((prev) => [...prev, { time: nowLabel(), text, kind }]);
  }, []);

  const copyToClipboard = async (text: string, onDone: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      onDone(true);
      setTimeout(() => onDone(false), 1800);
    } catch {
      // clipboard tidak tersedia, abaikan diam-diam
    }
  };

  const fetchBuildLogs = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/logs/${id}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.lines)) return;
      const newLines = data.lines.filter(
        (l: { text: string; ts: number }) => !seenLogTimestamps.current.has(l.ts)
      );
      for (const l of newLines) seenLogTimestamps.current.add(l.ts);
      if (newLines.length > 0) {
        setLogs((prev) => [
          ...prev,
          ...newLines.map((l: { text: string; ts: number }) => ({
            time: nowLabel(),
            text: l.text,
            kind: "build" as const,
          })),
        ]);
      }
    } catch {
      // log build opsional
    }
  }, []);

  const cleanupProject = useCallback((name: string) => {
    if (!name) return;
    fetch(`/api/project/${encodeURIComponent(name)}`, { method: "DELETE" }).catch(() => {
      // best-effort, gapapa kalau gagal
    });
  }, []);

  const pollStatus = useCallback(
    async (id: string, projectName: string) => {
      let lastError = "";
      let lastReadyState = "";
      for (let i = 0; i < 200; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        fetchBuildLogs(id);
        try {
          const res = await fetch(`/api/status/${id}`, { cache: "no-store" });
          const data = await res.json();
          if (data?.rateLimit) setRateLimit(data.rateLimit);
          if (!res.ok) {
            lastError = data?.error || `Gagal cek status (HTTP ${res.status})`;
            addLog(lastError, "error");
            continue;
          }

          if (data.readyState && data.readyState !== lastReadyState) {
            lastReadyState = data.readyState;
            setReadyState(data.readyState as ReadyState);
            addLog(`Status: ${data.readyState}`, "info");
          }

          if (data.readyState === "READY") {
            await fetchBuildLogs(id);
            addLog("Deployment READY, website sudah live.", "success");
            setStatus("ready");
            setDeployUrl(data.url);
            return;
          }
          if (data.readyState === "ERROR" || data.readyState === "CANCELED") {
            const errText =
              data.readyState === "CANCELED" ? "Deployment dibatalkan." : "Build gagal di Vercel.";
            addLog(errText, "error");
            setStatus("error");
            setMessage(errText);
            cleanupProject(projectName);
            return;
          }
        } catch (err: any) {
          lastError = err?.message || "Gagal menghubungi server saat cek status.";
          addLog(lastError, "error");
        }
      }
      const timeoutMsg = lastError
        ? `Berhenti memantau otomatis setelah 10 menit. Error terakhir: ${lastError}`
        : "Berhenti memantau otomatis setelah 10 menit. Coba deploy ulang untuk memantau lagi.";
      setStatus("error");
      setMessage(timeoutMsg);
    },
    [addLog, fetchBuildLogs, cleanupProject]
  );

  const handleDeploy = async () => {
    if (!file) {
      setMessage("Pilih file .zip dulu.");
      return;
    }
    setStatus("uploading");
    setMessage("");
    setDeployUrl("");
    setReadyState("");
    setLogs([]);
    setDeployedProjectName("");
    seenLogTimestamps.current = new Set();

    const uploadingFile = file;
    const uploadingProjectName = projectName;

    addLog(`Uploading ${uploadingFile.name} (${(uploadingFile.size / 1024).toFixed(0)} KB)...`);

    const formData = new FormData();
    formData.append("file", uploadingFile);
    formData.append("projectName", uploadingProjectName);

    // Langsung bersihkan input file & nama project biar siap dipakai lagi
    setFile(null);
    setProjectName("");
    if (inputRef.current) inputRef.current.value = "";

    try {
      const res = await fetch("/api/deploy", { method: "POST", body: formData });
      const data = await res.json();
      if (data?.rateLimit) setRateLimit(data.rateLimit);
      if (!res.ok) {
        addLog(data.error || "Gagal deploy.", "error");
        setStatus("error");
        setMessage(data.error || "Gagal deploy.");
        return;
      }

      addLog(`Deployment dibuat: ${data.projectName} (${data.id})`);
      setLastDeployId(data.id);
      setDeployedProjectName(data.projectName);

      if (data.readyState === "READY") {
        setReadyState("READY");
        addLog("Deployment langsung READY, website sudah live.", "success");
        setStatus("ready");
        setDeployUrl(data.url);
        return;
      }
      if (data.readyState === "ERROR" || data.readyState === "CANCELED") {
        addLog("Build langsung gagal.", "error");
        setStatus("error");
        setMessage("Build langsung gagal. Cek struktur project kamu.");
        cleanupProject(data.projectName);
        return;
      }

      setReadyState((data.readyState as ReadyState) || "QUEUED");
      setStatus("building");
      setMessage("Build sedang berjalan di Vercel...");
      addLog("Menunggu build di Vercel...");
      pollStatus(data.id, data.projectName);
    } catch (err: any) {
      addLog(err?.message || "Terjadi kesalahan.", "error");
      setStatus("error");
      setMessage(err?.message || "Terjadi kesalahan.");
    }
  };

  // Ambil limit deploy Vercel secara live begitu halaman dibuka
  useEffect(() => {
    fetch("/api/limits", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.rateLimit) setRateLimit(d.rateLimit);
      })
      .catch(() => {
        // gapapa kalau gagal, badge limit cuma gak muncul
      });
  }, []);

  // 1. Autoscroll log box ke baris terbaru setiap kali ada log baru
  useEffect(() => {
    const el = logsScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  // 2. Begitu tombol deploy dipencet & build mulai jalan, langsung turun ke area log
  useEffect(() => {
    if (status === "uploading" || status === "building") {
      logsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [status]);

  // 5. Begitu build selesai (ready/error), scroll balik ke atas biar hasil/status kelihatan
  useEffect(() => {
    if (status === "ready" || status === "error") {
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [status]);

  // 7. Kalau live tanpa error, bersihkan log otomatis setelah 5 detik.
  // Kalau ada error, log dibiarkan supaya bisa dicek/di-copy.
  useEffect(() => {
    if (clearLogsTimeoutRef.current) {
      clearTimeout(clearLogsTimeoutRef.current);
      clearLogsTimeoutRef.current = null;
    }
    const hasErrorLog = logs.some((l) => l.kind === "error");
    if (status === "ready" && !hasErrorLog) {
      clearLogsTimeoutRef.current = setTimeout(() => {
        setLogs([]);
      }, 5000);
    }
    return () => {
      if (clearLogsTimeoutRef.current) clearTimeout(clearLogsTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.name.endsWith(".zip")) setFile(f);
    else setMessage("File harus format .zip");
  };

  const progress = status === "idle" ? 0 : PROGRESS_MAP[readyState] ?? 8;
  const isRunning = status === "uploading" || status === "building";
  const currentStageIndex = STAGES.findIndex((s) => s.key === readyState);

  const rateLimitRatio =
    rateLimit && rateLimit.limit ? (rateLimit.remaining ?? 0) / rateLimit.limit : null;
  const rateLimitColor =
    rateLimitRatio === null
      ? "text-white"
      : rateLimitRatio <= 0
      ? "text-error"
      : rateLimitRatio <= 0.2
      ? "text-warning"
      : "text-white";

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-16">
      <div ref={topRef} className="w-full max-w-lg">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <LogoMark className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-semibold text-white leading-none">DeployKu</h1>
            <p className="text-[11px] text-muted mt-0.5">Zip in, URL out — no GitHub needed</p>
          </div>
        </div>

        {rateLimit && rateLimit.limit != null && rateLimit.remaining != null && (
          <div className="mb-4 rounded-lg border border-border bg-surface-2/60 px-3 py-2 flex items-center justify-between text-[11px]">
            <span className="text-muted">
              Deploy quota:{" "}
              <span className={`font-semibold ${rateLimitColor}`}>
                {rateLimit.remaining}/{rateLimit.limit}
              </span>
            </span>
            {rateLimit.reset != null && (
              <span className="text-muted">reset {formatResetIn(rateLimit.reset)}</span>
            )}
          </div>
        )}

        <div className="card rounded-2xl p-6 shadow-glow">
          <div className="mb-4">
            <label className="block text-xs font-medium text-muted mb-1.5">Project name</label>
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="my-portfolio"
              disabled={isRunning}
              className="w-full rounded-lg bg-surface-2 border border-border px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40 placeholder:text-muted/60 disabled:opacity-50 transition-colors"
            />
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!isRunning) setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => !isRunning && onDrop(e)}
            onClick={() => !isRunning && inputRef.current?.click()}
            className={`rounded-xl border border-dashed px-6 py-9 text-center transition flex flex-col items-center gap-2.5 ${
              isRunning ? "cursor-not-allowed opacity-50" : "cursor-pointer"
            } ${dragOver ? "border-blue-500 bg-blue-500/5" : "border-border hover:border-blue-500/40"}`}
          >
            <div className="w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center text-blue-400">
              <UploadIcon className="w-4 h-4" />
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".zip"
              hidden
              disabled={isRunning}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            {file ? (
              <p className="text-sm font-medium text-white">{file.name}</p>
            ) : (
              <p className="text-sm text-muted">
                Drop .zip file here, or <span className="text-blue-400">click to browse</span>
              </p>
            )}
          </div>

          <button
            onClick={handleDeploy}
            disabled={isRunning}
            className="mt-5 w-full bg-blue-500 hover:bg-blue-400 text-white font-medium text-sm py-3 rounded-lg disabled:opacity-40 disabled:hover:bg-blue-500 transition-colors"
          >
            {status === "uploading" ? "Uploading..." : status === "building" ? "Building..." : "Deploy Now"}
          </button>

          {status !== "idle" && (
            <div className="mt-6">
              <div className="flex justify-between text-[11px] font-medium text-muted mb-2">
                {STAGES.map((s, i) => (
                  <span
                    key={s.label}
                    className={i <= currentStageIndex || status === "ready" ? "text-blue-400" : ""}
                  >
                    {s.label}
                  </span>
                ))}
              </div>
              <div className="relative h-1.5 bg-surface-2 rounded-full overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
                    status === "error" ? "bg-error" : status === "ready" ? "bg-success" : "bg-blue-500"
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {status === "ready" && deployUrl && (
            <div className="mt-5 rounded-xl bg-success/10 border border-success/25 px-4 py-3">
              <span className="pill text-success">
                <span className="pill-dot" />
                Live
              </span>
              {deployedProjectName && (
                <span className="ml-2 align-middle text-xs font-mono text-white/60">
                  {deployedProjectName}
                </span>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <a
                  href={deployUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-center text-xs font-medium text-white bg-success/20 border border-success/30 rounded-lg py-2 hover:bg-success/30 transition-colors"
                >
                  Buka Website
                </a>
                <button
                  onClick={() => copyToClipboard(deployUrl, setCopiedUrl)}
                  className="text-xs font-medium border border-border rounded-lg py-2 hover:bg-surface-2 transition-colors"
                >
                  {copiedUrl ? "Copied!" : "Copy Link"}
                </button>
              </div>
            </div>
          )}

          {status === "error" && message && (
            <div className="mt-5 rounded-xl bg-error/10 border border-error/25 px-4 py-3">
              <span className="pill text-error">
                <span className="pill-dot" />
                Error
              </span>
              <div className="mt-2.5 flex items-start gap-2">
                <p className="flex-1 text-xs text-white/90 break-words font-mono">{message}</p>
                <button
                  onClick={() => copyToClipboard(message, setCopiedError)}
                  className="shrink-0 text-[11px] font-medium border border-border rounded-md px-2.5 py-1 hover:bg-surface-2 transition-colors"
                >
                  {copiedError ? "Copied!" : "Copy Error"}
                </button>
              </div>
            </div>
          )}
        </div>

        {logs.length > 0 && (
          <div ref={logsSectionRef} className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-medium text-muted">Build logs</p>
              <button
                onClick={() =>
                  copyToClipboard(logs.map((l) => `[${l.time}] ${l.text}`).join("\n"), setCopiedLogs)
                }
                className="text-[11px] font-medium text-muted border border-border rounded-md px-2.5 py-1 hover:bg-surface-2 hover:text-white transition-colors"
              >
                {copiedLogs ? "Copied!" : "Copy all"}
              </button>
            </div>
            <div
              ref={logsScrollRef}
              className="terminal rounded-xl px-4 py-2 max-h-64 overflow-y-auto scrollbar-thin font-mono text-xs"
            >
              {logs.map((l, i) => (
                <div
                  key={i}
                  className={`terminal-line py-1.5 ${
                    l.kind === "error"
                      ? "text-error"
                      : l.kind === "success"
                      ? "text-success"
                      : l.kind === "build"
                      ? "text-muted"
                      : "text-white/80"
                  }`}
                >
                  <span className="text-white/25">[{l.time}]</span> {l.text}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
