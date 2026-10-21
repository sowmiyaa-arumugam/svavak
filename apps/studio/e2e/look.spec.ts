// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// The studio's look (B6), in mock mode: the darkened photo of leaves and Montserrat, both served from localhost, the
// credits line and the labels that must stay, WCAG AA contrast for the main text over what is really drawn behind it,
// and no motion under prefers-reduced-motion.

import { expect, test, type Page } from '@playwright/test'; // Playwright Test
import { sendHelp } from './sendHelp'; // a help request, as the TV sends it

const CREDITS = 'Design inspired by Hamish Williams · Background photo: Aaron Vasquez / Unsplash'; // the footer line
const LOCAL = ['localhost:5173', '127.0.0.1:8787', '127.0.0.1:8790']; // the studio, the server and the agent: no other host, so no font or image CDN
const TEXT = ['h2', '.mirror', '.mode-line', '.drive', '.banner', '.bubble', '.chip', '.speech', '.engine .muted', '.badge', '.hop-label', '.hop-op', '.hop-ms', '.credits', '.alert']; // the main text, on the photo and on the panels, a help alert's too

/** One caregiver turn in mock mode, so the bubble, the chips and the speech are on screen too. */
async function remember(page: Page): Promise<void> { // "Noted: ..."
  await page.getByTestId('caregiver-input').fill('Remember that Sam loves gardening'); // the caregiver's words
  await page.getByTestId('caregiver-send').click(); // to the agent
  await expect(page.getByTestId('speech')).toHaveText('Noted: Sam loves gardening.'); // the turn is over
} // end of remember

