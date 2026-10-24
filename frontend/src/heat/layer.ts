// The heatmap on the graphics card. All forecast hours of weather go to the GPU once; moving the
// slider only changes one number (uHour), so it never waits and never refetches.
// Every screen pixel works out its own weather (smooth bicubic blend of the grid), its level
// at the brief's thresholds, and a soft fade at the corridor's edge. Approved prototype look.
import type { CustomLayerInterface, Map as MapLibre } from 'maplibre-gl'
import { MercatorCoordinate } from 'maplibre-gl'
import type { Grid } from './grid'
import type { HeatWeather } from './weather'

export type HeatView = 'risk' | 'wind' | 'rain' | 'snow'
const VIEWS: Record<HeatView, number> = { risk: 0, wind: 1, rain: 2, snow: 3 }

// Low, Moderate, High, Severe, No Travel: rgb 0..1 and opacity. Low is a faint haze.
const PALETTE = [[0.20, 0.52, 0.56, 0.13], [0.95, 0.84, 0.52, 0.62], [0.94, 0.66, 0.42, 0.66], [0.87, 0.43, 0.40, 0.70], [0.56, 0.36, 0.64, 0.74]]

const VERTEX = `#version 300 es
uniform mat4 uMatrix; in vec2 aPos; out vec2 vMerc;
void main() { vMerc = aPos; gl_Position = uMatrix * vec4(aPos, 0.0, 1.0); }`

const FRAGMENT = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vMerc; out vec4 outColor;
uniform sampler2D uWx;    // cols x (rows * uHours): wind, rain, snow of each cell, hour after hour
uniform sampler2D uDist;  // km to the nearest route, 0..1 = 0..100 km
uniform float uHour; uniform ivec2 uSize; uniform vec4 uBox; uniform float uStep;
uniform int uHours; uniform int uView; uniform float uLoad; uniform vec4 uPal[5];
const float PI = 3.141592653589793;
vec3 cell(int i, int j, int h) {
  i = clamp(i, 0, uSize.y - 1); j = clamp(j, 0, uSize.x - 1);
  return texelFetch(uWx, ivec2(j, i + h * uSize.y), 0).xyz;
}
vec4 catmullRom(float t) { float t2 = t * t, t3 = t2 * t;
  return vec4(-t3 + 2.0 * t2 - t, 3.0 * t3 - 5.0 * t2 + 2.0, -3.0 * t3 + 4.0 * t2 + t, t3 - t2) * 0.5; }
vec3 bicubic(vec2 g, int h) {
  vec2 b = floor(g), t = g - b; vec4 wx = catmullRom(t.x), wy = catmullRom(t.y); vec3 sum = vec3(0.0);
  for (int a = 0; a < 4; a++) for (int c = 0; c < 4; c++) sum += cell(int(b.y) - 1 + a, int(b.x) - 1 + c, h) * wy[a] * wx[c];
  return max(sum, vec3(0.0));
}
// A level from 0 to 4, each band edge soft by one screen pixel.
float level(float v, vec4 edges) { float w = max(fwidth(v), 1e-4);
  return smoothstep(edges.x - w, edges.x, v) + smoothstep(edges.y - w, edges.y, v) + smoothstep(edges.z - w, edges.z, v) + smoothstep(edges.w - w, edges.w, v); }
