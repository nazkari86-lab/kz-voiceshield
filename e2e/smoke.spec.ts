import { expect, test } from '@playwright/test'

test('loads and scores a transcript', async ({ page }) => {
  await page.goto('/')

  // textarea is present
  const textarea = page.locator('textarea')
  await expect(textarea).toBeVisible()

  // clear and type a scam transcript
  await textarea.fill('Это служба безопасности банка. Срочно назовите SMS код и переведите деньги на безопасный счет.')

  // risk badge must appear and not be "low"
  const badge = page.locator('[class*="risk-badge"], [class*="badge"]').first()
  await expect(badge).toBeVisible()
  const text = await badge.innerText()
  expect(['CRITICAL', 'HIGH', 'MEDIUM']).toContain(text.toUpperCase().trim())
})

test('safe text stays at low risk', async ({ page }) => {
  await page.goto('/')

  const textarea = page.locator('textarea')
  await textarea.fill('Здравствуйте, я хочу узнать график работы офиса.')

  const badge = page.locator('[class*="risk-badge"], [class*="badge"]').first()
  await expect(badge).toBeVisible()
  const text = await badge.innerText()
  expect(text.toUpperCase().trim()).toBe('LOW RISK')
})

test('sample button loads a transcript', async ({ page }) => {
  await page.goto('/')

  // click the first sample button in the sample row
  const sampleBtn = page.locator('.sample-row button').first()
  await expect(sampleBtn).toBeVisible()
  await sampleBtn.click()

  const textarea = page.locator('textarea')
  const value = await textarea.inputValue()
  expect(value.length).toBeGreaterThan(10)
})
