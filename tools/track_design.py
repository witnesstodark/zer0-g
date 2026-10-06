"""HYPERLANE's track, designed as a turtle path of pieces (straight, banked turn, helix, ramp, loop,
corkscrew, jump) inside lot #383's box (32 x 44 x 29 m), closed with a smooth connector, then checked:
inside the box with room for the camera, no part of the track closer than CLEAR metres to another part.
Writes the centreline with its frames (every 0.25 m) and the features (pit, dash plates, jump) as JSON for
the game, and top and side views as an image.

python track_design.py <out.json> <out.png> [neon|pipe|drum]
Pieces: straight, turn (banked, climbing, a helix past 360), ramp, loop, corkscrew, ribbon, tube (the road curls
up into a pipe you can ride all the way round, inside), drum (the road bends down round a cylinder you ride
outside; it goes on from a line round its side), and flags: open (no barriers), gap (no road).
Lot frame: x across (width 32), z along (depth 44), y up; the origin is the middle of the lot's floor.
"""
import sys, json, math
import numpy as np
from PIL import Image, ImageDraw

STEP = 0.25
WIDTH = 3.2                 # the road (crafts are about 0.9 m long)
BOX = dict(x=13.2, z=19.2, y0=1.0, y1=25.5)   # where the centreline may go (the camera needs room)
CLEAR = 3.4                 # metres between parts of the track that are not neighbours along it (the road
                            # is 3.2 m: a loop's way in and way out may run side by side)


def rot(v, axis, ang):
    """Rodrigues: v turned about a unit axis."""
    axis = axis / np.linalg.norm(axis)
    return v * math.cos(ang) + np.cross(axis, v) * math.sin(ang) + axis * np.dot(axis, v) * (1 - math.cos(ang))


def smooth(t):
    return t * t * (3 - 2 * t)


BANK_IN = 4.0   # metres over which a turn's bank rolls in (and out)
EASE = 0.25     # share of a climbing turn at each end where the slope eases in or out


def ease_slope(t):
    """The slope's profile along a climbing turn (0 at both ends, 1 in the middle), scaled so it integrates to 1."""
    k = min(1.0, t / EASE, (1 - t) / EASE)
    return smooth(max(0.0, k)) / (1 - EASE)


def ease_climb(t, n=200):
    """The climb so far: the integral of ease_slope from 0 to t."""
    ts = np.linspace(0, t, n + 1)
    return float(np.trapezoid([ease_slope(x) for x in ts], ts)) if t > 0 else 0.0


