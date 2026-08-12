/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `translate` command */
  export type Translate = ExtensionPreferences & {}
  /** Preferences accessible in the `proofread-russian` command */
  export type ProofreadRussian = ExtensionPreferences & {}
  /** Preferences accessible in the `ping` command */
  export type Ping = ExtensionPreferences & {
  /** Remote endpoint - HTTPS endpoint used to distinguish a remote-server issue from a general internet issue */
  "remoteEndpoint": string
}
}

declare namespace Arguments {
  /** Arguments passed to the `translate` command */
  export type Translate = {}
  /** Arguments passed to the `proofread-russian` command */
  export type ProofreadRussian = {}
  /** Arguments passed to the `ping` command */
  export type Ping = {}
}
