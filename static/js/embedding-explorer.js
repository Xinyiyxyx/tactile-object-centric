(() => {
  'use strict';
  const data = JSON.parse(document.getElementById('embedding-data').textContent);
  const svg = document.getElementById('embedding-plot');
  const controls = document.querySelector('.embedding-controls');
  const legend = document.getElementById('embedding-legend');
  const inspector = document.getElementById('embedding-inspector');
  const ns = 'http://www.w3.org/2000/svg';
  let axis = data.axes[0];
  let highlighted = null;
  let pinned = null;
  const points = [];
  const anchors = [];
  function element(tag, attrs, parent) {
    const node = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    parent.append(node);
    return node;
  }
  // Compute once across all samples AND anchors. Switching properties never rescales the plot.
  const all = [...data.samples, ...data.text_anchors];
  const minX = Math.min(...all.map(p => p.x)), maxX = Math.max(...all.map(p => p.x));
  const minY = Math.min(...all.map(p => p.y)), maxY = Math.max(...all.map(p => p.y));
  const x = value => 52 + (value - minX) / (maxX - minX || 1) * 616;
  const y = value => 424 - (value - minY) / (maxY - minY || 1) * 384;
  element('rect', { x: 24, y: 14, width: 672, height: 435, rx: 8, fill: '#fff', stroke: '#e5e3f1' }, svg);
  const sampleLayer = element('g', {}, svg);
  const anchorLayer = element('g', {}, svg);
  function color(label) { return axis.colors[axis.class_names.indexOf(label)]; }
  function displayName(sample) { return sample.object_name.replaceAll('_', ' '); }
  function describe(target) {
    inspector.replaceChildren();
    const title = document.createElement('strong');
    const text = document.createElement('p');
    const extra = document.createElement('p');
    if (!target) {
      title.textContent = 'One representation, four property views';
      text.textContent = 'Inspect a circle to see its physical properties, or a diamond to see the language descriptions used for alignment.';
    } else if (target.kind === 'sample') {
      const sample = target.value;
      title.textContent = displayName(sample) + ' · ' + sample.id.replace('sample-', 'Sample ');
      text.textContent = data.axes.map(a => a.display_name + ' · ' + sample.labels[a.name]).join(' · ');
      extra.textContent = axis.display_name + ' prediction: ' + sample.preds[axis.name] + ' · ' + (sample.correct[axis.name] ? 'Correct' : 'Incorrect; ground truth: ' + sample.labels[axis.name]);
    } else {
      const anchor = target.value;
      title.textContent = 'Language anchor · ' + anchor.class;
      text.textContent = 'Descriptions: ' + axis.prompts[anchor.class].map(p => '“' + p + '”').join(', ');
      extra.textContent = 'The text embedding is projected with the fitted tactile UMAP transform.';
    }
    inspector.append(title, text);
    if (extra.textContent) inspector.append(extra);
  }
  function refreshSelection() {
    points.forEach(p => p.node.dataset.selected = String(pinned?.kind === 'sample' && pinned.value === p.sample));
  }
  function bindInspection(node, target) {
    node.addEventListener('pointerenter', () => describe(target));
    node.addEventListener('pointerleave', () => describe(pinned));
    node.addEventListener('focus', () => describe(target));
    node.addEventListener('blur', () => describe(pinned));
    node.addEventListener('click', () => {
      pinned = pinned?.value === target.value ? null : target;
      refreshSelection(); describe(pinned);
    });
    node.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); node.dispatchEvent(new MouseEvent('click')); }
    });
  }
  data.samples.forEach((sample, index) => {
    const node = element('g', { class: 'embedding-point', transform: `translate(${x(sample.x)} ${y(sample.y)})`, tabindex: index === 0 ? 0 : -1, role: 'button' }, sampleLayer);
    element('circle', { r: 11, fill: 'transparent' }, node);
    element('circle', { class: 'point-ring', r: 9, fill: 'none', stroke: '#29263f', 'stroke-width': 1.6 }, node);
    const dot = element('circle', { r: 5.6, stroke: '#fff', 'stroke-width': .8 }, node);
    const error = element('path', { d: 'M-3,-3 L3,3 M-3,3 L3,-3', stroke: '#232231', 'stroke-width': 1.5, fill: 'none', 'pointer-events': 'none' }, node);
    points.push({ node, dot, error, sample });
    bindInspection(node, { kind: 'sample', value: sample });
    node.addEventListener('keydown', event => {
      const direction = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!direction && event.key !== 'Home' && event.key !== 'End') return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : (index + direction + points.length) % points.length;
      points.forEach((p, i) => p.node.setAttribute('tabindex', i === next ? '0' : '-1'));
      points[next].node.focus();
    });
  });
  data.text_anchors.forEach(anchor => {
    const node = element('g', { class: 'embedding-anchor', transform: `translate(${x(anchor.x)} ${y(anchor.y)})`, tabindex: 0, role: 'button' }, anchorLayer);
    element('path', { class: 'anchor-shape', d: 'M0,-10 L10,0 L0,10 L-10,0 Z', stroke: '#29263f', 'stroke-width': 1.6 }, node);
    const right = x(anchor.x) > 535;
    const below = y(anchor.y) < 65;
    const label = element('text', { x: right ? -15 : 15, y: below ? 20 : -13, 'text-anchor': right ? 'end' : 'start', 'pointer-events': 'none' }, node);
    label.textContent = anchor.class;
    anchors.push({ node, anchor });
    bindInspection(node, { kind: 'anchor', value: anchor });
  });
  function recolor() {
    points.forEach(({ node, dot, error, sample }) => {
      dot.setAttribute('fill', color(sample.labels[axis.name]));
      node.style.opacity = highlighted && sample.labels[axis.name] !== highlighted ? '.15' : '.85';
      error.style.display = sample.correct[axis.name] ? 'none' : '';
      node.setAttribute('aria-label', `${displayName(sample)}, ${axis.display_name}: ${sample.labels[axis.name]}; predicted ${sample.preds[axis.name]}. Press Enter to keep details.`);
    });
    anchors.forEach(({ node, anchor }) => {
      const active = anchor.axis === axis.name;
      node.style.display = active ? '' : 'none';
      if (active) {
        node.querySelector('.anchor-shape').setAttribute('fill', color(anchor.class));
        node.style.opacity = highlighted && anchor.class !== highlighted ? '.15' : '1';
        node.setAttribute('aria-label', `Language anchor: ${anchor.class}. Descriptions: ${axis.prompts[anchor.class].join(', ')}.`);
      }
    });
    legend.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.label === highlighted)));
  }
  function updateAxis(index) {
    axis = data.axes[index]; highlighted = null;
    if (pinned?.kind === 'anchor') pinned = null;
    controls.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.property) === index)));
    legend.replaceChildren();
    axis.class_names.forEach(label => {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.label = label;
      button.setAttribute('aria-pressed', 'false');
      const swatch = document.createElement('span'); swatch.className = 'embedding-swatch'; swatch.style.background = color(label); swatch.setAttribute('aria-hidden', 'true');
      const count = data.samples.filter(s => s.labels[axis.name] === label).length;
      button.append(swatch, document.createTextNode(label + ' (' + count + ')'));
      button.addEventListener('click', () => { highlighted = highlighted === label ? null : label; recolor(); });
      legend.append(button);
    });
    document.getElementById('embedding-caption').textContent = `${axis.display_name} · ${data.samples.length} tactile samples · Point positions remain fixed.`;
    recolor(); refreshSelection(); describe(pinned);
  }
  controls.querySelectorAll('button').forEach(button => button.addEventListener('click', () => updateAxis(Number(button.dataset.property))));
  document.querySelector('.embedding-explorer').addEventListener('keydown', event => {
    if (event.key === 'Escape') { pinned = null; highlighted = null; recolor(); refreshSelection(); describe(null); }
  });
  updateAxis(0);
  controls.hidden = false;
  document.getElementById('embedding-interactive').hidden = false;
  document.getElementById('embedding-fallback').hidden = true;
})();
