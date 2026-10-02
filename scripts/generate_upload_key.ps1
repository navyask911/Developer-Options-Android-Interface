# ==============================================================================
# Script: generate_upload_key.ps1
# Purpose: Generate a permanent Android Upload Keystore, export the .pem
#          certificate for Google Play Console App Signing key reset, and
#          copy/print the Base64 string for GitHub Actions Secrets.
# ==============================================================================

$ErrorActionPreference = "Stop"

$KeystoreName = "upload-keystore.jks"
$PemName = "upload_certificate.pem"
$Alias = "devoptions-key"
$Password = "DevOptions2026KeyPass"
$Dname = "CN=DevOptions Shortcut, OU=Mobile, O=Utility, L=San Francisco, ST=CA, C=US"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "Step 1: Generating Permanent Android Upload Keystore ($KeystoreName)..." -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Cyan

if (Test-Path $KeystoreName) {
    $choice = Read-Host "Warning: $KeystoreName already exists. Overwrite? (y/N)"
    if ($choice -notmatch '^[Yy]$') {
        Write-Host "Aborted without overwriting existing keystore." -ForegroundColor Yellow
        exit 1
    }
    Remove-Item $KeystoreName -Force
    if (Test-Path $PemName) { Remove-Item $PemName -Force }
}

# Run keytool to generate keypair
& keytool -genkeypair -v `
    -keystore $KeystoreName `
    -alias $Alias `
    -keyalg RSA `
    -keysize 2048 `
    -validity 10000 `
    -storetype PKCS12 `
    -storepass $Password `
    -keypass $Password `
    -dname $Dname

Write-Host "`n======================================================================" -ForegroundColor Cyan
Write-Host "Step 2: Exporting Public Certificate for Google Play ($PemName)..." -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Cyan

& keytool -export -rfc `
    -keystore $KeystoreName `
    -alias $Alias `
    -file $PemName `
    -storepass $Password

Write-Host "`nKeystore created: $KeystoreName" -ForegroundColor Green
Write-Host "Certificate created: $PemName" -ForegroundColor Green

Write-Host "`n======================================================================" -ForegroundColor Cyan
Write-Host "Step 3: New Certificate Fingerprints (for Google Play Console):" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Cyan
& keytool -printcert -file $PemName | Select-String -Pattern "Owner|SHA1|SHA256"

Write-Host "`n======================================================================" -ForegroundColor Cyan
Write-Host "Step 4: Base64 String for GitHub Secrets (RELEASE_KEYSTORE_BASE64):" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Cyan

$bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $KeystoreName))
$base64 = [System.Convert]::ToBase64String($bytes)

try {
    Set-Clipboard -Value $base64
    Write-Host "[SUCCESS] Base64 string automatically copied to your clipboard!" -ForegroundColor Yellow
} catch {
    Write-Host "Could not automatically copy to clipboard; copying to output:"
}

Write-Host "`n--- COPY EVERYTHING BETWEEN THE DASHED LINES BELOW ---" -ForegroundColor DarkGray
Write-Host $base64
Write-Host "--- END OF BASE64 STRING ---`n" -ForegroundColor DarkGray

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "NEXT STEPS:" -ForegroundColor Yellow
Write-Host "1. GOOGLE PLAY CONSOLE:"
Write-Host "   - Open Google Play Console -> select your app"
Write-Host "   - Go to: Release -> Setup -> App integrity -> App signing tab"
Write-Host "   - Under 'Upload key certificate', click 'Request upload key reset'"
Write-Host "   - Choose 'I lost the upload key' as the reason"
Write-Host "   - Upload the '$PemName' file created in this folder"
Write-Host "   - Click Save / Submit. Google will confirm the new key activation time."
Write-Host ""
Write-Host "2. GITHUB REPOSITORY SECRETS:"
Write-Host "   - Go to your GitHub repository -> Settings -> Secrets and variables -> Actions"
Write-Host "   - Add or update 'RELEASE_KEYSTORE_BASE64' with the Base64 string above"
Write-Host "   - (Optional) Set RELEASE_KEY_ALIAS = $Alias"
Write-Host "   - (Optional) Set RELEASE_KEYSTORE_PASSWORD = $Password"
Write-Host "   - (Optional) Set RELEASE_KEY_PASSWORD = $Password"
Write-Host "======================================================================" -ForegroundColor Cyan
