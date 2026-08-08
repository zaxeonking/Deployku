import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hapus project di Vercel (dipakai saat sebuah deploy berakhir ERROR/CANCELED
// biar project gagal gak numpuk di dashboard).
export async function DELETE(
  req: NextRequest,
  { params }: { params: { name: string } }
) {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "VERCEL_TOKEN belum di-set." }, { status: 500 });
  }

  const teamId = process.env.VERCEL_TEAM_ID;
  const url = new URL(`https://api.vercel.com/v9/projects/${encodeURIComponent(params.name)}`);
  if (teamId) url.searchParams.set("teamId", teamId);

  const res = await fetch(url.toString(), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  // Vercel balikin 204 kalau berhasil. 404 juga dianggap "beres" (sudah gak ada).
  if (res.ok || res.status === 404) {
    return NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
  }

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(
    { error: data?.error?.message || `Gagal hapus project (HTTP ${res.status})` },
    { status: res.status, headers: { "Cache-Control": "no-store" } }
  );
}
