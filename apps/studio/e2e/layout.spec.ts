// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The studio's layout (B7.2), in mock mode: a 1920 x 1080 stage scaled to fit the window, its proportions kept, centred,
// at five window sizes and with Drive mode off and on. Nothing scrolls, is cut off, overlaps or hides under a panel;
// each mode shows its own panels and header line; the Drive mode switch is a teal toggle on a real checkbox.
// Screenshots of both modes at 1920 x 1080 and 1366 x 768 go to test-results/b7_2/.

import { expect, test, type Page } from '@playwright/test'; // Playwright Test
import { fileURLToPath } from 'node:url'; // a path for the screenshots

const SHOTS = fileURLToPath(new URL('../../../test-results/b7_2/', import.meta.url)); // the repository's git-ignored results
const SIZES: [number, number][] = [[1920, 1080], [1920, 960], [1366, 768], [1280, 800], [2560, 1440]]; // 1080p, a browser window on a 1080p screen, two laptops, 1440p
const SHOT = ['1920x1080', '1366x768']; // the sizes saved as screenshots
const PANELS = ['.studio-head', '.caregiver', '.tv-head', '.tv-frame', '.engine', '.trace', '.credits']; // the boxes that must never overlap
const OFF_LINE = 'The SvaVāk app on the Fire TV emulator answers the questions.'; // the header line with Drive mode off
const ON_LINE = 'Answer on the virtual TV with the space bar.'; // and with it on
const LABEL = 'Web version of the TV app: the real app runs on Fire OS'; // the virtual TV's label

type Box = { x: number; y: number; w: number; h: number }; // a box in window pixels

/** The stage's scale for a window: the smaller of the two ratios, so the whole stage fits with its proportions kept. */
const fit = (w: number, h: number) => Math.min(w / 1920, h / 1080); // item 1

/** What the page draws now: the stage, the panels, the scroll extents, overlaps, text that is not visible, the bars and the conversation. */
async function measure(page: Page) { // read in the page
  await page.evaluate(() => new Promise(requestAnimationFrame)); // one frame on: a resize has been handled and laid out
  return page.evaluate((panels) => { // in the page
    const box = (el: Element): Box => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }; // a box, as plain numbers
    const boxes: Record<string, Box> = {}; // each panel on screen
    for (const selector of panels) { const el = document.querySelector(selector); if (el) boxes[selector] = box(el); } // a panel not shown has no box
    const names = Object.keys(boxes); // the panels found
    const overlaps = names.flatMap((a, i) => names.slice(i + 1).filter((b) => { const p = boxes[a]!, q = boxes[b]!; return Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x) > 0.5 && Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y) > 0.5; }).map((b) => `${a} and ${b}`)); // pairs sharing more than half a pixel both ways
    const hidden: string[] = []; // text lines that are not visible
    const walker = document.createTreeWalker(document.querySelector('.studio')!, NodeFilter.SHOW_TEXT); // every text on the stage
    for (let node = walker.nextNode(); node; node = walker.nextNode()) { // each piece of text
      if (!node.textContent!.trim()) continue; // white space draws nothing
      const parent = node.parentElement!; // the element that draws it
      const clip = parent.getBoundingClientRect(); // its box: text it cuts off (an ellipsis, a third line) is not drawn
      const range = document.createRange(); // this text
      range.selectNodeContents(node); // all of it
      for (const r of range.getClientRects()) { // each line
        if (r.width === 0 || r.height === 0) continue; // an empty fragment draws nothing
        const [left, right, top, bottom] = [Math.max(r.left, clip.left), Math.min(r.right, clip.right), Math.max(r.top, clip.top), Math.min(r.bottom, clip.bottom)]; // the part of the line its element draws
        const hit = right > left && bottom > top ? document.elementFromPoint((left + right) / 2, (top + bottom) / 2) : null; // what is on top in its middle: nothing outside the window
        if (!hit || !parent.contains(hit)) hidden.push(`${node.textContent!.trim().slice(0, 40)} (${hit ? `under ${hit.className || hit.tagName}` : 'not drawn'})`); // cut off, outside the window, or covered
      } // end of the lines
    } // end of the text
    const bars = [...document.querySelectorAll('.bar-track')].map((el) => { const r = el.getBoundingClientRect(); return { h: r.height, shown: [r.top + 1, r.bottom - 1].every((y) => el.contains(document.elementFromPoint(r.x + r.width / 2, y))) }; }); // each bar's height, and whether its top and its foot are on top
    const head = ['mode-line', 'drive-mode'].map((id) => { const el = document.querySelector(`.studio-head [data-testid="${id}"]`); return el ? box(el).x : null; }); // where the header line and the switch start, if they are in the header
    const speech = document.querySelector('.speech'); // the latest reply
    const last = document.querySelector('.transcript')!.lastElementChild; // the conversation's latest part
    const root = document.documentElement; // the page's scroller
    return { // the facts to check
      stage: box(document.querySelector('.studio')!), // the stage
      boxes, overlaps, hidden, bars, head, // the panels, the text, the bars and the header's right side
      scroll: [root.scrollWidth, root.scrollHeight, root.clientWidth, root.clientHeight], // the window's size twice over when nothing overflows and no scrollbar shows
      speechPx: speech ? parseFloat(getComputedStyle(speech).fontSize) : null, // the reply's type size on the stage
      gap: last ? document.querySelector('.ask')!.getBoundingClientRect().top - last.getBoundingClientRect().bottom : null, // from the conversation's end to the input, in window pixels
      photo: [getComputedStyle(document.body).backgroundImage, ...['#root', '.studio'].map((s) => { const c = getComputedStyle(document.querySelector(s)!); return `${c.backgroundColor} ${c.backgroundImage}`; })], // the photo, and what is painted between it and the panels
    }; // end of the facts
  }, PANELS); // end of the evaluation
} // end of measure

