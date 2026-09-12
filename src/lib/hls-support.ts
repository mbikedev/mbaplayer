/**
 * Choosing between the browser's own HLS loader and hls.js.
 *
 * hls.js feeds Media Source Extensions, and MSE accepts a narrow set of
 * codecs: AAC or MP3 audio, H.264 video. IPTV portals routinely send neither.
 * A Moroccan channel carrying MPEG-1 Layer II audio, or an FHD feed in H.265,
 * plays in every native player and stalls behind a spinner in Chrome — the
 * video buffer fills, the audio buffer never does, and readyState never rises.
 *
 * WebKit on Apple platforms has no such limit: its HLS loader hands the stream
 * to the system decoder, which takes AC-3, MPEG-1 Layer II and HEVC. So there,
 * native wins outright and hls.js is the wrong tool even though it runs.
 */

/**
 * Whether to hand the playlist straight to the element instead of hls.js.
 *
 * Only Apple's WebKit qualifies. Chrome on Android also reports native HLS
 * support, but its loader gives up the level and audio-track control hls.js
 * provides without decoding anything extra in return.
 *
 * @param canPlayType what the element answers for `application/vnd.apple.mpegurl`
 * @param userAgent   `navigator.userAgent`
 */
export function prefersNativeHls(canPlayType: string, userAgent: string): boolean {
  if (!canPlayType) return false
  // Chrome, Edge and every other Chromium put "Safari" in their UA too, so the
  // engine has to be identified by what is absent.
  return /safari/i.test(userAgent) && !/chrome|chromium|crios|android|edg\//i.test(userAgent)
}
