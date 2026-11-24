# Wallet pass setup (Digital Business Card)

The card builder works without any of this. These steps turn on the two wallet
buttons. Each wallet is independent: set up one, both, or neither. Until its
variables are set, that wallet shows "not set up yet" in the Share tab.

All variables go in Vercel: Project, Settings, Environment Variables,
Production. Redeploy after adding them.

## Before anything else

1. Run `supabase/migrations/0029_business_cards.sql` in the Supabase SQL editor.
   It only adds new tables and functions.
2. The builder is visible to the admin account only. To open it to every
   member, set `CARD_BUILDER_PUBLIC=true`.
3. Optional: "email me when someone shares their details" needs
   `SUPABASE_SERVICE_ROLE_KEY` and `RESEND_API_KEY` to be set. Without them the
   contact still lands in the Contacts tab; only the email is skipped.

## Apple Wallet

Needs a paid Apple Developer account. MilVector uses a friend's (live since
2026-11-24): the passes are signed under his team, and the certificate is
renewed through his account each year. No Mac is needed, and the private key
never leaves the admin's PC.

**Account holder, at developer.apple.com/account, Certificates, Identifiers &
Profiles:**

1. Identifiers, +, Pass Type IDs. Description `MilVector Business Card`. The
   form already starts the identifier with `pass.`, so type only the rest
   (`org.milvector.card`). The live one came out as
   `pass.pass.org.milvector.card`; that is fine, it only has to match
   `APPLE_PASS_TYPE_ID` exactly, and members never see it.
2. The Team ID is on the Membership page (10 characters; it is also the OU in
   the certificate).

**Admin, in Git Bash on Windows (OpenSSL is included):**

    mkdir -p /d/apple-pass && cd /d/apple-pass
    openssl genrsa -out pass-key.pem 2048
    MSYS_NO_PATHCONV=1 openssl req -new -key pass-key.pem -out pass.csr -subj "/CN=MilVector Pass/O=Russell Innovation Group LLC/C=US"

   `MSYS_NO_PATHCONV=1` stops Git Bash from turning `/CN=...` into a Windows
   path. Send `pass.csr` to the account holder; it is not secret.

**Account holder:**

3. Certificates, +, Pass Type ID Certificate, pick the Pass Type ID, upload
   `pass.csr`, download `pass.cer`, and send it back.

**Admin:**

    cd /d/apple-pass
    openssl x509 -inform DER -in pass.cer -out pass-cert.pem
    curl -O https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer
    openssl x509 -inform DER -in AppleWWDRCAG4.cer -out wwdr.pem
    openssl verify -partial_chain -CAfile wwdr.pem pass-cert.pem

   To confirm the certificate was made from this key, these two lines must
   print the same value:

    openssl x509 -in pass-cert.pem -noout -modulus | openssl md5
    openssl rsa -in pass-key.pem -noout -modulus | openssl md5

4. Set these variables. Each PEM can be pasted as is, or as base64 of the file
   (`base64 -w0 pass-cert.pem`) if pasting multi-line text is awkward.

   | Variable | Value |
   | --- | --- |
   | `APPLE_PASS_TYPE_ID` | The Pass Type ID, exactly as in the certificate |
   | `APPLE_TEAM_ID` | The 10-character Team ID |
   | `APPLE_PASS_CERT` | Contents of `pass-cert.pem` |
   | `APPLE_PASS_KEY` | Contents of `pass-key.pem` |
   | `APPLE_PASS_KEY_PASSPHRASE` | Only if the key has a passphrase (the steps above make one without) |
   | `APPLE_WWDR_CERT` | Contents of `wwdr.pem` |

The Pass Type ID certificate expires after about a year (the live one on
2027-12-24). When it does, the Apple button returns an error; repeat steps 3
and 4 with a new `pass.csr` (from the same key, or a new one) and update
`APPLE_PASS_CERT` (and `APPLE_PASS_KEY` if the key changed). Passes already in
a wallet keep working.

The private key signs passes in MilVector's name. Treat `pass-key.pem` like a
password: do not email it or commit it, and keep it on D:, not C:.

## Google Wallet

Free. Needs a Google account.

1. Create a Google Wallet issuer account at https://pay.google.com/business/console
   and note the **Issuer ID**.
2. In Google Cloud Console, create (or pick) a project, enable the
   **Google Wallet API**, and create a **service account**. Create a JSON key
   for it and download the file.
3. In the Wallet console, open Users and invite the service account's email
   address with the Developer role.
4. Set these variables:

   | Variable | Value |
   | --- | --- |
   | `GOOGLE_WALLET_ISSUER_ID` | The Issuer ID |
   | `GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL` | `client_email` from the JSON key |
   | `GOOGLE_WALLET_PRIVATE_KEY` | `private_key` from the JSON key (pasted as is, or base64) |

5. A new issuer starts in demo mode: only accounts you add as test users in the
   Wallet console can save passes, and passes carry a "test only" label. To go
   live for everyone, request publishing access in the Wallet console. Google
   reviews the request.

6. Going live: finish the Business Profile in the Pay & Wallet Console (left
   menu), then on the Google Wallet API page use Request publishing access in
   the "Get publishing access" box. Google reviews the issuer account and
   emails when it is approved; the "[TEST ONLY]" label then leaves the passes.

## The wallet buttons

Both companies require their own button artwork, unaltered. The Google button
is Google's US English "Add to Google Wallet" SVG, as downloaded from
https://developers.google.com/wallet/generic/resources/brand-guidelines, at
`public/assets/wallet/add-to-google-wallet.svg`, shown at its full 283 x 50
size with 8 px of clear space. Do not recolor, redraw, or shrink it below 48 px
tall. The Apple badge is Apple's US-UK "Add to Apple Wallet" SVG (RGB), from
the badge files on https://developer.apple.com/wallet/add-to-apple-wallet-guidelines/
(the account holder accepts the artwork license and downloads them), at
`public/assets/wallet/add-to-apple-wallet.svg`, shown 50 px tall beside
Google's. Apple asks for clear space of a tenth of the height, no dimmed
version, and nothing drawn over it. Neither badge may be dimmed, so the Share
tab shows them only once the card is live; the phone's own wallet comes first
(Apple on an iPhone, Google on Android). Wherever legal information appears,
credit the marks: Apple Wallet is a trademark of Apple Inc., registered in the
U.S. and other countries; Google Wallet is a trademark of Google LLC.

## How to check it worked

Open the Share tab of a published card on the phone itself and tap the wallet
button. The pass should show the name, title, and a QR code that opens the
card. If a button returns an error instead, the response text says which
credential could not be read.
