// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Help (B8), in mock mode. A help request from the TV (POST /v1/alerts) shows "Sam is asking for help." with its time in
// the caregiver panel, is spoken once, lights TV, Server and Caregiver on the trace, and "What did Sam say?" mentions
// it. On the virtual TV, holding the space bar for 2 s sends one, and the screen says what really happened to it, as
// the TV's does; a short press still closes Help.

import { expect, test, type Page } from '@playwright/test'; // Playwright Test
import { sendHelp } from './sendHelp'; // a help request, as the TV sends it

const ALERT = 'Sam is asking for help.'; // the caregiver panel's alert

/** Records the browser's speech instead of playing it, from the page's first script on. */
async function recordSpeech(page: Page): Promise<void> { // window.__spoken gets each text spoken
  await page.addInitScript(() => { // before the studio's own scripts
    const w = window as unknown as { __spoken: string[] }; // the record
    w.__spoken = []; // nothing spoken yet
    speechSynthesis.speak = (u: SpeechSynthesisUtterance) => { w.__spoken.push(u.text); }; // recorded, not played
    speechSynthesis.cancel = () => {}; // nothing to stop
  }); // end of the script
} // end of recordSpeech

/** What the page has spoken so far. */
const spoken = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken); // in order

/** Expects one help alert with its time, spoken once, and the TV, Server and Caregiver hops lit by it. */
async function alerted(page: Page): Promise<void> { // the caregiver's side of a help request
  const alert = page.getByTestId('help-alert'); // the alerts in the conversation
  await expect(alert).toHaveCount(1); // one
  await expect(alert).toContainText(ALERT); // its words
  await expect(alert.locator('time')).toHaveText(/^\d{2}:\d{2}$/); // and the time, as HH:MM
  const hop = (key: string) => page.locator(`[data-testid="trace-hop"][data-hop="${key}"]`); // one hop of the strip
  for (const [key, op] of [['tv', 'help request'], ['server', 'POST /v1/alerts'], ['caregiver', 'help.requested']]) { // TV -> Server -> Caregiver
    await expect(hop(key!)).toHaveAttribute('data-lit', 'true'); // lit now
    await expect(hop(key!).locator('.hop-op')).toHaveText(op!); // by the help request
  } // end of the hops
  await page.waitForTimeout(1500); // a second alert or a second speech would have come by now
  await expect(alert).toHaveCount(1); // still one
  expect((await spoken(page)).filter((t) => t === ALERT)).toHaveLength(1); // spoken once
} // end of alerted

/** Switches Drive mode on and waits for the virtual TV to connect and go idle; returns it and the help requests it sends. */
async function drive(page: Page) { // the virtual TV, as the household's TV
  const sent: string[] = []; // the Idempotency-Key of each POST /v1/alerts, preflights left out
  page.on('request', (r) => { if (r.method() === 'POST' && new URL(r.url()).pathname === '/v1/alerts') sent.push(r.headers()['idempotency-key'] ?? ''); }); // every help request
  await page.goto('/'); // the studio
  await page.getByTestId('drive-mode').check(); // drive mode on
  const tv = page.getByTestId('tv'); // the virtual TV
  await expect(tv).toHaveAttribute('data-online', 'true'); // its stream is open
  await expect(tv).toHaveAttribute('data-mode', 'idle'); // waiting for a question
  return { tv, sent }; // for the test
} // end of drive

/** A short press of the virtual switch. */
async function press(page: Page): Promise<void> { // down and up
  await page.keyboard.down('Space'); // down
  await page.waitForTimeout(80); // a short press
  await page.keyboard.up('Space'); // up
} // end of press

test('a help request from the TV shows "Sam is asking for help." with its time, speaks it once, lights TV, Server and Caregiver, and is in the recap', async ({ page }) => { // the caregiver panel
  await recordSpeech(page); // speech recorded
  await page.goto('/'); // the studio, Drive mode off: the emulator's TV would send it
  expect(await sendHelp(page, 'help-from-the-tv')).toBe(201); // Sam holds the switch
  expect(await sendHelp(page, 'help-from-the-tv')).toBe(200); // the TV's retry of the same request: no second alert
  await alerted(page); // one alert, spoken once, the hops lit
  expect(await spoken(page)).toEqual([ALERT]); // nothing else was said
  await page.getByTestId('caregiver-input').fill('What did Sam say?'); // the caregiver asks
  await page.getByTestId('caregiver-send').click(); // to the agent, in mock mode
  await expect(page.getByTestId('speech')).toHaveText(/^Sam asked for help at \d{2}:\d{2}\./); // the help request comes first in the recap
  await expect(page.getByTestId('help-alert')).toHaveCount(1); // the alert stays in the conversation
  expect((await spoken(page)).filter((t) => t === ALERT)).toHaveLength(1); // and is not spoken again
}); // end of the test

