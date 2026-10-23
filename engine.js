/* LONG DUSK — projector. Timeline, playback, subtitles, cards, film treatment, credits. */
(function () {
  'use strict';

  var SHOTS = window.LD_SHOTS || {};
  var MUSIC = window.LD_MUSIC || null;
  var VOICES = window.LD_VOICES;
  var FADE = 0.9; // seconds of black at each scene boundary (out + in)

  // ---------- timeline ----------
  var scenes = (window.LD_SCRIPT || []).slice().sort(function (a, b) {
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  var CREDITS = [
    ['', 'LONG DUSK', 'big'],
    ['', '長い黄昏', 'jp'],
    ['Written, directed and edited by', 'Claude'],
    ['Screenplay, Acts I–II', 'the first writer'],
    ['Screenplay, Acts III–IV', 'the second writer'],
    ['Backgrounds & space', 'the environment animator'],
    ['Character animation', 'the character animator'],
    ['Score & sound', 'the composer'],
    ['', ''],
    ['Ilse Varga', ''], ['Mira Varga', ''], ['Kasimir Oduya', ''],
    ['Admiral Hale Severin', ''], ['Juno Achterberg', ''], ['Teo Marsh', ''],
    ['', ''],
    ['In memory of', 'the thirty-one'],
    ['', ''],
    ['', 'Cold hands haul, cold hands bring', 'it'],
    ['', 'ice for the kings who never sing', 'it'],
    ['', ''],
    ['', 'Commissioned by a friend who asked for space, politics, and people.', 'small']
  ];

  scenes.push({
    id: 's19', act: 4, title: 'Credits', duration: 60, credits: true,
    shots: [{ t: 0, shot: 'credits_bg' }],
    music: [{ t: 0, cue: 'credits', fade: 3 }, { t: 52, cue: 'silence', fade: 8 }],
    sfx: [], lines: [], cards: []
  });

  var total = 0;
  scenes.forEach(function (s) {
    s.start = total;
    total += s.duration;
    ['shots', 'music', 'sfx', 'lines', 'cards'].forEach(function (k) {
      s[k] = (s[k] || []).slice().sort(function (a, b) { return a.t - b.t; });
    });
  });

  function sceneAt(T) {
    for (var i = scenes.length - 1; i >= 0; i--) if (T >= scenes[i].start) return i;
    return 0;
  }
  function lastBefore(arr, t) {
    var r = null;
    for (var i = 0; i < arr.length; i++) { if (arr[i].t <= t) r = arr[i]; else break; }
    return r;
  }

  // ---------- DOM ----------
  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage'), canvas = $('screen'), ctx = canvas.getContext('2d');
  var frameCv = document.createElement('canvas'), fctx = frameCv.getContext('2d');
  var subEl = $('subs'), cardEl = $('card'), creditsEl = $('credits');
  var ui = $('ui'), bar = $('bar'), barFill = $('barFill'), barMarks = $('barMarks');
  var timeEl = $('time'), chapterEl = $('chapterName'), playBtn = $('play');
  var startEl = $('start'), chaptersEl = $('chapters');

  var state = {
    T: 0, playing: false, started: false, subs: true, names: true,
    lastFrame: 0, sceneIdx: -1, lastSceneT: 0, errors: {}
  };
  try {
    var saved = JSON.parse(localStorage.getItem('longdusk') || '{}');
    if (saved.T && saved.T < total - 5) state.resumeT = saved.T;
    if (saved.names === false) state.names = false;
    if (saved.subs === false) state.subs = false;
  } catch (e) {}
  function persist() {
    try { localStorage.setItem('longdusk', JSON.stringify({ T: state.T, names: state.names, subs: state.subs })); } catch (e) {}
  }

  // ---------- sizing ----------
  var W = 0, H = 0, FX = 0, FY = 0, FW = 0, FH = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    var r = stage.getBoundingClientRect();
    W = Math.round(r.width * DPR); H = Math.round(r.height * DPR);
    canvas.width = W; canvas.height = H;
    // 16:9 frame inside the stage
    if (W / H > 16 / 9) { FH = H; FW = Math.round(H * 16 / 9); } else { FW = W; FH = Math.round(W * 9 / 16); }
    FX = Math.round((W - FW) / 2); FY = Math.round((H - FH) / 2);
    // render internally at most 1920 wide
    var s = Math.min(1, 1920 / FW);
    frameCv.width = Math.round(FW * s); frameCv.height = Math.round(FH * s);
    var css = function (v) { return (v / DPR) + 'px'; };
    var ov = $('overlay');
    ov.style.left = css(FX); ov.style.top = css(FY); ov.style.width = css(FW); ov.style.height = css(FH);
    ov.style.fontSize = Math.max(11, FH / DPR / 26) + 'px';
    buildGrain();
  }

  // ---------- film treatment ----------
  var grain = [], vignette = null;
  function buildGrain() {
    grain = [];
    var gw = 256, gh = 256, seed = 1337;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var k = 0; k < 6; k++) {
      var c = document.createElement('canvas'); c.width = gw; c.height = gh;
      var g = c.getContext('2d'), img = g.createImageData(gw, gh), d = img.data;
      for (var i = 0; i < d.length; i += 4) {
        var v = rnd() * 255;
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      // a few dust specks and a hair
      g.fillStyle = 'rgba(0,0,0,1)';
      for (var j = 0; j < 3; j++) { g.beginPath(); g.arc(rnd() * gw, rnd() * gh, rnd() * 1.6 + 0.4, 0, 7); g.fill(); }
      grain.push(c);
    }
    vignette = document.createElement('canvas'); vignette.width = 512; vignette.height = 288;
    var vg = vignette.getContext('2d');
    var grd = vg.createRadialGradient(256, 144, 60, 256, 144, 300);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.7, 'rgba(0,0,0,0.18)'); grd.addColorStop(1, 'rgba(0,0,0,0.62)');
    vg.fillStyle = grd; vg.fillRect(0, 0, 512, 288);
  }

  // ---------- rendering ----------
  function drawShot(scene, sceneT) {
    var fw = frameCv.width, fh = frameCv.height;
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.globalAlpha = 1; fctx.globalCompositeOperation = 'source-over';
    fctx.fillStyle = '#000'; fctx.fillRect(0, 0, fw, fh);
    var shot = lastBefore(scene.shots, sceneT) || { t: 0, shot: 'black' };
    var fn = SHOTS[shot.shot] || SHOTS.black;
    if (!fn) return;
    fctx.save();
    try {
      fn(fctx, fw, fh, sceneT - shot.t, shot.p || {}, { sceneT: sceneT, globalT: state.T, dt: 1 / 60, seed: 7 });
    } catch (e) {
      if (!state.errors[shot.shot]) { state.errors[shot.shot] = 1; console.warn('[LD] shot error', shot.shot, e); }
    }
    fctx.restore();
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.globalAlpha = 1; fctx.globalCompositeOperation = 'source-over';
  }

  function render() {
    var i = sceneAt(state.T), scene = scenes[i], sceneT = state.T - scene.start;
    drawShot(scene, sceneT);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    // gate weave: a sub-pixel drift, like film in a projector
    var tt = state.T;
    var wx = Math.sin(tt * 1.7) * 0.6 + Math.sin(tt * 5.3) * 0.3;
    var wy = Math.sin(tt * 1.3 + 1) * 0.6;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(frameCv, FX + wx * DPR, FY + wy * DPR, FW, FH);

    // flicker, vignette, grain
    var flick = 0.03 + 0.025 * Math.sin(tt * 23.1) * Math.sin(tt * 7.7);
    ctx.fillStyle = 'rgba(0,0,0,' + Math.max(0, flick) + ')';
    ctx.fillRect(FX, FY, FW, FH);
    ctx.drawImage(vignette, FX, FY, FW, FH);
    if (grain.length) {
      var gi = Math.floor(tt * 24) % grain.length;
      ctx.save();
      ctx.globalAlpha = 0.07;
      ctx.globalCompositeOperation = 'overlay';
      var pat = ctx.createPattern(grain[gi], 'repeat');
      ctx.translate(FX + ((tt * 97) % 256), FY + ((tt * 61) % 256));
      ctx.fillStyle = pat;
      ctx.fillRect(-256, -256, FW + 512, FH + 512);
      ctx.restore();
    }

    // scene-boundary fades
    var a = 0;
    if (sceneT < FADE) a = 1 - sceneT / FADE;
    var rem = scene.duration - sceneT;
    if (rem < FADE) a = Math.max(a, 1 - rem / FADE);
    if (a > 0) { ctx.fillStyle = 'rgba(0,0,0,' + a + ')'; ctx.fillRect(FX, FY, FW, FH); }

    // matte bars outside the frame stay pure black
    ctx.fillStyle = '#000';
    if (FY > 0) { ctx.fillRect(0, 0, W, FY); ctx.fillRect(0, FY + FH, W, H - FY - FH); }
    if (FX > 0) { ctx.fillRect(0, 0, FX, H); ctx.fillRect(FX + FW, 0, W - FX - FW, H); }

    renderText(scene, sceneT);
  }

  // ---------- subtitles & cards ----------
  var NAMECOL = {
    ILSE: '#c9b8d8', MIRA: '#9fc98a', KASIMIR: '#e0a36a', SEVERIN: '#9fb4e0',
    JUNO: '#f0d27a', TEO: '#a9d3dc', DANIEL: '#e8e2c8'
  };
  var lastSubKey = null, lastCardKey = null;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function renderText(scene, sceneT) {
    // subtitles
    var line = null;
    for (var i = 0; i < scene.lines.length; i++) {
      var L = scene.lines[i];
      if (L.t > sceneT) break;
      if (sceneT < L.t + L.d) line = L;
    }
    var key = state.subs && line ? scene.id + line.t : null;
    if (key !== lastSubKey) {
      lastSubKey = key;
      if (!key) { subEl.innerHTML = ''; }
      else {
        var who = line.who || '';
        var nm = state.names && who && !/^[(\[]/.test(line.text)
          ? '<span class="who" style="color:' + (NAMECOL[who] || '#bdb6a6') + '">' + esc(who) + '</span>' : '';
        subEl.innerHTML = '<div class="line' + (line.it ? ' it' : '') + (!who ? ' sfxcap' : '') + '">' + nm + '<span class="tx">' + esc(line.text) + '</span></div>';
      }
    }
    if (line && key) {
      var age = sceneT - line.t, left = line.t + line.d - sceneT;
      subEl.style.opacity = Math.min(1, age / 0.18, left / 0.22);
    }

    // cards
    var card = null;
    for (var j = 0; j < scene.cards.length; j++) {
      var C = scene.cards[j];
      if (C.t > sceneT) break;
      if (sceneT < C.t + C.d) card = C;
    }
    var ck = card ? scene.id + card.t : null;
    if (ck !== lastCardKey) {
      lastCardKey = ck;
      if (!card) { cardEl.className = ''; cardEl.innerHTML = ''; }
      else {
        var st = card.style || 'chapter';
        var html = '';
        if (st === 'title') html = '<div class="t-en">' + esc(card.text) + '</div><div class="t-jp">' + esc(card.jp || '長い黄昏') + '</div>';
        else if (st === 'act') html = '<div class="a-jp">' + esc(card.jp || '') + '</div><div class="a-en">' + esc(card.text) + '</div>';
        else if (st === 'end') html = '<div class="e-jp">' + esc(card.text || '終') + '</div>';
        else html = '<div>' + esc(card.text) + '</div>';
        cardEl.className = 'card-' + st;
        cardEl.innerHTML = html;
      }
    }
    if (card) {
      var ca = sceneT - card.t, cl = card.t + card.d - sceneT, fd = card.style === 'location' ? 0.5 : 1.2;
      cardEl.style.opacity = Math.max(0, Math.min(1, ca / fd, cl / fd));
    }

    // credits roll
    if (scene.credits) {
      creditsEl.hidden = false;
      var h = creditsEl.scrollHeight, vh = creditsEl.parentNode.clientHeight;
      var prog = sceneT / (scene.duration - 6);
      creditsEl.style.transform = 'translateY(' + (vh - Math.min(1, prog) * (h + vh * 0.35)) + 'px)';
    } else creditsEl.hidden = true;
  }

  function buildCredits() {
    creditsEl.innerHTML = CREDITS.map(function (c) {
      var cls = c[2] || '';
      if (cls === 'big') return '<div class="cr-big">' + esc(c[1]) + '</div>';
      if (cls === 'jp') return '<div class="cr-jp">' + esc(c[1]) + '</div>';
      if (!c[0] && !c[1]) return '<div class="cr-gap"></div>';
      return '<div class="cr-row ' + cls + '"><span>' + esc(c[0]) + '</span><span>' + esc(c[1]) + '</span></div>';
    }).join('');
  }

  // ---------- audio events ----------
  var audioCtx = null, master = null;
  function initAudio() {
    if (audioCtx) { if (audioCtx.state === 'suspended') audioCtx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
    master = audioCtx.createGain();
    master.gain.value = parseFloat($('vol').value);
    master.connect(audioCtx.destination);
    if (MUSIC) { try { MUSIC.init(audioCtx, master); } catch (e) { console.warn('[LD] music init', e); MUSIC = null; } }
  }
  function safe(fn) { try { fn(); } catch (e) { console.warn('[LD] audio', e); } }

  function fireEvents(scene, from, to) {
    if (!MUSIC || !audioCtx) return;
    scene.music.forEach(function (m) { if (m.t > from && m.t <= to) safe(function () { MUSIC.cue(m.cue, m.fade == null ? 2 : m.fade); }); });
    scene.sfx.forEach(function (s) { if (s.t > from && s.t <= to) safe(function () { MUSIC.sfx(s.sfx); }); });
  }

  // after a seek: put the score where it would be
  function resyncMusic() {
    if (!MUSIC || !audioCtx) return;
    safe(function () { MUSIC.stopAll(); });
    var i = sceneAt(state.T), sceneT = state.T - scenes[i].start, m = null;
    for (var k = i; k >= 0 && !m; k--) {
      var arr = scenes[k].music, lim = k === i ? sceneT : Infinity;
      for (var j = arr.length - 1; j >= 0; j--) if (arr[j].t <= lim) { m = arr[j]; break; }
    }
    if (m) safe(function () { MUSIC.cue(m.cue, 1.5); });
  }

  // ---------- loop ----------
  var lastPersist = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    var dt = state.lastFrame ? Math.min(0.1, (now - state.lastFrame) / 1000) : 0;
    state.lastFrame = now;
    if (state.playing) {
      var prevT = state.T;
      state.T = Math.min(total, state.T + dt);
      var i = sceneAt(state.T), sc = scenes[i];
      if (i !== state.sceneIdx) {
        // entering a new scene: fire anything at t=0 (and anything skipped in the old one)
        if (state.sceneIdx >= 0 && state.sceneIdx < i) {
          var old = scenes[state.sceneIdx];
          fireEvents(old, prevT - old.start, old.duration + 1);
        }
        state.sceneIdx = i;
        fireEvents(sc, -1, state.T - sc.start);
        updateChapter();
      } else {
        fireEvents(sc, prevT - sc.start, state.T - sc.start);
      }
      if (MUSIC && MUSIC.update) safe(function () { MUSIC.update(state.T - sc.start); });
      if (VOICES) VOICES.update(sc, state.T - sc.start);
      if (state.T >= total) { state.playing = false; showUI(true); state.T = total; }
      if (now - lastPersist > 3000) { lastPersist = now; persist(); }
    }
    if (state.started) { render(); updateBar(); }
  }

  // ---------- controls ----------
  function fmt(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function updateBar() {
    barFill.style.width = (state.T / total * 100) + '%';
    timeEl.textContent = fmt(state.T) + ' / ' + fmt(total);
    playBtn.textContent = state.playing ? 'Pause' : 'Play';
    playBtn.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
  }
  function updateChapter() {
    var s = scenes[sceneAt(state.T)];
    chapterEl.textContent = (s.actTitle ? s.actTitle + ' · ' : '') + (s.title || '');
    Array.prototype.forEach.call(chaptersEl.querySelectorAll('button'), function (b) {
      b.classList.toggle('on', b.dataset.id === s.id);
    });
  }
  function seek(T) {
    if (VOICES) VOICES.stop();
    state.T = Math.max(0, Math.min(total - 0.01, T));
    state.sceneIdx = sceneAt(state.T);
    // undefined, not null: null means "nothing showing" and would skip clearing a stale card
    lastSubKey = lastCardKey = undefined;
    resyncMusic();
    updateChapter();
    persist();
  }
  function play() {
    initAudio();
    if (state.T >= total - 0.01) seek(0);
    state.playing = true;
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    scheduleHide();
  }
  function pause() { state.playing = false; if (VOICES) VOICES.stop(); if (audioCtx) audioCtx.suspend(); showUI(true); persist(); }
  function toggle() { state.playing ? pause() : play(); }

  var hideTimer = null;
  function showUI(sticky) {
    ui.classList.add('show'); stage.classList.remove('nocursor');
    clearTimeout(hideTimer);
    if (!sticky) scheduleHide();
  }
  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      if (state.playing && !chaptersEl.classList.contains('open') && !ui.matches(':hover')) {
        ui.classList.remove('show'); stage.classList.add('nocursor');
      }
    }, 2600);
  }

  function buildChapters() {
    var html = '', act = null;
    scenes.forEach(function (s) {
      if (s.credits) return;
      if (s.act !== act) {
        act = s.act;
        html += '<div class="ch-act"><span>' + esc(s.actTitleJp || '') + '</span> ' + ['', 'I', 'II', 'III', 'IV'][s.act] + ' · ' + esc(s.actTitle || '') + '</div>';
      }
      html += '<button type="button" data-id="' + s.id + '" data-t="' + s.start + '"><span class="ch-t">' + fmt(s.start) + '</span>' + esc(s.title || s.id) + '</button>';
    });
    chaptersEl.innerHTML = html;
    chaptersEl.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      seek(parseFloat(b.dataset.t) + 0.001);
      chaptersEl.classList.remove('open');
      if (!state.playing) play();
    });
    barMarks.innerHTML = scenes.map(function (s) {
      return s.start ? '<i style="left:' + (s.start / total * 100) + '%"></i>' : '';
    }).join('');
  }

  function scrub(e) {
    var r = bar.getBoundingClientRect();
    seek((e.clientX - r.left) / r.width * total);
  }
  var dragging = false;
  bar.addEventListener('pointerdown', function (e) { dragging = true; bar.setPointerCapture(e.pointerId); scrub(e); });
  bar.addEventListener('pointermove', function (e) {
    var r = bar.getBoundingClientRect(), T = (e.clientX - r.left) / r.width * total;
    var s = scenes[sceneAt(Math.max(0, Math.min(total - 0.01, T)))];
    bar.title = fmt(T) + ' — ' + (s.title || '');
    if (dragging) scrub(e);
  });
  bar.addEventListener('pointerup', function () { dragging = false; });

  playBtn.addEventListener('click', toggle);
  $('back').addEventListener('click', function () { seek(state.T - 10); });
  $('fwd').addEventListener('click', function () { seek(state.T + 10); });
  $('chBtn').addEventListener('click', function () { chaptersEl.classList.toggle('open'); showUI(true); });
  $('voiceBtn').addEventListener('click', function () {
    var enabled = this.getAttribute('aria-pressed') !== 'true';
    this.setAttribute('aria-pressed', enabled);
    if (VOICES) VOICES.enable(enabled);
  });
  $('castBtn').addEventListener('click', function () {
    pause();
    if (VOICES) VOICES.refresh();
    $('voiceDialog').showModal();
  });
  $('voiceDialog').addEventListener('close', function () { if (VOICES) VOICES.stop(); });
  $('subBtn').addEventListener('click', function () { state.subs = !state.subs; lastSubKey = null; syncToggles(); persist(); });
  $('nameBtn').addEventListener('click', function () { state.names = !state.names; lastSubKey = null; syncToggles(); persist(); });
  $('fsBtn').addEventListener('click', function () {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else stage.requestFullscreen().catch(function () {});
    } catch (e) {}
  });
  $('vol').addEventListener('input', function (e) {
    var value = parseFloat(e.target.value);
    if (master) master.gain.value = value;
    if (VOICES) VOICES.volume(value);
  });
  function syncToggles() {
    $('subBtn').setAttribute('aria-pressed', state.subs);
    $('nameBtn').setAttribute('aria-pressed', state.names);
  }

  stage.addEventListener('pointermove', function () { if (state.started) showUI(); });
  $('screenHit').addEventListener('click', function () {
    if (chaptersEl.classList.contains('open')) { chaptersEl.classList.remove('open'); return; }
    toggle();
  });
  document.addEventListener('keydown', function (e) {
    if (!state.started || e.target.tagName === 'INPUT' || $('voiceDialog').open) return;
    var k = e.key;
    if (k === ' ' || k === 'k') { e.preventDefault(); toggle(); }
    else if (k === 'ArrowLeft') seek(state.T - 10);
    else if (k === 'ArrowRight') seek(state.T + 10);
    else if (k === 'f') $('fsBtn').click();
    else if (k === 'c') $('chBtn').click();
    else if (k === 's') $('subBtn').click();
    else if (k === 'n') $('nameBtn').click();
    else return;
    showUI();
  });

  function begin(fromT) {
    startEl.hidden = true;
    stage.hidden = false;
    state.started = true;
    resize();
    initAudio();
    seek(fromT || 0);
    if (!fromT) state.sceneIdx = -1; // so the first scene's t=0 events fire
    play();
  }

  // ---------- boot ----------
  $('runtime').textContent = Math.round(total / 60) + ' minutes · ' + (scenes.length - 1) + ' scenes · four acts';
  $('beginBtn').addEventListener('click', function () { begin(0); });
  if (state.resumeT) {
    var rb = $('resumeBtn'); rb.hidden = false;
    rb.textContent = 'Resume at ' + fmt(state.resumeT);
    rb.addEventListener('click', function () { begin(state.resumeT); });
  }
  buildChapters(); buildCredits(); syncToggles();
  window.addEventListener('resize', function () { if (state.started) resize(); });
  document.addEventListener('fullscreenchange', function () { setTimeout(resize, 50); });
  requestAnimationFrame(tick);

  // debug hook for previews: #f123 renders a still at 123s
  var fm = /^#f(\d+(?:\.\d+)?)$/.exec(location.hash);
  if (fm) setTimeout(function () { window.LD_DEBUG.frame(parseFloat(fm[1])); }, 400);
  window.LD_DEBUG = {
    total: total, scenes: scenes,
    frame: function (T) { if (!state.started) { startEl.hidden = true; stage.hidden = false; state.started = true; resize(); } state.T = T; render(); updateBar(); },
  };
})();
