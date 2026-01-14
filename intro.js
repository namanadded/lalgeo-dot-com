document.addEventListener("DOMContentLoaded", () => {
  const root = document.querySelector(".intro-demo");
  if (!root) return;

  const intro = root.querySelector(".intro");
  const viewport = root.querySelector(".viewport");
  const letterbox = root.querySelector(".letterbox");
  const scenes = root.querySelectorAll(".title--scene");
  const fullTitle = root.querySelector(".title--full");
  const credits = root.querySelectorAll(".credits-group");
  const finalCredit = root.querySelector(".credits-final");
  const playButtons = root.querySelectorAll("[data-play]");

  const supportsAudio = !!(window.Audio && new Audio());
  const style = document.documentElement.style;
  const supportsAnimations = "animation" in style || "webkitAnimation" in style;
  const supportsTextShadow = "textShadow" in style;
  const supportsTextStroke = "webkitTextStroke" in style || "textStroke" in style;

  let text = root.querySelector(".intro-text--cant");
  let bind = false;

  if (!supportsAudio || !supportsAnimations || !supportsTextShadow) {
    text = root.querySelector(".intro-text--cant");
  } else if (!supportsTextStroke) {
    bind = true;
    text = root.querySelector(".intro-text--shouldnt");
  } else {
    bind = true;
    text = root.querySelector(".intro-text--can");
  }

  if (text) text.classList.add("intro-text--show");

  let started = false;

  function start() {
    if (started) return;
    started = true;

    intro.classList.add("intro--hide");

    const music = new Audio("https://s3-us-west-2.amazonaws.com/s.cdpn.io/161676/music.mp3");
    music.addEventListener("canplay", () => {
      setTimeout(() => {
        startAnimation();
        setTimeout(() => {
          music.play();
        }, 200);
      }, 1500);
    });
    music.load();
  }

  function startAnimation() {
    const creditsMs = 3000;
    const scenesMs = [
      creditsMs,
      creditsMs * 2,
      creditsMs,
      creditsMs,
      creditsMs,
      creditsMs,
      creditsMs * 2,
      19500,
    ];

    viewport.classList.add("viewport--show");
    letterbox.classList.add("letterbox--show");

    for (let i = 0; i < credits.length; i += 1) {
      setTimeout(() => {
        if (credits[i - 1]) {
          credits[i - 1].className = "credits-group";
        }
        credits[i].className = "credits-group credits-group--show";
      }, i * creditsMs);

      if (!credits[i + 1]) {
        setTimeout(() => {
          credits[i].className = "credits-group";
        }, i * creditsMs + creditsMs);
      }
    }

    let offset = 0;
    for (let i = 0; i < scenes.length; i += 1) {
      setTimeout(() => {
        if (scenes[i - 1]) {
          scenes[i - 1].className = scenes[i - 1].className.replace("title--show", "");
        }
        scenes[i].className += " title--show";
      }, offset);

      offset += scenesMs[i];

      if (!scenes[i + 1]) {
        setTimeout(() => {
          scenes[i].className = scenes[i].className.replace("title--show", "");
          fullTitle.className += " title--show";
        }, offset);

        setTimeout(() => {
          finalCredit.className += " credits-group--show";
        }, offset + scenesMs[i + 1] + 1500);
      }
    }
  }

  if (bind) {
    playButtons.forEach((btn) => btn.addEventListener("click", start));
  }
});
