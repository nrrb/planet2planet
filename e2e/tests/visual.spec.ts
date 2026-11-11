import { expect, test } from '@playwright/test';
import { chooseTheme, offerRows } from './helpers';

// Pixel snapshots depend on the platform's font rendering and GPU stack, so baselines are per platform
// (see ADR 0005). Run `npm run update-snapshots` on the machine whose baselines you want to refresh.
test.describe('@visual', () => {
  test.use({ reducedMotion: 'reduce' });
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'desktop', 'Desktop Chromium only.');
    test.slow();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`the Compare page, ${scheme}`, async ({ page }) => {
      await chooseTheme(page, scheme);
      await page.goto('/?from=earth&to=mars');
      await expect(offerRows(page).first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot(`compare-${scheme}.png`, {
        fullPage: true,
        mask: [page.getByText(/^Stardate /)],
      });
    });

    test(`the route map dialog, ${scheme}`, async ({ page }) => {
      await chooseTheme(page, scheme);
      await page.goto('/?from=earth&to=mars');
      await offerRows(page).first().getByRole('button', { name: 'Route' }).click();
      const dialog = page.getByRole('dialog', { name: /^Route:/ });
      await expect(dialog.locator('canvas')).toBeVisible();
      await page.waitForTimeout(1500);
      await expect(dialog).toHaveScreenshot(`route-dialog-${scheme}.png`);
    });
  }
});
