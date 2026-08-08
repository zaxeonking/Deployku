import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";

export const runtime = "nodejs";
export const maxDuration = 60;

// File/folder yang tidak perlu ikut di-deploy
const IGNORE_PATTERNS = [
  /^\.git\//,
  /^node_modules\//,
  /^\.next\//,
  /^\.vercel\//,
  /^\.DS_Store$/,
  /\.DS_Store$/,
];

function shouldIgnore(path: string) {
  return IGNORE_PATTERNS.some((re) => re.test(path));
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || `project-${Date.now()}`;
}

export async function POST(req: NextRequest) {
  try {
    const token = process.env.VERCEL_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "VERCEL_TOKEN belum di-set di environment variables server." },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const projectNameRaw = (formData.get("projectName") as string) || "";

    if (!file) {
      return NextResponse.json({ error: "File zip tidak ditemukan." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    const files: { file: string; data: string; encoding: "base64" }[] = [];
    let totalSize = 0;
    const MAX_TOTAL_SIZE = 45 * 1024 * 1024; // ~45MB, batas aman inline deploy

    const entries = Object.values(zip.files);

    // Deteksi apakah semua file berada dalam satu folder root (umum saat zip dari "compress folder")
    const topLevelDirs = new Set<string>();
    for (const entry of entries) {
      if (entry.dir) continue;
      if (shouldIgnore(entry.name)) continue;
      const parts = entry.name.split("/");
      if (parts.length > 1) topLevelDirs.add(parts[0]);
      else topLevelDirs.add("");
    }
    const stripPrefix =
      topLevelDirs.size === 1 && !topLevelDirs.has("") ? [...topLevelDirs][0] + "/" : "";

    for (const entry of entries) {
      if (entry.dir) continue;
      if (shouldIgnore(entry.name)) continue;

      let relativePath = entry.name;
      if (stripPrefix && relativePath.startsWith(stripPrefix)) {
        relativePath = relativePath.slice(stripPrefix.length);
      }
      if (!relativePath) continue;

      const content = await entry.async("nodebuffer");
      totalSize += content.length;
      if (totalSize > MAX_TOTAL_SIZE) {
        return NextResponse.json(
          { error: "Ukuran project terlalu besar untuk inline deploy (maks ~45MB)." },
          { status: 413 }
        );
      }

      files.push({
        file: relativePath,
        data: content.toString("base64"),
        encoding: "base64",
      });
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "Zip kosong atau semua file ter-filter." }, { status: 400 });
    }

    const projectName = slugify(projectNameRaw || `deploy-${Date.now()}`);

    const teamId = process.env.VERCEL_TEAM_ID;
    const url = new URL("https://api.vercel.com/v13/deployments");
    if (teamId) url.searchParams.set("teamId", teamId);

    const vercelRes = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: projectName,
        project: projectName,
        target: "production",
        files,
      }),
    });

    const data = await vercelRes.json();

    if (!vercelRes.ok) {
      return NextResponse.json(
        { error: data?.error?.message || "Gagal deploy ke Vercel.", detail: data },
        { status: vercelRes.status }
      );
    }

    return NextResponse.json({
      id: data.id,
      url: `https://${data.url}`,
      readyState: data.readyState,
      projectName,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Terjadi kesalahan tak terduga." },
      { status: 500 }
    );
  }
}
