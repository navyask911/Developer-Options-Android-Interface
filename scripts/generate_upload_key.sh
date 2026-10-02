#!/usr/bin/env bash
# ==============================================================================
# Script: generate_upload_key.sh
# Purpose: Generate a permanent Android Upload Keystore, export the .pem
#          certificate for Google Play Console App Signing key reset, and
#          print the Base64 string for GitHub Actions Secrets.
# ==============================================================================

set -e

KEYSTORE_NAME="upload-keystore.jks"
PEM_NAME="upload_certificate.pem"
ALIAS="devoptions-key"
PASSWORD="DevOptions2026KeyPass"
DNAME="CN=DevOptions Shortcut, OU=Mobile, O=Utility, L=San Francisco, ST=CA, C=US"

echo "======================================================================"
echo "Step 1: Generating Permanent Android Upload Keystore ($KEYSTORE_NAME)..."
echo "======================================================================"

if [ -f "$KEYSTORE_NAME" ]; then
    echo "Warning: $KEYSTORE_NAME already exists in current directory."
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted without overwriting existing keystore."
        exit 1
    fi
    rm -f "$KEYSTORE_NAME" "$PEM_NAME"
fi

keytool -genkeypair -v \
    -keystore "$KEYSTORE_NAME" \
    -alias "$ALIAS" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -storetype PKCS12 \
    -storepass "$PASSWORD" \
    -keypass "$PASSWORD" \
    -dname "$DNAME"

echo ""
echo "======================================================================"
echo "Step 2: Exporting Public Certificate for Google Play ($PEM_NAME)..."
echo "======================================================================"

keytool -export -rfc \
    -keystore "$KEYSTORE_NAME" \
    -alias "$ALIAS" \
    -file "$PEM_NAME" \
    -storepass "$PASSWORD"

echo ""
echo "Keystore created: $KEYSTORE_NAME"
echo "Certificate created: $PEM_NAME"
echo ""

echo "======================================================================"
echo "Step 3: New Certificate Fingerprints (for Google Play Console):"
echo "======================================================================"
keytool -printcert -file "$PEM_NAME" | grep -E "(Owner|SHA1|SHA256)" || true
echo ""

echo "======================================================================"
echo "Step 4: Base64 String for GitHub Secrets (RELEASE_KEYSTORE_BASE64):"
echo "======================================================================"
echo "--- COPY EVERYTHING BETWEEN THE DASHED LINES BELOW ---"

if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    BASE64_VAL=$(base64 -i "$KEYSTORE_NAME")
    echo "$BASE64_VAL"
    echo "$BASE64_VAL" | pbcopy 2>/dev/null && echo "(Copied to your macOS clipboard automatically!)" || true
else
    # Linux / WSL
    BASE64_VAL=$(base64 -w 0 "$KEYSTORE_NAME")
    echo "$BASE64_VAL"
fi

echo "--- END OF BASE64 STRING ---"
echo ""
echo "======================================================================"
echo "NEXT STEPS:"
echo "1. GOOGLE PLAY CONSOLE:"
echo "   - Go to: Release -> Setup -> App integrity -> App signing tab"
echo "   - Under 'Upload key certificate', click 'Request upload key reset'"
echo "   - Choose 'I lost the upload key' as the reason"
echo "   - Upload the '$PEM_NAME' file created in this directory"
echo "   - Click Save / Submit. Google will confirm the new key activation time."
echo ""
echo "2. GITHUB REPOSITORY SECRETS:"
echo "   - Go to your GitHub repository -> Settings -> Secrets and variables -> Actions"
echo "   - Update or Add 'RELEASE_KEYSTORE_BASE64' with the Base64 string above"
echo "   - (Optional) Set RELEASE_KEY_ALIAS=$ALIAS"
echo "   - (Optional) Set RELEASE_KEYSTORE_PASSWORD=$PASSWORD"
echo "   - (Optional) Set RELEASE_KEY_PASSWORD=$PASSWORD"
echo "======================================================================"
