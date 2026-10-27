/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native module: load it with plain require instead of bundling it.
  serverExternalPackages: ['better-sqlite3'],
  images: {
    unoptimized: true,
  },
}

export default nextConfig
