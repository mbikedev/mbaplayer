import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Portal logos and posters come from arbitrary user-supplied hosts, so the
  // optimizer is bypassed and <img> is used directly in the UI.
  images: { unoptimized: true },
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
