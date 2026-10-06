// Where a course leaves room for the world round it. The road's samples (across its width, and the space a machine
// and the chase camera take above it) go into a grid over the lot, and a box is asked whether it comes near any of
// them. The stands, the screens, the ribbons and the frame of the arena are placed with it, so a longer or wider
// course cuts them back instead of running through them; the director keeps its cameras out of what stands there.

export class Clearance {
  /** track: a built Track; above: how much room over the road (metres, along its up). */
  constructor(track, { cell = 1, above = 2.4 } = {}) {
    const t = track
    this.cell = cell
    this.grid = new Map()
    const hw = t.width / 2 + 0.3
    for (let i = 0; i < t.n; i += 2) {
      const j = i * 3
      for (const a of [-1, -0.5, 0, 0.5, 1]) {
        for (const h of [0, 0.5, 1]) {
          const x = t.P[j] + t.R[j] * a * hw + t.U[j] * h * above
          const y = t.P[j + 1] + t.R[j + 1] * a * hw + t.U[j + 1] * h * above
          const z = t.P[j + 2] + t.R[j + 2] * a * hw + t.U[j + 2] * h * above
          const key = this.key(Math.floor(x / cell), Math.floor(z / cell))
          let list = this.grid.get(key)
          if (!list) this.grid.set(key, list = [])
          list.push(x, y, z)
        }
      }
    }
  }

  key(ix, iz) { return (ix + 512) * 1024 + iz + 512 }

  /** Does the box [x0, x1] x [y0, y1] x [z0, z1], grown by pad on every side, come near the road? */
  hits(x0, x1, y0, y1, z0, z1, pad = 0.5) {
    const c = this.cell
    x0 -= pad; x1 += pad; y0 -= pad; y1 += pad; z0 -= pad; z1 += pad
    for (let ix = Math.floor(x0 / c); ix <= Math.floor(x1 / c); ix++) {
      for (let iz = Math.floor(z0 / c); iz <= Math.floor(z1 / c); iz++) {
        const list = this.grid.get(this.key(ix, iz))
        if (!list) continue
        for (let k = 0; k < list.length; k += 3) {
          const x = list[k], y = list[k + 1], z = list[k + 2]
          if (x >= x0 && x <= x1 && y >= y0 && y <= y1 && z >= z0 && z <= z1) return true
        }
      }
    }
    return false
  }
}

/**
 * The stands along the lot's long sides, cut back where the course runs through them. Tier k (from the inside out)
 * stands at side * (x0 + k * step), w wide and h0 + k * dh high, chunk by chunk along z; a chunk the road (or the
 * room over it, or the crowd on top) would touch is left out, and runs shorter than min chunks go too.
 * Returns { tiers: [{ side, k, x, z0, z1, h }], fronts: [{ side, x, z0, z1 }] }: the runs of each tier and the line
 * along the stands' fronts (for the sponsor boards).
 */
export function standRuns(clear, { x0 = 11.6, step = 0.7, w = 0.75, h0 = 0.8, dh = 1.1, count = 6, z0 = -17.5, z1 = 17.5, chunk = 1, crowd = 0.7, min = 2 } = {}) {
  const n = Math.round((z1 - z0) / chunk)
  const tiers = [], fronts = []
  for (const side of [-1, 1]) {
    const keep = []
    for (let k = 0; k < count; k++) {
      const x = side * (x0 + k * step), h = h0 + k * dh
      const row = []
      for (let j = 0; j < n; j++) row.push(!clear.hits(x - w / 2, x + w / 2, 0, h + crowd, z0 + j * chunk, z0 + (j + 1) * chunk, 0.5))
      // no slivers: a run shorter than min chunks is left out
      for (let j = 0; j < n;) {
        if (!row[j]) { j++; continue }
        let e = j
        while (e < n && row[e]) e++
        if (e - j < min) for (let q = j; q < e; q++) row[q] = false
        else tiers.push({ side, k, x, z0: z0 + j * chunk, z1: z0 + e * chunk, h })
        j = e
      }
      keep.push(row)
    }
    // the fronts: chunk by chunk, the innermost tier still standing
    let run = null
    for (let j = 0; j <= n; j++) {
      const k = j < n ? keep.findIndex(row => row[j]) : -1
      const x = k < 0 ? null : side * (x0 + k * step - w / 2 - 0.03)
      if (run && run.x === x) { run.z1 = z0 + (j + 1) * chunk; continue }
      if (run) fronts.push(run)
      run = x === null ? null : { side, x, z0: z0 + j * chunk, z1: z0 + (j + 1) * chunk }
    }
  }
  return { tiers, fronts: fronts.filter(f => f.z1 - f.z0 >= min * chunk) }
}

/** Seats for n of the crowd over the tiers' runs (by their length): [x, y, z] on each run's step, beside its nose. */
export function crowdSeats(tiers, n, random, { lift = 0.35 } = {}) {
  const total = tiers.reduce((a, t) => a + t.z1 - t.z0, 0)
  const seats = []
  if (!total) return seats
  for (let i = 0; i < n; i++) {
    let r = random() * total, t = tiers[0]
    for (const q of tiers) { t = q; if ((r -= q.z1 - q.z0) <= 0) break }
    // on the step itself: from its nose to just before the next tier up
    seats.push([t.x + t.side * (-0.3 + random() * 0.55), t.h + lift, t.z0 + 0.2 + random() * (t.z1 - t.z0 - 0.4)])
  }
  return seats
}

