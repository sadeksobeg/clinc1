# قائمة تفعيل Ollama في الإنتاج (المرحلة D)

## متطلبات VPS

- Ubuntu 22.04+، 8 vCPU / 16 GB RAM كبداية لـ `qwen2.5:7b`
- منفذ `11434` على `127.0.0.1` فقط

## التثبيت

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:7b
curl -s http://127.0.0.1:11434/api/tags
```

## إعداد ops-dashboard (Docker)

في `.env.prod`:

```env
OLLAMA_URL=http://172.16.1.1:11434
OLLAMA_MODEL=qwen2.5:7b
```

(استخدم gateway IPv4 لشبكة compose — نفس نمط `BRIDGE_INTERNAL_URL`.)

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d ops-dashboard
```

## اختبار

```bash
TOKEN="$(grep '^SCHEDULING_SERVICE_TOKEN=' .env.prod | cut -d= -f2-)"
curl -sS -X POST http://127.0.0.1:3001/api/internal/scheduling/interpret \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"بدي موعد بكرا للدكتور"}' | head -c 400
```

توقع `"source":"ollama"` أو fallback `"heuristic"` إن Ollama معطّل.

## تقييم عربي (يدوي)

- 20 جملة حجز/طوارئ/استفسار — سجّل دقة `intent` مقابل التوقع.
- هدف: ≥ 80% قبل الاعتماد على AI للردود الحساسة.

## عزل مستأجرين (اختياري — D3)

راجع [`docs/ADR-004-postgres-rls-tenant-isolation.md`](ADR-004-postgres-rls-tenant-isolation.md) قبل تفعيل RLS.
