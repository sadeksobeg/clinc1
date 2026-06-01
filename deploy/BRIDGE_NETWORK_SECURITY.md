# Bridge network security (port 3100)

The WhatsApp bridge listens on `BRIDGE_PORT` (default **3100**). It must **not** be reachable from the public internet.

## Recommended VPS layout

1. **Firewall (ufw)**  
   - Deny inbound `3100` from WAN.  
   - Allow from Docker bridge / localhost only.  
   - Helper: [`scripts/ufw-allow-bridge-from-docker.sh`](../scripts/ufw-allow-bridge-from-docker.sh)

2. **Bind address**  
   - `BRIDGE_BIND_HOST=0.0.0.0` is OK **only** when the host firewall blocks WAN.  
   - ops-dashboard in Docker reaches the bridge via `host.docker.internal:3100`.

3. **Authentication**  
   - Set `BRIDGE_SEND_API_TOKEN` (≥32 random chars) in production.  
   - Match `BRIDGE_SEND_TOKEN` in ops-dashboard.

4. **Reverse proxy**  
   - Do **not** expose `/send`, `/metrics`, or port 3100 through nginx to the public.

## Verification

```bash
# From outside the server — should fail or time out
curl -sS --connect-timeout 3 http://YOUR_PUBLIC_IP:3100/health

# From the host — should succeed
curl -sS http://127.0.0.1:3100/health

# From ops container (if using compose)
docker compose -f docker-compose.prod.yml --env-file .env.prod exec ops-dashboard \
  wget -qO- http://host.docker.internal:3100/health
```
