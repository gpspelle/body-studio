"""The sample wedding venue's fittings and fixtures (sample_venue.py draws the rest): what the page
draws as it draws the decor (decor.js starters) - skirting boards, spotlights, doors, counters,
mirrors, cubicles, the planted walls, the trees and the garden's glass rain cover - placed on the
plan in venue_plan.py."""
from __future__ import annotations

import math

from . import sample_room as base
from .venue_plan import *  # noqa: F403  (the plan's names, as sample_venue uses them)

def _along(item, x0, x1, z, turn, width, depth=0.0):
    """Copies of a decor starter `width` wide in a row along x from x0 to x1 at z, each stretched a
    little so the row fits; `depth` out from z (on the side it faces)."""
    n = max(1, math.ceil((x1 - x0) / width - 0.01))
    w = (x1 - x0) / n
    zz = z + depth * math.cos(turn)
    return [{"item": item, "at": [x0 + (k + 0.5) * w, 0.0, round(zz, 3)], "turn": turn, "scale": [round(w / width, 4), 1, 1]}
            for k in range(n)]


def fittings() -> list:
    """The way in's fittings, drawn by the page as the decor and furniture are (sample_room's
    FIXTURES): wooden skirting boards along the white walls, small floor spotlights, the
    reception's track light, exit signs, a speaker and the vertical garden's tied-back sheer
    curtains, the toilets' counters, mirrors and cubicles. Each (item, (x, y, z), turn, colour or None,
    length or its knobs or None); turn 0 faces +z."""
    out = []
    rx0, rx1 = RECEPTION[:2]
    ax0, ax1 = ANTE[:2]
    for x0, x1, z, turn in ((rx0, rx1, 0.0, 0.0), (rx0, -18.7, 4.0, math.pi), (-17.8, rx1, 4.0, math.pi),
                            (ax0, ax1, 0.0, 0.0), (ax0, ax1, 3.98, math.pi)):
        out.append(("skirting_board", ((x0 + x1) / 2, 0.0, z), turn, SKIRTING_BOARD, x1 - x0))
    out.append(("skirting_board", (ax1, 0.0, NOTCH[2] / 2 + 0.1), -math.pi / 2, SKIRTING_BOARD, NOTCH[2] + 0.2))
    lamps = [(x, z) for x, z in RECEPTION_LAMPS] + [(VERTICAL[0] + 0.75 + 1.0 * k, z) for k in range(4) for z in (0.0, 4.0)]
    lamps += [(x, z) for x in ANTE_SPOTS for z in (0.0, 4.0)]
    for x, z in lamps:
        out.append(("floor_spot", (x, 0.0, 0.15 if z == 0.0 else 3.85), 0.0 if z == 0.0 else math.pi, None, None))
    track = RECEPTION[1] - 0.2 - TRACK[0]
    out.append(("track_light", (TRACK[0] + track / 2, H - 0.24, TRACK[1]), 0.0, None, track))
    out += [("exit_sign", (-16.5, 2.25, 0.0), 0.0, EXIT_GREEN, None), ("exit_sign", (-18.95, 1.95, 4.0), math.pi, EXIT_GREEN, None),
            ("wall_speaker", (-15.3, 2.4, 0.0), 0.0, (0.07, 0.07, 0.07), None),
            ("wall_speaker", (ANTE[0] + 0.55, 2.55, 3.98), math.pi, (0.07, 0.07, 0.07), None)]
    # the front door's two big leaves of rusted steel (the nearly shut one with a long bar)
    for k, (hinge, width, swing) in enumerate(FRONT_LEAVES):
        at = (RECEPTION[0] + 0.02 + width / 2 * math.sin(swing), LANDING[1], hinge + width / 2 * math.cos(swing))
        out.append(("pivot_door", tuple(round(v, 3) for v in at), round(swing - math.pi / 2, 4), RUST, {"w": width, "h": 2.85, "bar": int(k == 0)}))
    # the floors in slabs and tiles, their joints where the walkthrough has them: the reception's
    # and the vertical garden's polished cement, the ante-room's pale slabs, the kitchen's tiles
    lx = RECEPTION[0] + LANDING[0]
    for (x0, x1), colour, (tx, tz) in (((lx, VERTICAL[0]), POLISHED, (1.5, 2.0)), (VERTICAL[:2], POLISHED, (1.5, 2.0)),
                                       ((ANTE[0], ANTE[1] - ANTE_TILES), SLAB, (2.5, 4 / 3))):
        out.append(("tile_floor", (round((x0 + x1) / 2, 3), 0.0, 2.0), 0.0, colour, {"w": round(x1 - x0, 3), "d": 4.0, "tx": tx, "tz": tz, "matte": 1}))
    # the hall's rustic tiles drawn as the furniture is, each 40 cm tile its own (from the ante-room's
    # end to where the cement starts), their joints on the floor's own 40 cm grid
    for x0, x1, z0, z1 in ((ANTE[1] - ANTE_TILES, ANTE[1], ANTE[2], ANTE[3]), (HALL[0], NOTCH[1], NOTCH[2], HALL[3]),
                           (NOTCH[1], TILES_END, HALL[2], HALL[3])):
        out.append(("rustic_tiles", (round((x0 + x1) / 2, 3), 0.0, round((z0 + z1) / 2, 3)), 0.0, None,
                    {"w": round(x1 - x0, 3), "d": round(z1 - z0, 3), "ox": round(-x0 % 0.4, 3), "oz": round(-z0 % 0.4, 3)}))
    # the side room's and its corridor's dark stone tiles, and skirting boards along their khaki walls
    end, w = CORRIDOR
    sx0, sx1, sz0, sz1 = SIDE
    for x0, x1, z0, z1 in ((end, NOTCH[1], 0.0, w), (sx0, sx1, sz0, sz1)):
        out.append(("tile_floor", (round((x0 + x1) / 2, 3), 0.0, round((z0 + z1) / 2, 3)), 0.0, SIDE_TILE,
                    {"w": round(x1 - x0, 3), "d": round(z1 - z0, 3), "tx": 0.5, "tz": 0.5, "ox": round(-x0 % 0.5, 3), "oz": round(-z0 % 0.5, 3), "matte": 1, "grout": 0.006}))
    ga, gb = GARDEN_DOOR
    d0, d1 = SIDE_DOOR
    for x0, x1, z, turn in ((end, NOTCH[1], w, math.pi), (end, d0 - 0.07, 0.0, 0.0), (d1 + 0.07, NOTCH[1], 0.0, 0.0),
                            (sx0, d0 - 0.07, sz1, math.pi), (d1 + 0.07, sx1, sz1, math.pi), (sx0, ga - 0.08, sz0, 0.0), (gb + 0.08, sx1, sz0, 0.0)):
        if x1 - x0 > 0.5:                              # (none in the short bit by the door's frame)
            out.append(("skirting_board", (round((x0 + x1) / 2, 3), 0.0, z), turn, SKIRTING_BOARD, round(x1 - x0, 3)))
    for z0, z1, x, turn in ((0.0, w, end, math.pi / 2), (sz0, sz1, sx0 + 0.02, math.pi / 2), (sz0, sz1, sx1, -math.pi / 2)):
        out.append(("skirting_board", (x, 0.0, round((z0 + z1) / 2, 3)), turn, SKIRTING_BOARD, round(z1 - z0, 3)))
    # the vertical garden's curtains, each tied back to the wooden post (or the doorway's frame) beside it
    for x, turn, ties in ((VERTICAL[0] + 0.2, -math.pi / 2, ((0.35, 1), (3.65, 0))), (VERTICAL[1] - 0.2, math.pi / 2, ((0.6, 0), (3.4, 1)))):
        out += [("sheer_curtain", (x, 0.0, z), turn, SHEER, {"tie": 0.25, "left": left}) for z, left in ties]
    # the kitchen: stainless sink benches under its windows, a gas range in the middle under a
    # hood, its duct along the ceiling to the windows' wall; a fire extinguisher on its far wall
    kx0, _, _, kz1 = KITCHEN
    out += [("steel_sink", (x, 0.0, kz1 - 0.33), math.pi, None, 3.0) for x in (kx0 + 2.3, kx0 + 5.9)]
    stove = (kx0 + 4.5, 5.8)
    out += [("gas_range", (stove[0], 0.0, stove[1]), math.pi / 2, None, None),
            ("steel_hood", (stove[0], 2.45, stove[1]), math.pi / 2, None, None),
            ("steel_duct", ((stove[0] + kx0 + 0.4) / 2, H - 0.3, stove[1]), 0.0, None, round(stove[0] - kx0 - 0.4, 3)),
            ("steel_duct", (kx0 + 0.4, H - 0.3, (stove[1] + KITCHEN_DOORS[1][1]) / 2), math.pi / 2, None, round(KITCHEN_DOORS[1][1] - stove[1], 3)),
            ("fire_extinguisher", (kx0, 0.95, 6.15), math.pi / 2, None, None)]
    kx1, kz0 = KITCHEN[1], KITCHEN[2]
    out.append(("tile_floor", ((kx0 + kx1) / 2, 0.0, (kz0 + kz1) / 2), 0.0, KITCHEN_TILE, {"w": round(kx1 - kx0, 3), "d": round(kz1 - kz0, 3), "tx": 0.45, "tz": 0.45}))
    # (white tiles up its walls: under the windows, along the ante-room's side, round the doors)
    out.append(("wall_tiles", ((kx0 + kx1) / 2, 0.0, kz1 - 0.005), math.pi, TILE_WHITE, {"w": round(kx1 - kx0, 3), "h": 1.4}))
    out.append(("wall_tiles", ((kx0 + kx1) / 2, 0.0, kz0 + 0.035), 0.0, TILE_WHITE, {"w": round(kx1 - kx0, 3), "h": 2.2}))
    a, b = KITCHEN_WAY_OUT
    (d0, d1), (m0, m1) = KITCHEN_DOORS
    for z0, z1 in ((kz0, d0), (d1, a), (b, m0), (m1, kz1)):
        out.append(("wall_tiles", (kx0 + 0.005, 0.0, (z0 + z1) / 2), math.pi / 2, TILE_WHITE, {"w": round(z1 - z0, 3), "h": 2.2}))
    h0, h1 = HATCH
    for z0, z1, h in ((kz0, h0, 2.2), (h0, h1, 1.0), (h1, KITCHEN_DOOR[0], 2.2), (KITCHEN_DOOR[1], kz1, 2.2)):
        out.append(("wall_tiles", (kx1 - 0.005, 0.0, (z0 + z1) / 2), -math.pi / 2, TILE_WHITE, {"w": round(z1 - z0, 3), "h": h}))
    # its doors: the far wall's brown and maroon ones shut, its own door on the hall swung in against
    # the wall; the passage's dark panelled door ajar at its end
    for (z0, z1), c in zip(KITCHEN_DOORS, ((0.36, 0.20, 0.15), (0.42, 0.12, 0.12))):
        out.append(("panel_door", (kx0 + 0.02, 0.0, (z0 + z1) / 2), math.pi / 2, c, {"w": round(z1 - z0 - 0.1, 3), "h": 2.15}))
    a0, a1 = KITCHEN_DOOR
    out.append(("panel_door", (-(a1 - a0) / 2, 0.0, a1 - 0.03), math.pi, DOOR, {"w": round(a1 - a0, 3), "h": 2.2, "rows": 5}))
    hx_, hz_, w_, open_ = PASSAGE_DOOR
    out.append(("panel_door", (round(hx_ - w_ / 2 * math.cos(open_), 3), 0.0, round(hz_ - w_ / 2 * math.sin(open_), 3)), round(math.pi - open_, 4), DOOR, {"w": w_, "h": 2.1, "rows": 5}))
    # the bricks drawn as the furniture is: the half wall (pale, the fireplace's hole left in its
    # hall side), the toilets' hall's walls (a passage to the stage), the pier at the corner
    hx, reach = HALF_WALL
    a, b, y0, y1 = FIREPLACE
    pale = FIREPLACE_BRICK
    for z0, z1, f0, f1 in ((0.0, a, 0.0, H), (b, reach, 0.0, H), (a, b, 0.0, y0), (a, b, y1, H)):
        out.append(("brick_wall", (hx - 0.1, f0, (z0 + z1) / 2), -math.pi / 2, pale, {"w": round(z1 - z0, 3), "h": round(f1 - f0, 3)}))
    out.append(("brick_wall", (hx + 0.1, 0.0, reach / 2), math.pi / 2, pale, {"w": reach, "h": H}))
    out.append(("brick_wall", (hx, 0.0, reach), 0.0, pale, {"w": 0.2, "h": H}))
    out.append(("brick_bench", (hx + 0.1 + 0.25, 0.0, reach / 2), math.pi / 2, (0.88, 0.84, 0.76), round(reach - 0.3, 3)))
    wx1, wz = WC[1], WC[2]
    out.append(("brick_wall", (wx1 - 1.25, 0.0, wz), math.pi, BRICK, {"w": 2.5, "h": H}))
    s0, s1 = TO_STAGE
    for z0, z1, f0, f1 in ((0.0, s0, 0.0, H), (s1, wz, 0.0, H), (s0, s1, TO_STAGE_TOP, H)):
        out.append(("brick_wall", (wx1, f0, (z0 + z1) / 2), -math.pi / 2, BRICK, {"w": round(z1 - z0, 3), "h": round(f1 - f0, 3)}))
    out.append(("brick_pier", (PIER[0], 0.0, PIER[1]), 0.0, BRICK, {"w": 0.4, "d": 0.4, "h": H}))
    out.append(("plain_counter", (wx1 - 1.3, 0.0, sum(COUNTER_Z) / 2), -math.pi / 2, (0.10, 0.10, 0.10), {"w": round(COUNTER_Z[1] - COUNTER_Z[0], 3), "d": 0.6, "h": 1.05}))
    out += [("sink_cabinet", (wx1 - 0.23, 0.0, SINK_Z), -math.pi / 2, (0.24, 0.16, 0.11), None),
            ("round_mirror", (wx1, 1.2, SINK_Z), -math.pi / 2, None, None),
            ("dome_pendant", (wx1 - 0.55, H - 1.2, SINK_Z), 0.0, (0.80, 0.42, 0.16), None)]
    # the toilets' signs over their doors, the ladies' changing table, the gents' mosaic splashback
    out += [("door_sign", ((a0 + a1) / 2, 2.3, 0.0), 0.0, None, {"man": k}) for k, (a0, a1) in enumerate(WC_DOORS)]
    out.append(("changing_table", (CHANGING[0] + 0.275, 0.0, (CHANGING[2] + CHANGING[3]) / 2), math.pi / 2, None, None))
    out.append(("mosaic_splash", (GENTS[1], 0.84, -1.65), -math.pi / 2, (0.70, 0.62, 0.52), {"w": 1.3, "h": 0.46}))
    # the hall's dining side: a row of downlights over its brick end
    out += [("downlight", (HALF_WALL[0] - 0.35, H - 0.02, 0.35 + 0.5 * k), 0.0, None, None) for k in range(6)]
    # the ante-room: an orange saucer of a wall light near its end
    out.append(("saucer_light", (ANTE[1] - 1.7, 1.95, 0.0), 0.0, SAUCER, {"drop": 1.2}))   # (hung from the ceiling on a cord)
    # the slim pillar where the ante-room opens on the hall: a camera and a speaker high on it, an
    # exit sign on the wall beside it, a floor light at its foot
    pz = NOTCH[2] + 0.2
    out += [("security_camera", (-0.06, 2.75, pz), 0.0, None, None), ("wall_speaker", (-0.06, 2.4, pz), 0.0, (0.07, 0.07, 0.07), None),
            ("exit_sign", (0.95, 2.0, NOTCH[2]), 0.0, EXIT_GREEN, None), ("floor_spot", (0.4, 0.0, NOTCH[2] + 0.15), 0.0, None, None)]
    # the hall: skirting along its white walls (not the toilets' hall's), uplights, its curtains
    # tied back each side of each set of windows, short track lights on its ceiling
    hx0, hx1, _, hz1 = HALL
    nx, nz = NOTCH[1], NOTCH[2]
    for x0, x1, z, turn in ((hx0, hx1, hz1, math.pi), (hx0, nx, nz, 0.0), (nx, HALF_WALL[0], 0.0, 0.0)):
        out.append(("skirting_board", ((x0 + x1) / 2, 0.0, z), turn, SKIRTING_BOARD, x1 - x0))
    out.append(("skirting_board", (hx0, 0.0, (4.0 + KITCHEN_DOOR[0]) / 2), math.pi / 2, SKIRTING_BOARD, KITCHEN_DOOR[0] - 4.0))
    windows, lights = hall_windows()
    out += [("floor_spot", (x, 0.0, hz1 - 0.15), math.pi, None, None) for x in lights]
    out += [("floor_spot", (hx0 + 0.3, 0.0, 3.6), math.pi / 2, None, None)]
    for j in range(3):
        a, b = windows[3 * j][0], windows[3 * j + 2][1]
        mids = [(windows[3 * j + k][1] + windows[3 * j + k + 1][0]) / 2 for k in range(2)]   # (and in front of the mullions between)
        out += [("sheer_curtain", (round(c, 3), 0.0, hz1 - 0.12), math.pi, SHEER, {"full": 2.2}) for c in (a - 0.3, *mids, b + 0.3)]   # (wide, gathered at the tie)
    for x, z in ((2.5, 4.0), (6.5, 2.6), (6.5, 6.4), (10.5, 2.6), (10.5, 6.4), (14.5, 2.6), (14.5, 6.4)):
        out.append(("track_light", (x, H - 0.24, z), math.pi / 2, None, 1.2))   # (across the hall)
    out += [("sheer_curtain", (hx1 - 0.2, 0.0, z), -math.pi / 2, SHEER, None) for z in (WC[2] + 0.75, hz1 - 0.35)]
    # the pergola: its woven reed roof on the beams, black track lights along the middle beams,
    # up-and-down lights between the strips on its wall, an exit sign by the hall
    px0, px1, pz0, pz1 = PERGOLA
    out.append(("reed_roof", ((px0 + px1) / 2, PERGOLA_ROOF, (pz0 + pz1) / 2), 0.0, REED, {"w": round(px1 - px0, 3), "d": round(pz1 - pz0, 3)}))
    out += [("track_light", (x, PERGOLA_ROOF - 0.22 - 0.24, (pz0 + pz1) / 2), math.pi / 2, None, 2.0) for x in pergola_beams()[1:4]]
    out += [("wall_sconce", (x + side, 2.3, pz1), math.pi, None, None) for x in strips() for side in (-0.7, 0.7)]
    out.append(("exit_sign", (px0 + 2.4, 2.3, pz1), math.pi, EXIT_GREEN, None))
    # the sky over it all, blue as filmed (seen through the garden's glass cover, over the beach)
    out.append(("sky_dome", (GARDEN_X, -30.0, GARDEN_W / 2), 0.0, None, None))
    # the toilets: downlights in their ceilings; in the ladies' a wooden counter on the wall at the
    # door's left with two bowls and two round mirrors, two cubicles at the far end (the first one's
    # door open); in the gents' the trough on the far wall, a cubicle, a counter with one bowl and a
    # mirror on a strap; a green glass globe on the wall between them, on each side
    for x0, x1, z0, z1 in (LADIES, GENTS):
        out += [("downlight", (x, WC_CEILING - 0.02, z), 0.0, None, None) for x in (x0 + 0.9, x1 - 0.9) for z in (z0 + 1.0, z1 - 1.0)]
    lx0, lx1, z0, _ = LADIES
    gx0, gx1 = GENTS[:2]
    counter, lattice = (0.30, 0.16, 0.10), (0.18, 0.11, 0.07)
    out.append(("wash_counter", (lx0 + 0.25, 0.78, -0.85), math.pi / 2, counter, 1.5))
    out += [("round_mirror", (lx0, 1.22, z), math.pi / 2, None, None) for z in (-0.45, -1.25)]
    fx, fz, n = LADIES_STALLS                           # (three in a row along its right wall, facing its left; the middle one's lattice door open)
    w = (fz - z0) / n
    out += [("toilet_cubicle", ((fx + lx1) / 2, 0.0, fz - w * (k + 0.5)), -math.pi / 2, lattice, {"w": round(w, 3), "d": round(lx1 - fx, 3), "open": int(k == 1), "plain": int(k != 1)}) for k in range(n)]
    out.append(("trough_urinal", (gx0 + 1.4, 0.0, z0 + 0.175), 0.0, (0.16, 0.16, 0.17), 2.2))
    out.append(("toilet_cubicle", (gx1 - 0.6, 0.0, (z0 - 2.7) / 2), 0.0, (0.62, 0.46, 0.30), {"w": 1.2, "d": 1.3, "plain": 1}))
    out.append(("wall_plates", (gx0 + 0.01, 0.0, -1.6), math.pi / 2, None, None))   # (three woven plates by the gents' door)
    out.append(("wash_counter", (gx1 - 0.25, 0.78, -1.65), -math.pi / 2, counter, 1.3))
    out.append(("strap_mirror", (gx1, 1.29, -1.65), -math.pi / 2, None, None))
    out += [("globe_lamp", (lx1 - 0.01, 2.28, -1.6), -math.pi / 2, (0.80, 0.92, 0.74), None),
            ("globe_lamp", (lx1 + 0.01, 2.28, -1.6), math.pi / 2, (0.80, 0.92, 0.74), None)]
    # the lights sunk in the floor along the bare brick on the pergola's side; the side room's glass
    # doors and the planted patio's terracotta through them
    out += [("sunk_light", (WC[1] - 2.2 + 0.7 * k, 0.0, WC[2] + 0.12), 0.0, None, None) for k in range(4)]
    ga, gb = GARDEN_DOOR
    sx0, sx1, sz0, _ = SIDE
    out.append(("glass_pane", ((ga + gb) / 2, 0.0, sz0), 0.0, (0.80, 0.86, 0.87), {"w": gb - ga, "h": 2.4}))
    out.append(("tile_floor", ((sx0 + sx1) / 2, -0.01, sz0 - 1.0), 0.0, (0.52, 0.33, 0.24), {"w": sx1 - sx0, "d": 2.0, "tx": 0.3, "tz": 0.3, "matte": 1}))
    # (a skirting board longer than a starter can be made, 5 m, laid as several end to end)
    boards = []
    for f in out:
        item, (x, y, z), turn, colour, length = f
        n = math.ceil(length / BOARD) if item == "skirting_board" else 1
        if n == 1:
            boards.append(f)
            continue
        along = (abs(math.cos(turn)), abs(math.sin(turn)))   # (turn 0: along x)
        for k in range(n):
            u = (k + 0.5) * length / n - length / 2
            boards.append((item, (x + u * along[0], y, z + u * along[1]), turn, colour, length / n))
    return boards


