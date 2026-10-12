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

`body-studio check` shows what's installed. Videos and bodies are kept in `~/BodyStudio`
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
