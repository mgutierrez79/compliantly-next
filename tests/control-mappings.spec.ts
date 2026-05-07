import { test, expect } from '@playwright/test'

const STORAGE_KEY = 'compliantly.ui.settings'
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000'

test('control mappings page is reachable', async ({ page }) => {
  const apiBaseUrl =
    process.env.E2E_API_BASE_URL ?? `${baseURL.replace(/\/$/, '')}/api`
  const tenantId = process.env.E2E_TENANT_ID ?? ''
  const apiKey = process.env.E2E_API_KEY ?? 'key-smoke'

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

  await page.goto('/control-mappings')
  await expect(page.getByRole('heading', { name: 'Control Mappings' })).toBeVisible()
})
