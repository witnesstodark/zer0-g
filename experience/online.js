// ONLINE RACE: racing the others inside the lot. Everyone inside shares one session, and the session has at most
// one lobby. Open ONLINE RACE and either create the lobby (choosing its course and class) or join the open one.
// Its owner starts it when everyone is in; then everyone picks a machine (PICK seconds, Space to lock in), and
// the race starts for all at once on the session's clock (its ticks, 20 a second). Each player flies their own
// machine and sends where it is eight times a second; the first player of the field still inside flies the AI
// rivals and sends theirs. Everyone else's machines are drawn from those messages, run on between them and eased
// onto each new one; a collision pushes only your own machine. After the race the lobby opens again.
//
// Shared state: 'lobby' { id, owner, co, c, phase: 'open' | 'pick' | 'race', until (tick), start (tick), seed,
// field } and 'in:<player id>' { n (name), m (machine, or null), e (engine), ok (locked in), at (tick: the member's
// game was running then; renewed every few seconds) }. Messages: 'r' (a player's machine), 'a' (the AI rivals),
// 'af' (an AI rival finished).
//
// A server update or a dropped connection puts everyone into a new session with new ids, sometimes with the state
// gone: each keeps their place in the lobby here and takes it back under the new id (the owner makes the lobby
// again if it is gone), and in a race tells the others the new id ('re').
//
// A lobby never gets stuck on someone who is not there: a member whose game stopped (a tab in the background, the
// game left without leaving the lobby) goes quiet, and anyone inside then hands the lobby on, ends the pick, ends
// the race or closes the lobby, as its owner would have.

export const TPS = 20                 // the session's ticks a second
export const PICK = 15                // seconds to pick a machine
export const SHOW = 7                 // seconds from the field's setting to GO: the sweep down the grid, 3, 2, 1
const SEND = 1 / 8                    // seconds between updates of your machine (and the AI's)
const SET_GAP = 0.6                   // seconds between the same change sent twice (state comes back late)
const BEAT = 4                        // seconds between a member's "still here"
const QUIET = 14                      // seconds without one: that member is away
const RACE_MAX = 240                  // seconds a race may last before its lobby opens again anyway
const OPEN_QUIET = 45                 // seconds an open lobby waits for a quiet owner (a tab in the background) before
                                      // someone who joined it may take it over

