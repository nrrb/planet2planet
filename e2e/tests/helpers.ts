import { expect, type Locator, type Page } from '@playwright/test';
import { PNG } from 'pngjs';

/** Open the Compare page and wait until offers are listed. */
export async function openCompare(page: Page, query = 'from=jupiter&to=saturn') {
  await page.goto(`/?${query}`);
  // Either a count, or the empty state when the filters match nothing.
  await expect(page.getByRole('status').filter({ hasText: /plans? from|No plans match/ })).toBeVisible();
}

/** Plans are table rows on wide screens and cards on narrow ones; both count as an offer row. */
export const offerRows = (page: Page) =>
  page.locator('table tbody tr:has(input[type=checkbox]), ul[aria-label="Plans"] > li');

/** True when the plans are shown as cards (a narrow viewport). */
export const showsCards = async (page: Page) => (await page.getByRole('list', { name: 'Plans' }).count()) > 0;

const digits = (text: string) => Number(text.replace(/[^0-9]/g, ''));

/** The monthly price of every listed offer, in list order, as numbers. */
export async function prices(page: Page): Promise<number[]> {
  if (await showsCards(page)) {
    const cards = await offerRows(page).allInnerTexts();
    return cards.map((text) => digits(/([\d,]+)\s*cr a month/.exec(text.replace(/\s+/g, ' '))?.[1] ?? ''));
  }
  const cells = await page.locator('table tbody tr:has(input[type=checkbox]) td:nth-child(4)').allTextContents();
  return cells.map(digits);
}

/** The number of hops of every listed offer, in list order. */
export async function hopCounts(page: Page): Promise<number[]> {
  if (await showsCards(page)) {
    const cards = await offerRows(page).allInnerTexts();
    return cards.map((text) => Number(/(\d+)\s*hops/.exec(text.replace(/\s+/g, ' '))?.[1]));
  }
  const cells = await page.locator('table tbody tr:has(input[type=checkbox]) td:nth-child(13)').allTextContents();
  return cells.map(Number);
}

/** Sort by a column: a header button in the table, the "Sort by" select on cards. */
export async function chooseSort(page: Page, column: { header: string; option: string }) {
  if (await showsCards(page)) {
    await page.getByRole('combobox', { name: 'Sort by' }).selectOption(column.option);
  } else {
    await page.getByRole('button', { name: column.header }).click();
  }
}

/** Reverse the current sort: click the same header again, or the direction button on cards. */
export async function reverseSort(page: Page, header: string) {
  if (await showsCards(page)) {
    await page.getByRole('button', { name: /first$|A to Z|Z to A/ }).click();
  } else {
    await page.getByRole('button', { name: header }).click();
  }
}

/**
 * The share of pixels in an element that differ from its top-left corner. A blank canvas is 0.
 * Reading the screenshot, not the canvas, means this sees exactly what a visitor sees.
 */
export async function inkShare(locator: Locator): Promise<number> {
  const png = PNG.sync.read(await locator.screenshot());
  const [r, g, b] = [png.data[0], png.data[1], png.data[2]];
  let ink = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (Math.abs(png.data[i] - r) + Math.abs(png.data[i + 1] - g) + Math.abs(png.data[i + 2] - b) > 30) ink += 1;
  }
  return ink / (png.width * png.height);
}

/** Wait for a map canvas to start, then for it to have drawn something. */
export async function expectMapDrawn(canvas: Locator) {
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => inkShare(canvas), { timeout: 30_000, message: 'the map canvas stayed blank' }).toBeGreaterThan(0.002);
}

export async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0);
}

/** WebKit headless may have no WebGL; the app must say so and carry on. */
export async function mapUnavailable(page: Page): Promise<boolean> {
  return page.getByText('The map could not start in this browser').first().isVisible();
}

/** The top-left pixel of an element's screenshot: for a map canvas, its background colour. */
export async function cornerColour(locator: Locator): Promise<[number, number, number]> {
  const png = PNG.sync.read(await locator.screenshot());
  return [png.data[0], png.data[1], png.data[2]];
}

export const homeMap = (page: Page) => page.getByRole('region', { name: 'Map of the Sol system' }).locator('canvas');
export const dialogMap = (page: Page) => page.getByRole('dialog').locator('canvas');
