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

import { format } from 'date-fns'
import * as Handlebars from 'handlebars'
import { arch, hostname, platform, release } from 'os'
import { NotificationMessage } from '../../interfaces/notification'
import { AxiosResponseWithExtraData } from '../../interfaces/request'
import { ProbeAlert } from '../../interfaces/probe'
import {
  getPublicIp,
  publicIpAddress,
  publicNetworkInfo,
} from '../../utils/public-ip'

const getMonikaInstance = async (ipAddress: string) => {
  const osHostname = hostname()
  await getPublicIp()

  if (publicNetworkInfo) {
    const { city, isp } = publicNetworkInfo

    return `${city} - ${isp} (${publicIpAddress}) - ${osHostname} (${ipAddress})`
  }

  return `${osHostname} (${[publicIpAddress, ipAddress]
    .filter(Boolean)
    .join('/')})`
}

export async function getMessageForAlert({
  alert,
  url,
  ipAddress,
  probeState, // state of the probed target
  response,
}: {
  alert: ProbeAlert
  url: string
  ipAddress: string
  probeState: string
  response: AxiosResponseWithExtraData
}): Promise<NotificationMessage> {
  const appVersion = getAppVersionDetail()
  const monikaInstance = await getMonikaInstance(ipAddress)
  const meta = {
    type: probeState === 'UP' ? ('recovery' as const) : ('incident' as const),
    url,
    time: format(new Date(), 'yyyy-MM-dd HH:mm:ss XXX'),
    hostname: hostname(),
    privateIpAddress: ipAddress,
    publicIpAddress,
    monikaInstance,
  }
  const getSubject = (probeState: string) => {
    const recoveryOrIncident = probeState === 'UP' ? 'Recovery' : 'Incident'

    return `New ${recoveryOrIncident} from Monika`
  }
  const getExpectedMessage = (
    alert: ProbeAlert,
    response: AxiosResponseWithExtraData
  ) => {
    const { statusText, status } = response
    const isHTTPStatusCode = status >= 100 && status <= 599

    if (!alert.message) return ''

    if (!isHTTPStatusCode) {
      switch (status) {
        case 0:
          return 'URI not found'
        case 1:
          return 'Connection reset'
        case 2:
          return 'Connection refused'

        default:
          return statusText
      }
    }

    return Handlebars.compile(alert.message)({
      response: {
        size: Number(response.headers['content-length']),
        status,
        time: response.config.extraData?.responseTime,
        body: response.data,
        headers: response.headers,
      },
    })
  }
  const expectedMessage = getExpectedMessage(alert, response)
  const bodyString = `Message: ${expectedMessage}

URL: ${meta.url}

Time: ${meta.time}

From: ${monikaInstance}

Version: ${appVersion}`

  const message = {
    subject: getSubject(probeState),
    body: bodyString,
    summary: `${expectedMessage} - ${appVersion}`,
    meta,
  }

  return message
}

export const getMessageForStart = async (
  hostname: string,
  ip: string
): Promise<NotificationMessage> => {
  const appVersion = getAppVersionDetail()
  const monikaInstance = await getMonikaInstance(ip)

  return {
    subject: 'Monika is started',
    body: `Monika is running from ${monikaInstance} - ${appVersion}`,
    summary: `Monika is running from ${monikaInstance} - ${appVersion}`,
    meta: {
      type: 'start',
      time: new Date().toUTCString(),
      hostname: hostname,
      privateIpAddress: ip,
      publicIpAddress,
    },
  }
}

export const getMessageForTerminate = async (
  hostname: string,
  ip: string
): Promise<NotificationMessage> => {
  const appVersion = getAppVersionDetail()
  const monikaInstance = await getMonikaInstance(ip)

  return {
    subject: 'Monika terminated',
    body: `Monika is no longer running from ${monikaInstance} - ${appVersion}`,
    summary: `Monika is no longer running from ${monikaInstance} - ${appVersion}`,
    meta: {
      type: 'termination',
      time: new Date().toUTCString(),
      hostname: hostname,
      privateIpAddress: ip,
      publicIpAddress,
    },
  }
}

export function getAppVersionDetail() {
  const { env, version } = process

  return `@hyperjumptech/monika/${
    env.npm_package_version
  } ${platform()}-${arch()} ${release()} node-${version}`
}