class Turtle:
    def __init__(self, p, f):
        self.p = np.array(p, float)
        self.f = np.array(f, float) / np.linalg.norm(f)
        self.u = np.array([0.0, 1.0, 0.0])
        self.bank = 0.0
        self.kappa = 0.0        # the cross-section's curvature (1/m): + a pipe, - a drum
        self.half = WIDTH / 2   # how far the road reaches either side, along its surface
        self.pts = []           # (pos, forward, up, bank, flags, kappa, half)
        self.features = []
        self.seams = []         # (s, shift): where the road goes on from another line round a drum
        self.s = 0.0
        self.emit(set())

    def emit(self, flags):
        self.pts.append((self.p.copy(), self.f.copy(), self.u.copy(), self.bank, set(flags), self.kappa, self.half))

    def left(self):
        return np.cross(self.u, self.f)

    def _advance(self, d, flags):
        self.p = self.p + self.f * d
        self.s += d
        self.emit(flags)

    def straight(self, length, flags=(), bank_to=None):
        n = max(1, int(round(length / STEP)))
        b0 = self.bank
        for i in range(n):
            if bank_to is not None:
                self.bank = b0 + (bank_to - b0) * smooth((i + 1) / n)
            self._advance(length / n, flags)
        return self

    def turn(self, radius, angle_deg, bank_deg=0.0, climb=0.0, flags=()):
        """A turn about the world's up (positive angle: to the driver's right), banked into the turn in its
        middle, rising `climb` (a helix when the angle goes past 360). The climb eases in and out over the
        first and last quarter, so the road is level where the turn meets the pieces before and after it."""
        ang = -math.radians(angle_deg)          # rotation about +y: positive turns a +z heading towards +x (left)
        length = abs(ang) * radius
        n = max(2, int(round(length / STEP)))
        b0 = self.bank
        bmax = math.radians(bank_deg) * (1 if angle_deg > 0 else -1)    # roll into the turn
        f_flat = self.f.copy(); f_flat[1] = 0; f_flat /= np.linalg.norm(f_flat)
        y0 = self.p[1]
        for i in range(n):
            t = (i + 1) / n
            f_flat = rot(f_flat, np.array([0, 1.0, 0]), ang / n)
            y = y0 + climb * ease_climb(t)
            slope = climb * ease_slope(t) / length
            f = f_flat + np.array([0, slope, 0]); f /= np.linalg.norm(f)
            step = length / n
            self.p = np.array([self.p[0] + f_flat[0] * step, y, self.p[2] + f_flat[2] * step])
            self.s += step * math.sqrt(1 + slope * slope)
            self.f = f
            self.u = np.array([0, 1.0, 0]) - f * f[1]; self.u /= np.linalg.norm(self.u)
            # bank: rolls in over the first BANK_IN metres, holds, rolls out over the last ones
            d0, d1 = t * length, (1 - t) * length
            roll = smooth(min(1.0, d0 / BANK_IN, d1 / BANK_IN))
            self.bank = b0 * (1 - smooth(min(1.0, d0 / BANK_IN))) + bmax * roll
            self.emit(flags)
        self.bank = 0.0
        return self

    def ramp(self, length, dy, flags=()):
        """Straight on, rising (or falling) dy, level at both ends (a smooth S in the vertical plane)."""
        n = max(2, int(round(length / STEP)))
        f_flat = self.f.copy(); f_flat[1] = 0; f_flat /= np.linalg.norm(f_flat)
        y0 = self.p[1]
        for i in range(n):
            t = (i + 1) / n
            y = y0 + dy * smooth(t)
            dydt = dy * 6 * t * (1 - t) / length
            f = f_flat + np.array([0, dydt, 0]); f /= np.linalg.norm(f)
            self.p = np.array([self.p[0] + f_flat[0] * length / n, y, self.p[2] + f_flat[2] * length / n])
            self.s += length / n * math.sqrt(1 + dydt * dydt)
            self.f = f
            self.u = np.array([0, 1.0, 0]) - f * f[1]; self.u /= np.linalg.norm(self.u)
            self.emit(flags)
        return self

    def loop(self, radius, side_shift):
        """A vertical loop (up and over, inside), drifting sideways by side_shift so it does not meet itself."""
        n = int(round(2 * math.pi * radius / STEP))
        f0 = self.f.copy(); f0[1] = 0; f0 /= np.linalg.norm(f0)
        up = np.array([0, 1.0, 0])
        side = np.cross(up, f0)                         # left
        c = self.p + up * radius
        for i in range(n):
            t = (i + 1) / n
            a = 2 * math.pi * t
            pos = c - up * radius * math.cos(a) + f0 * radius * math.sin(a) + side * side_shift * smooth(t)
            d = pos - self.p
            self.s += np.linalg.norm(d)
            self.f = d / np.linalg.norm(d)
            self.p = pos
            # the road's up points to the loop's centre
            u = (c + side * side_shift * smooth(t)) - pos; u -= self.f * np.dot(u, self.f); self.u = u / np.linalg.norm(u)
            self.emit({'loop'})
        self.f = f0; self.u = up
        return self

    def corkscrew(self, length, rolls=1.0):
        """Straight on while the road rolls all the way round (a twist), banking back to level."""
        n = max(2, int(round(length / STEP)))
        for i in range(n):
            self.bank = 2 * math.pi * rolls * smooth((i + 1) / n)
            self._advance(length / n, {'twist'})
        self.bank = 0.0
        return self

    def ribbon(self, length, climb=0.0, humps=0, hump=0.0, swerves=0, swerve_deg=0.0, roll_deg=0.0, flags=()):
        """Straight on overall, but alive like a ribbon: `humps` bumps of `hump` metres, `swerves` S-bends of
        +-swerve_deg (net zero: it ends on the line it started on, heading the same way), the road rolling up to
        roll_deg into each bend (or, without bends, twisting to and fro), and a smooth `climb`."""
        n = max(2, int(round(length / STEP)))
        f0 = self.f.copy(); f0[1] = 0; f0 /= np.linalg.norm(f0)
        y0 = self.p[1]
        A = math.radians(swerve_deg)
        R = math.radians(roll_deg)
        for i in range(n):
            t = (i + 1) / n
            w = math.sin(math.pi * t)                      # eases the bends in and out
            psi = A * math.sin(2 * math.pi * swerves * t) * w if swerves else 0.0
            f_flat = rot(f0, np.array([0, 1.0, 0]), -psi)
            y = y0 + climb * smooth(t) + (hump * (1 - math.cos(2 * math.pi * humps * t)) / 2 if humps else 0.0)
            dy = climb * 6 * t * (1 - t) / length + (hump * math.pi * humps * math.sin(2 * math.pi * humps * t) / length if humps else 0.0)
            f = f_flat + np.array([0, dy, 0]); f /= np.linalg.norm(f)
            step = length / n
            self.p = np.array([self.p[0] + f_flat[0] * step, y, self.p[2] + f_flat[2] * step])
            self.s += step * math.sqrt(1 + dy * dy)
            self.f = f
            self.u = np.array([0, 1.0, 0]) - f * f[1]; self.u /= np.linalg.norm(self.u)
            if swerves:
                self.bank = R * math.cos(2 * math.pi * swerves * t) * w * w
            else:
                self.bank = R * math.sin(2 * math.pi * max(1, humps) * t) * w
            self.emit(flags)
        self.bank = 0.0
        self.f = f0.copy()
        return self

    def tube(self, length, radius, ramp=4.0, flags=()):
        """A pipe: over `ramp` metres the road curls up round you into a closed tube of `radius` (ride its walls,
        its ceiling, all the way round), and uncurls at the end: be back near the bottom by then, or fly off
        its lip."""
        n = max(2, int(round(length / STEP)))
        full = math.pi * radius
        for i in range(n):
            d = (i + 1) / n * length
            k = smooth(max(0.0, min(1.0, d / ramp, (length - d) / ramp)))
            self.kappa = k / radius
            self.half = WIDTH / 2 + k * (full - WIDTH / 2)
            self._advance(length / n, set(flags) | {'open'})
        self.kappa, self.half = 0.0, WIDTH / 2
        return self

    def drum(self, length, radius, exit_deg, ramp=4.0, flags=()):
        """A drum: over `ramp` metres the road bends down round a cylinder of `radius` (ride its outside, all the
        way round), and then it ends: the road goes on from the line `exit_deg` round to the right of the one
        you came on by (banked that way; roll it back after). Be on that side by then, or fly off the end."""
        n = max(2, int(round(length / STEP)))
        full = math.pi * radius
        for i in range(n):
            d = (i + 1) / n * length
            k = smooth(max(0.0, min(1.0, d / ramp)))
            self.kappa = -k / radius
            self.half = WIDTH / 2 + k * (full - WIDTH / 2)
            self._advance(length / n, set(flags) | {'open'})
        th = math.radians(exit_deg)
        u = rot(self.u, self.f, self.bank)             # the banked up, as frames() draws it
        r = np.cross(self.f, u)
        axis = self.p - u * radius
        self.seams.append((self.s, th * radius))
        self.pts[-1][4].add('seam')                    # the last point before the jump (no distance across it)
        self.p = axis + radius * (u * math.cos(th) + r * math.sin(th))
        self.bank += th
        self.kappa, self.half = 0.0, WIDTH / 2
        self.emit({'open'})
        return self

    def curl(self, s0, s1, radius, sign=1, ramp_in=4.0, ramp_out=4.0):
        """Curve the cross-section of the road already laid between s0 and s1 (turns included): a pipe (sign +1,
        ridden inside) or a drum (sign -1, ridden outside) of `radius`, curling in over ramp_in metres and out
        over ramp_out (0: it ends curled, as at a drum's seam)."""
        acc, full = 0.0, math.pi * radius
        for i, q in enumerate(self.pts):
            if i > 0 and 'seam' not in self.pts[i - 1][4]:
                acc += float(np.linalg.norm(q[0] - self.pts[i - 1][0]))
            if s0 - 1e-6 <= acc <= s1 + 1e-6:
                k = 1.0
                if ramp_in > 0: k = min(k, (acc - s0) / ramp_in)
                if ramp_out > 0: k = min(k, (s1 - acc) / ramp_out)
                k = smooth(max(0.0, min(1.0, k)))
                self.pts[i] = (q[0], q[1], q[2], q[3], q[4] | {'open'}, sign * k / radius, WIDTH / 2 + k * (full - WIDTH / 2))
        return self

    def mark(self, kind, length, **extra):
        self.features.append(dict(kind=kind, s0=self.s, s1=self.s + length, **extra))
        return self

    def put(self, kind, ahead, length=0.0, **extra):
        """A feature `ahead` metres on from here (for things placed along the next piece, like mines)."""
        self.features.append(dict(kind=kind, s0=self.s + ahead, s1=self.s + ahead + length, **extra))
        return self


