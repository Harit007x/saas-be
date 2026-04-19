# Backend Setup Guide

Welcome to the Node.js Express backend project. Follow these instructions to set up the repository for local development.

## Prerequisites

Before you begin, ensure you have the following installed on your machine:
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [pnpm](https://pnpm.io/) (used as the package manager in this project)
- [MongoDB](https://www.mongodb.com/try/download/community) (running locally or a MongoDB Atlas cluster URI)
- [Docker](https://www.docker.com/) (optional, for containerized deployment)

## 1. Installation

First, navigate to the project directory and install the dependencies using `pnpm`:

```bash
# Install all dependencies from package.json
pnpm install
```

## 2. Environment Variables

Create a `.env` file in the root directory for default values. This project supports hierarchical environment loading using `dotenv-flow`, similar to Next.js.

### Loading Order
Environment variables are loaded from multiple files with the following priority (later files override earlier ones):
1.  `.env` (Default values)
2.  `.env.local` (Local overrides for all environments - ignored by git)
3.  `.env.[mode]` (Environment specific, e.g., `.env.development`)
4.  `.env.[mode].local` (Local overrides for specific environment - ignored by git)

### Essential Variables
Add these to your `.env` or `.env.local`:

```env
# The port your server will run on (defaults to 5000)
PORT=5000

# The URL of your frontend application
FRONTEND_URL=http://localhost:3000

# Your MongoDB connection string
DATABASE_URL="mongodb://localhost:27017/local"
```

## 3. Database Setup (Prisma)

This project uses [Prisma ORM](https://www.prisma.io/) to interact with the MongoDB database. To set up Prisma for local development:

### Generate Prisma Client
Generate the Prisma Client so you get correct TypeScript type definitions based on your `schema.prisma`. 
*Note: Run this command every time you pull changes or modify `schema.prisma`.*

```bash
npx prisma generate
```

### Push Schema to Database
Since this project uses MongoDB, Prisma does not use standard SQL migrations. To ensure your database collections and indices match your schema, simply push the schema:

```bash
npx prisma db push
```

## 4. Running the Application

Now you're ready to start the server!

### Development Mode
To start the server with hot-reloading (using `nodemon`):

```bash
pnpm run dev
```
You should see a console message indicating the server is running on `http://localhost:5000` (or your configured `PORT`), followed by a successful database connection log.

### Production Build
To compile the TypeScript code to JavaScript into a `dist/` directory:

```bash
pnpm run build
```

To start the compiled production build:

```bash
pnpm run start
```

## 5. Docker Setup (Recommended for Deployment)

You can also run the entire application in a containerized environment using Docker.

### Building the Image
To build the Docker image locally:

```bash
docker build -t be-code-base .
```

### Running with Docker Compose
The easiest way to start the application is using Docker Compose, which handles environment variables and container orchestration:

```bash
# Build and start the container in detached mode
docker compose up --build -d
```

The application will be accessible at `http://localhost:5000` (or your mapped port).

### Useful Docker Commands
- **Stop containers:** `docker compose down`
- **View logs:** `docker compose logs -f`
- **Restart app:** `docker compose restart app`
