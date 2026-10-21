// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Flow S1 through the studio in mock mode (plan §4.7, FR "browser end-to-end test"): ask in the caregiver panel, press
// the virtual switch (the space bar) on the virtual TV, and hear the answer; the trace shows the MCP and TV hops.
// Screenshots at 1080p go to test-results/b5/.

import { expect, test } from '@playwright/test'; // Playwright Test
import { fileURLToPath } from 'node:url'; // a path for the screenshots

const SHOTS = fileURLToPath(new URL('../../../test-results/b5/', import.meta.url)); // the repository's git-ignored results

test('a caregiver asks, Sam presses Tea on the virtual TV, and the caregiver hears "Sam says: Tea."', async ({ page }) => { // the loop
  await page.goto('/'); // the studio
  await expect(page.getByTestId('sim-banner')).toHaveText('Simulated Alexa+ experience'); // the permanent banner
  await expect(page.getByTestId('tv')).toHaveAttribute('data-mode', 'off'); // drive mode is off by default
  await page.getByTestId('drive-mode').check(); // drive mode on: the virtual TV connects as the household's TV
  const tv = page.getByTestId('tv'); // the virtual TV
  await expect(tv).toHaveAttribute('data-online', 'true'); // its stream is open
  await expect(tv).toHaveAttribute('data-mode', 'idle'); // so it waits for a question, with no practice
  await page.screenshot({ path: `${SHOTS}studio-1-idle.png` }); // for the report

  await page.getByTestId('caregiver-input').fill('Ask Sam if he wants tea or coffee'); // the caregiver's words
  await page.getByTestId('caregiver-send').click(); // to the agent
  const tea = page.locator('[data-testid="tv-card"][data-label="Tea"]'); // the Tea card
  await expect(tea).toBeVisible(); // the question reached the virtual TV
  await expect(page.locator('[data-testid="tv-card"][data-label="Coffee"]')).toBeVisible(); // with Coffee too
  await expect(page.locator('[data-testid="tool-chip"][data-tool="ask_question"]')).toHaveAttribute('data-state', 'ok'); // the first tool call, done
  await expect(page.locator('[data-testid="tool-chip"][data-tool="get_answer"]')).toHaveAttribute('data-state', 'running'); // waiting for Sam

  for (let press = 0; press < 4 && (await tv.getAttribute('data-mode')) !== 'saying'; press++) { // a rescan may ask for a second press
    await expect(tea).toHaveAttribute('data-lit', 'true', { timeout: 10_000 }); // Tea lights up
    if (press === 0) await page.screenshot({ path: `${SHOTS}studio-2-asking.png` }); // for the report: the scan and the engine's priors
    if (press === 0) expect(await page.locator('.bar-label').evaluateAll((labels) => labels.filter((l) => l.scrollHeight > l.clientHeight + 1).map((l) => l.textContent))).toEqual([]); // at 1080p every engine label keeps both of its lines
    await page.waitForTimeout(700); // well inside Tea's window, past the reaction delay the engine expects
    await page.keyboard.down('Space'); // the switch goes down
    await page.waitForTimeout(80); // a short press
    await page.keyboard.up('Space'); // and up: a press, not a hold
    await page.waitForTimeout(400); // the engine commits, or rescans the top two
  } // end of the presses
  await expect(tv).toHaveAttribute('data-mode', 'saying'); // Tea committed: "Saying it" for 2 s
  await expect(page.getByTestId('tv-saying')).toHaveText('Tea'); // the reply on the screen
  expect(Number(await page.locator('[data-testid="engine-bar"][data-option="Tea"]').getAttribute('data-p'))).toBeGreaterThanOrEqual(0.97); // the engine view: Tea's posterior reached θ

  await expect(page.getByTestId('speech')).toHaveText('Sam says: Tea.', { timeout: 30_000 }); // the agent read the answer and said it
  await expect(page.locator('[data-testid="tool-chip"][data-tool="get_answer"]')).toHaveAttribute('data-state', 'ok'); // the wait ended
  await expect(page.locator('[data-testid="trace-hop"][data-hop="mcp"]')).toHaveAttribute('data-seen', 'true'); // the MCP hop lit
  await expect(page.locator('[data-testid="trace-hop"][data-hop="tv"]')).toHaveAttribute('data-seen', 'true'); // the TV hop lit
  await expect(page.getByTestId('mode-badge')).toHaveText('MOCK'); // mock mode, no AWS
  await expect(tv).toHaveAttribute('data-mode', 'idle'); // back to waiting
  await expect(tv).toContainText('You said: Tea'); // with the last reply
  await page.screenshot({ path: `${SHOTS}studio-3-answered.png` }); // for the report
}); // end of the test
