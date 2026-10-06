"""HYPERLANE's track, designed as a turtle path of pieces (straight, banked turn, helix, ramp, loop,
corkscrew, jump) inside lot #383's box (32 x 44 x 29 m), closed with a smooth connector, then checked:
inside the box with room for the camera, no part of the track closer than CLEAR metres to another part.
Writes the centreline with its frames (every 0.25 m) and the features (pit, dash plates, jump) as JSON for
the game, and top and side views as an image.

python track_design.py <out.json> <out.png> [neon|pipe|drum|pulsar|nebula|orbit|scorch|mesa|twister]
(the second and third cups: experience/assets/track4.json ... track9.json, shots/track4.png ... track9.png)
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
# where the centreline may go: the road's edge (1.6 m out) and its barriers stay inside the lot (32 x 44 x 29 m),
# and the chase camera (well under a metre behind a 0.21 m machine) has room. Round 15 widened it from 13.2 x 19.2 x
# 25.5 to give the courses their longer straights and wider turns.
BOX = dict(x=14.0, z=20.0, y0=1.0, y1=26.5)
R_OVAL = 11.0               # the oval's end turns (round 15: from 9 m; wider, so a machine flat out can take them)
SIDE = 17.5                 # its straights along the long axis (round 15: from 16 m)
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


def ease_slope(t, ease=EASE):
    """The slope's profile along a climbing turn (0 at both ends, 1 in the middle), scaled so it integrates to 1."""
    k = min(1.0, t / ease, (1 - t) / ease)
    return smooth(max(0.0, k)) / (1 - ease)


