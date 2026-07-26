# Common Pitfalls (From Real Deployment Experience)

Based on TeamFlow's Minikube deployment, these are the most common issues encountered when deploying containerized applications to Kubernetes.

---

## Pitfall 1: Not Enabling Standalone Output in Next.js

**Problem:** Docker build fails with confusing error messages.

```bash
ERROR: Standalone output mode not enabled
```

**Root Cause:** Next.js standalone mode optimizes the Docker image by only including necessary files. Without it, the build process may fail or create bloated images.

**Fix:** Add to `next.config.ts` or `next.config.js`:

```typescript
const nextConfig = {
  output: 'standalone',
}
```

**Verification:** After enabling, your build should produce a `.next/standalone` directory.

---

## Pitfall 2: Building Images in Wrong Docker Daemon

**Problem:** Minikube can't find images, pods stuck in `ImagePullBackOff` state.

```bash
Warning: Failed to pull image: Back-off pulling image
kubectl get pods
NAME                      READY   STATUS             RESTARTS   AGE
backend-7f8d9c4b-x9k2p    0/1     ImagePullBackOff   0          2m
```

**Root Cause:** You built the image on your host Docker daemon, but Minikube runs its own Docker daemon inside the VM. They don't share images.

**Fix:** Build images inside Minikube's Docker daemon:

```bash
# Switch to Minikube's Docker daemon
eval $(minikube docker-env)

# Now build images (they'll be available to Minikube)
docker build -t teamflow/backend:latest ./backend
docker build -t teamflow/frontend:latest ./frontend

# Verify images exist
docker images | grep teamflow

# Deploy with Helm (skips pull since images exist locally)
helm install teamflow ./helm/teamflow -n teamflow --create-namespace
```

**To switch back to host Docker:**
```bash
eval $(minikube docker-env -u)
```

---

## Pitfall 3: Missing .dockerignore

**Problem:** Docker images are 2GB+ (bloated with node_modules, .next, git files).

```bash
docker images
REPOSITORY           SIZE
teamflow/backend     2.1GB   # Way too large!
teamflow/frontend    3.5GB   # Should be ~200MB
```

