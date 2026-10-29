// Geometry from a vector source: parse filled AND stroked SVG paths, shape-
// match each one to a primitive (capsule, sphere, ellipsoid, rounded box,
// torus) or a beveled extrusion, then merge into one indexed BufferGeometry
// per layer (mesh, lines, points).
//
//   item            one flat outline {pts, holes, area, perim, box, color, lift}
//   primitive       a shape with a gain slot: it stretches/scales with audio
//   solid           every other path: extruded once, fixed at slot FIXED
//
// Shape rules, in order (no holes): circle -> sphere (uniform scale),
// stadium -> capsule (caps pulled apart), ellipse -> ellipsoid (major-axis
// scale), rounded rect -> rounded box (caps pulled apart);
// (one hole): circular ring -> torus (uniform scale).
// Everything else is extruded with a rounded bevel like before.
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { FIXED } from './glsl.js';

// per-vertex stretch mode (aStretch), read by subjectXform in glsl.js:
//   0 pull halves apart along aBase  (capsule, rounded box)
//   1 uniform scale                  (sphere, torus)
//   2 scale along the major axis     (ellipsoid)
export const STRETCH = { pull: 0, uniform: 1, axis: 2 };

// ------------------------------------------------------------ the sources
export const SOURCES = {
  mark: { name: 'Flow mark', svg: "<svg width=\"28\" height=\"28\" viewBox=\"0 0 28 28\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n<path d=\"M8.81167 7.99609C8.58276 7.99609 8.36233 8.08599 8.20124 8.24866C8.03592 8.41134 7.9469 8.63394 7.9469 8.86083V19.1349C7.9469 19.2505 7.96809 19.3618 8.01049 19.4688C8.05288 19.5758 8.11646 19.67 8.197 19.7513C8.27755 19.8327 8.37081 19.8969 8.47678 19.9397C8.58276 19.9825 8.69297 20.0039 8.80743 20.0039C9.03634 20.0039 9.25677 19.914 9.41785 19.7513C9.57894 19.5887 9.6722 19.3703 9.6722 19.1392V8.86083C9.6722 8.62966 9.58318 8.41134 9.41785 8.24866C9.25677 8.08599 9.03634 7.99609 8.80743 7.99609H8.81167Z\" fill=\"#FFFFEB\"/>\n<path d=\"M14 9.96118C13.8856 9.96118 13.7754 9.98259 13.6694 10.0254C13.5634 10.0682 13.4701 10.1324 13.3896 10.2138C13.3091 10.2951 13.2455 10.3893 13.2031 10.4963C13.1607 10.6033 13.1353 10.7146 13.1353 10.8259V17.0888C13.1353 17.32 13.2243 17.5383 13.3896 17.701C13.5507 17.8637 13.7711 17.9536 14 17.9536C14.2289 17.9536 14.4494 17.8637 14.6104 17.701C14.7715 17.5383 14.8648 17.32 14.8648 17.0888V10.8259C14.8648 10.5947 14.7758 10.3764 14.6104 10.2138C14.4494 10.0511 14.2289 9.96118 14 9.96118Z\" fill=\"#FFFFEB\"/>\n<path d=\"M11.4058 13.4966C11.1769 13.4966 10.9564 13.5865 10.7954 13.7492C10.6343 13.9118 10.541 14.1301 10.541 14.3613V17.9316C10.541 18.1627 10.63 18.381 10.7954 18.5437C10.9564 18.7064 11.1769 18.7963 11.4058 18.7963C11.6347 18.7963 11.8551 18.7064 12.0162 18.5437C12.1773 18.381 12.2706 18.1627 12.2706 17.9316V14.3613C12.2706 14.1301 12.1815 13.9118 12.0162 13.7492C11.8551 13.5865 11.6347 13.4966 11.4058 13.4966Z\" fill=\"#FFFFEB\"/>\n<path d=\"M19.1884 7.99609C19.0739 7.99609 18.9637 8.0175 18.8577 8.06031C18.7518 8.10312 18.6585 8.16733 18.578 8.24866C18.4974 8.33 18.4338 8.42418 18.3914 8.5312C18.349 8.63822 18.3236 8.74953 18.3236 8.86083V19.1349C18.3236 19.3661 18.4126 19.5844 18.578 19.7471C18.739 19.9097 18.9595 19.9996 19.1884 19.9996C19.4173 19.9996 19.6377 19.9097 19.7988 19.7471C19.9599 19.5844 20.0531 19.3661 20.0531 19.1349V8.86083C20.0531 8.62966 19.9641 8.41134 19.7988 8.24866C19.6377 8.08599 19.4173 7.99609 19.1884 7.99609Z\" fill=\"#FFFFEB\"/>\n<path d=\"M16.5943 13.4966C16.3654 13.4966 16.1449 13.5865 15.9838 13.7492C15.8228 13.9118 15.7295 14.1301 15.7295 14.3613V17.9316C15.7295 18.1627 15.8185 18.381 15.9838 18.5437C16.1449 18.7064 16.3654 18.7963 16.5943 18.7963C16.8232 18.7963 17.0436 18.7064 17.2047 18.5437C17.3658 18.381 17.459 18.1627 17.459 17.9316V14.3613C17.459 14.1301 17.37 13.9118 17.2047 13.7492C17.0436 13.5865 16.8232 13.4966 16.5943 13.4966Z\" fill=\"#FFFFEB\"/>\n</svg>" },
  wordmark: { name: 'Flow wordmark', svg: "<svg width=\"82\" height=\"23\" viewBox=\"0 0 82 23\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n<path d=\"M78.0756 8.49414L75.8737 16.7133L73.7036 8.58158L73.6798 8.49414H70.1902L67.9883 16.7133L65.8183 8.58158L65.7944 8.49414H62.5513L66.1203 20.4176L66.1442 20.505H69.7212L71.9469 12.3017L74.1249 20.4096L74.1488 20.505H77.7258L81.271 8.64517L81.3187 8.49414H78.0756Z\" fill=\"#1A1A1A\"/>\n<path d=\"M61.2474 9.88513C60.1107 8.73254 58.5448 8.12842 56.7245 8.12842C54.9042 8.12842 53.3541 8.73254 52.2174 9.88513C51.0807 11.0377 50.4766 12.6355 50.4766 14.4955C50.4766 16.3556 51.0807 17.9454 52.2174 19.1059C53.3541 20.2585 54.9042 20.8626 56.7245 20.8626C58.5448 20.8626 60.1107 20.2585 61.2474 19.1059C62.3841 17.9533 62.9883 16.3556 62.9883 14.4955C62.9883 12.6355 62.3841 11.0377 61.2474 9.88513ZM59.7848 14.4955C59.7848 15.5289 59.4907 16.4192 58.9343 17.0471C58.3858 17.6751 57.6148 18.009 56.7165 18.009C55.8183 18.009 55.0552 17.6751 54.5147 17.0471C53.9662 16.4112 53.68 15.5289 53.68 14.4876C53.68 13.4463 53.9662 12.5639 54.5147 11.928C55.0632 11.3 55.8263 10.9662 56.7165 10.9662C57.6068 10.9662 58.3779 11.3 58.9343 11.928C59.4907 12.5639 59.7848 13.4463 59.7848 14.4876V14.4955Z\" fill=\"#1A1A1A\"/>\n<path d=\"M48.6569 17.7307C48.4026 17.7307 48.2277 17.683 48.1243 17.5796C48.021 17.4763 47.9813 17.3094 47.9813 17.055V3.38281H44.8732V18.0407C44.8732 18.923 45.0878 19.5351 45.5171 19.9325C45.9463 20.322 46.5823 20.4969 47.5202 20.4969H50.1513V17.7227H48.6569V17.7307Z\" fill=\"#1A1A1A\"/>\n<path d=\"M42.9255 6.39546V3.38281H32.3375V20.4969H35.5489V13.2633H42.9255V10.2586H35.5489V6.39546H42.9255Z\" fill=\"#1A1A1A\"/>\n<path d=\"M1.62158 0.243164C1.19234 0.243164 0.778996 0.410092 0.476937 0.712152C0.166928 1.01421 0 1.42756 0 1.84885V20.9263C0 21.1409 0.0397447 21.3476 0.119234 21.5463C0.198724 21.7451 0.317958 21.9199 0.468988 22.071C0.620017 22.222 0.794894 22.3412 0.993618 22.4207C1.19234 22.5002 1.39901 22.5399 1.61364 22.5399C2.04288 22.5399 2.45622 22.373 2.75828 22.071C3.06034 21.7689 3.23522 21.3635 3.23522 20.9343V1.84885C3.23522 1.41961 3.06829 1.01421 2.75828 0.712152C2.45622 0.410092 2.04288 0.243164 1.61364 0.243164L1.62158 0.243164Z\" fill=\"#1A1A1A\"/>\n<path d=\"M11.3503 3.8916C11.1357 3.8916 10.9291 3.93135 10.7303 4.01084C10.5316 4.09032 10.3567 4.20956 10.2057 4.36059C10.0547 4.51162 9.93543 4.6865 9.85594 4.88522C9.77645 5.08394 9.72876 5.29062 9.72876 5.49729V17.1266C9.72876 17.5558 9.89569 17.9612 10.2057 18.2633C10.5078 18.5653 10.9211 18.7323 11.3503 18.7323C11.7796 18.7323 12.1929 18.5653 12.495 18.2633C12.7971 17.9612 12.9719 17.5558 12.9719 17.1266V5.49729C12.9719 5.06805 12.805 4.66265 12.495 4.36059C12.1929 4.05853 11.7796 3.8916 11.3503 3.8916Z\" fill=\"#1A1A1A\"/>\n<path d=\"M6.4867 10.4575C6.05745 10.4575 5.64411 10.6244 5.34205 10.9265C5.03999 11.2286 4.86511 11.634 4.86511 12.0632V18.6926C4.86511 19.1219 5.03204 19.5273 5.34205 19.8293C5.64411 20.1314 6.05745 20.2983 6.4867 20.2983C6.91594 20.2983 7.32928 20.1314 7.63134 19.8293C7.9334 19.5273 8.10828 19.1219 8.10828 18.6926V12.0632C8.10828 11.634 7.94135 11.2286 7.63134 10.9265C7.32928 10.6244 6.91594 10.4575 6.4867 10.4575Z\" fill=\"#1A1A1A\"/>\n<path d=\"M21.0806 0.243164C20.8659 0.243164 20.6593 0.282909 20.4606 0.362398C20.2618 0.441888 20.087 0.561122 19.9359 0.712152C19.7849 0.863182 19.6657 1.03806 19.5862 1.23678C19.5067 1.43551 19.459 1.64218 19.459 1.84885V20.9263C19.459 21.3556 19.6259 21.761 19.9359 22.063C20.238 22.3651 20.6513 22.532 21.0806 22.532C21.5098 22.532 21.9232 22.3651 22.2252 22.063C22.5273 21.761 22.7022 21.3556 22.7022 20.9263V1.84885C22.7022 1.41961 22.5352 1.01421 22.2252 0.712152C21.9232 0.410092 21.5098 0.243164 21.0806 0.243164Z\" fill=\"#1A1A1A\"/>\n<path d=\"M16.2155 10.4575C15.7862 10.4575 15.3729 10.6244 15.0708 10.9265C14.7687 11.2286 14.5939 11.634 14.5939 12.0632V18.6926C14.5939 19.1219 14.7608 19.5273 15.0708 19.8293C15.3729 20.1314 15.7862 20.2983 16.2155 20.2983C16.6447 20.2983 17.058 20.1314 17.3601 19.8293C17.6622 19.5273 17.837 19.1219 17.837 18.6926V12.0632C17.837 11.634 17.6701 11.2286 17.3601 10.9265C17.058 10.6244 16.6447 10.4575 16.2155 10.4575Z\" fill=\"#1A1A1A\"/>\n</svg>" },
  custom: null,
};
function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
function perimeter(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) s += pts[i].distanceTo(pts[(i + 1) % pts.length]);
  return s;
}
function polyArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}
function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// ------------------------------------------------------------ paint

