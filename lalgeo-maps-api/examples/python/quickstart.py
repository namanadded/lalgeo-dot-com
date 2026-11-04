#!/usr/bin/env python3
"""Create a synthetic LalGeo map and print its one-time Maps handoff URL."""

import json
import os
import re
import socket
import sys
import time
import uuid
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener


DEFAULT_BASE_URL = "https://api.lalgeo.com"
REQUEST_TIMEOUT_SECONDS = 10
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
RETRYABLE_STATUSES = {500, 502, 503, 504}
OPEN_URL_PATTERN = re.compile(
    r"^https://maps\.lalgeo\.com/maps#open=[0-9a-f]{64}$"
)


class QuickstartError(Exception):
    """A concise, credential-safe error suitable for command-line output."""


class NoRedirectHandler(HTTPRedirectHandler):
    """Return redirects as ordinary HTTP errors without forwarding credentials."""

    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        return None


NO_REDIRECT_OPENER = build_opener(NoRedirectHandler())


def require_api_key() -> str:
    api_key = os.environ.get("LALGEO_API_KEY", "").strip()
    if not api_key:
        raise QuickstartError(
            "LALGEO_API_KEY is required. Store it in your shell or secret manager, "
            "not in this file."
        )
    return api_key


def redact(value: str, sensitive_value: Optional[str]) -> str:
    return value.replace(sensitive_value, "[redacted]") if sensitive_value else value


def load_base_url() -> str:
    value = os.environ.get("LALGEO_API_BASE_URL", DEFAULT_BASE_URL).strip().rstrip("/")
    parsed = urlparse(value)
    if not parsed.scheme or not parsed.hostname or parsed.path not in ("", "/"):
        raise QuickstartError(
            "LALGEO_API_BASE_URL must be an origin such as https://api.lalgeo.com."
        )
    if parsed.username or parsed.password or parsed.params or parsed.query or parsed.fragment:
        raise QuickstartError(
            "LALGEO_API_BASE_URL must not contain credentials, a query, or a fragment."
        )
    loopback_hosts = {"localhost", "127.0.0.1", "::1"}
    if parsed.scheme != "https" and not (
        parsed.scheme == "http" and parsed.hostname in loopback_hosts
    ):
        raise QuickstartError(
            "LALGEO_API_BASE_URL must use HTTPS; HTTP is accepted only for a local test server."
        )
    return value


def encode_json(value: Any) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, separators=(",", ":"), allow_nan=False
    ).encode("utf-8")


def parse_json_response(raw: bytes, label: str) -> Any:
    if len(raw) > MAX_RESPONSE_BYTES:
        raise QuickstartError(f"{label} returned a response larger than 2 MiB.")
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise QuickstartError(f"{label} returned invalid JSON.") from error


def reconciliation_hint(paths: Iterable[str]) -> str:
    values = list(paths)
    if not values:
        return ""
    return " Reconcile before another create with " + " and ".join(
        f"GET {path}" for path in values
    ) + "."


def http_error_message(
    label: str,
    error: HTTPError,
    body: bytes,
    reconcile_paths: Iterable[str],
    extra_hint: str = "",
    sensitive_value: Optional[str] = None,
) -> str:
    request_id = error.headers.get("X-Request-Id") if error.headers else None
    code: Optional[str] = None
    message: Optional[str] = None
    try:
        document = json.loads(body.decode("utf-8"))
        error_object = document.get("error") if isinstance(document, dict) else None
        if isinstance(error_object, dict):
            if isinstance(error_object.get("code"), str):
                code = error_object["code"]
            if isinstance(error_object.get("message"), str):
                message = error_object["message"]
        if request_id is None and isinstance(document, dict):
            body_request_id = document.get("request_id")
            if isinstance(body_request_id, str):
                request_id = body_request_id
    except (UnicodeDecodeError, json.JSONDecodeError):
        pass

    summary = f"{label} failed: HTTP {error.code}"
    if code:
        summary += f" {code}"
    if message:
        summary += f": {message}"
    if request_id:
        summary += f" (request id {request_id})"
    return redact(
        summary + reconciliation_hint(reconcile_paths) + extra_hint,
        sensitive_value,
    )


