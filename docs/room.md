# A room around the body

Film a room (or a whole house) from inside it, and the body stands in it: to its own scale, on
its floor, walking round the furniture, sitting on the sofa or leaning on a wall. **Rooms** in the
Body Studio menu (`modes.js`) puts the body in the room it was in last there, else the first room
filmed, else the sample living room; only then do **Room** and **Decor** show in the top bar, and
the clothes and tattoos panel is closed: nothing worn or inked changes in a room.

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
   room ahead. The body's height in metres (from the tattoo and pose panel, or the person's in Progress)
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

## The sample tattoo studio

Also in the menu, after the living room: **Sample tattoo studio** (`sample_studio.py`), 5 × 4.2 m,
2.7 m high: a tattoo bed, a reclining chair with two arm rests, a stool, the artist's tray, a flash
wall of cork, a mirror, a counter and a neon sign, in
`workspace/_sample_studio/run_sample/splat/tattoo_studio_clean.ply`. Beside it,
`tattoo_studio_clean.fixtures.json` says where the furniture is, in the studio's metres; room.py
turns it into the map's metres (`fixtures` in the map), and the page uses it to hang designs on the
flash wall and to put the body on the bed or in the chair. What happens there: [tattoo.md](tattoo.md#the-tattoo-studio).

## The sample wedding venue

Third in the menu: **Sample wedding venue** (`sample_venue.py`), laid out as the floor plan of a
real venue (Casa Arandella, São Sebastião), with the plan's measures (it isn't drawn to scale), and
nothing the plan doesn't show: the deck and the reception (6 × 4 m), the vertical garden (4.5 m, a
wall of leaves), the ante-room (9.3 m, green walls both sides) with the closed kitchen beside it, the
main hall (17.8 × 8.6 m, 1.5 m narrower for its first 5 m, light oak boards, panelled walls, five
tall steel windows, beams), a half wall to the toilets' hall, glass doors onto the pergola
(10.8 × 7.4 m: black steel posts and rafters under a glass roof, on sand), the stage beside it
(8.6 × 3.2 m, 70 cm up, not walked on), the garden (17.8 m wide, 20 m along the right and 30 m
along the left, a lawn inside low white walls, the bungalow), then the beach: 8 m of dry sand
beyond the garden's slanted far side, the wet sand, the sea and the island's hills across it. The
glass roof, the sand and the green walls are from the venue's photos. About 800,000 splats. It is
mapped when it is made (about 20 s, in the same background process), so the page doesn't wait; the
sea and the hills are drawn faint enough to be left out of the map, so they don't make it bigger.
Its map cells are about 10 cm (a long place gets as many cells as a square one of the same floor
area, up to four times as many along its length). Ceilings are 3.4 m; the garden and the vertical
garden are open to the sky. See it in **First person** (V), or **From above**.

## From above

**From above** in the top bar, in a room: the camera high over the body (35% of the room's longest
side, between 6 and 28 m up), looking down at it a little from behind, and everything above 2.4 m
(or just under the ceiling, if lower) is hidden, so the ceiling is gone and you see into every
room. Drag to orbit and zoom as usual, but never down to the floor's level; walking still works.
**From above** again, **First person** or another room puts the ceiling back. The camera's place
is `skyView` in `static/room.js`; the ceiling is cut on the graphics card by a Spark modifier that
hides the room's splats above a height (`roofless` in `static/house.js`).

## Walking faster

Hold **Shift** while walking for a brisker pace (1.9 times the speed): longer steps, the knees
higher, the arms swinging more and the body leaning a little forward. The feet stay planted; the
speed still comes from the legs (`gait(p, hurry)` in `static/walk.js`).

## First person

**First person** in the top bar (or **V**), in a room: the camera at the body's eyes (between
the head joint and the top of the head, 7% of the height in front of the face, so the head stays
behind it). Drag to look round (the room held and pulled, as the orbit does; a full width is half
a turn; the tilt stops at 80°); **W A S D** walk the way it looks. The body turns as it walks, the
look doesn't. The orbit is off meanwhile; **Third person** (or V) puts the camera behind the body
again (`view()`). The maths is `eyeView` and `lookBy` in `static/room.js`.

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
  arms or a sloping back cushion aren't modelled. Lying down is only on the studio's bed (it
  knows where the bed is from its fixtures); lying on a filmed bed or the sofa and putting a hand
  on a table are the next poses to add.
- **The body doesn't hide behind furniture by depth.** Splats of the body and the room are sorted
  together, which is right when they don't overlap; a body sitting deep in a fluffy cushion can
  show through it.