// '#id' -> [{color, alpha}] for linearGradient/radialGradient stops
function gradientColors(doc) {
  const map = new Map();
  for (const g of doc.querySelectorAll('linearGradient, radialGradient')) {
    if (!g.id) continue;
    const stops = [];
    for (const s of g.querySelectorAll('stop')) {
      const c = s.getAttribute('stop-color') || s.style?.stopColor;
      if (!c) continue;
      const a = parseFloat(s.getAttribute('stop-opacity') ?? s.style?.stopOpacity ?? '1');
      stops.push({ color: c, alpha: isNaN(a) ? 1 : a });
    }
    if (stops.length) map.set(g.id, stops);
  }
  return map;
}

// a paint string -> THREE.Color; gradients give a representative (mean) colour
function colorOf(paint, gradients) {
  if (!paint || paint === 'none' || paint === 'currentColor') return null;
  const m = /^url\(\s*['"]?#([^)'"]+)['"]?\s*\)/.exec(paint);
  if (m) {
    const stops = gradients.get(m[1]);
    if (!stops?.length) return null;
    const c = new THREE.Color(0, 0, 0);
    let a = 0;
    for (const s of stops) {
      try { const sc = new THREE.Color().setStyle(s.color); c.r += sc.r * s.alpha; c.g += sc.g * s.alpha; c.b += sc.b * s.alpha; a += s.alpha; }
      catch { /* unparseable stop */ }
    }
    return a > 0 ? c.multiplyScalar(1 / a) : null;
  }
  try { return new THREE.Color().setStyle(paint); } catch { return null; }
}

