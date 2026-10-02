import os
import subprocess
from typing import Any

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value or not value.strip():
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


PROMETHEUS_URL = require_env("PROMETHEUS_URL")
ALERTMANAGER_URL = require_env("ALERTMANAGER_URL")
LOKI_URL = require_env("LOKI_URL")
KUBECONFIG_CONTEXT = require_env("KUBECONFIG_CONTEXT")
TOOL_API_TOKEN = require_env("TOOL_API_TOKEN")
K8S_NAMESPACE = require_env("K8S_NAMESPACE")
K8S_DEPLOYMENT = require_env("K8S_DEPLOYMENT")

app = FastAPI(title="Incident Investigator Tool API")


class MetricQuery(BaseModel):
    query: str
    time: str | None = None


class LogQuery(BaseModel):
    query: str
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
            K8S_DEPLOYMENT,
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
            f"deployment/{K8S_DEPLOYMENT}",
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
        "name": K8S_DEPLOYMENT,
        "namespace": K8S_NAMESPACE,
        "image": image,
        "annotations": annotations,
        "env": env,
        "rollout_status": rollout.strip(),
    }
