# Container & Cluster Security Benchmarking

This directory documents the CIS benchmark process referenced by the blueprint's
"container security benchmarking" requirement.

## 1. Docker Bench for Security (host / runtime)

Run on each worker node:

```bash
docker run --rm --net host --pid host --userns host --cap-add audit_control \
  -e DOCKER_CONTENT_TRUST=$DOCKER_CONTENT_TRUST \
  -v /etc:/etc:ro \
  -v /usr/bin/containerd:/usr/bin/containerd:ro \
  -v /usr/bin/runc:/usr/bin/runc:ro \
  -v /usr/lib/systemd:/usr/lib/systemd:ro \
  -v /var/lib:/var/lib:ro \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  --label docker_bench_security \
  docker/docker-bench-security
```

Required posture for this platform:

| CIS control | Requirement | Where enforced |
|---|---|---|
| 4.1 | Single-user rootless/daemon isolation | node provisioning |
| 4.6 | No privileged containers | compose/K8s `privileged: false` |
| 5.3 | `CAP_DROP ALL` | `deploy/docker-compose.yml`, `deploy/k8s/*` |
| 5.7 | No `--privileged` | CI grep + kube-score |
| 5.10 | Memory limits | compose `deploy.resources`, K8s limits |
| 5.12 | Read-only rootfs | `read_only: true`, `readOnlyRootFilesystem` |
| 5.25 | `no-new-privileges` | `security_opt` |
| 5.28 | Seccomp profile | `docker/seccomp-aifabric.json` |

CI runs Docker Bench in report-only mode and uploads `docker-bench.txt` as an
artefact so regressions are visible.

## 2. kube-bench (cluster)

Run as a Job on each node pool:

```bash
kubectl apply -f https://raw.githubusercontent.com/aquasecurity/kube-bench/main/job.yaml
kubectl logs job/kube-bench
```

Target: no FAIL for the `master` and `node` sections except documented
exceptions (managed control plane items not applicable to EKS/GKE).

## 3. kube-score (manifests)

CI runs:

```bash
kube-score score deploy/k8s/*.yaml --output-format ci --exit-one-on-warning
```

It verifies non-root, read-only rootfs, dropped capabilities, resource limits,
PodDisruptionBudgets, NetworkPolicies and probe configuration.

## 4. Image scanning

- Trivy (CI): fails on HIGH/CRITICAL, ignores unfixed by default.
- Docker Scout (optional): `docker scout cves aifabric-api:ci`.
- SBOM: Syft (`spdx-json`) attached to every build.
