/**********************************************************************************
 * MIT License                                                                    *
 *                                                                                *
 * Copyright (c) 2021 Hyperjump Technology                                        *
 *                                                                                *
 * Permission is hereby granted, free of charge, to any person obtaining a copy   *
 * of this software and associated documentation files (the "Software"), to deal  *
 * in the Software without restriction, including without limitation the rights   *
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell      *
 * copies of the Software, and to permit persons to whom the Software is          *
 * furnished to do so, subject to the following conditions:                       *
 *                                                                                *
 * The above copyright notice and this permission notice shall be included in all *
 * copies or substantial portions of the Software.                                *
 *                                                                                *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR     *
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,       *
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE    *
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER         *
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,  *
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE  *
 * SOFTWARE.                                                                      *
 **********************************************************************************/

import { Flags } from '@oclif/core'

import { getDefaultConfig } from './context/monika-flags'

export enum SYMON_API_VERSION {
  'v1' = 'v1',
  'v2' = 'v2',
}

export type MonikaFlags = {
  'auto-update'?: string
  config: string[]
  'config-filename': string
  'config-interval': number
  'create-config': boolean
  flush: boolean
  'follow-redirects': number
  force: boolean
  har?: string
  id?: string
  insomnia?: string
  json?: boolean
  'keep-verbose-logs': boolean
  logs: boolean
  'one-probe': boolean
  output?: string
  postman?: string
  prometheus?: number
  repeat: number
  retryInitialDelayMs: number
  retryMaxDelayMs: number
  sitemap?: string
  'status-notification'?: string
  stun: number
  summary: boolean
  'symon-api-version'?: SYMON_API_VERSION
  symonKey?: string
  symonLocationId?: string
  symonMonikaId?: string
  symonReportInterval?: number
  symonReportLimit?: number
  symonUrl?: string
  text?: string
  verbose: boolean
  version: void
}

export const monikaFlagsDefaultValue: MonikaFlags = {
  config: getDefaultConfig(),
  'config-filename': 'monika.yml',
  'config-interval': 900,
  'create-config': false,
  flush: false,
  'follow-redirects': 21,
  force: false,
  'keep-verbose-logs': false,
  logs: false,
  'one-probe': false,
  repeat: 0,
  retryInitialDelayMs: 128,
  retryMaxDelayMs: 30_000,
  // default is 20s interval lookup
  stun: 20,
  summary: false,
  verbose: false,
  version: undefined,
}

export const symonAPIVersion = Flags.custom<SYMON_API_VERSION>({
  default: SYMON_API_VERSION.v1,
  description:
    'Symon API version to use. Available options: v1, v2. Default: v1',
  options: [SYMON_API_VERSION.v1, SYMON_API_VERSION.v2],
})

export const retryInitialDelayMs = Flags.integer({
  default: 128,
  description:
    'The initial, first delay of the backoff retry when probe request is failed, in milliseconds. Defaults to 128ms.',
})

export const retryMaxDelayMs = Flags.integer({
  default: 30_000,
  description: 'Maximum backoff retry delay, in milliseconds. Defaults to 30s.',
})
