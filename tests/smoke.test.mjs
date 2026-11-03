import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
const icon = readFileSync(new URL("../icon.svg", import.meta.url), "utf8");

test("all inline JavaScript parses", () => {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]).filter(source => source.trim());
  assert.ok(scripts.length >= 3, "expected the game scripts to be present");
  scripts.forEach((source, index) => assert.doesNotThrow(() => new Function(source), "inline script " + (index + 1) + " must parse"));
});

test("HTML IDs are unique", () => {
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, "duplicate HTML id found");
});

test("24 named worlds cover exactly 1,200 consecutive levels", () => {
  const block = html.match(/const worldSeeds=\[([\s\S]*?)\n    \];/);
  assert.ok(block, "world seed definition missing");
  const names = [...block[1].matchAll(/\{name:"([^"]+)",ar:"([^"]+)"/g)];
  assert.equal(names.length, 24);
  assert.equal(new Set(names.map(item => item[1])).size, 24);
  assert.equal(new Set(names.map(item => item[2])).size, 24);
  assert.match(html, /return \{\.\.\.seed,start,end:start\+49\}/);
  assert.match(html, /const MAX_LEVEL = 1200/);
  assert.match(html, /Math\.max\(1, Math\.min\(MAX_LEVEL, storedLevel\)\)/);
  assert.match(html, /Math\.min\(950, 220 \+ Math\.floor\(\(level - 1\) \/ 10\) \* 35\)/);
});

test("each 50-stage world changes its six-fruit set every ten stages", () => {
  const setsSource = html.match(/const FRUIT_SETS = (\[[\s\S]*?\n      \]);/);
  const selectorSource = html.match(/function fruitSetForLevel\(\) \{[\s\S]*?\n      \}/);
  assert.ok(setsSource, "fruit set definitions missing");
  assert.ok(selectorSource, "fruit set selector missing");
  const sets = new Function("return " + setsSource[1])();
  const select = new Function("level", "FRUIT_SETS", "return (" + selectorSource[0] + ")()");
  assert.equal(sets.length, 5);
  for (const set of sets) {
    assert.equal(set.fruits.length, 6);
    assert.equal(new Set(set.fruits).size, 6);
  }
  for (let world = 0; world < 24; world++) {
    const selected = [];
    for (let region = 0; region < 5; region++) {
      const start = world * 50 + region * 10 + 1;
      const set = select(start, sets);
      selected.push(set);
      for (let offset = 0; offset < 10; offset++) assert.equal(select(start + offset, sets), set);
      if (region > 0) assert.notEqual(set, selected[region - 1]);
    }
    assert.equal(select(world * 50 + 1, sets), sets[world % 5]);
  }
});

test("all 1,200 level objectives have valid targets and a balanced distribution", () => {
  const objectiveSource = html.match(/function objectiveForLevel\(\) \{[\s\S]*?\n      \}/);
  const selectorSource = html.match(/function fruitSetForLevel\(\) \{[\s\S]*?\n      \}/);
  assert.ok(objectiveSource, "objective function missing");
  assert.ok(selectorSource, "fruit set selector missing");
  const setsSource = html.match(/const FRUIT_SETS = (\[[\s\S]*?\n      \]);/);
  const sets = new Function("return " + setsSource[1])();
  const select = new Function("level", "FRUIT_SETS", "return (" + selectorSource[0] + ")()");
  const goalExpression = html.match(/const goal = \(\) => ([^;]+);/);
  assert.ok(goalExpression, "score goal formula missing");
  const goalForLevel = new Function("level", "return " + goalExpression[1]);
  const objectiveForLevel = new Function("level", "fruitsForLevel", "goal", "localStorage", "return (" + objectiveSource[0] + ")()");
  const counts = { score: 0, collect: 0, special: 0, ice: 0, crate: 0 };
  const maxima = { score: 0, collect: 0, special: 0, ice: 0, crate: 0 };
  for (let level = 1; level <= 1200; level++) {
    const fruitsForLevel = () => select(level, sets).fruits;
    const objective = objectiveForLevel(level, fruitsForLevel, () => goalForLevel(level), { getItem: () => "en" });
    assert.ok(Object.hasOwn(counts, objective.type), "unknown objective type at level " + level);
    assert.ok(Number.isInteger(objective.target) && objective.target > 0, "invalid target at level " + level);
    if (objective.type === "collect") assert.ok(fruitsForLevel().includes(objective.fruit), "collect target must exist in current fruit set at level " + level);
    counts[objective.type]++;
    maxima[objective.type] = Math.max(maxima[objective.type], objective.target);
  }
  for (const type of Object.keys(counts)) assert.equal(counts[type], 240, type + " objective count");
  assert.deepEqual(maxima, { score: 950, collect: 22, special: 3, ice: 12, crate: 9 });
});

test("level 1200 ends the adventure without incrementing to 1201", () => {
  assert.match(html, /level = Math\.min\(MAX_LEVEL, completedLevel \+ 1\)/);
  assert.match(html, /completedLevel === MAX_LEVEL \? "final" : "victory"/);
  assert.match(html, /ALL WORLDS COMPLETE|أكملت جميع العوالم/);
  assert.doesNotMatch(html, /\blevel\+\+/);
});

test("replaying an unlocked stage preserves the highest unlocked progress", () => {
  assert.match(html, /window\.__fruitPopSelectLevel = selectedLevel/);
  assert.match(html, /fruit-pop-unlocked-level/);
  assert.match(html, /level:Math\.max\(1,Math\.min\(1200,Number\(localStorage\.getItem\("fruit-pop-unlocked-level"/);
  assert.match(html, /window\.__fruitPopSelectLevel && window\.__fruitPopSelectLevel\(i\)/);
});

test("guest progress includes coins and account progress is restored", () => {
  assert.match(html, /const progressKeys = \["level", "unlocked-level", "stars", "total-score", "coins"\]/);
  assert.match(html, /localStorage\.setItem\("fruit-pop-coins", String\(saved\.coins \|\| 0\)\)/);
});

test("all worlds and game screens use the unified Fruit Pop Adam candy theme", () => {
  assert.ok(html.includes("v75 — carry the Fruit Pop Adam fruit-logo candy identity through EVERY world"));
  for (const selector of [".map-landscape.theme-forest", ".map-landscape.theme-ice", ".map-landscape.theme-island", ".map-landscape.theme-volcano", ".map-landscape.theme-crystal", ".map-landscape.theme-sky", ".map-landscape.theme-mythic", ".map-node.completed", ".map-node.current", ".map-node.locked", ".daily-reward-card", ".level-celebration-card"]) {
    assert.ok(html.includes(selector), "missing unified style for " + selector);
  }
});

test("Fruit Pop Adam branding and fruit-logo asset are wired into the app", () => {
  assert.ok(html.includes("<title>Fruit Pop Adam</title>"));
  assert.match(html, /FRUIT POP ADAM/);
  assert.equal(manifest.name, "Fruit Pop Adam");
  assert.equal(manifest.short_name, "Fruit Pop Adam");
  assert.match(icon, /Fruit Pop Adam/);
  assert.match(icon, /id="berry"/);
});

test("install metadata and offline cache include the app icon", () => {
  assert.ok(manifest.icons.some(item => item.src === "./icon.svg" && item.type === "image/svg+xml"));
  assert.match(icon, /<svg[\s>]/);
  assert.match(sw, /const CACHE_NAME = "fruit-pop-v\d+"/);
  assert.match(sw, /"\.\/icon\.svg"/);
  assert.match(sw, /pathname\.startsWith\("\/api\/"\)/);
});

test("fruit swaps, match bursts, and gravity falls use full animations and varied audio", () => {
  assert.match(html, /function animateSwap/);
  assert.match(html, /async function choose/);
  assert.match(html, /fpaFruitBurst/);
  assert.match(html, /fpaFruitSparks/);
  assert.match(html, /fpaFruitDrop/);
  assert.match(html, /Four distinct candy-like match voices/);
  assert.match(html, /falling.push\(\[write, c, write - r\]\)/);
  assert.match(html, /await waitForFruitMotion\("\.tile\.fruit-fall \.fruit-face"/);
});

test("opening theme music is original, gesture-gated, controllable, and stops during gameplay", () => {
  assert.match(html, /const INTRO_THEME = \[/);
  assert.match(html, /function startIntroMusic\(\)/);
  assert.match(html, /function stopIntroMusic\(\)/);
  assert.match(html, /localStorage\.getItem\("fruit-pop-music"\) !== "off"/);
  assert.match(html, /window\.__fruitPopMusicEnabled = musicEnabled/);
  assert.match(html, /textContent=window\.__fruitPopMusicEnabled\?t\.musicOn:t\.musicOff/);
  assert.match(html, /id="menuMusicToggle"/);
  assert.match(html, /document\.addEventListener\("pointerdown"/);
  assert.match(html, /stopIntroMusic\(\);\s*intro\.classList\.add\("hide"\)/);
  assert.match(html, /if \(introMusicGestureSeen && musicEnabled\) startIntroMusic\(\)/);
  assert.match(html, /musicOn:"🎵 Music: ON"/);
  assert.match(html, /musicOn:"🎵 الموسيقى: تعمل"/);
});

test("Arabic and English objective and world descriptions are available", () => {
  assert.match(html, /"اجمع "/);
  assert.match(html, /" نقطة"/);
  assert.match(html, /descAr:/);
  assert.match(html, /mapWorldDesc/);
});

test("Play Now has an independent mobile-safe launch fallback", () => {
  assert.match(html, /Independent mobile-safe launch fallback/);
  assert.match(html, /button\.addEventListener\("pointerup", launchGame, true\)/);
  assert.match(html, /button\.addEventListener\("touchend", launchGame/);
  assert.match(html, /intro\.classList\.add\("hide"\)/);
  assert.match(html, /game\.scrollIntoView\(\{ block: "start", behavior: "instant" \}\)/);
  assert.match(html, /window\.__fruitPopGameStarted = true/);
});


test("world map and main menu have independent mobile-safe navigation fallbacks", () => {
  assert.match(html, /window\.__fruitPopOpenWorldMap = \(\) => \{ drawLevels\(\); show\(levelsModal\); \}/);
  assert.match(html, /window\.__fruitPopReturnToMenu = returnToMainMenu/);
  assert.match(html, /Independent touch-safe navigation fallback/);
  assert.match(html, /#introLevelsBtn, #levelsBtn, #returnMenuBtn, #closeLevels/);
  assert.match(html, /event\.stopImmediatePropagation\(\)/);
  assert.match(html, /map\.classList\.add\("open"\)/);
  assert.match(html, /intro\.classList\.remove\("hide"\)/);
});
