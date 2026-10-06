// ONLINE RACE: racing the others inside the lot. Everyone inside shares one session, and the session has at most
// one lobby. Open ONLINE RACE and either create the lobby (choosing its course and class) or join the open one.
// Its owner starts it when everyone is in; then everyone picks a machine (PICK seconds, Space to lock in), and
// the race starts for all at once on the session's clock (its ticks, 20 a second). Each player flies their own
// machine and sends where it is eight times a second; the first player of the field still inside flies the AI
// rivals and sends theirs. Everyone else's machines are drawn from those messages, run on between them and eased
// onto each new one; a collision pushes only your own machine. After the race the lobby opens again.
//
// Shared state: 'lobby' { id, owner, co, c, phase: 'open' | 'pick' | 'race', until (tick), start (tick), seed,
// field } and 'in:<player id>' { n (name), m (machine, or null), e (engine), ok (locked in) }. Messages: 'r' (a
// player's machine), 'a' (the AI rivals), 'af' (an AI rival finished).

export const TPS = 20                 // the session's ticks a second
export const PICK = 15                // seconds to pick a machine
export const SHOW = 7                 // seconds from the field's setting to GO: the sweep down the grid, 3, 2, 1
const SEND = 1 / 8                    // seconds between updates of your machine (and the AI's)
const SET_GAP = 0.6                   // seconds between the same change sent twice (state comes back late)

// flags of a machine's state
const ALIVE = 1, FINISHED = 2, BOOST = 4, PLATE = 8, DRIFT_R = 16, DRIFT_L = 32, RETIRED = 64, AIR = 128, SPIN = 256

const q = (v, k) => Math.round(v * k)

export class Online {
  constructor(p0) {
    this.p0 = p0
    this.room = p0.room
    this.tick = this.room.tick ?? 0
    this.tickAt = p0.time
    this.lastInput = -9
    this.lastSend = 0
    this.sent = new Map()        // key -> time it was last set (so a change is not sent every frame)
    this.race = null             // the online race being flown here: { lobby, racers, me }
    this.phaseSeen = null
    this.onPick = null           // (lobby) => void: the owner started it: pick a machine
    this.onRace = null           // (lobby) => void: the field is set with you in it: the race begins
    this.onOpen = null           // (lobby) => void: the lobby is open again (after a race)
    this.onGone = null           // () => void: the lobby you were in is gone
    p0.on('tick', n => { this.tick = n; this.tickAt = p0.time })
    p0.on('message', (d, from) => this.receive(d, from))
    // an entry of yours left in the session from before (you left without leaving the lobby): clear it, so you
    // are never pulled into a race you did not ask for
    if (this.room.state[`in:${this.me}`]) this.room.set(`in:${this.me}`, null)
  }

  /** The session's clock in ticks (between ticks it runs on by itself, a little). */
  get now() { return this.tick + Math.min(this.p0.time - this.tickAt, 0.25) * TPS }
  /** Ticks are arriving (someone keeps the clock running). */
  get live() { return this.p0.time - this.tickAt < 0.5 }
  get me() { return this.p0.me.id }
  get players() { return this.room.players ?? [this.me] }
  get lobby() { return this.room.state.lobby ?? null }
  get isOwner() { return this.lobby?.owner === this.me }
  entry(id = this.me) { return this.room.state[`in:${id}`] ?? null }
  get isMember() { return !!this.entry() }
  name(id) { return this.entry(id)?.n ?? (this.p0.players?.get?.(id)?.name ?? 'PLAYER') }

  /** The lobby's members inside the lot, in the order they joined (their ids). */
  members() {
    const ids = new Set(this.players)
    return Object.entries(this.room.state)
      .filter(([k, v]) => k.startsWith('in:') && v && ids.has(Number(k.slice(3))))
      .map(([k, v]) => ({ pid: Number(k.slice(3)), ...v }))
      .sort((a, b) => a.pid - b.pid)
  }

  /** A change to shared state, at most once per SET_GAP for the same key and value. */
  set(key, value) {
    const sig = key + JSON.stringify(value)
    if (this.p0.time - (this.sent.get(sig) ?? -9) < SET_GAP) return
    this.sent.set(sig, this.p0.time)
    this.room.set(key, value)
  }

  /** Everyone in a lobby keeps the session's clock running (it stops 5 s after the last input). */
  keepAlive() {
    if (this.p0.time - this.lastInput > 1) { this.lastInput = this.p0.time; this.room.input(1) }
  }

  myName() { return String(this.p0.me.name ?? 'PLAYER').toUpperCase().slice(0, 16) }

  // ------------------------------------------------------------ the lobby
  /** Open a lobby (when none is open) on a course and class; you own it. */
  create(sel) {
    if (this.lobby) return false
    this.keepAlive()
    this.room.set('lobby', { id: Math.floor(this.now) + 1, owner: this.me, co: sel.course ?? 0, c: sel.cls ?? 1, phase: 'open', until: 0, start: 0, seed: Math.floor(Math.random() * 1e9), field: null })
    this.room.set(`in:${this.me}`, { n: this.myName(), m: null, e: sel.engine ?? 0.5, ok: false })
    return true
  }

