import { expect, test } from "@playwright/test";

test("licensing mutations reject cross-origin requests", async ({ request }) => {
  const response = await request.post(
    "/api/licensing/pathways/pathway-id/enroll",
    {
      headers: { origin: "https://attacker.example" },
    },
  );

  expect(response.status()).toBe(403);
});