// flags of a machine's state
const ALIVE = 1, FINISHED = 2, BOOST = 4, PLATE = 8, DRIFT_R = 16, DRIFT_L = 32, RETIRED = 64, AIR = 128, SPIN = 256, WRECK = 512

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
    this.watching = false        // the ONLINE RACE screen is open here (set by the menus)
    p0.on('tick', n => { this.tick = n; this.tickAt = p0.time })
    p0.on('message', (d, from) => this.receive(d, from))
    p0.on('reconnect', () => this.reconnected())
    this.memo = null             // your place in the lobby as it was a moment ago (for a reconnect)
    this.rejoin = null           // taking it back after one
    this.gone = new Map()        // player id -> since when they have been missing from the session
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
    this.room.set(`in:${this.me}`, { n: this.myName(), m: null, e: sel.engine ?? 0.5, ok: false, at: Math.floor(this.now) })
    return true
  }

  /** Join the open lobby. */
  join(sel) {
    const L = this.lobby
    if (!L || L.phase !== 'open') return false
    this.keepAlive()
    this.room.set(`in:${this.me}`, { n: this.myName(), m: null, e: sel.engine ?? 0.5, ok: false, at: Math.floor(this.now) })
    return true
  }

  /** A member whose game is running (it said so in the last QUIET seconds). */
  active(id) { const e = this.entry(id); return !!e && (e.at ?? -1e9) > this.now - QUIET * TPS }

  /** Leave the lobby (the owner hands it to the next member, or closes it when nobody is left). */
  leave() {
    const L = this.lobby
    if (this.isMember) this.room.set(`in:${this.me}`, null)
    if (L && L.owner === this.me) {
      const next = this.members().find(m => m.pid !== this.me)
      this.room.set('lobby', next ? { ...L, owner: next.pid } : null)
    }
    this.race = null
    this.starting = false
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
    this.room.set(`in:${this.me}`, { ...e, m: machine, e: engine, ok: true, at: Math.floor(this.now) })
  }

  /** What the menus show: the lobby, its members, seconds left to pick. */
  view() {
    const L = this.lobby
    return {
      lobby: L, members: this.members().map(m => ({ ...m, away: !this.active(m.pid) })), owner: L ? this.name(L.owner) : '', left: L?.phase === 'pick' ? Math.max(0, (L.until - this.now) / TPS) : 0, mine: this.isMember, isOwner: this.isOwner, inside: this.players.length,
      // a race on: who is still flying it, and the longest it can keep the lobby closed
      racing: L?.phase === 'race' && L.field ? this.racing(L).length : 0, raceLeft: L?.phase === 'race' ? Math.max(0, (L.start + RACE_MAX * TPS - this.now) / TPS) : 0,
    }
  }

  // ------------------------------------------------------------ every frame
  update() {
    const L = this.lobby
    if (L && this.isMember) this.memo = { lobby: { ...L }, owner: L.owner === this.me, entry: { ...this.entry() }, me: this.me, at: this.p0.time }
    else if (!this.rejoin && this.p0.time - (this.memo?.at ?? -99) > 2) this.memo = null
    if (this.rejoin) this.retake()
    // the clock runs while you are in a lobby or a race, and while you look at someone else's (so a lobby left by
    // a quiet owner can be seen to be stuck and freed)
    if (this.isMember || this.race || (L && this.watching)) this.keepAlive()
    // still here: renewed every few seconds while a member
    const mine = this.entry()
    if (mine && this.live && (mine.at ?? -1e9) < this.now - BEAT * TPS) this.set(`in:${this.me}`, { ...mine, at: Math.floor(this.now) })
    this.tidy(L)
    if (L && this.isOwner) this.run(L)
    else if (L) this.unstick(L)
    if (this.race) this.applyDriver()
    // tell the game what changed for you
    const phase = L && this.isMember ? `${L.id}:${L.phase}:${L.start}` : null
    if (phase !== this.phaseSeen) {
      const was = this.phaseSeen
      this.phaseSeen = phase
      // (not when your id has just changed under you: a reconnect, and the place is taken back)
      if (!L || !this.isMember) { if (was && !this.race && !this.rejoin && !(this.memo && this.memo.me !== this.me)) { this.log(`out of the lobby (${!L ? 'it closed' : 'your entry is gone'})`); this.onGone?.() } }
      else if (L.phase === 'pick') this.onPick?.(L)
      else if (L.phase === 'race' && L.field?.some(f => f.pid === this.me) && !this.race && !this.starting) {
        this.log(`lobby ${L.id}: the race starts at tick ${L.start}`)
        this.starting = !!this.onRace?.(L)
      }
      else if (L.phase === 'open' && was) this.onOpen?.(L)
    }
    // after a race the lobby opens again: unlock your pick
    const e = this.entry()
    if (L?.phase === 'open' && e?.ok) this.set(`in:${this.me}`, { ...e, ok: false })
  }

  /** The connection came back (a server update, the network): a new session, new ids, maybe an empty state. */
  reconnected() {
    this.tick = this.room.tick ?? 0
    this.tickAt = this.p0.time
    this.sent.clear()
    this.lastInput = -9
    this.gone.clear()
    const m = this.memo
    this.log(`reconnected as ${this.me}${m ? `: taking the place in lobby ${m.lobby.id} back` : ''}`)
    if (m) this.rejoin = { ...m, since: this.p0.time, until: this.p0.time + 12 }
    // in a race: your new id in the field here, and told to the others a few times (a message can be lost)
    if (this.race && m) {
      const f = this.race.lobby.field.find(e => e.pid === m.me)
      if (f) f.pid = this.me
      this.race.oldMe = m.me
      this.race.reannounce = 4
    }
  }

  /** After a reconnect: your place under the new id; the lobby made again if it is gone (by its owner at once, by
   * anyone else in it after a moment if the owner has not). */
  retake() {
    const w = this.rejoin, L = this.lobby, now = Math.floor(this.now)
    if (this.p0.time > w.until) { this.rejoin = null; return }
    this.keepAlive()
    if (L && L.id === w.lobby.id) {
      if (!this.entry()) this.room.set(`in:${this.me}`, { ...w.entry, at: now })
      if (w.me !== this.me && this.room.state[`in:${w.me}`]) this.room.set(`in:${w.me}`, null)
      if (w.owner && L.owner !== this.me) this.room.set('lobby', { ...L, owner: this.me })
      this.log(`back in lobby ${L.id}`)
      this.rejoin = null
      if (L.phase === 'open') this.onOpen?.(L)
    } else if (!L && (w.owner || this.p0.time - w.since > 3)) {
      this.room.set('lobby', { ...w.lobby, owner: this.me, phase: 'open', field: null, until: 0 })
      this.room.set(`in:${this.me}`, { ...w.entry, ok: false, at: now })
      this.log(`lobby ${w.lobby.id} made again`)
      this.rejoin = null
      this.onOpen?.(this.lobby)
    }
  }

  /** The session's host keeps the state tidy: entries of players who left, a lobby whose owner left (after a few
   * seconds gone: the list of players can lag behind, and after a reconnect everyone comes back under new ids). */
  tidy(L) {
    if (!this.room.isHost) return
    const ids = new Set(this.players)
    if (!ids.has(this.me)) return                   // the list is not this session's yet
    const t = this.p0.time
    const away = id => {
      if (ids.has(id)) { this.gone.delete(id); return false }
      if (!this.gone.has(id)) this.gone.set(id, t)
      return t - this.gone.get(id) > 6
    }
    for (const k of Object.keys(this.room.state)) {
      if (k.startsWith('in:') && this.room.state[k] && away(Number(k.slice(3)))) { this.log(`${k} cleared: not in the lot`); this.set(k, null) }
    }
    if (L && away(L.owner)) {
      const next = this.members()[0]
      this.log(`lobby ${L.id}: its owner ${L.owner} left the lot, ${next ? `handed to ${next.pid}` : 'closed'}`)
      this.set('lobby', next ? { ...L, owner: next.pid } : null)
    }
  }

  /** The players of a race still flying it: in the lot, in the lobby, their game running, not finished. */
  racing(L) {
    const ids = new Set(this.players)
    return L.field.filter(f => ids.has(f.pid) && this.active(f.pid) && !this.room.state[`done:${L.start}:${f.pid}`])
  }

  /** The owner runs the lobby: from picking to the race, and back to open when the race is over. */
  run(L, grace = 0) {
    const now = this.now
    const members = this.members().filter(m => this.active(m.pid))
    if (L.phase === 'pick') {
      if (!this.live) return
      // once per pick (the state comes back a frame or two later: written again, the start would differ by a tick
      // and the players' messages, keyed by it, would miss each other)
      if (this.raceSet === `${L.id}:${L.until}`) return
      if (members.length && (members.every(m => m.ok) || now >= L.until + TPS * (1 + grace))) {
        this.raceSet = `${L.id}:${L.until}`
        this.log(`lobby ${L.id}: everyone picked, the race is set`)
        this.set('lobby', { ...L, phase: 'race', start: Math.floor(now + SHOW * TPS), field: members.map(m => ({ pid: m.pid, m: m.m ?? 0, e: m.e ?? 0.5, n: m.n })) })
      }
    } else if (L.phase === 'race' && L.field) {
      // over when every player in it has finished, retired or gone, or after four minutes
      if ((!this.racing(L).length && now > L.start + grace * TPS) || now > L.start + (RACE_MAX + grace) * TPS) {
        this.log(`lobby ${L.id}: the race is over, the lobby opens again`)
        this.set('lobby', { ...L, phase: 'open', field: null, until: 0 })
        for (const f of L.field) this.set(`done:${L.start}:${f.pid}`, null)
      }
    }
  }

  /**
   * The owner alone runs a lobby (two writers raced each other: two start times, the race begun twice). Only when
   * the owner has gone quiet does anyone else touch it, and then all the same way: it goes to the first member
   * still here (who runs it from then on), or closes when nobody in it is.
   */
  unstick(L) {
    if (!this.live || this.now - L.id < 6 * TPS) return       // a lobby just made: its members may not have arrived yet
    if (this.active(L.owner)) return
    const here = this.members().filter(m => this.active(m.pid))
    // an open lobby is never closed for a quiet owner (their tab may only be in the background, waiting): someone
    // who joined it may take it over after a long quiet, so that they can start it
    if (L.phase === 'open') {
      const e = this.entry(L.owner), quiet = e ? (this.now - (e.at ?? -1e9)) / TPS : Infinity
      if (!here.length || quiet < OPEN_QUIET) return
    } else if (!here.length) { this.log(`lobby ${L.id} closed: nobody in it is here`); this.set('lobby', null); return }
    this.log(`lobby ${L.id}: its owner ${L.owner} went quiet, handed to ${here[0].pid}`)
    this.set('lobby', { ...L, owner: here[0].pid })
  }

  log(text) { if (this.p0.time - (this.logged?.[text] ?? -99) > 5) { (this.logged ??= {})[text] = this.p0.time; this.p0.log(`[online] ${text}`) } }

  /** You finished or retired: the owner can open the lobby again when everyone has. */
  done() {
    const L = this.race?.lobby
    if (L) this.room.set(`done:${L.start}:${this.me}`, 1)
  }

  // ------------------------------------------------------------ the race
  /** Start flying an online race: racers in field order (players first, then the AI rivals). */
  begin(lobby, racers, me) {
    this.starting = false
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
    if (R.reannounce > 0) { R.reannounce--; this.room.send({ t: 're', g, old: R.oldMe }) }
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
    // a player reconnected (a new id): their machine is theirs again under it, here and in the lobby
    if (d.t === 're') {
      const f = R.lobby.field.find(e => e.pid === d.old)
      if (f) { f.pid = from; this.log(`player ${d.old} is ${from} now`) }
      const L = this.lobby
      if (L && this.isOwner && L.phase === 'race' && L.start === g0(R) && L.field?.some(e => e.pid === d.old)) this.room.set('lobby', { ...L, field: L.field.map(e => e.pid === d.old ? { ...e, pid: from } : e) })
      return
    }
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

/** What to do when another screen's machine is wrecked (fn(racer, last)): the game shows the blast. */
export function onRemoteWreck(fn) { setFlags.onWreck = fn }

const g0 = R => R.lobby.start

function flags(r) {
  return (r.alive ? ALIVE : 0) | (r.finished ? FINISHED : 0) | (r.boostT > 0 ? BOOST : 0) | (r.dashT > 0 || r.turbo > 0 ? PLATE : 0) |
    (r.drift > 0 ? DRIFT_R : 0) | (r.drift < 0 ? DRIFT_L : 0) | (r.retired ? RETIRED : 0) | (r.air ? AIR : 0) | (r.spinT > 0 ? SPIN : 0) |
    (r.wreckT > 0 ? WRECK : 0)
}

function setFlags(r, f) {
  // a wreck seen on another screen: the blast once, the machine gone until its spare comes out
  const wrecked = !!(f & WRECK)
  if ((wrecked && !(r.wreckT > 0)) || (!(f & ALIVE) && r.alive && (f & RETIRED))) setFlags.onWreck?.(r, !wrecked)
  r.wreckT = wrecked ? 1 : 0
  r.alive = !!(f & ALIVE)
  r.finished = !!(f & FINISHED)
  r.retired = !!(f & RETIRED)
  r.boostT = f & BOOST ? 0.3 : 0
  r.dashT = f & PLATE ? 0.3 : 0
  r.drift = f & DRIFT_R ? 1 : f & DRIFT_L ? -1 : 0
  r.driftT = r.drift ? (r.driftT ?? 0) + 0.12 : 0
  r.spinT = f & SPIN ? 0.3 : 0
}
