import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "VERCEL_TOKEN belum di-set." }, { status: 500 });
  }

  const teamId = process.env.VERCEL_TEAM_ID;
  const url = new URL(`https://api.vercel.com/v2/deployments/${params.id}/events`);
  url.searchParams.set("builds", "1");
  if (teamId) url.searchParams.set("teamId", teamId);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: data?.error?.message || `Gagal ambil log (HTTP ${res.status})` },
      { status: res.status }
    );
  }

  const events = await res.json();

  const lines: { text: string; ts: number }[] = [];
  for (const ev of Array.isArray(events) ? events : []) {
    if (ev.type === "stdout" || ev.type === "stderr" || ev.type === "command") {
      // Vercel events API sudah mengirim payload.text dalam bentuk plain UTF-8,
      // BUKAN base64. Men-decode-nya sebagai base64 (kode sebelumnya) merusak
      // teks jadi karakter acak. Jadi di sini kita pakai apa adanya.
      const text = (ev.payload?.text || "").trim();
      if (text) lines.push({ text, ts: ev.created || Date.now() });
    }
  }

  return NextResponse.json({ lines }, { headers: { "Cache-Control": "no-store" } });
}
