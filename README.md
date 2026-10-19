# Body Studio

*English · [Português](#português)*. The app itself switches between English and Portuguese.

**Turn a phone video of a person into a 3D body you can orbit, on your own Mac.**

One screen: the body stands in the middle and turns slowly; drag to look around, pick another
body from the row at the bottom, or drop a new video anywhere on the page.

![Body Studio on a laptop](docs/images/desktop-light.png)

<img src="docs/images/phone-dark.png" width="220" align="right" alt="Body Studio on a phone, dark mode">

Everything runs locally: no uploads, no accounts, no cloud GPU. The capture pipeline is
[Splat Studio](https://github.com/gpspelle/splat-studio)'s, installed as a dependency:

| Step | Tool |
|---|---|
| Video → frames | ffmpeg |
| Frames → camera poses | COLMAP |
| Poses → splat | Brush (Metal on Apple Silicon) |
| Fog, floor and room removed | Splat Studio (always on) |
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
body-studio setup        # installs ffmpeg, COLMAP and builds Brush, once (10–30 min)
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

## Command line

```bash
body-studio run IMG_1234.MOV                     # whole pipeline in the terminal
body-studio run IMG_1234.MOV --quality preview   # quick look
body-studio run IMG_1234.MOV --start 0:03 --end 2:10
```

The finished body is `workspace/<video>/run_<date_time>/splat/<quality>_<steps>_object.ply`.
Background removal always runs; the untouched splat and the fog-free copy are kept next to it.

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

Click **Progress** to follow one person: a tape measure every week or two, a scan now and then.
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

## Tattoo & pose

Click **Tattoo** to try a tattoo on the body and move the body to see how it sits. The
panel sits at the left edge (at the bottom on a phone).

![Tattoo & pose panel](docs/images/tattoo-desktop.png)

- **Add an image** (PNG, JPG, WebP, SVG), then tap the body where it goes. Drag it to move it;
  set its width in centimetres, its turn and how strong the ink is. Designs drawn on white have
  the white removed. The tattoo wraps around the arm or across the chest and is drawn as ink, so
  the skin shows through it.
- **Move the body**: drag the dot on a joint (the elbow dot turns the shoulder, the wrist dot
  the elbow…), or pick a pose: standing, arms up, flex, walking, sitting. Each joint only moves
  the way a person's can, within its normal range. Pick a joint to set its angles with sliders.
  The tattoo moves with the skin.
- The first time, the app finds the body's skeleton (a few seconds). It needs the A-pose from the
  filming guide: arms a little away from the body, feet apart. Tattoos and pose are kept in this
  browser, per body.

`body-studio rig BODY.ply` does the skeleton step in the terminal and prints the joint heights.
It saves `BODY.rig.json` next to the body. How it works, the body models that were considered
and their licences, and the limits: [docs/tattoo.md](docs/tattoo.md).

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
corpo na fileira de baixo ou solte um vídeo novo em qualquer lugar da página. Tudo roda no seu
computador, sem upload, sem conta e sem GPU na nuvem. O processamento é o do
[Splat Studio](https://github.com/gpspelle/splat-studio), instalado como dependência. A remoção
do fundo, do chão e da névoa sempre acontece.

### Instalar

```bash
git clone https://github.com/gpspelle/body-studio.git
cd body-studio
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
body-studio setup        # instala ffmpeg e COLMAP e compila o Brush, uma vez (10 a 30 min)
body-studio              # abre http://localhost:8770
```

`pip install -e .` também instala o OpenCV, que descarta os quadros borrados.

### Filmar uma pessoa

- A pessoa fica **parada** em pose A: pés afastados na largura dos ombros, braços um pouco afastados do corpo.
- Dê **três voltas** ao redor dela: na altura do joelho, na altura do peito e com o celular acima da cabeça.
  De 1½ a 3 minutos no total, em uma única tomada, na lente 1×.
- **Luz suave e uniforme** e um fundo com alguma textura (não uma parede branca lisa). Trave o foco e a exposição.

### Linha de comando

```bash
body-studio run IMG_1234.MOV
body-studio run IMG_1234.MOV --quality preview
```

O corpo pronto fica em `workspace/<vídeo>/run_<data_hora>/splat/<qualidade>_<passos>_object.ply`.

### Acompanhar uma pessoa ao longo do tempo

Clique em **Evolução** para acompanhar uma pessoa: fita métrica a cada uma ou duas semanas, um
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

### Tatuagem e pose

Clique em **Tatuagem** para testar uma tatuagem no corpo e mexer o corpo para ver como
ela fica. O painel fica na borda esquerda (embaixo, no celular).

<img src="docs/images/tattoo-phone.png" width="220" alt="Painel de tatuagem e pose no celular">

- **Adicione uma imagem** (PNG, JPG, WebP, SVG) e toque no corpo onde ela vai. Arraste para mudar
  de lugar; ajuste a largura em centímetros, o giro e a força da tinta. Desenhos sobre fundo branco
  perdem o branco. A tatuagem contorna o braço ou atravessa o peito e é desenhada como tinta, então
  a pele aparece através dela.
- **Mexa o corpo**: arraste o ponto de uma articulação (o ponto do cotovelo gira o ombro, o do
  pulso gira o cotovelo…) ou escolha uma pose: em pé, braços para cima, bíceps, andando, sentado.
  Cada articulação só se move como a de uma pessoa, dentro da amplitude normal. Escolha uma
  articulação para ajustar os ângulos com controles deslizantes. A tatuagem acompanha a pele.
- Na primeira vez, o app encontra o esqueleto do corpo (alguns segundos). Precisa da pose A do guia
  de filmagem: braços um pouco afastados do corpo, pés afastados. Tatuagens e pose ficam guardadas
  neste navegador, para cada corpo.

`body-studio rig CORPO.ply` faz o esqueleto no terminal e salva `CORPO.rig.json` ao lado do corpo.
Como funciona, os modelos de corpo considerados e suas licenças, e os limites (em inglês):
[docs/tattoo.md](docs/tattoo.md).

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
