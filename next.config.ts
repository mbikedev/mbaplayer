import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Portal logos and posters come from arbitrary user-supplied hosts, so the
  // optimizer is bypassed and <img> is used directly in the UI.
  images: { unoptimized: true },

  /**
   * Origins allowed to request dev-only assets.
   *
   * Next.js serves them to `localhost` alone by default, and treats
   * `127.0.0.1` as a different origin — so opening the dev server by IP gets
   * 403s on every JS chunk, the page never hydrates, and forms fall back to a
   * native submit with no visible error.
   *
   * This matters most for the thing this app is: a PWA. Testing install and
   * playback on a phone means opening the dev server from another device on
   * the LAN, so the private ranges are listed here too. Development only —
   * `next build` ignores this entirely.
   */
  allowedDevOrigins: ['127.0.0.1', '0.0.0.0', '*.local', '192.168.*.*', '10.*.*.*'],
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ]
  },
}

export default nextConfig