/**
 * A sponsor ribbon round the arena's walls at y (h high), broken where the course comes near: open pieces, each
 * running the same way round as the whole, so their faces still look inwards. Returns [[x, z], ...] paths.
 */
export function wallPaths(clear, corners, y, h, { piece = 1, min = 3 } = {}) {
  const paths = []
  let path = null
  for (let c = 0; c < corners.length; c++) {
    const [ax, az] = corners[c], [bx, bz] = corners[(c + 1) % corners.length]
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / piece))
    for (let k = 0; k < n; k++) {
      const p = [ax + (bx - ax) * k / n, az + (bz - az) * k / n], q = [ax + (bx - ax) * (k + 1) / n, az + (bz - az) * (k + 1) / n]
      const free = !clear.hits(Math.min(p[0], q[0]) - 0.2, Math.max(p[0], q[0]) + 0.2, y, y + h, Math.min(p[1], q[1]) - 0.2, Math.max(p[1], q[1]) + 0.2, 0.4)
      if (free) {
        if (!path) path = [p]
        path.push(q)
      } else if (path) { paths.push(path); path = null }
    }
  }
  if (path) paths.push(path)
  // the first and last pieces join round the corner where the loop closes
  if (paths.length > 1) {
    const a = paths[0], b = paths[paths.length - 1]
    if (a[0][0] === b[b.length - 1][0] && a[0][1] === b[b.length - 1][1]) { paths[0] = [...b, ...a.slice(1)]; paths.pop() }
  }
  return paths.filter(p => {
    let len = 0
    for (let i = 1; i < p.length; i++) len += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])
    return len >= min
  })
}

/**
 * Somewhere for a screen of w x h facing in from a wall: the first of the candidate centres [x, y, z] (with the
 * screen's run along the wall, 'x' or 'z') whose box keeps clear of the course, or null.
 */
export function placeScreen(clear, candidates, w, h, along, depth = 0.6) {
  for (const [x, y, z] of candidates) {
    const hx = along === 'x' ? w / 2 + 0.3 : depth, hz = along === 'z' ? w / 2 + 0.3 : depth
    if (!clear.hits(x - hx, x + hx, y - h / 2 - 0.3, y + h / 2 + 0.3, z - hz, z + hz, 0.5)) return [x, y, z]
  }
  return null
}

/**
 * The arena's screens: two big ones over the ends, four along the long walls (as first laid out), each moved along
 * its wall or up and down until it keeps clear of the course, or left out. put(w, x, y, z, rotY, offset).
 */
export function placeScreens(clear, L, put, { sides = [[7, 1, 15, -12, 9.3], [6, 1, 11.6, 14.5, 21.7], [10, -1, 15, 8, 4.1], [9, -1, 21.5, -10, 15.2]] } = {}) {
  const top = L.height - 2
  for (const end of [-1, 1]) {
    const z = end * (L.depth / 2 - 0.6), w = 16
    const cands = []
    for (const y of [19, 21.5, 16.5, 14]) for (const x of [0, -3, 3]) cands.push([x, y, z])
    let at = placeScreen(clear, cands.filter(c => c[1] + w * 9 / 32 < top), w, w * 9 / 16, 'x')
    if (at) { put(w, at[0], at[1], at[2], end < 0 ? 0 : Math.PI, 0); continue }
    // a smaller one, then
    const w2 = 10
    const c2 = []
    for (const y of [20, 16, 12, 23]) for (const x of [0, -4, 4]) c2.push([x, y, z])
    at = placeScreen(clear, c2, w2, w2 * 9 / 16, 'x')
    if (at) put(w2, at[0], at[1], at[2], end < 0 ? 0 : Math.PI, 0)
  }
  for (const [w, side, y, z, offset] of sides) {
    const x = side * (L.width / 2 - 0.6), h = w * 9 / 16
    const cands = []
    for (const dy of [0, 3, -3, 6, -6]) for (const dz of [0, 3, -3, 6, -6]) {
      const cy = y + dy, cz = z + dz
      if (cy - h / 2 < 1 || cy + h / 2 > top || Math.abs(cz) + w / 2 > L.depth / 2 - 1) continue
      cands.push([x, cy, cz])
    }
    const at = placeScreen(clear, cands, w, h, 'z')
    if (at) put(w, at[0], at[1], at[2], side > 0 ? -Math.PI / 2 : Math.PI / 2, offset)
  }
}

/** The title in lights on the east wall: where it keeps clear (or null). */
export function placeLogo(clear, L, w, h) {
  const x = L.width / 2 - 0.6, cands = []
  for (const y of [10.5, 13.5, 7.5, 16.5, 19.5]) for (const z of [6, 2, -2, 10, -6]) cands.push([x, y, z])
  return placeScreen(clear, cands, w, h, 'z', 0.3)
}
