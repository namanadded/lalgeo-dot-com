document.addEventListener("DOMContentLoaded", () => {
  const root = document.querySelector("[data-intro]");
  if (!root) return;

  // Fix: ensure a visible play control exists and binds to all play buttons.
  const playButtons = Array.from(root.querySelectorAll("[data-play]"));
  const audioToggle = root.querySelector("[data-audio]");
  const stroke = root.querySelector(".title-stroke");
  const fill = root.querySelector(".title-fill");
  const depth = root.querySelector(".title-depth");
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

  if (!window.gsap) {
    // If GSAP fails to load, reveal a static hero state so the box isn't blank.
    bg.style.opacity = "1";
    fog.style.opacity = "0.6";
    grain.style.opacity = "0.06";
    vignette.style.opacity = "1";
    fill.style.opacity = "1";
    depth.style.opacity = "0.7";
    subtitle.style.opacity = "1";
    console.error("GSAP is required for the intro timeline.");
    return;
  }

  const length = stroke.getComputedTextLength ? stroke.getComputedTextLength() : 1200;

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
    gsap.set(stroke, { strokeDasharray: length, strokeDashoffset: length, opacity: 1 });
    gsap.set([fill, depth], { opacity: 0 });
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
    tl.to(stroke, { strokeDashoffset: 0, duration: 3.2, ease: "power2.inOut" }, 1.1);

    // 4) Fill bloom + depth lock
    tl.to(fill, { opacity: 1, duration: 2.2, ease: "power2.out" }, 2.4);
    tl.to(depth, { opacity: 0.7, duration: 2.0, ease: "power2.out" }, 2.6);

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

  let timeline = buildTimeline();

  function replay() {
    timeline.kill();
    timeline = buildTimeline();
    startAudio(3400); // tweak: lock time for audio hit
    timeline.play(0);
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
});
