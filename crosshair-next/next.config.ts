import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a production check build run beside `next dev` without clobbering it.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Transformers.js ships native .node/onnx assets; keep them server-external.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "exceljs", "@crawlee/cheerio", "@crawlee/http", "@crawlee/basic", "@crawlee/core"],

  // onnxruntime-node bundles binaries for every OS (~210 MB). Serverless
  // functions run linux-x64, so drop the rest to stay under the size limit.
  outputFileTracingExcludes: {
    "*": [
      "node_modules/onnxruntime-node/bin/napi-v3/darwin/**",
      "node_modules/onnxruntime-node/bin/napi-v3/win32/**",
      "node_modules/onnxruntime-node/bin/napi-v3/linux/arm64/**",
      "node_modules/onnxruntime-web/**",
      "node_modules/@img/sharp-darwin*/**",
      "node_modules/@img/sharp-libvips-darwin*/**",
      ".cache/**",
    ],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
