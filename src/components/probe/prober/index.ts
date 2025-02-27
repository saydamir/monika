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

import type { Notification } from '@hyperjumptech/monika-notification'
import { type Incident, getContext } from '../../../context'
import events from '../../../events'
import type { Probe, ProbeAlert } from '../../../interfaces/probe'
import {
  probeRequestResult,
  type ProbeRequestResponse,
} from '../../../interfaces/request'
import { getEventEmitter } from '../../../utils/events'
import { log } from '../../../utils/pino'
import { isSymonModeFrom } from '../../config'
import { sendAlerts } from '../../notification'
import { saveNotificationLog, saveProbeRequestLog } from '../../logger/history'
import { logResponseTime } from '../../logger/response-time-log'
import type { ValidatedResponse } from '../../../plugins/validate-response'
import {
  startDowntimeCounter,
  stopDowntimeCounter,
} from '../../downtime-counter'
import { FAILED_REQUEST_ASSERTION } from '../../../looper'

export type ProbeResult = {
  isAlertTriggered: boolean
  logMessage: string
  requestResponse: ProbeRequestResponse
}

export enum NotificationType {
  Incident = 'NOTIFY-INCIDENT',
  Recover = 'NOTIFY-RECOVER',
}

type SendNotificationParams = {
  requestURL: string
  notificationType: NotificationType
  validation: ValidatedResponse
}

export interface Prober {
  probe: () => Promise<void>
  generateVerboseStartupMessage: () => string
}

export type ProberMetadata = {
  counter: number
  notifications: Notification[]
  probeConfig: Probe
}

enum ProbeState {
  Up = 'UP',
  Down = 'DOWN',
}

export class BaseProber implements Prober {
  protected readonly counter: number
  protected readonly notifications: Notification[]
  protected readonly probeConfig: Probe

  constructor({ counter, notifications, probeConfig }: ProberMetadata) {
    this.counter = counter
    this.notifications = notifications
    this.probeConfig = probeConfig
  }

  async probe(): Promise<void> {
    this.processProbeResults([])
  }

  generateVerboseStartupMessage(): string {
    return ''
  }

  protected processProbeResults(probeResults: ProbeResult[]): void {
    for (const { isAlertTriggered, logMessage } of probeResults) {
      this.logMessage(!isAlertTriggered, logMessage)
    }

    if (
      probeResults.some(
        ({ requestResponse }) =>
          requestResponse.result !== probeRequestResult.success
      )
    ) {
      if (this.hasIncident()) {
        throw new Error('There is an ongoing incident.')
      }

      this.handleFailedProbe(probeResults)
      throw new Error('Probe request is failed.')
    }

    if (this.hasIncident()) {
      this.handleRecovery(probeResults)
    }

    for (const index of probeResults.keys()) {
      const { requestResponse } = probeResults[index]
      getEventEmitter().emit(events.probe.response.received, {
        probe: this.probeConfig,
        requestIndex: index,
        response: requestResponse,
      })
      logResponseTime(requestResponse.responseTime)

      if (
        isSymonModeFrom(getContext().flags) ||
        getContext().flags['keep-verbose-logs']
      ) {
        saveProbeRequestLog({
          probe: this.probeConfig,
          requestIndex: index,
          probeRes: requestResponse,
        })
      }
    }
  }

  protected getFailedRequestAssertion(
    requestIndex?: number
  ): ProbeAlert | undefined {
    const getFailedRequestAssertionFromProbe = (): ProbeAlert | undefined =>
      this.probeConfig.alerts.find(
        ({ assertion, message }) =>
          assertion === FAILED_REQUEST_ASSERTION.assertion &&
          message === FAILED_REQUEST_ASSERTION.message
      )
    const getFailedRequestAssertionFromRequests = (
      requestIndex?: number
    ): ProbeAlert | undefined => {
      if (
        this.probeConfig.requests === undefined ||
        requestIndex === undefined
      ) {
        return undefined
      }

      return (this.probeConfig.requests[requestIndex].alerts || []).find(
        ({ assertion, message }) =>
          assertion === FAILED_REQUEST_ASSERTION.assertion &&
          message === FAILED_REQUEST_ASSERTION.message
      )
    }

    return (
      getFailedRequestAssertionFromProbe() ||
      getFailedRequestAssertionFromRequests(requestIndex)
    )
  }