def connect(t, p_end, f_end, length_scale=0.4):
    """A smooth Hermite connector from the turtle's position and heading to (p_end, f_end)."""
    p0, f0 = t.p.copy(), t.f.copy()
    d = np.linalg.norm(p_end - p0)
    m0, m1 = f0 * d * length_scale * 2, np.array(f_end) * d * length_scale * 2
    n = max(4, int(d / STEP * 1.3))
    prev = p0
    for i in range(1, n + 1):
        u = i / n
        h00, h10, h01, h11 = 2*u**3 - 3*u**2 + 1, u**3 - 2*u**2 + u, -2*u**3 + 3*u**2, u**3 - u**2
        p = h00 * p0 + h10 * m0 + h01 * p_end + h11 * m1
        f = p - prev; f /= np.linalg.norm(f)
        t.s += np.linalg.norm(p - prev)
        t.p, t.f = p, f
        t.u = np.array([0, 1.0, 0]) - f * f[1]; t.u /= np.linalg.norm(t.u)
        t.emit(set())
        prev = p


def close_up(t, p_start, span=20.0):
    """Spread the small leftover between the path's end and its start over the last `span` metres, so the
    lap closes without a step."""
    err = p_start - t.pts[-1][0]
    print('  closing gap %.2f m' % np.linalg.norm(err))
    s_end, acc = 0.0, [0.0]
    for a, b in zip(t.pts[:-1], t.pts[1:]):
        acc.append(acc[-1] + np.linalg.norm(b[0] - a[0]))
    total = acc[-1]
    for i, (p, f, u, b, fl, k, h) in enumerate(t.pts):
        w = smooth(min(1.0, max(0.0, (acc[i] - (total - span)) / span)))
        t.pts[i] = (p + err * w, f, u, b, fl, k, h)
    t.pts.pop()                 # the last point is the start again
    t.p = p_start


