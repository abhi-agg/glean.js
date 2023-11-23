/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { DEFAULT_TELEMETRY_ENDPOINT, GLEAN_MAX_SOURCE_TAGS } from "./constants.js";
import { validateHeader, validateURL } from "./utils.js";
import type Uploader from "./upload/uploader.js";
import log, { LoggingLevel } from "./log.js";
import { Context } from "./context.js";

const LOG_TAG = "core.Config";

// By default we want to send the events ping after every event is recorded. Unless the user
// explicitly sets a higher value, we will send the events ping after every event.
const DEFAULT_MAX_EVENTS = 1;

/**
 * Lists Glean's debug options.
 */
export interface DebugOptions {
  // Whether or not lot log pings when they are collected.
  logPings?: boolean;
  // The value of the X-Debug-ID header to be included in every ping.
  debugViewTag?: string;
  // The value of the X-Source-Tags header to be included in every ping.
  sourceTags?: string[];
}

/**
 * Describes how to configure Glean.
 */
export interface ConfigurationInterface {
  // Application release channel (e.g. "beta" or "nightly").
  readonly channel?: string,
  // The build identifier generated by the CI system (e.g. "1234/A").
  readonly appBuild?: string,
  // The user visible version string for the application running Glean.js.
  readonly appDisplayVersion?: string,
  // The server pings are sent to.
  readonly serverEndpoint?: string,
  // The maximum number of events to store before submitting the events ping.
  readonly maxEvents?: number,
  // The HTTP client implementation to use for uploading pings.
  httpClient?: Uploader,
  // The build date, provided by glean_parser
  readonly buildDate?: Date,
  // Migrate from legacy storage (IndexedDB) to the new one (LocalStorage).
  // This should only be true for older projects that have existing data in IndexedDB.
  readonly migrateFromLegacyStorage?: boolean,
  // Allow the client to explicitly specify whether they want page load events to be
  // collected automatically.
  readonly enableAutoPageLoadEvents?: boolean,
}

// Important: the `Configuration` should only be used internally by the Glean singleton.
export class Configuration implements ConfigurationInterface {
  readonly channel?: string;
  readonly appBuild?: string;
  readonly appDisplayVersion?: string;
  readonly serverEndpoint: string;
  readonly buildDate?: Date;
  readonly maxEvents: number;
  readonly migrateFromLegacyStorage?: boolean;
  readonly enableAutoPageLoadEvents?: boolean;

  // Debug configuration.
  debug: DebugOptions;
  // The HTTP client implementation to use for uploading pings.
  httpClient?: Uploader;

  constructor(config?: ConfigurationInterface) {
    this.channel = config?.channel;
    this.appBuild = config?.appBuild;
    this.appDisplayVersion = config?.appDisplayVersion;
    this.buildDate = config?.buildDate;
    this.maxEvents = config?.maxEvents || DEFAULT_MAX_EVENTS;
    this.migrateFromLegacyStorage = config?.migrateFromLegacyStorage;
    this.enableAutoPageLoadEvents = config?.enableAutoPageLoadEvents;

    this.debug = {};

    if (config?.serverEndpoint && !validateURL(config.serverEndpoint)) {
      throw new Error(
        `Unable to initialize Glean, serverEndpoint ${config.serverEndpoint} is an invalid URL.`);
    }

    if (!Context.testing && config?.serverEndpoint?.startsWith("http:")) {
      throw new Error(
        `Unable to initialize Glean, serverEndpoint ${config.serverEndpoint} must use the HTTPS protocol.`);
    }

    this.serverEndpoint = (config && config.serverEndpoint)
      ? config.serverEndpoint : DEFAULT_TELEMETRY_ENDPOINT;

    this.httpClient = config?.httpClient;
  }

  get logPings(): boolean {
    return this.debug.logPings || false;
  }

  set logPings(flag: boolean) {
    this.debug.logPings = flag;
  }

  get debugViewTag(): string | undefined {
    return this.debug.debugViewTag;
  }

  set debugViewTag(tag: string | undefined) {
    if (!validateHeader(tag || "")) {
      log(
        LOG_TAG,
        [
          `"${tag || ""}" is not a valid \`debugViewTag\` value.`,
          "Please make sure the value passed satisfies the regex `^[a-zA-Z0-9-]{1,20}$`."
        ],
        LoggingLevel.Error
      );

      return;
    }

    this.debug.debugViewTag = tag;
  }

  get sourceTags(): string[] | undefined {
    return this.debug.sourceTags;
  }

  set sourceTags(tags: string[] | undefined) {
    if (!tags || tags.length < 1 || tags.length > GLEAN_MAX_SOURCE_TAGS) {
      log(
        LOG_TAG,
        `A list of tags cannot contain more than ${GLEAN_MAX_SOURCE_TAGS} elements or less than one.`,
        LoggingLevel.Error
      );
      return;
    }

    for (const tag of tags) {
      if (tag.startsWith("glean")) {
        log(
          LOG_TAG,
          "Tags starting with `glean` are reserved and must not be used.",
          LoggingLevel.Error
        );
        return;
      }

      if (!validateHeader(tag)) {
        return;
      }
    }

    this.debug.sourceTags = tags;
  }
}
