"use client";

import { useRef, useState } from "react";
import { Mic, Square, Upload } from "lucide-react";
import { useRouter } from "next/navigation";

type SignedUpload = {
  timestamp: number;
  folder: string;
  public_id: string;
  type: "authenticated";
  signature: string;
  cloudName: string;
  apiKey: string;
  resourceType: "video";
};

export function AudioExplanation({ projectId }: { projectId: string }) {
  const router = useRouter();
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setMessage("Preparing secure upload…");
    try {
      const signResponse = await fetch("/api/uploads/audio", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "sign", projectId, filename: file.name, mimeType: file.type }),
      });
      if (!signResponse.ok) throw new Error("Could not authorize the upload.");
      const signed = (await signResponse.json()) as SignedUpload;
      const form = new FormData();
      form.set("file", file);
      form.set("api_key", signed.apiKey);
      form.set("timestamp", String(signed.timestamp));
      form.set("signature", signed.signature);
      form.set("folder", signed.folder);
      form.set("public_id", signed.public_id);
      form.set("type", signed.type);
      setMessage("Uploading source audio…");
      const cloudResponse = await fetch(`https://api.cloudinary.com/v1_1/${signed.cloudName}/${signed.resourceType}/upload`, { method: "POST", body: form });
      if (!cloudResponse.ok) throw new Error("Cloudinary rejected the audio upload.");
      const cloudUpload: unknown = await cloudResponse.json();
      setMessage("Starting durable transcription…");
      const registerResponse = await fetch("/api/uploads/audio", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "register", projectId, filename: file.name, mimeType: file.type, upload: cloudUpload }),
      });
      const registered = (await registerResponse.json()) as { workflowId?: string; error?: string };
      if (!registerResponse.ok || !registered.workflowId) throw new Error(registered.error ?? "Could not start transcription.");
      router.push(`/studio/genesis-1?workflow=${registered.workflowId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Audio upload failed.");
      setBusy(false);
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const nextRecorder = new MediaRecorder(stream);
      chunks.current = [];
      nextRecorder.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      nextRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const type = nextRecorder.mimeType || "audio/webm";
        void upload(new File(chunks.current, `explanation-${Date.now()}.webm`, { type }));
      };
      nextRecorder.start(1_000);
      recorder.current = nextRecorder;
      setRecording(true);
      setMessage("Recording… speak naturally, then select stop.");
    } catch {
      setMessage("Microphone access was denied. You can upload an audio file instead.");
    }
  }

  function stopRecording() {
    recorder.current?.stop();
    recorder.current = null;
    setRecording(false);
  }

  return <div className="audio-input">
    <div><strong>Speak your explanation</strong><small>The original recording is retained in Cloudinary; its transcript becomes a new source revision.</small></div>
    <div className="audio-actions">
      {recording ? <button type="button" className="button button-secondary" onClick={stopRecording}><Square size={14} fill="currentColor"/> Stop</button> : <button type="button" className="button button-ghost" onClick={startRecording} disabled={busy}><Mic size={15}/> Record</button>}
      <label className="button button-ghost"><Upload size={15}/> Upload audio<input type="file" accept="audio/*" disabled={busy || recording} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }}/></label>
    </div>
    {message ? <p>{message}</p> : null}
  </div>;
}