def design_neon_city():
    """Track 1, NEON CITY. The road climbs round the arena's walls twice (an oval: 16 m sides along x = +-9, turns
    of 9 m round its ends), from the street to 22 m, then plunges into the middle down a hairpin, takes the loop
    and the corkscrew heading north, spirals two and a half turns down inside the north end to the street, runs
    south under it all (a jump over a short gap, then mines to weave) and turns onto the start. Its straights are
    alive like a ribbon (bumps, S-bends, the road rolling into them). Nine dash plates, kickers at the sides (a hop
    and a burst of speed), three gaps to jump.
    Positive turns go to the driver's right (all the turns here are right-handers).
    Features: start, pit (a heal strip along one edge: refills the energy; four round the lap), dash (a speed plate, x across the road), jump (a launch plate,
    the full width), kick (a side kicker, x across), gap (no road), mine (x across the road)."""
    t = Turtle((9.0, 1.5, -8.0), (0, 0, 1))
    t.mark('start', 0)
    t.mark('pit', 14.0, side=-1)                      # the pit strip along the inner (west) edge
    t.straight(5).mark('dash', 1.5, x=0.7).straight(5).mark('dash', 1.5, x=-0.2).straight(6)
    t.turn(9.0, 180, bank_deg=24, climb=3.0)          # north end, round the wall, climbing
    for ahead, x in ((3.5, 0.75), (7.0, -0.75), (10.5, 0.75)):
        t.put('mine', ahead, x=x)                     # the west side: weave...
    t.put('dash', 13.5, 1.5, x=-0.5)
    t.put('pit', 1.0, 11.0, side=1)                  # a heal strip along the outer edge, past the mines
    t.ribbon(16, climb=3.0, humps=2, hump=0.35, roll_deg=10)    # ...over two bumps, the road twisting
    t.turn(9.0, 180, bank_deg=24, climb=3.0)          # south end
    t.straight(1.5).mark('dash', 1.5, x=-0.6).straight(1.5)
    t.put('kick', 6.0, 1.0, x=0.95)
    t.put('pit', 1.5, 10.5, side=-1)                 # a heal strip on the left, the kicker on the right
    t.ribbon(13, climb=1.5, swerves=1, swerve_deg=9, roll_deg=16)   # the east side again: an S, rolling
    t.turn(9.0, 180, bank_deg=26, climb=3.0)          # north end, higher
    t.mark('dash', 1.5, x=0.0).straight(3)            # a dash plate into the jump
    t.mark('jump', 1.5).straight(2)                   # the jump plate
    t.mark('gap', 4.0).straight(4, flags={'gap'})     # no road: fly
    t.straight(7)
    t.turn(9.0, 180, bank_deg=26, climb=3.0)          # south end, the second round
    t.put('kick', 4.0, 1.0, x=-0.95).put('kick', 10.0, 1.0, x=0.95)
    t.ribbon(16, climb=2.0, humps=2, hump=0.3, roll_deg=12)     # the east side, high: kickers left and right
    t.turn(9.0, 180, bank_deg=28, climb=2.5)          # north end, the top
    t.straight(4).mark('jump', 1.5).straight(1.5)     # the top straight: a short gap...
    t.mark('gap', 2.5).straight(2.5, flags={'gap'})
    t.straight(2).mark('kick', 1.0, x=0.95).straight(6.0)   # ...and a kicker
    t.turn(5.0, 180, bank_deg=30, climb=-7.5)         # the plunge: a hairpin down into the middle, heading north
    t.mark('dash', 1.5, x=0.0).straight(2)            # a dash plate into the loop
    t.loop(4.2, 3.5)                                  # the loop, drifting east onto x = 4.5
    t.straight(1)
    t.corkscrew(7.0, 1.0)
    t.put('dash', 0.3, 1.5, x=0.4)
    t.ribbon(2.0, roll_deg=6)
    t.put('pit', 22.0, 16.0, side=-1)                # a heal strip round the outside of the spiral
    t.turn(4.5, 900, bank_deg=28, climb=-13.5)        # the spiral, two and a half turns down to the street
    t.straight(1.0).mark('dash', 1.5, x=0.0).straight(1.5)   # street level, south along x = -4.5: a dash...
    t.mark('jump', 1.5).straight(1.6)                 # ...into a jump over a short gap...
    t.mark('gap', 2.5).straight(2.5, flags={'gap'})
    for ahead, x in ((1.2, 0.0), (2.6, -0.9), (2.6, 0.9), (4.0, 0.0)):
        t.put('mine', ahead, x=x)                     # ...then the mines to weave
    t.straight(3.9)
    t.mark('dash', 1.5, x=-0.4)
    t.ribbon(1.5, roll_deg=6)
    t.turn(6.75, 180, bank_deg=30)                    # onto the start straight
    close_up(t, np.array([9.0, 1.5, -8.0]))
    return t


