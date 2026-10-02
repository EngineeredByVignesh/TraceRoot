import os
import subprocess
from typing import Any

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel


PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://localhost:9090")
ALERTMANAGER_URL = os.getenv("ALERTMANAGER_URL", "http://localhost:9093")
LOKI_URL = os.getenv("LOKI_URL", "http://localhost:3100")
KUBECONFIG_CONTEXT = os.getenv("KUBECONFIG_CONTEXT", "kind-incident-lab")
TOOL_API_TOKEN = os.getenv("TOOL_API_TOKEN", "dev-token")
K8S_NAMESPACE = os.getenv("K8S_NAMESPACE", "incident-lab")

app = FastAPI(title="Incident Investigator Tool API")


class MetricQuery(BaseModel):
    query: str
    time: str | None = None


class LogQuery(BaseModel):
    query: str = '{namespace="incident-lab", app_kubernetes_io_name="demo-service"}'
    limit: int = 100
    since_seconds: int = 1800


def require_auth(authorization: str | None = Header(default=None)) -> None:
    expected = f"Bearer {TOOL_API_TOKEN}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


async def get_json(url: str, params: dict[str, Any] | None = None) -> Any:
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        return response.json()


def run_kubectl(args: list[str]) -> str:
    command = ["kubectl", "--context", KUBECONFIG_CONTEXT, *args]
    completed = subprocess.run(command, capture_output=True, text=True, check=True)
    return completed.stdout


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/alerts", dependencies=[Depends(require_auth)])
async def get_alerts() -> Any:
    return await get_json(f"{ALERTMANAGER_URL}/api/v2/alerts")


@app.post("/metrics/query", dependencies=[Depends(require_auth)])
async def query_metrics(body: MetricQuery) -> dict[str, Any]:
    params: dict[str, Any] = {"query": body.query}
    if body.time:
        params["time"] = body.time
    return await get_json(f"{PROMETHEUS_URL}/api/v1/query", params)


@app.post("/logs/query", dependencies=[Depends(require_auth)])
async def query_logs(body: LogQuery) -> dict[str, Any]:
    params = {
        "query": body.query,
        "limit": str(body.limit),
        "since": f"{body.since_seconds}s",
        "direction": "backward",
    }
    return await get_json(f"{LOKI_URL}/loki/api/v1/query_range", params)


@app.get("/deployments", dependencies=[Depends(require_auth)])
async def get_deployments() -> dict[str, Any]:
    deployment_json = run_kubectl(
        [
            "get",
            "deployment",
            "demo-service",
            "-n",
            K8S_NAMESPACE,
            "-o",
            "json",
        ]
    )
    rollout = run_kubectl(
        [
            "rollout",
            "status",
            "deployment/demo-service",
            "-n",
            K8S_NAMESPACE,
            "--timeout=5s",
        ]
    )

    import json

    deployment = json.loads(deployment_json)
    annotations = deployment.get("metadata", {}).get("annotations", {})
    image = (
        deployment.get("spec", {})
        .get("template", {})
        .get("spec", {})
        .get("containers", [{}])[0]
        .get("image")
    )
    env = (
        deployment.get("spec", {})
        .get("template", {})
        .get("spec", {})
        .get("containers", [{}])[0]
        .get("env", [])
    )

    return {
        "name": "demo-service",
        "namespace": K8S_NAMESPACE,
        "image": image,
        "annotations": annotations,
        "env": env,
        "rollout_status": rollout.strip(),
    }