**Root Cause:** Without `.dockerignore`, Docker copies ALL files (including dependencies you'll install inside the container).

**Fix:** Create `.dockerignore` in each project root:

**Backend (.dockerignore):**
```
__pycache__
*.pyc
*.pyo
*.pyd
.Python
*.so
*.egg
*.egg-info
dist
build
.eggs
venv/
env/
ENV/
.git
.gitignore
*.md
.vscode
.idea
```

**Frontend (.dockerignore):**
```
node_modules/
.next/
.git/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.vscode
.idea
.DS_Store
*.md
```

**Expected Results:**
- Backend image: ~150-300MB (Python + dependencies)
- Frontend image: ~200-400MB (Node.js + dependencies)

---

## Pitfall 4: Empty String vs Undefined in JavaScript

**Problem:** API calls go to `localhost:8000` instead of relative paths in production.

```typescript
// WRONG - Empty string is falsy, falls back to localhost
const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// In production with NEXT_PUBLIC_API_URL=""
// baseURL becomes 'http://localhost:8000' - WRONG!
```

**Root Cause:** Empty string `""` is falsy in JavaScript, so the `||` operator treats it as "no value" and uses the fallback.

**Fix:**
```typescript
// CORRECT - Empty string is valid for relative paths
const baseURL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

// OR: Explicitly check for undefined
const baseURL = process.env.NEXT_PUBLIC_API_URL !== undefined
  ? process.env.NEXT_PUBLIC_API_URL
  : 'http://localhost:8000';

// Best: Use nullish coalescing (??)
const baseURL = process.env.NEXT_PUBLIC_API_URL ?? '';
```

**Environment Variables:**
```bash
# For production (relative paths - empty string)
NEXT_PUBLIC_API_URL=

# For local development (explicit backend URL)
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Pitfall 5: Forgetting to Enable Ingress Addon

**Problem:** Can only access services via port-forward; no ingress routes work.

```bash
kubectl get ingress
NAME              CLASS   HOSTS             ADDRESS   PORTS   AGE
app-ingress       nginx   app.local                   80      5m

# But curl app.local doesn't work!
curl app.local
curl: (6) Could not resolve host: app.local
```

**Root Cause:** Minikube ingress addon creates the NGINX ingress controller. Without it, Ingress resources are created but no controller processes them.

**Fix:**
```bash
# Enable ingress addon
minikube addons enable ingress

# Verify ingress controller is running
kubectl get pods -n ingress-nginx
NAME                                       READY   STATUS    AGE
ingress-nginx-controller-xxxxx-xxxxx       1/1     Running   30s

# Now access your app
minikube service myapp -n myapp
```

---

## Pitfall 6: Service Tunnel URL Changes

**Problem:** Minikube service tunnel URL changes after restart; previous URLs no longer work.

```bash
# First session
minikube service teamflow-frontend -n teamflow
# Opening service default/teamflow-frontend in default browser...
# http://192.168.49.2:31234

# After minikube stop && minikube start
minikube service teamflow-frontend -n teamflow
# Opening service default/teamflow-frontend in default browser...
# http://192.168.49.2:32567  # Port changed!
```

**Root Cause:** Minikube dynamically assigns NodePorts on restart. Previous URLs may reference old ports.

**Solutions:**

**Option 1: Re-run service command (easiest)**
```bash
minikube service myapp -n myapp
```

**Option 2: Use Ingress (recommended for production)**
```bash
# Add ingress addon (if not enabled)
minikube addons enable ingress

# Create ingress with stable hostname
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp-ingress
spec:
  rules:
  - host: myapp.local
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: myapp-service
            port:
              number: 80
EOF

# Add to /etc/hosts
echo "$(minikube ip) myapp.local" | sudo tee -a /etc/hosts
```

**Option 3: Use Minikube tunnel (for LoadBalancer)**
```bash
# Run in separate terminal
minikube tunnel

# Now LoadBalancer gets stable IP
kubectl get svc
NAME           TYPE           EXTERNAL-IP      PORT(S)
myapp-service  LoadBalancer   10.96.123.45     80:31234/TCP
```

---

## Additional Troubleshooting

### Pod stuck in Pending state

```bash
kubectl describe pod pod-name -n namespace

# Common causes:
# 1. Insufficient resources
# 2. Node selector not matching
# 3. PersistentVolume not bound
```

### Container restart loop

```bash
kubectl logs pod-name -n namespace --previous

# Check:
# 1. Application logs for errors
# 2. Resource limits (OOM killed)
# 3. Health check endpoints
```

### DNS resolution issues

```bash
# Test DNS from within pod
kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup service-name.namespace

# Check kube-dns is running
kubectl get pods -n kube-system | grep dns
```

---

## Prevention Checklist

Before deploying, verify:

- [ ] Next.js has `output: 'standalone'` in config
- [ ] `.dockerignore` files exist in all projects
- [ ] Using `??` instead of `||` for optional env vars
- [ ] Ingress addon enabled (`minikube addons enable ingress`)
- [ ] Building images in Minikube's Docker daemon (`eval $(minikube docker-env)`)
- [ ] Document service URLs (they change on restart)

---

## Further Reading

- **Kubernetes Troubleshooting**: [kubernetes.io/docs/tasks/debug/](https://kubernetes.io/docs/tasks/debug/)
- **Minikube Addons**: [minikube.sigs.k8s.io/docs/handbook/addons/](https://minikube.sigs.k8s.io/docs/handbook/addons/)
- **Docker Best Practices**: [docs.docker.com/build/building/best-practices/](https://docs.docker.com/build/building/best-practices/)
- **TeamFlow Deployment Pitfalls**: See `deployment-pitfalls.md` for detailed debugging

---

**Last Updated**: January 20, 2026
**Source**: Real-world Minikube deployment experience from TeamFlow project
