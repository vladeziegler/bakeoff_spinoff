/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/:path*', // Proxy ADK server requests
      },
      {
        source: '/static/:path*',
        destination: 'http://localhost:8000/static/:path*', // Proxy static image requests
      },
    ];
  },
  // Increase payload size limits for artifact responses
  experimental: {
    proxyTimeout: 60000, // 60 seconds timeout
    largePageDataBytes: 128 * 1024 * 1024, // 128MB for large responses
  },
};

module.exports = nextConfig;
