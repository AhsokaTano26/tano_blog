(() => {
  'use strict';
  const { text, icon, stages } = JSON.parse(document.getElementById('entry-data').textContent);
  const root = document.documentElement;
  const entry = document.querySelector('.admin-entry');
  const skip = document.querySelector('.admin-entry-skip');
  const node = (tag, className, value) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value != null) element.textContent = value;
    return element;
  };
  document.querySelectorAll('[data-entry]').forEach(element => {
    element.textContent = text[element.dataset.entry];
    if (element.classList.contains('admin-entry-chromatic')) element.dataset.text = element.textContent;
  });
  document.querySelectorAll('[data-mark]').forEach(element => {
    element.append(document.getElementById('archive-mark').content.cloneNode(true));
  });
  if (icon) {
    const image = node('img');
    image.src = icon;
    image.alt = '';
    document.getElementById('welcome-icon').replaceChildren(image);
  }
  for (const line of text.data_stream.split('\n')) document.getElementById('data-stream').append(node('span', '', line));
  const stageStyle = (element, stage) => {
    element.style.setProperty('--stage-start', `${stage.Start}ms`);
    element.style.setProperty('--stage-duration', `${stage.End - stage.Start}ms`);
    element.style.setProperty('--stage-position', stage.Position);
  };
  const terminal = (element, value, duration, step) => {
    const characters = Array.from(value);
    // Long custom captions still finish typing before their phase exits.
    element.style.setProperty('--char-step', `${Math.min(step, (duration * .4) / Math.max(1, characters.length))}ms`);
    characters.forEach((character, index) => {
      const span = node('span', '', character === ' ' ? '\u00a0' : character);
      span.style.setProperty('--char-index', index);
      element.append(span);
    });
  };
  stages.forEach((stage, index) => {
    const prefix = `stage_${stage.Key}_`;
    const status = node('div', 'admin-entry-status');
    status.dataset.phase = stage.Phase;
    stageStyle(status, stage);
    const heading = node('h2');
    terminal(heading, text[prefix + 'title'], stage.End - stage.Start, 34);
    heading.append(node('i'));
    const subtitle = node('p');
    terminal(subtitle, text[prefix + 'subtitle'], stage.End - stage.Start, 10);
    status.append(heading, subtitle, node('div', 'admin-entry-rule'));
    document.querySelector('.admin-entry-console').append(status);
    const slat = node('i');
    stageStyle(slat, stage);
    document.querySelector('.admin-entry-slats').append(slat);
    const log = node('div', 'admin-entry-log');
    stageStyle(log, stage);
    const caption = node('div', 'admin-entry-subtitle');
    caption.append(node('span', '', text[prefix + 'log']), node('small', '', text[prefix + 'log_en']));
    log.append(node('span', 'admin-entry-counter', `[ 0${index + 1} / 06 ] ${text[prefix + 'label']}`), caption);
    document.querySelector('.admin-entry-footer').append(log);
  });
  const lastSlat = node('i');
  stageStyle(lastSlat, { Start: 9650, End: 11600, Position: '45%' });
  document.querySelector('.admin-entry-slats').append(lastSlat);

  // Fit accepted custom copy to the same scene regions, including short/mobile
  // viewports. Measurement is layout-only; transforms never restart animations.
  const fitCopy = () => {
    const height = window.innerHeight;
    document.querySelectorAll('.admin-entry-welcome-type, .admin-entry-status, .admin-entry-prologue-inner').forEach(element => {
      const ratio = element.classList.contains('admin-entry-status') ? .25 : .7;
      const scale = Math.min(1, (height * ratio) / Math.max(1, element.offsetHeight));
      element.style.setProperty('--fit-scale', String(scale));
    });
  };
  fitCopy();
  window.addEventListener('resize', fitCopy);
  document.fonts?.ready.then(fitCopy);
  if (typeof ResizeObserver === 'function') {
    const resize = new ResizeObserver(fitCopy);
    document.querySelectorAll('.admin-entry-welcome-type, .admin-entry-status, .admin-entry-prologue-inner').forEach(element => resize.observe(element));
  }

  let started = false, ended = false;
  const send = type => window.parent.postMessage({ type }, '*');
  const finish = () => {
    if (ended) return;
    ended = true;
    send('entry:finish');
  };
  window.addEventListener('message', event => {
    if (event.source !== window.parent || !event.data || event.data.type !== 'entry:theme') return;
    root.classList.toggle('light', event.data.mode === 'light');
    root.classList.toggle('dark', event.data.mode !== 'light');
    const hue = Number(event.data.hue);
    root.style.setProperty('--entry-hue', String(Number.isFinite(hue) ? ((hue % 360) + 360) % 360 : 225));
    root.style.colorScheme = event.data.mode === 'light' ? 'light' : 'dark';
    if (!started && !ended) {
      started = true;
      root.classList.add('entry-running');
      skip.focus({ preventScroll: true });
      send('entry:started');
    }
  });
  skip.addEventListener('click', finish);
  document.addEventListener('keydown', event => {
    if (['Escape', 'Enter', ' '].includes(event.key)) { event.preventDefault(); finish(); }
    if (event.key === 'Tab') { event.preventDefault(); skip.focus({ preventScroll: true }); }
  });
  entry.addEventListener('animationend', event => {
    if (event.target === entry && event.animationName === 'admin-entry-exit') finish();
  });
  send('entry:ready');
})();