  protected hasIncident(): Incident | undefined {
    return getContext().incidents.find(
      (incident) => incident.probeID === this.probeConfig.id
    )
  }

  protected async sendNotification({
    requestURL,
    notificationType,
    validation,
  }: SendNotificationParams): Promise<void> {
    const isRecoveryNotification = notificationType === NotificationType.Recover
    getEventEmitter().emit(events.probe.notification.willSend, {
      probeID: this.probeConfig.id,
      notifications: this.notifications,
      url: requestURL,
      probeState: isRecoveryNotification ? ProbeState.Up : ProbeState.Down,
      validation,
    })

    if (!this.hasNotification()) {
      return
    }

    await sendAlerts({
      probeID: this.probeConfig.id,
      url: requestURL,
      probeState: isRecoveryNotification ? ProbeState.Up : ProbeState.Down,
      notifications: this.notifications,
      validation,
    })

    await Promise.all(
      this.notifications.map((notification) =>
        saveNotificationLog(
          this.probeConfig,
          notification,
          isRecoveryNotification
            ? NotificationType.Recover
            : NotificationType.Incident,
          ''
        )
      )
    )
  }

  protected handleFailedProbe(
    probeResults: Pick<ProbeResult, 'requestResponse'>[]
  ): void {
    const hasfailedProbe = probeResults.find(
      ({ requestResponse }) =>
        requestResponse.result !== probeRequestResult.success
    )
    const { requestResponse } = hasfailedProbe!
    const requestIndex = probeResults.findIndex(
      ({ requestResponse }) =>
        requestResponse.result !== probeRequestResult.success
    )
    const failedRequestAssertion = this.getFailedRequestAssertion(requestIndex)

    if (!failedRequestAssertion) {
      log.error('Failed request assertion is not found')
      return
    }

    getEventEmitter().emit(events.probe.alert.triggered, {
      probe: this.probeConfig,
      requestIndex,
      alertQuery: failedRequestAssertion,
    })

    startDowntimeCounter({
      alert: failedRequestAssertion,
      probeID: this.probeConfig.id,
      url: this.probeConfig?.requests?.[requestIndex].url || '',
    })

    saveProbeRequestLog({
      probe: this.probeConfig,
      requestIndex,
      probeRes: requestResponse,
      alertQueries: [failedRequestAssertion.assertion],
      error: requestResponse.errMessage,
    })

    this.sendNotification({
      requestURL: this.probeConfig?.requests?.[requestIndex].url || '',
      notificationType: NotificationType.Incident,
      validation: {
        alert: failedRequestAssertion,
        isAlertTriggered: true,
        response: requestResponse,
      },
    }).catch((error) => log.error(error.mesage))
  }

  protected handleRecovery(
    probeResults: Pick<ProbeResult, 'requestResponse'>[]
  ): void {
    const recoveredIncident = getContext().incidents.find(
      (incident) => incident.probeID === this.probeConfig.id
    )
    const requestIndex =
      this.probeConfig?.requests?.findIndex(
        ({ url }) => url === recoveredIncident?.probeRequestURL
      ) || 0

    if (recoveredIncident) {
      stopDowntimeCounter({
        alert: recoveredIncident.alert,
        probeID: this.probeConfig.id,
        url: this.probeConfig?.requests?.[requestIndex].url || '',
      })

      this.sendNotification({
        requestURL: this.probeConfig?.requests?.[requestIndex].url || '',
        notificationType: NotificationType.Recover,
        validation: {
          alert: recoveredIncident.alert,
          isAlertTriggered: false,
          response: probeResults[requestIndex].requestResponse,
        },
      }).catch((error) => log.error(error.mesage))
    }

    saveProbeRequestLog({
      probe: this.probeConfig,
      requestIndex,
      probeRes: probeResults[requestIndex].requestResponse,
      alertQueries: [recoveredIncident?.alert.assertion || ''],
    })
  }

  protected logMessage(isSuccess: boolean, ...message: string[]): void {
    if (isSuccess) {
      log.info(
        `${this.getMessagePrefix()} ${message.filter(Boolean).join(', ')}`
      )
      return
    }

    log.warn(`${this.getMessagePrefix()} ${message.filter(Boolean).join(', ')}`)
  }

  private hasNotification() {
    return this.notifications.length > 0
  }

  private getMessagePrefix() {
    return `${new Date().toISOString()} ${this.counter} id:${
      this.probeConfig.id
    }`
  }
}
