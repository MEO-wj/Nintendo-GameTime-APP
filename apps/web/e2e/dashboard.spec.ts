import { expect, test } from "@playwright/test";

test("dashboard flow with mocked backend", async ({ page }) => {
  await page.route("**/api/auth/login", async (route) => {
    const body = route.request().postDataJSON() as { email: string; code?: string };
    if (body.code) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          token: "mock-token",
          user: { id: "u1", email: body.email }
        })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "OTP generated", devCode: "123456" })
    });
  });

  await page.route("**/api/dashboard/summary", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        totalGames: 3,
        totalMinutes: 2400,
        totalPriceJpy: 18000,
        recent30Minutes: 360,
        lastSyncAt: "2026-03-10T00:00:00.000Z",
        dataSource: { official: 2, corrected: 1, "manual-only": 0 }
      })
    });
  });

  await page.route("**/api/dashboard/charts?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        donut: [
          { name: "Zelda", value: 1200, gameId: "g1" },
          { name: "Mario", value: 700, gameId: "g2" },
          { name: "Dead Cells", value: 500, gameId: "g3" }
        ],
        ranking: [
          { gameId: "g1", name: "Zelda", minutes: 1200 },
          { gameId: "g2", name: "Mario", minutes: 700 },
          { gameId: "g3", name: "Dead Cells", minutes: 500 }
        ]
      })
    });
  });

  await page.route("**/api/games?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: "g1",
            title: "The Legend of Zelda",
            coverUrl: null,
            ownedAt: "2026-01-01T00:00:00.000Z",
            lastPlayedAt: "2026-03-09T00:00:00.000Z",
            priceJpy: 7000,
            effectivePlaytime: {
              totalMinutes: 1200,
              source: "official"
            }
          }
        ]
      })
    });
  });

  await page.route("**/api/playtime/corrections", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          correction: {
            id: "c1",
            gameId: "g1",
            type: "ADD_DELTA",
            minutes: 60,
            reason: "manual",
            createdAt: "2026-03-10T00:00:00.000Z",
            revokedAt: null
          },
          effectivePlaytime: {
            gameId: "g1",
            officialMinutes: 1200,
            correctionDeltaMinutes: 60,
            totalMinutes: 1260,
            source: "corrected",
            updatedAt: "2026-03-10T00:00:00.000Z"
          }
        })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: []
      })
    });
  });

  await page.route("**/api/sync/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: {
          status: "SUCCESS",
          startedAt: "2026-03-10T00:00:00.000Z",
          finishedAt: "2026-03-10T00:00:03.000Z",
          errorSummary: null
        }
      })
    });
  });

  await page.route("**/api/accounts/nintendo/bind", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        account: { id: "a1", userId: "u1", region: "JP", lastSyncAt: "2026-03-10T00:00:00.000Z" },
        sync: { status: "SUCCESS", syncedGames: 3 }
      })
    });
  });

  await page.route("**/api/sync/run", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        syncJob: { status: "SUCCESS" },
        syncedGames: 3
      })
    });
  });

  await page.goto("/");

  await page.getByLabel("Email").fill("test@example.com");
  await page.getByRole("button", { name: "Request OTP" }).click();
  await page.getByLabel("OTP Code").fill("123456");
  await page.getByRole("button", { name: "Login" }).click();

  await expect(page.getByText("Nintendo GameTime Dashboard")).toBeVisible();
  await expect(page.getByText("Total Games")).toBeVisible();
  await expect(page.getByText("Manual Correction Ledger")).toBeVisible();
});
