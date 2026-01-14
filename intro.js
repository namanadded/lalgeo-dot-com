document.addEventListener("DOMContentLoaded", () => {
  const root = document.querySelector("[data-intro]");
  if (!root) return;

  // Fix: bind play/replay buttons and use a single title element (no duplicate text layers).
  // Fix: intro container must be absolutely positioned to avoid zero-height in aspect-ratio wrapper.
  const playButtons = Array.from(root.querySelectorAll("[data-play]"));
  const audioToggle = root.querySelector("[data-audio]");
  const titleText = root.querySelector(".title-text");
  const subtitle = root.querySelector(".intro-subtitle");
  const bg = root.querySelector(".intro-bg");
  const guides = root.querySelector(".intro-guides");
  const streakH1 = root.querySelector(".streak-h1");
  const streakH2 = root.querySelector(".streak-h2");
  const streakV1 = root.querySelector(".streak-v1");
  const camera = root.querySelector(".intro-camera");
  const fog = root.querySelector(".intro-fog");
  const grain = root.querySelector(".intro-grain");
  const vignette = root.querySelector(".intro-vignette");
  const blurNode = root.querySelector("#bloomBlur");

  const length = titleText.getComputedTextLength ? titleText.getComputedTextLength() : 1200;

  let audioCtx = null;

  function playWhoosh(time) {
    const noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 1.2, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * 0.4;
    }

    const noise = audioCtx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(300, time);
    filter.frequency.exponentialRampToValueAtTime(2000, time + 0.9);

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.06, time + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 1.1);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    noise.start(time);
    noise.stop(time + 1.1);
  }

  function playHit(time) {
    const osc = audioCtx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(70, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.35);

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.08, time + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.5);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(time);
    osc.stop(time + 0.6);
  }

  function startAudio(lockTimeMs) {
    if (!audioToggle.checked) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (audioCtx) audioCtx.close();
    audioCtx = new AudioCtx();
    const startTime = audioCtx.currentTime + 0.05;
    const hitTime = startTime + lockTimeMs / 1000;
    playWhoosh(startTime + 0.1);
    playHit(hitTime);
  }

  function buildTimeline() {
    gsap.set(bg, { opacity: 0 });
    gsap.set(guides, { opacity: 0 });
    gsap.set([grain, vignette], { opacity: 0 });
    gsap.set([streakH1, streakH2, streakV1], { opacity: 0, x: 0, y: 0 });
    gsap.set(titleText, { strokeDasharray: length, strokeDashoffset: length, fillOpacity: 0, opacity: 1 });
    gsap.set(subtitle, { opacity: 0, y: 12 });
    gsap.set(camera, { scale: 0.98, x: 0, y: 0 });
    gsap.set(fog, { opacity: 0.2 });

    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

    // 1) Background fade-in
    tl.to(bg, { opacity: 1, duration: 1.2 }, 0);
    tl.to(fog, { opacity: 0.6, duration: 2.4 }, 0.2);
    tl.to(grain, { opacity: 0.06, duration: 1.6 }, 0.4);
    tl.to(vignette, { opacity: 1, duration: 1.6 }, 0.4);

    // 2) Guide lines in
    tl.to(guides, { opacity: 0.45, duration: 1.6 }, 0.8);

    // 3) Stroke reveal left-to-right
    tl.to(titleText, { strokeDashoffset: 0, duration: 3.2, ease: "power2.inOut" }, 1.1);

    // 4) Fill bloom + depth lock
    tl.to(titleText, { fillOpacity: 1, duration: 2.2, ease: "power2.out" }, 2.4);

    // Bloom intensity ramp
    if (blurNode) {
      tl.fromTo(blurNode, { attr: { stdDeviation: 0 } }, { attr: { stdDeviation: 4 }, duration: 2.0 }, 2.4);
    }

    // 5) Light streaks
    tl.to(streakH1, { opacity: 0.7, x: 20, duration: 3.6, ease: "sine.inOut" }, 3.2);
    tl.to(streakH2, { opacity: 0.55, x: -10, duration: 3.8, ease: "sine.inOut" }, 3.6);
    tl.to(streakV1, { opacity: 0.5, y: 18, duration: 4.2, ease: "sine.inOut" }, 4.0);

    // 6) Camera push + subtle drift
    tl.to(camera, { scale: 1.04, x: 6, duration: 7.5, ease: "sine.inOut" }, 0.6);

    // 7) Subtitle reveal
    tl.to(subtitle, { opacity: 1, y: 0, duration: 2.2, ease: "power2.out" }, 5.2);

    // 8) Flicker + micro jitter settle
    tl.to(root, { opacity: 0.98, duration: 0.12, repeat: 3, yoyo: true, ease: "power1.inOut" }, 6.4);

    // Final hold
    tl.to({}, { duration: 3 });

    return tl;
  }

  let timeline = window.gsap ? buildTimeline() : null;
  let fallbackAnimations = [];

  function clearFallback() {
    fallbackAnimations.forEach((anim) => anim.cancel());
    fallbackAnimations = [];
  }

  function animateFallback(element, keyframes, options) {
    if (!element) return;
    const anim = element.animate(keyframes, options);
    fallbackAnimations.push(anim);
  }

  function playFallback() {
    // Fix: if GSAP fails to load, run a lightweight Web Animations fallback instead of doing nothing.
    clearFallback();

    bg.style.opacity = "0";
    fog.style.opacity = "0.2";
    grain.style.opacity = "0";
    vignette.style.opacity = "0";
    guides.style.opacity = "0";
    titleText.style.strokeDasharray = length;
    titleText.style.strokeDashoffset = length;
    titleText.style.fillOpacity = "0";
    subtitle.style.opacity = "0";
    subtitle.style.transform = "translateY(12px)";

    animateFallback(bg, [{ opacity: 0 }, { opacity: 1 }], { duration: 1200, fill: "forwards", easing: "ease-out" });
    animateFallback(fog, [{ opacity: 0.2 }, { opacity: 0.6 }], { duration: 2400, delay: 200, fill: "forwards", easing: "ease-out" });
    animateFallback(grain, [{ opacity: 0 }, { opacity: 0.06 }], { duration: 1600, delay: 400, fill: "forwards" });
    animateFallback(vignette, [{ opacity: 0 }, { opacity: 1 }], { duration: 1600, delay: 400, fill: "forwards" });
    animateFallback(guides, [{ opacity: 0 }, { opacity: 0.45 }], { duration: 1600, delay: 800, fill: "forwards" });

    animateFallback(titleText, [{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { duration: 3200, delay: 1100, fill: "forwards", easing: "ease-in-out" });
    animateFallback(titleText, [{ fillOpacity: 0 }, { fillOpacity: 1 }], { duration: 2200, delay: 2400, fill: "forwards", easing: "ease-out" });

    animateFallback(streakH1, [{ opacity: 0, transform: "translateX(0px)" }, { opacity: 0.7, transform: "translateX(20px)" }], { duration: 3600, delay: 3200, fill: "forwards", easing: "ease-in-out" });
    animateFallback(streakH2, [{ opacity: 0, transform: "translateX(0px)" }, { opacity: 0.55, transform: "translateX(-10px)" }], { duration: 3800, delay: 3600, fill: "forwards", easing: "ease-in-out" });
    animateFallback(streakV1, [{ opacity: 0, transform: "translateY(0px)" }, { opacity: 0.5, transform: "translateY(18px)" }], { duration: 4200, delay: 4000, fill: "forwards", easing: "ease-in-out" });

    animateFallback(camera, [{ transform: "scale(0.98) translateX(0px)" }, { transform: "scale(1.04) translateX(6px)" }], { duration: 7500, delay: 600, fill: "forwards", easing: "ease-in-out" });

    animateFallback(subtitle, [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 2200, delay: 5200, fill: "forwards", easing: "ease-out" });
  }

  function replay() {
    if (window.gsap) {
      timeline.kill();
      timeline = buildTimeline();
    } else {
      playFallback();
    }
    startAudio(3400); // Fix: audio hit synced to fill lock; controlled by Audio checkbox.
    if (window.gsap) {
      timeline.play(0);
    }
    root.classList.add("is-playing");
    playButtons.forEach((btn) => {
      btn.textContent = "Replay Intro";
    });
  }

  playButtons.forEach((btn) => btn.addEventListener("click", replay));
  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-play]") || event.target.closest("[data-audio]")) return;
    replay();
  });

  if (!window.gsap) {
    // Fix: GSAP CDN blocked or failed; enable fallback + warn in console.
    console.error("GSAP is required for the full intro timeline; running fallback animation.");
  }
});
