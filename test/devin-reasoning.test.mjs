import test from "node:test";
import assert from "node:assert/strict";
import { enrichDevinCatalog } from "../gateway/providers/discovery.mjs";
test("official labels identify unsuffixed SWE Max without inventing Low", () => {
  const ids = ["swe-1-7", "swe-1-7-lightning", "swe-1-7-lightning-medium"];
  const rows = enrichDevinCatalog(
    ids.map((selector) => ({ selector })),
    {
      families: [
        {
          variants: ids.map((model_uid, i) => ({
            model_uid,
            label: i === 2 ? "SWE-1.7 Lightning Medium" : "SWE-1.7 Max",
          })),
        },
      ],
    },
  );
  assert.deepEqual(
    rows.map((r) => r.capabilities.efforts),
    [["max"], ["max"], ["medium"]],
  );
});
test("conflicting UID and label efforts fail closed", () => {
  assert.throws(
    () =>
      enrichDevinCatalog([], {
        families: [
          { variants: [{ model_uid: "model-low", label: "Model Max" }] },
        ],
      }),
    /conflicting/,
  );
});

import {
  normalizeDiscovery,
  initialRegistry,
  mergeDiscovery,
} from "../gateway/core/registry.mjs";
import { resolveRoute } from "../gateway/core/routes.mjs";
import { combinedCatalog } from "../gateway/codex/catalog.mjs";
test("retained effort mappings survive discovery, catalog and request routing", () => {
  const families = [
    ["gpt-6-astra", ["low", "medium", "high", "xhigh", "max"]],
    ["gemini-3-8-flash", ["low", "medium", "high"]],
    ...["sol", "terra", "luna"].map((n) => [
      "gpt-5-6-" + n,
      ["none", "low", "medium", "high", "xhigh", "max"],
    ]),
    ["swe-2", ["medium", "high", "max"]],
    ["grok-4-6", ["low", "medium", "high", "xhigh"]],
    ["deepseek-v4-1-flash", ["high", "max"]],
    ["swe-1-7", ["medium", "max"]],
    ["swe-1-7-lightning", ["medium", "max"]],
  ];
  const variants = families.flatMap(([family, efforts]) =>
    efforts.map((effort) => ({
      model_uid:
        family +
        (family.startsWith("swe-1-7") && effort === "max" ? "" : "-" + effort),
      label: family + " " + effort[0].toUpperCase() + effort.slice(1),
      expected: effort,
    })),
  );
  const rows = enrichDevinCatalog(
    variants.map((v) => ({ selector: v.model_uid })),
    { families: [{ variants }] },
  );
  let registry = mergeDiscovery(
    initialRegistry(),
    "devin",
    normalizeDiscovery("devin", rows, { scope: "test" }),
    "test",
  );
  registry.models.forEach((m) => (m.enabled = true));
  registry.appliedModels = structuredClone(registry.models);
  const catalog = combinedCatalog(
    {
      models: [
        {
          slug: "native-model",
          visibility: "list",
          supported_in_api: false,
          context_window: 32768,
        },
      ],
    },
    registry,
  );
  for (const v of variants) {
    const m = registry.models.find((m) =>
      Object.values(m.selectors).includes(v.model_uid),
    );
    assert.ok(m);
    assert.equal(
      resolveRoute({ model: m.id, reasoning: { effort: v.expected } }, registry)
        .selector,
      v.model_uid,
    );
    assert.equal(
      resolveRoute({ model: v.model_uid }, registry).effort,
      v.expected,
    );
    assert.ok(
      catalog.models
        .find((c) => c.slug === m.id)
        .supported_reasoning_levels.some((e) => e.effort === v.expected),
    );
  }
  const deepseek = registry.models.find(
    (m) => m.upstream === "deepseek-v4-1-flash-high",
  );
  assert.throws(
    () =>
      resolveRoute(
        { model: deepseek.id, reasoning: { effort: "low" } },
        registry,
      ),
    /not supported/,
  );
});
