---
name: cloud-native-blueprints
description: |
  Deploy containerized applications to Kubernetes using production-ready Helm charts
  and Dapr event-driven patterns. Use when: (1) deploying apps to K8s clusters, (2) creating
  Helm charts from scratch, (3) configuring Dapr components for pub/sub messaging,
  (4) setting up service mesh patterns, or (5) implementing AIOps with kubectl-ai/kagent.
  Encodes best practices for Minikube local dev and AKS/GKE cloud deployments.
---

# Cloud-Native Deployment Blueprints

Deploy applications to Kubernetes with battle-tested patterns for Helm charts, Dapr integration, and AIOps workflows.

## Before Implementation

| Source | Gather |
|--------|--------|
| **Codebase** | Existing Dockerfiles, deployment configs, infrastructure patterns |
| **Conversation** | Target cluster (Minikube/AKS/GKE), deployment constraints, existing Dapr setup |
| **Skill References** | Helm/K8s/Dapr best practices, AIOps command patterns from `references/` |
| **User Guidelines** | Project-specific naming, resource limits, labeling conventions |

Ensure all required context is gathered before implementing.

---

## Quick Start

**Sources:** [minikube.sigs.k8s.io/docs/start/](https://minikube.sigs.k8s.io/docs/start/) | [helm.sh/docs/intro/install/](https://helm.sh/docs/intro/install/)

### Minikube Local Development

```bash
# 1. Start Minikube with sufficient resources
minikube start --cpus=4 --memory=8192 --driver=docker

# 2. Enable required addons
minikube addons enable ingress
minikube addons enable metrics-server

# 3. Use Minikube's Docker daemon (for local images)
eval $(minikube docker-env)

# 4. Build images inside Minikube
docker build -t app-name:latest .

# 5. Deploy with Helm
helm install myapp ./helm/myapp --namespace myapp --create-namespace
```

### Prerequisites Installation

**Minikube (Linux - Binary Download):**
```bash
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube && rm minikube-linux-amd64
```

**kubectl (Linux):**
```bash
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl
sudo mv kubectl /usr/local/bin/
```

**Helm (Linux - Script):**
```bash
curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
chmod 700 get_helm.sh
./get_helm.sh
```

**Alternative: Package Managers**
```bash
# Debian/Ubuntu - Helm via APT
sudo apt-get update
sudo apt-get install -y apt-transport-https gnupg curl
curl https://baltocdn.com/helm/signing.asc | gpg --dearmor | sudo tee /usr/share/keyrings/helm.gpg > /dev/null
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/helm.gpg] https://baltocdn.com/helm/stable/debian/ all main" | sudo tee /etc/apt/sources.list.d/helm-stable-debian.list
sudo apt-get update
sudo apt-get install helm
```

### Cloud Deployment (AKS/GKE)

```bash
# 1. Get cluster credentials
az aks get-credentials --resource-group rg --name cluster  # AKS
gcloud container clusters get-credentials cluster --zone zone  # GKE

# 2. Install Dapr on cluster
dapr init -k --runtime-version 1.14.0

# 3. Deploy application
helm upgrade --install myapp ./helm/myapp --namespace prod --create-namespace
```

---

## Required Clarifications

1. **Target Environment** - Minikube (local) or AKS/GKE/OKE (cloud)?
2. **Application Type** - Stateful service, stateless API, or worker?
3. **Image Source** - Local build, container registry, or public image?
4. **Dapr Integration** - Need pub/sub, state management, or both?

## Optional Clarifications

5. **Resource Constraints** - CPU/memory limits for pods?
6. **High Availability** - Need multi-replica deployments?
7. **Ingress Requirements** - Custom domain, TLS certificates?
8. **Monitoring** - Prometheus/Grafana integration needed?

---

## Helm Chart Structure

```
helm/app-name/
├── Chart.yaml              # Chart metadata
├── values.yaml             # Default configuration
└── templates/
    ├── deployment.yaml     # Workload deployment
    ├── service.yaml        # Service exposure
    ├── ingress.yaml        # External access
    ├── configmap.yaml      # Configuration
    └── secrets.yaml        # Sensitive data
```

### Chart.yaml Template

```yaml
apiVersion: v2
name: app-name
description: Helm chart for AppName
version: 1.0.0
appVersion: "1.0"
```

### values.yaml Template

```yaml
replicaCount: 2

image:
  repository: your-registry/app-name
  tag: latest
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 80
  targetPort: 8000

resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 100m
    memory: 128Mi

autoscaling:
  enabled: false
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 80
```

### ⚠️ Important: Secrets Management

**NEVER commit actual secrets to git.** GitHub push protection will block commits containing API keys, passwords, or other secrets.

**Always use the example file pattern:**

```bash
# 1. Create example file with placeholders (committed to git)
cp values.yaml values.yaml.example
# Edit values.yaml.example to replace secrets with placeholders

# 2. Add actual values.yaml to .gitignore
echo "values.yaml" >> .gitignore

# 3. Commit the example file
git add values.yaml.example .gitignore
git commit -m "chore: Add values.yaml.example for reference"
```

**values.yaml.example** (safe to commit):
```yaml
secrets:
  databaseUrl: "postgresql://user:password@host:port/database?sslmode=require"
  openaiApiKey: "sk-proj-your-api-key-here"
  secretKey: "your-secret-key-here"
```

**values.yaml** (gitignored, actual secrets):
```yaml
secrets:
  databaseUrl: "postgresql://user:actual_password@host:port/database?sslmode=require"
  openaiApiKey: "sk-proj-actual-key-here"
  secretKey: "actual-secret-key"
```

**For new team members:**
```bash
cp values.yaml.example values.yaml
# Then edit values.yaml with actual secrets
```

For production, use Kubernetes Secrets instead of values files. See `references/deployment-pitfalls.md` for details.

---

## Deployment Template (Use assets/templates/deployment.yaml)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Values.name }}
  labels:
    app: {{ .Values.name }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app: {{ .Values.name }}
  template:
    metadata:
      labels:
        app: {{ .Values.name }}
    spec:
      containers:
      - name: {{ .Values.name }}
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
        ports:
        - containerPort: {{ .Values.service.targetPort }}
        resources:
          limits:
            cpu: {{ .Values.resources.limits.cpu }}
            memory: {{ .Values.resources.limits.memory }}
          requests:
            cpu: {{ .Values.resources.requests.cpu }}
            memory: {{ .Values.resources.requests.memory }}
        livenessProbe:
          httpGet:
            path: /health
            port: {{ .Values.service.targetPort }}
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: {{ .Values.service.targetPort }}
          initialDelaySeconds: 5
          periodSeconds: 5
```

---

## Dapr Integration

### Dapr Sidecar Injection

Add Dapr annotations to your pod template:

```yaml
annotations:
  dapr.io/enabled: "true"
  dapr.io/app-id: "{{ .Values.name }}"
  dapr.io/app-port: "{{ .Values.service.targetPort }}"
```

### Dapr Component Templates (Use assets/components/)

**Kafka Pub/Sub** (`assets/components/pubsub-kafka.yaml`):
```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: kafka-pubsub
  namespace: default
spec:
  type: pubsub.kafka
  version: v1
  metadata:
    - name: brokers
      value: "kafka-broker:9092"
    - name: consumerGroup
      value: "myapp-services"
    - name: authType
      value: "none"
```

**PostgreSQL State Store** (`assets/components/state-postgres.yaml`):
```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: statestore
  namespace: default
spec:
  type: state.postgresql
  version: v1
  metadata:
    - name: connectionString
      secretKeyRef:
        name: postgres-secret
        key: connectionstring
```

### Publishing Events (Python/FastAPI)

```python
import httpx

DAPR_HTTP_PORT = 3500

async def publish_event(topic: str, data: dict):
    """Publish event via Dapr PubSub (no Kafka client needed)."""
    async with httpx.AsyncClient() as client:
        await client.post(
            f"http://localhost:{DAPR_HTTP_PORT}/v1.0/publish/kafka-pubsub/{topic}",
            json=data
        )
```

### Subscribing to Events

```python
from fastapi import FastAPI, Request

app = FastAPI()

@app.get("/dapr/subscribe")
async def subscribe():
    """Dapr calls this to discover subscriptions."""
    return [
        {
            "pubsubname": "kafka-pubsub",
            "topic": "task-events",
            "route": "/api/events/task-events"
        }
    ]

@app.post("/api/events/task-events")
async def handle_task_event(request: Request):
    """Handle events published by Dapr."""
    event = await request.json()
    # Process event
    return {"status": "SUCCESS"}
```

---

## AIOps with kubectl-ai and Kagent

### kubectl-ai Commands

**Deployment:**
```bash
kubectl-ai "deploy backend with 3 replicas exposing port 8000"
kubectl-ai "create horizontal pod autoscaler for backend when CPU > 70%"
kubectl-ai "scale backend deployment to 5 replicas"
```

**Troubleshooting:**
```bash
kubectl-ai "why are the pods in pending state"
kubectl-ai "show logs from backend pods with errors"
kubectl-ai "check resource usage across all namespaces"
```

**Service Management:**
```bash
kubectl-ai "expose deployment backend as service type LoadBalancer"
kubectl-ai "create ingress rule for backend.example.com"
```

### Docker Gordon Commands

```bash
docker ai "optimize the backend Dockerfile for smaller image size"
docker ai "create multi-stage build for this Python FastAPI app"
docker ai "what's the best base image for production Next.js app"
```

### Kagent Analysis

```bash
kagent "analyze the cluster health and suggest optimizations"
kagent "identify pods with high memory usage"
kagent "check service connectivity between frontend and backend"
```

---

## Common Patterns

### Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: backend-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 80
```

### Ingress with TLS

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
  - hosts:
    - app.example.com
    secretName: app-tls
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: app-service
            port:
              number: 80
```

---

## Production Checklist

- [ ] Images built with multi-stage Dockerfile
- [ ] Resource limits and requests defined
- [ ] Health checks (liveness/readiness probes) configured
- [ ] Secrets managed via Kubernetes (not in values.yaml)
- [ ] Dapr components installed and configured
- [ ] HPA enabled for critical services
- [ ] Ingress with TLS certificates
- [ ] Monitoring and logging configured
- [ ] Helm chart linted (`helm lint`)
- [ ] Manifests validated (`helm template --dry-run`)

---

## Anti-Patterns

- **❌ Hardcoding environment-specific values** - Use values.yaml overrides
- **❌ Using `latest` tag in production** - Pin specific image versions
- **❌ No resource limits** - Pods can consume unlimited cluster resources
- **❌ Running as root in containers** - Use security contexts
- **❌ Secrets in values.yaml** - Use Kubernetes secrets or external secret managers
- **❌ Missing health probes** - Pods won't restart on failure
- **❌ Monolithic charts** - Split into logical subcharts

---

## Troubleshooting

### Helm Commands

```bash
# List releases
helm list -n namespace

# Get rendered manifests (dry-run)
helm template myapp ./helm/myapp -f values.prod.yaml

# Lint chart
helm lint ./helm/myapp

# Upgrade with new values
helm upgrade myapp ./helm/myapp -f values.prod.yaml --namespace prod

# Rollback to previous version
helm rollback myapp 1 -n prod

# Uninstall release
helm uninstall myapp -n namespace
```

### Dapr Commands

```bash
# Check Dapr installation
dapr status -k

# List Dapr components
kubectl get components -n dapr-system

# View Dapr logs
kubectl logs -l app=dapr-sidecar-injector -n dapr-system

# Restart Dapr sidecar
kubectl rollout restart deployment/myapp -n myapp
```

### kubectl Commands

```bash
# Get pod status
kubectl get pods -n namespace

# View pod logs
kubectl logs pod-name -n namespace

# Describe pod for events
kubectl describe pod pod-name -n namespace

# Exec into container
kubectl exec -it pod-name -n namespace -- /bin/sh

# Port forward to local
kubectl port-forward deployment/myapp 8000:8000 -n namespace
```

---

## See Also

### Available Reference Files
- `references/helm-patterns.md` - Complete Helm chart development patterns
- `references/dapr-components.md` - Dapr building blocks and configurations
- `references/aiops-commands.md` - kubectl-ai, kagent, and Gordon command reference
- `references/common-pitfalls.md` - **Common deployment pitfalls and solutions** ⚠️
- `references/deployment-pitfalls.md` - Real-world debugging: Minikube deployment issues and solutions

### Available Templates
- `assets/templates/deployment.yaml` - Production deployment template
- `assets/templates/service.yaml` - Service exposure template
- `assets/templates/ingress.yaml` - Ingress routing template
- `assets/templates/configmap.yaml` - ConfigMap template
- `assets/templates/secrets.yaml` - Kubernetes secrets template
- `assets/templates/_helpers.tpl` - Standard Helm helpers
- `assets/templates/namespace.yaml` - Namespace template

### Available Dapr Components
- `assets/components/pubsub-kafka.yaml` - Kafka pub/sub component
- `assets/components/state-postgres.yaml` - PostgreSQL state store
- `assets/components/secrets-k8s.yaml` - Kubernetes secrets for Dapr

---

## Sources and References

This skill is validated with official documentation and best practices from:

### Docker
- **Multi-Stage Builds**: [docs.docker.com/build/building/multi-stage/](https://docs.docker.com/build/building/multi-stage/)
- **Build Best Practices**: [docs.docker.com/build/building/best-practices/](https://docs.docker.com/build/building/best-practices/)

### Kubernetes & Minikube
- **Minikube Start Guide**: [minikube.sigs.k8s.io/docs/start/](https://minikube.sigs.k8s.io/docs/start/)
- **kubectl Installation**: [kubernetes.io/docs/tasks/tools/](https://kubernetes.io/docs/tasks/tools/)
- **Kubernetes Tutorials**: [kubernetes.io/docs/tutorials](https://kubernetes.io/docs/tutorials)

### Helm
- **Helm Installation**: [helm.sh/docs/intro/install/](https://helm.sh/docs/intro/install/)
- **Chart Template Guide**: [helm.sh/docs/chart_template_guide/getting_started](https://helm.sh/docs/chart_template_guide/getting_started)
- **Helm Charts 2025**: [Atmosly - Helm Charts Guide](http://atmosly.com/knowledge/helm-charts-in-kubernetes-definitive-guide-for-2025)

### Dapr
- **Dapr Documentation**: [docs.dapr.io](https://docs.dapr.io)
- **Dapr Getting Started**: [docs.dapr.io/getting-started](https://docs.dapr.io/getting-started)

### TeamFlow Project Resources
- **Local Dev Guide**: `LOCAL-DEV-GUIDE.md` - Step-by-step deployment
- **Cloud Native Learning**: `CLOUD-NATIVE-LEARNING-GUIDE.md` - Concepts explained
- **Architecture Plan**: `specs/001-k8s-minikube-deployment/plan.md` - Design decisions

**Last Updated:** January 20, 2026
**Validated With:** Tavily MCP, Context7 MCP, and official documentation
