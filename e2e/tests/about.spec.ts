import { expect, test } from '@playwright/test';
import { noSidewaysScroll } from './helpers';

test.describe('About page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/about');
    await expect(page.getByRole('heading', { name: 'About Planet2Planet' })).toBeVisible();
  });

  test('has every section the plan lists, reachable from the contents list', async ({ page }) => {
    const toc = page.getByRole('navigation', { name: 'On this page' });
    for (const name of ['Overview', 'History of the networks', 'The network today', 'How subspace works', 'Built for bad days', 'Sources and disclaimer']) {
      await expect(toc.getByRole('link', { name })).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: /Keeping a business connected across 33 worlds/ })).toBeVisible();
    await expect(page.getByText(/46 trading brands/)).toBeVisible();
    await toc.getByRole('link', { name: 'How subspace works' }).click();
    await expect(page.getByRole('heading', { name: 'How subspace works' })).toBeInViewport();
  });

  test('the timeline renders every era with events written out, and its filters change what is shown', async ({ page }) => {
    for (const era of ['Before subspace', 'Early subspace', 'Expansion', 'Mature market']) {
      await expect(page.getByRole('heading', { name: era, level: 3 })).toBeVisible();
    }
    await expect(page.getByText('First warp flight')).toBeVisible();
    await expect(page.getByText('Earth: network converted to subspace')).toBeVisible();
    const count = page.getByRole('status').filter({ hasText: /of 140 events/ });
    await expect(count).toHaveText('140 of 140 events');

    await page.getByRole('checkbox', { name: 'Companies' }).click();
    await expect(count).toHaveText(/^\d+ of 140 events$/);
    const afterCompanies = Number((await count.innerText()).split(' ')[0]);
    expect(afterCompanies).toBeLessThan(140);
    await expect(page.getByText(/ founded$/)).toHaveCount(0);

    await page.getByRole('checkbox', { name: 'Key milestones only' }).click();
    await expect.poll(async () => Number((await count.innerText()).split(' ')[0])).toBeLessThan(afterCompanies);
  });

  test('a crowded year collapses into +N events and expands on request', async ({ page }) => {
    const more = page.getByRole('button', { name: /^\+\d+ events?$/ }).first();
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await more.click();
    await expect(page.getByRole('button', { name: 'Show fewer' }).first()).toHaveAttribute('aria-expanded', 'true');
  });

  test('the timeline scrolls inside its own frame, never the page', async ({ page }) => {
    await noSidewaysScroll(page);
    await page.getByRole('button', { name: 'Mature market' }).click();
    await noSidewaysScroll(page);
  });

  test('the network map lights a chosen provider, shows its profile and keeps it in the URL', async ({ page }) => {
    const network = page.locator('#network');
    await network.scrollIntoViewIfNeeded();
    await network.getByPlaceholder('Search providers').fill('cassini');
    await network.getByRole('group', { name: 'Providers' }).getByRole('checkbox', { name: 'Cassini Link' }).click();
    await expect(page).toHaveURL(/provider=cassini-link/);
    const profile = network.getByRole('region', { name: 'Cassini Link profile' });
    await expect(profile).toContainText('Regional carrier');
    await expect(profile).toContainText('Titan');
    // A shared link restores the same view.
    await page.reload();
    await expect(network.getByRole('region', { name: 'Cassini Link profile' })).toBeVisible();
    await expect(network.getByRole('button', { name: 'Remove Cassini Link' })).toBeVisible();
  });

  test('every provider is also listed as a table, as the map’s text alternative', async ({ page }) => {
    const network = page.locator('#network');
    await network.getByText('Show the providers as a table').click();
    const table = network.getByRole('table', { name: 'Providers trading in 2380' });
    await expect(table.getByRole('row')).toHaveCount(47); // header + 46 brands
  });

  test('the subspace section has the worked examples and the comparison table', async ({ page }) => {
    const examples = page.getByRole('table', { name: /One-way delay from Earth/ });
    await expect(examples.getByRole('rowheader', { name: 'Earth to Eris' }).locator('xpath=..')).toContainText('hours');
    await expect(examples.getByRole('rowheader', { name: 'Earth to the Moon' }).locator('xpath=..')).toContainText('1.3 seconds');
    await expect(page.getByText('about 52,000 times the speed of light')).toBeVisible();
    await expect(page.getByRole('table').filter({ hasText: 'Needs a clear line of sight' })).toBeVisible();
  });

  test('the five redundancy tiers are explained, with the corrected canon', async ({ page }) => {
    const tiers = page.getByRole('table', { name: 'Redundancy tiers and the events behind them' });
    for (const tier of ['Standard', 'Diverse path', 'Hardened', 'Contingency', 'Terraforming-zone protection']) {
      await expect(tiers.getByRole('rowheader', { name: tier })).toBeVisible();
    }
    await expect(tiers).toContainText('Red Squad');
    await expect(tiers).not.toContainText('Changeling');
  });

  test('sources open in a new tab, and the page carries the fan disclaimer', async ({ page }) => {
    const sources = page.getByRole('list', { name: 'Sources' });
    const first = sources.getByRole('link').first();
    await expect(first).toHaveAttribute('target', '_blank');
    await expect(first).toHaveAttribute('rel', /noreferrer/);
    await expect(page.getByText(/unofficial fan work/).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Read how it was built' })).toHaveAttribute('href', '/canon');
  });
});
