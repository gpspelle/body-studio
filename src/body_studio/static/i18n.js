// Every string the page shows, in every language. Every key must exist in every language
// (checked by tests/unit/test_i18n.py).
//   <span data-i18n="key">   text        data-i18n-aria-label="key"   attribute
//   t("key", {name: "Anna"})  in scripts: "{name}" placeholders are filled in
(function () {
  const LANGS = { en: "EN", pt: "PT" };
  const I18N = {
    en: {
      "app.view": "3D view of the body",
      "app.new": "New body",
      "app.bodies": "Your bodies",
      "empty.title": "Drop a video of a person",
      "empty.how": "They stand still in an A-pose while you walk around them three times: knee height, chest height, above the head.",
      "drop.title": "Drop to start",
      "load.loading": "Loading {name}…",
      "load.failed": "Couldn't load {name}.",
      "job.uploading": "Uploading {name}…",
      "job.waiting": "{name}: waiting",
      "job.stage1": "{name}: reading the video",
      "job.stage2": "{name}: finding the camera",
      "job.stage3": "{name}: building the body",
      "job.left": "{left} left",
      "job.measuring": "measuring speed",
      "job.ready": "{name} is ready",
      "job.failed": "{name} didn't work: {error}",
      "err.video_type": "Use a .mov or .mp4 video.",
      "err.video_size": "The video is empty or too large.",
      "err.upload_cut": "The upload was cut off.",
      "err.upload": "The upload failed.",
      "foot.source": "Source code",
      "foot.license": "MIT License",
      "lang.label": "Language",
    },
    pt: {
      "app.view": "Vista 3D do corpo",
      "app.new": "Novo corpo",
      "app.bodies": "Seus corpos",
      "empty.title": "Solte um vídeo de uma pessoa",
      "empty.how": "Ela fica parada em pose A enquanto você dá três voltas ao redor: na altura do joelho, do peito e acima da cabeça.",
      "drop.title": "Solte para começar",
      "load.loading": "Carregando {name}…",
      "load.failed": "Não foi possível carregar {name}.",
      "job.uploading": "Enviando {name}…",
      "job.waiting": "{name}: na fila",
      "job.stage1": "{name}: lendo o vídeo",
      "job.stage2": "{name}: encontrando a câmera",
      "job.stage3": "{name}: construindo o corpo",
      "job.left": "faltam {left}",
      "job.measuring": "medindo a velocidade",
      "job.ready": "{name} está pronto",
      "job.failed": "{name} não deu certo: {error}",
      "err.video_type": "Use um vídeo .mov ou .mp4.",
      "err.video_size": "O vídeo está vazio ou é grande demais.",
      "err.upload_cut": "O envio foi interrompido.",
      "err.upload": "O envio falhou.",
      "foot.source": "Código-fonte",
      "foot.license": "Licença MIT",
      "lang.label": "Idioma",
    },
  };
  const saved = (() => { try { return localStorage.getItem("lang"); } catch { return null; } })();
  let lang = saved in I18N ? saved : (navigator.language || "en").slice(0, 2) in I18N ? (navigator.language || "en").slice(0, 2) : "en";

  function t(key, params = {}) {
    const s = (I18N[lang] && I18N[lang][key]) ?? I18N.en[key] ?? key;
    return s.replace(/\{(\w+)\}/g, (_, k) => (k in params ? params[k] : `{${k}}`));
  }
  function apply(root = document) {
    document.documentElement.lang = lang;
    for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
    for (const el of root.querySelectorAll("[data-i18n-aria-label]")) el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel));
  }
  function set(next) {
    if (!(next in I18N)) return;
    lang = next;
    try { localStorage.setItem("lang", next); } catch {}
    apply();
    dispatchEvent(new Event("langchange"));
  }
  window.i18n = { LANGS, I18N, t, apply, set, get lang() { return lang; } };
  window.t = t;
})();
