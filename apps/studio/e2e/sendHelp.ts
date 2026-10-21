// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// A help request as the TV sends it (POST /v1/alerts), sent from the studio's page: the device token this Playwright
// run made (playwright.config.ts) goes to the servers, not to the tests, but the page has it, in its config module.

import type { Page } from '@playwright/test'; // Playwright's page

/** Sends one help request with the given idempotency key from the page, as the household's TV; returns the server's status. */
export function sendHelp(page: Page, key: string): Promise<number> { // 201, or 200 for a repeated key
  return page.evaluate(async (key) => { // in the page
    const config = '/src/config.ts'; // the module the page itself loads, served by Vite with this run's token
    const { DEVICE_TOKEN, SERVER_URL } = (await import(config)) as { DEVICE_TOKEN: string; SERVER_URL: string }; // the same instance the page uses
    const res = await fetch(`${SERVER_URL}/v1/alerts`, { method: 'POST', headers: { Authorization: `Bearer ${DEVICE_TOKEN}`, 'Idempotency-Key': key } }); // no body, as the TV sends it
    return res.status; // the server's answer
  }, key); // end of the evaluation
} // end of sendHelp
