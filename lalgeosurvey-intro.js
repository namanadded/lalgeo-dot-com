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
  let ended = false;
  let music = null;
  let rafId = null;
  let startTime = 0;
  let pausedDuration = 0;
  let pauseStart = 0;

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
  const introDelay = 1500;

  let viewport = null;
  let letterbox = null;
  let scenes = null;
  let fullTitle = null;
  let credits = null;
  let finalCredit = null;
  let overlay = null;
  let overlayBtn = null;
  let viewportShown = false;
  let currentCreditIndex = -1;
  let currentSceneIndex = -1;
  let fullTitleShown = false;
  let finalCreditShown = false;

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

  function showOverlay(icon) {
    if (!overlay || !overlayBtn) {
      return;
    }
    overlayBtn.innerHTML = icon;
    overlay.classList.add("intro-overlay--show");
  }

  function hideOverlay() {
    if (!overlay) {
      return;
    }
    overlay.classList.remove("intro-overlay--show");
  }

  function resetTimelineState() {
    viewportShown = false;
    currentCreditIndex = -1;
    currentSceneIndex = -1;
    fullTitleShown = false;
    finalCreditShown = false;

    if (viewport) {
      viewport.className = "viewport";
    }
    if (letterbox) {
      letterbox.className = "letterbox";
    }
    if (fullTitle) {
      fullTitle.className = "title title--full";
    }
    if (credits) {
      for (let i = 0; i < credits.length; i++) {
        credits[i].className = "credits-group";
      }
    }
    if (finalCredit) {
      finalCredit.className = "credits-final";
    }
    if (scenes) {
      for (let i = 0; i < scenes.length; i++) {
        scenes[i].className = scenes[i].className.replace(" title--show", "");
      }
    }
  }

  function pausePlayback() {
    if (!started || paused || ended) {
      return;
    }
    paused = true;
    pauseStart = performance.now();
    document.body.classList.add("intro-paused");
    showOverlay("&#9654;");
    if (music) {
      music.pause();
    }
    if (rafId) {
      cancelAnimationFrame(rafId);
    }
  }

  function resumePlayback() {
    if (!paused || ended) {
      return;
    }
    paused = false;
    pausedDuration += performance.now() - pauseStart;
    document.body.classList.remove("intro-paused");
    hideOverlay();
    rafId = requestAnimationFrame(tick);
    if (music) {
      music.play();
    }
  }

  function endPlayback() {
    ended = true;
    showOverlay("&#8635;");
  }

  function updateCredits(elapsed) {
    const creditsDuration = credits.length * creditsMs;
    if (elapsed >= creditsDuration) {
      if (currentCreditIndex !== -1) {
        credits[currentCreditIndex].className = "credits-group";
        currentCreditIndex = -1;
      }
      return;
    }

    const index = Math.floor(elapsed / creditsMs);
    if (index === currentCreditIndex) {
      return;
    }
    if (currentCreditIndex !== -1) {
      credits[currentCreditIndex].className = "credits-group";
    }
    currentCreditIndex = index;
    credits[currentCreditIndex].className = "credits-group credits-group--show";
  }

  function updateScenes(elapsed) {
    const sceneCount = scenes.length;
    const sceneTimelineEnd = scenesMs.slice(0, sceneCount).reduce((sum, val) => sum + val, 0);

    if (elapsed < sceneTimelineEnd) {
      let acc = 0;
      let index = 0;
      for (; index < sceneCount; index++) {
        acc += scenesMs[index];
        if (elapsed < acc) {
          break;
        }
      }
      if (index !== currentSceneIndex) {
        if (currentSceneIndex !== -1 && scenes[currentSceneIndex]) {
          scenes[currentSceneIndex].className = scenes[currentSceneIndex].className.replace(" title--show", "");
        }
        currentSceneIndex = index;
        scenes[currentSceneIndex].className += " title--show";
      }
    }
    else {
      if (currentSceneIndex !== -1 && scenes[currentSceneIndex]) {
        scenes[currentSceneIndex].className = scenes[currentSceneIndex].className.replace(" title--show", "");
        currentSceneIndex = -1;
      }
      if (!fullTitleShown) {
        fullTitle.className += " title--show";
        fullTitleShown = true;
      }
      if (!finalCreditShown && elapsed >= sceneTimelineEnd + scenesMs[sceneCount] + 1500) {
        finalCredit.className += " credits-group--show";
        finalCreditShown = true;
      }
    }
  }

  function tick(now) {
    if (paused || ended) {
      return;
    }

    const elapsed = now - startTime - pausedDuration;
    if (elapsed < introDelay) {
      rafId = requestAnimationFrame(tick);
      return;
    }

    const timelineElapsed = elapsed - introDelay;

    if (!viewportShown) {
      viewport.className += " viewport--show";
      letterbox.className += " letterbox--show";
      viewportShown = true;
    }

    updateCredits(timelineElapsed);
    updateScenes(timelineElapsed);

    const sceneCount = scenes.length;
    const sceneTimelineEnd = scenesMs.slice(0, sceneCount).reduce((sum, val) => sum + val, 0);
    const endTime = Math.max(
      credits.length * creditsMs,
      sceneTimelineEnd + scenesMs[sceneCount] + 1500 + 3000
    );

    if (timelineElapsed >= endTime) {
      endPlayback();
      return;
    }

    rafId = requestAnimationFrame(tick);
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

    viewport = document.getElementsByClassName("viewport")[0];
    letterbox = document.getElementsByClassName("letterbox")[0];
    scenes = document.getElementsByClassName("title--scene");
    fullTitle = document.getElementsByClassName("title--full")[0];
    credits = document.getElementsByClassName("credits-group");
    finalCredit = document.getElementsByClassName("credits-final")[0];
    overlay = document.querySelector(".intro-overlay");
    overlayBtn = document.querySelector("[data-toggle-play]");

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

    const stage = document.querySelector(".intro-stage");
    if (stage) {
      stage.addEventListener("click", (event) => {
        if (!started || ended) {
          return;
        }
        if (event.target && event.target.closest("[data-toggle-play]")) {
          return;
        }
        if (paused) {
          resumePlayback();
        }
        else {
          pausePlayback();
        }
      });
    }

    if (overlayBtn) {
      overlayBtn.addEventListener("click", () => {
        if (ended) {
          resetTimelineState();
          started = false;
          start();
          return;
        }
        resumePlayback();
      });
    }
  });

  // Fade out intro, start music and animation
  function start() {
    if (started) {
      return;
    }
    started = true;
    ended = false;
    paused = false;
    pausedDuration = 0;
    document.body.classList.remove("intro-paused");
    hideOverlay();

    const intro = document.getElementsByClassName("intro")[0];

    music = new Audio("intro-assets/music.mp3");

    intro.className += " intro--hide";

    music.addEventListener("canplay", () => {
      resetTimelineState();
      startTime = performance.now();
      rafId = requestAnimationFrame(tick);
      setTimeout(() => {
        if (!paused) {
          music.play();
        }
      }, introDelay + 200);
    });
  }

  // Kick off the animation
  function startAnimation() {}
})();
