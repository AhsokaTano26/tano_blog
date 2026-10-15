# Repository Guidelines

## Project Structure & Module Organization

- `frontend/`: Next.js App Router with React, TypeScript, and Tailwind CSS. Routes live in `src/app/`, shared components in `src/components/`, utilities and the API client in `src/lib/`, and static assets in `public/`.
- `backend/`: Go API using Gin, GORM, and PostgreSQL. `cmd/server/main.go` initializes routes; `internal/` separates handlers, middleware, models, repositories, services, configuration, and utilities. Go tests sit beside source files.
- `docs/`: specifications, plans, and deployment guidance. `.github/workflows/release.yml` defines CI checks and releases.

## Build, Test, and Development Commands

Use Node.js 22+, Go 1.26.2+, and PostgreSQL 16. Run these commands from the repository root:

- `docker compose up -d postgres`: start the database on port 5431.
- `cd frontend && npm ci`: install locked frontend dependencies.
- `cd frontend && npm run dev`: start Next.js on port 3000.
- `cd frontend && npm run lint`: run ESLint.
- `cd frontend && npm run build`: create the production frontend build.
- `cd backend && go run ./cmd/server`: start the API on port 8080.
- `cd backend && go build ./cmd/server`: compile the backend.
- `cd backend && go test ./... && go vet ./...`: run backend tests and static checks.
- `docker compose up --build -d`: build and run the full stack; the frontend is exposed on port 3001.

## Coding Style & Naming Conventions

Use two-space indentation, semicolons, and existing quote conventions in TypeScript. Keep strict typing; name React components in PascalCase and hooks with `use`. Follow App Router filenames such as `page.tsx` and `layout.tsx`; use `@/` imports for `src/`. ESLint uses Next.js and TypeScript rules. Format Go with `gofmt`; use lowercase package names and descriptive snake_case filenames.

## Testing Guidelines

Use Go's standard `testing` package, `*_test.go` files, and `TestXxx` functions. Add regression coverage for changed backend behavior. No coverage threshold or frontend test runner is configured. Before submitting, run the CI checks above and manually verify affected frontend flows.

## Commit & Pull Request Guidelines

Follow history's prefixes: `feat:`, `fix:`, `docs:`, and `chore:`. Release automation derives version bumps from commit messages. Keep commits focused. Include a change summary, linked issues when applicable, validation results, and screenshots for UI changes in pull requests.

## Security & Configuration Tips

Copy `.env.example` to `.env` for Docker, or `backend/.env.example` to `backend/.env` for local backend development. Match `DB_DSN` credentials to the database configuration. Keep credentials, private keys, uploads, and backups out of commits.