// ------------------------------------------------------------ svg helpers

// a path is hidden when its own style or an ancestor's hides it
// (display is not inherited through SVGLoader's style map, so walk the DOM)
function hidden(node, style) {
  if (style.visibility === 'hidden' || style.visibility === 'collapse') return true;
  for (let el = node; el && el.nodeType === 1; el = el.parentNode) {
    if (el.getAttribute?.('display') === 'none') return true;
    const s = el.style;
    if (s && (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse')) return true;
  }
  return false;
}

function mkItem(pts, holes, color, lift) {
  if (pts.length && pts[0].distanceTo(pts[pts.length - 1]) < 1e-6) pts = pts.slice(0, -1);
  if (pts.length < 3) return null;
  let area = Math.abs(polyArea(pts));
  for (const h of holes) area -= Math.abs(polyArea(h));
  if (area <= 0) return null;
  return { pts, holes, area, perim: perimeter(pts), box: bbox(pts), color, lift };
}

// pointsToStroke returns a triangulated strip, not an outline: recover the
// boundary loops from it. A stroked open path is one loop; a stroked closed
// path is two (outer + inner, which becomes a hole).
function strokeLoops(geo) {
  const pos = geo.attributes.position;
  // the strip's shared vertices differ by float noise (~1e-6 from rotations):
  // snap to 0.001 so shared positions collapse and interior edges pair up
  const keyOf = (x, y) => `${x.toFixed(3)},${y.toFixed(3)}`;
  const vid = new Map();   // position key -> deduped vertex id
  const ids = [];
  for (let i = 0; i < pos.count; i++) {
    const k = keyOf(pos.getX(i), pos.getY(i));
    if (!vid.has(k)) vid.set(k, vid.size);
    ids.push(vid.get(k));
  }
  const pts = [...vid.keys()].map(k => { const [x, y] = k.split(','); return new THREE.Vector2(+x, +y); });
  // T-junctions: a vertex can sit ON another triangle's edge (the cap fan's
  // centre lands on the last body edge). Split every edge at vertices lying
  // on it first, or interior chords get miscounted as boundary.
  const splits = [];   // per-edge list of interior split vertices
  const triEdges = [];
  for (let t = 0; t < ids.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = ids[t + e], b = ids[t + (e + 1) % 3];
    if (a !== b) triEdges.push([a, b]);
  }
  const eps2 = 1e-6;
  const splitEdge = (a, b) => {
    const ax = pts[a].x, ay = pts[a].y, bx = pts[b].x, by = pts[b].y;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const inner = [];
    if (len2 > eps2) for (let c = 0; c < pts.length; c++) {
      if (c === a || c === b) continue;
      const t = ((pts[c].x - ax) * dx + (pts[c].y - ay) * dy) / len2;
      if (t <= 1e-3 || t >= 1 - 1e-3) continue;
      const px = ax + t * dx - pts[c].x, py = ay + t * dy - pts[c].y;
      if (px * px + py * py < eps2 * len2) inner.push([t, c]);
    }
    inner.sort((p, q) => p[0] - q[0]);
    const chain = [a, ...inner.map(p => p[1]), b];
    for (let i = 0; i + 1 < chain.length; i++) splits.push([chain[i], chain[i + 1]]);
  };
  for (const [a, b] of triEdges) splitEdge(a, b);
  const ekey = (a, b) => (a < b ? a * 131072 + b : b * 131072 + a);
  const use = new Map();
  for (const [a, b] of splits) use.set(ekey(a, b), (use.get(ekey(a, b)) || 0) + 1);
  const adj = new Map();   // boundary vertex -> boundary neighbours
  for (const [a, b] of splits) {
    if (use.get(ekey(a, b)) !== 1) continue;
    (adj.get(a) ?? adj.set(a, []).get(a)).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)).push(a);
  }
  // walk directed boundary edges: where two outlines touch (miter/join
  // vertices give a boundary vertex degree 4), continue straightest — that
  // stays on the same rail of the strip.
  const loops = [];
  const usedDir = new Set();
  for (const [start, firsts] of adj) for (const first of firsts) {
    if (usedDir.has(start * 131072 + first)) continue;
    const loop = [start];
    let prev = start, cur = first, guard = 0;
    usedDir.add(start * 131072 + first);
    usedDir.add(first * 131072 + start);
    while (cur !== start && guard++ < ids.length + 2) {
      loop.push(cur);
      const nb = (adj.get(cur) || []).filter(w => !usedDir.has(cur * 131072 + w));
      if (!nb.length) break;
      const dx = pts[cur].x - pts[prev].x, dy = pts[cur].y - pts[prev].y;
      const dl = Math.hypot(dx, dy) || 1;
      let best = nb[0], bdot = -2;
      for (const w of nb) {
        const ex = pts[w].x - pts[cur].x, ey = pts[w].y - pts[cur].y;
        const d = (dx * ex + dy * ey) / (dl * (Math.hypot(ex, ey) || 1));
        if (d > bdot) { bdot = d; best = w; }
      }
      usedDir.add(cur * 131072 + best);
      usedDir.add(best * 131072 + cur);   // each boundary edge is walked once, either way
      prev = cur; cur = best;
    }
    if (cur === start && loop.length >= 3) {
      const poly = loop.map(i => pts[i]);
      loops.push({ poly, area: Math.abs(polyArea(poly)) });
    }
  }
  loops.sort((a, b) => b.area - a.area);
  const items = [];
  for (const l of loops) {
    const outer = items.find(it => pointInPoly(l.poly[0], it.pts));
    if (outer) outer.holes.push(l.poly);
    else items.push({ pts: l.poly, holes: [] });
  }
  return items;
}