  /** Join the open lobby. */
  join(sel) {
    const L = this.lobby
    if (!L || L.phase !== 'open') return false
    this.keepAlive()
    this.room.set(`in:${this.me}`, { n: this.myName(), m: null, e: sel.engine ?? 0.5, ok: false })
    return true
  }

  /** Leave the lobby (the owner hands it to the next member, or closes it when nobody is left). */
  leave() {
    const L = this.lobby
    if (this.isMember) this.room.set(`in:${this.me}`, null)
    if (L && L.owner === this.me) {
      const next = this.members().find(m => m.pid !== this.me)
      this.room.set('lobby', next ? { ...L, owner: next.pid } : null)
    }
    this.race = null
  }

  /** The owner starts it: everyone picks a machine. */
  start() {
    const L = this.lobby
    if (!L || !this.isOwner || L.phase !== 'open') return
    this.keepAlive()
    this.room.set('lobby', { ...L, phase: 'pick', until: Math.floor(this.now + PICK * TPS) })
  }

  /** Lock in a machine. */
  pick(machine, engine) {
    const e = this.entry()
    if (!e) return
    this.room.set(`in:${this.me}`, { ...e, m: machine, e: engine, ok: true })
  }

  /** What the menus show: the lobby, its members, seconds left to pick. */
  view() {
    const L = this.lobby
    return { lobby: L, members: this.members(), owner: L ? this.name(L.owner) : '', left: L?.phase === 'pick' ? Math.max(0, (L.until - this.now) / TPS) : 0, mine: this.isMember, isOwner: this.isOwner, inside: this.players.length }
  }

  // ------------------------------------------------------------ every frame
  update() {
    const L = this.lobby
    if (this.isMember || this.race) this.keepAlive()
    this.tidy(L)
    if (L && this.isOwner) this.run(L)
    if (this.race) this.applyDriver()
    // tell the game what changed for you
    const phase = L && this.isMember ? `${L.id}:${L.phase}:${L.start}` : null
    if (phase !== this.phaseSeen) {
      const was = this.phaseSeen
      this.phaseSeen = phase
      if (!L || !this.isMember) { if (was && !this.race) this.onGone?.() }
      else if (L.phase === 'pick') this.onPick?.(L)
      else if (L.phase === 'race' && L.field?.some(f => f.pid === this.me) && !this.race) this.onRace?.(L)
      else if (L.phase === 'open' && was) this.onOpen?.(L)
    }
    // after a race the lobby opens again: unlock your pick
    const e = this.entry()
    if (L?.phase === 'open' && e?.ok) this.set(`in:${this.me}`, { ...e, ok: false })
  }

  /** The session's host keeps the state tidy: entries of players who left, a lobby whose owner left. */
  tidy(L) {
    if (!this.room.isHost) return
    const ids = new Set(this.players)
    for (const k of Object.keys(this.room.state)) {
      if (k.startsWith('in:') && this.room.state[k] && !ids.has(Number(k.slice(3)))) this.set(k, null)
    }
    if (L && !ids.has(L.owner)) {
      const next = this.members()[0]
      this.set('lobby', next ? { ...L, owner: next.pid } : null)
    }
  }

  /** The owner runs the lobby: from picking to the race, and back to open when the race is over. */
  run(L) {
    const now = this.now
    const members = this.members()
    if (L.phase === 'pick') {
      if (!this.live) return
      if (members.length && (members.every(m => m.ok) || now >= L.until + TPS)) {
        this.set('lobby', { ...L, phase: 'race', start: Math.floor(now + SHOW * TPS), field: members.map(m => ({ pid: m.pid, m: m.m ?? 0, e: m.e ?? 0.5, n: m.n })) })
      }
    } else if (L.phase === 'race' && L.field) {
      // over when every player in it has finished, retired or gone, or after four minutes
      const ids = new Set(this.players)
      const racing = L.field.filter(f => ids.has(f.pid) && this.entry(f.pid) && !this.room.state[`done:${L.start}:${f.pid}`])
      if (!racing.length || now > L.start + 240 * TPS) {
        this.set('lobby', { ...L, phase: 'open', field: null, until: 0 })
        for (const f of L.field) this.set(`done:${L.start}:${f.pid}`, null)
      }
    }
  }

  /** You finished or retired: the owner can open the lobby again when everyone has. */
  done() {
    const L = this.race?.lobby
    if (L) this.room.set(`done:${L.start}:${this.me}`, 1)
  }

  // ------------------------------------------------------------ the race
  /** Start flying an online race: racers in field order (players first, then the AI rivals). */
  begin(lobby, racers, me) {
    this.race = { lobby, racers, me, aiFrom: lobby.field.length, sentFinish: new Set() }
    this.applyDriver()
  }

  /** The AI rivals are flown by the first player of the field still inside; everyone else draws them. */
  get isDriver() {
    const R = this.race
    if (!R) return false
    const ids = new Set(this.players)
    const first = R.lobby.field.find(f => ids.has(f.pid))
    return first?.pid === this.me
  }

