# AIOps Commands Reference

Complete reference for kubectl-ai, Kagent, and Docker Gordon commands.

## kubectl-ai

### Installation

```bash
# Via Krew (recommended)
kubectl krew index add googlecloudplatform https://github.com/GoogleCloudPlatform/kubectl-ai
kubectl krew install ai

# Via Go
go install github.com/GoogleCloudPlatform/kubectl-ai@latest

# Verify installation
kubectl-ai --help
```

### Configuration

```bash
# Set API key
export GOOGLE_GENAI_USE_GEMINI=true
export GOOGLE_API_KEY="your-api-key-here"
export GEMINI_MODEL="gemini-2.0-flash"  # or gemini-2.5-flash

# Interactive mode
kubectl-ai
```

### Command Patterns

#### Deployment

```bash
# Create deployment
kubectl-ai "create a deployment named nginx with 3 replicas"

# Scale deployment
kubectl-ai "scale backend deployment to 5 replicas"

# Create HPA
kubectl-ai "create horizontal pod autoscaler for frontend when CPU > 70%"

# Update image
kubectl-ai "update backend deployment image to v2.0"
```

#### Troubleshooting

```bash
# Debug issues
kubectl-ai "why are pods in CrashLoopBackOff state"

# Check logs
kubectl-ai "show logs from backend pods with errors in last 5 minutes"

# Resource analysis
kubectl-ai "what's using the most memory in default namespace"

# Connectivity
kubectl-ai "can frontend service reach backend pods"
```

#### Service Management

```bash
# Create service
kubectl-ai "expose deployment backend as service type LoadBalancer"

# Create ingress
kubectl-ai "create ingress for app.example.com routing to backend service"

# Network policies
kubectl-ai "create network policy allowing frontend to talk to backend"
```

#### Configuration

```bash
# ConfigMap
kubectl-ai "create configmap with app settings from file config.yaml"

# Secrets
kubectl-ai "create secret from env file .env.production"

# RBAC
kubectl-ai "create service account with cluster-admin role"
```

## Kagent

### Installation

```bash
# Clone repository
git clone https://github.com/infracloudio/kagent.git
cd kagent

# Install dependencies
pip install -r requirements.txt

# Configure for your cluster
export KUBECONFIG=~/.kube/config
export OPENAI_API_KEY="your-key"  # or local model
```

### Agent Tools

Kagent includes built-in MCP-style tools:

| Tool | Purpose |
|------|---------|
| `k8s_get_pods` | List pods with filtering |
| `k8s_get_pod_logs` | Fetch logs from pods |
| `k8s_describe_resource` | Describe resources in detail |
| `k8s_apply_manifest` | Apply Kubernetes manifests |
| `k8s_check_service_connectivity` | Test service routing |
| `k8s_get_events` | Pull cluster events |
| `k8s_delete_resource` | Remove resources safely |
| `prometheus_query` | Run Prometheus queries |

### Agent Interactions

```bash
# Analyze cluster health
kagent "analyze the cluster health and suggest optimizations"

# Debug service issues
kagent "investigate why nginx-service is not routing to pods"

# Resource optimization
kagent "identify pods with high memory usage and suggest downscaling"

# Security audit
kagent "check for any security vulnerabilities in our deployments"
```

### Configuration

```yaml
# config.yaml
model:
  provider: "openai"  # or "local" for ollama
  model: "gpt-4"
  temperature: 0.7

kubernetes:
  kubeconfig: ~/.kube/config
  context: default

tools:
  - k8s_get_pods
  - k8s_get_pod_logs
  - k8s_apply_manifest
  - prometheus_query
```

## Docker Gordon (AI Agent)

### Installation

```bash
# Install Docker Desktop 4.53+
# Go to Settings → Experimental Features → Enable Gordon
# Restart Docker Desktop

# Verify
docker ai "What can you do?"
```

### Command Patterns

#### Dockerfile Optimization

```bash
docker ai "optimize this Dockerfile for smaller image size"

docker ai "convert to multi-stage build for better caching"

docker ai "reduce the number of layers in this Dockerfile"
```

#### Container Operations

```bash
docker ai "run a PostgreSQL container with persistent volume"

docker ai "create network for my microservices architecture"

docker ai "compose file for frontend, backend, and database"
```

#### Troubleshooting

```bash
docker ai "why is my container crashing on startup"

docker ai "show resource usage for all running containers"

docker ai "which containers have exposed ports"
```

#### Best Practices

```bash
docker ai "what's the best base image for Python FastAPI app"

docker ai "recommend security hardening for production containers"

docker ai "scan these images for vulnerabilities"
```

## Workflow Integration

### Example AIOps Workflow

```bash
# 1. Generate deployment spec
kubectl-ai "create deployment for FastAPI backend with 3 replicas"

# 2. Optimize Dockerfile
docker ai "optimize the backend Dockerfile for production"

# 3. Deploy with verification
kagent "deploy the app and verify all pods are healthy"

# 4. Monitor and optimize
kubectl-ai "check resource usage and suggest HPA thresholds"
```

### CI/CD Integration

```yaml
name: AIOps Deployment
on: [push]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Generate K8s manifests
        run: |
          kubectl-ai --quiet "create deployment for $APP_NAME with $REPLICAS replicas" > manifest.yaml

      - name: Validate manifests
        run: |
          kubectl apply --dry-run=client -f manifest.yaml

      - name: Deploy
        run: |
          kubectl apply -f manifest.yaml

      - name: Verify health
        run: |
          kagent "verify deployment is healthy and accessible"
```

## Tips and Tricks

1. **Be specific** - More details in prompts = better results
2. **Iterate** - Refine prompts based on initial output
3. **Verify** - Always review generated commands before execution
4. **Use quiet mode** - `--quiet` flag for automated workflows
5. **Skip permissions** - `--skip-permissions` for dry-runs
6. **Model selection** - Use faster models (gemini-2.5-flash) for development
7. **Context awareness** - Agents learn from previous commands in session
8. **Combine tools** - Use kubectl-ai for generation, Kagent for analysis
9. **Local testing** - Test with Minikube before production
10. **Version control** - Track generated manifests in Git

## Common Issues

### kubectl-ai fails

```
Error: context deadline exceeded
Solution: Increase timeout or use faster model
```

### Gordon not responding

```
Error: Gordon feature not enabled
Solution: Enable in Docker Desktop → Settings → Experimental
```

### Kagent tool errors

```
Error: forbidden on namespace
Solution: Check RBAC permissions and service account
```

## Resources

- kubectl-ai: https://github.com/GoogleCloudPlatform/kubectl-ai
- Kagent: https://github.com/infracloudio/kagent
- Docker Gordon: https://docs.docker.com/ai/gordon/
