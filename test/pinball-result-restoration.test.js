'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseHTML } = require('linkedom');

test('shipped result styles hide an empty restored game, but retain a real finish frame and the next draw', () => {
  const folder = path.join(__dirname, '../public/roulette');
  const css = fs.readdirSync(folder).find(name => /^roulette-app\..+\.css$/.test(name));
  const { document } = parseHTML(fs.readFileSync(path.join(folder, 'index.html'), 'utf8'));
  const stylesheet = document.createElement('style');
  stylesheet.textContent = fs.readFileSync(path.join(folder, css), 'utf8');
  document.head.appendChild(stylesheet);
  document.documentElement.dataset.rouletteTheme = 'national';
  const host = document.querySelector('.canvas-host');
  const award = document.querySelector('[data-national-award]');
  const frame = document.querySelector('[data-national-finish-frame]');
  const visibility = () => [...stylesheet.sheet.cssRules].reduce((value, rule) =>
    rule.selectorText && rule.style?.visibility && host.matches(rule.selectorText) ? rule.style.visibility : value, 'visible');
  assert.equal(visibility(), 'visible', 'prepared game is visible');
  award.hidden = false;
  frame.hidden = true;
  assert.equal(visibility(), 'hidden', 'restored winners cannot sit over a false zero-finish list');
  frame.hidden = false;
  assert.equal(visibility(), 'visible', 'live completion keeps its game scene');
  award.hidden = true;
  frame.hidden = true;
  assert.equal(visibility(), 'visible', 'the next preparation restores the game');
  document.documentElement.dataset.rouletteTheme = 'academy';
  award.hidden = false;
  assert.equal(visibility(), 'visible', 'other skins are unaffected');
});
