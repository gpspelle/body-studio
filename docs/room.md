# A room around the body

Film a room (or a whole house) from inside it, and the body stands in it: to its own scale, on
its floor, walking round the furniture, sitting on the sofa or leaning on a wall.

## What happens

1. **The run keeps the room.** A room's video goes through splat-studio like a body's, with
   `--scene` (splat-studio [#55](https://github.com/gpspelle/splat-studio/pull/55)) instead of
   background removal and person masks. Fog removal normally keeps a sphere round the object the
   cameras look at; a room is filmed from inside, looking out, so that sphere would cut its walls
   off. With `--scene` it keeps everything within reach of where the camera went and drops only
   big faint splats in the air and what was seen far away through a window. The room's splat is
   `NAME_clean.ply`. The video's name goes in `rooms.json` in the data folder, so the library
   lists it as a room (`GET /api/rooms`), never as a body.
2. **A map, once per room** (`room.py`, `GET /api/room`, saved as `NAME_clean.room.json`):
   - **Up** is Brush's vertical axis. The floor's two directions are square with the walls: turned
     that way, the splats pile up in thin rows (the walls, the sides of the furniture), so the
     turn with the sharpest rows is taken; x is along the room's longer side.
   - **Floor and ceiling**: the lowest and the highest wide flat layers of opaque splats (a
     histogram of heights).
   - **Size in metres**: a phone filming a room is held at about 1.45 m, so the camera path's
     height over the floor gives the scale. An iPhone capture from Splat Capture (ARKit) is in
     metres already. With no cameras, the ceiling is taken as 2.5 m high. The Room menu has a
     **Size** slider (80–125%) for when it is off; it is kept per room in the browser.
   - **5 cm cells**: each cell counts its opaque splats in 5 cm steps of height (with the 8 cells
     round it, so a sparse scan has no holes). A cell is walkable where the floor was seen and
     nothing stands between 15 cm and 1.8 m: a rug is walkable, a table, a chair's legs or a wall
     are not, and a lamp hanging from the ceiling isn't in the way. Each cell also keeps the highest
     surface under 1.2 m with 45 cm free above it, and how tall what stands in it is (walls are
     1.5 m or more).
   - **Seats**: flat surfaces 30–65 cm high (a table top, at 72 cm or more, isn't one), at least
     0.1 m², next to free floor. On each, places to sit 26 cm in from the front edge, 55 cm apart
     (a sofa has several), facing the free floor, with a back if something taller stands behind.
   - **Start**: the free floor nearest the middle of the camera path, with 30 cm all round.
3. **The page** (`house.js`, maths in `room.js`): the room's splats go in the same group as the
   body, through one matrix (the room's PLY coordinates → map metres → the body's coordinates),
   so the room's free floor at the start is under the body's feet, facing the way with the most
   room ahead. The body's height in metres (from the Try on panel, or the person's in Progress)
   sets the scale.
   - **Walking**: every step the walker (`walk.js`) asks the room where the body may go
     (`Walker.bound`). The body keeps 20 cm from walls and furniture, in half-cell steps, so it
     can't step through anything thin; walking into a wall at a slant slides along it.
   - **F**: sits down on the seat whose front is within 90 cm, else leans on a wall within 70 cm,
     else nothing. Sitting turns the body to face away from the seat, steps it over and bends the
     hips, knees and ankles; the angles are searched so that the thighs lie along the seat (the
     knees no lower than the hips, or they would go through the seat's front) and the feet reach
     the floor, toes pointed if they must. The hips are then put on the seat (the hip joint about
     9 cm above it), so on a seat high for the legs the feet hang a little, as they do. With a
     back, the body leans back 6°. Leaning: the back of the chest on the wall, the body tilted
     back 8° from its feet, knees a little bent. Only a wall with free floor right out from its
     face counts: a TV on its console or a bookshelf is tall like a wall, but the body would go
     into what stands in front of it. **F** again, or a key to walk, gets up, back where it
     stood. The walk hint says what F does where the body is.
   - **The camera stays inside**: on choosing a room the camera goes where it sees the most of
     the room with the body in it (at eye height, in front of the body when it can). Each frame,
     a camera behind a wall or above the ceiling is drawn from the last place it sees the body
     from; the orbit itself isn't changed, so turning back round gives the same view.
   - The clothes shop around the body isn't shown in a room: the room's own furniture is there.

## The sample living room

Before any room is filmed, the Room menu has **Sample living room** (`sample_room.py`): a 5.5 ×
4.5 m room, 2.6 m high, drawn by the app as about 480,000 flat splats on boxes, cylinders and a
leafy plant. A sofa (three places to sit) with a picture above it, an armchair by the window, a
bookshelf, a TV on its console, a dining table, a floor lamp, a rug and a door. It is written like
a room run (`workspace/_sample_room/run_sample/splat/living_room_clean.ply`, y-down, with a COLMAP
camera loop 1.45 m up), so it is mapped and shown like a filmed room, and listed last. It is made
the first time the rooms are listed (a few seconds, 26 MB) and again only when its `VERSION`
changes.

## Filming a room

- Walk slowly round the room, the phone at chest height, pointing at the walls; turn slowly. Get
  the floor in view (tilt down a little) and, if you can, the ceiling: both help find the size.
- One continuous take, 1–3 minutes for a room. For a house, walk from room to room without
  stopping; doorways need slow, overlapping steps.
- Lights on, curtains as they are. Mirrors, windows and glass tables come out blurry or doubled.
- Put **Add a room…** in the Room menu (or `body-studio room VIDEO`) so it's kept whole.

## Limits and next steps

- **Flat floors only.** Steps, stairs and a sunken living room are walls to the map. A height
  map of the floor would let the body climb a step.
- **The scale is a guess** from the camera height (±10% if the phone was held higher or lower).
  A door (about 2 m) or the ceiling, when both are seen, could check it.
- **No lighting match**: the body keeps the light it was filmed in. Relighting needs the room's
  light, which a splat doesn't separate from its colours.
- **Seats are flat tops.** A bed or a low wall counts if it is 30–65 cm high; an armchair's
  arms or a sloping back cushion aren't modelled. Lying down (on a bed or the sofa) and putting
  a hand on a table are the next poses to add.
- **The body doesn't hide behind furniture by depth.** Splats of the body and the room are sorted
  together, which is right when they don't overlap; a body sitting deep in a fluffy cushion can
  show through it.
