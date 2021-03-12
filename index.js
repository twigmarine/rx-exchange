const _ = require('lodash/fp')
const {
  concat, of,
} = require('rxjs')
const {
  concatMap, map, retry, scan, takeWhile, timeout,
} = require('rxjs/operators')

function handleExchange(result, msgEvent) {
  // console.log('handleExchange', result, msgEvent)
  const { rxBytes, rxPosition, txTime } = result
  const data = _.get('payload.input', msgEvent)
  // console.log('DATA', data)
  const buffData = Buffer.isBuffer(data) ? new Uint8Array(data) : data
  // console.log('result', result, data)
  rxBytes.set(buffData, rxPosition)
  const nextBytePos = rxPosition + buffData.byteLength
  const complete = nextBytePos === rxBytes.byteLength
  // console.log('got data', data, complete)
  return {
    ...result,
    rtt: _.now() - txTime,
    data: buffData,
    rxPosition: nextBytePos,
    complete,
    error: nextBytePos > rxBytes.byteLength,
  }
}

function createExchange(writeData, onMessage, timeoutMs = 1000) {
  return (txBytes, rxByteLength) => {
    const startTime = _.now()
    let tryCount = 0
    return writeData(txBytes).pipe(
      map((info) => {
        tryCount += 1
        if (tryCount > 1) console.log(tryCount, info)
        return {
          startTime,
          tryCount,
          ...info,
          rxBytes: new Uint8Array(rxByteLength),
          rxPosition: 0,
          sent: true,
        }
      }),
      concatMap((info) => concat(
        of({ payload: info, type: 'PORT/SENT' }),
        onMessage.pipe(
          scan(handleExchange, info),
          timeout(timeoutMs),
          takeWhile(({ complete, error }) => (!complete && !error), true),
          map((payload) => ({ payload, type: 'PORT/EXCHANGE' })),
        ),
      )),
      retry(5),
      // catchError((error) => of({
      //   type: 'SERIAL_PORT:EXCHANGE_TIMEOUT',
      //   payload: error,
      //   error: true,
      // })),
      // tap((ev) => console.log('exchange', ev)),
    )
  }
}

module.exports = {
  createExchange,
  handleExchange,
}
