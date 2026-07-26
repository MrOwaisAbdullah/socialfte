#!/bin/bash
# Deployment script with comprehensive error handling
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required tools are installed
check_dependencies() {
    print_status "Checking dependencies..."

    command -v docker >/dev/null 2>&1 || { print_error "Docker is not installed"; exit 1; }
    command -v git >/dev/null 2>&1 || { print_error "Git is not installed"; exit 1; }
    command -v curl >/dev/null 2>&1 || { print_error "Curl is not installed"; exit 1; }

    print_status "All dependencies found ✓"
}

# Validate environment variables
validate_env() {
    print_status "Validating environment variables..."

    if [ -f ".env" ]; then
        source .env
        print_warning "Loaded .env file"
    fi

    # Check critical variables
    local required_vars=("OPENAI_API_KEY")
    local missing_vars=()

    for var in "${required_vars[@]}"; do
        if [ -z "${!var:-}" ]; then
            missing_vars+=("$var")
        fi
    done

    if [ ${#missing_vars[@]} -ne 0 ]; then
        print_error "Missing required environment variables:"
        printf '  %s\n' "${missing_vars[@]}"
        print_error "Please set these variables in your environment or .env file"
        exit 1
    fi

    print_status "Environment validation passed ✓"
}

# Build and test Docker image
build_and_test() {
    print_status "Building Docker image..."

    # Build image
    docker build -t app:test .

    print_status "Running container test..."

    # Run container in background
    docker run -d --name test-app -p 7860:7860 \
        -e OPENAI_API_KEY="${OPENAI_API_KEY:-test}" \
        -e NODE_ENV=test \
        app:test

    # Wait for startup
    print_status "Waiting for application to start..."
    sleep 10

    # Health check
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if curl -f http://localhost:7860/health >/dev/null 2>&1; then
            print_status "Health check passed ✓"
            break
        fi

        if [ $attempt -eq $max_attempts ]; then
            print_error "Health check failed after $max_attempts attempts"
            docker logs test-app
            docker stop test-app
            docker rm test-app
            exit 1
        fi

        print_status "Attempt $attempt/$max_attempts - Retrying in 2 seconds..."
        sleep 2
        ((attempt++))
    done

    # Clean up
    docker stop test-app
    docker rm test-app

    print_status "Container test completed successfully ✓"
}

# Check Git status
check_git_status() {
    print_status "Checking Git status..."

    if [ -n "$(git status --porcelain)" ]; then
        print_warning "You have uncommitted changes:"
        git status --short
        read -p "Do you want to continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_status "Deployment cancelled"
            exit 0
        fi
    fi

    # Check if we're on the right branch
    local current_branch=$(git rev-parse --abbrev-ref HEAD)
    print_status "Current branch: $current_branch"

    # Ask for confirmation
    read -p "Deploy from branch '$current_branch'? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Deployment cancelled"
        exit 0
    fi
}

# Push to trigger deployment
push_and_deploy() {
    print_status "Pushing to remote repository..."

    # Add changes if any
    if [ -n "$(git status --porcelain)" ]; then
        git add -A
        git commit -m "Deploy: $(date '+%Y-%m-%d %H:%M:%S')

        🤖 Generated with deployment script

        Co-Authored-By: Deployment Script <noreply@deployment>"
    fi

    # Push changes
    git push origin "$(git rev-parse --abbrev-ref HEAD)"

    print_status "Push completed ✓"
    print_status "Deployment triggered in CI/CD pipeline"
}

# Monitor deployment (if URLs provided)
monitor_deployment() {
    if [ -n "${DEPLOY_URL:-}" ]; then
        print_status "Monitoring deployment at $DEPLOY_URL..."

        # Wait and check
        sleep 30

        if curl -f "$DEPLOY_URL/health" >/dev/null 2>&1; then
            print_status "Deployment is healthy ✓"
        else
            print_warning "Deployment health check failed - check CI/CD logs"
        fi
    fi
}

# Main deployment flow
main() {
    print_status "Starting deployment process..."

    # Run all checks
    check_dependencies
    validate_env
    check_git_status
    build_and_test

    # Deploy
    push_and_deploy

    # Monitor if URL provided
    monitor_deployment

    print_status "Deployment process completed successfully! 🚀"
}

# Handle script arguments
case "${1:-deploy}" in
    "check")
        check_dependencies
        validate_env
        ;;
    "build")
        build_and_test
        ;;
    "deploy")
        main
        ;;
    *)
        echo "Usage: $0 {check|build|deploy}"
        echo "  check  - Check dependencies and environment"
        echo "  build  - Build and test Docker image"
        echo "  deploy - Full deployment process"
        exit 1
        ;;
esac