def frames(t):
    """Positions, forward, up (with the bank) and right vectors, resampled every STEP along the path."""
    P = np.array([q[0] for q in t.pts]); F = np.array([q[1] for q in t.pts]); U = np.array([q[2] for q in t.pts])
    B = np.array([q[3] for q in t.pts]); FL = [q[4] for q in t.pts]
    K = np.array([q[5] for q in t.pts]); HF = np.array([q[6] for q in t.pts])
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
    for j in range(len(seg)):
        if 'seam' in FL[j]:
            seg[j] = 0.0                      # the jump to a drum's exit line takes no distance along the road
    S = np.concatenate([[0], np.cumsum(seg)])
    total = S[-1]
    n = int(total / STEP)
    out = []
    j = 0
    for i in range(n):
        s = i * STEP
        while j < len(S) - 2 and S[j + 1] < s:
            j += 1
        k = (s - S[j]) / max(1e-9, S[j + 1] - S[j])
        p = P[j] * (1 - k) + P[j + 1] * k
        f = F[j] * (1 - k) + F[j + 1] * k; f /= np.linalg.norm(f)
        u = U[j] * (1 - k) + U[j + 1] * k; u -= f * np.dot(u, f); u /= np.linalg.norm(u)
        db = math.atan2(math.sin(B[j + 1] - B[j]), math.cos(B[j + 1] - B[j]))
        b = B[j] + db * k
        un = rot(u, f, b)                     # banked up
        r = np.cross(f, un)                   # right
        fl = set(FL[j] | FL[j + 1] if k > 0.5 else FL[j]) - {'seam'}
        out.append([s, p, f, un, r, fl, K[j] + (K[j + 1] - K[j]) * k, HF[j] + (HF[j + 1] - HF[j]) * k, 0.0])
    # the seams: the sample just before each jump carries its shift
    for (ss, shift) in t.seams:
        i = max(0, min(len(out) - 1, int(ss / STEP)))
        while i + 1 < len(out) and out[i + 1][0] <= ss:
            i += 1
        out[i][5] = set(out[i][5]) | {'seam'}
        out[i][8] = shift
    return out, total


