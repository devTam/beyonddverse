import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { VideoInput } from "./types";

const colors = { ink: "#16231c", green: "#173d2c", gold: "#d6a04d", paper: "#f4f3ec" };

function captions(text: string, relativeFrame: number, duration: number, timings?: VideoInput["scenes"][number]["timings"]) {
  if (timings?.length) {
    const elapsedMs = relativeFrame / 30 * 1000;
    const active = Math.max(0, timings.findIndex((timing) => timing.endMs >= elapsedMs));
    const groupStart = Math.floor(active / 6) * 6;
    return timings.slice(groupStart, groupStart + 6).map((timing) => timing.word).join(" ");
  }
  const words = text.split(/\s+/).filter(Boolean);
  const groupSize = 6;
  const group = Math.min(Math.floor((relativeFrame / Math.max(duration, 1)) * Math.ceil(words.length / groupSize)), Math.max(0, Math.ceil(words.length / groupSize) - 1));
  return words.slice(group * groupSize, (group + 1) * groupSize).join(" ");
}

function Scene({ scene, vertical, accentColor, bodyFont }: { scene: VideoInput["scenes"][number]; vertical: boolean; accentColor: string; bodyFont: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 18 } });
  const opacity = interpolate(frame, [0, 10, scene.durationInFrames - 10, scene.durationInFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ backgroundColor: colors.ink, opacity }}>
    <Img src={scene.visualUrl} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${1.06 - frame / Math.max(scene.durationInFrames, 1) * .04})` }}/>
    <AbsoluteFill style={{ background: vertical ? "linear-gradient(180deg,rgba(10,20,14,.15),rgba(10,20,14,.82))" : "linear-gradient(90deg,rgba(10,20,14,.72),rgba(10,20,14,.12) 65%,rgba(10,20,14,.5))" }}/>
    {scene.scriptureRef ? <div style={{ position: "absolute", top: vertical ? 120 : 70, left: vertical ? 70 : 90, padding: "12px 20px", borderLeft: `5px solid ${accentColor}`, background: "rgba(17,35,25,.78)", color: colors.paper, fontSize: vertical ? 34 : 27, fontFamily: bodyFont, transform: `translateY(${(1 - enter) * -18}px)` }}>{scene.scriptureRef}</div> : null}
    <div style={{ position: "absolute", left: vertical ? 70 : 110, right: vertical ? 70 : 110, bottom: vertical ? 230 : 80, color: "white", fontSize: vertical ? 52 : 43, lineHeight: 1.22, fontWeight: 750, textAlign: vertical ? "center" : "left", textShadow: "0 3px 18px rgba(0,0,0,.8)", transform: `translateY(${(1 - enter) * 25}px)` }}>{captions(scene.narration, frame, scene.durationInFrames, scene.timings)}</div>
    <Audio src={scene.narrationUrl}/>
  </AbsoluteFill>;
}

export function TeachingVideo({ title, hook, brandName, brandAssetUrl, headingFont, bodyFont, primaryColor, accentColor, backgroundMusicUrl, scenes }: VideoInput & { vertical?: boolean }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  const timedScenes = scenes.reduce<Array<{ scene: VideoInput["scenes"][number]; from: number }>>((items, scene) => {
    const previous = items.at(-1);
    const from = previous ? previous.from + previous.scene.durationInFrames : 0;
    return [...items, { scene, from }];
  }, []);
  return <AbsoluteFill style={{ backgroundColor: primaryColor, fontFamily: bodyFont }}>
    {backgroundMusicUrl ? <Audio src={backgroundMusicUrl} loop volume={(currentFrame) => currentFrame < 90 ? 0.035 : 0.055}/> : null}
    {timedScenes.map(({ scene, from }) => <Sequence key={scene.id} from={from} durationInFrames={scene.durationInFrames}><Scene scene={scene} vertical={vertical} accentColor={accentColor} bodyFont={bodyFont}/></Sequence>)}
    <div style={{ position: "absolute", top: vertical ? 55 : 35, right: vertical ? 55 : 60, display: "flex", alignItems: "center", gap: 14, color: colors.paper, fontSize: vertical ? 26 : 20, letterSpacing: 3, textTransform: "uppercase" }}>{brandAssetUrl ? <Img src={brandAssetUrl} style={{ width: vertical ? 52 : 40, height: vertical ? 52 : 40, objectFit: "contain" }}/> : null}{brandName}</div>
    {frame < 90 ? <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: vertical ? 80 : 160, background: `linear-gradient(135deg,${primaryColor}f2,${primaryColor}e8)`, color: "white", textAlign: "center" }}><div style={{ color: accentColor, fontSize: vertical ? 25 : 20, letterSpacing: 5, textTransform: "uppercase" }}>{hook}</div><h1 style={{ fontFamily: headingFont, fontSize: vertical ? 78 : 75, lineHeight: 1.04, margin: "30px 0" }}>{title}</h1></AbsoluteFill> : null}
  </AbsoluteFill>;
}