def request_json(
    *,
    base_url: str,
    api_key: Optional[str],
    method: str,
    path: str,
    label: str,
    expected_status: int,
    body: Optional[Any] = None,
    content_type: str = "application/json",
    idempotency_key: Optional[str] = None,
    reconcile_paths: Iterable[str] = (),
    ambiguous_hint: str = "",
) -> Any:
    """Send one request, retrying an ambiguous create only with a retained key."""

    payload = encode_json(body) if body is not None else None
    headers = {
        "Accept": "application/json",
        "User-Agent": "lalgeo-python-quickstart/1.0",
    }
    if api_key is not None:
        headers["Authorization"] = f"Bearer {api_key}"
    if payload is not None:
        headers["Content-Type"] = content_type
    if idempotency_key is not None:
        headers["Idempotency-Key"] = idempotency_key

    attempts = 2 if idempotency_key is not None else 1
    for attempt in range(attempts):
        request = Request(
            f"{base_url}{path}", data=payload, headers=headers, method=method
        )
        try:
            with NO_REDIRECT_OPENER.open(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                status = response.status
                raw = response.read(MAX_RESPONSE_BYTES + 1)
                if status != expected_status:
                    raise QuickstartError(
                        f"{label} returned unexpected HTTP {status}."
                        + reconciliation_hint(reconcile_paths)
                    )
                return parse_json_response(raw, label)
        except HTTPError as error:
            body_bytes = error.read(MAX_RESPONSE_BYTES + 1)
            if (
                idempotency_key is not None
                and attempt == 0
                and error.code in RETRYABLE_STATUSES
            ):
                time.sleep(0.2)
                continue
            should_reconcile = error.code == 409 or error.code in RETRYABLE_STATUSES
            raise QuickstartError(
                http_error_message(
                    label,
                    error,
                    body_bytes,
                    reconcile_paths if should_reconcile else (),
                    ambiguous_hint if error.code in RETRYABLE_STATUSES else "",
                    api_key,
                )
            ) from error
        except (URLError, TimeoutError, socket.timeout, ConnectionError) as error:
            if idempotency_key is not None and attempt == 0:
                time.sleep(0.2)
                continue
            raise QuickstartError(
                f"{label} failed without a confirmed response."
                + reconciliation_hint(reconcile_paths)
                + ambiguous_hint
            ) from error

    raise QuickstartError(
        f"{label} failed without a confirmed response."
        + reconciliation_hint(reconcile_paths)
        + ambiguous_hint
    )


def post_operation(
    document: Dict[str, Any], path: str, operation_id: str
) -> Optional[Dict[str, Any]]:
    paths = document.get("paths")
    path_item = paths.get(path) if isinstance(paths, dict) else None
    operation = path_item.get("post") if isinstance(path_item, dict) else None
    if not isinstance(operation, dict) or operation.get("operationId") != operation_id:
        return None
    return operation


def operation_supports_idempotency(
    document: Dict[str, Any], path: str, operation_id: str
) -> bool:
    operation = post_operation(document, path, operation_id)
    if operation is None:
        return False
    parameters = operation.get("parameters")
    if not isinstance(parameters, list):
        return False
    for parameter in parameters:
        if not isinstance(parameter, dict):
            continue
        if parameter.get("$ref") == "#/components/parameters/IdempotencyKey":
            return True
        name = parameter.get("name")
        location = parameter.get("in")
        if isinstance(name, str) and name.lower() == "idempotency-key" and location == "header":
            return True
    return False


def require_object(value: Any, label: str) -> Dict[str, Any]:
    if not isinstance(value, dict):
        raise QuickstartError(f"{label} returned an unexpected JSON shape.")
    return value


def require_resource(
    document: Any, envelope_name: str, resource_id: str, label: str
) -> Dict[str, Any]:
    envelope = require_object(document, label)
    resource = envelope.get(envelope_name)
    if not isinstance(resource, dict) or resource.get("id") != resource_id:
        raise QuickstartError(
            f"{label} did not return the expected {envelope_name} id {resource_id}."
        )
    return resource


def validate_features(document: Any, expected_ids: Iterable[str]) -> None:
    collection = require_object(document, "create features")
    features = collection.get("features")
    if collection.get("type") != "FeatureCollection" or not isinstance(features, list):
        raise QuickstartError("create features returned an unexpected JSON shape.")
    returned_ids = {
        feature.get("id") for feature in features if isinstance(feature, dict)
    }
    if returned_ids != set(expected_ids) or len(features) != len(returned_ids):
        raise QuickstartError("create features did not return the expected feature ids.")


def validate_open_link(document: Any) -> Dict[str, str]:
    result = require_object(document, "create open link")
    open_url = result.get("open_url")
    expires_at = result.get("expires_at")
    if not isinstance(open_url, str) or OPEN_URL_PATTERN.fullmatch(open_url) is None:
        raise QuickstartError("create open link returned an invalid LalGeo Maps URL.")
    if not isinstance(expires_at, str):
        raise QuickstartError("create open link returned an invalid expiry.")
    try:
        parsed_expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        if parsed_expiry.tzinfo is None:
            raise ValueError("expiry is missing a timezone")
    except ValueError as error:
        raise QuickstartError("create open link returned an invalid expiry.") from error
    return {"open_url": open_url, "expires_at": expires_at}


def main() -> None:
    api_key = require_api_key()
    base_url = load_base_url()

    health = require_object(
        request_json(
            base_url=base_url,
            api_key=None,
            method="GET",
            path="/v1/health",
            label="Health discovery",
            expected_status=200,
        ),
        "Health discovery",
    )
    if health != {"ok": True, "service": "lalgeo-maps-api", "version": "v1"}:
        raise QuickstartError(
            "Health discovery did not return the exact LalGeo Maps API identity."
        )

    openapi = require_object(
        request_json(
            base_url=base_url,
            api_key=None,
            method="GET",
            path="/v1/openapi.json",
            label="OpenAPI discovery",
            expected_status=200,
        ),
        "OpenAPI discovery",
    )
    info = openapi.get("info")
    if (
        openapi.get("openapi") != "3.1.0"
        or not isinstance(info, dict)
        or info.get("title") != "LalGeo Maps Authoring API"
    ):
        raise QuickstartError("OpenAPI discovery did not return the LalGeo 3.1 contract.")

    required_operations = (
        ("/v1/maps", "createMap"),
        ("/v1/maps/{mapId}/layers", "createLayer"),
        ("/v1/maps/{mapId}/layers/{layerId}/features", "createFeatures"),
        ("/v1/maps/{mapId}/open-links", "createMapOpenLink"),
    )
    for path, operation_id in required_operations:
        if post_operation(openapi, path, operation_id) is None:
            raise QuickstartError(
                f"OpenAPI discovery is missing {operation_id} at {path}."
            )

    create_idempotency = {
        "map": operation_supports_idempotency(openapi, "/v1/maps", "createMap"),
        "layer": operation_supports_idempotency(
            openapi, "/v1/maps/{mapId}/layers", "createLayer"
        ),
        "features": operation_supports_idempotency(
            openapi,
            "/v1/maps/{mapId}/layers/{layerId}/features",
            "createFeatures",
        ),
    }

    run_id = uuid.uuid4().hex[:12]
    map_id = f"quickstart_{run_id}"
    layer_id = "places"
    feature_ids: List[str] = ["central_library", "city_hall"]
    map_path = f"/v1/maps/{map_id}"
    layer_path = f"{map_path}/layers/{layer_id}"

    map_response = request_json(
        base_url=base_url,
        api_key=api_key,
        method="POST",
        path="/v1/maps",
        label="create map",
        expected_status=201,
        body={
            "id": map_id,
            "name": "LalGeo API quickstart",
            "description": "Synthetic map created by the LalGeo API quickstart.",
            "center": {"latitude": 51.0447, "longitude": -114.0719},
            "zoom": 13,
            "metadata": {"source": "lalgeo-api-quickstart", "synthetic": True},
        },
        idempotency_key=str(uuid.uuid4()) if create_idempotency["map"] else None,
        reconcile_paths=(map_path,),
    )
    require_resource(map_response, "map", map_id, "create map")

    layer_response = request_json(
        base_url=base_url,
        api_key=api_key,
        method="POST",
        path=f"{map_path}/layers",
        label="create layer",
        expected_status=201,
        body={
            "id": layer_id,
            "name": "Places",
            "geometry_type": "Point",
        },
        idempotency_key=str(uuid.uuid4()) if create_idempotency["layer"] else None,
        reconcile_paths=(layer_path,),
    )
    layer = require_resource(layer_response, "layer", layer_id, "create layer")
    if layer.get("map_id") != map_id:
        raise QuickstartError("create layer returned the wrong parent map id.")

    features_response = request_json(
        base_url=base_url,
        api_key=api_key,
        method="POST",
        path=f"{layer_path}/features",
        label="create features",
        expected_status=201,
        content_type="application/geo+json",
        body={
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "id": feature_ids[0],
                    "geometry": {
                        "type": "Point",
                        "coordinates": [-114.0510, 51.0453],
                    },
                    "properties": {"name": "Central Library", "synthetic": True},
                },
                {
                    "type": "Feature",
                    "id": feature_ids[1],
                    "geometry": {
                        "type": "Point",
                        "coordinates": [-114.0708, 51.0465],
                    },
                    "properties": {"name": "City Hall", "synthetic": True},
                },
            ],
        },
        idempotency_key=(
            str(uuid.uuid4()) if create_idempotency["features"] else None
        ),
        reconcile_paths=tuple(
            f"{layer_path}/features/{feature_id}" for feature_id in feature_ids
        ),
    )
    validate_features(features_response, feature_ids)

    open_link_response = request_json(
        base_url=base_url,
        api_key=api_key,
        method="POST",
        path=f"{map_path}/open-links",
        label="create open link",
        expected_status=201,
        body={"expires_in": 600},
        ambiguous_hint=(
            f" The request was not retried automatically; inspect GET {map_path}, "
            "then request a fresh one-time link if needed."
        ),
    )
    result = validate_open_link(open_link_response)
    print(
        json.dumps(
            {
                "map_id": map_id,
                "open_url": result["open_url"],
                "expires_at": result["expires_at"],
            },
            separators=(",", ":"),
        )
    )


if __name__ == "__main__":
    try:
        main()
    except QuickstartError as error:
        print(f"LalGeo quickstart: {error}", file=sys.stderr)
        raise SystemExit(1)
