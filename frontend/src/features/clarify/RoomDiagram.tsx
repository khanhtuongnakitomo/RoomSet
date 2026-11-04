import { useEffect, useState } from "react";
import { api, type Auth } from "../../api/client";
import type { ObstacleAnswer } from "../../api/contracts";

export function RoomDiagram({ width, depth, obstacles, sofaWidth, sofaDepth }: {
  width: number; depth: number; obstacles: ObstacleAnswer[]; sofaWidth: number; sofaDepth: number;
}) {
  if (!(width > 0 && depth > 0)) return <p className="plan-note">Enter both wall lengths to see a plan of your corner.</p>;
  const scale = Math.min(250 / Math.max(width, sofaWidth), 200 / depth);
  return <figure className="room-diagram"><svg viewBox="0 0 340 270" role="img" aria-label="Top view of the room measurements. Wall A is across the top; wall B is on the left.">
    <rect x="55" y="35" width={width * scale} height={depth * scale} fill="#ece7dc" stroke="#a9a391" strokeDasharray="5 4" />
    <path d={`M55 ${35 + depth * scale} V35 H${55 + width * scale}`} fill="none" stroke="#455344" strokeWidth="5" />
    <text x="55" y="20">Wall A · {width.toFixed(2)} m</text>
    <text x="10" y="250">Wall B · {depth.toFixed(2)} m · corner = 0, 0</text>
    <rect x={55 + (width - sofaWidth) * scale / 2} y={35 + 0.05 * scale} width={sofaWidth * scale} height={sofaDepth * scale} rx="4" fill="#70856b" opacity="0.55" />
    {obstacles.map((item, index) => <g key={index}><rect
      x={55 + (item.x_m - item.width_m / 2) * scale} y={35 + (item.z_m - item.depth_m / 2) * scale}
      width={item.width_m * scale} height={item.depth_m * scale}
      fill={item.kind === "keep_clear" ? "#deb86b" : "#74776d"} stroke="#4d5347" />
      <text x={55 + item.x_m * scale} y={35 + item.z_m * scale} textAnchor="middle" fontSize="10">{index + 1}</text></g>)}
  </svg><figcaption>Top view. Green is your sofa; numbered shapes are the objects or zones you add below.</figcaption></figure>;
}

export function RoomPhoto({ auth, id, index }: { auth: Auth; id: string; index: number }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let alive = true, url: string | undefined;
    api.blobUrl(auth, `photos/${id}`).then((value) => {
      url = value; if (alive) setSrc(value); else URL.revokeObjectURL(value);
    }).catch(() => undefined);
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [auth.id, auth.token, id]);
  return src ? <img src={src} alt={`Room reference ${index + 1}`} /> : null;
}
