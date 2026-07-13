import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // ponytail: this is the current Mac LAN address for real-device testing;
  // update it if the router assigns the Mac a different address.
  allowedDevOrigins: ["192.168.1.95"],
};

export default nextConfig;
