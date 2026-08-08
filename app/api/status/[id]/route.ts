import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "VERCEL_TOKEN belum di-set." }, { status: 500 });
  }

  const teamId = process.env.VERCEL_TEAM_ID;
  const url = new URL(`https://api.vercel.com/v13/deployments/${params.id}`);
  if (teamId) url.searchParams.set("teamId", teamId);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();

  if (!res.ok) {
    return NextResponse.json(
      { error: data?.error?.message || `Gagal cek status (HTTP ${res.status})`, detail: data },
      { status: res.status }
    );
  }

  return NextResponse.json({
    readyState: data.readyState,
    url: `https://${data.url}`,
  });
}
