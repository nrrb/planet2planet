import { expect, test } from '@playwright/test';
import { cornerColour, expectMapDrawn, mapUnavailable, noSidewaysScroll } from './helpers';

test.describe('Canon page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/canon');
    await expect(page.getByRole('heading', { name: 'Canon: how this world was built' })).toBeVisible();
  });

  test('all three fact tables render with episode names and Memory Alpha links in new tabs', async ({ page }) => {
    const starting = page.getByRole('table', { name: /fixed/ });
    await expect(starting.getByRole('row')).toHaveCount(11); // header + 10 facts
    await expect(starting).toContainText('ENT: Fortunate Son');
    const link = starting.getByRole('link', { name: 'Memory Alpha: Subspace communication' }).first();
    await expect(link).toHaveAttribute('href', 'https://memory-alpha.fandom.com/wiki/Subspace_communication');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(starting.getByText('(opens in a new tab)').first()).toBeVisible();

    const deadlines = page.getByRole('table', { name: /latest date canon allows/ });
    await expect(deadlines.getByRole('row')).toHaveCount(7);
    await expect(deadlines.getByText('100% of runs')).toHaveCount(6);
    await expect(deadlines.getByRole('row', { name: /Titan/ })).toContainText('SNW: Memento Mori');
    await expect(deadlines).toContainText('50 million by 2373');

    const aside = page.getByRole('table', { name: 'Claims that were left out, and why' });
    await expect(aside.getByRole('row')).toHaveCount(7);
    await expect(aside.getByText('Reference book').first()).toBeVisible();
  });

  test('the script link points at tools/colonization-sim.js at the commit recorded with the data', async ({ page, request }) => {
    const { run } = (await (await request.get('/api/simulation/')).json()) as { run: { scriptCommit: string } };
    expect(run.scriptCommit).toMatch(/^[0-9a-f]{40}$/);
    const link = page.getByRole('link', { name: /Read the simulation script/ });
    await expect(link).toHaveAttribute('href', `https://github.com/example/planet2planet/blob/${run.scriptCommit}/tools/colonization-sim.js`);
    await expect(link).toHaveAttribute('target', '_blank');
  });

  test('every claim carries a label that is written out, not just coloured', async ({ page }) => {
    for (const label of ['On screen', 'Invented', 'Real astronomy', 'Reference book']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test('the strip plot changes when another world is picked, and has a table view', async ({ page }) => {
    const plot = page.locator('#monte-carlo');
    await expect(plot.getByRole('img', { name: /Titan: colonized between 2175 and 2205/ })).toBeVisible();
    await expect(plot.getByRole('img').locator('circle')).toHaveCount(400);
    await expect(plot.getByText('seed 1701: 2187')).toBeVisible();

    await plot.getByRole('combobox', { name: 'World' }).selectOption('ganymede');
    await expect(plot.getByRole('img', { name: /Ganymede: colonized/ })).toBeVisible();
    await expect(plot.getByRole('heading', { name: /When was Ganymede colonized/ })).toBeVisible();

    await plot.getByRole('button', { name: 'Show as table' }).click();
    await expect(plot.getByRole('table', { name: /Runs by the year Ganymede was colonized/ })).toBeVisible();
    await plot.getByRole('button', { name: 'Show as chart' }).click();
    await expect(plot.getByRole('img', { name: /Ganymede: colonized/ })).toBeVisible();
  });

  test('every chart can be shown as a table and back', async ({ page }) => {
    const results = page.locator('#results');
    for (const [chart, table] of [
      ['When each world was settled', /Median years of settlement/],
      ['How many people live on each world in 2380', /Median population in 2380/],
    ] as const) {
      const frame = results.locator('div').filter({ has: page.getByRole('heading', { name: chart }) }).first();
      await frame.getByRole('button', { name: 'Show as table' }).click();
      await expect(results.getByRole('table', { name: table })).toBeVisible();
      await frame.getByRole('button', { name: 'Show as chart' }).click();
      await expect(results.getByRole('table', { name: table })).toHaveCount(0);
    }
    await expect(results.getByRole('table', { name: 'Market figures across the runs' })).toContainText('Brands still trading in 2380');
  });

  test('moving the year slider updates the counts and the news line', async ({ page }) => {
    const watch = page.locator('#watch');
    await watch.scrollIntoViewIfNeeded();
    const slider = watch.getByRole('slider', { name: 'Year' });
    await expect(slider).toHaveValue('1962');
    await expect(watch.getByRole('list', { name: 'Latest events' })).toContainText('Earth: first relay constellation, at light speed');
    await slider.fill('2153');
    const counts = watch.getByLabel('Counts in 2153');
    await expect(counts).toContainText('Worlds colonized');
    await expect(counts.locator('dt:text("Worlds colonized") + dd')).toHaveText('3');
    await expect(counts.locator('dt:text("Subspace constellations") + dd')).toHaveText('1');
    await expect(watch.getByRole('list', { name: 'Latest events' })).toContainText('Earth: network converted to subspace');

    await slider.fill('2380');
    const end = watch.getByLabel('Counts in 2380');
    await expect(end.locator('dt:text("Worlds colonized") + dd')).toHaveText('32');
    await expect(end.locator('dt:text("Subspace constellations") + dd')).toHaveText('33');
    await expect(end.locator('dt:text("Telecom brands trading") + dd')).toHaveText('46');
  });

  test('nothing plays until asked, and Play advances the years', async ({ page }) => {
    const watch = page.locator('#watch');
    const slider = watch.getByRole('slider', { name: 'Year' });
    await expect(slider).toHaveValue('1962');
    await page.waitForTimeout(1500);
    await expect(slider).toHaveValue('1962');
    await watch.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(1962);
    await watch.getByRole('button', { name: 'Pause', exact: true }).click();
    const paused = await slider.inputValue();
    await page.waitForTimeout(800);
    await expect(slider).toHaveValue(paused);
  });

  test('the history map draws, and has a table of what each world has in the chosen year', async ({ page }) => {
    const watch = page.locator('#watch');
    await watch.scrollIntoViewIfNeeded();
    await watch.getByRole('slider', { name: 'Year' }).fill('2160');
    if (!(await mapUnavailable(page))) await expectMapDrawn(watch.locator('canvas'));
    await watch.getByRole('button', { name: 'Show as table' }).click();
    const table = watch.getByRole('table', { name: 'What each world has in 2160' });
    await expect(table.getByRole('row', { name: /Earth/ })).toContainText('Subspace');
    await expect(table.getByRole('row', { name: /Mars/ })).toContainText('Founded');
  });

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('the history map stays still while the year does not change', async ({ page }) => {
      const watch = page.locator('#watch');
      await watch.scrollIntoViewIfNeeded();
      if (await mapUnavailable(page)) test.skip(true, 'This browser has no WebGL.');
      await expectMapDrawn(watch.locator('canvas'));
      const first = await watch.locator('canvas').screenshot();
      await page.waitForTimeout(1500);
      expect((await watch.locator('canvas').screenshot()).equals(first), 'the map moved').toBe(true);
      expect(await cornerColour(watch.locator('canvas'))).toBeTruthy();
    });
  });

  test('does not scroll sideways', async ({ page }) => {
    await noSidewaysScroll(page);
  });
});
