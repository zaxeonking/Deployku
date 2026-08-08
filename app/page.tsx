"use client";

import { useCallback, useRef, useState } from "react";

type Status = "idle" | "uploading" | "building" | "ready" | "error";

export default function Home() {
  const [projectName, setProjectName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [deployUrl, setDeployUrl] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pollStatus = useCallback(async (id: string) => {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const res = await fetch(`/api/status/${id}`);
        const data = await res.json();
        if (!res.ok) continue;
        if (data.readyState === "READY") {
          setStatus("ready");
          setDeployUrl(data.url);
          return;
        }
        if (data.readyState === "ERROR") {
          setStatus("error");
          setMessage("Build gagal di Vercel. Cek struktur project kamu.");
          return;
        }
      } catch {
        // lanjut polling
      }
    }
    setStatus("error");
    setMessage("Timeout menunggu build selesai. Coba cek dashboard Vercel kamu.");
  }, []);

  const handleDeploy = async () => {
    if (!file) {
      setMessage("Pilih file .zip dulu.");
      return;
    }
    setStatus("uploading");
    setMessage("");
    setDeployUrl("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("projectName", projectName);

    try {
      const res = await fetch("/api/deploy", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error || "Gagal deploy.");
        return;
      }
      setStatus("building");
      setMessage("Build sedang berjalan di Vercel...");
      pollStatus(data.id);
    } catch (err: any) {
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

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg">
        <h1 className="text-3xl font-bold mb-2">DeployKu</h1>
        <p className="text-neutral-400 mb-8">
          Upload file .zip project kamu, langsung online. Tanpa akun GitHub.
        </p>

        <div className="mb-4">
          <label className="block text-sm text-neutral-400 mb-1">Nama project (opsional)</label>
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="misal: portofolio-saya"
            className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-4 py-2 outline-none focus:border-neutral-400"
          />
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-12 text-center transition ${
            dragOver ? "border-white bg-neutral-900" : "border-neutral-700"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".zip"
            hidden
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          {file ? (
            <p className="text-white">{file.name}</p>
          ) : (
            <p className="text-neutral-400">
              Tarik file .zip ke sini, atau klik untuk pilih
            </p>
          )}
        </div>

        <button
          onClick={handleDeploy}
          disabled={status === "uploading" || status === "building"}
          className="mt-6 w-full rounded-lg bg-white text-black font-semibold py-3 disabled:opacity-50"
        >
          {status === "uploading"
            ? "Mengunggah..."
            : status === "building"
            ? "Sedang build..."
            : "Deploy Sekarang"}
        </button>

        {message && (
          <p className={`mt-4 text-sm ${status === "error" ? "text-red-400" : "text-neutral-400"}`}>
            {message}
          </p>
        )}

        {status === "ready" && deployUrl && (
          <div className="mt-6 rounded-lg bg-green-950 border border-green-800 px-4 py-3">
            <p className="text-green-400 text-sm mb-1">Berhasil live!</p>
            <a
              href={deployUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-300 underline break-all"
            >
              {deployUrl}
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
