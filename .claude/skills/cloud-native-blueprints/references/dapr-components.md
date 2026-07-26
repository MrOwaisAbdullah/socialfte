# Dapr Component Configurations

Complete reference for Dapr building blocks on Kubernetes.

## Installation

```bash
# Install Dapr CLI
curl -fsSL https://raw.githubusercontent.com/dapr/cli/master/install/install.sh | bash

# Initialize Dapr on Kubernetes
dapr init -k --runtime-version 1.14.0

# Verify installation
dapr status -k
kubectl get pods -n dapr-system
```

## Component Types

### 1. Pub/Sub (Message Brokers)

**Purpose:** Decouple services with publish-subscribe messaging patterns.

#### Kafka

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
      value: "myapp-consumers"
    - name: authRequired
      value: "false"
    # For SASL authentication:
    # - name: sasl
    #   value: "plain"
    # - name: saslUsername
    #   secretKeyRef:
    #     name: kafka-secret
    #     key: username
    # - name: saslPassword
    #   secretKeyRef:
    #     name: kafka-secret
    #     key: password
```

#### Redis Streams

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: pubsub
  namespace: default
spec:
  type: pubsub.redis
  version: v1
  metadata:
    - name: redisHost
      value: "localhost:6379"
    - name: redisPassword
      value: ""
```

#### Azure Service Bus

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: azure-servicebus
  namespace: default
spec:
  type: pubsub.azure.servicebus
  version: v1
  metadata:
    - name: connectionString
      secretKeyRef:
        name: azure-servicebus-secret
        key: connectionstring
```

### 2. State Stores

#### PostgreSQL

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

#### Redis

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: statestore
  namespace: default
spec:
  type: state.redis
  version: v1
  metadata:
    - name: redisHost
      value: "localhost:6379"
    - name: redisPassword
      value: ""
    - name: keyPrefix
      value: "myapp"
```

#### AWS DynamoDB

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: statestore
  namespace: default
spec:
  type: state.aws.dynamodb
  version: v1
  metadata:
    - name: AccessKey
      secretKeyRef:
        name: aws-credentials
        key: access_key
    - name: SecretKey
      secretKeyRef:
        name: aws-credentials
        key: secret_key
    - name: Region
      value: "us-west-2"
    - name: Table
      value: "app-state"
```

### 3. Secret Stores

#### Kubernetes Secrets

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: kubernetes-secrets
  namespace: default
spec:
  type: secretstores.kubernetes
  version: v1
  metadata:
    - name: caches
      value: ["cache-secret", "db-secret"]
```

#### Azure Key Vault

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: azure-keyvault
  namespace: default
spec:
  type: secretstores.azure.keyvault
  version: v1
  metadata:
    - name: vaultName
      value: "my-keyvault"
```

#### AWS Secrets Manager

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: aws-secrets
  namespace: default
spec:
  type: secretstores.aws.secretmanager
  version: v1
  metadata:
    - name: AccessKey
      secretKeyRef:
        name: aws-creds
        key: access_key
    - name: SecretKey
      secretKeyRef:
        name: aws-creds
        key: secret_key
    - name: Region
      value: "us-west-2"
```

### 4. Bindings

#### Cron (Scheduled Triggers)

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: daily-cron
  namespace: default
spec:
  type: bindings.cron
  version: v1
  metadata:
    - name: schedule
      value: "@daily"
```

#### HTTP (Webhook Triggers)

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: webhook
  namespace: default
spec:
  type: bindings.http
  version: v1
  metadata:
    - name: url
      value: "https://api.example.com/webhook"
```

## Configuration via Sidecar Injection

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  template:
    metadata:
      annotations:
        # Required for all Dapr-enabled apps
        dapr.io/enabled: "true"
        dapr.io/app-id: "myapp"
        dapr.io/app-port: "8080"

        # Optional configurations
        dapr.io/enable-metrics: "true"
        dapr.io/metrics-port: "9090"
        dapr.io/log-level: "info"
        dapr.io/sidecar-cpu-limit: "0.5"
        dapr.io/sidecar-memory-limit: "256Mi"
        dapr.io/sidecar-readiness-probe: "/healthz"
        dapr.io/sidecar-liveness-probe: "/healthz"

        # Component-specific configuration
        dapr.io/app-protocol: "http"  # or grpc
        dapr.io/enable-api-logging: "true"
```

## API Endpoints

### Service Invocation

```bash
# Invoke service (HTTP)
POST http://localhost:3500/v1.0/invoke/myapp/method/api/method

# Invoke service (gRPC)
POST http://localhost:3500/v1.0/invoke/myapp/method/MyService/MyMethod
```

### State Management

```bash
# Save state
POST http://localhost:3500/v1.0/state/statestore
[
  {"key": "user-1", "value": {"name": "John"}},
  {"key": "user-2", "value": {"name": "Jane"}}
]

# Get state
GET http://localhost:3500/v1.0/state/statestore/user-1

# Delete state
DELETE http://localhost:3500/v1.0/state/statestore/user-1
```

### Publish/Subscribe

```bash
# Publish event
POST http://localhost:3500/v1.0/publish/pubsub/mytopic
{"data": {"message": "hello"}}

# Subscribe (configure in app)
GET /dapr/subscribe
```

## Actor (Stateful Entities)

```yaml
# Actor configuration via annotation
dapr.io/actors: |
  [
    {
      "entities": [
        {
          "name": "MyActor",
          "type": "MyActorType",
          "idleTimeout": "60s",
          "actorIdleTimeout": "60s",
          "reentrancy": "disabled"
        }
      ]
    }
  ]
```

## Best Practices

1. **Use separate namespaces** for Dapr components and applications
2. **Always specify versions** for component types
3. **Use Kubernetes secrets** for sensitive data
4. **Configure resource limits** on Dapr sidecars
5. **Enable metrics** for observability
6. **Set appropriate TTL** for cached state
7. **Use consumer groups** for pub/sub scaling
8. **Configure retries** for service invocation
9. **Test locally with Dapr CLI** before Kubernetes deployment
10. **Monitor Dapr logs** for troubleshooting

## Troubleshooting

```bash
# Check Dapr sidecar logs
kubectl logs -l app=myapp -c daprd -n default

# Check component status
dapr list -k

# View component definitions
kubectl get components -n dapr-system

# Restart Dapr sidecar
kubectl rollout restart deployment/myapp -n default
```

## Production Checklist

- [ ] Dapr runtime installed on cluster
- [ ] Components configured for target cloud provider
- [ ] Secrets managed securely
- [ ] Resource limits configured
- [ ] Metrics and monitoring enabled
- [ ] Service discovery working
- [ ] Circuit breakers configured
- [ ] mTLS enabled for service-to-service
- [ ] Component health checks defined
