import { expect, test } from '@playwright/test';
import { chooseSort, hopCounts, noSidewaysScroll, offerRows, openCompare, prices, reverseSort, showsCards } from './helpers';

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
    // Every remaining plan is Dedicated: a table cell, or a line on a card.
    const rows = await offerRows(page).allInnerTexts();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row).toMatch(/Dedicated/);
    expect(rows.some((row) => /\bShared\b/.test(row))).toBe(false);
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
    await reverseSort(page, 'Monthly cr');
    await expect(page).toHaveURL(/dir=desc/);
    // The URL changes a beat before the rows re-sort.
    await expect.poll(async () => (await prices(page))[0]).toBe(Math.max(...ascending));
    const descending = await prices(page);
    expect(descending).toEqual([...descending].sort((a, b) => b - a));

    await chooseSort(page, { header: 'Hops', option: 'hops' });
    await expect(page).toHaveURL(/sort=hops/);
    await expect.poll(async () => {
      const hops = await hopCounts(page);
      return JSON.stringify(hops) === JSON.stringify([...hops].sort((a, b) => a - b));
    }).toBe(true);
  });

  test('three plans can be compared side by side, and no fourth', async ({ page }) => {
    await openCompare(page);
    const boxes = offerRows(page).getByRole('checkbox');
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

  test('does not scroll sideways, and the table scrolls only sideways inside its frame', async ({ page }) => {
    await openCompare(page);
    await noSidewaysScroll(page);
    if (await showsCards(page)) return; // cards have no scrolling frame; the page just gets longer
    const frame = page.getByRole('region', { name: 'Plans, scrollable table' });
    const { clientHeight, scrollHeight } = await frame.evaluate((el) => ({ clientHeight: el.clientHeight, scrollHeight: el.scrollHeight }));
    expect(scrollHeight, 'the table has its own vertical scroll').toBeLessThanOrEqual(clientHeight + 1);
  });

  test('on a narrow screen each plan is a card, with a "Sort by" select above the list', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone' && info.project.name !== 'webkit-phone', 'Cards are for narrow viewports.');
    await openCompare(page);
    await expect(page.getByRole('table')).toHaveCount(0);
    const list = page.getByRole('list', { name: 'Plans' });
    expect(await list.getByRole('listitem').count()).toBeGreaterThan(20);
    const first = list.getByRole('listitem').first();
    await expect(first.getByRole('heading')).toBeVisible();
    for (const button of ['Route', 'Details']) await expect(first.getByRole('button', { name: button })).toBeVisible();
    await noSidewaysScroll(page);

    const select = page.getByRole('combobox', { name: 'Sort by' });
    await expect(select).toHaveValue('price');
    const sortBox = await select.boundingBox();
    const listBox = await list.boundingBox();
    expect(sortBox!.y).toBeLessThan(listBox!.y);

    await select.selectOption('latency');
    await expect(page).toHaveURL(/sort=latency/);
    await expect(page.getByRole('button', { name: 'Lowest first' })).toBeVisible();
    await page.getByRole('button', { name: 'Lowest first' }).click();
    await expect(page).toHaveURL(/dir=desc/);
    await expect(page.getByRole('button', { name: 'Highest first' })).toBeVisible();
  });
});
