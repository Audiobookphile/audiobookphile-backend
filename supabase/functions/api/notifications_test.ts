import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Hono } from "hono";
import { Variables } from "./_shared/types.ts";
import {
  dispatchLibraryNotification,
  notificationsRouter,
} from "./routes/notifications.ts";
import { mountRouter } from "./_shared/router.ts";

function createTestApp(role = "admin") {
  const app = new Hono<{ Variables: Variables }>();
  app.use("*", async (c, next) => {
    c.set("user", {
      id: "test-user-id",
      username: "admin_test",
      type: role,
      email: "admin@example.com",
      permissions: {
        download: true,
        update: true,
        delete: true,
        upload: true,
        accessAllLibraries: true,
        accessAllTags: true,
        accessExplicitContent: true,
      },
      librariesAccessible: [],
      itemTagsAccessible: [],
    });
    await next();
  });
  mountRouter(app, "/api", notificationsRouter);
  return app;
}

Deno.test("Notifications API - requires admin role", async () => {
  const memberApp = createTestApp("member");
  const res = await memberApp.request("/api/notifications");
  assertEquals(res.status, 403);
});

Deno.test("Notifications API - list targets returns configured webhooks", async () => {
  const adminApp = createTestApp("admin");
  const res = await adminApp.request("/api/notifications");
  assertEquals(res.status, 200);

  const json = await res.json();
  assertExists(json.notifications);
  assertEquals(Array.isArray(json.notifications), true);
  assertEquals(json.notifications.length >= 1, true);
  assertEquals(json.notifications[0].events.includes("onItemAdded"), true);
});

Deno.test("Notifications API - create, update, and delete target lifecycle", async () => {
  const adminApp = createTestApp("admin");

  // 1. Create target
  const createRes = await adminApp.request("/api/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Custom Discord Hook",
      url: "https://discord.com/api/webhooks/test/123",
      events: ["onItemAdded", "onUserLogin"],
      enabled: true,
    }),
  });
  assertEquals(createRes.status, 200);
  const createdJson = await createRes.json();
  assertExists(createdJson.notification);
  const targetId = createdJson.notification.id;
  assertEquals(createdJson.notification.name, "Custom Discord Hook");
  assertEquals(createdJson.notification.events, ["onItemAdded", "onUserLogin"]);

  // 2. Update target
  const updateRes = await adminApp.request(`/api/notifications/${targetId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Updated Discord Hook",
      events: ["onItemAdded", "onItemDeleted"],
    }),
  });
  assertEquals(updateRes.status, 200);
  const updatedJson = await updateRes.json();
  assertEquals(updatedJson.notification.name, "Updated Discord Hook");
  assertEquals(updatedJson.notification.events, [
    "onItemAdded",
    "onItemDeleted",
  ]);

  // 3. Delete target
  const deleteRes = await adminApp.request(`/api/notifications/${targetId}`, {
    method: "DELETE",
  });
  assertEquals(deleteRes.status, 200);
  const deletedJson = await deleteRes.json();
  assertEquals(deletedJson.success, true);

  // 4. Verify 404 after deletion
  const verifyRes = await adminApp.request(`/api/notifications/${targetId}`, {
    method: "DELETE",
  });
  assertEquals(verifyRes.status, 404);
});

Deno.test("Notifications API - test webhook delivery returns latency and event", async () => {
  const adminApp = createTestApp("admin");
  const testRes = await adminApp.request("/api/notifications/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://example.com/api/test-webhook",
    }),
  });
  assertEquals(testRes.status, 200);
  const json = await testRes.json();
  assertEquals(json.success, true);
  assertEquals(json.event, "onTest");
  assertExists(json.latencyMs);
});

Deno.test("Notifications API - dispatchLibraryNotification executes safely", async () => {
  const result = await dispatchLibraryNotification("onItemAdded", {
    libraryItemId: "item-123",
    title: "Project Hail Mary",
    author: "Andy Weir",
  });
  assertExists(result);
  assertEquals(typeof result.dispatched, "number");
  assertEquals(typeof result.failed, "number");
});
