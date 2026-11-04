import { useEffect, useState } from "react";
import { api, type Auth } from "../../api/client";

export function ProductReference({ auth, asset }: { auth: Auth; asset?: string | null }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    setSrc(undefined);
    if (!asset) return;
    let alive = true;
    let url: string | undefined;
    api.blobUrl(auth, `assets/${asset}`).then((next) => {
      url = next;
      if (alive) setSrc(next);
      else URL.revokeObjectURL(next);
    }).catch(() => undefined);
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [auth.id, auth.token, asset]);
  return src ? <figure className="product-reference"><img src={src} alt="Your saved product reference" /><figcaption>Your product reference</figcaption></figure> : null;
}
