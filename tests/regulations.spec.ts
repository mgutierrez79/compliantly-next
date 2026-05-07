import { test, expect } from '@playwright/test'

const STORAGE_KEY = 'compliantly.ui.settings'
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000'

test('regulations list includes gxp', async ({ page }) => {
  const apiBaseUrl =
    process.env.E2E_API_BASE_URL ?? `${baseURL.replace(/\/$/, '')}/api`
  const tenantId = process.env.E2E_TENANT_ID ?? ''
  const apiKey = process.env.E2E_API_KEY ?? 'key-smoke'

  await page.route(/\/api\/v1\/analytics\/frameworks$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(['gxp']),
    })
  })

  await page.route(/\/api\/v1\/config\/frameworks$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        available: ['gxp'],
        frameworks: [{ key: 'gxp', name: 'GxP', version: '2026' }],
        enabled: ['gxp'],
        configured: ['gxp'],
        all_enabled: true,
        source: 'e2e',
      }),
    })
  })

  await page.route(/\/api\/v1\/policies\/gxp\/raw\?variant=[^&]+$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        key: 'gxp',
        variant: 'framework',
        path: 'policies/gxp/framework.yaml',
        source_hash: 'e2e',
        content: 'framework: GxP\n',
      }),
    })
  })

  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value)
    },
    {
      key: STORAGE_KEY,
      value: JSON.stringify({
        apiBaseUrl,
        tenantId,
        authMode: apiKey ? 'apiKey' : 'apiKey',
        apiKey,
        localToken: '',
        oidcIssuer: '',
        oidcClientId: '',
        oidcScope: 'openid profile email',
        oidcAudience: '',
      }),
    },
  )

  await page.goto('/regulations')
  await expect(page.getByRole('heading', { name: 'Regulations' })).toBeVisible()
  await expect(page.getByText('Regulation selection')).toBeVisible()
  await expect(page.getByText(/gxp/i)).toBeVisible()

  const gxpCard = page.locator('div.bg-slate-900\\/50', { hasText: 'GxP (gxp)' }).first()
  await gxpCard.getByRole('button', { name: 'Show details' }).click()
  await expect(gxpCard.getByRole('textbox')).toHaveValue(/framework: GxP/)
})