test('in Drive mode, holding Space for 2 s sends one help request, shows "Help request sent." and the alert; a short press closes Help', async ({ page }) => { // success
  await recordSpeech(page); // speech recorded
  const { tv, sent } = await drive(page); // idle
  await page.keyboard.down('Space'); // the hold starts
  await page.waitForTimeout(1500); // 1.5 s held
  await expect(tv).toHaveAttribute('data-mode', 'idle'); // not Help yet
  await expect(tv).toHaveAttribute('data-mode', 'help', { timeout: 2000 }); // Help at 2 s, the key still down
  await expect(page.getByTestId('tv-help')).toHaveText('Help request sent.'); // the server confirmed it
  await alerted(page); // the caregiver panel's alert, spoken once, and the hops lit
  await page.keyboard.up('Space'); // released
  await page.waitForTimeout(500); // the hold's final release does nothing
  await expect(tv).toHaveAttribute('data-mode', 'help'); // still Help
  expect(sent).toHaveLength(1); // one request for the hold
  await press(page); // a short press
  await expect(tv).toHaveAttribute('data-mode', 'idle'); // closes Help
  expect(sent).toHaveLength(1); // and sends nothing
}); // end of the test

test('shows "Asking for help…" while the request is on its way, and "Couldn\'t send the help request." when it cannot reach the server', async ({ page }) => { // failure, as offline
  await page.route('**/v1/alerts', async (route) => { await new Promise((r) => setTimeout(r, 2000)); await route.abort('connectionrefused'); }); // slow, then unreachable
  const { tv, sent } = await drive(page); // idle
  await page.keyboard.down('Space'); // the hold starts
  await expect(tv).toHaveAttribute('data-mode', 'help', { timeout: 3500 }); // Help at 2 s
  await expect(page.getByTestId('tv-help')).toHaveText('Asking for help…'); // while it is sent
  await page.keyboard.up('Space'); // released
  await expect(page.getByTestId('tv-help')).toHaveText("Couldn't send the help request."); // what really happened
  expect(sent).toHaveLength(1); // one attempt
  await press(page); // a short press
  await expect(tv).toHaveAttribute('data-mode', 'idle'); // closes Help
  await expect(page.getByTestId('help-alert')).toHaveCount(0); // nothing reached the server, so no alert
}); // end of the test

test('speaks a help alert that came before any click or key once the page gets one, as Chrome allows', async ({ page }) => { // Chrome refuses speech before (error "not-allowed")
  await recordSpeech(page); // speech recorded
  await page.addInitScript(() => { // Chrome's rule, which page.evaluate lifts: no user activation until a click or a key
    let active = false; // none yet
    addEventListener('mousedown', () => { active = true; }, true); // a click activates the page, before the studio's own handlers
    addEventListener('keydown', (e) => { if (!['Shift', 'Control', 'Alt', 'Meta', 'Escape'].includes(e.key)) active = true; }, true); // a key does too, but not a modifier or Esc
    Object.defineProperty(navigator, 'userActivation', { value: { get hasBeenActive() { return active; } } }); // as Chrome reports it
  }); // end of the script
  await page.goto('/'); // the studio, untouched, as a caregiver may leave it
  expect(await sendHelp(page, 'help-before-a-click')).toBe(201); // Sam holds the switch
  await expect(page.getByTestId('help-alert')).toHaveCount(1); // shown at once
  await page.waitForTimeout(500); // speech would have started by now
  expect(await spoken(page)).toEqual([]); // not yet: the browser would refuse it
  await page.keyboard.press('Shift'); // a key that does not activate the page
  await page.waitForTimeout(300); // speech would have started by now
  expect(await spoken(page)).toEqual([]); // still waiting, not lost
  await page.mouse.click(20, 1060); // the caregiver clicks the page
  await expect.poll(() => spoken(page)).toEqual([ALERT]); // spoken now, once
  await page.keyboard.press('a'); // another key
  expect(await spoken(page)).toEqual([ALERT]); // nothing more
}); // end of the test

test('keeps the newest help alert in view after many, as a chat does', async ({ page }) => { // the transcript scrolls
  await page.goto('/'); // the studio
  for (let i = 0; i < 9; i++) expect(await sendHelp(page, `many-${i}`)).toBe(201); // more alerts than the panel's height holds
  const alerts = page.getByTestId('help-alert'); // the alerts
  await expect(alerts).toHaveCount(9); // all of them, in the conversation
  await expect(alerts.last()).toBeInViewport({ ratio: 1 }); // the newest is in full view
}); // end of the test

test('keeps each help alert on screen, not drawn anew, when the caregiver starts a turn', async ({ page }) => { // so a screen reader does not announce it again
  await page.goto('/'); // the studio
  const say = async (text: string, answer: string) => { await page.getByTestId('caregiver-input').fill(text); await page.getByTestId('caregiver-send').click(); await expect(page.getByTestId('speech')).toHaveText(answer); }; // one turn, to its end
  await say('Remember that Sam loves gardening', 'Noted: Sam loves gardening.'); // a first turn
  expect(await sendHelp(page, 'help-between-turns')).toBe(201); // an alert after it
  const alert = page.getByTestId('help-alert'); // that alert
  await expect(alert).toHaveCount(1); // shown
  await alert.evaluate((el) => { el.dataset.mark = 'first'; }); // marks this very element
  await say('Remember that Sam likes jazz', 'Noted: Sam likes jazz.'); // a new turn: the alert now comes before it
  await expect(alert).toHaveAttribute('data-mark', 'first'); // the same element, moved, not drawn again
  expect(await page.locator('.transcript > *').evaluateAll((els) => els.map((e) => e.className))).toEqual(['alert', 'bubble', 'chips', 'speech']); // in time order: the alert, then the turn
}); // end of the test
