import { useEffect, useMemo, useState } from "react";
import { AbsoluteFill, Audio, Img, Loop, OffthreadVideo, Sequence, continueRender, delayRender, useCurrentFrame, useVideoConfig } from "remotion";
import { activeCaption, captionCues, type WordTiming } from "./captions";
import type { VideoInput } from "./types";

const paper = "#f4f3ec";

function Scene({ scene, vertical, bodyFont, accentColor }: { scene: VideoInput["scenes"][number]; vertical: boolean; bodyFont: string; accentColor: string }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const fontSize = vertical ? 44 : 36;
  const captionWidth = vertical ? 820 : 1440;
  const [fontReady, setFontReady] = useState(false);
  const [handle] = useState(() => delayRender("Loading caption font"));
  useEffect(() => {
    let cancelled = false;
    document.fonts.load(`600 ${fontSize}px "${bodyFont}"`).then(() => {
      if (!cancelled) { setFontReady(true); continueRender(handle); }
    }).catch(() => { if (!cancelled) { setFontReady(true); continueRender(handle); } });
    return () => { cancelled = true; };
  }, [bodyFont, fontSize, handle]);
  const cues = useMemo(() => {
    if (!fontReady) return [];
    const context = document.createElement("canvas").getContext("2d");
    if (!context) throw new Error("Caption text measurement is unavailable.");
    context.font = `600 ${fontSize}px "${bodyFont}", sans-serif`;
    const words = scene.narration.trim().split(/\s+/);
    const timings: WordTiming[] = scene.timings?.length ? scene.timings : words.map((word, index) => ({ word, startMs: index / words.length * scene.durationInFrames / fps * 1000, endMs: (index + 1) / words.length * scene.durationInFrames / fps * 1000 }));
    return captionCues(timings, captionWidth - 48, (text) => context.measureText(text).width);
  }, [fontReady, fontSize, bodyFont, scene, fps, captionWidth]);
  const elapsedMs = frame / fps * 1000;
  const cue = activeCaption(cues, elapsedMs);
  const card = scene.scriptureCards?.find((item) => elapsedMs >= item.startMs && elapsedMs < item.endMs);
  const isPresenter = scene.presentation === "presenter" && scene.presenterVideoUrl;
  const mediaStyle = { width: "100%", height: "100%", objectFit: "cover" as const, objectPosition: "center 35%" };
  const cardWidth = vertical ? 800 : 680;
  return <AbsoluteFill style={{ backgroundColor: "#16231c" }}>
    {isPresenter ? <OffthreadVideo src={scene.presenterVideoUrl!} muted style={mediaStyle}/> : scene.visualUrl ? scene.visualMediaType === "video" ? <Loop durationInFrames={scene.visualDurationInFrames ?? scene.durationInFrames}><OffthreadVideo src={scene.visualUrl} muted style={mediaStyle}/></Loop> : <Img src={scene.visualUrl} style={{ ...mediaStyle, transform: `scale(${1.04 + frame / scene.durationInFrames * .025})` }}/> : null}
    <AbsoluteFill style={{ background: "linear-gradient(180deg,rgba(10,20,14,.05) 60%,rgba(10,20,14,.62))" }}/>
    {card ? <div style={{ position: "absolute", top: vertical ? 170 : 125, left: vertical ? (width - cardWidth) / 2 : 70, width: cardWidth, boxSizing: "border-box", padding: 24, borderLeft: `4px solid ${accentColor}`, background: "rgba(17,35,25,.92)", borderRadius: 8, color: paper, fontFamily: bodyFont, fontSize: vertical ? 32 : 30, lineHeight: 1.35 }}><div style={{ fontSize: 22, color: accentColor, marginBottom: 12 }}>{card.reference} · {card.translation}</div>{card.text}</div> : null}
    {cue ? <div style={{ position: "absolute", left: (width - captionWidth) / 2, width: captionWidth, bottom: vertical ? 260 : 62, maxHeight: height * .15, boxSizing: "border-box", padding: "12px 24px", backgroundColor: "rgba(0,0,0,.72)", borderRadius: 10, color: "white", fontFamily: `"${bodyFont}", sans-serif`, fontSize, lineHeight: 1.25, fontWeight: 600, textAlign: "center", whiteSpace: "pre", overflow: "hidden" }}>{cue.lines.join("\n")}</div> : null}
    <Audio src={scene.narrationUrl}/>
  </AbsoluteFill>;
}

export function TeachingVideo({ title, brandName, brandAssetUrl, headingFont, bodyFont, primaryColor, accentColor, backgroundMusicUrl, scenes }: VideoInput & { vertical?: boolean }) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const vertical = height > width;
  const timedScenes = scenes.map((scene, index) => ({ scene, from: scenes.slice(0, index).reduce((sum, previous) => sum + previous.durationInFrames, 0) }));
  return <AbsoluteFill style={{ backgroundColor: primaryColor, fontFamily: bodyFont }}>
    {backgroundMusicUrl ? <Audio src={backgroundMusicUrl} loop volume={0.04}/> : null}
    {timedScenes.map(({ scene, from }) => <Sequence key={scene.id} from={from} durationInFrames={scene.durationInFrames}><Scene scene={scene} vertical={vertical} accentColor={accentColor} bodyFont={bodyFont}/></Sequence>)}
    <div style={{ position: "absolute", top: vertical ? 55 : 35, right: vertical ? 90 : 60, display: "flex", alignItems: "center", gap: 14, color: paper, fontSize: vertical ? 24 : 20, letterSpacing: 2, textTransform: "uppercase" }}>{brandAssetUrl ? <Img src={brandAssetUrl} style={{ width: 40, height: 40, objectFit: "contain" }}/> : null}{brandName}<span style={{ fontSize: 16, opacity: .8 }}>AI presenter</span></div>
    {frame < fps * 4 ? <div style={{ position: "absolute", left: vertical ? 90 : 70, right: vertical ? 150 : undefined, bottom: vertical ? 430 : 210, maxWidth: vertical ? 800 : 1100, padding: "16px 24px", background: "rgba(17,35,25,.85)", borderLeft: `4px solid ${accentColor}`, color: paper, fontFamily: headingFont, fontSize: vertical ? 38 : 34, lineHeight: 1.2 }}>{title}</div> : null}
  </AbsoluteFill>;
}
