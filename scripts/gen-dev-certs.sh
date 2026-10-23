#!/usr/bin/env bash
# Generate a local development CA + server certificate for Postgres/Redis/Nginx.
# NEVER commit the generated files (deploy/certs is git-ignored).
set -euo pipefail

OUT_DIR="${1:-deploy/certs}"
mkdir -p "$OUT_DIR"

if [[ -f "$OUT_DIR/tls.crt" ]]; then
  echo "Certificates already exist in $OUT_DIR"
  exit 0
fi

openssl genrsa -out "$OUT_DIR/ca.key" 4096
openssl req -x509 -new -nodes -key "$OUT_DIR/ca.key" -sha256 -days 3650 \
  -subj "/CN=aifabric-dev-ca" -out "$OUT_DIR/ca.crt"

openssl genrsa -out "$OUT_DIR/tls.key" 2048
cat > "$OUT_DIR/openssl.cnf" <<EOF
[req]
distinguished_name = dn
req_extensions = ext
prompt = no
[dn]
CN = postgres
[ext]
subjectAltName = DNS:postgres,DNS:redis,DNS:api,DNS:nginx,DNS:localhost,IP:127.0.0.1
keyUsage = digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
EOF

openssl req -new -key "$OUT_DIR/tls.key" -out "$OUT_DIR/tls.csr" -config "$OUT_DIR/openssl.cnf"
openssl x509 -req -in "$OUT_DIR/tls.csr" -CA "$OUT_DIR/ca.crt" -CAkey "$OUT_DIR/ca.key" \
  -CAcreateserial -out "$OUT_DIR/tls.crt" -days 825 -sha256 \
  -extfile "$OUT_DIR/openssl.cnf" -extensions ext

openssl dhparam -out "$OUT_DIR/dhparam.pem" 2048
chmod 600 "$OUT_DIR"/*.key
rm -f "$OUT_DIR/tls.csr" "$OUT_DIR/openssl.cnf" "$OUT_DIR/ca.srl"

echo "Generated certificates in $OUT_DIR"
