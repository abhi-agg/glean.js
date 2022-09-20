/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import assert from "assert";
import { Context } from "../../../../src/core/context";
import { ErrorType } from "../../../../src/core/error/error_type";

import Glean from "../../../../src/core/glean";
import { Lifetime } from "../../../../src/core/metrics/lifetime";
import UrlMetricType from "../../../../src/core/metrics/types/url";
import { testResetGlean } from "../../../../src/core/testing";

describe("UrlMetric", function() {
  const testAppId = `gleanjs.test.${this.title}`;

  beforeEach(async function() {
    await testResetGlean(testAppId);
  });

  it("attempting to get the value of a metric that hasn't been recorded doesn't error", async function() {
    const metric = new UrlMetricType({
      category: "aCategory",
      name: "aUrlMetric",
      sendInPings: ["aPing", "twoPing", "threePing"],
      lifetime: Lifetime.Ping,
      disabled: false
    });

    assert.strictEqual(await metric.testGetValue("aPing"), undefined);
  });

  it("attempting to set when glean upload is disabled is a no-op", async function() {
    Glean.setUploadEnabled(false);

    const metric = new UrlMetricType({
      category: "aCategory",
      name: "aUrlMetric",
      sendInPings: ["aPing", "twoPing", "threePing"],
      lifetime: Lifetime.Ping,
      disabled: false
    });

    metric.set("glean://test");
    assert.strictEqual(await metric.testGetValue("aPing"), undefined);
  });

  it("ping payload is correct", async function() {
    const metric = new UrlMetricType({
      category: "aCategory",
      name: "aUrlMetric",
      sendInPings: ["aPing"],
      lifetime: Lifetime.Ping,
      disabled: false
    });

    metric.set("glean://test");
    assert.strictEqual(await metric.testGetValue("aPing"), "glean://test");

    const snapshot = await Context.metricsDatabase.getPingMetrics("aPing", true);
    assert.deepStrictEqual(snapshot, {
      "url": {
        "aCategory.aUrlMetric": "glean://test"
      }
    });
  });

  it("payload is URI encoded", async function () {
    const metric = new UrlMetricType({
      category: "aCategory",
      name: "aUrlMetric",
      sendInPings: ["aPing"],
      lifetime: Lifetime.Ping,
      disabled: false
    });

    metric.set("https://mozilla.org/?x=шеллы");
    assert.strictEqual(await metric.testGetValue("aPing"), "https://mozilla.org/?x=шеллы");

    const snapshot = await Context.metricsDatabase.getPingMetrics("aPing", true);
    assert.deepStrictEqual(snapshot, {
      "url": {
        "aCategory.aUrlMetric": "https://mozilla.org/?x=шеллы"
      }
    });
  });

  it("set properly sets the value in all pings", async function() {
    const metric = new UrlMetricType({
      category: "aCategory",
      name: "aUrlMetric",
      sendInPings: ["aPing", "twoPing", "threePing"],
      lifetime: Lifetime.Ping,
      disabled: false
    });

    metric.set("glean://test");
    assert.strictEqual(await metric.testGetValue("aPing"), "glean://test");
    assert.strictEqual(await metric.testGetValue("twoPing"), "glean://test");
    assert.strictEqual(await metric.testGetValue("threePing"), "glean://test");
  });

  it("setUrl properly sets the value in all pings", async function() {
    const metric = new UrlMetricType({
      category: "aCategory",
      name: "aUrlMetric",
      sendInPings: ["aPing", "twoPing", "threePing"],
      lifetime: Lifetime.Ping,
      disabled: false
    });

    metric.setUrl(new URL("glean://test"));
    assert.strictEqual(await metric.testGetValue("aPing"), "glean://test");
    assert.strictEqual(await metric.testGetValue("twoPing"), "glean://test");
    assert.strictEqual(await metric.testGetValue("threePing"), "glean://test");
  });

  it("records truncated URL and errors when URL exceeds MAX_URL_LENGTH", async function () {
    const metric = new UrlMetricType({
      category: "aCategory",
      name: "aUrlMetric",
      sendInPings: ["aPing"],
      lifetime: Lifetime.Ping,
      disabled: false,
    });

    // Whenever the URL is longer than our MAX_URL_LENGTH, we truncate the URL to the
    // MAX_URL_LENGTH.
    //
    // This 8-character string was chosen so we could have an even number that is
    // a divisor of our MAX_URL_LENGTH.
    const longPathBase = "abcdefgh";

    // Using 2000 creates a string > 16000 characters, well over MAX_URL_LENGTH.
    const testUrl = `glean://${longPathBase.repeat(2000)}`;
    metric.set(testUrl);
    metric.setUrl(new URL(testUrl));

    // "glean://" is 8 characters
    // "abcdefgh" (longPathBase) is 8 characters
    // `longPathBase` is repeated 1023 times (8184)
    // 8 + 8184 = 8192 (MAX_URL_LENGTH)
    const expected = `glean://${longPathBase.repeat(1023)}`;

    assert.strictEqual(await metric.testGetValue("aPing"), expected);

    // This count is 2 because we test both `set` and `setUrl`.
    assert.strictEqual(await metric.testGetNumRecordedErrors(ErrorType.InvalidOverflow), 2);
  });

  it("does not record data URLs and records errors", async function () {
    const metric = new UrlMetricType({
      category: "aCategory",
      name: "aUrlMetric",
      sendInPings: ["aPing"],
      lifetime: Lifetime.Ping,
      disabled: false
    });

    metric.set("data:application/json");
    metric.setUrl(new URL("data:application/json"));

    assert.strictEqual(await metric.testGetValue("aPing"), undefined);
    assert.strictEqual(
      await metric.testGetNumRecordedErrors(ErrorType.InvalidValue), 2
    );
  });

  it("url schema validation works as designed and records errors", async function () {
    const metric = new UrlMetricType({
      category: "aCategory",
      name: "aUrlMetric",
      sendInPings: ["aPing"],
      lifetime: Lifetime.Ping,
      disabled: false
    });

    const incorrects = [
      "",
      // Scheme may only start with upper or lowercase ASCII alpha[^1] character.
      // [1]: https://infra.spec.whatwg.org/#ascii-alpha
      "1glean://test",
      "-glean://test",
      // Scheme may only have ASCII alphanumeric characters or the `-`, `.`, `+` characters.
      "шеллы://test",
      "g!lean://test",
      "g=lean://test",
      // Scheme must be followed by `:` character.
      "glean//test",
    ];

    const corrects = [
      // The minimum URL
      "g:",
      // Empty body is fine
      "glean://",
      // "//" is actually not even necessary
      "glean:",
      "glean:test",
      "glean:test.com",
      // Scheme may only have ASCII alphanumeric characters or the `-`, `.`, `+` characters.
      "g-lean://test",
      "g+lean://test",
      "g.lean://test",
      // Query parameters are fine
      "glean://test?hello=world",
      // Finally, some actual real world URLs
      "https://infra.spec.whatwg.org/#ascii-alpha",
      "https://infra.spec.whatwg.org/#ascii-alpha?test=for-glean"
    ];

    for (const incorrect of incorrects) {
      metric.set(incorrect);
      assert.strictEqual(await metric.testGetValue("aPing"), undefined);
    }
    assert.strictEqual(
      await metric.testGetNumRecordedErrors(ErrorType.InvalidValue), incorrects.length
    );


    for (const correct of corrects) {
      metric.set(correct);
      assert.strictEqual(await metric.testGetValue("aPing"), correct);
    }
  });

  it("attempting to record a value of incorrect type records an error", async function () {
    const metric = new UrlMetricType({
      category: "aCategory",
      name: "aUrlMetric",
      sendInPings: ["aPing"],
      lifetime: Lifetime.Ping,
      disabled: false
    });

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    metric.set({ "not": "string" });

    assert.strictEqual(await metric.testGetNumRecordedErrors(ErrorType.InvalidType), 1);
    assert.strictEqual(await metric.testGetValue(), undefined);
  });
});