/** Item 1, nothing covered, and the conversation just above the input (item 4), at one window size. */
function expectStage(m: Awaited<ReturnType<typeof measure>>, w: number, h: number): void { // after measure
  const s = fit(w, h); // the scale item 1 asks for
  expect(Math.abs(m.stage.w / 1920 / s - 1)).toBeLessThan(0.01); // the stage's width follows it, within 1 %
  expect(Math.abs(m.stage.h / 1080 / s - 1)).toBeLessThan(0.01); // and its height: the proportions kept
  expect(Math.abs(m.stage.x - (w - m.stage.w) / 2)).toBeLessThanOrEqual(1); // centred across
  expect(Math.abs(m.stage.y - (h - m.stage.h) / 2)).toBeLessThanOrEqual(1); // and down
  if (w === 1920 && h === 1080) expect(m.stage).toEqual({ x: 0, y: 0, w: 1920, h: 1080 }); // at 1080p the scale is exactly 1
  expect(m.scroll).toEqual([w, h, w, h]); // no scrollbar, and nothing beyond the window
  expect(m.photo[0]).toMatch(/url\(.*leaves[^/]*\.jpg/); // the leaves behind the whole window
  expect(m.photo.slice(1)).toEqual(['rgba(0, 0, 0, 0) none', 'rgba(0, 0, 0, 0) none']); // nothing painted over them but the panels, so they fill the spare space too
  expect(m.overlaps).toEqual([]); // no panel covers another
  expect(m.hidden).toEqual([]); // every heading and line of text is visible
  expect(m.head.every((x) => x !== null && x > m.stage.x + m.stage.w / 2)).toBe(true); // the header line and the switch: in the header row, on the right
  expect(m.speechPx).toBe(32); // the latest reply at 32 px on the stage
  expect(m.gap! / s).toBeGreaterThanOrEqual(0); // the conversation ends above the input
  expect(m.gap! / s).toBeLessThanOrEqual(24); // just above it, chat style: no big gap
} // end of expectStage

/** One caregiver turn that needs no TV, so the bubble, a chip and the reply are on screen. */
async function remember(page: Page): Promise<void> { // "Noted: ..."
  await page.getByTestId('caregiver-input').fill('Remember that Sam loves gardening'); // the caregiver's words
  await page.getByTestId('caregiver-send').click(); // to the agent
  await expect(page.getByTestId('speech')).toHaveText('Noted: Sam loves gardening.'); // the reply
} // end of remember

for (const [w, h] of SIZES) test(`Drive mode off at ${w} x ${h}: the caregiver panel alone, centred on the scaled stage`, async ({ page }) => { // items 1, 2, 4 and 6
  await page.emulateMedia({ reducedMotion: 'reduce' }); // measured at rest, not while the panels rise in
  await page.setViewportSize({ width: w, height: h }); // the window
  await page.goto('/'); // the studio: Drive mode is off by default
  await remember(page); // a turn on screen
  const m = await measure(page); // what is drawn
  expectStage(m, w, h); // item 1, nothing covered, the reply just above the input
  await expect(page.getByTestId('tv')).toHaveCount(0); // no virtual TV
  await expect(page.getByTestId('engine')).toHaveCount(0); // and no engine panel
  const panel = m.boxes['.caregiver']!; // the caregiver panel
  expect(Math.abs(panel.x + panel.w / 2 - (m.stage.x + m.stage.w / 2))).toBeLessThanOrEqual(1); // centred on the stage
  expect(Math.abs(panel.w / fit(w, h) - 1100)).toBeLessThan(1); // in the main area, 1100 px wide on the stage
  await expect(page.getByTestId('mode-line')).toHaveText(OFF_LINE); // what answers the questions
  if (SHOT.includes(`${w}x${h}`)) await page.screenshot({ path: `${SHOTS}studio-off-${w}x${h}.png` }); // for the report
}); // end of the tests

test('Drive mode on: two columns, the virtual TV above the engine, every bar in full, at every window size', async ({ page }) => { // items 1, 3, 4 and 6
  await page.emulateMedia({ reducedMotion: 'reduce' }); // measured at rest
  await page.goto('/'); // the studio at 1920 x 1080
  await page.getByTestId('drive-mode').check(); // drive mode on: the virtual TV connects as the household's TV
  const tv = page.getByTestId('tv'); // the virtual TV
  await expect(tv).toHaveAttribute('data-online', 'true'); // its stream is open
  await page.getByTestId('caregiver-input').fill('Ask Sam if he wants tea or coffee'); // the caregiver's words
  await page.getByTestId('caregiver-send').click(); // to the agent
  const tea = page.locator('[data-testid="tv-card"][data-label="Tea"]'); // the Tea card
  await expect(tea).toBeVisible(); // the question reached the virtual TV
  for (let press = 0; press < 4 && (await tv.getAttribute('data-mode')) !== 'saying'; press++) { // as in loop.spec.ts: a rescan may ask for a second press
    await expect(tea).toHaveAttribute('data-lit', 'true', { timeout: 10_000 }); // Tea lights up
    await page.waitForTimeout(700); // well inside Tea's window, past the reaction delay the engine expects
    await page.keyboard.down('Space'); // the switch goes down
    await page.waitForTimeout(80); // a short press
    await page.keyboard.up('Space'); // and up
    await page.waitForTimeout(400); // the engine commits, or rescans the top two
  } // end of the presses
  await expect(page.getByTestId('speech')).toHaveText('Sam says: Tea.', { timeout: 30_000 }); // one question answered with the space bar
  await expect(tv).toHaveAttribute('data-mode', 'idle'); // the TV waits again; the bars stay
  for (const [w, h] of SIZES) await test.step(`${w} x ${h}`, async () => { // the same page, resized
    await page.setViewportSize({ width: w, height: h }); // the window
    const m = await measure(page); // what is drawn
    expectStage(m, w, h); // item 1, nothing covered, the reply just above the input
    const { '.caregiver': panel, '.tv-head': head, '.tv-frame': frame, '.engine': engine } = m.boxes; // the two columns
    expect(panel!.x + panel!.w).toBeLessThanOrEqual(frame!.x); // the caregiver panel on the left, the virtual TV on the right
    expect(head!.y + head!.h).toBeLessThanOrEqual(frame!.y); // the TV's title and label above its screen
    expect(frame!.y + frame!.h).toBeLessThanOrEqual(engine!.y); // the engine view under the screen
    expect(m.bars.length).toBeGreaterThan(2); // a bar per reply, and the two controls
    expect(m.bars.filter((b) => !b.shown || b.h / fit(w, h) < 39.5)).toEqual([]); // every bar in full: at least its 40 px, top to foot on top
    await expect(page.getByTestId('mode-line')).toHaveText(ON_LINE); // how to answer
    await expect(page.locator('.mirror')).toHaveText(LABEL); // what the virtual TV is
    if (SHOT.includes(`${w}x${h}`)) await page.screenshot({ path: `${SHOTS}studio-on-${w}x${h}.png` }); // for the report
  }); // end of the step
}); // end of the test

test('rescales at once when the window is resized, without a reload', async ({ page }) => { // item 1
  await page.emulateMedia({ reducedMotion: 'reduce' }); // measured at rest
  await page.goto('/'); // the studio at 1920 x 1080
  await remember(page); // a turn on screen
  await page.evaluate(() => { (window as unknown as { kept: boolean }).kept = true; }); // a mark a reload would wipe
  for (const [w, h] of [[1920, 1080], [1366, 768], [1920, 1080]] as const) { // down to a laptop and back
    await page.setViewportSize({ width: w, height: h }); // resize the window
    expectStage(await measure(page), w, h); // the next frame has the new scale
  } // end of the sizes
  expect(await page.evaluate(() => (window as unknown as { kept?: boolean }).kept)).toBe(true); // the same page throughout
}); // end of the test

test('draws the Drive mode switch as a teal toggle on a real checkbox, which the keyboard and screen readers use', async ({ page }) => { // item 5
  await page.emulateMedia({ reducedMotion: 'reduce' }); // colours read at rest, not mid-transition
  await page.goto('/'); // the studio
  const toggle = page.getByRole('switch', { name: 'Drive mode' }); // as a screen reader finds it
  await expect(toggle).toHaveAttribute('type', 'checkbox'); // a real checkbox
  const look = () => toggle.evaluate((el) => { const s = getComputedStyle(el); return { appearance: s.appearance, background: s.backgroundColor, outline: s.outlineStyle }; }); // how it is drawn
  expect((await look()).appearance).toBe('none'); // not the browser's white box
  await page.keyboard.press('Tab'); // the first stop on the page
  await expect(toggle).toBeFocused(); // reached with the keyboard
  expect((await look()).outline).not.toBe('none'); // with a visible focus ring
  await page.keyboard.press('Space'); // switched on with it
  await expect(toggle).toBeChecked(); // on
  await expect(page.getByTestId('tv')).toBeVisible(); // the virtual TV with it
  expect((await look()).background).toBe('rgb(79, 209, 197)'); // filled with the studio's teal, #4FD1C5
}); // end of the test
