import { LogsGlobal } from '../../../src/logs/logs.entry'
import { RumEventType } from '../../../src/rum/rum'

import {
  browserExecute,
  browserExecuteAsync,
  flushEvents,
  retrieveLogs,
  retrieveLogsMessages,
  retrieveRumEvents,
  retrieveRumEventsTypes,
  ServerRumEvent,
  sortByMessage,
  tearDown,
} from './helpers'

beforeEach(() => {
  browser.url('/agents-page.html')
})

afterEach(tearDown)

describe('logs', () => {
  it('should send logs', async () => {
    await browserExecute(() => {
      ;((window as any).DD_LOGS as LogsGlobal).logger.log('hello')
    })
    await flushEvents()
    const logs = await retrieveLogsMessages()
    expect(logs).toContain('hello')
  })

  it('should send errors', async () => {
    await browserExecute(() => {
      console.error('oh snap')
    })
    await flushEvents()
    const logs = await retrieveLogsMessages()
    expect(logs).toContain('console error: oh snap')
    const browserLogs = await browser.getLogs('browser')
    expect(browserLogs.length).toEqual(1)
  })
})

describe('rum', () => {
  it('should send page view event on load', async () => {
    await flushEvents()
    const types = await retrieveRumEventsTypes()
    expect(types).toContain(RumEventType.PAGE_VIEW)
  })

  it('should send page views during history navigation', async () => {
    await browserExecute(() => {
      history.pushState({}, '', '/')

      history.pushState({}, '', '/#push-hash')
      history.pushState({}, '', '/?push-query')
      history.pushState({}, '', '/push-path')

      history.pushState({}, '', '/')

      history.replaceState({}, '', '/#replace-hash')
      history.replaceState({}, '', '/?replace-query')
      history.replaceState({}, '', '/replace-path')

      history.pushState({}, '', '/')

      history.back()
      history.forward()
    })

    await flushEvents()
    const trackedUrls = (await retrieveRumEvents())
      .filter((rumEvent: ServerRumEvent) => rumEvent.type === 'page_view')
      .map((rumEvent: ServerRumEvent) => rumEvent.http.referer.replace('http://localhost:3000', ''))

    expect(trackedUrls).toEqual(['/agents-page.html', '/', '/push-path', '/', '/replace-path', '/', '/replace-path'])
  })

  it('should send errors', async () => {
    await browserExecute(() => {
      console.error('oh snap')
    })
    await flushEvents()
    const types = await retrieveRumEventsTypes()
    expect(types).toContain(RumEventType.ERROR)
    const browserLogs = await browser.getLogs('browser')
    expect(browserLogs.length).toEqual(1)
  })
})

describe('error collection', () => {
  it('should track xhr error', async () => {
    await browserExecuteAsync((done: () => void) => {
      let count = 0
      let xhr = new XMLHttpRequest()
      xhr.addEventListener('load', () => (count += 1))
      xhr.open('GET', 'http://localhost:3000/throw')
      xhr.send()

      xhr = new XMLHttpRequest()
      xhr.addEventListener('load', () => (count += 1))
      xhr.open('GET', 'http://localhost:3000/unknown')
      xhr.send()

      xhr = new XMLHttpRequest()
      xhr.addEventListener('error', () => (count += 1))
      xhr.open('GET', 'http://localhost:9999/unreachable')
      xhr.send()

      xhr = new XMLHttpRequest()
      xhr.addEventListener('load', () => (count += 1))
      xhr.open('GET', 'http://localhost:3000/ok')
      xhr.send()

      const interval = setInterval(() => {
        if (count === 4) {
          clearInterval(interval)
          done()
        }
      }, 500)
    })
    await browser.getLogs('browser')
    await flushEvents()
    const logs = (await retrieveLogs()).sort(sortByMessage)

    expect(logs.length).toEqual(2)

    expect(logs[0].message).toEqual('XHR error GET http://localhost:3000/throw')
    expect(logs[0].http.status_code).toEqual(500)
    expect(logs[0].error.stack).toMatch(/Server error/)

    expect(logs[1].message).toEqual('XHR error GET http://localhost:9999/unreachable')
    expect(logs[1].http.status_code).toEqual(0)
    expect(logs[1].error.stack).toEqual('Failed to load')
  })

  it('should track fetch error', async () => {
    await browserExecuteAsync((done: () => void) => {
      let count = 0
      fetch('http://localhost:3000/throw').then(() => (count += 1))
      fetch('http://localhost:3000/unknown').then(() => (count += 1))
      fetch('http://localhost:9999/unreachable').catch(() => (count += 1))
      fetch('http://localhost:3000/ok').then(() => (count += 1))

      const interval = setInterval(() => {
        if (count === 4) {
          clearInterval(interval)
          done()
        }
      }, 500)
    })
    await browser.getLogs('browser')
    await flushEvents()
    const logs = (await retrieveLogs()).sort(sortByMessage)

    expect(logs.length).toEqual(2)

    expect(logs[0].message).toEqual('Fetch error GET http://localhost:3000/throw')
    expect(logs[0].http.status_code).toEqual(500)
    expect(logs[0].error.stack).toMatch(/Server error/)

    expect(logs[1].message).toEqual('Fetch error GET http://localhost:9999/unreachable')
    expect(logs[1].http.status_code).toEqual(0)
    expect(logs[1].error.stack).toEqual('TypeError: Failed to fetch')
  })
})
