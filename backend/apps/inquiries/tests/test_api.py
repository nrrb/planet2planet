import pytest
from django.core.cache import cache
from django.core.management import call_command

from apps.inquiries.models import Inquiry
from apps.network import services
from apps.pricing import offers
from apps.pricing.quotes import Filters, quote


@pytest.fixture
def seeded(db):
    call_command("load_dataset")
    call_command("load_orbital_elements")
    call_command("build_network")
    call_command("generate_plans")
    services.clear_caches()
    offers.clear_caches()
    cache.clear()


@pytest.fixture
def offer_id(seeded):
    return quote("jupiter", "saturn", Filters(), "price")["offers"][0]["id"]


def payload(offer_id, **overrides):
    return {
        "offerId": offer_id,
        "from": "jupiter",
        "to": "saturn",
        "companyName": "Callisto Ore Partners",
        "contact": "ops@example.com",
        "expectedTraffic": "About 20 gigaquads a second at peak",
        **overrides,
    }


def post(client, data):
    return client.post("/api/inquiries/", data, content_type="application/json")


def test_a_valid_inquiry_is_stored_and_confirmed_as_a_demo(client, offer_id):
    response = post(client, payload(offer_id))
    assert response.status_code == 201
    body = response.json()
    assert body["demo"] is True
    assert "nothing is sent" in body["message"].lower()
    stored = Inquiry.objects.get()
    assert stored.offer_id == offer_id and stored.origin_id == "jupiter"
    assert stored.company_name == "Callisto Ore Partners"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("companyName", ""),
        ("companyName", "x" * 121),
        ("contact", "not-an-email"),
        ("expectedTraffic", "x" * 501),
        ("from", "vulcan"),
        ("to", "jupiter"),
    ],
)
def test_invalid_fields_are_rejected(client, offer_id, field, value):
    response = post(client, payload(offer_id, **{field: value}))
    assert response.status_code == 400
    assert Inquiry.objects.count() == 0


def test_an_unknown_offer_id_is_rejected(client, seeded):
    response = post(client, payload("of_doesnotexist"))
    assert response.status_code == 400
    assert "offerId" in response.json()


def test_inquiries_are_rate_limited(client, offer_id):
    codes = [post(client, payload(offer_id)).status_code for _ in range(8)]
    assert 201 in codes and 429 in codes