  applyDriver() {
    const R = this.race
    if (!R) return
    const drive = this.isDriver
    if (drive === R.driving) return
    R.driving = drive
    R.racers.forEach((r, i) => {
      if (i < R.aiFrom) return
      const was = r.remote
      r.remote = !drive
      if (was && !r.remote) r.net = null
    })
  }

  /** Send your machine (and the driver the AI's) at most eight times a second. */
  send() {
    const R = this.race
    if (!R || this.p0.time - this.lastSend < SEND) return
    this.lastSend = this.p0.time
    const m = R.me, g = R.lobby.start
    this.room.send({ t: 'r', g, s: [q(m.D, 100), q(m.x, 1000), q(m.h, 100), q(m.sp, 100), q(m.psi, 1000), q(m.phi, 1000), q(m.vh, 100), flags(m), m.lap, q(m.finishTime, 1000)] })
    if (R.driving) {
      const s = []
      for (let i = R.aiFrom; i < R.racers.length; i++) {
        const r = R.racers[i]
        s.push(q(r.D, 50), q(r.x, 500), q(r.h, 50), q(r.sp, 50), q(r.psi, 500), flags(r))
        if (r.finished && !R.sentFinish.has(i)) { R.sentFinish.add(i); this.room.send({ t: 'af', g, i, ft: q(r.finishTime, 1000) }) }
      }
      this.room.send({ t: 'a', g, s })
    }
  }

  receive(d, from) {
    const R = this.race
    if (!R || !d || d.g !== R.lobby.start) return
    const now = this.p0.time
    if (d.t === 'r') {
      const k = R.lobby.field.findIndex(e => e.pid === from)
      const r = R.racers[k]
      if (!r || r === R.me) return
      const s = d.s
      r.net = { D: s[0] / 100, x: s[1] / 1000, h: s[2] / 100, sp: s[3] / 100, psi: s[4] / 1000, phi: s[5] / 1000, vh: s[6] / 100, at: now }
      setFlags(r, s[7])
      r.lap = s[8]
      if (s[7] & FINISHED) r.finishTime = s[9] / 1000
    } else if (d.t === 'a' && !R.driving) {
      const s = d.s
      for (let j = 0, i = R.aiFrom; j + 5 < s.length + 1 && i < R.racers.length; j += 6, i++) {
        const r = R.racers[i]
        r.net = { D: s[j] / 50, x: s[j + 1] / 500, h: s[j + 2] / 50, sp: s[j + 3] / 50, psi: s[j + 4] / 500, phi: s[j + 4] / 500, vh: 0, at: now }
        setFlags(r, s[j + 5])
      }
    } else if (d.t === 'af' && !R.driving) {
      const r = R.racers[d.i]
      if (r) { r.finished = true; r.finishTime = d.ft / 1000 }
    }
  }

  /** Draw the others where their last message puts them now: run on, eased onto it. */
  steer(dt) {
    const R = this.race
    if (!R) return
    const now = this.p0.time
    const k = Math.min(1, dt * 8)
    for (const r of R.racers) {
      if (!r.remote || !r.net) continue
      const n = r.net
      const age = Math.min(0.5, now - n.at)
      const D = n.D + n.sp * Math.cos(n.phi) * age
      if (Math.abs(D - r.D) > 4) { r.D = D; r.x = n.x; r.h = n.h } else {
        r.D += (D - r.D) * k
        r.x += (n.x - r.x) * k
        r.h += (Math.max(0, n.h + n.vh * age) - r.h) * k
      }
      r.D = Math.max(r.D, n.D - 0.5)
      r.psi += (n.psi - r.psi) * k
      r.phi = r.psi
      r.sp = n.sp
      r.air = r.h > 0.02
      r.steerVis += ((r.drift ? r.drift * 0.6 : 0) - r.steerVis) * k
      r.driftVis = (r.driftVis ?? 0) + ((r.drift ? r.drift * 0.35 : 0) - (r.driftVis ?? 0)) * k
      r.throttleVis += ((r.alive && !r.finished ? 1 : 0.2) + (r.boostT > 0 ? 1 : 0) - r.throttleVis) * k
    }
  }
}

function flags(r) {
  return (r.alive ? ALIVE : 0) | (r.finished ? FINISHED : 0) | (r.boostT > 0 ? BOOST : 0) | (r.dashT > 0 || r.turbo > 0 ? PLATE : 0) |
    (r.drift > 0 ? DRIFT_R : 0) | (r.drift < 0 ? DRIFT_L : 0) | (r.retired ? RETIRED : 0) | (r.air ? AIR : 0) | (r.spinT > 0 ? SPIN : 0)
}

function setFlags(r, f) {
  r.alive = !!(f & ALIVE)
  r.finished = !!(f & FINISHED)
  r.retired = !!(f & RETIRED)
  r.boostT = f & BOOST ? 0.3 : 0
  r.dashT = f & PLATE ? 0.3 : 0
  r.drift = f & DRIFT_R ? 1 : f & DRIFT_L ? -1 : 0
  r.driftT = r.drift ? (r.driftT ?? 0) + 0.12 : 0
  r.spinT = f & SPIN ? 0.3 : 0
}
