import type { SofaSpec } from "../../api/contracts";

export const DEFAULT_SOFA: SofaSpec = { template: "legs", cushions: 3, arms: "slim", color: "#6B8067", material: "fabric" };

export function SofaOptions({ value, onChange, disabled = false }: {
  value: SofaSpec; onChange: (value: SofaSpec) => void; disabled?: boolean;
}) {
  return <fieldset className="sofa-options" disabled={disabled}>
    <legend>Match the appearance</legend>
    <label>Base<select aria-label="Base" className="rs-input" value={value.template} onChange={(e) => onChange({ ...value, template: e.target.value as SofaSpec["template"] })}>
      <option value="legs">Raised legs</option><option value="plinth">Low plinth</option>
    </select></label>
    <label>Seat cushions<select aria-label="Seat cushions" className="rs-input" value={value.cushions} onChange={(e) => onChange({ ...value, cushions: Number(e.target.value) })}>
      {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
    </select></label>
    <label>Arms<select aria-label="Arms" className="rs-input" value={value.arms} onChange={(e) => onChange({ ...value, arms: e.target.value as SofaSpec["arms"] })}>
      <option value="slim">Slim arms</option><option value="wide">Wide arms</option>
    </select></label>
    <label>Material<select aria-label="Material" className="rs-input" value={value.material} onChange={(e) => onChange({ ...value, material: e.target.value as SofaSpec["material"] })}>
      <option value="fabric">Fabric</option><option value="leather">Leather</option>
    </select></label>
    <label className="sofa-color">Upholstery color<input type="color" value={value.color} onChange={(e) => onChange({ ...value, color: e.target.value })} /></label>
  </fieldset>;
}
