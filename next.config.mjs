/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      '@react-pdf/renderer',
      // Prisma 需在运行时从 node_modules 加载查询引擎（Lambda 平台二进制），不能被打包器内联
      '@prisma/client',
      '.prisma/client',
    ],
  },
};

export default nextConfig;