// ------------------------------------------------------------ shape rules

// a filled path whose area is a stadium's for its box is a pill: it becomes a capsule
function asPill(it) {
  const { w, h } = it.box;
  const r = Math.min(w, h) / 2;
  if (r <= 0) return null;
  const want = w * h - (4 - Math.PI) * r * r;
  if (Math.abs(it.area - want) / want > 0.025) return null;
  const vertical = h >= w;
  return { type: 'capsule', cx: it.box.x0 + w / 2, cy: it.box.y0 + h / 2, r, half: (Math.max(w, h) - 2 * r) / 2, vertical };
}

function asCircle(box, area) {
  const { w, h } = box;
  if (w <= 0 || h <= 0 || Math.abs(w - h) / Math.max(w, h) > 0.03) return null;
  const r = (w + h) / 4;
  if (Math.abs(area - Math.PI * r * r) / (Math.PI * r * r) > 0.03) return null;
  return r;
}
function asSphere(it) {
  const r = asCircle(it.box, it.area);
  if (!r) return null;
  return { type: 'sphere', cx: it.box.x0 + it.box.w / 2, cy: it.box.y0 + it.box.h / 2, r };
}
function asEllipsoid(it) {
  const { w, h } = it.box;
  if (w <= 0 || h <= 0) return null;
  const a = Math.max(w, h) / 2, b = Math.min(w, h) / 2;
  if (Math.abs(it.area - Math.PI * a * b) / (Math.PI * a * b) > 0.03) return null;
  return { type: 'ellipsoid', cx: it.box.x0 + w / 2, cy: it.box.y0 + h / 2, a, b, vertical: h >= w };
}
// a circle path with one circular, concentric hole is a ring: it becomes a torus
function asTorus(it) {
  if (it.holes.length !== 1) return null;
  const outerArea = Math.abs(polyArea(it.pts));
  const R = asCircle(it.box, outerArea);
  if (!R) return null;
  const hb = bbox(it.holes[0]);
  const r = asCircle(hb, Math.abs(polyArea(it.holes[0])));
  if (!r || r >= R) return null;
  const cx = it.box.x0 + it.box.w / 2, cy = it.box.y0 + it.box.h / 2;
  if (Math.abs(hb.x0 + hb.w / 2 - cx) > 0.08 * R || Math.abs(hb.y0 + hb.h / 2 - cy) > 0.08 * R) return null;
  return { type: 'torus', cx, cy, R, r };
}
// area picks a corner radius; the perimeter has to match the rounded-rect
// perimeter for that radius, which keeps stadiums (pill) and blobs out
function asRoundedBox(it) {
  const { w, h } = it.box;
  if (w <= 0 || h <= 0) return null;
  const r2 = (w * h - it.area) / (4 - Math.PI);
  if (r2 <= 0) return null;
  const r = Math.sqrt(r2);
  const half = Math.min(w, h) / 2;
  if (r >= half || r < 0.03 * half) return null;
  const want = 2 * (w + h) - (8 - 2 * Math.PI) * r;
  if (Math.abs(it.perim - want) / want > 0.04) return null;
  return { type: 'rbox', cx: it.box.x0 + w / 2, cy: it.box.y0 + h / 2, w, h, r, vertical: h >= w };
}

