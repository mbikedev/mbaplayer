import { describe, expect, it } from 'vitest'
import { prefersNativeHls } from '@/lib/hls-support'

const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15'
const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1'
const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36'
const EDGE_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0'
const FIREFOX =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0'

describe('prefersNativeHls', () => {
  it('hands the stream to WebKit, whose decoder takes what MSE refuses', () => {
    expect(prefersNativeHls('maybe', SAFARI_MAC)).toBe(true)
    expect(prefersNativeHls('probably', SAFARI_IOS)).toBe(true)
  })

  it('keeps hls.js on Chromium, which puts Safari in its UA too', () => {
    expect(prefersNativeHls('', CHROME_MAC)).toBe(false)
    expect(prefersNativeHls('maybe', CHROME_ANDROID)).toBe(false)
    expect(prefersNativeHls('maybe', EDGE_WINDOWS)).toBe(false)
  })

  it('keeps hls.js when the element cannot play a playlist at all', () => {
    expect(prefersNativeHls('', SAFARI_MAC)).toBe(false)
    expect(prefersNativeHls('', FIREFOX)).toBe(false)
  })
})
