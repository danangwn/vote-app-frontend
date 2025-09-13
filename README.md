# Vote App Frontend

This is the frontend service for the Vote App built with Next.js and TypeScript.

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/danangwn/vote-app-frontend.git
cd vote-app-frontend
```

### 2. Install dependencies

```bash
npm install
# or
yarn
# or
pnpm install
```

### 3. Configure environment variables

Copy the example file and update with your values:

```bash
cp env.example .env.local
```

Edit `.env.local`, example:

```
NEXT_PUBLIC_API_BASE_URL=https://api.your-backend.com
# example keys you might need:
# NEXT_PUBLIC_AUTH_TOKEN_KEY=your_auth_key
```

### 4. Run the app locally

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Frontend is available at:

```
http://localhost:3000
```

---

## Run with Docker (if set up)

If you have a Docker setup (optional):

1. Copy the env file:

    ```bash
    cp env.example .env.local
    ```

2. Build and start:

    ```bash
    docker-compose up --build -d
    ```

3. Stop services:

    ```bash
    docker-compose down
    ```

---

## ✅ Notes

- The frontend expects an API backend; make sure your backend is running and the `NEXT_PUBLIC_API_BASE_URL` is correctly configured.
- Use strong secrets / tokens in your env variables.
- If building for production, do `npm run build` then `npm run start`.

---

## Available Scripts

| Script   | Description                           |
|----------|---------------------------------------|
| `dev`    | Run development server                |
| `build`  | Build app for production              |
| `start`  | Start app in production mode          |
| `lint`   | Linting (if ESLint / other tools in use)|

---

## Project Structure (high-level)

```
.
├─ app/                # Next.js App Router pages & layouts
├─ public/             # Static public files (images, icons, etc.)
├─ src/                # Source code
├─ styles/             # CSS / styling / global styles
├─ package.json
├─ tsconfig.json
├─ .env.local
└─ README.md
```

---

## License

Specify your license here, e.g.:

```
MIT © Your Name
```