def ease_climb(t, n=200, ease=EASE):
    """The climb so far: the integral of ease_slope from 0 to t."""
    ts = np.linspace(0, t, n + 1)
    return float(np.trapezoid([ease_slope(x, ease) for x in ts], ts)) if t > 0 else 0.0


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

    def turn(self, radius, angle_deg, bank_deg=0.0, climb=0.0, flags=(), ease=EASE):
        """A turn about the world's up (positive angle: to the driver's right), banked into the turn in its
        middle, rising `climb` (a helix when the angle goes past 360). The climb eases in and out over the
        first and last quarter (`ease`), so the road is level where the turn meets the pieces before and after it
        (a long spiral eases over less, so its levels stay evenly apart)."""
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
            y = y0 + climb * ease_climb(t, ease=ease)
            slope = climb * ease_slope(t, ease) / length
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

    def ribbon(self, length, climb=0.0, humps=0, hump=0.0, swerves=0, swerve_deg=0.0, roll_deg=0.0, flags=(), zones=()):
        """Straight on overall, but alive like a ribbon: `humps` bumps of `hump` metres, `swerves` S-bends of
        +-swerve_deg (net zero: it ends on the line it started on, heading the same way), the road rolling up to
        roll_deg into each bend (or, without bends, twisting to and fro), and a smooth `climb`. zones: (from, to,
        flags) along it, for flags on part of it only (a gap in the middle of a long climb)."""
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
            d = t * length
            self.emit(set(flags).union(*[set(zf) for z0, z1, zf in zones if z0 < d <= z1 + 1e-6]))
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

    def canyon(self, s0, s1, radius, half, ramp=4.0):
        """Curve the road laid between s0 and s1 up into a U, a canyon you ride inside: a cross-section of `radius`
        reaching `half` metres up each wall (less than half way round, so it stays open; over its lips you fall),
        rolling in and out over `ramp` metres."""
        acc = 0.0
        for i, q in enumerate(self.pts):
            if i > 0 and 'seam' not in self.pts[i - 1][4]:
                acc += float(np.linalg.norm(q[0] - self.pts[i - 1][0]))
            if s0 - 1e-6 <= acc <= s1 + 1e-6:
                k = smooth(max(0.0, min(1.0, (acc - s0) / ramp, (s1 - acc) / ramp)))
                self.pts[i] = (q[0], q[1], q[2], q[3], q[4] | {'open'}, k / radius, WIDTH / 2 + k * (half - WIDTH / 2))
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
    print('  closing gap %.2f m' % np.linalg.norm(err), '(x %.2f, y %.2f, z %.2f)' % tuple(err))
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
    """Track 1, NEON CITY. The road climbs round the arena's walls (an oval: 18 m sides along x = +-11, turns of 11 m
    round its ends) from the street to 22 m, then plunges into the middle down a hairpin, takes the loop (5.6 m) and
    the corkscrew heading north, spirals three and a half turns down inside the north end to the street, runs south
    along x = -6.5 (a jump over a short gap, then mines to weave) and turns onto the start. Every jump starts its
    straight, so the landing has 10-12 m to boost flat out before the next turn. Its straights are alive like a
    ribbon (bumps, S-bends, the road rolling into them).
    Positive turns go to the driver's right (all the turns here are right-handers).
    Features: start, pit (a heal strip along one edge: refills the energy), dash (a speed plate, x across the road),
    jump (a launch plate, the full width), kick (a side kicker, x across), gap (no road), mine (x across the road)."""
    R = R_OVAL
    t = Turtle((R, 1.5, -SIDE / 2), (0, 0, 1))
    t.mark('start', 0)
    t.mark('pit', 16.0, side=-1)                      # the pit strip along the inner (west) edge
    t.straight(5).mark('dash', 1.5, x=0.7).straight(5).mark('dash', 1.5, x=-0.2).straight(SIDE - 10)
    t.turn(R, 180, bank_deg=22, climb=3.0)            # north end, round the wall, climbing
    for ahead, x in ((3.5, 0.75), (7.0, -0.75), (10.5, 0.75)):
        t.put('mine', ahead, x=x)                     # the west side: weave...
    t.put('dash', 14.5, 1.5, x=-0.5)
    t.put('pit', 1.0, 12.0, side=1)                  # a heal strip along the outer edge, past the mines
    t.ribbon(SIDE, climb=3.0, humps=2, hump=0.35, roll_deg=10)  # ...over two bumps, the road twisting
    t.turn(R, 180, bank_deg=22, climb=3.0)            # south end
    t.straight(1.5).mark('dash', 1.5, x=-0.6).straight(1.5)
    t.put('kick', 7.0, 1.0, x=0.95)
    t.put('pit', 1.5, 11.0, side=-1)                 # a heal strip on the left, the kicker on the right
    t.ribbon(SIDE - 3, climb=1.5, swerves=1, swerve_deg=8, roll_deg=14)   # the east side again: an S, rolling
    t.turn(R, 180, bank_deg=24, climb=3.0)            # north end, higher
    t.mark('dash', 1.5, x=0.0).straight(2.5)          # a dash plate into the jump
    t.mark('jump', 1.5).straight(1.5)                 # the jump plate
    t.mark('gap', 4.0).straight(4, flags={'gap'})     # no road: fly
    t.straight(SIDE - 8.0)                            # 10 m to land and boost flat out
    t.turn(R, 180, bank_deg=24, climb=3.0)            # south end, the second round
    t.put('kick', 5.0, 1.0, x=-0.95).put('kick', 11.0, 1.0, x=0.95)
    t.ribbon(SIDE, climb=2.0, humps=2, hump=0.3, roll_deg=12)   # the east side, high: kickers left and right
    t.turn(R, 180, bank_deg=26, climb=2.5)            # north end, the top
    t.straight(2).mark('jump', 1.5).straight(1.5)     # the top straight: a short gap...
    t.mark('gap', 2.5).straight(2.5, flags={'gap'})
    t.straight(3).mark('kick', 1.0, x=0.95).straight(SIDE - 9.0)   # ...12 m to land, and a kicker
    t.turn(6.0, 180, bank_deg=30, climb=-7.5)         # the plunge: a hairpin down into the middle, heading north
    t.mark('dash', 1.5, x=0.0).straight(2)            # a dash plate into the loop
    t.loop(5.6, 3.5)                                  # the loop, drifting east onto x = 4.5
    t.straight(2)
    t.corkscrew(8.0, 1.0)
    t.put('dash', 0.5, 1.5, x=0.4)
    t.ribbon(6.0, roll_deg=6)
    t.put('pit', 30.0, 20.0, side=-1)                # a heal strip round the outside of the spiral
    t.turn(5.5, 1260, bank_deg=28, climb=-13.5, ease=0.04)   # the spiral, three and a half turns down to the street
    t.straight(1.0).mark('dash', 1.5, x=0.0).straight(1.5)   # street level, south along x = -6.5: a dash...
    t.mark('jump', 1.5).straight(1.6)                 # ...into a jump over a short gap...
    t.mark('gap', 2.5).straight(2.5, flags={'gap'})
    for ahead, x in ((2.5, 0.0), (4.5, -0.9), (4.5, 0.9), (6.5, 0.0)):
        t.put('mine', ahead, x=x)                     # ...then the mines to weave
    t.straight(9.9)
    t.mark('dash', 1.5, x=-0.4)
    t.ribbon(1.5, roll_deg=6)
    t.turn((R + 6.5) / 2, 180, bank_deg=30)           # onto the start straight
    close_up(t, np.array([R, 1.5, -SIDE / 2]))
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
    is open (no barriers) with a long jump over a gap and a long open landing, the east side above the start runs
    through a PIPE you can ride round (walls, ceiling: be back at the bottom when it opens out), the second round's
    west side is open with kickers both sides and a short gap, the top straight has a heal strip, and from the top
    it plunges into the middle and corkscrews down a double helix to the street and the start."""
    R = R_OVAL
    t = Turtle((R, 1.5, -SIDE / 2), (0, 0, 1))
    t.mark('start', 0)
    t.mark('pit', 12.0, side=-1)
    t.straight(4).mark('dash', 1.5, x=-0.5).straight(5).mark('dash', 1.5, x=0.5).straight(SIDE - 9)
    t.turn(R, 180, bank_deg=22, climb=3.0)            # north end, climbing
    t.straight(1.5, flags={'open'})                   # west: open edges...
    t.mark('jump', 1.5).straight(1.5, flags={'open'}) # ...a jump plate...
    t.mark('gap', 4.0).straight(4.0, flags={'gap'})   # ...over a 4 m gap...
    t.put('pit', 1.0, 8.0, side=1)
    t.straight(SIDE - 7.0, flags={'open'})            # ...and 10.5 m of open landing
    pipe0 = t.s + 15.0
    t.turn(R, 180, bank_deg=22, climb=3.0)            # south end: THE PIPE closes round you halfway round...
    t.mark('dash', 1.5, x=0.0).straight(SIDE)         # ...and runs the east side, over the start straight
    t.curl(pipe0, t.s, 1.3, 1, ramp_in=5.0, ramp_out=7.0)
    t.turn(R, 180, bank_deg=24, climb=3.0)            # north end, higher
    t.put('kick', 0.0, 1.0, x=-0.95).put('kick', 0.0, 1.0, x=0.95)
    t.ribbon(6.5, roll_deg=8, flags={'open'})         # west, high: open, kickers left and right, 7 m before the plate
    t.mark('jump', 1.5).straight(1.5)                 # (a kicker's hop is 5 to 6 m: land on the plate, not over it)
    t.mark('gap', 2.0).straight(2.0, flags={'gap'})
    t.straight(SIDE - 10.0, flags={'open'})           # 7.5 m to land
    t.turn(R, 180, bank_deg=26, climb=2.0)            # south end, the top
    t.put('pit', 2.0, 10.0, side=-1)                 # a heal strip along the top straight
    t.straight(3).mark('dash', 1.5, x=0.0).straight(SIDE - 3)
    t.turn(6.75, 180, bank_deg=30, climb=-3.5)        # the plunge into the middle, heading south
    t.put('mine', 1.0, x=-0.6)
    t.straight(2.3)
    t.turn(4.5, 360, bank_deg=30, climb=-7.5)         # a helix down in the middle to the street
    t.mark('dash', 1.5, x=0.0)
    t.straight(SIDE - 2.3, flags={'open'})            # the street, south
    t.turn(6.75, 180, bank_deg=30)                    # onto the start straight
    close_up(t, np.array([R, 1.5, -SIDE / 2]))
    return t


def design_drum():
    """Track 3, THE DRUM: the rising oval again, with two drums in its first round. On the west side the road bends
    down round a cylinder you ride outside and goes on from its LEFT side, a quarter of the way round; on the east
    side THE DRUM does the same and goes on from its RIGHT side: be on the right side when each ends, or fly off its
    end. Then a high open straight with a big jump and a long landing, a plunge into the middle, a drop over a gap,
    a helix and the street run to the start, with a heal strip on it."""
    R = R_OVAL
    t = Turtle((R, 1.5, -SIDE / 2), (0, 0, 1))
    t.mark('start', 0)
    t.mark('pit', 12.0, side=-1)
    t.straight(5).mark('dash', 1.5, x=0.4).straight(SIDE - 5)
    drum2 = t.s + 13.0
    t.turn((R + R - 1.6) / 2, 180, bank_deg=22, climb=3.5)   # north end (onto x = -9.4): a wider, longer drum bends
                                                      # down halfway round it...
    t.curl(drum2, t.s, 1.6, -1, ramp_in=5.0, ramp_out=0.0)
    t.drum(SIDE - 3.0, 1.6, -90, ramp=0.01)           # ...and runs the west side: off its LEFT side at the end (x = -11)
    t.straight(3.0, flags={'open'}, bank_to=0.0)      # rolling back level from the wall
    drum0 = t.s + 21.0
    t.turn(R, 180, bank_deg=24, climb=4.5)            # south end: THE DRUM bends down late in it...
    t.curl(drum0, t.s, 1.4, -1, ramp_in=5.0, ramp_out=0.0)
    t.drum(SIDE - 3.0, 1.4, 90, ramp=0.01)            # ...and runs the east side: off its right side at the end
    t.straight(3.0, flags={'open'}, bank_to=0.0)
    t.turn((R - 1.4 + R) / 2, 180, bank_deg=24, climb=3.0)   # north end, high
    t.straight(2.0, flags={'open'})
    t.mark('jump', 1.5).straight(1.5, flags={'open'}) # west, high and open: a big jump...
    t.mark('gap', 4.0).straight(4.0, flags={'gap'})   # ...over 4 m...
    t.put('pit', 1.0, 7.0, side=1)
    t.straight(SIDE - 7.5, flags={'open'})            # ...to a long open landing
    t.turn(R, 180, bank_deg=26, climb=3.5)            # south end, the top (well clear of the drums)
    t.straight(3).mark('dash', 1.5, x=0.0).straight(SIDE - 3)
    t.turn(6.5, 180, bank_deg=30, climb=-5.7)         # the plunge into the middle, heading south
    t.straight(1.0).mark('jump', 1.5).straight(1.5)   # a drop: jump...
    t.mark('gap', 3.0).ramp(3.0, -1.5, flags={'gap'}) # ...over a gap that falls away
    t.straight(1.0)
    t.turn(4.5, 360, bank_deg=30, climb=-4.3)         # a helix down to the street
    t.put('pit', 1.0, 9.0, side=1)                   # a heal strip on the street run
    t.straight(11.0, flags={'open'})
    t.turn((R + 2.0) / 2, 180, bank_deg=30)           # onto the start straight
    close_up(t, np.array([R, 1.5, -SIDE / 2]))
    return t


# ---------------------------------------------------------------- the second and third cups (round 16)
# NOVA CUP (space) and DUST CUP (desert): longer and harder than the first, 490 to 590 m each, with more open edges,
# chicanes and jumps. Each is two springs side by side: one climbs a shape round after round (every round a full
# level above the last, so the road may cross itself), the other comes down another, and bridges join their tops
# and their bottoms. A plate's gap starts a hand's width past it (the gap's first sample must not come before the
# plate's end, or a machine can fall in before it is launched), every gap is at most 4 m (cleared from 5 m/s, the
# pace of the lap of honour), and a plate has 6 to 12 m of straight before it, or barriers along its landing: a
# machine still sliding out of a bend when it leaves the ground has nothing in the air to catch the slide.

def eight_geometry(r, c):
    """A figure eight of two lobes of radius r whose centres are 2c apart: the diagonals' angle off the line of
    the centres, their length, and how far each lobe turns."""
    a = math.asin(r / c)
    return a, 2 * math.sqrt(c * c - r * r), 180 + 2 * math.degrees(a)


def ribbon_exact(t, length, **kw):
    """A ribbon that ends `length` metres on along its heading (a chicane's bends would leave it short)."""
    p0 = t.p.copy(); f0 = t.f.copy(); f0[1] = 0; f0 /= np.linalg.norm(f0)
    t.ribbon(length, **kw)
    short = length - float(np.dot(t.p - p0, f0))
    if short > 0.005:
        t.straight(short, flags=kw.get('flags', ()))
    return t


def sbend(t, lateral, radius, climb=0.0, bank=16):
    """Sideways by `lateral` metres (+ to the right) in two arcs of `radius`, ending on the heading it began on.
    Returns how far on it went."""
    th = math.degrees(math.acos(1 - abs(lateral) / (2 * radius)))
    sg = 1 if lateral > 0 else -1
    t.turn(radius, sg * th, bank_deg=bank, climb=climb / 2)
    t.turn(radius, -sg * th, bank_deg=bank, climb=climb / 2)
    return 2 * radius * math.sin(math.radians(th))


def eight_diagonal(t, L, climb, kind, side=1):
    """One of PULSAR RUN's diagonals (open edges), climbing `climb`, with what it carries."""
    O = {'open'}
    if kind in ('chicane', 'chicane2'):
        n, deg, Lc = (1, 20, 12.0) if kind == 'chicane' else (2, 15, 15.0)
        t.ribbon(Lc, climb=climb * Lc / L, swerves=n, swerve_deg=deg * side, roll_deg=12, flags=O)
        t.mark('dash', 1.5, x=0.0)
        t.ribbon(L - Lc, climb=climb * (L - Lc) / L, flags=O)
    elif kind in ('jump', 'jump-mines'):
        g = 4.0                                       # over the crossing, the road below 4 m down
        t.put('dash', 2.85, 1.5, x=0.0).put('jump', 5.85, 1.5).put('gap', 7.5, g)
        if kind == 'jump-mines':
            for ahead, x in ((17.0, -0.6), (19.0, 0.6)):
                t.put('mine', ahead, x=x)
        t.ribbon(L, climb=climb, flags=O, zones=[(7.5, 7.5 + g, {'gap'})])
    elif kind == 'heal':
        t.put('pit', 2.0, 10.0, side=side).put('kick', 15.0, 1.0, x=-0.7).put('kick', 15.0, 1.0, x=0.7)
        t.ribbon(L, climb=climb, flags=O)
    elif kind == 'dash-mines':
        t.put('dash', 2.0, 1.5, x=0.4)
        for ahead, x in ((9.0, 0.0), (12.0, -0.8), (12.0, 0.8), (15.0, 0.0)):
            t.put('mine', ahead, x=x)
        t.ribbon(L, climb=climb, flags=O)


def design_pulsar_run():
    """NOVA CUP 1, PULSAR RUN (the fast one): two figure eights side by side, lobes 5 m round, diagonals 26 m and
    open. The west eight climbs two and a half laps, its diagonals crossing 4 m over each other (two jumps fly the
    crossing over the road below, with 14 m to land), a bridge over the top joins the east eight, which comes down
    the same way, and the start straight runs along the south end under the lobes."""
    r, c, X = 5.0, 14.0, 7.5                          # lobe radius, half the distance between lobes, |x| of each eight
    a, diag, lobe = eight_geometry(r, c)
    ad = math.degrees(a)
    L_lobe = math.radians(lobe) * r
    rise = 4.0                                        # per half lap: how far apart the diagonals cross
    y0 = 2.0
    t = Turtle((4.5, y0, -(c + r)), (-1, 0, 0))       # the start: along the south end, west
    t.mark('start', 0)
    t.mark('pit', 10.0, side=1)
    t.straight(3).mark('dash', 1.5, x=0.4).straight(4.5 + X - 3)
    t.turn(r, -(90 + ad), bank_deg=20)                # round the west eight's south lobe onto its first diagonal
    dc = rise * diag / (diag + L_lobe); lc = rise - dc
    west = ['chicane', 'jump', 'heal', 'jump-mines', 'chicane2']
    for k in range(5):                                # the west eight, up: diagonal, north lobe, diagonal, south lobe
        eight_diagonal(t, diag, dc, west[k], side=-1 if k == 2 else 1)
        if k % 2 == 0:
            t.turn(r, lobe if k < 4 else 270 + ad, bank_deg=28, climb=lc if k < 4 else 4.0)  # the last: on to east
        else:
            t.turn(r, -lobe, bank_deg=28, climb=lc)
    t.mark('dash', 1.5, x=0.0)
    t.straight(2 * X, flags={'open'})                 # the bridge over the top
    t.turn(r, 270 + ad, bank_deg=28, climb=-4.0)      # into the east eight's north lobe
    drop = t.p[1] - y0
    L = 4 * (diag + L_lobe) + diag + math.radians(90 + ad) * r
    per = drop / L
    east = ['jump', 'chicane', 'heal', 'jump', 'dash-mines']
    for k in range(5):                                # the east eight, down
        eight_diagonal(t, diag, -per * diag, east[k], side=1)
        if k % 2 == 0:
            if k < 4:
                t.turn(r, -lobe, bank_deg=28, climb=-per * L_lobe)
            else:
                t.turn(r, -(90 + ad), bank_deg=20, climb=-per * math.radians(90 + ad) * r)   # out onto the start
        else:
            t.turn(r, lobe, bank_deg=28, climb=-per * L_lobe)
    t.straight(3.0)
    close_up(t, np.array([4.5, y0, -(c + r)]))
    return t


def knot_lane(t, L, climb, kind, side=1):
    """A lane of NEBULA KNOT's paperclip: open edges in its middle, barriers for its last 5 m into the hairpin
    (and all along a jump's landing)."""
    Z = [(1.5, L - 5.0, {'open'})]
    if kind == 'chicane':
        ribbon_exact(t, L, climb=climb, swerves=1, swerve_deg=17, roll_deg=10, zones=Z)
    elif kind == 'chicane2':
        ribbon_exact(t, L, climb=climb, swerves=2, swerve_deg=12, roll_deg=10, zones=Z)
    elif kind == 'mines':
        for ahead, x in ((5.0, 0.0), (8.5, -0.75), (8.5, 0.75), (12.0, 0.0)):
            t.put('mine', ahead, x=x)
        t.ribbon(L, climb=climb, zones=Z)
    elif kind == 'jump':
        t.put('jump', 0.7, 1.5).put('gap', 2.5, 3.0)
        t.ribbon(L, climb=climb, zones=[(2.5, 5.5, {'gap'})])
    elif kind == 'dash':
        t.put('dash', 4.0, 1.5, x=-0.4).put('dash', 11.0, 1.5, x=0.4)
        t.ribbon(L, climb=climb, zones=Z)
    elif kind == 'heal':
        t.put('pit', 3.0, 12.0, side=side)
        t.ribbon(L, climb=climb, zones=Z)
    elif kind == 'kick':
        t.put('dash', 2.0, 1.5, x=0.0).put('kick', 8.0, 1.0, x=-0.7).put('kick', 8.0, 1.0, x=0.7)
        t.ribbon(L, climb=climb, zones=Z)


def design_nebula_knot():
    """NOVA CUP 2, NEBULA KNOT (the technical one): a paperclip of 19 m lanes and 4 m hairpins in the south climbs
    five rounds (ten hairpins, chicanes, mines, two jumps, kickers), then THE PIPE runs north at the top into a
    spiral 6.5 m round that winds four and a half times down to the street (its second turn a pipe too), and the
    street runs south to the start."""
    rh = 4.0                                          # the hairpins
    zN, xe = -9.5, 9.5                                # the paperclip's north lane and where its lanes end
    Ln = 2 * xe
    L_hair = math.pi * rh
    rise = 4.0                                        # per round
    y0, x0 = 2.0, -13.5
    t = Turtle((x0, y0, 0.0), (0, 0, -1))             # the start: the street along the west edge, south
    t.mark('start', 0)
    t.mark('pit', 6.0, side=-1)
    t.straight(-zN - rh)
    t.turn(rh, 90, bank_deg=20)                       # onto the paperclip's first lane, east
    per_lane = rise * Ln / (2 * (Ln + L_hair)); per_hair = rise / 2 - per_lane
    north = ['chicane', 'dash', 'chicane2', 'kick', 'chicane']
    south = ['mines', 'jump', 'heal', 'jump', 'mines']
    for k in range(5):
        knot_lane(t, Ln, per_lane, north[k])
        t.turn(rh, -180, bank_deg=30, climb=per_hair)
        knot_lane(t, Ln, per_lane, south[k], side=-1)
        t.turn(rh, -180, bank_deg=30, climb=per_hair)
    hr, hz = 6.5, 11.5                                # the spiral down: radius and centre (north-west)
    hx = x0 + hr
    t.mark('dash', 1.5, x=0.0)
    t.ribbon(hx + hr - rh - (-xe), climb=1.2)         # the top lane, west end: out of the paperclip...
    t.turn(rh, 90, bank_deg=26)                       # ...north
    t.tube(hz - t.p[2], 1.3, ramp=4.0)                # THE PIPE north to the spiral
    top = t.p[1]
    turns = 4.5
    s_h = t.s
    t.turn(hr, 360 * turns, bank_deg=28, climb=-(top - 3.0), ease=0.05)
    t.curl(s_h + 2 * math.pi * hr * 1.5, s_h + 2 * math.pi * hr * 2.5, 1.3, 1, ramp_in=5.0, ramp_out=6.0)
    t.put('dash', 2.0, 1.5, x=0.0)
    t.ribbon(t.p[2], climb=y0 - t.p[1])               # the street, south to the line
    close_up(t, np.array([x0, y0, 0.0]))
    return t


def orbit_lane(t, L, climb, kind, side=1):
    """A lane of ORBIT GATE's paperclip (open in the middle, barriers into the hairpins and along a landing)."""
    Z = [(1.5, L - 5.0, {'open'})]
    if kind in ('jump', 'jump-mines'):
        if kind == 'jump':
            t.put('dash', 0.0, 0.7, x=0.0)
        else:
            for ahead, x in ((10.0, -0.7), (12.5, 0.7)):
                t.put('mine', ahead, x=x)
        t.put('jump', 0.7, 1.5).put('gap', 2.5, 3.5)
        t.ribbon(L, climb=climb, zones=[(2.5, 6.0, {'gap'})])
    elif kind == 'chicane':
        ribbon_exact(t, L, climb=climb, swerves=1, swerve_deg=18, roll_deg=10, zones=Z)
    elif kind == 'heal':
        t.put('pit', 2.0, 11.0, side=side).put('kick', 14.0, 1.0, x=-0.7).put('kick', 14.0, 1.0, x=0.7)
        t.ribbon(L, climb=climb, zones=Z)


def design_orbit_gate():
    """NOVA CUP 3, ORBIT GATE: a ring 8 m round in the south climbs four rounds (half of them open), a bridge at
    the top runs east and north up the east edge through a twist, a paperclip of 17 m lanes and 5 m hairpins in
    the north comes down three rounds (jumps, chicanes, mines, kickers), and the street runs south down the west
    edge through a DRUM (off its right side) and back east to the start, under it all."""
    Rc, cz = 8.0, -12.0                               # the south ring (climbing): radius and centre
    hz, xe, rh = 13.0, 8.7, 5.0                       # the north paperclip (coming down): middle, lane ends, hairpins
    y0 = 2.0
    x0 = -xe + 1.4                                    # (the drum's exit leaves the road 1.4 m to the east)
    t = Turtle((x0, y0, cz + Rc), (1, 0, 0))          # the start: east, into the ring
    t.mark('start', 0)
    t.mark('pit', 7.0, side=1)
    t.straight(2.5).mark('dash', 1.5, x=0.0).straight(-x0 - 2.5)
    rounds, top = 4, 22.0
    for k in range(rounds):
        fl = {'open'} if k in (1, 3) else ()
        t.turn(Rc, -180, bank_deg=26, climb=(top - y0) / (2 * rounds), flags=fl)
        if k == 2:
            t.put('pit', 2.0, 12.0, side=1)
        t.turn(Rc, -180, bank_deg=26, climb=(top - y0) / (2 * rounds))
    t.mark('dash', 1.5, x=0.0)
    t.straight(xe)                                    # the top bridge: east...
    t.turn(rh, 90, bank_deg=24)                       # ...north along the east edge...
    t.straight(2.0)
    t.corkscrew(8.0, 1.0)                             # ...through a twist
    t.straight(hz - t.p[2])
    Ln = 2 * xe
    L_h = math.pi * rh
    bottom = 5.0
    g = (t.p[1] - bottom) / (L_h / 2 + 3 * (2 * Ln + 2 * L_h) + Ln + L_h / 2)
    t.turn(rh, 90, bank_deg=28, climb=-g * L_h / 2)   # the north paperclip, down three rounds (right turns)
    kinds = ['jump', 'chicane', 'jump-mines', 'heal', 'jump', 'chicane']
    for k in range(3):
        orbit_lane(t, Ln, -g * Ln, kinds[2 * k], side=-1)
        t.turn(rh, 180, bank_deg=30, climb=-g * L_h)
        orbit_lane(t, Ln, -g * Ln, kinds[2 * k + 1], side=-1)
        t.turn(rh, 180, bank_deg=30, climb=-g * L_h)
    orbit_lane(t, Ln, -g * Ln, 'chicane')
    s_q = t.s
    t.turn(rh, 90, bank_deg=24, climb=-g * L_h / 2)  # west, then south: THE DRUM bends down at the end of the turn...
    t.curl(s_q + 2.0, t.s, 1.4, -1, ramp_in=5.0, ramp_out=0.0)
    t.drum(t.p[2] - (cz + Rc) - rh - 2.0, 1.4, 90, ramp=0.01)   # ...and runs south: off its right side
    t.straight(2.0, flags={'open'}, bank_to=0.0)
    t.turn(rh, 90, bank_deg=20, climb=y0 - t.p[1])
    t.straight(max(0.5, x0 - t.p[0]))
    close_up(t, np.array([x0, y0, cz + Rc]))
    return t


def drag_strip(t, L, climb, kind, side=1):
    """One of SCORCH STRIP's 31 m strips (open edges unless it is a canyon), with what it carries."""
    O = {'open'}
    s0 = t.s
    if kind == 'start':
        t.put('dash', 6.0, 1.5, x=-0.4).put('dash', 16.0, 1.5, x=0.4)
        t.ribbon(L, climb=climb)
    elif kind == 'dunes':
        t.put('dash', 3.0, 1.5, x=0.0)
        t.ribbon(L, climb=climb, humps=3, hump=0.6, flags=O)
    elif kind == 'dunes-kick':
        t.put('kick', 9.0, 1.0, x=-0.7).put('kick', 20.0, 1.0, x=0.7)
        t.ribbon(L, climb=climb, humps=2, hump=0.5, flags=O)
    elif kind in ('jump', 'jump-heal'):
        g = 3.8                                       # a canyon gap, 8 m after the hairpin to line up for it
        t.put('dash', 4.0, 1.5, x=0.0).put('jump', 8.0, 1.5).put('gap', 9.8, g)
        if kind == 'jump-heal':
            t.put('pit', 16.0, 12.0, side=side)
        t.ribbon(L, climb=climb, flags=O, zones=[(9.8, 9.8 + g, {'gap'})])
    elif kind == 'canyon':
        t.put('dash', 2.0, 1.5, x=0.0)
        t.ribbon(L, climb=climb)
        t.canyon(s0 + 4.0, s0 + L - 3.0, 2.2, 2.9, ramp=4.0)
    elif kind == 'canyon-heal':
        t.put('pit', 15.0, 12.0, side=side)
        t.ribbon(L, climb=climb)
        t.canyon(s0 + 2.0, s0 + 14.0, 2.2, 2.9, ramp=3.5)
    elif kind == 'chicane':
        ribbon_exact(t, 16.0, climb=climb * 16 / L, swerves=1, swerve_deg=16, roll_deg=12, flags=O)
        t.mark('dash', 1.5, x=0.0)
        t.ribbon(L - 16.0, climb=climb * (L - 16) / L, flags=O)
    elif kind == 'chicane-mines':
        ribbon_exact(t, 16.0, climb=climb * 16 / L, swerves=2, swerve_deg=11, roll_deg=10, flags=O)
        for ahead, x in ((4.0, 0.0), (7.0, -0.8), (7.0, 0.8), (10.0, 0.0)):
            t.put('mine', ahead, x=x)
        t.ribbon(L - 16.0, climb=climb * (L - 16) / L, flags=O)


def design_scorch_strip():
    """DUST CUP 1, SCORCH STRIP (the drag strip): two paperclips of 31 m strips side by side, 4.5 m hairpins at
    their ends. The west one climbs three rounds (dunes, canyon gaps with 17 m to land, a canyon you ride the
    walls of, a chicane, kickers), a bend over the top at the north end joins the inner strips, the east one comes
    down two rounds, and a bend at the south end, under it all, comes back onto the start strip."""
    xi, zh, rh, rb = 4.0, 15.3, 4.5, 4.0              # the inner strips' |x|, the strips' ends, hairpins, bridges
    L = 2 * zh
    Lh = math.pi * rh
    y0, top = 2.0, 21.0
    t = Turtle((-xi, y0, -zh), (0, 0, 1))             # the start: the west paperclip's inner strip, north
    t.mark('start', 0)
    t.mark('pit', 12.0, side=1)
    west = ['start', 'dunes', 'jump', 'canyon', 'chicane', 'dunes-kick', 'jump']
    g = (top - y0) / (7 * L + 6 * Lh)
    for k, kind in enumerate(west):
        drag_strip(t, L, g * L, kind, side=-1)
        if k < len(west) - 1:
            t.turn(rh, 180, bank_deg=26, climb=g * Lh)
    t.turn(rb, -180, bank_deg=28)                     # the bend over the top: west to east
    east = ['dunes', 'jump', 'canyon-heal', 'chicane-mines', 'jump-heal']
    g = (t.p[1] - y0) / (5 * L + 4 * Lh)
    for k, kind in enumerate(east):
        drag_strip(t, L, -g * L, kind, side=-1)
        if k < len(east) - 1:
            t.turn(rh, 180, bank_deg=26, climb=-g * Lh)
    t.turn(rb, -180, bank_deg=24)                     # under it all, back west onto the start strip
    close_up(t, np.array([-xi, y0, -zh]))
    return t


def rim_side(t, L, climb, kind, side=1):
    """A side of RUST MESA's rim, with what it carries."""
    O = {'open'}
    s0 = t.s
    if kind == 'plain':
        t.ribbon(L, climb=climb)
    elif kind == 'dash':
        t.put('dash', L / 2 - 0.75, 1.5, x=0.0)
        t.ribbon(L, climb=climb)
    elif kind == 'mines':
        for ahead, x in ((L / 2 - 3, 0.0), (L / 2, -0.8), (L / 2, 0.8), (L / 2 + 3, 0.0)):
            t.put('mine', ahead, x=x)
        t.ribbon(L, climb=climb)
    elif kind == 'canyon':
        t.put('dash', 1.0, 1.5, x=0.0)
        t.ribbon(L, climb=climb)
        t.canyon(s0 + 3.0, s0 + L - 2.0, 2.2, 3.0, ramp=4.0)
    elif kind in ('jump', 'jump-dunes'):
        t.put('dash', 5.0, 1.5, x=0.0).put('jump', 9.15, 1.5).put('gap', 10.8, 3.8)   # 9 m to line up after the corner
        t.ribbon(L, climb=climb, flags=O, zones=[(10.8, 14.6, {'gap'})],
                 humps=(1 if kind == 'jump-dunes' else 0), hump=0.5)
    elif kind == 'dunes':
        t.put('kick', 3.0, 1.0, x=-0.5).put('kick', 9.0, 1.0, x=0.5)
        t.ribbon(L, climb=climb, humps=2, hump=0.5, flags=O)
    elif kind == 'chicane-heal':
        t.put('pit', 16.0, 11.0, side=side)
        ribbon_exact(t, 14.0, climb=climb * 14 / L, swerves=1, swerve_deg=17, roll_deg=12, flags=O)
        t.ribbon(L - 14.0, climb=climb * (L - 14) / L)


def design_rust_mesa():
    """DUST CUP 2, RUST MESA: a figure eight in the middle (lobes 6 m round, diagonals crossing 3.8 m over each
    other, dunes and chicanes) climbs three laps, an S at the top runs out to the rim, a rounded rectangle round
    the whole lot (29 m sides along it, 16 m across, 4 m corners) that comes down two rounds: canyon gaps with
    14 m to land, canyons you ride the walls of, dunes, a chicane, mines. The start is on the rim's east side."""
    r, c = 6.0, 8.8                                   # the figure eight inside (climbing)
    a, diag, lobe = eight_geometry(r, c)
    ad = math.degrees(a)
    Ll = math.radians(lobe) * r
    X, Z, rc = 12.0, 18.8, 4.0                        # the rim outside (coming down): its sides and corners
    Lx, Lz = 2 * (X - rc), 2 * (Z - rc)
    Lc = math.pi * rc / 2
    y0, zs = 2.0, 6.0
    t = Turtle((X, y0, zs), (0, 0, -1))               # the start: the rim's east side, south
    t.mark('start', 0)
    t.mark('pit', 12.0, side=1)
    t.straight(3).mark('dash', 1.5, x=0.0).straight(zs + Z - rc - 3)
    t.turn(rc, -90, bank_deg=20)                      # the south-east corner: west along the south side...
    lat = Z - (c + r)                                 # ...and in to the eight's south lobe
    t.straight(X - rc - 2 * 5.0 * math.sin(math.acos(1 - lat / 10.0)))
    sbend(t, -lat, 5.0, bank=14)
    t.turn(r, -(90 + ad), bank_deg=24)                # round the south lobe onto the first diagonal
    halves, rise = 6, 3.8
    dc = rise * diag / (diag + Ll); lc = rise - dc
    kinds = ['dunes', 'chicane', 'dash', 'dunes', 'chicane', 'dash']
    for k in range(halves):
        if kinds[k] == 'chicane':
            ribbon_exact(t, diag, climb=dc, swerves=1, swerve_deg=14, roll_deg=10, flags={'open'})
        elif kinds[k] == 'dunes':
            t.ribbon(diag, climb=dc, humps=2, hump=0.4, flags={'open'})
        else:
            t.put('dash', diag / 2 - 0.75, 1.5, x=0.0)
            t.ribbon(diag, climb=dc, flags={'open'})
        if k % 2 == 0:
            t.turn(r, lobe, bank_deg=28, climb=lc)
        elif k < halves - 1:
            t.turn(r, -lobe, bank_deg=28, climb=lc)
        else:
            t.turn(r, -(lobe - ad), bank_deg=28, climb=lc)   # the last south lobe: out at its west side, north
    sbend(t, X - r, 6.0, climb=0.5, bank=16)          # the S at the top: out to the rim's west side
    top = t.p[1]
    # the rim, two rounds down (left turns): west side north, north side east, east side south, south side west
    pieces = [('W', (Z - rc) - t.p[2], 'plain'), ('c',), ('N', Lx, 'dash'), ('c',), ('E', Lz, 'jump'), ('c',),
              ('S', Lx, 'mines'), ('c',), ('W', Lz, 'canyon'), ('c',), ('N', Lx, 'dunes'), ('c',),
              ('E', Lz, 'jump-dunes'), ('c',), ('S', Lx, 'dash'), ('c',), ('W', Lz, 'chicane-heal'), ('c',),
              ('N', Lx, 'plain'), ('c',), ('E', Z - rc - zs, 'canyon')]
    g = (top - y0) / sum(p[1] if p[0] != 'c' else Lc for p in pieces)
    for p in pieces:
        if p[0] == 'c':
            t.turn(rc, -90, bank_deg=24, climb=-g * Lc)
        else:
            rim_side(t, p[1], -g * p[1], p[2], side=-1)
    close_up(t, np.array([X, y0, zs]))
    return t


def design_sand_twister():
    """DUST CUP 3, SAND TWISTER: a D round the lot, its flat side a 26 m straight along the west edge and its round
    side one bend 18 m round (a canyon on it once, open edges once), climbs two and a half rounds; at the top it
    spirals in, a bend tangent to both, onto the twister inside it, which winds four and a half times down (a heal
    strip on its second turn), and spirals out onto the straight again. Every bend turns the same way."""
    xw, rc, za = -12.3, 5.0, 18.0                     # the D: its straight, its corners, its north and south ends
    ax, Ra = -4.3, 18.0                               # its big bend: centre x and radius
    hx, hr = 1.2, 6.0                                 # the twister inside: centre x and radius
    Lw = 2 * (za - rc)
    Lc = math.pi * rc / 2
    Ls = ax - (xw + rc)                               # the short straights at the north and south ends
    La = math.pi * Ra
    y0, top = 2.0, 24.0
    t = Turtle((xw, y0, 0.0), (0, 0, 1))              # the start: halfway up the straight, north
    t.mark('start', 0)
    t.mark('pit', 10.0, side=-1)
    g = (top - y0) / ((za - rc) + 2 * (Lc + Ls) + La + (Lw + 2 * (Lc + Ls) + La) + (Lw + Lc + Ls + La / 2))
    O = {'open'}

    def straight(kind):
        if kind == 'start':
            t.put('dash', 4.0, 1.5, x=0.4)
            t.ribbon(za - rc, climb=g * (za - rc))
            return
        if kind == 'kick-jump':                       # kickers first, then 8 m to land from them before the plate
            t.put('kick', 2.0, 1.0, x=-0.55).put('kick', 4.5, 1.0, x=0.55)
            j = 12.0
        else:
            t.put('dash', 4.5, 1.5, x=0.0)
            j = 8.2
        t.put('jump', j, 1.5).put('gap', j + 1.65, 3.8)                 # a canyon gap, 8.5 to 12 m to land
        t.ribbon(Lw, climb=g * Lw, humps=1 if kind == 'jump' else 0, hump=0.5, flags=O,
                 zones=[(j + 1.65, j + 5.45, {'gap'})])

    def corner_and_end():
        t.turn(rc, -90, bank_deg=22, climb=g * Lc)
        t.mark('dash', 1.5, x=0.0)
        t.ribbon(Ls, climb=g * Ls)

    def end_and_corner():
        t.ribbon(Ls, climb=g * Ls)
        t.turn(rc, -90, bank_deg=22, climb=g * Lc)

    def bend(kind, half=False):
        s0 = t.s
        L = La / 2 if half else La
        ang = -(90 if half else 180)
        if kind == 'canyon':
            t.turn(Ra, ang, bank_deg=10, climb=g * L)
            t.canyon(s0 + 8.0, s0 + L - 8.0, 2.4, 3.0, ramp=5.0)
        elif kind == 'open':
            t.put('pit', 20.0, 14.0, side=1)
            t.turn(Ra, ang, bank_deg=16, climb=g * L, flags=O)
        elif kind == 'mines':
            for ahead, x in ((14.0, 0.0), (18.0, -0.8), (18.0, 0.8), (22.0, 0.0)):
                t.put('mine', ahead, x=x)
            t.turn(Ra, ang, bank_deg=16, climb=g * L)

    straight('start'); corner_and_end(); bend('canyon'); end_and_corner()
    straight('jump'); corner_and_end(); bend('open'); end_and_corner()
    straight('kick-jump'); corner_and_end(); bend('mines', half=True)
    # the top: spiral in to the twister (a bend tangent to both), down it, and spiral out onto the straight
    t.turn(((ax + Ra) - (hx - hr)) / 2, -180, bank_deg=20, climb=-2.5, flags=O, ease=0.1)
    t.put('pit', 30.0, 16.0, side=-1)
    t.turn(hr, -360 * 4.5, bank_deg=28, climb=-(t.p[1] - 5.0), ease=0.02)
    t.turn(((hx + hr) - xw) / 2, -180, bank_deg=20, climb=y0 - t.p[1], ease=0.1)
    close_up(t, np.array([xw, y0, 0.0]))
    return t


DESIGNS = {'neon': ('NEON CITY', 0, lambda: design_neon_city()), 'pipe': ('SKY PIPE', 1, lambda: design_sky_pipe()),
           'drum': ('THE DRUM', 2, lambda: design_drum()),
           # the second and third cups: NOVA (space) and DUST (desert)
           'pulsar': ('PULSAR RUN', 3, design_pulsar_run, dict(blurb='TWIN EIGHTS: FLY THE OPEN CROSSINGS', env='space', cup=1)),
           'nebula': ('NEBULA KNOT', 4, design_nebula_knot, dict(blurb='HAIRPIN STACK, A PIPE, A SPIRAL PIPE', env='space', cup=1)),
           'orbit': ('ORBIT GATE', 5, design_orbit_gate, dict(blurb='A RING, A TWIST, A DRUM AND JUMPS', env='space', cup=1)),
           'scorch': ('SCORCH STRIP', 6, design_scorch_strip, dict(blurb='FOUR DRAG STRIPS, DUNES AND CANYONS', env='desert', cup=2)),
           'mesa': ('RUST MESA', 7, design_rust_mesa, dict(blurb='AN EIGHT INSIDE THE CANYON RIM', env='desert', cup=2)),
           'twister': ('SAND TWISTER', 8, design_sand_twister, dict(blurb='THE BIG BEND, THEN DOWN THE TWISTER', env='desert', cup=2))}

def more_heals(fr, features, total, every=95.0, length=12.0, gap=48.0):
    """Heal strips enough for a long course (about one every `every` metres): new ones go on flat stretches clear
    of the other features, as far as can be from the strips already there; along an edge where barriers stand,
    down the middle of the road (side 0) where the edges are open, so a heal never asks for a run along a drop."""
    n = len(fr)
    def ok(i):
        s, p, f, u, r, fl, k, h, sh = fr[i]
        return 'gap' not in fl and abs(k) < 1e-4 and u[1] > 0.9
    opened = lambda s0, s1: any('open' in fr[int(q) % n][5] for q in range(int(s0 / STEP), int(s1 / STEP) + 1))
    taken = [(f['s0'] - 2.0, f.get('s1', f['s0']) + 2.0) for f in features]
    free = lambda s0, s1: all(s1 < a or s0 > b for a, b in taken)
    pits = [f['s0'] for f in features if f['kind'] == 'pit']
    dist = lambda a, b: min(abs(a - b), total - abs(a - b))
    cands = []
    i = 0
    while i < n:
        if not ok(i):
            i += 1
            continue
        j = i
        while j < n and ok(j):
            j += 1
        s0, s1 = i * STEP, j * STEP
        for start in [s0 + 1.0 + k * 6.0 for k in range(int((s1 - s0 - length - 2.0) // 6.0) + 1)]:
            if start + length <= s1 - 1.0 and free(start, start + length):
                cands.append(start)
        i = j
    side = -1
    while len(pits) < round(total / every) and cands:
        best = max(cands, key=lambda c: min((dist(c, q) for q in pits), default=1e9))
        if pits and min(dist(best, q) for q in pits) < gap:
            break
        open_edge = opened(best, best + length)
        features.append({'kind': 'pit', 's0': round(best, 3), 's1': round(best + length, 3), 'side': 0 if open_edge else side})
        taken.append((best - 2.0, best + length + 2.0))
        pits.append(best)
        cands = [c for c in cands if free(c, c + length)]
        if not open_edge: side = -side
    features.sort(key=lambda f: f['s0'])


if __name__ == '__main__':
    out_json, out_png = sys.argv[1], sys.argv[2]
    name, ident, make, *meta = DESIGNS[sys.argv[3] if len(sys.argv) > 3 else 'neon']
    t = make()
    fr, total = frames(t)
    if meta and meta[0].get('cup', 0) >= 1:
        more_heals(fr, t.features, total)           # the later cups: more heal strips (round 17)
    ok = check(fr, total)
    draw(fr, t.features, out_png)
    bits = lambda fl: (1 if 'open' in fl else 0) | (2 if 'seam' in fl else 0)
    data = {'name': name, 'id': ident, **(meta[0] if meta else {}), 'length': total, 'step': STEP, 'width': WIDTH,
            'points': [[round(v, 4) for v in list(p) + list(u) + list(r)] + [int('gap' in fl), round(float(k), 5), round(float(h), 4), bits(fl), round(float(sh), 4)]
                       for s, p, f, u, r, fl, k, h, sh in fr],
            'features': t.features}
    json.dump(data, open(out_json, 'w'))
    print('OK' if ok else 'NEEDS WORK', len(fr), 'samples')
