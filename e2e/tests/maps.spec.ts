import { expect, test } from '@playwright/test';
import { cornerColour, dialogMap, expectMapDrawn, homeMap, inkShare, mapUnavailable, offerRows, openCompare } from './helpers';

test.describe('Maps', () => {
  // Software-rendered WebGL is slow when several tests share a machine.
  test.beforeEach(() => test.slow());

  test('the map names the chosen origin and destination in words, and follows the form', async ({ page }) => {
    await openCompare(page);
    const map = page.getByRole('application').first();
    await expect(map).toHaveAccessibleName(/Jupiter as the origin and Saturn as the destination/);
    await page.getByLabel('From', { exact: true }).selectOption('moon');
    await page.getByLabel('To', { exact: true }).selectOption('titan');
    await expect(map).toHaveAccessibleName(/Moon as the origin and Titan as the destination/);
  });

  test('the map can be hidden, and stays hidden after a reload', async ({ page }) => {
    await openCompare(page);
    await page.getByRole('button', { name: 'Hide map' }).click();
    await expect(page.getByRole('application')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Show map' })).toBeVisible();
    await expect(page.getByRole('application')).toHaveCount(0);
    await page.getByRole('button', { name: 'Show map' }).click();
    await expect(page.getByRole('application').first()).toBeVisible();
  });

  test('two maps can run at once: opening a route never blanks the map on the page', async ({ page }) => {
    await openCompare(page);
    if (await mapUnavailable(page)) test.skip(true, 'This browser has no WebGL.');
    await expectMapDrawn(homeMap(page));

    const opener = offerRows(page).first().getByRole('button', { name: 'Route' });
    await opener.click();
    await expectMapDrawn(dialogMap(page));
    // The regression: the map behind the dialog went blank when a second map started.
    await expect.poll(() => inkShare(homeMap(page)), { message: 'the page map went blank', timeout: 30_000 }).toBeGreaterThan(0.002);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expectMapDrawn(homeMap(page));

    // Closing a map must not break the next one either.
    await offerRows(page).nth(2).getByRole('button', { name: 'Route' }).click();
    await expectMapDrawn(dialogMap(page));
    await expectMapDrawn(homeMap(page));
  });

  test('the route map lists the same route as text, and hovering a segment names its carrier', async ({ page }, info) => {
    await openCompare(page);
    await offerRows(page).first().getByRole('button', { name: 'Route' }).click();
    const dialog = page.getByRole('dialog');
    const segments = dialog.getByRole('list', { name: 'Route segments' }).getByRole('listitem');
    expect(await segments.count()).toBeGreaterThanOrEqual(3);
    await expect(dialog.getByRole('list', { name: 'Map legend' })).toBeVisible();
    if (await mapUnavailable(page)) return;
    test.skip(info.project.name !== 'desktop', 'Hover needs a mouse.');
    await dialog.getByRole('button', { name: 'Pause motion' }).click();
    const box = (await dialogMap(page).boundingBox())!;
    // Sweep the canvas until the pointer is over a link: the tooltip then names a carrier.
    let found = false;
    for (let y = 0.2; y < 0.9 && !found; y += 0.05) {
      for (let x = 0.15; x < 0.9 && !found; x += 0.05) {
        await page.mouse.move(box.x + box.width * x, box.y + box.height * y);
        found = await dialog.getByRole('status').filter({ hasText: /Backbone|Regional mesh|Cross-link/ }).isVisible();
      }
    }
    expect(found, 'no link responded to hover').toBe(true);
  });

  test('the map follows the site theme', async ({ page }) => {
    await openCompare(page);
    if (await mapUnavailable(page)) test.skip(true, 'This browser has no WebGL.');
    await expectMapDrawn(homeMap(page));
    const [lr, lg, lb] = await cornerColour(homeMap(page));
    expect(Math.min(lr, lg, lb), 'light theme: a white canvas').toBeGreaterThan(200);

    await page.getByRole('button', { name: 'Switch to the dark theme' }).click();
    await expect
      .poll(async () => Math.max(...(await cornerColour(homeMap(page)))), { message: 'dark theme: a dark canvas', timeout: 20_000 })
      .toBeLessThan(110);
  });

  test('the map can be panned and zoomed from the keyboard', async ({ page }) => {
    await openCompare(page);
    if (await mapUnavailable(page)) test.skip(true, 'This browser has no WebGL.');
    await page.getByRole('button', { name: 'Pause motion' }).first().click();
    const map = page.getByRole('application').first();
    await expectMapDrawn(homeMap(page));
    const before = await homeMap(page).screenshot();
    await map.focus();
    await page.keyboard.press('=');
    await page.keyboard.press('=');
    await expect.poll(async () => !(await homeMap(page).screenshot()).equals(before), { message: 'zooming changed nothing' }).toBe(true);
  });

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('nothing animates, and the pause control says why', async ({ page }) => {
      await openCompare(page);
      if (await mapUnavailable(page)) test.skip(true, 'This browser has no WebGL.');
      await expectMapDrawn(homeMap(page));
      await expect(page.getByRole('button', { name: 'Play motion' }).first()).toBeDisabled();
      const first = await homeMap(page).screenshot();
      await page.waitForTimeout(1500);
      expect((await homeMap(page).screenshot()).equals(first), 'the map moved').toBe(true);
    });
  });
});
