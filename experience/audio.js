// Sound: the music (one streamed track at a time), short effects with their own pacing, the announcer,
// and your engine (a loop restarted at a new pitch when your speed moves into another band).

export class Audio {
  constructor(p0) {
    this.p0 = p0
    this.ready = false         // after the player's first key or click (browsers hold sound until then)
    this.last = new Map()
    this.track = null
    this.engineId = null
    this.engineBand = -1
    this.voiceAt = -9
  }

  unlock() { this.ready = true }

  music(name, { volume = 0.75, at = 0, loop = true } = {}) {
    if (this.track === name) return
    this.track = name
    this.p0.music.play(`assets/music/${name}.mp3`, { volume, at, loop })
  }

  stopMusic() { this.track = null; this.p0.music.stop() }

  /** An effect; gap: at least this many seconds since the last one of the same name. */
  sfx(name, { volume = 0.8, rate = 1, gap = 0.06 } = {}) {
    if (!this.ready) return
    const now = this.p0.time
    if (now - (this.last.get(name) ?? -9) < gap) return
    this.last.set(name, now)
    this.p0.sound.play(`assets/sfx/${name}.mp3`, { volume: Math.min(1, volume), rate })
  }

  voice(name, volume = 1) {
    if (!this.ready) return
    this.voiceAt = this.p0.time
    this.p0.sound.play(`assets/sfx/v_${name}.mp3`, { volume })
  }

  /** A looping effect kept on while `on` (the wind, the drift's sizzle); restarted only when its level moves
   * to another quarter. */
  loop(name, on, volume = 0.5) {
    if (!this.ready) return
    const L = this.loops ?? (this.loops = {})
    const cur = L[name] ?? (L[name] = { id: null, level: -1 })
    const level = on ? Math.max(1, Math.min(4, Math.round(volume * 4))) : -1
    if (level === cur.level) return
    const old = cur.id
    cur.level = level
    cur.id = level > 0 ? this.p0.sound.play(`assets/sfx/${name}.mp3`, { loop: true, volume: level / 4 }) : null
    if (old != null) this.p0.sound.stop(old)
  }

  /** speedK 0..1.4 (of top speed); off when on is false. */
  engine(on, speedK = 0) {
    if (!this.ready) return
    const band = on ? Math.min(6, Math.max(0, Math.round(speedK * 5))) : -1
    if (band === this.engineBand) return
    // hysteresis: only move when clearly in the next band
    if (on && this.engineBand >= 0 && Math.abs(speedK * 5 - this.engineBand) < 0.65) return
    const old = this.engineId
    this.engineBand = band
    this.engineId = band >= 0 ? this.p0.sound.play('assets/sfx/engine.mp3', { loop: true, volume: 0.32, rate: 0.75 + band * 0.12 }) : null
    if (old != null) this.p0.sound.stop(old)
  }
}