def check(fr, total):
    P = np.array([q[1] for q in fr]); S = np.array([q[0] for q in fr])
    lo, hi = P.min(0), P.max(0)
    print('length %.1f m, x %.1f..%.1f, y %.1f..%.1f, z %.1f..%.1f' % (total, lo[0], hi[0], lo[1], hi[1], lo[2], hi[2]))
    ok = True
    if lo[0] < -BOX['x'] or hi[0] > BOX['x'] or lo[2] < -BOX['z'] or hi[2] > BOX['z'] or lo[1] < BOX['y0'] - 0.01 or hi[1] > BOX['y1']:
        print('  OUT OF THE BOX'); ok = False
    # closest approach between parts more than 20 m apart along the track (both ways round)
    sub = P[::4]; ss = S[::4]
    worst = (1e9, 0, 0)
    for i in range(len(sub)):
        d = np.linalg.norm(sub - sub[i], axis=1)
        gap = np.abs(ss - ss[i]); gap = np.minimum(gap, total - gap)
        d[gap < 20] = 1e9
        j = int(np.argmin(d))
        if d[j] < worst[0]:
            worst = (d[j], ss[i], ss[j])
    print('  closest other part %.2f m (at s %.0f and %.0f)' % worst)
    if worst[0] < CLEAR:
        ok = False
    # sharpest curvature
    F = np.array([f for _, _, f, *_ in fr])
    ang = np.arccos(np.clip(np.sum(F[1:] * F[:-1], 1), -1, 1)) / STEP
    print('  tightest radius %.2f m' % (1 / max(ang.max(), 1e-6)))
    return ok


