/* Natural Microsoft voices exposed by the browser; never fall back to system voices. */
(function () {
  'use strict';
  var synth = window.speechSynthesis;
  // Gender is explicit: the Web Speech API does not supply gender metadata.
  var female = ['Ava', 'Emma', 'Aria', 'Jenny', 'Michelle', 'Sonia', 'Libby', 'Ana', 'Maisie', 'Natasha', 'Clara'];
  var male = ['Andrew', 'Brian', 'Guy', 'Christopher', 'Eric', 'Roger', 'Steffan', 'Ryan', 'Thomas', 'Liam'];
  // Minor roles have no specified gender in the screenplay; these are casting choices.
  var cast = {
    ILSE: ['f', 'Emma', 'Sonia'], MIRA: ['f', 'Jenny', 'Ava'],
    JUNO: ['f', 'Aria', 'Michelle'], KASIMIR: ['m', 'Andrew', 'Guy'],
    SEVERIN: ['m', 'Brian', 'Christopher'], TEO: ['m', 'Ryan', 'Eric'],
    DANIEL: ['m', 'Guy', 'Roger'], CHAIR: ['f', 'Sonia', 'Emma'],
    AIDE: ['f', 'Michelle', 'Ava'], GUARD: ['m', 'Christopher', 'Brian'],
    NEWS: ['f', 'Libby', 'Aria'], RADIO: ['m', 'Eric', 'Andrew'],
    OFFICER: ['m', 'Roger', 'Steffan'], PA: ['f', 'Ava', 'Emma'],
    CHILD: ['f', 'Ana', 'Maisie']
  };
  var assigned = {}, key = null, utterance = null, enabled = true, volume = 0.9;
  var status = document.getElementById('voiceStatus');
  var list = document.getElementById('voiceCast');
  function stop() {
    key = null;
    utterance = null;
    if (synth) synth.cancel();
  }
  function load() {
    var available = synth ? synth.getVoices().filter(function (v) {
      return /^en[-_]/i.test(v.lang) && /^Microsoft .*Online \(Natural\)/i.test(v.name);
    }) : [];
    var used = {};
    Object.keys(cast).forEach(function (role) {
      var spec = cast[role], names = spec.slice(1).concat(spec[0] === 'f' ? female : male);
      function find(unused) {
        for (var i = 0; i < names.length; i++) {
          var v = available.find(function (v) {
            return v.name.indexOf('Microsoft ' + names[i] + ' Online') === 0 && (!unused || !used[v.name]);
          });
          if (v) return v;
        }
        return null;
      }
      assigned[role] = find(true) || find(false);
      if (assigned[role]) used[assigned[role].name] = true;
    });
    var count = Object.keys(cast).filter(function (r) { return assigned[r]; }).length;
    status.textContent = count ? count + ' roles cast with natural voices. Internet required.' :
      'Natural voices unavailable. Open in Microsoft Edge with an internet connection. Dialogue remains subtitled.';
    list.replaceChildren();
    Object.keys(cast).forEach(function (role) {
      var row = document.createElement('div'), label = document.createElement('span');
      var v = assigned[role];
      label.textContent = role + ' (' + (cast[role][0] === 'f' ? 'female' : 'male') + ') — ' +
        (v ? v.name.replace('Microsoft ', '').replace(' Online (Natural)', '') : 'Unavailable');
      row.appendChild(label);
      var button = document.createElement('button');
      button.type = 'button'; button.textContent = 'Listen'; button.disabled = !v;
      button.setAttribute('aria-label', 'Preview ' + role);
      button.onclick = function () {
        stop();
        var sample;
        (window.LD_SCRIPT || []).some(function (s) {
          sample = s.lines.find(function (l) { return l.who === role && !/^[(\[]/.test(l.text); });
          return !!sample;
        });
        speak(role, sample ? sample.text : 'The day cycle begins.');
      };
      row.appendChild(button); list.appendChild(row);
    });
  }
  function speak(role, text) {
    if (!synth || !assigned[role] || !volume) return;
    var u = new SpeechSynthesisUtterance(text);
    u.voice = assigned[role]; u.lang = u.voice.lang;
    u.rate = 1; u.pitch = 1; u.volume = Math.min(1, volume);
    utterance = u; // Keep a live reference until completion.
    u.onend = function () { if (utterance === u) utterance = null; };
    u.onerror = function (e) {
      if (utterance !== u) return;
      utterance = null;
      if (e.error !== 'canceled' && e.error !== 'interrupted')
        status.textContent = 'Voice playback unavailable (' + e.error + '). Subtitles remain available.';
    };
    synth.speak(u);
  }
  window.LD_VOICES = {
    stop: stop, refresh: load,
    enable: function (value) { enabled = value; stop(); },
    volume: function (value) { volume = value; if (!value) stop(); },
    update: function (scene, t) {
      if (!enabled) return;
      var line = null;
      scene.lines.forEach(function (l) { if (l.t <= t) line = l; });
      var nextKey = scene.id + ':' + (line ? line.t : 'silence');
      if (nextKey === key) return;
      stop(); key = nextKey;
      if (line && t < line.t + line.d && line.who && !/^[(\[]/.test(line.text)) speak(line.who, line.text);
    }
  };
  if (synth) synth.addEventListener('voiceschanged', load);
  window.addEventListener('pagehide', stop);
  load(); setTimeout(load, 250); setTimeout(load, 1500);
})();
