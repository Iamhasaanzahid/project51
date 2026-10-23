import pytest

from app.core.tenant import tenant_schema, validate_tenant_id


@pytest.mark.parametrize(
    "tenant_id,expected",
    [
        ("acme", "tenant_acme"),
        ("brand-x", "tenant_brand_x"),
        ("TENANT_1", "tenant_tenant_1"),
        ("a_b-c9", "tenant_a_b_c9"),
    ],
)
def test_tenant_schema_mapping(tenant_id, expected):
    assert tenant_schema(tenant_id) == expected


@pytest.mark.parametrize(
    "malicious",
    [
        "../../etc/passwd",
        "acme; DROP TABLE users",
        "acme'--",
        "acme schema",
        "tenant\"; DROP SCHEMA public; --",
        "",
        "a" * 200,
    ],
)
def test_injection_attempts_rejected(malicious):
    with pytest.raises(ValueError):
        validate_tenant_id(malicious)
    with pytest.raises(ValueError):
        tenant_schema(malicious)