def draw(fr, features, out_png):
    P = np.array([q[1] for q in fr])
    W, H = 900, 520
    img = Image.new('RGB', (W, H), (12, 14, 24))
    d = ImageDraw.Draw(img)
    def top(p):   # x across, z along: 32 x 44 m at 10 px/m
        return (40 + (p[2] + 22) * 9, 20 + (16 - p[0]) * 9)
    def side(p):  # z along, y up
        return (470 + (p[2] + 22) * 9, 480 - p[1] * 9)
    d.rectangle([top((16, 0, -22)), top((-16, 0, 22))], outline=(80, 80, 110))
    d.rectangle([side((0, 29, -22)), side((0, 0, 22))], outline=(80, 80, 110))
    for i in range(len(P) - 1):
        c = (int(60 + 195 * P[i][1] / 26), 220, 255 - int(150 * P[i][1] / 26))
        d.line([top(P[i]), top(P[i + 1])], fill=c, width=3)
        d.line([side(P[i]), side(P[i + 1])], fill=c, width=2)
    S = np.array([q[0] for q in fr])
    K = np.array([q[6] for q in fr])
    for i in range(len(P) - 1):
        if abs(K[i]) > 1e-4:
            col = (255, 140, 40) if K[i] < 0 else (120, 255, 120)
            d.line([top(P[i]), top(P[i + 1])], fill=col, width=7)
            d.line([side(P[i]), side(P[i + 1])], fill=col, width=5)
        if 'open' in fr[i][5] and abs(K[i]) < 1e-4:
            d.line([top(P[i]), top(P[i + 1])], fill=(255, 60, 60), width=1)
    for f in features:
        i = int(np.searchsorted(S, f['s0']))
        if i < len(P):
            col = {'pit': (255, 60, 200), 'dash': (255, 220, 60), 'jump': (255, 120, 40), 'gap': (255, 40, 40), 'start': (255, 255, 255), 'mine': (255, 0, 80), 'kick': (80, 255, 120)}[f['kind']]
            x, y = top(P[i]); d.ellipse([x - 5, y - 5, x + 5, y + 5], fill=col)
    d.text((40, 4), 'top (x across, z along)', fill=(200, 200, 220))
    d.text((470, 4), 'side (z along, y up)', fill=(200, 200, 220))
    img.save(out_png)


def design_sky_pipe():
    """Track 2, SKY PIPE: up the arena's walls in a rising oval as on NEON CITY, but the first round's west side
    is open (no barriers) with a long jump over a gap, the east side above the start runs through a PIPE you can
    ride round (walls, ceiling: be back at the bottom when it opens out), the second round's west side is open
    with kickers both sides and a short gap, and from the top it plunges into the middle and corkscrews down a
    helix to the street and the start."""
    t = Turtle((9.0, 1.5, -8.0), (0, 0, 1))
    t.mark('start', 0)
    t.mark('pit', 12.0, side=-1)
    t.straight(4).mark('dash', 1.5, x=-0.5).straight(4).mark('dash', 1.5, x=0.5).straight(8)
    t.turn(9.0, 180, bank_deg=24, climb=3.0)          # south end, climbing
    t.straight(2.5, flags={'open'})                   # west: open edges...
    t.mark('jump', 1.5).straight(1.5, flags={'open'}) # ...a jump plate...
    t.mark('gap', 4.5).straight(4.5, flags={'gap'})   # ...over a 4.5 m gap
    t.put('pit', 0.5, 6.0, side=1)
    t.straight(7.5, flags={'open'})
    pipe0 = t.s + 12.0
    t.turn(9.0, 180, bank_deg=24, climb=3.0)          # north end: THE PIPE closes round you halfway round...
    t.mark('dash', 1.5, x=0.0).straight(16.0)         # ...and runs the east side, over the start straight
    t.curl(pipe0, t.s, 1.3, 1, ramp_in=5.0, ramp_out=7.0)
    t.turn(9.0, 180, bank_deg=26, climb=3.0)          # south end, higher
    t.put('kick', 1.0, 1.0, x=-0.95).put('kick', 2.5, 1.0, x=0.95)
    t.ribbon(9.0, humps=1, hump=0.3, roll_deg=8, flags={'open'})   # west, high: open, kickers left and right
    t.mark('jump', 1.5).straight(1.5)
    t.mark('gap', 2.5).straight(2.5, flags={'gap'})
    t.straight(2.5, flags={'open'})
    t.turn(9.0, 180, bank_deg=28, climb=2.0)          # north end, the top
    t.straight(3).mark('dash', 1.5, x=0.0).straight(5)
    t.turn(5.0, 180, bank_deg=30, climb=-6.5)         # the plunge into the middle, heading north
    t.put('mine', 1.0, x=-0.6)
    t.straight(2.3)
    t.turn(3.5, 360, bank_deg=30, climb=-4.5)         # a helix down in the middle to the street
    t.mark('dash', 1.5, x=0.0)
    t.straight(6.0, flags={'open'})
    t.turn(5.0, 180, bank_deg=30)                     # onto the start straight
    close_up(t, np.array([9.0, 1.5, -8.0]))
    return t


