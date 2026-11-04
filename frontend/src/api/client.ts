// Typed API calls. The session token stays in memory and localStorage for this browser only.

import type {
  AssistantHeard, AssistantReply, Capabilities, Placement, ProductDraft, RenderView, RoomAnswers, SessionView, PhotoView, ReconstructionRequest, SofaSpec,
} from "./contracts";

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

export interface Auth { id: string; token: string }

async function request<T>(path: string, init: RequestInit = {}, auth?: Auth): Promise<T> {
  const headers = new Headers(init.headers);
  if (auth) headers.set("Authorization", `Bearer ${auth.token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError("network", "We can't reach Roomset. Check your connection and try again.", 0);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(
      body?.error?.code ?? "unknown",
      body?.error?.message ?? "Something went wrong. Try again.",
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const base = (auth: Auth) => `/api/sessions/${auth.id}`;
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
const upload = (fields: Record<string, Blob | string>): RequestInit => {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => form.append(key, value));
  return { method: "POST", body: form };
};

export const api = {
  capabilities: () => request<Capabilities>("/api/capabilities"),
  warmAssistant: () => request<void>("/api/assistant/warm", { method: "POST" }),
  hearQuestion: (audio: Blob) => {
    const form = new FormData();
    form.append("audio", audio, audio.type.includes("mp4") ? "question.m4a" : "question.webm");
    return request<AssistantHeard>("/api/assistant/hear", { method: "POST", body: form });
  },
  askAssistant: (heard: AssistantHeard, photo: Blob | null, catalog: string) => {
    const form = new FormData();
    form.append("question", heard.question);
    if (heard.language) form.append("language", heard.language);
    if (photo) form.append("photo", photo, "view.jpg");
    form.append("catalog", catalog);
    return request<AssistantReply>("/api/assistant/ask", { method: "POST", body: form });
  },
  createSession: () => request<{ session: SessionView; token: string }>("/api/sessions", { method: "POST" }),
  createSample: () => request<{ session: SessionView; token: string }>("/api/sessions/sample", { method: "POST" }),
  getSession: (auth: Auth) => request<SessionView>(base(auth), {}, auth),
  deleteSession: (auth: Auth) => request<void>(base(auth), { method: "DELETE" }, auth),

  fetchListing: (auth: Auth, url: string) =>
    request<ProductDraft>(`${base(auth)}/product/fetch`, json("POST", { url }), auth),
  readScreenshot: (auth: Auth, file: Blob) =>
    request<ProductDraft>(`${base(auth)}/product/screenshot`, upload({ file }), auth),
  confirmProduct: (auth: Auth, body: unknown) =>
    request<SessionView>(`${base(auth)}/product`, json("PUT", body), auth),
  suggestAppearance: (auth: Auth, description: string) =>
    request<SofaSpec>(`${base(auth)}/product/appearance`, json("POST", { description }), auth),
  previewProduct: async (auth: Auth, body: unknown, signal: AbortSignal) => {
    const response = await fetch(`${base(auth)}/product/preview`, {
      method: "POST", signal,
      headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("Check the dimensions to see your sofa preview.");
    return response.arrayBuffer();
  },

  uploadPhoto: (auth: Auth, file: Blob, name = "photo.jpg") => {
    const form = new FormData();
    form.append("file", file, name);
    return request<PhotoView>(`${base(auth)}/photos`, { method: "POST", body: form }, auth);
  },
  deletePhoto: (auth: Auth, photoId: string) =>
    request<void>(`${base(auth)}/photos/${photoId}`, { method: "DELETE" }, auth),
  check: (auth: Auth) => request<SessionView>(`${base(auth)}/check`, { method: "POST" }, auth),

  saveAnswers: (auth: Auth, answers: RoomAnswers) =>
    request<SessionView>(`${base(auth)}/answers`, json("PUT", answers), auth),
  reconstruct: (auth: Auth, body: ReconstructionRequest) =>
    request<SessionView>(`${base(auth)}/reconstruction`, json("POST", body), auth),
  startBuild: (auth: Auth) => request<SessionView>(`${base(auth)}/build`, { method: "POST" }, auth),
  saveLayout: (auth: Auth, placement: Placement) =>
    request<SessionView>(`${base(auth)}/layout`, json("PUT", placement), auth),

  createRender: (auth: Auth, snapshot: Blob, stylePrompt: string) => {
    const form = new FormData();
    form.append("snapshot", snapshot, "view.jpg");
    form.append("style_prompt", stylePrompt);
    return request<RenderView>(`${base(auth)}/renders`, { method: "POST", body: form }, auth);
  },

  /** Fetches a protected file as an object URL for an <img>. The caller revokes it. */
  blobUrl: async (auth: Auth, path: string) => {
    const response = await fetch(`${base(auth)}/${path}`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    if (!response.ok) throw new ApiError("asset", "Could not load this file.", response.status);
    return URL.createObjectURL(await response.blob());
  },
  assetUrl: (auth: Auth, name: string) => `${base(auth)}/assets/${name}`,
};
