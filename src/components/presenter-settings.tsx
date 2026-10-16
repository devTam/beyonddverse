import Image from "next/image";
import { ActionForm, SubmitButton } from "./action-form";
import { approvePresenterProfile, generatePresenter, generatePresenterPortrait, savePresenterProfile, updateAssetApproval } from "@/app/actions";
import { prisma } from "@/lib/prisma";
import { estimatedDurationMs } from "@/lib/content/lesson";
import { ACTIVE_PRESENTER_KEY, PRESENTER_PREVIEW_TEXT } from "@/lib/presenter-schema";
import { getProductionSettings } from "@/lib/settings";

export async function PresenterSettings() {
  const [profiles, portraits, previews, projects, active, settings] = await Promise.all([
    prisma.presenterProfile.findMany({ orderBy: { revision: "desc" }, take: 10 }),
    prisma.asset.findMany({ where: { kind: "IMAGE", status: { not: "REJECTED" } }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.avatarGeneration.findMany({ where: { sceneId: null }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.chapterProject.findMany({ orderBy: { updatedAt: "desc" }, take: 30 }),
    prisma.workspaceSetting.findUnique({ where: { key: ACTIVE_PRESENTER_KEY } }), getProductionSettings(),
  ]);
  const approved = portraits.filter((asset) => asset.status === "APPROVED");
  const projectSelect = <label>Production project for costs<select name="projectId" required>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>;
  return <section className="panel presenter-settings"><p className="eyebrow">Consistent AI host</p><h2>Your presenter</h2>
    <p>Create one fictional presenter, review their portrait and speaking preview, then use that identity and voice across lessons. Changes create a new profile version.</p>
    <details><summary>Create a fictional portrait</summary><ActionForm action={generatePresenterPortrait} className="settings-form">{projectSelect}<label>Presenter appearance<textarea name="prompt" required minLength={20} placeholder="Describe the fictional presenter’s age, appearance, clothing, and studio setting."/></label><SubmitButton className="button button-secondary" disabled={!projects.length}>Generate portrait</SubmitButton></ActionForm><p>Generated portraits appear in the media library for approval. You can also upload a commissioned fictional portrait.</p></details>
    {portraits.some((asset) => asset.status !== "APPROVED") ? <details><summary>Review recent portrait candidates</summary><div className="thumbnail-grid">{portraits.filter((asset) => asset.status !== "APPROVED").slice(0, 6).map((asset) => <article key={asset.id}><Image src={`/api/assets/${asset.id}`} alt="Portrait candidate for review" width={480} height={270} unoptimized/><ActionForm action={updateAssetApproval}><input type="hidden" name="assetId" value={asset.id}/><SubmitButton name="status" value="APPROVED" className="button button-secondary">Approve image</SubmitButton><SubmitButton name="status" value="REJECTED" className="button button-ghost">Reject image</SubmitButton></ActionForm></article>)}</div></details> : null}
    <ActionForm action={savePresenterProfile} className="settings-form"><label>Presenter name<input name="name" required minLength={2}/></label><label>Approved portrait<select name="portraitAssetId" required><option value="">Choose a portrait</option>{approved.map((asset) => <option key={asset.id} value={asset.id}>{asset.storageKey}</option>)}</select></label><label>Existing HeyGen Photo Avatar Look ID (optional)<input name="providerAvatarId" placeholder="Leave empty to register this portrait"/></label><label>Narrator voice<input name="voiceId" defaultValue={settings.narratorVoice} required/></label><label>Delivery and appearance direction<textarea name="appearance" defaultValue="Warm, thoughtful educational presenter. Natural eye contact and restrained gestures. Preserve the reference outfit and studio appearance." required minLength={10}/></label><p>The profile saves the current speech model, speed, and pronunciations. The preview uses this exact voice configuration.</p><SubmitButton className="button button-primary" disabled={!approved.length}>Save new presenter version</SubmitButton></ActionForm>
    <div className="presenter-profile-list">{profiles.map((profile) => {
      const previewSeconds = estimatedDurationMs(PRESENTER_PREVIEW_TEXT) / profile.speechSpeed / 1000;
      const preview = previews.find((job) => job.profileId === profile.id);
      return <article key={profile.id} className="presenter-profile"><Image src={`/api/assets/${profile.portraitAssetId}`} alt={`${profile.name} portrait`} width={320} height={180} unoptimized/><h3>{profile.name} · v{profile.revision}{active?.value === profile.id ? " · Active" : ""}</h3><p>{profile.voiceId} · {profile.status.toLowerCase()}</p>
        {preview?.assetId ? <video controls preload="metadata" src={`/api/assets/${preview.assetId}`}/> : null}
        {preview?.error ? <p role="status">{preview.error}</p> : null}
        <ActionForm action={generatePresenter} className="settings-form"><input type="hidden" name="profileId" value={profile.id}/>{projectSelect}<p>Speaking preview: approximately {Math.ceil(previewSeconds)} seconds (${(previewSeconds / 60 * settings.avatarRatePerMinute).toFixed(2)} avatar estimate, plus speech{!profile.providerAvatarId ? ` and one-time avatar registration ($${Number(process.env.HEYGEN_AVATAR_CREATION_COST_USD ?? 1.32).toFixed(2)})` : ""}). Requires funded HeyGen API credits.</p><SubmitButton className="button button-secondary" disabled={!projects.length}>Generate / resume preview</SubmitButton></ActionForm>
        {preview?.status === "SUCCEEDED" && (profile.status !== "APPROVED" || active?.value !== profile.id) ? <ActionForm action={approvePresenterProfile}><input type="hidden" name="profileId" value={profile.id}/><SubmitButton className="button button-primary">{profile.status === "APPROVED" ? "Use this approved presenter" : "Approve face and voice · use presenter"}</SubmitButton></ActionForm> : null}
      </article>;
    })}</div>
  </section>;
}
