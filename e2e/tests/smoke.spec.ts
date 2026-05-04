import { expect, test, type Page } from "@playwright/test";

const loginEmail = process.env.E2E_LOGIN_EMAIL?.trim();
const loginPassword = process.env.E2E_LOGIN_PASSWORD?.trim();
const loginOtp = process.env.E2E_LOGIN_OTP?.trim();

async function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return () => errors;
}

async function signIn(page: Page) {
  if (!loginEmail || !loginPassword) {
    throw new Error("E2E_LOGIN_EMAIL and E2E_LOGIN_PASSWORD must be set for authenticated flows");
  }
  await page.goto("/login");
  await page.getByPlaceholder("البريد الإلكتروني").fill(loginEmail);
  await page.getByPlaceholder("كلمة المرور").fill(loginPassword);
  await page.getByRole("button", { name: "الدخول إلى لوحة القيادة" }).click();

  if (loginOtp) {
    const otpField = page.getByPlaceholder("رمز OTP (6 أرقام)");
    await otpField.waitFor({ state: "visible", timeout: 10_000 });
    await otpField.fill(loginOtp);
    await page.getByRole("button", { name: "تأكيد OTP والدخول" }).click();
  }

  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}

test.describe("Public shell", () => {
  test("login page renders the form", async ({ page }) => {
    const errors = await collectConsoleErrors(page);
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
    await expect(page.getByPlaceholder("البريد الإلكتروني")).toBeVisible();
    await expect(page.getByPlaceholder("كلمة المرور")).toBeVisible();
    expect(errors()).toEqual([]);
  });

  test("protected route redirects unauthenticated users to /login", async ({ page }) => {
    const response = await page.goto("/dashboard");
    expect(response?.status()).toBeLessThan(500);
    await expect(page).toHaveURL(/\/login($|\?)/);
  });
});

test.describe("Authenticated shell", () => {
  test.skip(!loginEmail || !loginPassword, "set E2E_LOGIN_EMAIL / E2E_LOGIN_PASSWORD to enable");

  test("nurse dashboard loads without runtime errors", async ({ page }) => {
    const errors = await collectConsoleErrors(page);
    await signIn(page);
    await expect(page).toHaveURL(/\/dashboard($|\?)/);
    await page.waitForLoadState("networkidle");
    expect(errors()).toEqual([]);
  });

  test("appointments page loads without runtime errors", async ({ page }) => {
    const errors = await collectConsoleErrors(page);
    await signIn(page);
    await page.goto("/appointments");
    await expect(page).toHaveURL(/\/appointments($|\?)/);
    await page.waitForLoadState("networkidle");
    expect(errors()).toEqual([]);
  });
});
