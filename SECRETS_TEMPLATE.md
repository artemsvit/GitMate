# GitHub Actions Secrets Template for Git Mate macOS Release

Paste these secrets into your repository settings at:
👉 **[https://github.com/artemsvit/Gitler/settings/secrets/actions](https://github.com/artemsvit/Gitler/settings/secrets/actions)**

Click **"New repository secret"** for each of the following:

---

### 1. `APPLE_ID`
- **Name:** `APPLE_ID`
- **Secret:** Your Apple Developer email address
- **Example:** `your.apple.developer@gmail.com`

---

### 2. `APPLE_APP_SPECIFIC_PASSWORD`
- **Name:** `APPLE_APP_SPECIFIC_PASSWORD`
- **Secret:** The 16-character password generated at [appleid.apple.com](https://appleid.apple.com)
- **Example:** `abcd-efgh-ijkl-mnop`

---

### 3. `APPLE_TEAM_ID`
- **Name:** `APPLE_TEAM_ID`
- **Secret:** Your 10-character Apple Developer Team ID from [developer.apple.com/account](https://developer.apple.com/account)
- **Example:** `9A8B7C6D5E`

---

### 4. `APPLE_CERTIFICATE`
- **Name:** `APPLE_CERTIFICATE`
- **Secret:** The base64-encoded string of your exported `Developer ID Application.p12` certificate.
- **How to generate this string on your Mac terminal:**
  ```bash
  base64 -i /path/to/your/certificate.p12 | pbcopy
  ```
  *(This automatically copies the entire base64 string to your clipboard. Paste it directly into the GitHub Secret box).*

---

### 5. `APPLE_CERTIFICATE_PASSWORD`
- **Name:** `APPLE_CERTIFICATE_PASSWORD`
- **Secret:** The password you set when exporting the `.p12` certificate from Keychain Access.

---

### Quick Check Table

| Secret Name | Required For | Format |
| :--- | :--- | :--- |
| `APPLE_ID` | Apple Notarization (`notarytool`) | Email (`user@example.com`) |
| `APPLE_APP_SPECIFIC_PASSWORD` | Apple Notarization authentication | `xxxx-xxxx-xxxx-xxxx` |
| `APPLE_TEAM_ID` | App association | 10 alphanumeric chars (e.g. `12345ABCDE`) |
| `APPLE_CERTIFICATE` | Gatekeeper code signing | Single long Base64 string |
| `APPLE_CERTIFICATE_PASSWORD` | Unlocking certificate in CI | Plaintext password |

---

*Once all 5 secrets are saved, tag a release to trigger the build:*
```bash
git tag v1.0.0
git push origin v1.0.0
```
