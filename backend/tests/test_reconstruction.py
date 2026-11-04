"""Synthetic math/contract checks do not claim a live VGGT reconstruction succeeded."""

import numpy as np
import pytest

from app.geometry.photo_corner import fit_corner


def test_floor_anchors_recover_scale_under_camera_rotation_and_translation():
    room = np.array([[0, 0, 0], [2.4, 0, 0], [0, 0, 2.8]])
    rotation = np.array([[0, 0, 1], [0, 1, 0], [-1, 0, 0]])
    world = room @ rotation.T * 0.37 + [4, 1, -2]
    result = fit_corner(world.tolist(), 2.4, 2000)
    assert result.depth_m == pytest.approx(2.8)
    assert result.angle_degrees == pytest.approx(90)


@pytest.mark.parametrize(
    "anchors",
    [
        [[0, 0, 0], [1, 0, 0], [2, 0, 0]],
        [[0, 0, 0], [0, 0, 0], [0, 0, 1]],
        [[0, 0, 0], [float("nan"), 0, 0], [0, 0, 1]],
    ],
)
def test_bad_depth_geometry_is_not_published_as_a_room(anchors):
    with pytest.raises(ValueError):
        fit_corner(anchors, 2.4, 1000)


def test_gpu_feature_is_off_until_enabled_and_never_returns_fake_success(client, session):
    response = client.post(
        f"/api/sessions/{session['id']}/reconstruction",
        headers=session["headers"],
        json={
            "photo_id": "missing",
            "corner": [0.5, 0.5],
            "wall_a": [0.9, 0.7],
            "wall_b": [0.1, 0.7],
            "reference_width_m": 2.4,
        },
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "photo_disabled"


def test_photo_job_lifecycle_blocks_edits_then_rejects_stale_photos(
    client, session, monkeypatch, tmp_path
):
    import sys
    import threading
    import time
    from types import SimpleNamespace

    from app.core.config import get_settings
    from tests.conftest import confirm_sofa, photo_bytes, upload_photos

    settings = get_settings()
    monkeypatch.setattr(settings, "reconstruction_enabled", True)
    monkeypatch.setattr(settings, "reconstruction_usage_file", str(tmp_path / "gpu-usage.json"))
    confirm_sofa(client, session)
    upload_photos(client, session)
    url = f"/api/sessions/{session['id']}"
    photos = client.get(url, headers=session["headers"]).json()["photos"]
    entered, release = threading.Event(), threading.Event()

    def infer(_photos, _marks):
        entered.set()
        assert release.wait(5)
        return {"anchors": [[0, 0, 0], [2.4, 0, 0], [0, 0, 2.8]], "point_count": 10000}

    monkeypatch.setitem(
        sys.modules, "app.providers.modal_reconstruction", SimpleNamespace(run=infer)
    )
    body = {
        "photo_id": photos[0]["id"],
        "corner": [0.5, 0.5],
        "wall_a": [0.9, 0.7],
        "wall_b": [0.1, 0.7],
        "reference_width_m": 2.4,
    }
    response = client.post(url + "/reconstruction", json=body, headers=session["headers"])
    assert response.status_code == 202
    job_id = response.json()["reconstruction"]["id"]
    try:
        assert entered.wait(3)
        assert (
            client.post(url + "/reconstruction", json=body, headers=session["headers"]).status_code
            == 409
        )
        assert (
            client.delete(
                url + "/photos/" + photos[0]["id"], headers=session["headers"]
            ).status_code
            == 409
        )
    finally:
        release.set()
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        saved = client.get(url, headers=session["headers"]).json()["reconstruction"]
        if saved["status"] != "running":
            break
        time.sleep(0.02)
    assert saved["status"] == "ready"
    assert saved["result"]["depth_m"] == 2.8
    answers = {
        "room_width_m": 2.4,
        "room_depth_m": 2.8,
        "dimensions_measured": False,
        "reconstruction_id": job_id,
    }
    assert client.put(url + "/answers", json=answers, headers=session["headers"]).status_code == 200
    client.post(
        url + "/photos",
        files={"file": ("new.jpg", photo_bytes(44), "image/jpeg")},
        headers=session["headers"],
    )
    assert (
        client.get(url, headers=session["headers"]).json()["reconstruction"]["status"] == "failed"
    )
    assert client.put(url + "/answers", json=answers, headers=session["headers"]).status_code == 409


def test_gpu_usage_count_survives_reloading_ledger(monkeypatch, tmp_path):
    from app.core.config import get_settings
    from app.core.errors import AppError
    from app.services.reconstruction import reserve_job

    monkeypatch.setattr(get_settings(), "reconstruction_usage_file", str(tmp_path / "usage.json"))
    monkeypatch.setattr(get_settings(), "reconstruction_daily_limit", 1)
    reserve_job()
    with pytest.raises(AppError, match="limit"):
        reserve_job()
