# Compliantly Next.js

Next.js App Router frontend for the Compliantly Go backend.

## Run

```powershell
npm install
npm run dev
```

Default UI URL is `http://localhost:3000`.

Keep `NEXT_PUBLIC_API_BASE_URL=/api` when the UI should use the built-in server-side proxy. Set `COMPLIANCE_API_PROXY_TARGET` to the Go backend base URL.

## Docker

```powershell
docker build -t compliantly-next .
docker run --rm -p 3000:3000 -e COMPLIANCE_API_PROXY_TARGET=http://host.docker.internal:8080 compliantly-next
```

For a Linux host running the Go backend in Docker, set `COMPLIANCE_API_PROXY_TARGET` to the backend service URL on the Docker network, for example `http://compliantly-go:8080`.

## Backend mTLS

The `/api/*` proxy can present a client certificate to the Go backend. Mount the frontend client certificate/key and backend CA into the container, then set:

```powershell
docker run --rm -p 3000:3000 `
  -e COMPLIANCE_API_PROXY_TARGET=https://compliantly-go:8080 `
  -e COMPLIANCE_API_PROXY_CLIENT_CERT_FILE=/run/secrets/compliantly-frontend.crt `
  -e COMPLIANCE_API_PROXY_CLIENT_KEY_FILE=/run/secrets/compliantly-frontend.key `
  -e COMPLIANCE_API_PROXY_CA_FILE=/run/secrets/compliantly-backend-ca.crt `
  -e COMPLIANCE_API_PROXY_SERVER_NAME=compliantly-go `
  compliantly-next
```

Use `COMPLIANCE_API_PROXY_INSECURE_SKIP_VERIFY=1` only for short-lived local testing with throwaway certificates.
