// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Question announcements (B9), in mock mode: when a question reaches the virtual TV, it plays the question's spoken
// announcement (the mock's tone), fetched with the device token, and its highlight starts only once that has ended.
// When the announcement can't be fetched the scan starts at once, and a press during it stops it and starts the scan.

import { expect, test, type Locator, type Page } from '@playwright/test'; // Playwright Test

/** What the page records: each audio element's playing, pause, ended and error events, and when an option first lit up. */
interface Record { audio: { event: string; at: number }[]; lit: number | null } // times from performance.now()

/** Records audio events and the virtual TV's first highlight from the page's first script on. */
async function recordPage(page: Page): Promise<void> { // before the studio's own scripts
  await page.addInitScript(() => { // runs in the page
    const w = window as unknown as { __record: Record }; // the record
    w.__record = { audio: [], lit: null }; // nothing yet
    const play = HTMLMediaElement.prototype.play; // the browser's own
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) { // every play, of any audio element
      for (const event of ['playing', 'pause', 'ended', 'error']) this.addEventListener(event, () => w.__record.audio.push({ event, at: performance.now() }), { once: true }); // its real events, with their times
      return play.call(this); // played for real
    }; // end of the wrapper
    new MutationObserver(() => { // any change to the page
      if (w.__record.lit === null && document.querySelector('[data-testid="tv"] [data-lit="true"]')) w.__record.lit = performance.now(); // the first highlight on the virtual TV
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-lit'] }); // cards appear, and light up
  }); // end of the script
} // end of recordPage

/** What the page has recorded so far. */
const recorded = (page: Page) => page.evaluate(() => (window as unknown as { __record: Record }).__record); // a copy

/** Opens the studio in Drive mode (a click, so the page may play audio) and waits for the virtual TV to go idle. */
async function drive(page: Page): Promise<Locator> { // the virtual TV
  await page.goto('/'); // the studio
  await page.getByTestId('drive-mode').check(); // drive mode on
  const tv = page.getByTestId('tv'); // the virtual TV
  await expect(tv).toHaveAttribute('data-mode', 'idle'); // connected, waiting for a question
  return tv; // for the test
} // end of drive

/** The caregiver asks Sam if he wants tea or coffee: the agent's ask_question with the options Tea and Coffee. */
async function ask(page: Page): Promise<void> { // one caregiver turn
  await page.getByTestId('caregiver-input').fill('Ask Sam if he wants tea or coffee'); // the caregiver's words
  await page.getByTestId('caregiver-send').click(); // to the agent
} // end of ask

/** Answers Tea with the space bar, as the loop test does: the server is shared, and an open question would be replayed to the next test's TV. */
async function answerTea(page: Page, tv: Locator): Promise<void> { // press while Tea is lit
  const tea = page.locator('[data-testid="tv-card"][data-label="Tea"]'); // the Tea card
  for (let press = 0; press < 4 && (await tv.getAttribute('data-mode')) !== 'saying'; press++) { // a rescan may ask for a second press
    await expect(tea).toHaveAttribute('data-lit', 'true', { timeout: 10_000 }); // Tea lights up
    await page.waitForTimeout(700); // well inside Tea's window
    await page.keyboard.down('Space'); // the switch goes down
    await page.waitForTimeout(80); // a short press
    await page.keyboard.up('Space'); // and up
    await page.waitForTimeout(400); // the engine commits, or rescans the top two
  } // end of the presses
  await expect(tv).toHaveAttribute('data-mode', 'idle', { timeout: 10_000 }); // answered after its 2 s window: no question is left open
  await expect(page.getByTestId('speech')).toHaveText('Sam says: Tea.', { timeout: 30_000 }); // and the caregiver's turn has its answer
} // end of answerTea

/** A WAV of `seconds` of silence (PCM, mono, 16-bit, 16 kHz): a long announcement. */
function silentWav(seconds: number): Buffer { // header and zeros
  const data = seconds * 16_000 * 2; // bytes of samples
  const wav = Buffer.alloc(44 + data); // all zeros: silence
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + data, 4); wav.write('WAVE', 8); // the RIFF chunk
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); // PCM, mono
  wav.writeUInt32LE(16_000, 24); wav.writeUInt32LE(32_000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); // rate, byte rate, block align, bits
  wav.write('data', 36); wav.writeUInt32LE(data, 40); // the data chunk
  return wav; // the file
} // end of silentWav

test('the virtual TV plays the announcement of a question before its scan starts', async ({ page }) => { // B9 in the studio
  await recordPage(page); // audio events and the first highlight
  const tv = await drive(page); // idle
  const fetched = page.waitForResponse((r) => /^\/v1\/questions\/[^/]+\/announcement$/.test(new URL(r.url()).pathname)); // the announcement's audio
  await ask(page); // the caregiver asks
  const audio = await fetched; // fetched by the virtual TV
  expect([audio.status(), audio.headers()['content-type']]).toEqual([200, 'audio/wav']); // with the device token: the mock's tone
  await expect(page.locator('[data-testid="tv-card"][data-label="Tea"]')).toHaveAttribute('data-lit', 'true', { timeout: 10_000 }); // the scan has started
  const record = await recorded(page); // what happened, in order
  const ended = record.audio.find((a) => a.event === 'ended'); // the announcement's end
  expect(record.audio.map((a) => a.event).filter((e) => e !== 'pause')).toEqual(['playing', 'ended']); // played to its end (the browser also sends pause at the end)
  expect(record.lit).not.toBeNull(); // an option lit up
  expect(record.lit!).toBeGreaterThanOrEqual(ended!.at); // only after the announcement had ended
  await answerTea(page, tv); // leave no question open
}); // end of the test

test('the virtual TV scans at once when the announcement cannot be fetched, and a press during a long one stops it and starts the scan', async ({ page }) => { // failure and skip
  await recordPage(page); // audio events and the first highlight
  let fetches = 0; // announcement requests so far
  await page.route(/\/v1\/questions\/[^/]+\/announcement$/, (route) => (++fetches === 1 ? route.abort() : route.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav(5) }))); // the first fails on the network; the second is 5 s long
  const tv = await drive(page); // idle
  await ask(page); // the first question
  await expect(page.locator('[data-testid="tv-card"][data-label="Tea"]')).toHaveAttribute('data-lit', 'true', { timeout: 10_000 }); // the scan started anyway
  expect((await recorded(page)).audio).toEqual([]); // nothing was played
  await answerTea(page, tv); // answered: idle again
  await ask(page); // the second question
  await expect.poll(async () => (await recorded(page)).audio.map((a) => a.event), { timeout: 10_000 }).toEqual(['playing']); // its 5 s announcement plays
  await expect(tv).toHaveAttribute('data-mode', 'waiting'); // nothing lit while it plays
  await page.keyboard.down('Space'); // a short press during it
  await page.waitForTimeout(80); // 80 ms
  await page.keyboard.up('Space'); // up: handed over 150 ms later
  await expect(tv).toHaveAttribute('data-mode', 'asking', { timeout: 2000 }); // the scan starts at once
  expect((await recorded(page)).audio.map((a) => a.event)).toEqual(['playing', 'pause']); // stopped, long before its end
  expect(fetches).toBe(2); // one request per question
  await answerTea(page, tv); // leave no question open
}); // end of the test
