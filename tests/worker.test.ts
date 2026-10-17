import { it, expect, vi, afterEach } from "vitest";
import worker from "../worker/src/index";
const env = {
  SUPABASE_URL: "https://twtldgdceidyurinrvsy.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "public-test",
  ALLOWED_ORIGIN: "http://127.0.0.1:5173",
};
afterEach(() => vi.unstubAllGlobals());
it("reports integration state honestly with no secrets", async () => {
  const response = await worker.fetch(
    new Request("http://localhost/health"),
    env,
  );
  const data = (await response.json()) as {
    invitesConfigured: boolean;
    mercadoLivre: { connected: boolean };
  };
  expect(data.invitesConfigured).toBe(false);
  expect(data.mercadoLivre.connected).toBe(false);
});
it("rejects unauthenticated and cross-origin invitations", async () => {
  expect(
    (
      await worker.fetch(
        new Request("http://localhost/employees/invite", {
          method: "POST",
          headers: { Origin: env.ALLOWED_ORIGIN },
        }),
        env,
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await worker.fetch(
        new Request("http://localhost/employees/invite", {
          method: "POST",
          headers: { Origin: "https://evil.test" },
        }),
        env,
      )
    ).status,
  ).toBe(403);
});
it("refuses an invalid Supabase endpoint", async () => {
  expect(
    (
      await worker.fetch(new Request("http://localhost/health"), {
        ...env,
        SUPABASE_URL: "https://other.example.com",
      })
    ).status,
  ).toBe(503);
});
it("requires a verified current administrator before privileged work", async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ id: "user", email: "a@test.com" }), {
      headers: { "Content-Type": "application/json" },
    }),
  );
  fetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ id: "user", email: "a@test.com" }), {
      headers: { "Content-Type": "application/json" },
    }),
  );
  fetch.mockResolvedValueOnce(
    new Response(
      JSON.stringify([{ workspace_id: "w", role: "operator", active: true }]),
      { headers: { "Content-Type": "application/json" } },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  const response = await worker.fetch(
    new Request("http://localhost/employees/invite", {
      method: "POST",
      headers: {
        Origin: env.ALLOWED_ORIGIN,
        Authorization: "Bearer invalid.test.token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "b@test.com", name: "B", role: "admin" }),
    }),
    { ...env, SUPABASE_SECRET_KEY: "private-test" },
  );
  expect(response.status).toBe(403);
  expect(fetch).toHaveBeenCalledTimes(2);
});
