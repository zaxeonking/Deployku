"use client";

import { useCallback, useRef, useState } from "react";

type Status = "idle" | "uploading" | "building" | "ready" | "error";
type ReadyState = "QUEUED" | "INITIALIZING" | "BUILDING" | "READY" | "ERROR" | "CANCELED" | "";

type LogLine = {
  time: string;
  text: string;
  kind: "info" | "build" | "error" | "success";
};

const STAGES: { key: ReadyState; label: string }[] = [
  { key: "", label: "Diterima" },
  { key: "QUEUED", label: "Antre" },
  { key: "INITIALIZING", label: "Disiapkan" },
  { key: "BUILDING", label: "Diproses" },
  { key: "READY", label: "Terkirim" },
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

function BoxIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M3 7.5 12 3l9 4.5-9 4.5-9-4.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M3 7.5v9L12 21l9-4.5v-9" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 12v9" stroke="currentColor" strokeWidth="1.5" />
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
  const inputRef = useRef<HTMLInputElement>(null);
  const seenLogTimestamps = useRef<Set<number>>(new Set());

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
      const res = await fetch(`/api/logs/${id}`);
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

  const pollStatus = useCallback(
    async (id: string) => {
      let lastError = "";
      let lastReadyState = "";
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        fetchBuildLogs(id);
        try {
          const res = await fetch(`/api/status/${id}`);
          const data = await res.json();
          if (!res.ok) {
            lastError = data?.error || `Gagal cek status (HTTP ${res.status})`;
            addLog(lastError, "error");
            continue;
          }

          if (data.readyState && data.readyState !== lastReadyState) {
            lastReadyState = data.readyState;
            setReadyState(data.readyState as ReadyState);
            addLog(`Status berubah: ${data.readyState}`, "info");
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
            return;
          }
        } catch (err: any) {
          lastError = err?.message || "Gagal menghubungi server saat cek status.";
          addLog(lastError, "error");
        }
      }
      const timeoutMsg = lastError
        ? `Timeout menunggu build. Error terakhir: ${lastError}`
        : "Timeout menunggu build selesai. Coba cek dashboard Vercel kamu.";
      setStatus("error");
      setMessage(timeoutMsg);
    },
    [addLog, fetchBuildLogs]
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
    seenLogTimestamps.current = new Set();

    addLog(`Mengunggah ${file.name} (${(file.size / 1024).toFixed(0)} KB)...`);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("projectName", projectName);

    try {
      const res = await fetch("/api/deploy", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        addLog(data.error || "Gagal deploy.", "error");
        setStatus("error");
        setMessage(data.error || "Gagal deploy.");
        return;
      }

      addLog(`Paket dibuat: ${data.projectName} (id: ${data.id})`);

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
        return;
      }

      setReadyState((data.readyState as ReadyState) || "QUEUED");
      setStatus("building");
      setMessage("Build sedang berjalan di Vercel...");
      addLog("Menunggu build di Vercel...");
      pollStatus(data.id);
    } catch (err: any) {
      addLog(err?.message || "Terjadi kesalahan.", "error");
      setStatus("error");
      setMessage(err?.message || "Terjadi kesalahan.");
    }
  };

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

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-2 mb-8 text-cream">
          <BoxIcon className="w-6 h-6" />
          <span className="font-mono text-xs tracking-[0.3em] uppercase text-muted">
            Paket Kode Menuju Situs Hidup
          </span>
        </div>

        <div className="label-card rounded-sm px-8 pt-10 pb-8 shadow-[8px_8px_0_0_rgba(0,0,0,0.35)]">
          <div className="tick-tl" />
          <div className="tick-br" />

          <h1 className="font-display text-3xl sm:text-4xl leading-none mb-1">DEPLOYKU</h1>
          <p className="font-mono text-xs text-ink-text/60 mb-8">
            NO GITHUB • NO GIT PUSH • ZIP IN, URL OUT
          </p>

          <div className="mb-5">
            <label className="block font-mono text-[11px] tracking-widest uppercase text-ink-text/60 mb-1">
              Nama Project
            </label>
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="portofolio-saya"
              disabled={isRunning}
              className="w-full bg-transparent border-b-2 border-paper-line px-1 py-2 outline-none focus:border-ink-text placeholder:text-ink-text/30 disabled:opacity-50 font-body"
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
            className={`rounded-sm border-2 border-dashed px-6 py-10 text-center transition flex flex-col items-center gap-2 ${
              isRunning ? "cursor-not-allowed opacity-50" : "cursor-pointer"
            } ${dragOver ? "border-ink-text bg-black/5" : "border-paper-line"}`}
          >
            <BoxIcon className="w-8 h-8 text-ink-text/50" />
            <input
              ref={inputRef}
              type="file"
              accept=".zip"
              hidden
              disabled={isRunning}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            {file ? (
              <p className="font-mono text-sm">{file.name}</p>
            ) : (
              <p className="text-ink-text/50 text-sm">
                Jatuhkan paket .zip di sini, atau klik untuk pilih
              </p>
            )}
          </div>

          <button
            onClick={handleDeploy}
            disabled={isRunning}
            className="mt-6 w-full bg-ink-text text-paper font-display text-sm tracking-wider py-3.5 rounded-sm disabled:opacity-40 hover:-translate-y-0.5 active:translate-y-0 transition-transform"
          >
            {status === "uploading"
              ? "MENGUNGGAH..."
              : status === "building"
              ? "SEDANG DIPROSES..."
              : "KIRIM SEKARANG"}
          </button>

          {status !== "idle" && (
            <div className="tear-line mt-8 pt-6">
              <div className="relative h-1.5 bg-paper-line/50 rounded-full mb-3 overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
                    status === "error" ? "bg-stamp-red" : status === "ready" ? "bg-stamp-green" : "bg-stamp-amber"
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between font-mono text-[10px] uppercase tracking-wide">
                {STAGES.map((s, i) => (
                  <span
                    key={s.label}
                    className={
                      i <= currentStageIndex || status === "ready"
                        ? "text-ink-text font-semibold"
                        : "text-ink-text/35"
                    }
                  >
                    {s.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {status === "ready" && deployUrl && (
            <div className="mt-6">
              <span className="stamp text-stamp-green">Terkirim</span>
              <div className="mt-3 flex items-center gap-2 font-mono text-sm bg-black/5 rounded-sm px-3 py-2">
                <a
                  href={deployUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline break-all flex-1"
                >
                  {deployUrl}
                </a>
                <button
                  onClick={() => copyToClipboard(deployUrl, setCopiedUrl)}
                  className="shrink-0 text-xs border border-ink-text/30 rounded-sm px-2 py-1 hover:bg-ink-text hover:text-paper transition-colors"
                >
                  {copiedUrl ? "Disalin!" : "Salin"}
                </button>
              </div>
            </div>
          )}

          {status === "error" && message && (
            <div className="mt-6">
              <span className="stamp text-stamp-red">Gagal</span>
              <div className="mt-3 flex items-start gap-2 font-mono text-xs bg-black/5 rounded-sm px-3 py-2">
                <p className="flex-1 break-words">{message}</p>
                <button
                  onClick={() => copyToClipboard(message, setCopiedError)}
                  className="shrink-0 text-xs border border-ink-text/30 rounded-sm px-2 py-1 hover:bg-ink-text hover:text-paper transition-colors"
                >
                  {copiedError ? "Disalin!" : "Salin Error"}
                </button>
              </div>
            </div>
          )}
        </div>

        {logs.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <p className="font-mono text-[11px] tracking-widest uppercase text-muted">
                Manifest Pengiriman
              </p>
              <button
                onClick={() =>
                  copyToClipboard(
                    logs.map((l) => `[${l.time}] ${l.text}`).join("\n"),
                    setCopiedLogs
                  )
                }
                className="text-[11px] font-mono border border-cream/20 text-cream/80 rounded-sm px-2 py-1 hover:bg-cream/10 transition-colors"
              >
                {copiedLogs ? "Disalin!" : "Salin Semua"}
              </button>
            </div>
            <div className="receipt rounded-sm px-4 py-3 max-h-64 overflow-y-auto font-mono text-xs">
              {logs.map((l, i) => (
                <div
                  key={i}
                  className={`receipt-line py-1.5 ${
                    l.kind === "error"
                      ? "text-stamp-red"
                      : l.kind === "success"
                      ? "text-stamp-green"
                      : l.kind === "build"
                      ? "text-muted"
                      : "text-cream/80"
                  }`}
                >
                  <span className="text-cream/30">[{l.time}]</span> {l.text}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
