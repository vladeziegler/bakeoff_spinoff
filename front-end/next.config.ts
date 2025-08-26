/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8881/:path*', // Proxy API requests
      },
      {
        source: '/static/:path*',
        destination: 'http://localhost:8881/static/:path*', // Proxy static image requests
      },
    ];
  },
};

module.exports = nextConfig;