function detectPrimitive(it) {
  if (it.holes.length) return asTorus(it);
  return asSphere(it) || asPill(it) || asEllipsoid(it) || asRoundedBox(it);
}

// ------------------------------------------------------------ parse

export function parseSource(svgText) {
  // SVGLoader only resolves <use xlink:href>; modern files often write plain href
  if (/<use[\s>]/.test(svgText)) {
    if (!/xmlns:xlink=/.test(svgText)) svgText = svgText.replace(/<svg\b/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
    svgText = svgText.replace(/<use\b([^>]*?)(?<!xlink:)href=/g, '<use$1 xlink:href=');
  }
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const gradients = gradientColors(doc);
  const texts = doc.querySelectorAll('text').length;
  const data = new SVGLoader().parse(svgText);
  const items = [];
  for (const path of data.paths) {
    const style = path.userData?.style || {};
    if (hidden(path.userData?.node, style)) continue;
    if (style.opacity !== undefined && +style.opacity <= 0) continue;
    const fill = style.fill, stroke = style.stroke;
    const fillA = +(style.fillOpacity ?? 1) * +(style.opacity ?? 1);
    const strokeA = +(style.strokeOpacity ?? 1) * +(style.opacity ?? 1);
    const hasFill = fill !== 'none' && fill !== 'transparent' && fillA > 0;
    const hasStroke = stroke && stroke !== 'none' && stroke !== 'transparent' && strokeA > 0;
    const color = colorOf(fill, gradients) || colorOf(stroke, gradients) || new THREE.Color(1, 1, 1);
    if (hasFill) {
      for (const shape of SVGLoader.createShapes(path)) {
        const ex = shape.extractPoints(24);
        const it = mkItem(ex.shape, ex.holes, color, 0);
        if (it) items.push(it);
      }
    }
    if (hasStroke) {
      const st = { ...style, strokeWidth: style.strokeWidth > 0 ? style.strokeWidth : 1 };
      const colorS = colorOf(stroke, gradients) || colorOf(fill, gradients) || new THREE.Color(1, 1, 1);
      for (const sub of path.subPaths) {
        const pts = sub.getPoints(24);
        if (pts.length < 2) continue;
        const geo = SVGLoader.pointsToStroke(pts, st, 16);
        if (!geo) continue;
        for (const l of strokeLoops(geo)) {
          const it = mkItem(l.pts, l.holes, colorS, 0.008);   // slight lift so fills and strokes don't z-fight flat
          if (it) items.push(it);
        }
        geo.dispose();
      }
    }
  }
  if (!items.length) {
    if (texts) throw new Error('That SVG is all <text> — convert the text to outlines first (Object to Path / Create Outlines in your editor).');
    throw new Error('That SVG has no filled or stroked paths to build from.');
  }
  const warnings = [];
  if (texts) warnings.push(`${texts} <text> element${texts === 1 ? '' : 's'} skipped — convert text to outlines to include ${texts === 1 ? 'it' : 'them'}.`);
  // a path that covers the whole artboard behind the rest is a backdrop, not the subject
  let dropped = 0;
  if (items.length > 1) {
    const all = bbox(items.flatMap(i => [new THREE.Vector2(i.box.x0, i.box.y0), new THREE.Vector2(i.box.x1, i.box.y1)]));
    const big = items.findIndex(i => i.box.w >= 0.9 * all.w && i.box.h >= 0.9 * all.h);
    if (big >= 0 && items.filter((_, k) => k !== big).every(o => o.area < items[big].area * 0.6)) {
      items.splice(big, 1); dropped = 1;
    }
  }
  return { items, dropped, warnings };
}

// ------------------------------------------------------------ build

export function buildSubject(svgText) {
  const { items, dropped, warnings } = parseSource(svgText);
  const all = bbox(items.flatMap(i => [new THREE.Vector2(i.box.x0, i.box.y0), new THREE.Vector2(i.box.x1, i.box.y1)]));
  const k = 3.2 / Math.max(all.w, all.h);
  const cx = all.x0 + all.w / 2, cy = all.y0 + all.h / 2;
  const W = (x, y) => new THREE.Vector2((x - cx) * k, -(y - cy) * k);   // SVG y runs down
  const wb = { x0: (all.x0 - cx) * k, y0: -(all.y1 - cy) * k, w: all.w * k, h: all.h * k };
  const logoUv = (x, y) => [(x - wb.x0) / wb.w, (y - wb.y0) / wb.h];

  const movers = [], solids = [];   // movers get gain slots, solids share FIXED
  for (const it of items) { const p = detectPrimitive(it); p ? movers.push({ it, p }) : solids.push(it); }
  movers.sort((a, b) => a.p.cx - b.p.cx || a.p.cy - b.p.cy);   // left to right: low bands to high

  const parts = [];
  const counts = {};

  // per-vertex attributes for a part built in its local frame (+y is the
  // stretch axis, part centred on the origin, aCenter/aAxis place it).
  // uvMode 'lathe': u around, v along the stretched length (capsule, rbox)
  //        'box':   local-bounds normalized (sphere, ellipsoid, torus)
  function finishPart(geo, o) {
    const pos = geo.attributes.position, lathe = geo.attributes.uv, n = pos.count;
    const pe = [o.axis[1], -o.axis[0]];
    const aCenter = new Float32Array(n * 3), aAxis = new Float32Array(n * 2), aBase = new Float32Array(n),
          aIdx = new Float32Array(n), aStretch = new Float32Array(n), aColor = new Float32Array(n * 3);
    const uvLogo = new Float32Array(n * 2), uvPart = new Float32Array(n * 2);
    const lb = o.uvMode === 'box' || o.uvMode === 'span' ? bbox2(geo) : null;
    const vLen = 2 * (o.base + o.capHalf) || 1;
    for (let v = 0; v < n; v++) {
      const x = pos.getX(v), y = pos.getY(v);
      const s = y >= 0 ? 1 : -1, yy = y + s * o.base;
      aCenter.set(o.c, v * 3); aAxis.set(o.axis, v * 2); aBase[v] = o.base; aIdx[v] = o.slot;
      aStretch[v] = o.mode; aColor.set(o.color, v * 3);
      const wx = o.c[0] + pe[0] * x + o.axis[0] * yy, wy = o.c[1] + pe[1] * x + o.axis[1] * yy;
      uvLogo.set(logoUv(wx, wy), v * 2);
      if (o.uvMode === 'lathe') uvPart.set([lathe.getX(v), (yy + o.base + o.capHalf) / vLen], v * 2);
      else if (o.uvMode === 'span') uvPart.set([(x - lb.x0) / Math.max(lb.w, 1e-6), (yy + o.base + o.capHalf) / vLen], v * 2);
      else uvPart.set([(x - lb.x0) / Math.max(lb.w, 1e-6), (y - lb.y0) / Math.max(lb.h, 1e-6)], v * 2);
    }
    return { aCenter, aAxis, aBase, aIdx, aStretch, aColor, uvLogo, uvPart };
  }

  movers.forEach(({ it, p }, i) => {
    const c = W(p.cx, p.cy);
    const axis = p.vertical === false ? [1, 0] : [0, 1];
    const color = [it.color.r, it.color.g, it.color.b];
    const slot = i < FIXED ? i : FIXED;   // overflow primitives stay rendered but share the fixed slot
    const z = (it.lift || 0) * k;
    let geo, mode, base = 0, capHalf = 0, uvMode = 'span';
    if (p.type === 'capsule') {
      const r = p.r * k;
      geo = new THREE.CapsuleGeometry(r, 1e-4, 10, 36);
      base = p.half * k; capHalf = r; mode = STRETCH.pull; uvMode = 'lathe';
      counts.capsule = (counts.capsule || 0) + 1;
    } else if (p.type === 'sphere') {
      geo = new THREE.SphereGeometry(p.r * k, 36, 24);
      mode = STRETCH.uniform; uvMode = 'box';
      counts.sphere = (counts.sphere || 0) + 1;
    } else if (p.type === 'ellipsoid') {
      geo = new THREE.SphereGeometry(1, 36, 24);
      geo.scale(p.b * k, p.a * k, p.b * k);
      mode = STRETCH.axis; uvMode = 'box';
      counts.ellipsoid = (counts.ellipsoid || 0) + 1;
    } else if (p.type === 'rbox') {
      const minor = Math.min(p.w, p.h) * k, major = Math.max(p.w, p.h) * k, rr = p.r * k;
      const zHalf = Math.min(rr, Math.max(0.04, Math.min(0.6, (2 * it.area / it.perim) * k)));
      const rad = Math.min(rr, minor * 0.49, zHalf * 0.99);
      geo = new RoundedBoxGeometry(minor, 2 * rad, 2 * zHalf, 4, rad * 0.98);
      base = major / 2 - rad; capHalf = rad; mode = STRETCH.pull;
      counts.rbox = (counts.rbox || 0) + 1;
    } else {   // torus
      geo = new THREE.TorusGeometry(((p.R + p.r) / 2) * k, ((p.R - p.r) / 2) * k, 16, 48);
      mode = STRETCH.uniform; uvMode = 'box';
      counts.torus = (counts.torus || 0) + 1;
    }
    if (!geo.index) geo = mergeVertices(geo);   // RoundedBoxGeometry is non-indexed
    parts.push({
      geo, attrs: finishPart(geo, { c: [c.x, c.y, z], axis, base, capHalf, slot, mode, color, uvMode }),
      edges: p.type === 'rbox' ? creaseEdges(geo, 30) : gridEdges(geo), points: uniquePoints(geo),
    });
  });

  solids.forEach((it) => {
    const shape = new THREE.Shape(it.pts.map(p => W(p.x, p.y)));
    shape.holes = it.holes.map(h => new THREE.Path(h.map(p => W(p.x, p.y))));
    const stroke = Math.max(0.04, Math.min(0.6, (2 * it.area / it.perim) * k));
    const bt = stroke * 0.34, bs = stroke * 0.26, depth = stroke * 0.32;
    let geo = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelOffset: -bs, bevelSegments: 5, curveSegments: 4,
    });
    geo.translate(0, 0, (it.lift || 0) * k - depth / 2);
    geo.deleteAttribute('uv');
    geo = toCreasedNormals(geo, 0.7);
    geo = mergeVertices(geo, 1e-5);
    const pos = geo.attributes.position, n = pos.count;
    const pb = bbox(it.pts.map(p => W(p.x, p.y)));
    const aCenter = new Float32Array(n * 3), aAxis = new Float32Array(n * 2), aBase = new Float32Array(n),
          aIdx = new Float32Array(n).fill(FIXED), aStretch = new Float32Array(n), aColor = new Float32Array(n * 3);
    const uvLogo = new Float32Array(n * 2), uvPart = new Float32Array(n * 2);
    const rgb = [it.color.r, it.color.g, it.color.b];
    for (let v = 0; v < n; v++) {
      const x = pos.getX(v), y = pos.getY(v);
      aAxis.set([0, 1], v * 2);
      aColor.set(rgb, v * 3);
      uvLogo.set(logoUv(x, y), v * 2);
      uvPart.set([(x - pb.x0) / Math.max(pb.w, 1e-6), (y - pb.y0) / Math.max(pb.h, 1e-6)], v * 2);
    }
    // no points on an extruded path: its bevel rings would crowd them into a blur
    parts.push({ geo, attrs: { aCenter, aAxis, aBase, aIdx, aStretch, aColor, uvLogo, uvPart }, edges: creaseEdges(geo, 12), points: [] });
    counts.extruded = (counts.extruded || 0) + 1;
  });

  // one geometry, one draw per layer
  const names = ['position', 'normal'];
  const extra = { aCenter: 3, aAxis: 2, aBase: 1, aIdx: 1, aStretch: 1, aColor: 3, uvLogo: 2, uvPart: 2 };
  let nv = 0, nt = 0, ne = 0, np = 0;
  for (const p of parts) { nv += p.geo.attributes.position.count; nt += p.geo.index.count; ne += p.edges.length; np += p.points.length; }
  const out = {};
  for (const nm of names) out[nm] = new Float32Array(nv * 3);
  for (const [nm, sz] of Object.entries(extra)) out[nm] = new Float32Array(nv * sz);
  const tri = new Uint32Array(nt), lin = new Uint32Array(ne), pnt = new Uint32Array(np);
  let ov = 0, ot = 0, oe = 0, op = 0;
  for (const p of parts) {
    const c = p.geo.attributes.position.count;
    for (const nm of names) out[nm].set(p.geo.attributes[nm].array, ov * 3);
    for (const [nm, sz] of Object.entries(extra)) out[nm].set(p.attrs[nm], ov * sz);
    const ix = p.geo.index.array;
    for (let i = 0; i < ix.length; i++) tri[ot + i] = ix[i] + ov;
    for (let i = 0; i < p.edges.length; i++) lin[oe + i] = p.edges[i] + ov;
    for (let i = 0; i < p.points.length; i++) pnt[op + i] = p.points[i] + ov;
    ov += c; ot += ix.length; oe += p.edges.length; op += p.points.length;
    p.geo.dispose();
  }
  const attrs = {};
  for (const nm of names) attrs[nm] = new THREE.BufferAttribute(out[nm], 3);
  for (const [nm, sz] of Object.entries(extra)) attrs[nm] = new THREE.BufferAttribute(out[nm], sz);
  const mk = (index) => {
    const g = new THREE.BufferGeometry();
    for (const [nm, a] of Object.entries(attrs)) g.setAttribute(nm, a);
    g.setAttribute('uv', attrs.uvLogo);
    g.setAttribute('color', attrs.aColor);   // vertexColors materials multiply diffuse by this
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);   // stretch moves vertices on the GPU
    return g;
  };
  return {
    mesh: mk(tri), lines: mk(lin), points: mk(pnt), attrs,
    counts, movers: movers.length, dropped, tris: nt / 3,
    size: [wb.w, wb.h],
    warn: warnings.join(' ') || null,
  };
}

