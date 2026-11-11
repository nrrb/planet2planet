import { expect, test } from '@playwright/test';
import { noSidewaysScroll, offerRows, openCompare, prices } from './helpers';

test.describe('Compare page', () => {
  test('opens on Jupiter and Saturn with offers when the URL has no worlds', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/from=jupiter&to=saturn/);
    await expect(page.getByLabel('From', { exact: true })).toHaveValue('jupiter');
    await expect(page.getByLabel('To', { exact: true })).toHaveValue('saturn');
    await expect(page.getByText(/\d+ plans from Jupiter to Saturn/)).toBeVisible();
    expect(await offerRows(page).count()).toBeGreaterThan(20);
    await expect(page.getByText('Lowest price').first()).toBeVisible();
    await expect(page.getByText('Lowest latency').first()).toBeVisible();
  });

  test('changing worlds updates the offers and the URL, and a shared URL restores the view', async ({ page }) => {
    await openCompare(page);
    await page.getByLabel('From', { exact: true }).selectOption('earth');
    await page.getByLabel('To', { exact: true }).selectOption('mars');
    await expect(page.getByText(/\d+ plans from Earth to Mars/)).toBeVisible();
    await expect(page).toHaveURL(/from=earth&to=mars/);
    const url = page.url();
    const before = await prices(page);

    await page.goto('/');
    await page.goto(url);
    await expect(page.getByText(/\d+ plans from Earth to Mars/)).toBeVisible();
    expect(await prices(page)).toEqual(before);
    await expect(page.getByLabel('From', { exact: true })).toHaveValue('earth');
  });

  test('the world chosen in one select is disabled in the other, both ways', async ({ page }) => {
    await openCompare(page);
    await expect(page.getByLabel('From', { exact: true }).locator('option[value="saturn"]')).toBeDisabled();
    await expect(page.getByLabel('To', { exact: true }).locator('option[value="jupiter"]')).toBeDisabled();
    await expect(page.getByLabel('From', { exact: true }).locator('option[value="earth"]')).toBeEnabled();
    await expect(page.getByRole('button', { name: /swap/i })).toHaveCount(0);
  });

  test('the filter drawer starts closed, below the world selects, and narrows the results', async ({ page }) => {
    await openCompare(page);
    const toggle = page.getByRole('button', { name: /^Filters/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const [selectBox, toggleBox] = await Promise.all([page.getByLabel('From', { exact: true }).boundingBox(), toggle.boundingBox()]);
    expect(toggleBox!.y).toBeGreaterThan(selectBox!.y);

    const all = await offerRows(page).count();
    await toggle.click();
    await page.getByRole('form', { name: 'Filter options' }).getByRole('checkbox', { name: 'Dedicated' }).click();
    await expect(page).toHaveURL(/class=dedicated/);
    await expect.poll(() => offerRows(page).count()).toBeLessThan(all);
    // The active filter stays visible as a chip while the drawer is closed.
    await toggle.click();
    await expect(page.getByRole('button', { name: 'Remove filter Class: Dedicated' })).toBeVisible();
    const classes = await page.locator('table tbody tr:has(input[type=checkbox]) td:nth-child(10)').allTextContents();
    expect(new Set(classes)).toEqual(new Set(['Dedicated']));
  });

  test('a filter that matches nothing says so, and one click resets it', async ({ page }) => {
    await openCompare(page, 'from=jupiter&to=saturn&maxLatencyMs=1');
    await expect(page.getByText('No plans match these filters')).toBeVisible();
    await page.getByRole('button', { name: 'Reset filters' }).last().click();
    await expect(page.getByText(/\d+ plans from Jupiter to Saturn/)).toBeVisible();
    await expect(page).not.toHaveURL(/maxLatencyMs/);
  });

  test('sorting any column orders the rows, and the choice is in the URL', async ({ page }) => {
    await openCompare(page);
    const ascending = await prices(page);
    expect(ascending).toEqual([...ascending].sort((a, b) => a - b));
    await page.getByRole('button', { name: 'Monthly cr' }).click();
    await expect(page).toHaveURL(/dir=desc/);
    // The URL changes a beat before the rows re-sort.
    await expect.poll(async () => (await prices(page))[0]).toBe(Math.max(...ascending));
    const descending = await prices(page);
    expect(descending).toEqual([...descending].sort((a, b) => b - a));

    await page.getByRole('button', { name: 'Hops' }).click();
    await expect(page).toHaveURL(/sort=hops/);
    const hopsCells = page.locator('table tbody tr:has(input[type=checkbox]) td:nth-child(13)');
    await expect.poll(async () => {
      const hops = (await hopsCells.allTextContents()).map(Number);
      return JSON.stringify(hops) === JSON.stringify([...hops].sort((a, b) => a - b));
    }).toBe(true);
  });

  test('three plans can be compared side by side, and no fourth', async ({ page }) => {
    await openCompare(page);
    const boxes = page.locator('table tbody input[type=checkbox]');
    // The choice lives in the URL, so a box ticks a beat after the click: click, then expect.
    for (const i of [0, 1, 2]) {
      await boxes.nth(i).click();
      await expect(boxes.nth(i)).toBeChecked();
    }
    await expect(boxes.nth(3)).toBeDisabled();
    await page.getByRole('button', { name: 'Compare 3 plans side by side' }).click();
    const dialog = page.getByRole('dialog', { name: 'Compare plans' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('columnheader')).toHaveCount(3); // one per plan
    await expect(dialog.getByRole('rowheader', { name: 'Monthly price' })).toBeVisible();
  });

  test('details break the price down, and the lines add up to the monthly total', async ({ page }) => {
    await openCompare(page);
    await offerRows(page).first().getByRole('button', { name: 'Details' }).click();
    const breakdown = page.getByRole('heading', { name: 'Price breakdown' }).locator('xpath=following-sibling::table');
    await expect(breakdown).toBeVisible();
    const credits = async (text: string) => Number(text.replace(/[^0-9-]/g, ''));
    const lines = await breakdown.locator('tbody tr').all();
    let sum = 0;
    let total = 0;
    for (const line of lines) {
      const label = (await line.locator('th, td').first().innerText()).trim();
      const value = await credits(await line.locator('td:last-child, th:last-child').last().innerText());
      if (label === 'Monthly total') total = value;
      else if (label !== 'One-time setup') sum += value;
    }
    expect(total).toBeGreaterThan(0);
    expect(sum).toBe(total);
    await expect(page.getByRole('heading', { name: 'Provider lineage' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Canon notes for both worlds' })).toBeVisible();
  });

  test('the route dialog opens, closes with Escape, and hands focus back', async ({ page }) => {
    await openCompare(page);
    const opener = offerRows(page).first().getByRole('button', { name: 'Route' });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: /^Route:/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('list', { name: 'Route segments' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('the inquiry form validates and submits', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'The API limits inquiries to 5 a minute, so one project submits.');
    await openCompare(page);
    await offerRows(page).first().getByRole('button', { name: 'Request' }).click();
    const dialog = page.getByRole('dialog', { name: 'Request this plan' });
    await expect(dialog).toContainText('nothing is sent to a provider');

    await dialog.getByRole('button', { name: 'Request this plan' }).click();
    await expect(dialog.getByLabel('Company name')).toBeFocused(); // blocked by validation, nothing sent
    await dialog.getByLabel('Company name').fill('Callisto Ore Partners');
    await dialog.getByLabel('Contact email').fill('not-an-email');
    await dialog.getByRole('button', { name: 'Request this plan' }).click();
    expect(await dialog.getByLabel('Contact email').evaluate((el: HTMLInputElement) => el.validity.typeMismatch)).toBe(true);

    await dialog.getByLabel('Contact email').fill('ops@example.com');
    await dialog.getByLabel('Expected traffic').fill('About 20 gigaquads a second at peak');
    await dialog.getByRole('button', { name: 'Request this plan' }).click();
    await expect(dialog.getByText('Request saved.')).toBeVisible();
    await expect(dialog).toContainText('This is a demo, so nothing is sent to any provider');
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).toBeHidden();
  });

  test('does not scroll sideways, and the table scrolls only sideways inside its frame', async ({ page }) => {
    await openCompare(page);
    await noSidewaysScroll(page);
    const frame = page.getByRole('region', { name: 'Plans, scrollable table' });
    const { clientHeight, scrollHeight } = await frame.evaluate((el) => ({ clientHeight: el.clientHeight, scrollHeight: el.scrollHeight }));
    expect(scrollHeight, 'the table has its own vertical scroll').toBeLessThanOrEqual(clientHeight + 1);
  });
});
