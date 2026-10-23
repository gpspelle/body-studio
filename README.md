# Body Studio

*English · [Português](#português)*. The app itself switches between English and Portuguese.

**Turn a phone video of a person into a 3D body you can orbit, on your own Mac.**

One screen: the body stands in the middle and turns slowly; drag to look around, pick another
body from the row at the bottom, or drop a new video anywhere on the page. Until everything is
ready to use (the body, its skeleton, the clothes fitted and put back on, the shop around it, a
room), a loading screen shows the logo turning and a line on what is happening (and, if it takes
a while, why), so you never see a body you can't move yet.

**Body Studio**, at the top left, opens the menu of what to do: **Style your clothes** (the shop
around the body), **Style your tattoos** (in the tattoo studio), **Rooms**, **Body progress**,
**New body**, **Guide** and **Language**. Each mode shows only its own tools: the clothes are
picked from the racks, the tattoo studio has the tattoos and the pose, and in a room nothing worn
or inked changes. On a computer the page opens on the clothes the first time, then in the mode
you left it in.

![The Body Studio menu](docs/images/menu-desktop.png)

![Body Studio on a laptop](docs/images/desktop-light.png)

<img src="docs/images/phone-dark.png" width="220" align="right" alt="Body Studio on a phone, dark mode">

Everything runs locally: no uploads, no accounts, no cloud GPU. The capture pipeline is
[Splat Studio](https://github.com/gpspelle/splat-studio)'s, installed as a dependency:

| Step | Tool |
|---|---|
| Video → frames | ffmpeg |
| Frames → camera poses | COLMAP |
| Poses → splat | Brush (Metal on Apple Silicon) |
| Fog, floor and room removed | Splat Studio (always on for bodies; a room keeps itself) |
| Runs, time left, advice | Splat Studio's job runner |
| Body on screen | Spark + three.js |

<br clear="right">

## Install

You need a Mac with Apple Silicon and Python 3.9 or newer.

```bash
git clone https://github.com/gpspelle/body-studio.git
cd body-studio
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
body-studio setup        # installs ffmpeg, COLMAP, builds Brush, PyTorch, Anny and TripoSR, once (10–30 min)
body-studio              # opens http://localhost:8770
```

`pip install -e .` also installs OpenCV, which drops blurry frames. `body-studio check` shows what's installed. Videos and bodies are kept in `~/BodyStudio`
(change it with `--data-dir`), in the same layout Splat Studio uses.

## Filming a person

- The person stands **still** in an A-pose: feet shoulder-width apart, arms a little away from the body.
  Any movement during the take blurs that part of the body.
- Walk around them **three times**: at knee height, at chest height, and holding the phone above their head.
  1½–3 minutes in total, one continuous take, on the 1× lens.
- **Soft, even light** and a background with some texture (not a plain white wall). Lock focus and exposure.
- **Long hair tied back** (a bun or a ponytail), so the head and neck keep their shape. Hair tried on in the
  app is drawn over the head, and it can't hide hair that was filmed loose over the shoulders.

## Command line

```bash
body-studio run IMG_1234.MOV                     # whole pipeline in the terminal
body-studio run IMG_1234.MOV --quality preview   # quick look
body-studio run IMG_1234.MOV --start 0:03 --end 2:10
body-studio room LIVING_ROOM.MOV                 # a room filmed from inside, for the body to stand in
body-studio decor ARCH.JPG --height 2.2           # a 3D decor item from one photo, for the Decor panel
```

The finished body is `workspace/<video>/run_<date_time>/splat/<quality>_<steps>_object.ply`.
Background removal always runs; the untouched splat and the fog-free copy are kept next to it.
On a Mac (with Apple's Vision) or with SAM 2 installed, the person is also cut out of every
frame before training (splat-studio's `--person`), so nothing of the room is learnt; the masks
are kept in `frames/<video>/masks/`.

While a video is processed, the top bar shows the stage and the time left, measured from the
run itself. If a run fails, it says why in terms of the video (for example, which seconds to film again).

### Measurements and body fat (experimental)

```bash
body-studio measure workspace/<video>/run_<date_time>/splat/standard_30000_object.ply \
    --sex m --height 178 --weight 80 --tape-waist 86
```

Prints neck, waist (at the navel) and hip circumferences, measured on the body like a tape, and
a body fat estimate from the US Navy, US Army one-site and relative fat mass equations.
`--height` is required: it gives the body its real size. `--weight` adds the Army equation.
`--tape-waist` (your own tape measure, same day) checks the capture: more than 2 cm apart means
something is off. Film in underwear or tight clothing, waistband below the navel, long hair tied up.
Expect about ±4.5 points of body fat for one person; it is best for following the same person
over time. Research and sources: [docs/body-fat.md](docs/body-fat.md).

## Following a person over time

Pick **Body progress** in the menu to follow one person: a tape measure every week or two, a scan now and then.
The body stays in the middle; the panel sits at the right edge (at the bottom on a phone).

![Progress panel](docs/images/progress-desktop.png)

- **Body fat**, from the tape measures, with its trend. One formula for the whole series (US Navy
  when neck and waist are there, and hips for women), so a change in the number is a change in
  the body. It is about ±4.5 points off for one person; the change over time is what counts.
- **Tape measures**: weight, waist, neck and hips, each with its latest value, the change since
  the first entry and a small line of every entry. A change smaller than the measurement noise
  (1 kg, 1 cm, 0.5 cm at the neck) reads "about the same", in grey.
- **Scans**: add the body on screen to the person's history (dated by its run). Each scan is
  measured once, with the person's height, and the panel draws the circumference at every
  height of the body on screen over the first scan, with the change at the neck, waist and hips.
  Tap a date to show that body.

The same from the terminal:

```bash
body-studio person Anna --sex f --height 168
body-studio tape Anna --waist 74 --neck 32 --hip 98 --weight 61     # today; --date 2026-10-01 for another day
body-studio scan Anna Anna_front/run_20261012_120000
body-studio progress Anna
```

Each person is one file, `people/<name>.json` in the data folder. How the design was chosen:
[docs/progress.md](docs/progress.md).

## Clothes, tattoo & pose

Pick **Style your clothes** in the menu to dress the body, or **Style your tattoos** to try a
tattoo on it and move it to see how it sits. The panel sits at the left edge (at the bottom on a
phone): for the clothes it holds what is worn, for the tattoos the tattoo and the pose.

![Trying on clothes](docs/images/wardrobe-desktop.png)

![Clothes, tattoo & pose panel](docs/images/tattoo-desktop.png)

- **Clothes**: while the panel is open, a small shop stands around the body: outfits on hangers
  on clothes rails (five hangers to a rail at most, side by side), shoes on a shoe rack, folded
  T-shirts and jeans on shelf units no taller than the person (side by side, as many as it takes)
  with short hair on mannequin heads above them, and long hair and the fedora on stands. Point at an item to see its
  name, click it to put it on. The panel lists the necklaces, which have no rack. There are 20 outfits (tie-dye, a flower shirt and long skirt, a black
  leather jacket, a band T-shirt, tartan skirt and trousers, a flannel shirt, Breton stripes among
  them), 6 pairs of shoes, 10 hairstyles, 4 hats (fedora, two beanies, a woven headband), 3 pairs
  of glasses and 3 necklaces (beads, a chain, a studded choker). Each is fitted to this person's shape, moves with the pose, and hides the skin under
  it. What is worn stays in its place on the rack as a pale outline and is listed in the panel:
  click the outline (or its ✕ in the panel) to take it off, or **Take everything off**. What
  is worn is kept in this browser, per body. The first time, the app fits a model body to the
  scan (a few seconds): it takes the person's build first (MakeHuman's own body-shape sliders,
  set to match the scan), then their exact surface, so clothes sit closer.
  All are free to use (CC0): MakeHuman's own assets, and the styled ones made from them by
  `scripts/wardrobe_styles.py`; see [CREDITS.md](CREDITS.md).

- **Add an image** (PNG, JPG, WebP, SVG), then tap the body where it goes. Drag it to move it;
  set its width in centimetres, its turn and how strong the ink is, and give it a name to tell
  it apart from the others. Designs drawn on white have
  the white removed. The tattoo follows the skin wherever you put it: around an arm, across the
  back, over a shoulder, from the lower back onto both thighs. It is drawn into the skin as
  ink, so the skin shows through it, and whatever covers the skin (an arm, clothes) covers it.
- **Move the body**: drag the dot on a joint (the elbow dot turns the shoulder, the wrist dot
  the elbow…), or pick a pose: standing, arms up, flex, walking, sitting. Each joint only moves
  the way a person's can, within its normal range: an arm reaches across the chest or back behind,
  a bent knee turns the shin, the wrist bends toward the palm and to the sides and the forearm turns
  the hand. An arm stops at the body instead of going into it. Pick a joint to set its angles with
  sliders.
  The tattoo moves with the skin.
- **Walk it around**: press **W A S D** (or the arrow keys) and the body walks across the floor,
  away from you, toward you or to the sides, turning to face the way it goes; the camera follows
  at an even pace, without bobbing with each step.
  **Space** jumps. **Q** / **E** raise the left / right arm and **Z** / **C** the left / right
  knee (the body's own left and right); they stay up until pressed again. Clothes, hair, shoes and
  tattoos go along. Let go and it stands where it got to, in the pose from the panel, with arms
  that were held out as in the scan now down by its sides; **R** brings it back. The first press
  finds the skeleton if the panel hasn't yet. **Guide** in the menu (or **?**) lists every control.

  ![Walking](docs/images/walk-desktop.png)

  ![The Guide](docs/images/guide-desktop.png)
- **It looks alive**: standing still, the body breathes, sways a little, blinks and turns its head
  to you. Walking, its feet stay planted. Skin darkens where it meets skin, the biceps swells as
  the arm bends, a turned hand turns the whole forearm's skin (so a tattoo on it turns too), the
  shoulder rises with a raised arm, bent skin presses together instead of passing through, a skirt or a ponytail trails behind as it walks and turns and swings on when it
  stops, and a soft shadow on the floor follows it. Pick
  **Hands**: as scanned, relaxed or a fist. **What if** sliders show the person lighter or heavier
  (about ±12 kg) and with less or more muscle; they aren't saved. How it works:
  [docs/flesh.md](docs/flesh.md).
- The first time, the app finds the body's skeleton (a few seconds). It needs the A-pose from the
  filming guide: arms a little away from the body, feet apart. Tattoos and pose are kept in this
  browser, per body.

`body-studio rig BODY.ply` does the skeleton step in the terminal and prints the joint heights.
It saves `BODY.rig.json` next to the body. How it works, the body models that were considered
and their licences, and the limits: [docs/tattoo.md](docs/tattoo.md).

`body-studio fit BODY.ply` does the clothes fitting step in the terminal and saves `BODY.fit.json`
next to the body. How the clothes are fitted and drawn, where they come from, and the limits:
[docs/wardrobe.md](docs/wardrobe.md).

Trial: the clothes panel shows **Body model: Standard / Anny (trial)**, to see the same clothes on a
body fitted either way ([Anny](https://github.com/naver/anny) is a body model that runs on PyTorch).
`body-studio setup` installs PyTorch and Anny; if they aren't there, the first click on Anny installs
them, with nothing to type (a few minutes, once). The Anny fit takes about two minutes the first time
per body and is saved as `BODY.anny.fit.json`; `body-studio fit-anny BODY.ply` makes it in the
terminal. PyTorch is only needed for this. Results so far: [docs/anny.md](docs/anny.md).

## A room around the body

Film a room, or your whole house, from inside it, and the body stands in it: to its own scale, on
its floor. Walk it round with **W A S D**: walls and furniture stop it (it slides along them).
Press **F** next to the sofa or a chair to sit down, or next to a wall to lean on it; **F** again
gets up. The camera stays inside the room.

![The body sitting on the sofa of the sample living room](docs/images/room-desktop.png)

- Pick **Rooms** in the menu: the body goes into the room it was in last (the sample living room
  the first time). **Room** at the top then opens the list of rooms filmed so far. **Add a room…** takes its video (an
  iPhone capture from Splat Capture works too, and is in metres). Pick a room to put the body in
  it, **No room** to take it out. **Size** corrects the room's size if it looks off.
- **Sample living room** is always in the list, so you can try it before filming anything: a
  furnished room drawn by the app (sofa, armchair, bookshelf, TV, dining table, plant), made in
  the data folder the first time the list opens (`workspace/_sample_room/`).
- **Sample tattoo studio** is there too: a tattoo bed, a reclining chair with arm rests, a flash
  wall of designs and a mirror (`workspace/_sample_studio/`). **Style your tattoos** in the menu
  puts the body in it. Tap a design on the flash wall to
  pick it, then tap the body to lay it there. **F** by the bed or the chair goes where that tattoo
  is made: in the chair with the arm on its rest for an arm, lying face down for the back, face up
  for the belly or a leg, with the arm over the head for the ribs. The clothes over the tattoo
  come off there and go back on when the body gets up. **Room**, **Artist** and **Mirror** under
  the body change the view. More: [docs/tattoo.md](docs/tattoo.md#the-tattoo-studio).

  ![The body in the tattoo chair of the sample tattoo studio](docs/images/studio-desktop.png)
- Filming a room: walk slowly round it with the phone at chest height, pointing at the walls, and
  get the floor (and the ceiling, if you can) in view. One take, 1–3 minutes; for a house, walk
  from room to room without stopping.
- A room's run keeps the room: no background removal (splat-studio's `--scene`, where only the fog
  in the air is removed). Its name is kept in `rooms.json` in the data folder, so it is listed as a
  room, not a body. The first time, the app maps it (a few seconds): the floor, the size (from the
  height the phone was held at), the walls, the furniture and the seats; it saves
  `NAME_clean.room.json` next to it. `body-studio room-map ROOM.ply` does it in the terminal.

How it works and the limits (flat floors only, the size is a guess within about 10%):
[docs/room.md](docs/room.md).

## Decor in a room

In **Rooms**, with a room round the body, **Decor** in the top bar opens a panel for putting things in it, about
40 wedding pieces in a few colours, by kind: **Tables** (chairs, cross-back chairs, benches, round,
long, square, cocktail and sweetheart tables), **On the table** (place settings, centrepieces low
and tall, candelabras, bud vases, table numbers, the cake, a champagne tower, flowers, candles),
**Ceremony** (arches, a moon arch, a chuppah, a flower wall, flower stands, aisle flowers, a
runner, a welcome sign), **Bar** (a bar, its back shelves, bar stools, a buffet), **Lights**
(string lights, light poles, a chandelier, a curtain of fairy lights, uplights, lanterns; they
glow) and **Lounge** (a sofa, armchairs, a coffee table, a rug, a dance floor), or things made in
3D from a photo. Planning a wedding venue is what it is for: film the venue as a room, set it,
walk the aisle.

![A wedding table in the sample living room under string lights, picked, with the list of what is in the room](docs/images/decor-desktop.png)

- **Add** lists the things; tap one to put it in the room, then drag it along the floor. Flowers
  and candles go on the table they are dropped on. **In the room** lists everything placed, by
  kind: tap a line to pick it, ✕ to take it away. While Decor is open, the body's panel steps aside.
- The picked thing has handles, like the body's joints: drag the ring round it to turn it (Shift
  for any angle), the knob over it to raise or lower it (**Raised** does the same). A small
  toolbar above it turns it a step, duplicates it or removes it.
- The things look like a furniture shop's: linen, brass, wood and glass in soft studio light,
  a soft shadow under each, a picture of each in the catalogue. **Turn** (or `[` `]`), a colour, **Make a row** of up to 12, **Chairs
  round it** for a table, **Set the table** (a place setting in front of each chair), **Remove**
  (or Delete).
- **Add from a photo…**: a photo of one thing (an Instagram picture is fine), its name and its real
  height in cm. It is made into 3D **on this computer** with TripoSR (MIT) in a minute or two. The
  first time also installs it and downloads its weights (about 2 GB); `body-studio setup` does that
  beforehand. The back of the thing is guessed, so it works best on one whole thing on a plain
  background.
- Chairs and tables stop the walk; **F** sits on a chair, a bench, a sofa or a bar stool you put there.
- **Layout**: several arrangements per room (**New**, **Copy**, **Delete**). Everything is kept in
  `decor/` in the data folder.

How it works and its limits: [docs/decor.md](docs/decor.md).

## Development

```bash
pip install -e .
python -m unittest discover -s tests/unit -t .

# end to end: the real splat-studio pipeline with its stand-in COLMAP and Brush (needs ffmpeg)
export SPLAT_STUDIO_SRC="$(python3 scripts/splat_studio_src.py)"
python -m unittest tests.integration.test_end_to_end

pip install playwright && python -m playwright install chromium
python -m unittest tests.browser.test_viewer        # the app in a real browser
python3 scripts/screenshots.py                      # regenerates docs/images/
```

See [AGENTS.md](AGENTS.md) for conventions and [docs/plan.md](docs/plan.md) for what comes next.

---

## Português

**Transforme um vídeo de uma pessoa, feito no celular, em um corpo 3D que você pode girar, no seu próprio Mac.**

Uma tela só: o corpo fica no centro e gira devagar. Arraste para olhar em volta, escolha outro
corpo na fileira de baixo ou solte um vídeo novo em qualquer lugar da página. Até tudo estar
pronto para usar (o corpo, o esqueleto, as roupas ajustadas e vestidas de novo, a loja em volta,
um cômodo), uma tela de carregamento mostra o logo girando e uma linha dizendo o que está
acontecendo (e, se demorar, por quê), então você nunca vê um corpo que ainda não pode mexer.

**Body Studio**, no alto à esquerda, abre o menu do que fazer: **Escolher as roupas** (a loja em
volta do corpo), **Escolher as tatuagens** (no estúdio de tatuagem), **Cômodos**, **Evolução do
corpo**, **Novo corpo**, **Guia** e **Idioma**. Cada modo mostra só as suas ferramentas: as roupas
se escolhem nas araras, o estúdio de tatuagem tem as tatuagens e a pose, e num cômodo nada do que
está vestido ou tatuado muda. No computador a página abre nas roupas da primeira vez, depois no
modo em que você deixou.
Tudo roda no seu
computador, sem upload, sem conta e sem GPU na nuvem. O processamento é o do
[Splat Studio](https://github.com/gpspelle/splat-studio), instalado como dependência. A remoção
do fundo, do chão e da névoa sempre acontece.

### Instalar

```bash
git clone https://github.com/gpspelle/body-studio.git
cd body-studio
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
body-studio setup        # instala ffmpeg, COLMAP, compila o Brush e instala PyTorch, Anny e TripoSR, uma vez (10 a 30 min)
body-studio              # abre http://localhost:8770
```

`pip install -e .` também instala o OpenCV, que descarta os quadros borrados.

### Filmar uma pessoa

- A pessoa fica **parada** em pose A: pés afastados na largura dos ombros, braços um pouco afastados do corpo.
- Dê **três voltas** ao redor dela: na altura do joelho, na altura do peito e com o celular acima da cabeça.
  De 1½ a 3 minutos no total, em uma única tomada, na lente 1×.
- **Luz suave e uniforme** e um fundo com alguma textura (não uma parede branca lisa). Trave o foco e a exposição.
- **Cabelo comprido preso** (coque ou rabo de cavalo), para a cabeça e o pescoço manterem a forma. O cabelo
  que você prova no app é desenhado sobre a cabeça e não esconde um cabelo filmado solto sobre os ombros.

### Linha de comando

```bash
body-studio run IMG_1234.MOV
body-studio run IMG_1234.MOV --quality preview
body-studio room SALA.MOV                        # um cômodo filmado por dentro, para o corpo ficar nele
body-studio decor ARCO.JPG --height 2.2          # um item de decoração em 3D a partir de uma foto
```

O corpo pronto fica em `workspace/<vídeo>/run_<data_hora>/splat/<qualidade>_<passos>_object.ply`.
Num Mac (com o Vision da Apple) ou com o SAM 2 instalado, a pessoa também é recortada de cada
quadro antes do treino (o `--person` do splat-studio), então nada da sala é aprendido; as máscaras
ficam em `frames/<vídeo>/masks/`.

### Acompanhar uma pessoa ao longo do tempo

Escolha **Evolução do corpo** no menu para acompanhar uma pessoa: fita métrica a cada uma ou duas semanas, um
escaneamento de vez em quando. O corpo continua no centro; o painel fica na borda direita (embaixo,
no celular).

<img src="docs/images/progress-phone.png" width="220" alt="Painel de evolução no celular">

- **Gordura corporal**, pela fita métrica, com a tendência. Uma só fórmula para a série inteira
  (Marinha dos EUA quando há pescoço e cintura, e quadril para mulheres), então uma mudança no
  número é uma mudança no corpo. Erra cerca de ±4,5 pontos para uma pessoa; o que conta é a mudança.
- **Fita métrica**: peso, cintura, pescoço e quadril, cada um com o último valor, a mudança desde
  a primeira medida e uma pequena linha com todas as medidas. Uma mudança menor que o ruído da
  medida (1 kg, 1 cm, 0,5 cm no pescoço) aparece como "praticamente igual", em cinza.
- **Escaneamentos**: adicione o corpo na tela ao histórico da pessoa (com a data da execução). Cada
  um é medido uma vez, com a altura da pessoa, e o painel desenha a circunferência em cada altura
  do corpo na tela sobre a do primeiro escaneamento, com a mudança no pescoço, na cintura e no quadril.

No terminal: `body-studio person`, `tape`, `scan` e `progress` (exemplos acima, em inglês). Cada
pessoa é um arquivo, `people/<nome>.json` na pasta de dados.

### Roupas, tatuagem e pose

Escolha **Escolher as roupas** no menu para vestir o corpo, ou **Escolher as tatuagens** para testar
uma tatuagem e mexer o corpo para ver como fica. O painel fica na borda esquerda (embaixo, no
celular): para as roupas, o que está vestido; para as tatuagens, a tatuagem e a pose.

<img src="docs/images/tattoo-phone.png" width="220" alt="Painel de roupas, tatuagem e pose no celular">

- **Roupas**: com o painel aberto, uma pequena loja fica em volta do corpo: looks em cabides numa
  arara (no máximo cinco cabides por arara, uma ao lado da outra), sapatos numa sapateira,
  camisetas e jeans dobrados em estantes não mais altas que a pessoa (lado a lado, quantas forem
  precisas) com cabelos curtos em cabeças de manequim acima, e cabelos compridos e o chapéu fedora em pedestais. Aponte para uma
  peça para ver o nome e clique para vestir. O painel lista os colares, que não têm arara. São 20 looks (entre eles tie-dye, camisa florida e saia longa,
  jaqueta de couro preta, camiseta de banda, saia e calça xadrez, camisa de flanela, listras
  marinheiro), 6 pares de sapatos, 10 cortes de cabelo, 4 chapéus (fedora, dois gorros, uma faixa
  trançada), 3 óculos e 3 colares (contas, corrente, gargantilha com tachas). Cada peça se ajusta ao corpo da pessoa, acompanha a pose e esconde a pele
  embaixo dela. O que está vestido fica no lugar dele na arara como um contorno claro e aparece no painel:
  clique no contorno (ou no ✕ no painel) para tirar, ou em **Tirar tudo**. O que
  está vestido fica guardado neste navegador, para cada corpo. Na primeira vez, o app
  ajusta um corpo modelo ao escaneado (alguns segundos): primeiro o tipo físico da pessoa (os
  próprios controles de forma do corpo do MakeHuman, ajustados ao escaneado), depois a superfície
  exata, para as roupas ficarem mais justas. Todas são de uso livre (CC0): peças do próprio
  MakeHuman e as de estilo feitas a partir delas por `scripts/wardrobe_styles.py`; veja
  [CREDITS.md](CREDITS.md).

- **Adicione uma imagem** (PNG, JPG, WebP, SVG) e toque no corpo onde ela vai. Arraste para mudar
  de lugar; ajuste a largura em centímetros, o giro e a força da tinta, e dê um nome para
  diferenciá-la das outras. Desenhos sobre fundo branco
  perdem o branco. A tatuagem acompanha a pele onde você a colocar: em volta do braço, nas costas,
  por cima do ombro, da lombar até as duas coxas. Ela é desenhada na pele como tinta,
  então a pele aparece através dela, e o que cobre a pele (um braço, a roupa) cobre a tatuagem.
- **Mexa o corpo**: arraste o ponto de uma articulação (o ponto do cotovelo gira o ombro, o do
  pulso gira o cotovelo…) ou escolha uma pose: em pé, braços para cima, bíceps, andando, sentado.
  Cada articulação só se move como a de uma pessoa, dentro da amplitude normal: o braço cruza
  na frente do peito ou vai para trás, o joelho dobrado gira a canela, o pulso dobra para a palma
  e para os lados e o antebraço gira a mão. O braço para no corpo em vez de entrar nele. Escolha uma
  articulação para ajustar os ângulos com controles deslizantes. A tatuagem acompanha a pele.
- **Saia andando**: aperte **W A S D** (ou as setas) e o corpo anda pelo chão, para longe de você,
  na sua direção ou para os lados, virando para onde vai; a câmera acompanha em ritmo constante (sem
  balançar a cada passo). **Espaço** pula.
  **Q** / **E** levantam o braço esquerdo / direito e **Z** / **C** o joelho esquerdo / direito (a
  esquerda e a direita do próprio corpo); ficam levantados até você apertar de novo. Roupas, cabelo,
  sapatos e tatuagens vão junto. Solte e ele fica onde chegou, na pose do painel, com os braços que
  estavam abertos como no escaneamento agora abaixados ao lado do corpo; **R** o traz de volta. O
  primeiro toque encontra o esqueleto, se o painel ainda não encontrou. **Guia**, no menu (ou **?**), mostra
  todos os controles.
- **Parece vivo**: parado, o corpo respira, balança um pouco, pisca e vira a cabeça para você.
  Andando, os pés ficam firmes no chão. A pele escurece onde encosta em pele, o bíceps cresce
  quando o braço dobra, a mão que gira gira a pele do antebraço todo (e a tatuagem nele junto), o
  ombro sobe com o braço levantado, a pele dobrada se aperta em vez de atravessar, a saia ou o rabo de cavalo ficam um pouco para trás ao andar e virar e
  balançam quando ele para, e uma sombra suave no chão acompanha
  o corpo. Escolha **Mãos**: como escaneadas, relaxadas ou punho fechado. Os controles **E se**
  mostram a pessoa mais leve ou mais pesada (cerca de ±12 kg) e com menos ou mais músculo; não são
  salvos. Como funciona (em inglês): [docs/flesh.md](docs/flesh.md).
- Na primeira vez, o app encontra o esqueleto do corpo (alguns segundos). Precisa da pose A do guia
  de filmagem: braços um pouco afastados do corpo, pés afastados. Tatuagens e pose ficam guardadas
  neste navegador, para cada corpo.

`body-studio rig CORPO.ply` faz o esqueleto no terminal e salva `CORPO.rig.json` ao lado do corpo.
Como funciona, os modelos de corpo considerados e suas licenças, e os limites (em inglês):
[docs/tattoo.md](docs/tattoo.md).

`body-studio fit CORPO.ply` faz o ajuste das roupas no terminal e salva `CORPO.fit.json` ao lado do
corpo. Como as roupas são ajustadas e desenhadas, de onde vêm e os limites (em inglês):
[docs/wardrobe.md](docs/wardrobe.md).

Teste: o painel das roupas mostra **Modelo de corpo: Padrão / Anny (teste)**, para ver as mesmas roupas
num corpo ajustado de um jeito ou de outro (o [Anny](https://github.com/naver/anny) é um modelo de
corpo que roda no PyTorch). O `body-studio setup` instala o PyTorch e o Anny; se não estiverem lá, o
primeiro clique em Anny os instala, sem nada para digitar (alguns minutos, uma vez). O ajuste com o Anny leva cerca de dois
minutos na primeira vez para cada corpo e fica salvo como `CORPO.anny.fit.json`;
`body-studio fit-anny CORPO.ply` faz o mesmo no terminal. O PyTorch só é preciso para isso.
Resultados até agora (em inglês): [docs/anny.md](docs/anny.md).

### Um cômodo em volta do corpo

Filme um cômodo, ou a casa toda, por dentro, e o corpo fica nele: na escala certa, no chão dele.
Ande com **W A S D**: as paredes e os móveis o param (ele desliza ao longo deles). Aperte **F**
perto do sofá ou de uma cadeira para sentar, ou perto de uma parede para se encostar; **F** de novo
levanta. A câmera fica dentro do cômodo.

- Escolha **Cômodos** no menu: o corpo vai para o último cômodo em que esteve (a sala de exemplo da
  primeira vez). **Cômodo**, no alto, abre então a lista dos cômodos já filmados. **Adicionar um cômodo…** recebe o
  vídeo (uma captura do iPhone feita no Splat Capture também serve, e já vem em metros). Escolha um
  cômodo para colocar o corpo nele, **Nenhum** para tirar. **Tamanho** corrige o tamanho do cômodo
  se parecer errado.
- **Sala de exemplo** está sempre na lista, para experimentar antes de filmar qualquer coisa: uma
  sala mobiliada desenhada pelo app (sofá, poltrona, estante, TV, mesa de jantar, planta), criada
  na pasta de dados na primeira vez que a lista abre (`workspace/_sample_room/`).
- **Estúdio de tatuagem de exemplo** também está lá: uma maca, uma cadeira reclinável com apoios
  de braço, uma parede de flash com desenhos e um espelho (`workspace/_sample_studio/`). **Escolher as
  tatuagens**, no menu, coloca o corpo nele. Toque num
  desenho da parede para escolhê-lo e depois no corpo para colocá-lo ali. **F** perto da maca ou da
  cadeira vai para onde essa tatuagem é feita: na cadeira com o braço no apoio, para um braço;
  deitado de bruços, para as costas; de barriga para cima, para a barriga ou uma perna; com o braço
  sobre a cabeça, para as costelas. As roupas sobre a tatuagem saem ali e voltam quando o corpo
  levanta. **Estúdio**, **Tatuador** e **Espelho**, embaixo do corpo, mudam a vista. Mais (em
  inglês): [docs/tattoo.md](docs/tattoo.md#the-tattoo-studio).
- Para filmar um cômodo: ande devagar em volta, com o celular na altura do peito, apontando para as
  paredes, e pegue o chão (e o teto, se der). Uma tomada só, de 1 a 3 minutos; para a casa, vá de
  um cômodo ao outro sem parar.
- A execução de um cômodo mantém o cômodo: sem remover o fundo (o `--scene` do splat-studio, que
  tira só a névoa no ar). O nome fica em `rooms.json` na pasta de dados, para ele aparecer como
  cômodo e não como corpo. Na primeira vez, o app faz o mapa (alguns segundos): o chão, o tamanho
  (pela altura em que o celular foi segurado), as paredes, os móveis e os assentos; salva
  `NOME_clean.room.json` ao lado. `body-studio room-map COMODO.ply` faz isso no terminal.

Como funciona e os limites (só chão plano, o tamanho é uma estimativa com cerca de 10% de erro), em
inglês: [docs/room.md](docs/room.md).

### Decoração no cômodo

Em **Cômodos**, com um cômodo em volta do corpo, **Decoração** na barra de cima abre um painel para colocar coisas
nele, umas 40 peças de casamento em algumas cores, por tipo: **Mesas** (cadeiras, cadeiras cross
back, bancos, mesas redondas, compridas, quadradas, bistrô e a dos noivos), **Na mesa** (lugares
postos, centros de mesa baixos e altos, candelabros, vasinhos, números de mesa, o bolo, uma torre
de champanhe, flores, velas), **Cerimônia** (arcos, um arco lua, uma chupá, um painel de flores,
colunas de flores, flores do corredor, uma passadeira, uma placa de boas-vindas), **Bar** (o bar,
a prateleira, banquetas, um buffet), **Luzes** (varal de luzes, postes, um lustre, uma cortina de
luzes, luzes de chão, lanternas; elas brilham) e **Lounge** (sofá, poltronas, mesa de centro,
tapete, pista de dança), ou coisas feitas em 3D a partir de uma foto. É para planejar a
decoração de um casamento: filme o espaço como um cômodo, monte a decoração, ande pelo corredor.

- **Adicionar** lista as coisas; toque numa para colocá-la no cômodo e arraste pelo chão. Flores e
  velas ficam em cima da mesa onde são soltas. **No cômodo** lista tudo o que foi colocado, por
  tipo: toque numa linha para escolher, ✕ para tirar. Com a Decoração aberta, o painel do corpo sai
  da frente.
- A coisa escolhida tem alças, como as juntas do corpo: arraste o anel em volta para girar (Shift
  para qualquer ângulo) e o botão em cima para erguer ou baixar (**Erguido** faz o mesmo). Uma
  pequena barra em cima dela gira um passo, duplica ou remove.
- As coisas parecem as de uma loja de móveis: linho, latão, madeira e vidro numa luz suave de
  estúdio, uma sombra suave embaixo de cada uma, uma foto de cada no catálogo. **Girar** (ou `[` `]`), uma cor, **Fazer uma fileira** de até 12,
  **Cadeiras em volta** de uma mesa, **Pôr a mesa** (um lugar posto na frente de cada cadeira),
  **Remover** (ou Delete).
- **Adicionar de uma foto…**: uma foto de uma coisa só (uma foto do Instagram serve), o nome e a
  altura real em cm. Ela vira 3D **neste computador** com o TripoSR (MIT) em um ou dois minutos. Na
  primeira vez também instala e baixa os pesos (cerca de 2 GB); o `body-studio setup` já faz isso
  antes. A parte de trás é adivinhada, então funciona melhor com uma coisa inteira num fundo liso.
- Cadeiras e mesas param a caminhada; **F** senta numa cadeira, num banco, num sofá ou numa
  banqueta que você colocou.
- **Arranjo**: vários arranjos por cômodo (**Novo**, **Copiar**, **Apagar**). Tudo fica em `decor/`
  na pasta de dados.

Como funciona e os limites, em inglês: [docs/decor.md](docs/decor.md).

### Medidas e gordura corporal (experimental)

```bash
body-studio measure workspace/<vídeo>/run_<data_hora>/splat/standard_30000_object.ply \
    --sex m --height 178 --weight 80 --tape-waist 86
```

Mostra as circunferências do pescoço, da cintura (na altura do umbigo) e do quadril, medidas no
corpo como uma fita métrica, e uma estimativa de gordura corporal pelas equações da Marinha dos
EUA, do Exército dos EUA (um ponto) e da massa gorda relativa. `--height` é obrigatório: dá ao
corpo o tamanho real. `--weight` acrescenta a equação do Exército. `--tape-waist` (sua própria
fita métrica, no mesmo dia) confere a captura: mais de 2 cm de diferença indica um problema.
Filme de roupa íntima ou roupa justa, com o elástico abaixo do umbigo e o cabelo comprido preso.
Espere cerca de ±4,5 pontos de gordura corporal para uma pessoa; serve melhor para acompanhar a
mesma pessoa ao longo do tempo. Pesquisa e fontes (em inglês): [docs/body-fat.md](docs/body-fat.md).
