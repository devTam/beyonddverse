import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const control = vi.hoisted(() => ({
  pending: false,
  actionPending: false,
  feedback: null as { error?: string; success?: string } | null,
  data: null as FormData | null,
  reducer: null as null | ((state: unknown, data: FormData) => Promise<unknown>),
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useActionState: (reducer: typeof control.reducer) => {
    control.reducer = reducer;
    return [control.feedback, () => {}, control.actionPending];
  },
}));
vi.mock("react-dom", async (original) => ({
  ...await original<typeof import("react-dom")>(),
  useFormStatus: () => ({ pending: control.pending, data: control.data, action: null }),
}));
vi.mock("next/navigation", () => ({ unstable_rethrow: (error: unknown) => {
  if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
} }));

import { ActionForm, SubmitButton } from "./action-form";

beforeEach(() => {
  control.pending = false;
  control.actionPending = false;
  control.feedback = null;
  control.data = null;
  control.reducer = null;
});

describe("action feedback", () => {
  it("shows pending feedback and locks repeated submissions", () => {
    control.pending = true;
    control.data = new FormData();
    control.data.set("status", "APPROVED");
    const approve = renderToStaticMarkup(<SubmitButton name="status" value="APPROVED" pendingLabel="Approving…">Approve</SubmitButton>);
    const reject = renderToStaticMarkup(<SubmitButton name="status" value="REJECTED">Reject</SubmitButton>);
    expect(approve).toContain('disabled=""');
    expect(approve).toContain('aria-busy="true"');
    expect(approve).toContain("Approving…");
    expect(reject).toContain('disabled=""');
    expect(reject).toContain(">Reject</button>");
    expect(reject).not.toContain("Working…");
  });

  it("preserves submitted data and returns success feedback", async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    renderToStaticMarkup(<ActionForm action={action}><SubmitButton>Save</SubmitButton></ActionForm>);
    // The child button registers a separate reducer, so render just the form to capture its reducer.
    renderToStaticMarkup(<ActionForm action={action}>Fields</ActionForm>);
    const data = new FormData();
    data.set("status", "APPROVED");
    expect(await control.reducer?.(null, data)).toEqual({ success: "Changes saved." });
    expect(action).toHaveBeenCalledWith(data);
  });

  it("displays action failures inline and preserves framework redirects", async () => {
    renderToStaticMarkup(<ActionForm action={async () => { throw new Error("Unable to save"); }}>Fields</ActionForm>);
    expect(await control.reducer?.(null, new FormData())).toEqual({ error: "Unable to save" });
    control.feedback = { error: "Unable to save" };
    expect(renderToStaticMarkup(<ActionForm action={async () => {}}>Fields</ActionForm>)).toContain('role="alert"');
    renderToStaticMarkup(<ActionForm action={async () => { throw new Error("NEXT_REDIRECT"); }}>Fields</ActionForm>);
    await expect(control.reducer?.(null, new FormData())).rejects.toThrow("NEXT_REDIRECT");
  });

  it("handles errors from alternate scene actions without losing their arguments", async () => {
    const action = vi.fn().mockResolvedValue({ error: "Please review this visual" });
    renderToStaticMarkup(<SubmitButton formAction={action.bind(null)} pendingLabel="Approving…">Approve visual</SubmitButton>);
    const data = new FormData();
    expect(await control.reducer?.(null, data)).toEqual({ error: "Please review this visual" });
    expect(action).toHaveBeenCalledWith(data);
  });
});
