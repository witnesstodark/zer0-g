// HYPERLANE, lot #383, from the street: sixteen machines race the course of the game inside, each four laps
// a minute. The clip is one minute long and kept on the world clock, so everyone outside sees the same race.
const LOOP = 60

export default function build(b) {
  let synced = -1e9
  b.loop((dt, time) => {
    // the clip runs by itself; every few seconds it is put back on the clock
    if (Math.abs(time - synced) > 5) {
      b.play('race', { at: time % LOOP, loop: true, fade: 0 })
      synced = time
    }
  })
}
