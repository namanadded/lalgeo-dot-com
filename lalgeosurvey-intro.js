// Minimal feature detection to mirror the original behavior without external libraries.
(() => {
  const docEl = document.documentElement;
  const style = document.createElement('div').style;
  const Modernizr = {
    audio: !!document.createElement('audio').canPlayType,
    cssanimations: 'animation' in style || 'webkitAnimation' in style,
    textshadow: 'textShadow' in style,
    addTest(name, fn) {
      const result = !!fn();
      this[name] = result;
      docEl.classList.add(result ? name : `no-${name}`);
    }
  };

  window.Modernizr = Modernizr;

  // Real quick add another modernizr check foooor...
  Modernizr.addTest('textstroke', function() {
    var h1 = document.createElement('h1');
    if (!('webkitTextStroke' in h1.style) && !('textStroke' in h1.style)) {
      return false;
    }
    else {
      return true;
    }
  });

  let started = false;
  let paused = false;
  let music = null;
  const timeouts = [];

  function schedule(fn, delay) {
    const id = setTimeout(fn, delay);
    timeouts.push(id);
    return id;
  }

  function clearScheduled() {
    while (timeouts.length) {
      clearTimeout(timeouts.pop());
    }
  }

  function fitStage() {
    const host = document.querySelector('.intro-host');
    const stage = document.querySelector('.intro-stage');
    if (!host || !stage) {
      return;
    }

    const hostRect = host.getBoundingClientRect();
    const scale = Math.min(
      1,
      hostRect.width / window.innerWidth,
      hostRect.height / window.innerHeight
    );

    stage.style.setProperty('--intro-scale', scale.toFixed(3));
  }

  document.addEventListener("DOMContentLoaded", () => {
    let bind = false;
    let text = null;

    // Must-haves
    if (!Modernizr.audio || !Modernizr.cssanimations || !Modernizr.textshadow) {
      text = document.getElementsByClassName("intro-text--cant")[0];
    }
    // Should-haves
    else if (!Modernizr.textstroke) {
      bind = true;
      text = document.getElementsByClassName("intro-text--shouldnt")[0];
    }
    // All good!
    else {
      bind = true;
      text = document.getElementsByClassName("intro-text--can")[0];
    }

    text.className += " intro-text--show";

    fitStage();
    window.addEventListener("resize", fitStage);

    if (bind) {
      const btns = document.querySelectorAll("[data-play]");
      for (let i = 0; i < btns.length; i++) {
        btns[i].addEventListener("click", () => {
          start();
        });
      }
    }

    const pauseBtn = document.querySelector("[data-pause]");
    if (pauseBtn) {
      pauseBtn.addEventListener("click", () => {
        if (paused) {
          return;
        }
        paused = true;
        document.body.classList.add("intro-paused");
        pauseBtn.textContent = "Paused";
        pauseBtn.disabled = true;
        clearScheduled();
        if (music) {
          music.pause();
        }
      });
    }

    const restartBtn = document.querySelector("[data-restart]");
    if (restartBtn) {
      restartBtn.addEventListener("click", () => {
        window.location.reload();
      });
    }
  });

  // Fade out intro, start music and animation
  function start() {
    if (started) {
      return;
    }
    started = true;

    const intro = document.getElementsByClassName("intro")[0];

    music = new Audio("intro-assets/music.mp3");

    intro.className += " intro--hide";

    music.addEventListener("canplay", () => {
      schedule(() => {
        if (paused) {
          return;
        }
        startAnimation();
        schedule(() => {
          if (!paused) {
            music.play();
          }
        }, 200);
      }, 1500);
    });
  }

  // Kick off the animation
  function startAnimation() {
    // In milliseconds, how long each one is
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

    // Elements
    const viewport = document.getElementsByClassName("viewport")[0];
    const letterbox = document.getElementsByClassName("letterbox")[0];
    const scenes = document.getElementsByClassName("title--scene");
    const fullTitle = document.getElementsByClassName("title--full")[0];
    const credits = document.getElementsByClassName("credits-group");
    const finalCredit = document.getElementsByClassName("credits-final")[0];

    viewport.className += " viewport--show";
    letterbox.className += " letterbox--show";

    // Set up credits to show every interval
    let activeCredits = null;
    for (let i = 0; i < credits.length; i++) {
      schedule(() => {
        if (paused) {
          return;
        }
        if (credits[i - 1]) {
          credits[i - 1].className = "credits-group";
        }
        credits[i].className = "credits-group credits-group--show";
      }, i * creditsMs);

      if (!credits[i + 1]) {
        schedule(() => {
          if (paused) {
            return;
          }
          credits[i].className = "credits-group";
        }, i * creditsMs + creditsMs);
      }
    }

    // Set up scenes to show after each interval
    let offset = 0;
    for (let i = 0; i < scenes.length; i++) {
      schedule(() => {
        if (paused) {
          return;
        }
        if (scenes[i - 1]) {
          scenes[i - 1].className = scenes[i - 1]
            .className.replace("title--show", "");
        }
        scenes[i].className += " title--show";
      }, offset);

      offset += scenesMs[i];

      if (!scenes[i + 1]) {
        // Show the last scene
        schedule(() => {
          if (paused) {
            return;
          }
          scenes[i].className = scenes[i].className.replace("title--show", "");
          fullTitle.className += " title--show";
        }, offset);

        // Show the final credits
        schedule(() => {
          if (paused) {
            return;
          }
          finalCredit.className += " credits-group--show";
        }, offset + scenesMs[i + 1] + 1500);
      }
    }
  }
})();
