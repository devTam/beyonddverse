import { Composition } from "remotion";
import { TeachingVideo } from "./composition";
import { VideoInputSchema, type VideoInput } from "./types";

const defaults: VideoInput = { title: "Beyond the Verse", hook: "Chapter by chapter", brandName: "Beyond the Verse", fps: 30, scenes: [{ id: "preview", narration: "Preview narration", narrationUrl: "https://example.com/audio.mp3", visualUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee", scriptureRef: null, durationInFrames: 150 }] };
const duration = ({ props }: { props: VideoInput }) => ({ durationInFrames: props.scenes.reduce((total, scene) => total + scene.durationInFrames, 0), props });

export function VideoRoot() {
  return <>
    <Composition id="YouTubeLong" component={TeachingVideo} width={1920} height={1080} fps={30} durationInFrames={150} defaultProps={defaults} schema={VideoInputSchema} calculateMetadata={duration}/>
    <Composition id="YouTubeShort" component={TeachingVideo} width={1080} height={1920} fps={30} durationInFrames={150} defaultProps={defaults} schema={VideoInputSchema} calculateMetadata={duration}/>
    <Composition id="TikTok" component={TeachingVideo} width={1080} height={1920} fps={30} durationInFrames={150} defaultProps={defaults} schema={VideoInputSchema} calculateMetadata={duration}/>
    <Composition id="InstagramReel" component={TeachingVideo} width={1080} height={1920} fps={30} durationInFrames={150} defaultProps={defaults} schema={VideoInputSchema} calculateMetadata={duration}/>
    <Composition id="FacebookReel" component={TeachingVideo} width={1080} height={1920} fps={30} durationInFrames={150} defaultProps={defaults} schema={VideoInputSchema} calculateMetadata={duration}/>
  </>;
}
