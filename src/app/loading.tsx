import { LoaderCircle } from "lucide-react";

export default function Loading() {
  return <div className="page route-loading" role="status"><LoaderCircle className="spin" size={24}/><div><h1>Loading workspace…</h1><p>Retrieving your latest content.</p></div></div>;
}
