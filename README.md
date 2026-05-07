# Compliantly Next.js

Next.js App Router frontend for the Compliantly Go backend.

## Run

```powershell
npm install
npm run dev
```

Default UI URL is `http://localhost:3000`.

Set `NEXT_PUBLIC_API_BASE_URL` to the Go backend base URL. During local development, the default app settings use `/api`, and `next.config.ts` proxies `/api/*` to `NEXT_PUBLIC_API_BASE_URL` or `COMPLIANCE_API_PROXY_TARGET`.

## Docker

```powershell
docker build -t compliantly-next .
docker run --rm -p 3000:3000 -e COMPLIANCE_API_PROXY_TARGET=http://host.docker.internal:8080 compliantly-next
```

For a Linux host running the Go backend in Docker, set `COMPLIANCE_API_PROXY_TARGET` to the backend service URL on the Docker network, for example `http://compliantly-go:8080`.
