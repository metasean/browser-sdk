import {
  Configuration,
  COOKIE_ACCESS_DELAY,
  getCookie,
  SESSION_COOKIE_NAME,
  setCookie,
  stopSessionManagement,
  ONE_SECOND,
  RelativeTime,
} from '@datadog/browser-core'
import { Clock, mockClock } from '../../../core/test/specHelper'

import { LOGS_SESSION_KEY, LoggerTrackingType, startLogsSessionManagement } from './logsSessionManager'

describe('logger session', () => {
  const DURATION = 123456
  const configuration: Partial<Configuration> = { sampleRate: 0.5 }
  let clock: Clock
  let tracked: boolean

  beforeEach(() => {
    tracked = true
    spyOn(Math, 'random').and.callFake(() => (tracked ? 0 : 1))
    clock = mockClock()
  })

  afterEach(() => {
    // remove intervals first
    stopSessionManagement()
    // flush pending callbacks to avoid random failures
    clock.tick(new Date().getTime())
    clock.cleanup()
  })

  it('when tracked should store tracking type and session id', () => {
    tracked = true

    startLogsSessionManagement(configuration as Configuration, true)

    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${LOGS_SESSION_KEY}=${LoggerTrackingType.TRACKED}`)
    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/id=[a-f0-9-]+/)
  })

  it('when not tracked should store tracking type', () => {
    tracked = false

    startLogsSessionManagement(configuration as Configuration, true)

    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${LOGS_SESSION_KEY}=${LoggerTrackingType.NOT_TRACKED}`)
    expect(getCookie(SESSION_COOKIE_NAME)).not.toContain('id=')
  })

  it('when tracked should keep existing tracking type and session id', () => {
    setCookie(SESSION_COOKIE_NAME, 'id=abcdef&logs=1', DURATION)

    startLogsSessionManagement(configuration as Configuration, true)

    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${LOGS_SESSION_KEY}=${LoggerTrackingType.TRACKED}`)
    expect(getCookie(SESSION_COOKIE_NAME)).toContain('id=abcdef')
  })

  it('when not tracked should keep existing tracking type', () => {
    setCookie(SESSION_COOKIE_NAME, 'logs=0', DURATION)

    startLogsSessionManagement(configuration as Configuration, true)

    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${LOGS_SESSION_KEY}=${LoggerTrackingType.NOT_TRACKED}`)
  })

  it('should renew on activity after expiration', () => {
    startLogsSessionManagement(configuration as Configuration, true)

    setCookie(SESSION_COOKIE_NAME, '', DURATION)
    expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
    clock.tick(COOKIE_ACCESS_DELAY)

    tracked = true
    document.body.click()

    expect(getCookie(SESSION_COOKIE_NAME)).toMatch(/id=[a-f0-9-]+/)
    expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${LOGS_SESSION_KEY}=${LoggerTrackingType.TRACKED}`)
  })

  it('when no cookies available, isTracked is computed at each call and getId is undefined', () => {
    const sessionManager = startLogsSessionManagement(configuration as Configuration, false)

    expect(sessionManager.getId()).toBeUndefined()
    expect(sessionManager.isTracked()).toMatch(/true|false/)
  })

  it('should get session from history', () => {
    const sessionManager = startLogsSessionManagement(configuration as Configuration, true)

    clock.tick(10 * ONE_SECOND)

    setCookie(SESSION_COOKIE_NAME, '', DURATION)
    clock.tick(COOKIE_ACCESS_DELAY)

    expect(sessionManager.getId()).toBeUndefined()
    expect(sessionManager.isTracked()).toBe(false)

    expect(sessionManager.getId(ONE_SECOND as RelativeTime)).toBeDefined()
    expect(sessionManager.isTracked(ONE_SECOND as RelativeTime)).toBe(true)
  })
})