# Deployment Checklist

## Pre-Deployment Checklist
- [ ] **Code Review**
  - [ ] All features tested locally
  - [ ] No console errors in browser
  - [ ] Linter passes without errors
  - [ ] Type checking complete (if TypeScript)

- [ ] **Environment Setup**
  - [ ] `.env.example` created and documented
  - [ ] All required environment variables listed
  - [ ] Default values provided where possible
  - [ ] Secrets added to repository secrets

- [ ] **Docker Configuration**
  - [ ] Dockerfile builds without errors
  - [ ] Application runs in container
  - [ ] Health endpoint implemented
  - [ ] Non-root user configured
  - [ ] Appropriate base image used

- [ ] **CI/CD Pipeline**
  - [ ] Workflow syntax validated
  - [ ] Branch names verified (main vs master)
  - [ ] Trigger paths correct
  - [ ] Environment variables referenced correctly
  - [ ] Artifacts/outputs configured if needed

- [ ] **Testing**
  - [ ] Unit tests passing
  - [ ] Integration tests passing
  - [ ] E2E tests passing (if applicable)
  - [ ] Performance tests acceptable

## Platform-Specific Checklists

### HuggingFace Spaces
- [ ] README.md has YAML frontmatter
- [ ] Dockerfile compatible with HF Spaces
- [ ] App port matches `app_port` in README
- [ ] HF_TOKEN secret configured
- [ ] Space name correct in workflow

### GitHub Pages
- [ ] Build command configured
- [ ] Output directory set (`build` or `dist`)
- [ ] Base URL configured for repo name
- [ ] Custom domain (if applicable)
- [ ] Source branch correct (usually `gh-pages`)

### Vercel/Netlify
- [ ] Build command correct
- [ ] Output directory correct
- [ ] Environment variables set
- [ ] Custom domain configured (if applicable)
- [ ] Redirects configured (if needed)

## Post-Deployment Checklist
- [ ] **Verification**
  - [ ] Application loads without errors
  - [ ] All pages accessible
  - [ ] Forms/inputs working
  - [ ] API endpoints responding
  - [ ] Database connections working

- [ ] **Monitoring**
  - [ ] Error tracking enabled
  - [ ] Performance monitoring setup
  - [ ] Uptime monitoring configured
  - [ ] Log aggregation working

- [ ] **Security**
  - [ ] HTTPS enforced
  - [ ] Security headers set
  - [ ] CORS properly configured
  - [ ] Rate limiting active
  - [ ] No secrets exposed in frontend

- [ ] **Documentation**
  - [ ] Deployment guide updated
  - [ ] API documentation current
  - [ ] README updated with new features
  - [ ] Change log updated

## Rollback Checklist
- [ ] **Preparation**
  - [ ] Previous version tagged
  - [ ] Database backups current
  - [ ] Migration scripts tested
  - [ ] Rollback procedure documented

- [ ] **Execution**
  - [ ] Traffic rerouted
  - [ ] Old version deployed
  - [ ] Data restored if needed
  - [ ] Services restarted

## Common Issues Quick Reference

### Docker Issues
- **Permission denied**: Install before user switch
- **Port conflicts**: Check port mapping
- **Build context**: Optimize .dockerignore

### CI/CD Issues
- **Secrets not found**: Check repository settings
- **Branch mismatch**: Verify actual branch names
- **Timeout errors**: Increase timeout or optimize build

### Runtime Issues
- **CORS errors**: Check origin configuration
- **404 errors**: Verify routing and base URLs
- **Database errors**: Check connection strings

### Performance Issues
- **Slow builds**: Optimize Docker layer caching
- **High memory**: Check resource limits
- **Slow API**: Add caching, optimize queries

### VPS Disk Issues (Docker image accumulation)
Each deploy push to GHCR leaves old image layers on the VPS — 20–50 GB can accumulate
within weeks on an active CI/CD pipeline.

**One-time cleanup:**
```bash
docker system prune -f   # safe on live servers; never add --volumes
```

**Permanent fix — weekly server-side cron (run on the VPS, NOT from GitHub Actions):**
```bash
(crontab -l 2>/dev/null; echo "0 2 * * 0 docker system prune -f >> /var/log/docker-prune.log 2>&1") | crontab -
```

Do NOT trigger pruning via SSH from GitHub Actions workflows — it requires a private key
in GitHub secrets with no benefit over a simple cron. Server-side cron is simpler and safer.

**Verified on Octively CX33 (Hetzner):** freed 20.26 GB in a single prune, dropping disk
from 34.2 GB → 14.39 GB and Docker total from 50.35 GB → 11.06 GB.