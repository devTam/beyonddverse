import { ImageIcon, Music2, Video } from "lucide-react";
import Image from "next/image";
import { updateAssetApproval } from "@/app/actions";
import { StatusPill } from "@/components/status-pill";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export default async function AssetsPage() {
  const assets = await prisma.asset.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return <div className="page"><header className="topbar"><div><p className="eyebrow">Cloudinary library</p><h1>Media assets</h1><p>Review generated and uploaded assets before they enter a final render.</p></div></header><section className="asset-grid">{assets.map((asset) => <article className="panel asset-card" key={asset.id}>
    <a href={`/api/assets/${asset.id}`} target="_blank" rel="noreferrer" className="asset-preview">{asset.mimeType.startsWith("image/") ? <Image src={`/api/assets/${asset.id}`} alt={`${asset.kind} asset`} width={600} height={338} unoptimized /> : asset.mimeType.startsWith("video/") ? <Video/> : asset.mimeType.startsWith("audio/") ? <Music2/> : <ImageIcon/>}</a>
    <div className="panel-heading"><div><strong>{asset.kind.replaceAll("_", " ")}</strong><small>{asset.mimeType} · {(Number(asset.bytes) / 1024 / 1024).toFixed(1)} MB</small></div><StatusPill status={asset.status}/></div>
    <form action={updateAssetApproval} className="action-row"><input type="hidden" name="assetId" value={asset.id}/><button name="status" value="APPROVED" className="button button-primary">Approve</button><button name="status" value="REJECTED" className="button button-ghost">Reject</button></form>
  </article>)}</section></div>;
}