test('draws the darkened photo of leaves in Montserrat, all from localhost, with the credits and the labels that stay', async ({ page }) => { // the look and its sources
  const hosts = new Set<string>(); // every host the page asks for anything
  page.on('request', (request) => hosts.add(new URL(request.url()).host)); // from the first request on
  await page.goto('/'); // the studio
  await remember(page); // a turn: the agent's and the server's hosts too
  await expect(page.getByTestId('credits')).toHaveText(CREDITS); // the credits line
  await expect(page.getByTestId('sim-banner')).toHaveText('Simulated Alexa+ experience'); // kept
  await page.getByTestId('drive-mode').check(); // the virtual TV and its label are shown only in drive mode
  await expect(page.locator('.mirror')).toHaveText('Web version of the TV app: the real app runs on Fire OS'); // kept, renamed in B7.2
  await expect(page.getByTestId('mode-badge')).toHaveText('MOCK'); // kept
  const look = await page.evaluate(async () => { // what the page drew with
    await document.fonts.ready; // every font face in use has loaded or failed
    const photo = performance.getEntriesByType('resource').find((e) => /leaves[^/]*\.jpg/.test(e.name)) as PerformanceResourceTiming | undefined; // the photo's request
    return { // the facts to check
      background: getComputedStyle(document.body).backgroundImage, // the overlay and the photo
      font: getComputedStyle(document.querySelector('h1')!).fontFamily, // the page's type
      loaded: [...document.fonts].filter((f) => f.family.replace(/"/g, '') === 'Montserrat' && f.status === 'loaded').length, // Montserrat faces in use
      photo: photo ? { status: photo.responseStatus, bytes: photo.decodedBodySize } : null, // the photo arrived
    }; // end of the facts
  }); // end of the evaluation
  expect(look.background).toMatch(/gradient.*url\(.*leaves[^/]*\.jpg/); // darkened, over the photo
  expect(look.font).toMatch(/^Montserrat/); // the page's type
  expect(look.loaded).toBeGreaterThan(0); // and its files loaded
  expect(look.photo).toMatchObject({ status: 200 }); // the photo loaded
  expect(look.photo!.bytes).toBeLessThan(400_000); // under 400 KB
  expect([...hosts].filter((h) => !LOCAL.includes(h))).toEqual([]); // nothing from another host
}); // end of the test

test('shows the SvaVāk wordmark, uncut, as the title, where the text title was, its capitals as tall as before', async ({ page }) => { // the wordmark alone: the logo's tagline was too small to read
  await page.emulateMedia({ reducedMotion: 'reduce' }); // measured at rest, not while the head rises in
  await page.goto('/'); // the studio
  const logo = page.locator('.studio-head h1 img'); // the title
  await expect(logo).toHaveAttribute('alt', 'SvaVāk'); // the name, for screen readers
  const drawn = await logo.evaluate(async (img: HTMLImageElement) => { await img.decode(); const box = img.getBoundingClientRect(); return { src: img.currentSrc, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, left: box.left, top: box.top, width: box.width, height: box.height }; }); // what was drawn, and where
  expect(drawn.src).toMatch(/\/assets\/brand\/SvaVak_logo_wordmark\.svg$/); // the wordmark as saved: its own viewBox crops it, no fragment does
  expect(drawn.naturalHeight).toBeGreaterThan(0); // and loaded
  expect([drawn.left, drawn.top]).toEqual([32, 20]); // top left, where the text title began
  expect(drawn.height / drawn.naturalHeight).toBeCloseTo(54 / 806, 3); // at the scale of the whole logo before (54 px for 806 units), so the capitals keep their height
  expect(drawn.width / drawn.height).toBeCloseTo(drawn.naturalWidth / drawn.naturalHeight, 2); // its whole drawing, not stretched
  const inside = await page.evaluate(async (src) => { const svg = new DOMParser().parseFromString(await (await fetch(src)).text(), 'image/svg+xml').documentElement as unknown as SVGSVGElement; document.body.append(svg); const v = svg.viewBox.baseVal; const fits = [...svg.querySelectorAll('path')].every((p) => { const b = p.getBBox(); return b.x >= v.x && b.y >= v.y && b.x + b.width <= v.x + v.width && b.y + b.height <= v.y + v.height; }); svg.remove(); return fits; }, drawn.src); // the file's outlines, measured against its own viewBox
  expect(inside).toBe(true); // and not cut: every outline lies inside the viewBox
  await expect(page.locator('.studio-head h1')).toHaveText(''); // no text title left beside it (the header's right side holds the mode line and the drive switch)
}); // end of the test

for (const drive of [false, true]) test(`gives every main text WCAG AA contrast over what is drawn behind it, with Drive mode ${drive ? 'on' : 'off'}`, async ({ page }) => { // measured, not assumed, in both layouts
  await page.emulateMedia({ reducedMotion: 'reduce' }); // nothing mid-animation while measuring
  await page.goto('/'); // the studio
  if (drive) await page.getByTestId('drive-mode').check(); // the virtual TV's head and label, and the engine panel
  await remember(page); // the bubble, the chips and the speech
  expect(await sendHelp(page, `contrast-${drive}`)).toBe(201); // and a help alert, after them
  await expect(page.getByTestId('help-alert')).toBeVisible(); // shown
  await page.evaluate(() => document.fonts.ready); // the final type
  const lines = await page.evaluate((selectors) => selectors.flatMap((selector) => [...document.querySelectorAll(selector)].flatMap((el) => { // each text's line boxes
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); // its text only: not a checkbox inside a label
    const boxes = []; // its lines
    for (let node = walker.nextNode(); node; node = walker.nextNode()) { // each piece of text
      if (!node.textContent!.trim()) continue; // white space draws nothing
      const range = document.createRange(); // this text
      range.selectNodeContents(node); // all of it
      const style = getComputedStyle(node.parentElement!); // the colour and size it is drawn in (a span inside a text may differ)
      const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700); // WCAG large text: 18 pt, or 14 pt bold
      for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) boxes.push({ selector, text: node.textContent!.trim().slice(0, 40), color: style.color, large, box: [r.x, r.y, r.width, r.height] }); // one entry per line
    } // end of the text
    return boxes; // this element's lines
  })), TEXT); // end of the line boxes
  await page.addStyleTag({ content: '* { color: transparent !important; text-shadow: none !important; }' }); // the text gone, what is behind it left
  const shot = (await page.screenshot()).toString('base64'); // the page as drawn, at 1920 x 1080
  const results = await page.evaluate(async ({ shot, lines }) => { // each line's worst contrast against the pixels behind it
    const luminance = (r: number, g: number, b: number) => [r, g, b].map((v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i]!, 0); // WCAG 2.x relative luminance
    const image = new Image(); // the screenshot
    image.src = `data:image/png;base64,${shot}`; // decoded here, in the browser
    await image.decode(); // ready to draw
    const canvas = document.createElement('canvas'); // to read its pixels
    canvas.width = image.width; // full size
    canvas.height = image.height; // full size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!; // read-back
    ctx.drawImage(image, 0, 0); // the screenshot
    return lines.map((line) => { // one line of text
      const [x, y, w, h] = line.box.map(Math.round) as [number, number, number, number]; // its box in pixels
      const data = ctx.getImageData(x, y, Math.max(1, w), Math.max(1, h)).data; // the background behind it
      const text = luminance(...(line.color.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number) as [number, number, number])); // the text colour
      let worst = Infinity; // the lowest contrast of any pixel behind the text
      for (let i = 0; i < data.length; i += 4) { // every pixel
        const bg = luminance(data[i]!, data[i + 1]!, data[i + 2]!); // its luminance
        worst = Math.min(worst, (Math.max(text, bg) + 0.05) / (Math.min(text, bg) + 0.05)); // the WCAG ratio
      } // end of the pixels
      return { selector: line.selector, text: line.text, ratio: Math.round(worst * 100) / 100, needs: line.large ? 3 : 4.5 }; // AA: 4.5, or 3 for large text
    }); // end of the lines
  }, { shot, lines }); // end of the measurement
  console.log(results.map((r) => `${r.ratio.toFixed(2)} (needs ${r.needs})  ${r.selector}  "${r.text}"`).join('\n')); // the table, for the report
  expect(results.length).toBeGreaterThan(TEXT.length); // every selector found, most with several lines
  expect(results.filter((r) => r.ratio < r.needs)).toEqual([]); // none below AA
}); // end of the tests

test('moves only without prefers-reduced-motion', async ({ page }) => { // subtle motion, and none on request
  const moving = () => page.evaluate(() => [...document.querySelectorAll('*')].filter((el) => { const s = getComputedStyle(el); return s.animationName !== 'none' || s.transitionDuration.split(',').some((d) => parseFloat(d) > 0); }).length); // elements with an animation or a transition
  await page.goto('/'); // the studio, motion allowed
  expect(await moving()).toBeGreaterThan(0); // the panels rise into place
  await page.emulateMedia({ reducedMotion: 'reduce' }); // the viewer asks for less motion
  await remember(page); // new parts of the turn appear too
  expect(await moving()).toBe(0); // nothing animates or transitions
}); // end of the test
