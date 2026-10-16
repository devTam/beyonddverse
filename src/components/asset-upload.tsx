"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";

type Sign = { cloudName: string; apiKey: string; timestamp: number; signature: string; folder: string; public_id: string; type: string; resourceType: string };
export function AssetUpload() {
  const router = useRouter(); const [message, setMessage] = useState("");
  async function submit(form: FormData) {
    const file = form.get("file") as File; const kind = String(form.get("kind")); const license = String(form.get("license") ?? ""); setMessage("Preparing upload…");
    const signedResponse = await fetch("/api/assets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "sign", kind, filename: file.name, mimeType: file.type }) });
    if (!signedResponse.ok) throw new Error(await signedResponse.text()); const signed = await signedResponse.json() as Sign;
    const upload = new FormData(); upload.set("file", file); upload.set("api_key", signed.apiKey); upload.set("timestamp", String(signed.timestamp)); upload.set("signature", signed.signature); upload.set("folder", signed.folder); upload.set("public_id", signed.public_id); upload.set("type", signed.type);
    const cloud = await fetch(`https://api.cloudinary.com/v1_1/${signed.cloudName}/${signed.resourceType}/upload`, { method: "POST", body: upload }); if (!cloud.ok) throw new Error(await cloud.text());
    const registered = await fetch("/api/assets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "register", kind, filename: file.name, mimeType: file.type, license: license || undefined, upload: await cloud.json() }) }); if (!registered.ok) throw new Error(await registered.text());
    setMessage("Uploaded for review."); router.refresh();
  }
  return <ActionForm action={submit} className="asset-upload"><label>Asset type<select name="kind"><option value="IMAGE">Image</option><option value="MUSIC">Music</option><option value="VIDEO">Video clip</option></select></label><label>File<input name="file" type="file" accept="image/*,audio/*,video/*" required/></label><label>License / source<input name="license" placeholder="Owned, commissioned, or license URL"/></label><SubmitButton className="button button-primary" pendingLabel="Uploading…">Upload to Cloudinary</SubmitButton>{message ? <p>{message}</p> : null}</ActionForm>;
}
