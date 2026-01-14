document.addEventListener("DOMContentLoaded", () => {
  const root = document.querySelector("[data-intro]");
  if (!root) return;

  // Fix: bind play/replay buttons and use a single title element (no duplicate text layers).
  // Typography update: title text now uses Phosphate, uppercase, and logo red.
  // Fix: intro container must be absolutely positioned to avoid zero-height in aspect-ratio wrapper.
  const playButtons = Array.from(root.querySelectorAll("[data-play]"));
  const audioToggle = root.querySelector("[data-audio]");
  const titleGroup = root.querySelector(".title-group");
  const arcs = Array.from(root.querySelectorAll(".arc"));
  const subtitle = root.querySelector(".intro-subtitle");
  const bg = root.querySelector(".intro-bg");
  const camera = root.querySelector(".intro-camera");
  const fog = root.querySelector(".intro-fog");
  const grain = root.querySelector(".intro-grain");
  const vignette = root.querySelector(".intro-vignette");

  const length = 1600;

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
    gsap.set([grain, vignette], { opacity: 0 });
    gsap.set(arcs, { strokeDasharray: length, strokeDashoffset: length, opacity: 0 });
    gsap.set(titleGroup, { opacity: 0 });
    gsap.set(subtitle, { opacity: 0, y: 12 });
    gsap.set(camera, { scale: 0.98, x: 0, y: 0 });
    gsap.set(fog, { opacity: 0.2 });

    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

    // 1) Background fade-in
    tl.to(bg, { opacity: 1, duration: 1.2 }, 0);
    tl.to(fog, { opacity: 0.6, duration: 2.4 }, 0.2);
    tl.to(grain, { opacity: 0.06, duration: 1.6 }, 0.4);
    tl.to(vignette, { opacity: 1, duration: 1.6 }, 0.4);

    // 2) Red arcs sweep to reveal outlines
    tl.to(arcs, {
      opacity: 1,
      strokeDashoffset: 0,
      duration: 40,
      stagger: { each: 4, ease: "sine.inOut" }
    }, 2);

    // 3) Outline visibility settles as arcs complete
    tl.to(titleGroup, { opacity: 1, duration: 10, ease: "sine.inOut" }, 6);

    // 6) Camera push + subtle drift
    tl.to(camera, { scale: 1.04, x: 6, duration: 7.5, ease: "sine.inOut" }, 0.6);

    // 4) Subtitle reveal near the end
    tl.to(subtitle, { opacity: 1, y: 0, duration: 6, ease: "sine.inOut" }, 45);

    // Final hold
    tl.to({}, { duration: 10 });

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
    titleGroup.style.opacity = "0";
    arcs.forEach((arc) => {
      arc.style.strokeDasharray = length;
      arc.style.strokeDashoffset = length;
      arc.style.opacity = "0";
    });
    subtitle.style.opacity = "0";
    subtitle.style.transform = "translateY(12px)";

    animateFallback(bg, [{ opacity: 0 }, { opacity: 1 }], { duration: 1200, fill: "forwards", easing: "ease-out" });
    animateFallback(fog, [{ opacity: 0.2 }, { opacity: 0.6 }], { duration: 2400, delay: 200, fill: "forwards", easing: "ease-out" });
    animateFallback(grain, [{ opacity: 0 }, { opacity: 0.06 }], { duration: 1600, delay: 400, fill: "forwards" });
    animateFallback(vignette, [{ opacity: 0 }, { opacity: 1 }], { duration: 1600, delay: 400, fill: "forwards" });
    arcs.forEach((arc, index) => {
      animateFallback(arc, [{ opacity: 0, strokeDashoffset: length }, { opacity: 1, strokeDashoffset: 0 }], { duration: 40000, delay: 2000 + index * 4000, fill: "forwards", easing: "ease-in-out" });
    });
    animateFallback(titleGroup, [{ opacity: 0 }, { opacity: 1 }], { duration: 10000, delay: 6000, fill: "forwards", easing: "ease-in-out" });

    animateFallback(camera, [{ transform: "scale(0.98) translateX(0px)" }, { transform: "scale(1.04) translateX(6px)" }], { duration: 7500, delay: 600, fill: "forwards", easing: "ease-in-out" });

    animateFallback(subtitle, [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 6000, delay: 45000, fill: "forwards", easing: "ease-in-out" });
  }

  function replay() {
    if (window.gsap) {
      timeline.kill();
      timeline = buildTimeline();
    } else {
      playFallback();
    }
    startAudio(48000); // Fix: audio hit synced near subtitle reveal; controlled by Audio checkbox.
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
