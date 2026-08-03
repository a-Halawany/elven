/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-hosted output — no external CDN/telemetry dependencies (deployment parity, EXC-P0-004 posture).
  output: 'standalone',
};
export default nextConfig;
