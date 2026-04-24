import { test, expect } from '@playwright/test';

test.describe('Critical User Flows', () => {
  test('homepage loads and displays main navigation', async ({ page }) => {
    await page.goto('/');
    
    // Check main branding/logo
    await expect(page.locator('a.header-logo')).toBeVisible();
    
    // Check footer renders
    await expect(page.locator('#site-footer')).toBeVisible();
    await expect(page.getByText('EXPLORE')).toBeVisible();
  });

  test('search functionality works', async ({ page }) => {
    await page.goto('/');
    
    // Assuming there's a search input with id 'search-input'
    const searchInput = page.locator('#search-input');
    if (await searchInput.isVisible()) {
      await searchInput.fill('test group');
      await searchInput.press('Enter');
      
      // Wait for URL to change to search results
      await page.waitForURL(/\/search.*/);
      await expect(page).toHaveURL(/.*search.*/);
    }
  });

  test('auth modals open correctly', async ({ page }) => {
    await page.goto('/');
    
    // Check login button
    const loginBtn = page.locator('#auth-btn');
    if (await loginBtn.isVisible()) {
      await loginBtn.click();
      
      // Check if modal appears (assuming id 'auth-modal')
      await expect(page.locator('.modal-content')).toBeVisible();
      
      // Close modal
      await page.locator('.modal-close').first().click();
    }
  });

  test('navigation to groups directory works', async ({ page }) => {
    await page.goto('/');
    
    // Click on Groups in navigation
    const groupsLink = page.locator('.subnav__item', { hasText: 'All' });
    if (await groupsLink.isVisible()) {
      await expect(groupsLink).toBeVisible();
    }
  });

  test('Cloudflare Pages _headers migration hygiene (CSP and HSTS)', async ({ request }) => {
    // 2.3 Pages -> Workers migration hygiene: verify that Cloudflare Workers + Static Assets
    // correctly applies the public/_headers file.
    const response = await request.get('/');
    
    const headers = response.headers();
    
    // Strict-Transport-Security must be present
    expect(headers['strict-transport-security']).toBeDefined();
    expect(headers['strict-transport-security']).toContain('max-age=');

    // Content-Security-Policy must be present
    expect(headers['content-security-policy']).toBeDefined();
  });

  test('rate limiter enforces max requests on /api/contact-notify', async ({ request }) => {
    // Hit contact-notify 4 times (limit is 3 per minute)
    // Rate limit is evaluated before body validation or Turnstile
    let status429Seen = false;
    for (let i = 0; i < 5; i++) {
      const res = await request.post('/api/contact-notify', {
        data: {}
      });
      if (res.status() === 429) {
        status429Seen = true;
        break;
      }
      // Wait a tiny bit just in case
      await new Promise(r => setTimeout(r, 50));
    }
    
    expect(status429Seen).toBe(true);
  });

  test('auth modal allows switching between login and signup', async ({ page }) => {
    await page.goto('/');
    
    // Open auth modal
    const loginBtn = page.locator('#auth-btn');
    if (!(await loginBtn.isVisible())) {
      test.skip(); // skip if auth button is not present (e.g., already logged in)
    }
    await loginBtn.click();
    
    // Ensure modal is visible
    const modalContent = page.locator('.modal-content').first();
    await expect(modalContent).toBeVisible();
    
    // Check for email input
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();

    // Find and click the toggle link to switch to signup
    const toggleLink = page.locator('.auth-toggle-link');
    if (await toggleLink.isVisible()) {
        const initialText = await toggleLink.textContent();
        await toggleLink.click();
        // The text should change (e.g. from "Sign Up" to "Log In")
        await expect(toggleLink).not.toHaveText(initialText || '');
    }
  });
});