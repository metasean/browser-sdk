import { Configuration, performDraw, startSessionManagement, RelativeTime } from '@datadog/browser-core'

export const LOGS_SESSION_KEY = 'logs'

export interface LogsSessionManager {
  getId: (startTime?: RelativeTime) => string | undefined
  isTracked: (startTime?: RelativeTime) => boolean
}

export enum LoggerTrackingType {
  NOT_TRACKED = '0',
  TRACKED = '1',
}

export function startLogsSessionManagement(
  configuration: Configuration,
  areCookieAuthorized: boolean
): LogsSessionManager {
  if (!areCookieAuthorized) {
    const isTracked = computeTrackingType(configuration) === LoggerTrackingType.TRACKED
    return {
      getId: () => undefined,
      isTracked: () => isTracked,
    }
  }
  const sessionManager = startSessionManagement(configuration.cookieOptions, LOGS_SESSION_KEY, (rawTrackingType) =>
    computeSessionState(configuration, rawTrackingType)
  )
  return {
    getId: sessionManager.getId,
    isTracked: (startTime) => sessionManager.getTrackingType(startTime) === LoggerTrackingType.TRACKED,
  }
}

function computeTrackingType(configuration: Configuration) {
  if (!performDraw(configuration.sampleRate)) {
    return LoggerTrackingType.NOT_TRACKED
  }
  return LoggerTrackingType.TRACKED
}

function computeSessionState(configuration: Configuration, rawSessionType?: string) {
  const trackingType = hasValidLoggerSession(rawSessionType) ? rawSessionType : computeTrackingType(configuration)
  return {
    trackingType,
    isTracked: trackingType === LoggerTrackingType.TRACKED,
  }
}

function hasValidLoggerSession(trackingType?: string): trackingType is LoggerTrackingType {
  return trackingType === LoggerTrackingType.NOT_TRACKED || trackingType === LoggerTrackingType.TRACKED
}