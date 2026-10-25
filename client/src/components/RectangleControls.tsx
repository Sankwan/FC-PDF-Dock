import { useId } from 'react';

export interface Rectangle { x: number; y: number; w: number; h: number }
export const fitRectangle = (rect: Rectangle): Rectangle => {
  const w = Math.min(1, Math.max(0.01, rect.w));
  const h = Math.min(1, Math.max(0.01, rect.h));
  return { w, h, x: Math.min(1 - w, Math.max(0, rect.x)), y: Math.min(1 - h, Math.max(0, rect.y)) };
};
/** A non-drag alternative shared by document editors. Values are percentages. */
export default function RectangleControls({ value, onChange, label }: { value: Rectangle; onChange: (value: Rectangle) => void; label: string }) {
  const id = useId();
  return <fieldset className="min-w-0 rounded-lg border border-border p-3">
    <legend className="px-1 text-sm font-semibold">{label}</legend>
    <div className="grid grid-cols-2 gap-3">
      {([{ key: 'x', text: 'Left' }, { key: 'y', text: 'Top' }, { key: 'w', text: 'Width' }, { key: 'h', text: 'Height' }] as const).map(({ key, text }) => <div key={key}>
        <label htmlFor={`${id}-${key}`} className="block text-sm text-muted-foreground">{text} (%)</label>
        <input id={`${id}-${key}`} type="number" inputMode="decimal" min={key === 'w' || key === 'h' ? 1 : 0} max={100} step={1}
          value={Math.round(value[key] * 1000) / 10}
          onChange={e => { if (e.currentTarget.value !== '' && Number.isFinite(e.currentTarget.valueAsNumber)) onChange(fitRectangle({ ...value, [key]: e.currentTarget.valueAsNumber / 100 })); }}
          className="mt-1 min-h-11 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base text-foreground" />
      </div>)}
    </div>
  </fieldset>;
}
