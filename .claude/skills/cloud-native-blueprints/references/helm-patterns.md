# Helm Chart Development Patterns

Complete guide for creating production-ready Helm charts.

## Chart Structure

```
chart-name/
├── Chart.yaml              # Chart metadata (name, version, description)
├── values.yaml             # Default configuration values
├── .helmignore             # Files to exclude from packaging
└── templates/
    ├── deployment.yaml     # Workload deployments
    ├── service.yaml        # Service definitions
    ├── ingress.yaml        # Ingress rules
    ├── configmap.yaml      # Configuration data
    ├── secrets.yaml        # Sensitive data (never commit actual secrets)
    ├── hpa.yaml            # Horizontal Pod Autoscaler
    ├── serviceaccount.yaml  # RBAC service accounts
    └── tests/
        └── test.yaml       # Helm tests
```

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Chart name | lowercase, hyphens | `my-app-chart` |
| Release name | lowercase, hyphens | `myapp-production` |
| Namespace | lowercase, hyphens | `myapp-production` |
| Labels | lowercase, hyphens | `app: my-app` |

## Values Schema

```yaml
# Global values (shared across subcharts)
global:
  imageRegistry: registry.example.com
  imagePullSecrets:
    - name: registry-secret

# Application-specific values
replicaCount: 2

image:
  repository: myapp
  tag: "1.0.0"
  pullPolicy: IfNotPresent

nameOverride: ""
fullnameOverride: ""

serviceAccount:
  create: true
  annotations: {}
  name: ""

podAnnotations: {}

podSecurityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 1000

securityContext:
  allowPrivilegeEscalation: false
  capabilities:
    drop:
    - ALL
  readOnlyRootFilesystem: true

service:
  type: ClusterIP
  port: 80
  targetPort: http

ingress:
  enabled: false
  className: "nginx"
  annotations: {}
    # cert-manager.io/cluster-issuer: "letsencrypt-prod"
  hosts:
    - host: chart-example.local
      paths:
        - path: /
          pathType: Prefix
  tls: []

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
  # targetMemoryUtilizationPercentage: 80

nodeSelector: {}

tolerations: []

affinity: {}
```

## Template Patterns

### Deployment Labels

```yaml
metadata:
  name: {{ include "myapp.fullname" . }}
  labels:
    {{- include "myapp.labels" . | nindent 4 }}
```

### Common Labels Helper

```yaml
{{/*
Expand the name of the chart.
*/}}
{{- define "myapp.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "myapp.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "myapp.labels" -}}
helm.sh/chart: {{ include "myapp.chart" . }}
{{ include "myapp.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "myapp.selectorLabels" -}}
app.kubernetes.io/name: {{ include "myapp.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
```

### Probes

```yaml
livenessProbe:
  {{- if .Values.livenessProbe.enabled }}
  httpGet:
    path: {{ .Values.livenessProbe.path }}
    port: {{ .Values.service.targetPort }}
    scheme: {{ .Values.livenessProbe.scheme | default "HTTP" | upper }}
  initialDelaySeconds: {{ .Values.livenessProbe.initialDelaySeconds }}
  periodSeconds: {{ .Values.livenessProbe.periodSeconds }}
  successThreshold: {{ .Values.livenessProbe.successThreshold }}
  failureThreshold: {{ .Values.livenessProbe.failureThreshold }}
  timeoutSeconds: {{ .Values.livenessProbe.timeoutSeconds }}
  {{- end }}
```

## Multi-Container Pods

```yaml
spec:
  containers:
  - name: main-app
    image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
    ports:
    - containerPort: {{ .Values.service.targetPort }}
  - name: sidecar
    image: "{{ .Values.sidecar.image.repository }}:{{ .Values.sidecar.image.tag }}"
    ports:
    - containerPort: {{ .Values.sidecar.port }}
```

## Init Containers

```yaml
spec:
  initContainers:
  - name: init-db
    image: postgres:15
    command:
    - sh
    - -c |
      until pg_isready -h $DB_HOST -p $DB_PORT; do
        echo "Waiting for database..."
        sleep 2
      done
    env:
    - name: DB_HOST
      value: {{ .Values.database.host }}
    - name: DB_PORT
      value: {{ .Values.database.port | quote }}
```

## Volume Mounts

```yaml
volumes:
  - name: config
    configMap:
      name: {{ include "myapp.fullname" . }}-config
  - name: data
    persistentVolumeClaim:
      claimName: {{ .Values.persistence.existingClaim | default (include "myapp.fullname" .) }}
volumeMounts:
  - name: config
    mountPath: /etc/app/config
  - name: data
    mountPath: /data
```

## Common Mistakes

1. **Not using `--dry-run` before upgrade** - Always verify manifests
2. **Missing resource limits** - Pods can consume unlimited cluster resources
3. **Using `latest` tag in production** - Causes unpredictable deployments
4. **Storing secrets in values.yaml** - Use Kubernetes secrets or external management
5. **Hardcoded environment names** - Use template functions for flexibility
6. **No health probes** - Broken pods won't restart automatically
7. **Missing label selectors** - Services won't route to pods correctly

## Useful Template Functions

```yaml
{{ .Release.Name }}           # Release name
{{ .Release.Namespace }}      # Release namespace
{{ .Chart.Name }}            # Chart name
{{ .Chart.Version }}         # Chart version
{{ .Values.custom.value }}   # Access values
{{ include "myapp.func" . }}  # Call named template
{{ .Capabilities.APIVersion.Has "apps/v1" }}  # Check API version
{{ default "val" .Values.key }}  # Default value
{{ required "Required" .Values.someKey }}  # Required value
{{ tpl "templates/_helpers.tpl" . }}  # Template string
```

## Testing

```bash
# Lint the chart
helm lint ./chart-name

# Dry-run installation
helm install test ./chart-name --dry-run --debug

# Render templates
helm template test ./chart-name -f values.custom.yaml

# Run Helm tests
helm test test -n namespace
```

## Best Practices

1. **Use 3-digit SemVer** for chart versions (e.g., 1.0.2)
2. **Align appVersion with image tag** for consistency
3. **Document all values** with inline comments
4. **Provide sensible defaults** for all values
5. **Support multiple environments** (dev, staging, prod)
6. **Use Helm hooks** for pre/post install/upgrade logic
7. **Include resource quotas** for multi-team clusters
8. **Network policies** for security isolation
9. **Pod disruption budgets** for high availability
10. **RBAC** for least-privilege access