// 2D bounds of a geometry's position attribute (local frame)
function bbox2(geo) {
  const pos = geo.attributes.position;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let v = 0; v < pos.count; v++) {
    x0 = Math.min(x0, pos.getX(v)); y0 = Math.min(y0, pos.getY(v));
    x1 = Math.max(x1, pos.getX(v)); y1 = Math.max(y1, pos.getY(v));
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
const lbX = bbox2;

function uniquePoints(geo) {
  const pos = geo.attributes.position, seen = new Map(), out = [];
  for (let v = 0; v < pos.count; v++) {
    const kk = `${pos.getX(v).toFixed(4)},${pos.getY(v).toFixed(4)},${pos.getZ(v).toFixed(4)}`;
    if (!seen.has(kk)) { seen.set(kk, v); out.push(v); }
  }
  return out;
}

// rings and meridians of a lathed/uv-gridded surface, never the quads' diagonals
function gridEdges(geo) {
  const pos = geo.attributes.position, uv = geo.attributes.uv, idx = geo.index.array;
  const edges = [], seen = new Set();
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = idx[t + e], b = idx[t + (e + 1) % 3];
    const du = Math.abs(uv.getX(a) - uv.getX(b)), dv = Math.abs(uv.getY(a) - uv.getY(b));
    if (du > 1e-6 && dv > 1e-6) continue;
    const kk = a < b ? a * 65536 + b : b * 65536 + a;
    if (seen.has(kk)) continue;
    seen.add(kk); edges.push(a, b);
  }
  return edges;
}

// outline and creases of an extruded path: edges whose faces meet at more than `deg`
function creaseEdges(geo, deg) {
  const pos = geo.attributes.position, ix = geo.index.array;
  const cos = Math.cos(deg * Math.PI / 180);
  const key = (v) => `${pos.getX(v).toFixed(4)},${pos.getY(v).toFixed(4)},${pos.getZ(v).toFixed(4)}`;
  const map = new Map();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < ix.length; t += 3) {
    a.fromBufferAttribute(pos, ix[t]); b.fromBufferAttribute(pos, ix[t + 1]); c.fromBufferAttribute(pos, ix[t + 2]);
    const n = new THREE.Vector3().subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
    for (let e = 0; e < 3; e++) {
      const i0 = ix[t + e], i1 = ix[t + (e + 1) % 3];
      const k0 = key(i0), k1 = key(i1);
      const kk = k0 < k1 ? k0 + '|' + k1 : k1 + '|' + k0;
      const rec = map.get(kk);
      if (rec) rec.n.push(n); else map.set(kk, { i0, i1, n: [n] });
    }
  }
  const out = [];
  for (const r of map.values()) if (r.n.length === 1 || r.n[0].dot(r.n[1]) < cos) out.push(r.i0, r.i1);
  return out;
}
