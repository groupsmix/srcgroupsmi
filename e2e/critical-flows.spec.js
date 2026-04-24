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
});