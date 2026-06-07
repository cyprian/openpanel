import base64
import json
import mimetypes
import os
from pathlib import Path
import urllib.request
from typing import Any, Dict, Optional, Union


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

    def log_image(
        self,
        image: Union[str, Path, bytes],
        *,
        kind: str = "prediction",
        step: Optional[int] = None,
        epoch: Optional[int] = None,
        caption: Optional[str] = None,
        filename: Optional[str] = None,
        content_type: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        every: Optional[int] = None,
    ) -> Dict[str, Any]:
        selected_step = max(self._step - 1, 0) if step is None else step
        if every is not None:
            if every <= 0:
                raise OpenPanelError("log_image every must be greater than 0")
            if selected_step % every != 0:
                return {
                    "skipped": True,
                    "reason": "frequency",
                    "step": selected_step,
                }

        resolved_filename = filename
        resolved_content_type = content_type
        if isinstance(image, (str, Path)):
            path = Path(image)
            image_bytes = path.read_bytes()
            resolved_filename = resolved_filename or path.name
            guessed_type, _ = mimetypes.guess_type(path.name)
            resolved_content_type = resolved_content_type or guessed_type
        else:
            image_bytes = image

        if resolved_content_type not in {"image/png", "image/jpeg", "image/webp"}:
            raise OpenPanelError("log_image supports PNG, JPEG, and WebP images")

        payload: Dict[str, Any] = {
            "kind": kind,
            "step": selected_step,
            "image": base64.b64encode(image_bytes).decode("ascii"),
            "contentType": resolved_content_type,
            "metadata": metadata or {},
        }
        if epoch is not None:
            payload["epoch"] = epoch
        if caption is not None:
            payload["caption"] = caption
        if resolved_filename is not None:
            payload["filename"] = resolved_filename

        return _request(
            "POST",
            f"{self.api_url}/ml/runs/{self.id}/images",
            payload,
            self.client_id,
            self.client_secret,
        )

    def log_images(
        self,
        images: Dict[str, Union[str, Path, bytes]],
        *,
        step: Optional[int] = None,
        epoch: Optional[int] = None,
        content_type: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        every: Optional[int] = None,
    ) -> Dict[str, Any]:
        results: Dict[str, Any] = {}
        for kind, image in images.items():
            results[kind] = self.log_image(
                image,
                kind=kind,
                step=step,
                epoch=epoch,
                content_type=content_type,
                metadata=metadata,
                every=every,
            )
        return results

    def log_evaluation(
        self,
        *,
        sample_id: Optional[str] = None,
        input: Optional[Union[str, Path, bytes]] = None,
        ground_truth: Optional[Union[str, Path, bytes]] = None,
        prediction: Optional[Union[str, Path, bytes]] = None,
        error_map: Optional[Union[str, Path, bytes]] = None,
        metrics: Optional[Dict[str, float]] = None,
        step: Optional[int] = None,
        epoch: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
        content_type: Optional[str] = None,
        every: Optional[int] = None,
    ) -> Dict[str, Any]:
        selected_step = max(self._step - 1, 0) if step is None else step
        if every is not None:
            if every <= 0:
                raise OpenPanelError("log_evaluation every must be greater than 0")
            if selected_step % every != 0:
                return {
                    "skipped": True,
                    "reason": "frequency",
                    "step": selected_step,
                }

        images: Dict[str, Dict[str, Any]] = {}
        for kind, image in {
            "input": input,
            "ground_truth": ground_truth,
            "prediction": prediction,
            "error_map": error_map,
        }.items():
            if image is None:
                continue
            images[kind] = _encode_image_payload(
                image,
                content_type=content_type,
            )

        payload: Dict[str, Any] = {
            "step": selected_step,
            "metrics": metrics or {},
            "metadata": metadata or {},
            "images": images,
        }
        if sample_id is not None:
            payload["sampleId"] = sample_id
        if epoch is not None:
            payload["epoch"] = epoch

        return _request(
            "POST",
            f"{self.api_url}/ml/runs/{self.id}/evaluations",
            payload,
            self.client_id,
            self.client_secret,
        )

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


def _encode_image_payload(
    image: Union[str, Path, bytes],
    *,
    content_type: Optional[str] = None,
) -> Dict[str, Any]:
    resolved_filename = None
    resolved_content_type = content_type
    if isinstance(image, (str, Path)):
        path = Path(image)
        image_bytes = path.read_bytes()
        resolved_filename = path.name
        guessed_type, _ = mimetypes.guess_type(path.name)
        resolved_content_type = resolved_content_type or guessed_type
    else:
        image_bytes = image

    if resolved_content_type not in {"image/png", "image/jpeg", "image/webp"}:
        raise OpenPanelError("log_evaluation supports PNG, JPEG, and WebP images")

    payload: Dict[str, Any] = {
        "image": base64.b64encode(image_bytes).decode("ascii"),
        "contentType": resolved_content_type,
        "metadata": {},
    }
    if resolved_filename is not None:
        payload["filename"] = resolved_filename

    return payload