vec4 palette(float l) { int a = int(floor(l)); return mix(uPal[clamp(a, 0, 4)], uPal[clamp(a + 1, 0, 4)], fract(l)); }
void main() {
  float lon = vMerc.x * 360.0 - 180.0, lat = degrees(atan(sinh(PI * (1.0 - 2.0 * vMerc.y))));
  vec2 g = vec2((lon - uBox.x) / uStep - 0.5, (lat - uBox.y) / uStep - 0.5);
  int h0 = int(floor(uHour)), h1 = min(h0 + 1, uHours - 1);
  vec3 v = mix(bicubic(g, h0), bicubic(g, h1), fract(uHour));
  float km = texture(uDist, vec2((lon - uBox.x) / (uBox.z - uBox.x), (lat - uBox.y) / (uBox.w - uBox.y))).r * 100.0;
  float fade = 1.0 - smoothstep(48.0, 82.0, km);
  if (fade <= 0.0) discard;
  vec4 rain = vec4(0.10, 0.25, 0.50, 1.0001), snow = vec4(0.5, 1.0, 2.0, 3.0001); // rain and snow: No Travel above 1.00 and 3.0
  vec4 col;
  if (uView == 0) {
    vec4 wind = vec4(25.0, 35.0, 45.0, 55.0);
    if (uLoad > 40000.0) wind.z = 35.0;   // 35-44 mph with more than 40,000 lb: Severe
    if (uLoad > 30000.0) wind.w = 45.0;   // 45-54 mph with more than 30,000 lb: No Travel
    col = palette(max(level(v.x, wind), max(level(v.y, rain), level(v.z, snow))));
  } else if (uView == 1) col = palette(level(v.x, vec4(25.0, 35.0, 45.0, 55.0)));
  else if (uView == 2) col = palette(level(v.y, rain));
  else col = palette(level(v.z, snow));
  outColor = vec4(col.rgb * col.a * fade, col.a * fade);
}`

/** Each hour's grid with the empty cells around the corridor filled from their neighbours,
 *  so the smooth blend near the edge has values to work with. Exported for tests. */
export function fieldTexture(grid: Grid, weather: HeatWeather): Float32Array {
  const { rows, cols } = grid, data = new Float32Array(cols * rows * weather.hours * 4)
  const at = (h: number, i: number, j: number) => ((h * rows + i) * cols + j) * 4
  for (let h = 0; h < weather.hours; h++) {
    const known = new Uint8Array(rows * cols)
    grid.cells.forEach((c, k) => {
      const p = at(h, c.i, c.j)
      data[p] = weather.wind[k * weather.hours + h]; data[p + 1] = weather.rain[k * weather.hours + h]; data[p + 2] = weather.snow[k * weather.hours + h]; data[p + 3] = 1
      known[c.i * cols + c.j] = 1
    })
    for (let pass = 0; pass < 5; pass++) {
      const add: [number, number][] = []
      for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
        if (known[i * cols + j]) continue
        let n = 0, w = 0, r = 0, s = 0
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ii = i + di, jj = j + dj
          if (ii < 0 || jj < 0 || ii >= rows || jj >= cols || !known[ii * cols + jj]) continue
          const q = at(h, ii, jj); n++; w += data[q]; r += data[q + 1]; s += data[q + 2]
        }
        if (n) { add.push([i, j]); data.set([w / n, r / n, s / n, 1], at(h, i, j)) }
      }
      add.forEach(([i, j]) => { known[i * cols + j] = 1 })
    }
  }
  return data
}

export interface HeatLayer extends CustomLayerInterface {
  setHour(hour: number): void   // hours after departure, 0 to 48
  setView(view: HeatView): void
}

export function heatLayer(grid: Grid, weather: HeatWeather, loadLb: number): HeatLayer {
  let gl: WebGL2RenderingContext, program: WebGLProgram, buffer: WebGLBuffer, fieldTex: WebGLTexture, distTex: WebGLTexture, map: MapLibre
  const loc: Record<string, WebGLUniformLocation | null> = {}
  let position = 0
  let hour = 0, view: HeatView = 'risk'
  return {
    id: 'heat', type: 'custom', renderingMode: '2d',
    onAdd(m, context) {
      map = m; gl = context
      const shader = (type: number, source: string) => {
        const s = gl.createShader(type)!
        gl.shaderSource(s, source); gl.compileShader(s)
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader failed')
        return s
      }
      program = gl.createProgram()!
      gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX)); gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT)); gl.linkProgram(program)
      for (const name of ['uMatrix', 'uWx', 'uDist', 'uHour', 'uHours', 'uSize', 'uBox', 'uStep', 'uView', 'uLoad', 'uPal']) loc[name] = gl.getUniformLocation(program, name)
      position = gl.getAttribLocation(program, 'aPos')
      const [west, south, east, north] = grid.box
      const a = MercatorCoordinate.fromLngLat([west, north]), b = MercatorCoordinate.fromLngLat([east, south])
      buffer = gl.createBuffer()!
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([a.x, a.y, b.x, a.y, a.x, b.y, b.x, b.y]), gl.STATIC_DRAW)

      distTex = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, distTex); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, grid.distance.width, grid.distance.height, 0, gl.RED, gl.UNSIGNED_BYTE, grid.distance.values)
      for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR)
      for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE)

      fieldTex = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, fieldTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, grid.cols, grid.rows * weather.hours, 0, gl.RGBA, gl.FLOAT, fieldTexture(grid, weather))
      for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST)
    },
    onRemove() {
      gl.deleteTexture(fieldTex); gl.deleteTexture(distTex); gl.deleteBuffer(buffer); gl.deleteProgram(program)
    },
    render(_, options) {
      gl.useProgram(program)
      gl.uniformMatrix4fv(loc.uMatrix, false, options.defaultProjectionData.mainMatrix as Float32List)
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fieldTex); gl.uniform1i(loc.uWx, 0)
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, distTex); gl.uniform1i(loc.uDist, 1)
      // the grid's first hour is the departure rounded down; hour 0 of the slider is the departure itself
      gl.uniform1f(loc.uHour, Math.min(weather.hours - 1, hour + weather.offset))
      gl.uniform1i(loc.uHours, weather.hours)
      gl.uniform2i(loc.uSize, grid.cols, grid.rows)
      gl.uniform4f(loc.uBox, ...grid.box); gl.uniform1f(loc.uStep, grid.step)
      gl.uniform1i(loc.uView, VIEWS[view]); gl.uniform1f(loc.uLoad, loadLb)
      gl.uniform4fv(loc.uPal, PALETTE.flat())
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },
    setHour(h) { hour = h; map?.triggerRepaint() },
    setView(v) { view = v; map?.triggerRepaint() },
  }
}
