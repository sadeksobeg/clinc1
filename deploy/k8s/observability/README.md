# Kubernetes Observability Blueprint

This folder defines the production blueprint for P4 hybrid observability.

## Recommended Objects

- `Namespace` `observability`
- `ConfigMap` for OTEL, Loki, Tempo config
- `Secret` for Sentry/Grafana/admin credentials
- `Deployment` `otel-collector` (+ HPA)
- `StatefulSet` `loki`
- `StatefulSet` `tempo`
- `Deployment` `grafana`
- `Service` for each component
- `Ingress` (private/internal) for Grafana and OTLP HTTP

## Baseline Resource Requests

- otel-collector: `500m` CPU / `512Mi` RAM
- loki: `1` CPU / `2Gi` RAM
- tempo: `1` CPU / `2Gi` RAM
- grafana: `250m` CPU / `512Mi` RAM

## Storage

- Loki PVC: 100Gi SSD
- Tempo PVC: 100Gi SSD
- Expand based on retention and ingestion patterns.
