import json
import os
import urllib.request
from typing import Any, Dict, Optional


class OpenPanelError(RuntimeError):
    pass


class Run:
    def __init__(
        self,
        *,
        api_url: str,
        client_id: str,
        client_secret: str,
        run_id: str,
    ) -> None:
        self.api_url = api_url.rstrip("/")
        self.client_id = client_id
        self.client_secret = client_secret
        self.id = run_id
        self._step = 0

    def log(
        self,
        metrics: Dict[str, float],
        *,
        step: Optional[int] = None,
        epoch: Optional[int] = None,
    ) -> Dict[str, Any]:
        selected_step = self._step if step is None else step
        payload: Dict[str, Any] = {
            "metrics": metrics,
            "step": selected_step,
        }
        if epoch is not None:
            payload["epoch"] = epoch
        result = _request(
            "POST",
            f"{self.api_url}/ml/runs/{self.id}/log",
            payload,
            self.client_id,
            self.client_secret,
        )
        self._step = selected_step + 1
        return result

    def finish(self, status: str = "finished") -> Dict[str, Any]:
        return _request(
            "PATCH",
            f"{self.api_url}/ml/runs/{self.id}",
            {"status": status},
            self.client_id,
            self.client_secret,
        )


def init(
    *,
    project: str,
    name: Optional[str] = None,
    config: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None,
    tags: Optional[list[str]] = None,
    api_url: Optional[str] = None,
    client_id: Optional[str] = None,
    client_secret: Optional[str] = None,
) -> Run:
    resolved_api_url = api_url or os.environ.get("OPENPANEL_API_URL")
    resolved_client_id = client_id or os.environ.get("OPENPANEL_CLIENT_ID")
    resolved_client_secret = client_secret or os.environ.get("OPENPANEL_CLIENT_SECRET")

    if not resolved_api_url:
        raise OpenPanelError("Missing api_url or OPENPANEL_API_URL")
    if not resolved_client_id:
        raise OpenPanelError("Missing client_id or OPENPANEL_CLIENT_ID")
    if not resolved_client_secret:
        raise OpenPanelError("Missing client_secret or OPENPANEL_CLIENT_SECRET")

    response = _request(
        "POST",
        f"{resolved_api_url.rstrip('/')}/ml/runs",
        {
            "project": project,
            "name": name,
            "config": config or {},
            "metadata": metadata or {},
            "tags": tags or [],
        },
        resolved_client_id,
        resolved_client_secret,
    )
    return Run(
        api_url=resolved_api_url,
        client_id=resolved_client_id,
        client_secret=resolved_client_secret,
        run_id=response["id"],
    )


def _request(
    method: str,
    url: str,
    payload: Dict[str, Any],
    client_id: str,
    client_secret: str,
) -> Dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={
          "Content-Type": "application/json",
          "openpanel-client-id": client_id,
          "openpanel-client-secret": client_secret,
          "openpanel-sdk-name": "openpanel-python-ml",
          "openpanel-sdk-version": "0.1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        message = error.read().decode("utf-8")
        raise OpenPanelError(f"OpenPanel request failed: {error.code} {message}") from error
