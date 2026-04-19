# Project Features

This backend starter repository is designed to kickstart production-ready applications with a focus on security, developer experience, and scalability.

## 🚀 Core Technology Stack
- **Modern Runtime**: Node.js with **Express 5.x** and **TypeScript**.
- **Database & ORM**: **Prisma** with **MongoDB** (Object data modeling made easy).
- **Validation**: **Zod** for end-to-end type-safe request validation.
- **Package Manager**: **pnpm** for fast, disk-efficient dependency management.

## 🔐 Advanced Authentication
- **Full Auth Cycle**: Implementation for Signup, Login, and Logout.
- **Secure Token Strategy**: Dual-token system using short-lived **Access Tokens** and long-lived **Refresh Tokens**.
- **Token Rotation**: Dynamic refresh token rotation for enhanced session security.
- **Blacklisting**: Immediate invalidation of access tokens upon logout.
- **Password Recovery**: Secure "Forgot Password" and "Reset Password" flow using hashed tokens and expiration.
- **Secure Storage**: JWTs delivered via **HttpOnly & Secure cookies** to prevent XSS attacks.

## 📝 API Documentation
- **Interactive Swagger UI**: Accessible at `/api-docs` to explore and test endpoints.
- **Programmatic generation**: Powered by `zod-to-openapi` — your documentation is derived directly from your code, ensuring it's always accurate and never cluttered with JSDoc comments.

## 🛠 Developer Experience (DX)
- **Hierarchical Environments**: Support for `.env`, `.env.local`, and environment-specific overrides (Next.js style) using `dotenv-flow`.
- **Hot Reloading**: Automated server restarts during development with `nodemon`.
- **Clean Architecture**: Modular structure with a clear separation of controllers, routes, middlewares, and utilities.
- **Standardized Responses**: Centralized global error handling ensuring consistent API response structures.
- **Code Quality**: Pre-configured **Prettier** for consistent code formatting.

## 🐳 Containerization
- **Production-Ready Docker**: Multi-stage `Dockerfile` optimized for minimal image size.
- **Orchestration**: `docker-compose.yml` for simplified local setup and deployment.
- **Build Optimization**: Includes `.dockerignore` to keep image builds fast and lean.

## 🛡 Security Best Practices
- **Password Hashing**: Industry-standard hashing using `bcryptjs`.
- **CORS Protection**: Configurable Cross-Origin Resource Sharing.
- **Type Safety**: TypeScript-first approach reducing runtime errors.
