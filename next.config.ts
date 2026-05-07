import type { NextConfig } from 'next'

const apiBaseUrl = process.env.COMPLIANCE_API_PROXY_TARGET ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8080'

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiBaseUrl.replace(/\/+$/, '')}/:path*`,
      },
    ]
  },
}

export default nextConfig
