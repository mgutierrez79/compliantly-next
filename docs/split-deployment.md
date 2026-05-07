# Split Deployment

Use the frontend and backend as separate services when customers may place them on different hosts or networks.

Recommended topology:

```text
browser -> https://app.example.com -> Next.js frontend -> https://api.internal.example.com:8080 -> Go backend
```

The browser only reaches the Next.js frontend. The Next.js `/api/*` route proxies requests to the Go backend and presents the frontend client certificate for mTLS.

## Frontend Host

Copy the frontend client certificate, frontend client key, and backend server CA into a local secrets directory:

```sh
mkdir -p secrets
cp /secure-source/frontend-client.crt secrets/frontend-client.crt
cp /secure-source/frontend-client.key secrets/frontend-client.key
cp /secure-source/backend-ca.crt secrets/backend-ca.crt
chmod 0400 secrets/frontend-client.key
```

Start the frontend container:

```sh
COMPLIANCE_API_PROXY_TARGET=https://api.internal.example.com:8080 \
COMPLIANCE_API_PROXY_SERVER_NAME=api.internal.example.com \
COMPLIANCE_FRONTEND_TLS_DIR=./secrets \
docker compose -f docker-compose.frontend.yml up -d --build
```

Terminate browser-facing TLS with a reverse proxy or load balancer in front of port `3000`. That TLS certificate is separate from the backend mTLS certificates.

## Backend Target

`COMPLIANCE_API_PROXY_TARGET` must point at the private Go backend URL. The hostname in that URL, or `COMPLIANCE_API_PROXY_SERVER_NAME`, must match the backend server certificate SAN.

The frontend sends normal application auth headers through the proxy. mTLS authenticates the frontend service to the backend, while API key, local auth, or OIDC bearer tokens still authorize the user request.

## Smoke Tests

From the frontend host:

```sh
curl -fsS http://127.0.0.1:3000/api/v1/health
curl -fsS -H "Authorization: Bearer change-me" http://127.0.0.1:3000/api/v1/auth/me
```

If these fail with a `502`, check certificate paths, backend DNS, backend firewall rules, and the backend server certificate SAN.
