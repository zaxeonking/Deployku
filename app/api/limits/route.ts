import { NextRequest, NextResponse } from "next/server";
import { parseRateLimit } from "../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

// Endpoint ringan buat ambil quota/rate-limit deploy Vercel secara live,
// dipanggil pas halaman pertama kali dibuka (sebelum sempat deploy apa-apa).
export async function GET(req: NextRequest) {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "VERCEL_TOKEN belum di-set." }, { status: 500 });
  }

  const teamId = process.env.VERCEL_TEAM_ID;
  const url = new URL("https://api.vercel.com/v6/deployments");
  url.searchParams.set("limit", "1");
  if (teamId) url.searchParams.set("teamId", teamId);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const rateLimit = parseRateLimit(res.headers);

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: data?.error?.message || `Gagal ambil limit (HTTP ${res.status})`, rateLimit },
      { status: res.status, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json({ rateLimit }, { headers: { "Cache-Control": "no-store" } });
}
