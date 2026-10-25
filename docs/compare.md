# Compare with a video

Line a room up with a video of the real place, frame by frame, and tag what the room still gets
wrong. It was made for the wedding venue: Gabriel filmed the real venue in one walk-through, and the
drawn venue (`sample_venue.py`) is made to look like it. The tool works with any room, scanned or
drawn.

## Opening it

In the Rooms mode, with a room round the body, open **Decor**, then **Compare with video** at the
top of its panel. The Decor panel steps aside, the camera starts **flying** (the body stays where it
is), and the Compare panel takes its place. **✕** closes it and goes back to Decor, with the camera's
own lens.

The first time, **Choose the video** copies the video into the app (`.mp4`, `.mov` or `.webm`, one
per room; **Use another video** replaces it). After that, it loads by itself.

## Lining up a view

- The video's frame is drawn over the room, centred and as tall as the window. **Video** sets how
  much of it shows (0 % shows only the room, 100 % only the video).
- **The video**: drag the time bar, or step **−0.5 s** / **+0.5 s** (the keys `[` and `]`), or
  **Play**.
- **Fly** until the room sits on the frame: drag to look round, W A S D to move (Shift is faster).
- **Lens** is the camera's angle from top to bottom (30° to 120°). A phone filming upright at 1× is
  about 70°, and at 0.5× it is wider. **Height** is the camera's height above the floor (0.5 m to
  2.5 m). A phone held to film is usually at about 1.4 to 1.5 m.
- **Keep this view** saves the video's time, where the camera is, its lens and its height, along
  with a picture of the frame and a picture of the room as drawn, cut to the same area. When the
  video is at a kept view's time (within a quarter of a second), the button says **Keep it as it
  is now** and saves over it. **Forget this view** deletes it.
- **Views kept** lists the kept views by time, with how many tags each has. Pick one, or use ◀ ▶,
  to go back to it: the video goes to that time and the camera flies to where it was.

## Tagging

Press **Tag**, then click on the frame where something is off. Choose what it is (**Missing**,
**Wrong**, **Remove** or **Note**), write what should be there, and **Save the tag**. A view that
wasn't kept is kept first. Tags show on the frame as numbered pins (wrong and remove in red) and are
listed in the panel, where ✕ removes one. Press **Tag** again to go back to flying.

## Exporting

**Export views and tags** downloads one zip:

- `notes.md`: every kept view by time, with its camera and its tags in order ("1. **missing** at
  (0.30, 0.60): an exit sign over the door"). Positions on a frame are measured from its top left,
  from 0 to 1.
- `views.json`: the same, for a program.
- `snaps/<view>-video.jpg` and `snaps/<view>-render.jpg`: the frame and the room, side by side.

The zip is what to send back to have the room fixed. The video stays on this computer.

## Where it is kept

`compare/<room>/` in the data folder (the room named as its decor layouts are): `video.<ext>`,
`views.json` (`{room, views: [{id, t, view: {at, look, pitch, eye, fov}, tags: [{x, y, kind,
note}], made}]}`), and `snaps/`. `at` is in the room map's metres (room.py), `look` and `pitch` are
the flying camera's angles (house.js), `eye` is in metres up, and `fov` is in degrees.

Routes (compare.py): `GET /api/compare?room=` (the state), `GET|POST /api/compare/video?room=`
(the video; POST with `&name=`), `POST /api/compare/view?room=` (`{id?, t, view, tags}` keeps or
changes a view), `DELETE /api/compare/view/<id>?room=`, `GET|POST
/api/compare/snap?room=&id=&which=video|render` (a JPEG), and `GET /api/compare/export?room=` (the
zip).

The page fetches the whole video once and plays it from memory, so stepping through it never waits
on the server (which doesn't serve byte ranges).
