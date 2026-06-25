/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The generated contract bindings ship as TS/ESM; transpile them.
  transpilePackages: ["streamzero", "mock-stablecoin"],
  webpack: (config, { webpack }) => {
    // wasm-pack glue uses `new URL(..., import.meta.url)` to load the .wasm.
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    // Polyfill Buffer for the Stellar SDK / bindings in the browser.
    config.resolve.fallback = { ...config.resolve.fallback, buffer: "buffer" };
    config.plugins.push(
      new webpack.ProvidePlugin({ Buffer: ["buffer", "Buffer"] }),
    );
    return config;
  },
};

export default nextConfig;