def design_drum():
    """Track 3, THE DRUM: the rising oval again, with THE DRUM on the first round's east side: the road bends down
    round a cylinder you ride outside, and goes on from its right-hand side, a quarter of the way round, banked
    like a wall and rolling back level: be on that side when it ends, or fly off its end. An open S, a high open
    straight with a big jump, then a plunge into the middle, a drop over a gap and a helix to the start."""
    t = Turtle((9.0, 1.5, -8.0), (0, 0, 1))
    t.mark('start', 0)
    t.mark('pit', 12.0, side=-1)
    t.straight(5).mark('dash', 1.5, x=0.4).straight(9.5)
    t.turn(9.0, 180, bank_deg=26, climb=3.0)          # south end, climbing
    t.put('kick', 4.0, 1.0, x=0.95)
    t.ribbon(16, climb=2.0, swerves=1, swerve_deg=6, roll_deg=10, flags={'open'})   # west: an open S
    drum0 = t.s + 18.0
    t.turn(9.0, 180, bank_deg=26, climb=3.0)          # north end: THE DRUM bends down round you late in it...
    t.curl(drum0, t.s, 1.4, -1, ramp_in=5.0, ramp_out=0.0)
    t.drum(16.0, 1.4, 90, ramp=0.01)                  # ...and runs the east side: off its right side at the end
    t.straight(3.0, flags={'open'}, bank_to=0.0)      # rolling back level from the wall
    t.turn(8.3, 180, bank_deg=26, climb=3.0)          # south end, high
    t.straight(2.0, flags={'open'})
    t.mark('jump', 1.5).straight(1.5, flags={'open'}) # west, high and open: a big jump...
    t.mark('gap', 4.0).straight(4.0, flags={'gap'})   # ...over 4 m...
    t.put('pit', 0.5, 6.0, side=1)
    t.straight(7.0, flags={'open'})                   # ...to an open landing
    t.turn(9.0, 180, bank_deg=28, climb=2.8)          # north end, the top (well clear of the drum)
    t.straight(3).mark('dash', 1.5, x=0.0).straight(4)
    t.turn(5.0, 180, bank_deg=30, climb=-6.8)         # the plunge into the middle, heading north
    t.straight(1.0).mark('jump', 1.5).straight(1.5)   # a drop: jump...
    t.mark('gap', 3.0).ramp(3.0, -1.5, flags={'gap'}) # ...over a gap that falls away
    t.straight(1.0)
    t.turn(3.5, 360, bank_deg=30, climb=-4.0)         # a helix down to the street
    t.straight(1.1, flags={'open'})
    t.turn(5.0, 180, bank_deg=30)                     # onto the start straight
    close_up(t, np.array([9.0, 1.5, -8.0]))
    return t


DESIGNS = {'neon': ('NEON CITY', 0, lambda: design_neon_city()), 'pipe': ('SKY PIPE', 1, lambda: design_sky_pipe()),
           'drum': ('THE DRUM', 2, lambda: design_drum())}

if __name__ == '__main__':
    out_json, out_png = sys.argv[1], sys.argv[2]
    name, ident, make = DESIGNS[sys.argv[3] if len(sys.argv) > 3 else 'neon']
    t = make()
    fr, total = frames(t)
    ok = check(fr, total)
    draw(fr, t.features, out_png)
    bits = lambda fl: (1 if 'open' in fl else 0) | (2 if 'seam' in fl else 0)
    data = {'name': name, 'id': ident, 'length': total, 'step': STEP, 'width': WIDTH,
            'points': [[round(v, 4) for v in list(p) + list(u) + list(r)] + [int('gap' in fl), round(float(k), 5), round(float(h), 4), bits(fl), round(float(sh), 4)]
                       for s, p, f, u, r, fl, k, h, sh in fr],
            'features': t.features}
    json.dump(data, open(out_json, 'w'))
    print('OK' if ok else 'NEEDS WORK', len(fr), 'samples')
