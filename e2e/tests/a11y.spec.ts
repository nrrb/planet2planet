import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { chooseTheme, noSidewaysScroll } from './helpers';

const PAGES = [
  ['compare', '/?from=earth&to=mars'],
  ['about', '/about'],
  ['canon', '/canon'],
  ['not found', '/no-such-page'],
] as const;

async function scan(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`),
  ).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`accessibility (${theme})`, () => {
    test.beforeEach(({ page }) => chooseTheme(page, theme));
    for (const [name, url] of PAGES) {
      test(`${name} page has no WCAG 2.2 AA violations`, async ({ page }) => {
        test.slow();
        await page.goto(url);
        await page.waitForLoadState('networkidle');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await scan(page);
        await noSidewaysScroll(page);
      });
    }
  });
}

test('the route dialog and filter drawer have no violations', async ({ page }) => {
  test.slow();
  await page.goto('/?from=earth&to=mars');
  await page.getByRole('button', { name: /filters/i }).first().click();
  await scan(page);
  await page.getByRole('button', { name: /route/i }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await scan(page);
});
