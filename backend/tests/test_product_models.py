"""User-visible product dimensions, evidence, reference ownership and variant persistence."""

import io

import numpy as np
import pytest
import trimesh

from app.api.routes import product as routes
from app.domain.product import MeasuredField, ProductDraft, SofaSpec
from app.geometry.parametric_sofa import build_parametric_sofa
from tests.conftest import photo_bytes


@pytest.mark.parametrize("template", ["legs", "plinth"])
@pytest.mark.parametrize("size", [(2.5, 0.84, 0.92), (1.4, 0.7, 0.75), (0.31, 0.21, 0.31)])
@pytest.mark.parametrize("cushions", [1, 4])
def test_template_export_retains_confirmed_bounds_and_floor_pivot(template, size, cushions):
    data = build_parametric_sofa(*size, SofaSpec(template=template, cushions=cushions, arms="wide"))
    scene = trimesh.load(io.BytesIO(data), file_type="glb", force="scene")
    np.testing.assert_allclose(scene.extents, size, atol=0.001)
    np.testing.assert_allclose(scene.bounds[0], [-size[0] / 2, 0, -size[2] / 2], atol=0.001)


def test_confirmation_keeps_extraction_evidence_even_when_user_corrects_it(
    client, session, monkeypatch
):
    draft = ProductDraft(
        name="Read sofa",
        width=MeasuredField(value_m=2.5, source="listing_data"),
        depth=MeasuredField(value_m=0.92, source="listing_ai"),
    )
    monkeypatch.setattr(routes, "read_listing", lambda _url: draft)
    url = f"/api/sessions/{session['id']}/product"
    assert (
        client.post(
            f"{url}/fetch", json={"url": "https://shop.example/sofa"}, headers=session["headers"]
        ).status_code
        == 200
    )
    response = client.put(
        url,
        headers=session["headers"],
        json={
            "name": "Read sofa",
            "width_m": 2.1,
            "depth_m": 0.92,
            "height_m": 0.84,
        },
    )
    product = response.json()["product"]
    assert product["width"]["source"] == "user"
    assert product["width"]["extracted_source"] == "listing_data"
    assert product["width"]["extracted_value_m"] == 2.5
    assert product["depth"]["source"] == "listing_ai"
    assert product["depth"]["confirmed_by_user"] is True


def test_reference_image_survives_missing_ai_and_requires_ownership(client, session):
    url = f"/api/sessions/{session['id']}"
    draft = client.post(
        f"{url}/product/screenshot",
        headers=session["headers"],
        files={"file": ("reference.jpg", photo_bytes(), "image/jpeg")},
    ).json()
    asset = f"{url}/assets/{draft['reference_asset']}"
    assert client.get(asset).status_code == 404
    assert client.get(asset, headers=session["headers"]).headers["content-type"] == "image/jpeg"
    other = client.post("/api/sessions").json()
    assert (
        client.get(asset, headers={"Authorization": f"Bearer {other['token']}"}).status_code == 404
    )
    restored = client.get(url, headers=session["headers"]).json()
    assert restored["product"]["reference_asset"] == draft["reference_asset"]


def test_variant_changes_only_furniture_and_keeps_old_asset_and_saved_layout(client):
    created = client.post("/api/sessions/sample").json()
    headers = {"Authorization": f"Bearer {created['token']}"}
    url = f"/api/sessions/{created['session']['id']}"
    before = created["session"]["scene"]
    old_asset = client.get(f"{url}/assets/{before['assets']['furniture']}", headers=headers).content
    placement = {"position": [1.2, 1.0], "yaw": 0.5}
    client.put(f"{url}/layout", json=placement, headers=headers)
    response = client.put(
        f"{url}/product",
        headers=headers,
        json={
            "name": "210 cm variant",
            "width_m": 2.1,
            "depth_m": 0.92,
            "height_m": 0.84,
            "geometry": {"template": "plinth", "color": "#225544"},
        },
    )
    assert response.status_code == 200
    restored = client.get(url, headers=headers).json()
    assert restored["placement"] == placement
    for field in ("floor", "walls", "obstacles", "provenance", "calibration"):
        assert restored["scene"][field] == before[field]
    assert restored["scene"]["assets"]["room"] == before["assets"]["room"]
    assert restored["scene"]["assets"]["furniture"] != before["assets"]["furniture"]
    assert restored["product"]["previous_versions"][0]["width_m"] == 2.5
    assert (
        client.get(f"{url}/assets/{before['assets']['furniture']}", headers=headers).content
        == old_asset
    )
    new_asset = client.get(
        f"{url}/assets/{restored['scene']['assets']['furniture']}", headers=headers
    ).content
    mesh = trimesh.load(io.BytesIO(new_asset), file_type="glb", force="scene")
    np.testing.assert_allclose(mesh.extents, [2.1, 0.84, 0.92], atol=0.001)


def test_untrusted_appearance_and_foreign_reference_are_rejected(client, session):
    url = f"/api/sessions/{session['id']}/product"
    body = {"name": "Sofa", "width_m": 2.1, "depth_m": 0.9, "height_m": 0.8}
    assert (
        client.put(
            url,
            headers=session["headers"],
            json={**body, "geometry": {"color": "javascript:alert(1)"}},
        ).status_code
        == 422
    )
    assert (
        client.put(
            url,
            headers=session["headers"],
            json={**body, "reference_asset": "reference-" + "a" * 32 + ".jpg"},
        ).status_code
        == 422
    )
