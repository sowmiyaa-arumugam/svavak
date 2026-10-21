// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Help on the virtual TV (B8), in mock mode: holding the space bar for 2 s sends one help request (POST /v1/alerts), and
// the screen says what really happened to it, as the TV's does; a short press still closes Help.

import { expect, test, type Page } from '@playwright/test'; // Playwright Test

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

test('in Drive mode, holding Space for 2 s sends one help request and shows "Help request sent."; a short press closes Help', async ({ page }) => { // success
  const { tv, sent } = await drive(page); // idle
  await page.keyboard.down('Space'); // the hold starts
  await page.waitForTimeout(1500); // 1.5 s held
  await expect(tv).toHaveAttribute('data-mode', 'idle'); // not Help yet
  await expect(tv).toHaveAttribute('data-mode', 'help', { timeout: 2000 }); // Help at 2 s, the key still down
  await expect(page.getByTestId('tv-help')).toHaveText('Help request sent.'); // the server confirmed it
  await page.keyboard.up('Space'); // released
  await page.waitForTimeout(500); // the hold's final release does nothing
  await expect(tv).toHaveAttribute('data-mode', 'help'); // still Help
  expect(sent).toHaveLength(1); // one request for the hold
  await press(page); // a short press
  await expect(tv).toHaveAttribute('data-mode', 'idle'); // closes Help
  expect(sent).toHaveLength(1); // and sends nothing
}); // end of the test

test('shows "Asking for help…" while the request is on its way, and "Couldn\'t send the help request." when it cannot reach the server', async ({ page }) => { // failure, as offline
  await page.route('**/v1/alerts', async (route) => { await new Promise((r) => setTimeout(r, 1000)); await route.abort('connectionrefused'); }); // slow, then unreachable
  const { tv, sent } = await drive(page); // idle
  await page.keyboard.down('Space'); // the hold starts
  await expect(tv).toHaveAttribute('data-mode', 'help', { timeout: 3500 }); // Help at 2 s
  await expect(page.getByTestId('tv-help')).toHaveText('Asking for help…'); // while it is sent
  await page.keyboard.up('Space'); // released
  await expect(page.getByTestId('tv-help')).toHaveText("Couldn't send the help request."); // what really happened
  expect(sent).toHaveLength(1); // one attempt
  await press(page); // a short press
  await expect(tv).toHaveAttribute('data-mode', 'idle'); // closes Help
}); // end of the test
