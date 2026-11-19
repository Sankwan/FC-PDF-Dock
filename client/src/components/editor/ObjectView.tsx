import type { EditorObject, Point } from "@/lib/editor/types";
import { CSS_FONT } from "@/lib/editor/measure";

/**
 * Draws one object on a page. Sizes use container query units, so the page
 * element (container-type: inline-size) can be any width on screen and every
 * object scales with it; `pw` is the page width in points.
 */
export const cq = (v: number, pw: number) => `${(v / pw) * 100}cqw`;

const path = (strokes: Point[][], ox: number, oy: number) =>
  strokes.map((s) => s.map((p, i) => `${i ? "L" : "M"}${p.x - ox} ${p.y - oy}`).join(" ") + (s.length === 1 ? " l0.01 0" : "")).join(" ");

export const ObjectView = ({ o, pw }: { o: EditorObject; pw: number }) => {
  const svgBox = (children: React.ReactNode, pad = 0) => (
    <svg
      className="pointer-events-none absolute overflow-visible"
      style={{ left: cq(-pad, pw), top: cq(-pad, pw), width: cq(o.w + pad * 2, pw), height: cq(o.h + pad * 2, pw) }}
      viewBox={`${-pad} ${-pad} ${o.w + pad * 2 || 1} ${o.h + pad * 2 || 1}`}
      preserveAspectRatio="none"
    >
      {children}
    </svg>
  );

  switch (o.kind) {
    case "text":
      return (
        <div
          className="pointer-events-none absolute left-0 top-0 whitespace-pre"
          style={{ fontFamily: CSS_FONT[o.font], fontSize: cq(o.size, pw), lineHeight: 1.2, fontWeight: o.bold ? 700 : 400, fontStyle: o.italic ? "italic" : "normal", color: o.color }}
        >
          {o.text || "​"}
        </div>
      );
    case "image":
      return <img src={o.src} alt={o.signature ? "Signature" : ""} draggable={false} className="pointer-events-none absolute inset-0 h-full w-full select-none" />;
    case "whiteout":
      return <div className="pointer-events-none absolute inset-0 bg-white" />;
    case "rect":
      return svgBox(<rect x={0} y={0} width={o.w} height={o.h} fill="none" stroke={o.color} strokeWidth={o.stroke} vectorEffect="non-scaling-stroke" style={{ strokeWidth: cq(o.stroke, pw) }} />);
    case "ellipse":
      return svgBox(<ellipse cx={o.w / 2} cy={o.h / 2} rx={o.w / 2} ry={o.h / 2} fill="none" stroke={o.color} style={{ strokeWidth: cq(o.stroke, pw) }} vectorEffect="non-scaling-stroke" />);
    case "check":
      return svgBox(<polyline points={`${o.w * 0.12},${o.h * 0.55} ${o.w * 0.4},${o.h * 0.85} ${o.w * 0.9},${o.h * 0.15}`} fill="none" stroke={o.color} strokeLinecap="round" strokeLinejoin="round" style={{ strokeWidth: cq(o.stroke, pw) }} vectorEffect="non-scaling-stroke" />);
    case "cross":
      return svgBox(<path d={`M${o.w * 0.15} ${o.h * 0.15}L${o.w * 0.85} ${o.h * 0.85}M${o.w * 0.85} ${o.h * 0.15}L${o.w * 0.15} ${o.h * 0.85}`} fill="none" stroke={o.color} strokeLinecap="round" style={{ strokeWidth: cq(o.stroke, pw) }} vectorEffect="non-scaling-stroke" />);
    case "line":
    case "arrow": {
      const ang = Math.atan2(o.to.y - o.from.y, o.to.x - o.from.x), len = Math.max(6, o.stroke * 4);
      const wing = (a: number) => `${o.to.x - o.x - len * Math.cos(ang + a)} ${o.to.y - o.y - len * Math.sin(ang + a)}`;
      const d = `M${o.from.x - o.x} ${o.from.y - o.y}L${o.to.x - o.x} ${o.to.y - o.y}` + (o.kind === "arrow" ? `M${wing(0.5)}L${o.to.x - o.x} ${o.to.y - o.y}L${wing(-0.5)}` : "");
      return svgBox(<path d={d} fill="none" stroke={o.color} strokeLinecap="round" strokeLinejoin="round" style={{ strokeWidth: cq(o.stroke, pw) }} vectorEffect="non-scaling-stroke" />, len);
    }
    case "ink":
      return svgBox(
        <path d={path(o.strokes, o.x, o.y)} fill="none" stroke={o.color} strokeOpacity={o.highlighter ? 0.35 : 1} strokeLinecap="round" strokeLinejoin="round" style={{ strokeWidth: cq(o.stroke, pw) }} vectorEffect="non-scaling-stroke" />,
        o.stroke,
      );
    case "stamp":
      return (
        <div
          className="pointer-events-none absolute inset-0 grid place-items-center whitespace-nowrap font-bold"
          style={{ color: o.color, border: `${cq(Math.max(1, o.h * 0.06), pw)} solid ${o.color}`, fontFamily: CSS_FONT.sans, fontSize: cq(o.h * 0.5, pw), lineHeight: 1 }}
        >
          {o.text}
        </div>
      );
  }
};