def fixtures() -> dict:
    """What the page is told besides the splat (room.py's map, in its metres): the trees, and the
    things it draws as it draws the decor (decor.js starters), so they look as the decor does: the
    planted walls, the borders along the garden's walls and the glass rain cover over it."""
    props = [dict({"item": item, "at": [x, 0.0, z]}, **({"scale": [TREE_SCALE[item]] * 3} if item in TREE_SCALE else {})) for x, z, item in TREES]
    for item, at, turn, colour, length in fittings():
        t = {"item": item, "at": [round(v, 4) for v in at], "turn": round(turn, 4)}
        if colour:
            t["colour"] = base.hexed(colour)
        if isinstance(length, dict):
            t["opts"] = length
        elif length:
            t["opts"] = {"w": round(length, 3)}
        props.append(t)
    # the planted patio beyond the side room's glass doors
    props += _along("tropical_border", SIDE[0], SIDE[1], SIDE[2] - 2.0, 0.0, 2.0, 0.0)
    x0, x1 = VERTICAL[:2]
    props += _along("living_wall", x0, x1, 0.0, 0.0, 2.0, 0.15)
    props += _along("living_wall", x0, x1, 4.0, math.pi, 2.0, 0.15)
    # the vertical garden's glass roof light, a cluster of rattan lamps hung in it
    cx, cz = (x0 + x1) / 2, (VERTICAL[2] + VERTICAL[3]) / 2
    props += [{"item": "glass_lantern", "at": [cx, 0.0, cz], "scale": [round(LANTERN[0] / 4.5, 4), 1, round(LANTERN[1] / 4.0, 4)]},
              {"item": "gourd_pendants", "at": [cx, 0.2, cz], "scale": [1.0, 1.2, 1.0]}]   # (a tight cluster, hung low under the glass)
    # the jute ceilings: with black bands over the ante-room, plain over the stage
    for item, (a0, a1, b0, b1) in (("jute_ceiling", ANTE), ("jute_swags", STAGE[:4])):
        nx = max(1, round((a1 - a0) / 4.0))
        props += [{"item": item, "at": [round(a0 + (k + 0.5) * (a1 - a0) / nx, 3), 0.0, (b0 + b1) / 2],
                   "scale": [round((a1 - a0) / nx / 4.0, 4), 1, round((b1 - b0) / 4.0, 4)]} for k in range(nx)]
    # the beds along the garden's dark walls
    for z, turn, x0 in ((0.0, 0.0, GARDEN_X), (GARDEN_W, math.pi, PERGOLA[0])):
        props += _along("tropical_border", x0 + 0.3, garden_end(z) - 0.5, z, turn, 2.0, 0.95)
    # climbers and bougainvillea falling over the pergola's edge on the garden
    px1, pz1 = PERGOLA[1], PERGOLA[3]
    props += [{"item": "hanging_greenery", "at": [px1 - 0.6, 0.3, z]} for z in (4.6, 7.0)]
    props += [{"item": "bougainvillea_cloud", "at": [px1 - 0.6, 0.3, pz1 - 1.0], "turn": round(math.pi / 2, 4)}]
    # rattan lamps hung down the middle of the glass cover, either side of the aisle
    # (none by the bungalow's front: Gabriel, none there)
    props += [{"item": "wicker_pendant", "at": [round(GARDEN_X + 2.0 + 4.0 * k, 3), 0.5, GARDEN_W / 2 + side]}
              for k in range(int(COVER_LEN / 4.0)) for side in (-3.0, 3.0)
              if not (side > 0 and BUNGALOW[0] - 1.0 < GARDEN_X + 2.0 + 4.0 * k < BUNGALOW[1])]
    # plants round the bungalow's deck, at its ends and behind it
    bx0, bx1, bz0, bz1 = BUNGALOW
    for x, turn in ((bx0 - 1.0, -math.pi / 2), (bx1 + 1.0, math.pi / 2)):
        props += [{"item": "tropical_border", "at": [x, 0.0, round(bz0 + 1.2 + 2.0 * k, 3)], "turn": round(turn, 4)} for k in range(2)]
    # the low wall of dark stones where the garden meets the beach, open in the middle for the path
    # down to it, in lengths of about 3.4 m; on it a low clipped hedge
    (ax, az), L, (tx, tz), (nx, nz) = far_side()
    for u0, u1 in ((0.0, L * (0.5 - SEA_GAP)), (L * (0.5 + SEA_GAP), L)):
        n = max(1, math.ceil((u1 - u0) / 3.4))
        for k in range(n):
            u = u0 + (k + 0.5) * (u1 - u0) / n
            props.append({"item": "stone_wall", "at": [round(ax + tx * u + 0.5 * nx, 3), 0.0, round(az + tz * u + 0.5 * nz, 3)],
                          "turn": round(-math.atan2(tz, tx), 4), "opts": {"w": round((u1 - u0) / n, 3)}})
    for k in range(int(L / 2.0)):
        u = (k + 0.5) * 2.0
        if abs(u / L - 0.5) > SEA_GAP + 0.04:
            props.append({"item": "tropical_border", "at": [round(ax + tx * u + 0.5 * nx, 3), 0.45, round(az + tz * u + 0.5 * nz, 3)],
                          "turn": round(-math.atan2(tz, tx), 4), "scale": [1, 0.35, 0.3]})
    # the fans on the walls: the hall's, between its sets of windows; the pergola's, on its far wall;
    # one on the brick column at the hall's end
    hx0, hx1, _, hz1 = HALL
    gap = (hx1 - hx0 - 3 * 3 * 1.1) / 4
    # (each 20 cm out from its wall: its bracket's depth)
    props += [{"item": "wall_fan", "at": [round(hx0 + gap * (j + 0.5) + 3.3 * j, 3), 2.0, hz1 - 0.2], "turn": round(math.pi, 4)} for j in (1, 2)]
    props += [{"item": "wall_fan", "at": [x, 2.0, PERGOLA[3] - 0.2], "turn": round(math.pi, 4)} for x in (20.6, 25.8)]
    # rattan lamps hung in the tree under the cover
    tx, tz = TREES[0][:2]
    props += [{"item": "wicker_pendant", "at": [round(tx + dx, 3), -0.2, round(tz + dz, 3)]} for dx, dz in ((-1.2, 0.5), (0.9, 1.0), (0.2, -0.9))]
    # pink flowering shrubs at the foot of the pergola's corner pier by the garden
    props += [{"item": "pink_shrub", "at": [round(PERGOLA[1] + 0.6, 3), 0.0, round(z, 3)]} for z in (PIERS[1] - 0.9, PIERS[1] + 0.6)]
    # agaves along the bungalow's front, either side of its steps
    bx0, bx1, bz0, bz1 = BUNGALOW
    props += [{"item": "agave", "at": [round(x, 3), 0.0, round(z, 3)]}
              for x, z in ((bx0 + 0.8, bz0 - 0.6), (bx0 + 2.6, bz0 - 0.6), (bx1 - 2.6, bz0 - 0.6), (bx1 - 0.8, bz0 - 0.6))]
    # fans on the brick piers, turned to the garden
    props += [{"item": "wall_fan", "at": [round(PERGOLA[1] + 0.28, 3), 2.0, round(z, 3)], "turn": round(math.pi / 2, 4)} for z in PIERS]
    bays = round(COVER_LEN / 3.3)
    props += [{"item": "glass_roof", "at": [round(GARDEN_X + (k + 0.5) * COVER_LEN / bays, 3), 0.0, GARDEN_W / 2],
               "scale": [round(COVER_LEN / bays / 3.3, 4), 1, 1]} for k in range(bays)]
    return {"trees": props}
