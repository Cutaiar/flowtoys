// The shader contract every material shares: the uGain slot count, the
// shared uniforms, the one vertex transform, and the shaders built on it.
import * as THREE from 'three';

export const MAX_PARTS = 64;   // uGain slots; the last is held at 1 for paths that do not stretch
export const FIXED = MAX_PARTS - 1;

// shared uniforms, read by every material and layer
export const U = {
  uGain: { value: new Float32Array(MAX_PARTS).fill(1) },
  uDepth: { value: 1 },
  uTime: { value: 0 },
  uUvMode: { value: 0 },
  uCamDist: { value: 9 },
  uDpr: { value: 1 },
};

// the subject's one vertex transform, shared by every material: a pill's
// vertices are a capsule in its own frame (y along the axis), stretched by
// its gain; every other path is already in place. Depth squashes z (and
// tips the normals toward the viewer with it), so 0 is the flat vector.
export const SUBJECT_GLSL = /* glsl */`
attribute vec3 aCenter;
attribute vec2 aAxis;
attribute float aBase;
attribute float aIdx;
attribute float aStretch;   // 0 pull halves apart, 1 uniform scale, 2 major-axis scale
attribute vec3 aColor;
uniform float uGain[${MAX_PARTS}];
uniform float uDepth;
varying vec3 vSCol;
void subjectXform(inout vec3 p, inout vec3 n) {
  float g = uGain[int(aIdx + 0.5)];
  if (aStretch < 0.5) {
    p.y += (p.y >= 0.0 ? 1.0 : -1.0) * aBase * g;
  } else if (aStretch < 1.5) {
    p *= g;                      // uniform: normals keep their directions
  } else {
    p.y *= g; n.y /= g;          // axis scale: fix the normal with the inverse
  }
  vec2 pe = vec2(aAxis.y, -aAxis.x);
  vec3 q = vec3(pe * p.x + aAxis * p.y, p.z) + aCenter;
  vec3 m = vec3(pe * n.x + aAxis * n.y, n.z);
  float d = mix(0.002, 1.0, uDepth);
  q.z *= d;
  m = normalize(vec3(m.xy * d, m.z));
  p = q;
  n = m;
  vSCol = aColor;
}
`;

export function subjectize(mat) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uGain: U.uGain, uDepth: U.uDepth });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + SUBJECT_GLSL)
      .replace('#include <beginnormal_vertex>',
        'vec3 sPos = vec3(position);\nvec3 objectNormal = vec3(normal);\nsubjectXform(sPos, objectNormal);\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(tangent.xyz);\n#endif')
      .replace('#include <begin_vertex>',
        'vec3 transformed = sPos;\n#ifdef USE_ALPHAHASH\nvPosition = vec3(position);\n#endif');
  };
  mat.customProgramCacheKey = () => 'subject';
  return mat;
}

export const VS = /* glsl */`
${SUBJECT_GLSL}
attribute vec2 uvLogo;
attribute vec2 uvPart;
uniform int uUvMode;
uniform float uCamDist;
uniform float uDpr;
varying vec3 vN;
varying vec3 vView;
varying vec2 vUv;
varying float vIdx;
varying float vNear;
void main() {
  vec3 p = position;
  vec3 n = normal;
  subjectXform(p, n);   // also writes vSCol
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vView = mv.xyz;
  vN = normalize(normalMatrix * n);
  vUv = uUvMode == 1 ? uvPart : uvLogo;
  vIdx = aIdx;
  vNear = clamp((uCamDist + 1.4 + mv.z) / 2.8, 0.0, 1.0);   // 1 nearest the eye
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (1.4 + 2.6 * vNear * vNear) * uDpr;
}
`;

export const FS = /* glsl */`
uniform int uMode;          // 0 plasma, 1 halftone, 2 toon, 3 wire fill
uniform float uTime;
uniform float uDpr;
uniform vec3 uInk;
uniform vec3 uPaper;
uniform vec3 uBase;
uniform sampler2D uMap;
uniform int uHasMap;
uniform float uSrcColor;   // 1 = paint with each part's own SVG colour (aColor)
varying vec3 vN;
varying vec3 vView;
varying vec2 vUv;
varying float vIdx;
varying float vNear;
varying vec3 vSCol;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(-vView);
  vec3 L = normalize(vec3(0.45, 0.65, 0.9));
  float lam = max(dot(N, L), 0.0);
  float rim = 1.0 - max(dot(N, V), 0.0);
  vec3 col;
  float a = 1.0;
  if (uMode == 0) {
    vec2 q = vUv * 3.0;
    float t = uTime * 0.7;
    float v = sin(q.x * 3.1 + t) + sin(q.y * 2.3 - t * 1.3)
            + sin((q.x + q.y) * 2.0 + t * 0.7) + sin(length(q - 1.5) * 4.0 - t * 1.7);
    col = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + v * 0.22 + vIdx * 0.06));
    col *= 0.7 + 0.45 * lam;
    col += pow(rim, 3.0) * 0.5;
    col = mix(col, col * vSCol * 1.8, uSrcColor);
  } else if (uMode == 1) {
    float shade = clamp(0.12 + 0.95 * lam - 0.25 * rim, 0.0, 1.0);
    float c = 0.7071;
    vec2 g = mat2(c, -c, c, c) * gl_FragCoord.xy / (6.5 * uDpr);
    float d = length(fract(g) - 0.5);
    float r = sqrt(1.0 - shade) * 0.66;
    float w = fwidth(d);
    float ink = 1.0 - smoothstep(r - w, r + w, d);
    col = mix(uPaper, mix(uInk, vSCol, uSrcColor), ink);
  } else if (uMode == 2) {
    vec3 base = uHasMap == 1 ? texture2D(uMap, vUv).rgb : mix(uBase, vSCol, uSrcColor);
    float band = lam > 0.72 ? 1.0 : lam > 0.32 ? 0.72 : 0.45;
    col = base * band;
    vec3 H = normalize(L + V);
    col += step(0.93, pow(max(dot(N, H), 0.0), 24.0)) * 0.6;
    col = mix(col, uInk, step(0.72, rim) * step(0.05, 1.0 - abs(N.z)));
  } else {
    col = mix(vec3(1.0), vSCol * 1.4, uSrcColor);
    a = (0.025 + 0.06 * vNear * vNear);
  }
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`;

export const LINE_FS = /* glsl */`
uniform vec3 uColor;
uniform float uAlpha;
varying float vNear;
void main() {
  gl_FragColor = vec4(uColor, (0.1 + 0.9 * vNear * vNear) * uAlpha);
  #include <colorspace_fragment>
}
`;

export const POINT_FS = /* glsl */`
uniform vec3 uColor;
varying float vNear;
void main() {
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float a = (0.3 + 0.7 * vNear) * (1.0 - smoothstep(0.7, 1.0, length(d)));
  if (a <= 0.0) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`;
